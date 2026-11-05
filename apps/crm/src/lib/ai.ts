import Anthropic from "@anthropic-ai/sdk";

// Agentes de IA da lovet — camada com dois provedores:
//  - Anthropic quando ANTHROPIC_API_KEY está definida (modelo em ANTHROPIC_MODEL)
//  - Ollama local (default) em OLLAMA_URL/OLLAMA_MODEL
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";
const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "llama3.1:8b";

export function aiAvailable(): boolean {
  return true; // Ollama é o fallback local; erros de conexão são tratados em runtime
}

export function aiProviderLabel(): string {
  return process.env.ANTHROPIC_API_KEY ? `Claude (${ANTHROPIC_MODEL})` : `Ollama (${OLLAMA_MODEL})`;
}

type JsonSchema = Record<string, unknown>;

async function generateJson<T>(system: string, user: string, schema: JsonSchema): Promise<T> {
  if (process.env.ANTHROPIC_API_KEY) {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 16000,
      system,
      messages: [{ role: "user", content: user }],
      output_config: { format: { type: "json_schema", schema } },
    });
    if (response.stop_reason === "refusal") throw new Error("O agente de IA recusou a solicitação.");
    const text = response.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") throw new Error("Resposta vazia do agente de IA.");
    return JSON.parse(text.text) as T;
  }

  // Ollama nativo: /api/chat com `format` = JSON schema (structured outputs)
  let res: Response;
  try {
    res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        format: schema,
        options: { temperature: 0.2 },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
  } catch {
    throw new Error(`Ollama não respondeu em ${OLLAMA_URL}. Ele está rodando? (ollama serve)`);
  }
  if (!res.ok) {
    throw new Error(`Ollama retornou ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const data = (await res.json()) as { message?: { content?: string } };
  const content = data.message?.content;
  if (!content) throw new Error("Resposta vazia do Ollama.");
  return JSON.parse(content) as T;
}

export type ChatbotReply = {
  reply: string;
  intent: "orcamento" | "duvida" | "suporte" | "outro";
  qualified: boolean;
};

const chatbotSchema: JsonSchema = {
  type: "object",
  properties: {
    reply: { type: "string", description: "Resposta curta e cordial em português, pronta para enviar no WhatsApp" },
    intent: { type: "string", enum: ["orcamento", "duvida", "suporte", "outro"] },
    qualified: { type: "boolean", description: "true quando o cliente já informou cidade E consumo/valor da conta de luz" },
  },
  required: ["reply", "intent", "qualified"],
  additionalProperties: false,
};

// Chatbot de atendimento do WhatsApp: responde clientes B2C na hora e
// qualifica o lead (cidade + valor da conta de luz) para o time de vendas.
export async function chatbotReply(input: {
  contactName: string;
  history: { direction: "in" | "out"; body: string }[];
}): Promise<ChatbotReply> {
  const transcript = input.history
    .map((m) => `${m.direction === "in" ? "Cliente" : "Lovet"}: ${m.body}`)
    .join("\n");
  return generateJson<ChatbotReply>(
    "Você é o assistente virtual da Lovet Distribuidora, atendendo clientes no WhatsApp. " +
      "Objetivo: responder rápido, tirar dúvidas sobre produtos, prazos e condições de entrega, e qualificar o lead perguntando (1) a cidade e (2) qual produto ou quantidade procura. " +
      "Nunca invente preços fechados — diga que um vendedor envia o orçamento. Máximo 3 frases por resposta, tom simpático e direto. " +
      "Se o cliente pedir para falar com humano, diga que um vendedor assume a conversa em instantes. Responda somente com o JSON pedido.",
    `Conversa até agora com ${input.contactName}:\n${transcript}\n\nGere a próxima resposta da Lovet.`,
    chatbotSchema,
  );
}

// ─── Análise de reunião gravada ──────────────────────────────────────────────

export type MeetingAnalysis = {
  titulo: string;
  resumo: string;
  topicos: { titulo: string; detalhe: string }[];
  decisoes: string[];
  insights: string[];
  pendencias: string[];
  participantes: string[];
  encaminhamentos: { descricao: string; responsavel: string; prazo: string }[];
};

/**
 * A ata é montada em DUAS passadas, não em uma.
 *
 * Numa passada só, o llama3.1:8b devolvia consistentemente UM tópico para uma
 * reunião de quatro assuntos: sob restrição de schema, modelo pequeno encerra o
 * array cedo e gasta a saída no primeiro item. Não é falta de instrução — foi
 * testado com contagem explícita ("se tratou de quatro clientes, devolva
 * quatro") e continuou devolvendo um.
 *
 * Separando, cada chamada tem um trabalho estreito:
 *   1. varredura — lista os assuntos, participantes e encaminhamentos (saídas
 *      curtas, que o modelo acerta);
 *   2. detalhamento — uma chamada por assunto, com a transcrição em contexto,
 *      pedindo só aquele parágrafo.
 *
 * Custa N+1 chamadas em vez de 1, o que é irrelevante aqui: a ata não é
 * interativa e roda em Ollama local, sem custo por token.
 */

const varreduraSchema: JsonSchema = {
  type: "object",
  properties: {
    titulo: { type: "string", description: "Título curto NOMEANDO os assuntos tratados, 4 a 8 palavras, usando os nomes que aparecem NA TRANSCRIÇÃO. Nunca \"Ata de Reunião\" nem \"Reunião de hoje\"." },
    assuntos: {
      type: "array",
      description: "Um item por assunto discutido, nomeando o cliente ou o tema. Só o título, sem detalhe.",
      items: { type: "string" },
    },
    participantes: { type: "array", items: { type: "string" } },
    decisoes: { type: "array", items: { type: "string" } },
    insights: { type: "array", items: { type: "string" } },
    pendencias: { type: "array", items: { type: "string" } },
    encaminhamentos: {
      type: "array",
      items: {
        type: "object",
        properties: {
          descricao: { type: "string" },
          responsavel: { type: "string" },
          prazo: { type: "string" },
        },
        required: ["descricao", "responsavel", "prazo"],
        additionalProperties: false,
      },
    },
  },
  required: ["titulo", "assuntos", "participantes", "decisoes", "insights", "pendencias", "encaminhamentos"],
  additionalProperties: false,
};

const detalheSchema: JsonSchema = {
  type: "object",
  properties: {
    detalhe: {
      type: "string",
      description: "3 a 5 frases sobre ESTE assunto: contexto, números e prazos citados, quem falou o quê e como terminou. Texto corrido e bem pontuado.",
    },
  },
  required: ["detalhe"],
  additionalProperties: false,
};

const resumoSchema: JsonSchema = {
  type: "object",
  properties: {
    resumo: {
      type: "string",
      description: "O resumo da reunião inteira em 4 a 6 frases, para quem não estava presente. Nomeia os clientes e os números citados, diz o que ficou resolvido e o que não.",
    },
  },
  required: ["resumo"],
  additionalProperties: false,
};

type Varredura = {
  titulo: string;
  assuntos: string[];
  participantes: string[];
  decisoes: string[];
  insights: string[];
  pendencias: string[];
  encaminhamentos: { descricao: string; responsavel: string; prazo: string }[];
};

/**
 * Teto de transcrição por chamada, em caracteres.
 *
 * O contexto padrão do llama3.1 no Ollama é 4096 tokens, e prompt maior que
 * isso é TRUNCADO EM SILÊNCIO — medido: acima de ~3.700 tokens a entrada era
 * cortada para ~2.050 sem erro nenhum. Numa ata isso é grave, porque o texto
 * sai plausível e nada indica que a segunda metade da reunião foi ignorada.
 *
 * A saída óbvia seria aumentar num_ctx, e cheguei a fazer isso. Voltei atrás:
 * cada token de contexto custa memória de KV cache, e esta máquina já opera no
 * limite de RAM. Dividir a transcrição resolve o mesmo problema gastando mais
 * chamadas em vez de mais memória — e chamada, em Ollama local, é de graça.
 *
 * 8.000 caracteres ≈ 2.400 tokens, deixando folga para as instruções, que são
 * longas. Equivale a uns 13 minutos de fala por parte.
 */
const LIMITE_TRANSCRICAO = 8000;

/**
 * Teto de assuntos na ata. Cada um custa uma chamada ao modelo, e uma ata com
 * quinze tópicos deixa de ser ata: vira transcrição indentada.
 */
const LIMITE_ASSUNTOS = 10;

/**
 * Divide a transcrição em partes que caibam no contexto.
 *
 * Corta em fim de frase, nunca no meio: parte que começa em "…e o Bruno ficou
 * de" faz o modelo inventar o começo da frase para dar sentido ao trecho.
 */
export function dividirTranscricao(texto: string, limite = LIMITE_TRANSCRICAO): string[] {
  const t = texto.trim();
  if (t.length <= limite) return [t];

  const frases = t.match(/[^.!?]+[.!?]+\s*|[^.!?]+$/g) ?? [t];
  const partes: string[] = [];
  let atual = "";

  for (const frase of frases) {
    // Frase sozinha maior que o limite. Acontece de verdade: em áudio ruim o
    // Whisper devolve parede de texto sem um ponto, e aí a transcrição INTEIRA
    // é uma "frase". Deixá-la passar entregava uma parte de 11 mil caracteres
    // ao modelo — de volta ao truncamento silencioso que este divisor existe
    // para evitar. Corta por palavra, que é o melhor limite disponível quando
    // não há pontuação nenhuma.
    if (frase.length > limite) {
      if (atual) { partes.push(atual.trim()); atual = ""; }
      let resto = frase.trim();
      while (resto.length > limite) {
        const corte = resto.lastIndexOf(" ", limite);
        const em = corte > limite * 0.5 ? corte : limite;
        partes.push(resto.slice(0, em).trim());
        resto = resto.slice(em).trim();
      }
      if (resto) atual = `${resto} `;
      continue;
    }
    if ((atual + frase).length > limite) {
      partes.push(atual.trim());
      atual = frase;
    } else {
      atual += frase;
    }
  }
  if (atual.trim()) partes.push(atual.trim());
  return partes.filter(Boolean);
}

export async function analyzeMeeting(input: {
  transcript: string;
  equipe: string[];
  contexto?: string | null;
  /** Carteira de clientes do CRM, usada para separar assunto real de ruído. */
  clientes?: string[];
}): Promise<MeetingAnalysis> {
  const equipe = input.equipe.length
    ? `Nomes cadastrados no time, APENAS para você grafar corretamente quem for citado: ` +
      `${input.equipe.join(", ")}. Esta NÃO é a lista de presentes — não presuma que ` +
      `essas pessoas estavam na reunião.`
    : "";

  const sistema =
    "Você monta a ata de reuniões da Lovet Distribuidora. " +
    "Você recebe a transcrição automática de uma gravação e responde em português do Brasil. " +
    "Regra principal: descreva APENAS o que está na transcrição. Não complete, não suponha, não generalize. " +
    "PRESERVE os números, valores, porcentagens, prazos e nomes de cliente que foram falados — " +
    "é o que torna a ata utilizável. Não arredonde e não omita. " +
    "Responda somente com o JSON pedido.";

  /** Cabeçalho comum a toda chamada: contexto, nomes do time e o trecho. */
  const bloco = (trecho: string, aviso = "") =>
    `${input.contexto ? `Contexto desta reunião: ${input.contexto}\n` : ""}${equipe}\n${aviso}\n\n` +
    `TRANSCRIÇÃO (automática, pode conter erro de palavra e de nome):\n"""\n${trecho}\n"""\n\n`;

  // ── Passada 1: varredura, uma por parte da transcrição ───────────────────
  // Reunião longa não cabe numa chamada e o Ollama truncaria sem avisar, então
  // cada parte é varrida separadamente e os achados são unidos. Assunto que só
  // aparece no fim da reunião entra na ata igual ao que abriu.
  const partes = dividirTranscricao(input.transcript);
  const varreduras: Varredura[] = [];

  for (const [i, parte] of partes.entries()) {
    const aviso = partes.length > 1
      ? `ATENÇÃO: este é o trecho ${i + 1} de ${partes.length} de uma reunião longa. ` +
        `Analise SÓ o que está neste trecho. Não comente o que falta nem tente adivinhar ` +
        `o que veio antes ou depois.`
      : "";
    varreduras.push(await generateJson<Varredura>(sistema, bloco(parte, aviso) + INSTRUCOES_VARREDURA, varreduraSchema));
  }

  const v = unirVarreduras(varreduras);

  // Participante só entra se o nome aparece MESMO na transcrição.
  //
  // A instrução do prompt sozinha resolvia no teste curto, mas com quatro
  // partes a união voltou a acumular: cada varredura acrescentava nomes, e a
  // ata de uma reunião com três pessoas citadas listou as sete do workspace —
  // inclusive quem não falou. Conferir contra o texto é barato e não depende
  // de o modelo obedecer.
  v.participantes = v.participantes.filter((nome) => citadoNaTranscricao(nome, input.transcript));

  // Assunto que é o nome da própria empresa não é assunto: saiu de pergunta
  // genérica ("confirmar se a máquina do cliente é Windows ou Mac") e virou
  // um tópico chamado "Cliente Lovet".
  // Assuntos ordenados por evidência, não por heurística de texto.
  //
  // Tentei ordenar por "substância" — contando número, prazo, valor e verbo de
  // decisão perto de cada assunto — em três desenhos diferentes: frases que
  // repetem o nome, faixas exclusivas entre assuntos, e janela fixa. Os três
  // falharam do mesmo jeito, e medido: assunto FALSO extraído do meio de uma
  // discussão real ("Contrato Antigo", "Cliente Lovet") herda os sinais da
  // vizinhança e sobe no ranking, empurrando para baixo a renovação com
  // desconto fechado e prazo.
  //
  // O problema é de raiz: proximidade não distingue assunto falso de
  // verdadeiro, porque o falso é recortado de onde o sinal está. Quem tem de
  // barrar assunto falso é o critério do prompt, não a contagem. Ordenar por
  // nota deixava a ata pior, então não ficou.
  const assuntos = ordenarAssuntos(
    v.assuntos.filter((a) => !ehSobreAPropriaEmpresa(a)),
    input.clientes ?? [],
    v.encaminhamentos,
  );

  // ── Passada 2: um parágrafo por assunto ───────────────────────────────────
  // Sequencial, e não em paralelo: medido, 4 chamadas simultâneas levam o mesmo
  // tempo que 4 em série (17s nos dois casos), porque o Ollama serializa as
  // requisições de um mesmo modelo. Em série há um ganho real, porém: o prefixo
  // da transcrição fica em cache entre chamadas — 5,6s de prompt na primeira,
  // 0,2s nas seguintes. Paralelizar jogaria esse cache fora sem ganhar nada.
  const topicos: { titulo: string; detalhe: string }[] = [];
  for (const assunto of assuntos) {
    // Numa reunião dividida, o parágrafo é escrito sobre a parte que fala do
    // assunto — não sobre a transcrição inteira, que não caberia.
    const trecho = partes.find((pt) => mencionaAssunto(pt, assunto)) ?? partes[0];
    try {
      const d = await generateJson<{ detalhe: string }>(
        sistema,
        bloco(trecho) +
          `Escreva o parágrafo da ata sobre ESTE assunto, e só sobre ele: "${assunto}"\n\n` +
          `- 3 a 5 frases, texto corrido e bem pontuado.\n` +
          `- Inclua os números, valores, porcentagens e prazos que foram falados sobre ele.\n` +
          `- Diga como o assunto terminou: o que ficou decidido, ou que ficou pendente.\n` +
          `- Não fale de outros assuntos da reunião aqui.\n` +
          `- Se a transcrição tem pouco sobre este assunto, escreva pouco. Não invente.`,
        detalheSchema,
      );
      const detalhe = String(d.detalhe ?? "").trim();
      if (detalhe) topicos.push({ titulo: assunto, detalhe });
    } catch {
      // Um assunto que falha não derruba a ata: entra sem detalhe, e a pessoa
      // ainda vê que o assunto foi tratado.
      topicos.push({ titulo: assunto, detalhe: "" });
    }
  }

  // ── Passada 3: resumo, escrito por último ─────────────────────────────────
  // Depois dos tópicos de propósito: resumir a transcrição crua produzia um
  // resumo do primeiro assunto só. Com os tópicos prontos, o modelo resume a
  // reunião inteira porque já a tem organizada na entrada — e cabe no contexto
  // mesmo numa reunião longa, porque são os parágrafos, não o áudio todo.
  let resumo = "";
  try {
    const r = await generateJson<{ resumo: string }>(
      sistema,
      `Assuntos tratados nesta reunião:\n` +
        topicos.map((tp, i) => `${i + 1}. ${tp.titulo}: ${tp.detalhe}`).join("\n") +
        `\n\nEscreva o RESUMO da reunião inteira em 4 a 6 frases, para quem não estava ` +
        `presente: que clientes entraram, o que ficou resolvido e o que ficou pendente. ` +
        `Nomeie os clientes e os números.\n` +
        `- SINTETIZE. Não copie as frases acima nem as emende uma na outra.\n` +
        `- Cubra TODOS os assuntos, não só o primeiro.\n` +
        `- Não escreva data, hora nem título — só o texto do resumo.`,
      resumoSchema,
    );
    resumo = String(r.resumo ?? "").trim();
  } catch {
    resumo = "";
  }

  // Resumo curto demais é o modelo devolvendo cabeçalho em vez de texto
  // ("Reunião da Lovet - 2023-10-10"), o que já aconteceu. Nesse caso vale
  // mais o primeiro parágrafo real da ata do que uma linha sem conteúdo — e
  // nunca a concatenação de todos cortada no meio da palavra, que era o
  // fallback anterior e aparecia truncado na tela.
  if (resumo.length < 80) {
    resumo = topicos.find((tp) => tp.detalhe.length > 80)?.detalhe ?? resumo;
  }

  return {
    titulo: montarTitulo(v.titulo, topicos),
    resumo,
    topicos,
    // Tetos aplicados aqui, e não só no prompt.
    //
    // A instrução dizia "NO MÁXIMO 4" para insights e o modelo devolveu 8 —
    // com a lista já deduplicada, então não era repetição: ele simplesmente
    // ignorou o número. Numa reunião longa, varrida em partes, cada varredura
    // acrescenta os seus e o total cresce com a duração, que é justamente o
    // contrário do que se quer numa ata.
    //
    // Ordem preservada: o corte tira o fim da lista, e o modelo põe o mais
    // relevante primeiro.
    decisoes: v.decisoes.slice(0, TETO_DECISOES),
    insights: v.insights.slice(0, TETO_INSIGHTS),
    pendencias: v.pendencias.slice(0, TETO_PENDENCIAS),
    participantes: v.participantes,
    encaminhamentos: v.encaminhamentos,
  };
}


/**
 * Título da ata a partir dos assuntos, não do modelo.
 *
 * Pedir o título ao modelo devolvia "Ata de Reunião" e "ata de reunião
 * comercial" com instrução explícita em contrário — ele trata título como
 * rótulo de documento, não como conteúdo. Os títulos dos tópicos já nomeiam os
 * clientes, então montar daí é mais informativo e não depende de sorte.
 */
function montarTitulo(
  doModelo: string | undefined,
  topicos: { titulo: string }[],
): string {
  const generico = /^\s*(ata|ata de reuni|reuni[ãa]o)/i;
  const dele = String(doModelo ?? "").trim();
  if (dele && !generico.test(dele)) return dele;

  const nomes = topicos.map((t) => t.titulo.trim()).filter(Boolean);
  if (nomes.length === 0) return dele || "Reunião";
  if (nomes.length === 1) return nomes[0];
  if (nomes.length === 2) return `${nomes[0]} e ${nomes[1]}`;
  return `${nomes[0]}, ${nomes[1]} e mais ${nomes.length - 2}`;
}

/** Instruções da varredura. Extraídas para não se repetirem por parte. */
const INSTRUCOES_VARREDURA =
  `Faça a VARREDURA da reunião.\n\n` +
  `- assuntos: liste os assuntos que MERECEM ESTAR NUMA ATA, um por item, nomeando o ` +
  `cliente ou o tema. Só o título curto — o detalhe vem depois, não escreva aqui.\n` +
  `  Um assunto merece entrar quando tem DONO, NÚMERO, PRAZO ou DECISÃO. Se a reunião ` +
  `passou por quatro clientes, são quatro itens; percorra a transcrição do começo ao ` +
  `fim antes de responder, porque assunto do final conta igual ao do começo.\n` +
  `  NÃO transforme em assunto: divagação, opinião solta, pergunta sem resposta, ` +
  `combinado de rotina ("vamos revisitar depois"), nem frase de apoio que se repete ao ` +
  `longo da reunião. Reunião longa é feita de conversa; ata é feita do que sobrou dela.\n` +
  `  ERRADO (viraram assunto sem ser): "Contrato Antigo", saído de uma frase de apoio ` +
  `sobre prazo contratual; "Cliente Lovet", saído de uma pergunta genérica sobre ` +
  `sistema operacional. Nenhum dos dois nomeia um cliente nem um tema real.\n` +
  `  CERTO: nomear o cliente e o que estava em jogo, no formato "Assunto — Cliente".\n` +
  `  ATENÇÃO: os nomes usados nos exemplos deste prompt são de outra empresa e de ` +
  `outro ramo. NUNCA os copie para a ata. Todo nome de cliente que você escrever tem ` +
  `de aparecer na transcrição acima.\n` +
  `  Assunto que foi tratado e NÃO gerou tarefa continua sendo assunto — registro de ` +
  `algo concluído ou informado entra na ata do mesmo jeito. Não descarte por falta de ` +
  `encaminhamento.\n` +
  `- encaminhamentos: só o que foi combinado em voz alta. Se ninguém combinou nada, ` +
  `devolva lista vazia.\n` +
  `- descricao: comece por VERBO NO INFINITIVO, com o objeto concreto (o cliente, o ` +
  `número, o documento), e NÃO repita o nome do responsável dentro dela.\n` +
  `  ERRADO: "Bruno fica responsável por montar a proposta"\n` +
  `  CERTO:  "Montar a proposta do lote de 40 licenças da Distribuidora Andorinha"\n` +
  `- responsavel: só preencha se a pessoa foi NOMEADA como responsável. Se foi "a gente ` +
  `vê isso", deixe vazio.\n` +
  `- prazo: só se foi falado. Não invente data. Em "mandar até sexta", "sexta" é PRAZO, ` +
  `não destino — trate palavra de tempo depois de "até" sempre como prazo.\n` +
  `- decisoes: o que foi RESOLVIDO (o número, a condição, a escolha). Não repita aqui os ` +
  `encaminhamentos: quem-faz-o-quê é encaminhamento, não decisão.\n` +
  `- insights: NO MÁXIMO 4, e só sobre os pontos que mudam alguma decisão — risco de ` +
  `perder cliente, gargalo que se repete, objeção que apareceu mais de uma vez, ` +
  `oportunidade concreta. Cada um SITUADO: diz a que cliente ou assunto se refere e ` +
  `por que importa. Se a reunião não teve nada disso, devolva lista vazia — ata sem ` +
  `insight é melhor que insight inventado para preencher.\n` +
  `  ERRADO (solto): "A fila de agendamento está crescendo."\n` +
  `  ERRADO (óbvio, não é leitura): "Foi discutida a renovação de um cliente."\n` +
  `  CERTO (situado e acionável): "Três clientes já reclamaram da demora no ` +
  `atendimento; o setor tem só dois atendentes e a fila cresce."\n` +
  `- pendencias: o que ficou em aberto SEM dono. Não repita o que está em encaminhamentos.\n` +
  `- participantes: SOMENTE nomes que aparecem na transcrição. Nunca complete com os ` +
  `outros nomes do time.\n` +
  `- Não corrija nem "melhore" nomes próprios; se não entendeu um nome, não o cite.\n\n` +
  `Um item de assuntos POR ASSUNTO. Se o trecho tratou de quatro clientes, devolva ` +
  `quatro. Não reaproveite o conteúdo do exemplo abaixo, que é de outra reunião e de ` +
  `outra empresa — copie o nível de detalhe, nunca o texto.\n\n` +
  `EXEMPLO DE FORMA (conteúdo fictício, de outro ramo):\n` +
  `assuntos: ["Troca do fornecedor de embalagem — Distribuidora Andorinha"]\n` +
  `encaminhamentos: [{"descricao":"Pedir três cotações de embalagem para a ` +
  `Distribuidora Andorinha","responsavel":"Marina","prazo":"fim do mês"}]\n` +
  `ERRADO (vago, sem cliente e sem objeto):\n` +
  `assuntos: ["Fornecedores"]\n` +
  `encaminhamentos: [{"descricao":"Ver fornecedores","responsavel":"Marina","prazo":""}]`;

/** Normaliza para comparar sem acento e sem caixa. */
function chave(v: string): string {
  return v.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

/**
 * Palavras que aparecem em quase todo assunto desta empresa e por isso não
 * distinguem um do outro. Sem esta lista, "Pedidos da Transportes
 * Guajará" e "Reposição de pedidos do Tapajós" seriam considerados o
 * mesmo assunto, por compartilharem "pedidos".
 */
const TERMOS_GENERICOS = new Set([
  "pedido", "pedidos", "cliente", "clientes", "proposta", "emissao",
  "nota", "fiscal", "problema", "pendentes", "pendente", "renovacao", "token",
  "arquivo", "nuvem", "assunto", "reuniao", "sobre", "para", "como", "mais",
  "dias", "prazo", "ainda", "sendo", "estao",
]);

function termosDistintivos(texto: string): Set<string> {
  return new Set(
    chave(texto)
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 4 && !TERMOS_GENERICOS.has(w))
      // Tira o plural: "agendamentos" e "agendamento" são a mesma coisa, e sem
      // isto o encaminhamento "levantar quantos AGENDAMENTOS estão pendentes"
      // não casava com o assunto "AGENDAMENTO da videoconferência".
      .map((w) => (w.length > 5 && w.endsWith("s") ? w.slice(0, -1) : w)),
  );
}

/**
 * Diz se dois textos falam do mesmo assunto.
 *
 * Comparação exata não servia: cada parte da transcrição nomeia o mesmo
 * assunto de um jeito ("Transportes Guajará", "Pedidos da Transportes
 * Guajará", "Transportes Guajará: pedidos pendentes"), e a ata saía com
 * doze tópicos para uma reunião de seis. Pior que a repetição: passando do
 * limite de assuntos, o corte descartava justamente os do fim da reunião — o
 * mesmo sintoma que a divisão em partes existe para resolver.
 *
 * Jaccard sobre os termos distintivos, com corte em 0,5: medido contra a saída
 * real que trazia doze títulos, reduz a seis e mantém a versão mais completa
 * de cada um.
 */
function mesmoAssunto(a: string, b: string): boolean {
  const A = termosDistintivos(a);
  const B = termosDistintivos(b);
  if (A.size === 0 || B.size === 0) return false;
  let comuns = 0;
  for (const w of A) if (B.has(w)) comuns++;
  return comuns / (A.size + B.size - comuns) >= 0.5;
}

/** Deduplica mantendo, entre dois textos equivalentes, o mais informativo. */
function dedupSimilares(lista: string[]): string[] {
  const out: string[] = [];
  for (const item of lista.map((x) => String(x ?? "").trim()).filter(Boolean)) {
    const i = out.findIndex((j) => mesmoAssunto(j, item));
    if (i === -1) out.push(item);
    else if (item.length > out[i].length) out[i] = item;
  }
  return out;
}

/**
 * Une as varreduras das partes numa só.
 *
 * Deduplica porque assunto que atravessa a fronteira de duas partes é listado
 * pelas duas — sem isso, uma reunião longa sairia com "Renovação Tapajós"
 * repetido, o que faria a ata parecer defeituosa justamente no caso em que ela
 * é mais necessária.
 */
function unirVarreduras(vs: Varredura[]): Varredura {
  if (vs.length === 1) return vs[0];

  const unicos = (listas: string[][]): string[] => dedupSimilares(listas.flat());

  // Encaminhamento duplicado é comparado pela ação, não pelo texto inteiro:
  // o mesmo combinado descrito em duas partes sai com palavras diferentes.
  const encaminhamentos: Varredura["encaminhamentos"] = [];
  for (const e of vs.flatMap((x) => x.encaminhamentos ?? [])) {
    const responsavel = String(e?.responsavel ?? "").trim();
    const desc = limparDescricao(String(e?.descricao ?? ""), responsavel);
    if (!desc) continue;
    const i = encaminhamentos.findIndex((j) => mesmoAssunto(j.descricao, desc));
    if (i === -1) {
      encaminhamentos.push({ descricao: desc, responsavel, prazo: String(e?.prazo ?? "").trim() });
    } else {
      // Entre duas versões do mesmo combinado, fica a mais completa — e o
      // prazo de qualquer uma das duas que o tenha.
      if (desc.length > encaminhamentos[i].descricao.length) encaminhamentos[i].descricao = desc;
      if (!encaminhamentos[i].responsavel && responsavel) encaminhamentos[i].responsavel = responsavel;
      if (!encaminhamentos[i].prazo && e?.prazo) encaminhamentos[i].prazo = String(e.prazo).trim();
    }
  }

  return {
    titulo: vs.find((x) => String(x.titulo ?? "").trim())?.titulo ?? "",
    assuntos: unicos(vs.map((x) => x.assuntos ?? [])),
    participantes: unicos(vs.map((x) => x.participantes ?? [])),
    decisoes: unicos(vs.map((x) => x.decisoes ?? [])),
    insights: unicos(vs.map((x) => x.insights ?? [])),
    pendencias: unicos(vs.map((x) => x.pendencias ?? [])),
    encaminhamentos,
  };
}

/**
 * Diz se um trecho fala do assunto, para escolher qual parte mandar ao escrever
 * o parágrafo. Casa por palavra significativa do título, e não pelo título
 * inteiro, porque o modelo reescreve o título ("Clínica Odonto Nazaré" para um
 * trecho que diz "a clínica odonto"). Palavra curta é descartada: "de" e "do"
 * casariam com qualquer trecho.
 */
function mencionaAssunto(trecho: string, assunto: string): boolean {
  const alvo = chave(trecho);
  const termos = chave(assunto).split(/[\s—–-]+/).filter((w) => w.length > 4);
  if (termos.length === 0) return false;
  return termos.some((w) => alvo.includes(w));
}

/**
 * Limpa a descrição do encaminhamento.
 *
 * Ao varrer partes separadas, o modelo volta a escrever em terceira pessoa em
 * algumas delas ("Marina cobrar por e-mail amanhã", "Rafael ligar para a
 * clínica") apesar da instrução em contrário — e aí a tarefa aparece na fila da
 * Marina com o nome dela dentro do próprio título. Tirar o nome do começo é
 * verificação de formato, mais confiável aqui do que insistir no prompt.
 */
function limparDescricao(bruto: string, responsavel: string): string {
  let d = bruto.trim();
  const primeiro = responsavel.trim().split(/\s+/)[0];
  if (primeiro && primeiro.length > 2) {
    // "Marina cobrar ..." / "Marina ficou de cobrar ..." / "Marina, cobrar ..."
    const re = new RegExp(
      `^${primeiro}\\b[,:]?\\s*(fica(r|ou)?\\s+(de|responsável\\s+por)\\s+|deve\\s+|vai\\s+)?`,
      "i",
    );
    d = d.replace(re, "").trim();
  }
  if (!d) return "";
  return d.charAt(0).toUpperCase() + d.slice(1);
}

/**
 * Confere se a pessoa foi mesmo citada na transcrição.
 *
 * Compara pelo primeiro nome, sem acento: a fala diz "o Bruno fecha isso" e o
 * cadastro guarda "Bruno Costa". Exigir o nome completo descartaria quase todo
 * mundo que participou de verdade.
 */
function citadoNaTranscricao(nome: string, transcricao: string): boolean {
  const primeiro = chave(nome).split(/\s+/)[0];
  if (!primeiro || primeiro.length < 3) return false;
  return new RegExp(`\\b${primeiro}\\b`).test(chave(transcricao));
}

/**
 * Assunto que fala da própria Lovet, e não de um cliente ou de um tema.
 *
 * Apareceu como "Cliente Lovet", saído de uma pergunta de rotina no meio da
 * conversa. Numa ata da Lovet, "Lovet" sozinho não identifica nada.
 */
function ehSobreAPropriaEmpresa(assunto: string): boolean {
  const k = chave(assunto);
  const semRuido = k.replace(/\b(cliente|clientes|assunto|sobre|da|de|do|a|o)\b/g, "").trim();
  return semRuido === "lovet";
}



/**
 * Ordena os assuntos por EVIDÊNCIA de que são assunto de verdade.
 *
 * A primeira ideia foi pontuar por proximidade: contar número, prazo, valor e
 * verbo de decisão nas frases em volta de cada assunto. Foi tentada em três
 * desenhos — frases que repetem o nome, faixas exclusivas entre assuntos, e
 * janela fixa — e os três falharam do mesmo jeito, medido: assunto FALSO
 * recortado do meio de uma discussão real ("Contrato Antigo", "Cliente
 * Lovet") herda os sinais da vizinhança e sobe, empurrando para baixo a
 * renovação com desconto fechado e prazo. Proximidade não separa o falso do
 * verdadeiro, porque o falso é recortado justamente de onde o sinal está.
 *
 * Aqui a ordem vem de duas evidências externas ao texto, que o ruído não
 * consegue imitar:
 *
 *   1. o assunto nomeia um cliente que existe no CRM;
 *   2. o assunto gerou um encaminhamento com responsável.
 *
 * "Contrato Antigo" não é cliente cadastrado e não virou tarefa de ninguém;
 * "Clínica Odonto Nazaré" é as duas coisas. Nenhuma contagem de palavras
 * chegava a isso.
 *
 * Ordena, não descarta: assunto sem cliente e sem tarefa pode ser registro
 * legítimo ("a instalação saiu no mesmo dia"), e sumir com ele já foi um
 * defeito real. Vai para o fim e só cai se estourar o limite.
 */
export function ordenarAssuntos(
  assuntos: string[],
  clientes: string[],
  encaminhamentos: { descricao: string; responsavel: string }[],
  limite = LIMITE_ASSUNTOS,
): string[] {
  const clienteConhecido = (assunto: string): boolean => {
    const termos = termosDistintivos(assunto);
    if (termos.size === 0) return false;
    return clientes.some((c) => {
      const doCliente = termosDistintivos(c);
      if (doCliente.size === 0) return false;
      // Basta um termo distintivo em comum: a fala diz "Tapajós" e o cadastro
      // guarda "Escritório Contábil Tapajós Ltda".
      for (const w of doCliente) if (termos.has(w)) return true;
      return false;
    });
  };

  // Casamento FROUXO de propósito, diferente do usado para deduplicar.
  //
  // O limiar de similaridade que serve para achar título repetido é estrito
  // demais aqui: tarefa e assunto são redigidos de formas distintas
  // ("Levantar quantos agendamentos estão pendentes" contra "Agendamento da
  // videoconferência de validação"), e por 0,2 de Jaccard esse assunto real,
  // com dona e tudo, era cortado da ata.
  //
  // Um termo distintivo em comum basta: aqui o casamento só serve para
  // ordenar, e ordenar um assunto alto por engano custa muito menos do que
  // derrubar um assunto que tem responsável.
  const temTarefa = (assunto: string): boolean => {
    const doAssunto = termosDistintivos(assunto);
    if (doAssunto.size === 0) return false;
    return encaminhamentos.some((e) => {
      if (!e.responsavel.trim()) return false;
      for (const w of termosDistintivos(e.descricao)) if (doAssunto.has(w)) return true;
      return false;
    });
  };

  const nota = (a: string) => (clienteConhecido(a) ? 2 : 0) + (temTarefa(a) ? 1 : 0);

  // Ordenação estável: empate mantém a ordem em que a reunião tratou o assunto.
  const ordenados = assuntos
    .map((a, i) => ({ a, i, n: nota(a) }))
    .sort((x, y) => y.n - x.n || x.i - y.i);

  // O limite corta RUÍDO, nunca conteúdo com evidência.
  //
  // Cortar a lista ordenada em dez parecia natural e estava errado: numa
  // reunião com doze clientes reais, todos com evidência, o corte derrubava a
  // Padaria Pão de Belém — cliente cadastrado, com tarefa e prazo, e o assunto
  // mais urgente da pauta. Era o mesmo defeito de perder o fim da reunião, só
  // que por outro caminho.
  //
  // Se doze clientes foram tratados, a ata tem doze assuntos: isso não é
  // excesso, é a reunião. O teto existe para o caso oposto — dezenas de
  // assuntos sem cliente e sem tarefa, que é ruído extraído da conversa.
  const comEvidencia = ordenados.filter((x) => x.n > 0);
  const semEvidencia = ordenados.filter((x) => x.n === 0);
  const vagasSobrando = Math.max(0, limite - comEvidencia.length);

  return [...comEvidencia, ...semEvidencia.slice(0, vagasSobrando)]
    .slice(0, TETO_ABSOLUTO_ASSUNTOS)
    .map((x) => x.a);
}

/**
 * Teto duro, acima do limite normal.
 *
 * Protege contra o caso em que o modelo desanda e devolve dezenas de assuntos:
 * cada um custa uma chamada, e uma ata com trinta tópicos não é ata. Fica bem
 * acima do que uma reunião real produz, para não cortar pauta legítima.
 */
const TETO_ABSOLUTO_ASSUNTOS = 20;

/**
 * Tetos das listas de apoio da ata.
 *
 * Existem porque o prompt sozinho não segura: pedindo no máximo 4 insights o
 * modelo devolveu 8. Uma ata com dez "leituras" e oito "pendências" é a
 * reunião transcrita de novo, com outro rótulo.
 */
const TETO_INSIGHTS = 4;
const TETO_DECISOES = 8;
const TETO_PENDENCIAS = 5;
