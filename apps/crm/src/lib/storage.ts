import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join, normalize } from "node:path";
import { randomUUID } from "node:crypto";

/**
 * Armazenamento de mídia (campanha, mensagem 1:1, gravação de reunião), fora
 * do banco. Dois destinos, escolhidos pelo ambiente:
 *
 *  - **Supabase Storage** quando `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
 *    estão definidas — é o caso da produção na Vercel, onde o disco da função
 *    é efêmero: um arquivo gravado no upload não existe mais na requisição
 *    seguinte (a que transcreve), nem no worker da VPS.
 *  - **Disco** em `ATTACHMENTS_DIR` (volume do docker-compose) caso contrário
 *    — o stack local continua funcionando sem nada novo.
 *
 * O caminho relativo guardado no banco é o mesmo nos dois ("reunioes/<id>/<uuid>"),
 * então trocar de destino não exige migrar coluna nenhuma — só os arquivos.
 */
const RAIZ = process.env.ATTACHMENTS_DIR ?? join(process.cwd(), ".attachments");

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/+$/, "");
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
/** Bucket PRIVADO — mídia só sai pelas rotas do CRM ou por URL assinada. */
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? "crm-media";

export function storageMode(): "supabase" | "disco" {
  return SUPABASE_URL && SUPABASE_KEY ? "supabase" : "disco";
}

/** 20 MB — vídeo curto de WhatsApp cabe, mas não vira upload de arquivo grande. */
export const TAMANHO_MAXIMO = 20 * 1024 * 1024;

export const TIPOS_IMAGEM = new Set(["image/jpeg", "image/png", "image/webp"]);
export const TIPOS_VIDEO = new Set(["video/mp4", "video/quicktime", "video/webm"]);
export const TIPOS_DOCUMENTO = new Set(["application/pdf"]);

/** Caminho sempre com "/" (é chave de objeto no Storage, não caminho de SO). */
function novoCaminho(pasta: string, id: string): string {
  return [pasta, id, randomUUID()].join("/");
}

function caminhoSeguro(caminhoRelativo: string): string {
  const limpo = caminhoRelativo.replace(/\\/g, "/");
  if (limpo.split("/").some((p) => p === ".." || p === "")) {
    throw new Error("Caminho de mídia inválido.");
  }
  return limpo;
}

async function gravar(caminhoRelativo: string, buffer: Buffer, contentType = "application/octet-stream"): Promise<void> {
  if (storageMode() === "supabase") {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${caminhoSeguro(caminhoRelativo)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": contentType, "x-upsert": "true" },
      body: new Uint8Array(buffer),
    });
    if (!res.ok) throw new Error(`Supabase Storage recusou o arquivo (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`);
    return;
  }
  const completo = join(RAIZ, caminhoRelativo);
  await mkdir(join(completo, ".."), { recursive: true });
  await writeFile(completo, buffer);
}

/**
 * Grava o arquivo e devolve o caminho relativo a guardar no banco.
 *
 * O nome é um uuid, nunca o nome original do upload — evita path traversal e
 * colisão de nomes.
 */
export async function salvarMidiaCampanha(campaignId: string, buffer: Buffer): Promise<string> {
  const caminho = novoCaminho("campanhas", campaignId);
  await gravar(caminho, buffer);
  return caminho;
}

/** Mesmo padrão de salvarMidiaCampanha, para anexos de mensagens 1:1 do WhatsApp. */
export async function salvarMidiaMensagem(messageId: string, buffer: Buffer): Promise<string> {
  const caminho = novoCaminho("mensagens", messageId);
  await gravar(caminho, buffer);
  return caminho;
}

/**
 * Lê o arquivo pelo caminho relativo guardado no banco. No disco, `normalize`
 * + checagem de prefixo fecham a porta de path traversal.
 */
export async function lerMidia(caminhoRelativo: string): Promise<Buffer> {
  if (storageMode() === "supabase") {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${caminhoSeguro(caminhoRelativo)}`, {
      headers: { Authorization: `Bearer ${SUPABASE_KEY}` },
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(res.status === 400 || res.status === 404
        ? "O arquivo não está no servidor — o envio foi interrompido antes de terminar. Grave ou envie de novo."
        : `Não consegui ler o arquivo no Supabase Storage (HTTP ${res.status}).`);
    }
    return Buffer.from(await res.arrayBuffer());
  }
  const caminhoCompleto = normalize(join(RAIZ, caminhoRelativo));
  if (!caminhoCompleto.startsWith(normalize(RAIZ))) {
    throw new Error("Caminho de mídia inválido.");
  }
  return readFile(caminhoCompleto);
}

/** Formatos que o MediaRecorder do navegador produz, por navegador. */
export const TIPOS_AUDIO = new Set([
  "audio/webm", "audio/webm;codecs=opus", "audio/ogg", "audio/ogg;codecs=opus",
  "audio/mp4", "audio/mpeg", "audio/wav", "audio/x-m4a",
]);

/**
 * Gravação de reunião. Limite próprio, bem maior que o de mídia de campanha:
 * uma reunião de uma hora em opus fica na casta de 30 MB, e cortar em 20 MB
 * descartaria justamente a reunião longa, que é a que mais precisa de ata.
 *
 * No plano gratuito da Supabase o teto por arquivo é 50 MB (configurável no
 * plano pago, em Storage → Settings) — o upload acima disso volta com erro
 * claro do próprio Storage.
 */
export const TAMANHO_MAXIMO_AUDIO = 120 * 1024 * 1024;

export async function salvarAudioReuniao(meetingId: string, buffer: Buffer): Promise<string> {
  const caminho = novoCaminho("reunioes", meetingId);
  await gravar(caminho, buffer);
  return caminho;
}

/**
 * URL assinada pro NAVEGADOR mandar a gravação direto pro Supabase Storage.
 *
 * Existe porque a Vercel recusa corpo de requisição acima de 4,5 MB numa
 * função — e uma reunião de 10 minutos já passa disso. O arquivo não passa
 * pelo CRM: a função só cria o caminho e assina; o navegador faz o PUT.
 * Só no modo Supabase; no disco o upload continua indo por /api/reunioes.
 */
export async function urlUploadAudioReuniao(meetingId: string): Promise<{ caminho: string; uploadUrl: string }> {
  if (storageMode() !== "supabase") throw new Error("Upload direto só existe com Supabase Storage configurado.");
  const caminho = novoCaminho("reunioes", meetingId);
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/upload/sign/${BUCKET}/${caminho}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(`Supabase Storage não assinou o upload (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { url?: string };
  if (!data.url) throw new Error("Supabase Storage não devolveu a URL de upload.");
  // `url` vem relativa a /storage/v1 ("/object/upload/sign/<bucket>/<path>?token=...").
  return { caminho, uploadUrl: `${SUPABASE_URL}/storage/v1${data.url}` };
}

/**
 * URL temporária de LEITURA — pra serviço externo baixar o arquivo direto do
 * Storage sem ele passar pela função (ex.: o Groq transcrevendo uma reunião
 * grande demais pro upload). Null fora do modo Supabase.
 */
export async function urlLeituraTemporaria(caminhoRelativo: string, segundos = 3600): Promise<string | null> {
  if (storageMode() !== "supabase") return null;
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${BUCKET}/${caminhoSeguro(caminhoRelativo)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn: segundos }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { signedURL?: string };
  return data.signedURL ? `${SUPABASE_URL}/storage/v1${data.signedURL}` : null;
}

/** Cria o bucket privado se ainda não existe. Idempotente — chamado pelo script de implantação. */
export async function garantirBucket(): Promise<void> {
  if (storageMode() !== "supabase") return;
  const res = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false }),
  });
  if (!res.ok && res.status !== 409) {
    const corpo = await res.text();
    if (!/already exists/i.test(corpo)) throw new Error(`Não consegui criar o bucket ${BUCKET}: ${corpo.slice(0, 200)}`);
  }
}
