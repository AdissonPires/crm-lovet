import { request as httpRequest } from "node:http";
import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { lerMidia, urlLeituraTemporaria } from "@/lib/storage";
import { analyzeMeeting, type MeetingAnalysis } from "@/lib/ai";

/**
 * Pipeline da ata: áudio → Whisper → Ollama → tarefas.
 *
 * Cada etapa grava o resultado antes de chamar a seguinte. Isso não é zelo
 * excessivo: transcrever uma reunião de 40 minutos em CPU leva minutos, e se
 * a análise falhar depois disso, refazer a transcrição seria jogar esse tempo
 * fora. Com a transcrição salva, a análise é retomável em segundos.
 */

const WHISPER_URL = process.env.WHISPER_URL ?? "http://whisper:9000";

/**
 * Transcrição na nuvem (produção, Vercel): Groq rodando o MESMO modelo que o
 * Whisper local usa (large-v3-turbo), ~US$ 0,04 por hora de áudio. Sem a
 * chave, cai no Whisper self-hosted do stack Docker (WHISPER_URL).
 */
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODELO = process.env.GROQ_WHISPER_MODEL ?? "whisper-large-v3-turbo";
/** Upload direto aceito pelo Groq no plano gratuito é 25 MB; acima disso ele baixa por URL. */
const GROQ_LIMITE_UPLOAD = 24 * 1024 * 1024;

/**
 * Vocabulário que o Whisper recebe como `initial_prompt`.
 *
 * O modelo condiciona a decodificação nesse texto, então termo do domínio
 * deixa de ser adivinhado pelo som. Sem isto a transcrição trazia
 * "Pedido Delis" (por "pedido deles é A1"), "odonta nas area"
 * (Odonto Nazaré) e "inipejotas" (CNPJs) — erros que nenhum prompt de IA
 * depois consegue desfazer, porque a informação já se perdeu no áudio.
 *
 * É escrito como frase corrida, e não como lista de palavras, porque o
 * `initial_prompt` funciona como "texto anterior" da transcrição: o modelo
 * imita o estilo e a pontuação do que recebe. Frase bem pontuada aqui puxa
 * transcrição bem pontuada — que é exatamente o que faltava.
 */
const VOCABULARIO_LOVET =
  "Reunião da Lovet Distribuidora sobre vendas e distribuição. " +
  "Falamos de pedido, orçamento, proposta, cotação, tabela de preços, estoque, " +
  "frete, prazo de entrega, nota fiscal, boleto, Pix, desconto, lote, " +
  "representante, cliente, carteira, comissão, meta, CRM, WhatsApp e dashboard.";

/**
 * Monta o `initial_prompt` juntando o vocabulário fixo aos nomes reais do
 * workspace. Nome próprio é o que o Whisper mais erra, e é o que mais importa
 * aqui: a ata precisa dizer quem ficou com cada tarefa, e para isso o nome
 * tem de sair escrito certo da transcrição.
 */
async function montarVocabulario(workspaceId: string): Promise<string> {
  const [equipe, clientes] = await Promise.all([
    db.select({ name: s.users.name })
      .from(s.users)
      .innerJoin(s.workspaceMembers, eq(s.workspaceMembers.userId, s.users.id))
      .where(eq(s.workspaceMembers.workspaceId, workspaceId)),
    // A carteira de clientes entra no vocabulário porque nome de empresa é o
    // que o Whisper mais erra numa reunião comercial — e é o que a ata mais
    // precisa acertar. Medido numa reunião de 39 minutos: "Construtora Marajó"
    // saiu "Construtor Amarajó" e "Farmácia São Brás" virou "Farmácia Brás",
    // porque só os termos técnicos e os nomes do time estavam no prompt.
    db.select({ name: s.companies.name })
      .from(s.companies)
      .where(and(eq(s.companies.workspaceId, workspaceId), isNull(s.companies.deletedAt)))
      .orderBy(desc(s.companies.updatedAt))
      .limit(LIMITE_CLIENTES_VOCABULARIO),
  ]);

  const base = VOCABULARIO_LOVET.split(" Participam ")[0];
  const nomes = equipe.map((m) => m.name).filter(Boolean);
  const empresas = clientes.map((c) => c.name).filter(Boolean);

  let vocab = base;
  if (empresas.length > 0) vocab += ` Clientes citados: ${empresas.join(", ")}.`;
  if (nomes.length > 0) vocab += ` Participam ${nomes.join(", ")}.`;
  return vocab;
}

/**
 * Quantos clientes cabem no vocabulário do Whisper.
 *
 * O `initial_prompt` é truncado pelo modelo em 224 tokens — o que passar disso
 * é descartado silenciosamente, e o descartado é sempre o FIM do texto. Por
 * isso os termos técnicos vêm primeiro e a lista de clientes é limitada: uma
 * carteira de 300 empresas empurraria para fora justamente o vocabulário do
 * ramo, que serve para toda reunião.
 *
 * Ordenados por atualização recente: cliente mexido esta semana é o que tem
 * chance de ser citado na reunião desta semana.
 */
const LIMITE_CLIENTES_VOCABULARIO = 25;

/** Transcreve a gravação e grava o texto. Idempotente: se já há texto, sai. */
export async function transcreverReuniao(meetingId: string, workspaceId: string): Promise<string> {
  const [nota] = await db.select().from(s.meetingNotes).where(and(
    eq(s.meetingNotes.id, meetingId),
    eq(s.meetingNotes.workspaceId, workspaceId),
  ));
  if (!nota) throw new Error("Reunião não encontrada.");
  if (nota.transcript && nota.transcript.trim()) return nota.transcript;
  if (!nota.audioPath) throw new Error("Gravação sem arquivo de áudio.");

  await db.update(s.meetingNotes).set({ status: "transcrevendo", errorMessage: null })
    .where(eq(s.meetingNotes.id, meetingId));

  try {
    // vad_filter corta trechos sem fala antes de decodificar: além de acelerar,
    // evita o modelo "alucinar" texto em cima de silêncio e ruído de sala, que
    // é de onde vinha boa parte da frase sem sentido no meio da ata.
    const vocab = await montarVocabulario(workspaceId);
    const data = GROQ_API_KEY
      ? await transcreverNoGroq(nota.audioPath, nota.audioMime ?? "audio/webm", vocab)
      : await postarNoWhisper(
        `${WHISPER_URL}/asr?${new URLSearchParams({
          task: "transcribe", language: "pt", output: "json", vad_filter: "true", initial_prompt: vocab,
        }).toString()}`,
        await lerMidia(nota.audioPath),
        nota.audioMime ?? "audio/webm",
      );
    const texto = String(data.text ?? "").trim();
    // Áudio mudo ou só ruído devolve texto vazio: falha aqui, com motivo claro,
    // em vez de mandar string vazia para a IA e receber uma ata inventada.
    if (texto.length < 20) {
      throw new Error("A transcrição saiu vazia. O microfone captou áudio?");
    }

    await db.update(s.meetingNotes)
      .set({ transcript: texto, status: "analisando" })
      .where(eq(s.meetingNotes.id, meetingId));
    return texto;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro desconhecido ao transcrever";
    await db.update(s.meetingNotes).set({ status: "erro", errorMessage: msg })
      .where(eq(s.meetingNotes.id, meetingId));
    throw e;
  }
}

/**
 * Analisa a transcrição, grava a ata e cria as tarefas dos encaminhamentos.
 *
 * Roda como uma unidade: se a IA responder mas a criação de tarefa falhar, a
 * nota fica em "erro" e a reanálise refaz tudo — o que é seguro porque os
 * encaminhamentos antigos são apagados antes de inserir os novos, evitando
 * tarefa duplicada a cada tentativa.
 */
export async function analisarReuniao(
  meetingId: string,
  workspaceId: string,
  actorId: string | null,
): Promise<MeetingAnalysis> {
  const [nota] = await db.select().from(s.meetingNotes).where(and(
    eq(s.meetingNotes.id, meetingId),
    eq(s.meetingNotes.workspaceId, workspaceId),
  ));
  if (!nota) throw new Error("Reunião não encontrada.");
  if (!nota.transcript?.trim()) throw new Error("Transcreva a gravação antes de analisar.");

  await db.update(s.meetingNotes).set({ status: "analisando", errorMessage: null })
    .where(eq(s.meetingNotes.id, meetingId));

  try {
    const equipe = await db.select({ id: s.users.id, name: s.users.name })
      .from(s.users)
      .innerJoin(s.workspaceMembers, eq(s.workspaceMembers.userId, s.users.id))
      .where(eq(s.workspaceMembers.workspaceId, workspaceId));

    // A carteira de clientes serve duas vezes: no vocabulário do Whisper, para
    // o nome sair escrito certo, e aqui, para separar assunto de verdade de
    // ruído extraído do meio da conversa.
    const clientes = await db.select({ name: s.companies.name })
      .from(s.companies)
      .where(and(eq(s.companies.workspaceId, workspaceId), isNull(s.companies.deletedAt)));

    const analise = await analyzeMeeting({
      transcript: nota.transcript,
      equipe: equipe.map((m) => m.name),
      contexto: nota.title || null,
      clientes: clientes.map((c) => c.name).filter(Boolean),
    });

    // Reanálise não deve empilhar: limpa os encaminhamentos e as tarefas que a
    // rodada anterior criou, senão cada nova tentativa duplicaria a lista.
    const anteriores = await db.select({ taskId: s.meetingActionItems.taskId })
      .from(s.meetingActionItems)
      .where(eq(s.meetingActionItems.meetingNoteId, meetingId));
    await db.delete(s.meetingActionItems).where(eq(s.meetingActionItems.meetingNoteId, meetingId));
    for (const a of anteriores) {
      if (a.taskId) await db.delete(s.tasks).where(eq(s.tasks.id, a.taskId));
    }

    for (const enc of analise.encaminhamentos ?? []) {
      const descricao = String(enc.descricao ?? "").trim();
      if (!descricao) continue;

      const nomeDito = String(enc.responsavel ?? "").trim();
      const dono = nomeDito ? casarPessoa(nomeDito, equipe) : null;

      // Só vira tarefa no CRM quando o responsável é alguém do workspace.
      // Encaminhamento de participante externo fica registrado na ata, mas não
      // cria tarefa órfã na fila de ninguém.
      let taskId: string | null = null;
      if (dono) {
        const [t] = await db.insert(s.tasks).values({
          workspaceId,
          relatedToType: nota.relatedToType === "opportunity" ? "opportunity" : undefined,
          relatedToId: nota.relatedToType === "opportunity" ? nota.relatedToId : undefined,
          assigneeId: dono.id,
          createdBy: actorId,
          createdByAgent: true,
          type: "todo",
          title: descricao,
        }).returning({ id: s.tasks.id });
        taskId = t.id;
      }

      await db.insert(s.meetingActionItems).values({
        workspaceId,
        meetingNoteId: meetingId,
        description: descricao,
        ownerName: nomeDito || null,
        ownerId: dono?.id ?? null,
        dueHint: limparPrazo(enc.prazo),
        taskId,
      });
    }

    await db.update(s.meetingNotes).set({
      analysis: analise,
      title: nota.title?.trim() || String(analise.titulo ?? "Reunião"),
      status: "pronto",
    }).where(eq(s.meetingNotes.id, meetingId));

    return analise;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro desconhecido ao analisar";
    await db.update(s.meetingNotes).set({ status: "erro", errorMessage: msg })
      .where(eq(s.meetingNotes.id, meetingId));
    throw e;
  }
}

/**
 * Descarta prazo que não é prazo.
 *
 * Quando o Whisper erra a palavra ("mandar até sexta" vira "até cesta"), a IA
 * devolve o que sobrou — só a preposição, "até". Barrar aqui, e não no prompt,
 * porque é verificação de formato: uma preposição solta nunca é prazo válido,
 * e prazo vazio na tela é honesto, enquanto "prazo: até" parece defeito.
 */
const PALAVRAS_VAZIAS = new Set([
  "ate", "até", "para", "pra", "em", "no", "na", "de", "do", "da",
  "sem prazo", "nao informado", "não informado", "-", "—", "n/a",
]);

function limparPrazo(bruto: unknown): string | null {
  const v = String(bruto ?? "").trim();
  if (v.length < 3) return null;
  const semAcento = v.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  if (PALAVRAS_VAZIAS.has(semAcento) || PALAVRAS_VAZIAS.has(v.toLowerCase())) return null;
  return v;
}

/**
 * Casa o nome falado na reunião com alguém do workspace.
 *
 * A transcrição traz primeiro nome ("o Bruno fecha isso"), e o cadastro tem
 * nome completo. Compara sem acento e em minúscula, aceitando que o nome dito
 * seja parte do cadastrado. Retorna null quando há ambiguidade — dois "Bruno"
 * no time significa que não se sabe de quem se trata, e atribuir ao primeiro
 * seria pior que deixar sem dono.
 */
function casarPessoa(
  nomeDito: string,
  equipe: { id: string; name: string }[],
): { id: string; name: string } | null {
  const limpar = (v: string) =>
    v.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
  const dito = limpar(nomeDito);
  if (dito.length < 3) return null;

  const exatos = equipe.filter((m) => limpar(m.name) === dito);
  if (exatos.length === 1) return exatos[0];

  const partes = equipe.filter((m) => {
    const nome = limpar(m.name);
    return nome.split(/\s+/).includes(dito) || dito.split(/\s+/).includes(nome.split(/\s+/)[0]);
  });
  return partes.length === 1 ? partes[0] : null;
}

/** Reuniões do workspace, mais recentes primeiro. */
export async function listarReunioes(workspaceId: string, limite = 20) {
  return db.select().from(s.meetingNotes)
    .where(eq(s.meetingNotes.workspaceId, workspaceId))
    .orderBy(desc(s.meetingNotes.createdAt))
    .limit(limite);
}

/**
 * Envia o áudio ao Whisper por node:http, e não por fetch.
 *
 * O fetch do Node (undici) tem headersTimeout de 300 segundos por padrão, e
 * não há como aumentá-lo sem passar um dispatcher do undici — que não está
 * disponível neste container. O Whisper só devolve cabeçalho quando termina de
 * transcrever, então qualquer gravação que passe de cinco minutos de
 * processamento falhava com um "fetch failed" seco: medido, uma reunião de 39
 * minutos morria em 303s com o Whisper ainda a 570% de CPU, trabalhando.
 *
 * Era o pior tipo de falha — só aparecia na gravação longa, que é justamente a
 * que mais precisa de ata, e a mensagem não dizia nada sobre timeout.
 *
 * node:http não tem headersTimeout: o único relógio é o de ociosidade do
 * socket, definido abaixo com folga para uma reunião de horas.
 */
const OCIOSIDADE_MAXIMA_MS = 2 * 60 * 60 * 1000;

function postarNoWhisper(
  url: string,
  audio: Buffer,
  mime: string,
): Promise<{ text?: string }> {
  const boundary = `----lovet${randomUUID().replace(/-/g, "")}`;
  const cabeca = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="audio_file"; filename="reuniao"\r\n` +
      `Content-Type: ${mime}\r\n\r\n`,
  );
  const rodape = Buffer.from(`\r\n--${boundary}--\r\n`);
  const corpo = Buffer.concat([cabeca, audio, rodape]);

  const alvo = new URL(url);

  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: alvo.hostname,
        port: alvo.port || 80,
        path: `${alvo.pathname}${alvo.search}`,
        method: "POST",
        headers: {
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Content-Length": corpo.length,
        },
      },
      (res) => {
        const pedacos: Buffer[] = [];
        res.on("data", (d: Buffer) => { pedacos.push(d); });
        res.on("end", () => {
          const texto = Buffer.concat(pedacos).toString("utf8");
          if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`Whisper retornou ${res.statusCode}: ${texto.slice(0, 200)}`));
            return;
          }
          try {
            resolve(JSON.parse(texto) as { text?: string });
          } catch {
            // output=json foi pedido; resposta não-JSON significa que o serviço
            // devolveu texto puro, que ainda serve.
            resolve({ text: texto });
          }
        });
      },
    );

    req.setTimeout(OCIOSIDADE_MAXIMA_MS, () => {
      req.destroy(new Error("O Whisper não respondeu dentro do tempo limite."));
    });
    req.on("error", reject);
    req.end(corpo);
  });
}

/**
 * Transcrição pelo Groq (API compatível com a da OpenAI). O vocabulário vai
 * como `prompt` — mesmo papel do `initial_prompt` do Whisper local, e o mesmo
 * teto de 224 tokens.
 *
 * Gravação acima do limite de upload não é baixada pra função: o Groq busca
 * o arquivo direto do Supabase Storage por URL assinada.
 */
async function transcreverNoGroq(audioPath: string, mime: string, vocab: string): Promise<{ text?: string }> {
  const form = new FormData();
  form.append("model", GROQ_MODELO);
  form.append("language", "pt");
  form.append("response_format", "json");
  form.append("temperature", "0");
  form.append("prompt", vocabularioParaGroq(vocab));

  const audio = await lerMidia(audioPath);
  if (audio.length <= GROQ_LIMITE_UPLOAD) {
    const extensao = mime.includes("mp4") || mime.includes("m4a") ? "m4a" : mime.includes("ogg") ? "ogg"
      : mime.includes("mpeg") ? "mp3" : mime.includes("wav") ? "wav" : "webm";
    form.append("file", new Blob([new Uint8Array(audio)], { type: mime }), `reuniao.${extensao}`);
  } else {
    const url = await urlLeituraTemporaria(audioPath);
    if (!url) throw new Error("Gravação grande demais para o upload e sem Supabase Storage para o Groq baixar.");
    form.append("url", url);
  }

  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
    body: form,
  });
  const corpo = await res.text();
  if (!res.ok) throw new Error(`Groq retornou ${res.status}: ${corpo.slice(0, 200)}`);
  try {
    return JSON.parse(corpo) as { text?: string };
  } catch {
    return { text: corpo };
  }
}

/**
 * A Groq recusa `prompt` acima de 896 caracteres (HTTP 400 "prompt length must
 * be 896 characters or fewer") — e o vocabulário completo passa de 6 mil, por
 * causa de muitos colaboradores cadastrados. Ordem de prioridade: termos do ramo,
 * depois quem participa, depois clientes; corta no último nome inteiro.
 */
const LIMITE_PROMPT_GROQ = 880;

function vocabularioParaGroq(vocab: string): string {
  const [base, ...resto] = vocab.split(/(?= Clientes citados: | Participam )/);
  const participantes = resto.find((r) => r.startsWith(" Participam ")) ?? "";
  const clientes = resto.find((r) => r.startsWith(" Clientes citados: ")) ?? "";
  let texto = base.trim();
  for (const trecho of [participantes, clientes]) {
    if (!trecho) continue;
    const disponivel = LIMITE_PROMPT_GROQ - texto.length;
    if (disponivel < 40) break;
    if (trecho.length <= disponivel) { texto += trecho; continue; }
    const corte = trecho.slice(0, disponivel - 1);
    const ultimaVirgula = corte.lastIndexOf(",");
    texto += `${ultimaVirgula > 0 ? corte.slice(0, ultimaVirgula) : corte}.`;
    break;
  }
  return texto.slice(0, LIMITE_PROMPT_GROQ);
}
