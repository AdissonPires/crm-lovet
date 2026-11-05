// Camada de provedor WhatsApp. Três modos, escolhidos pelo ambiente:
//  - WhatsGW (gateway brasileiro, app.whatsgw.com.br) quando WHATSGW_API_KEY
//    está definida — é o provedor da produção (Vercel + VPS Hostinger).
//  - Evolution API (self-hosted) quando EVOLUTION_API_URL está definida — o
//    stack Docker local.
//  - simulado caso contrário: mensagens são gravadas como enviadas, sem
//    tráfego real — mesmo padrão de fallback de src/lib/ai.ts.
const EVOLUTION_URL = process.env.EVOLUTION_API_URL;
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY;
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE ?? "lovet";

const WHATSGW_URL = (process.env.WHATSGW_API_URL ?? "https://app.whatsgw.com.br/api/WhatsGw").replace(/\/+$/, "");
const WHATSGW_KEY = process.env.WHATSGW_API_KEY;
/** Número conectado na WhatsGW de onde as mensagens saem (só dígitos, com 55). */
const WHATSGW_PHONE = process.env.WHATSGW_PHONE_NUMBER ?? "";

export function whatsappMode(): "whatsgw" | "evolution" | "simulated" {
  if (WHATSGW_KEY) return "whatsgw";
  return EVOLUTION_URL ? "evolution" : "simulated";
}

export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("55")) return digits;
  return `55${digits}`;
}

/**
 * As duas grafias do mesmo celular brasileiro: com e sem o 9º dígito. O
 * WhatsApp entrega número antigo sem o 9 (5591 8888-7777) mesmo quando o
 * cadastro tem com o 9 (5591 9 8888-7777) — casar só pela grafia
 * exata perderia a resposta do cliente.
 */
export function variantesTelefone(phone: string): string[] {
  const n = normalizePhone(phone);
  if (n.length === 13 && n[4] === "9") return [n, n.slice(0, 4) + n.slice(5)];
  if (n.length === 12 && /[6-9]/.test(n[4])) return [n, `${n.slice(0, 4)}9${n.slice(4)}`];
  return [n];
}

export type SendResult = { ok: boolean; providerMessageId?: string; error?: string };

/**
 * Envio pela WhatsGW (`POST /Send`). A API devolve o id da mensagem sob nomes
 * que variam entre versões — guarda-se o `message_custom_id` que nós mesmos
 * mandamos quando não vier nenhum, que é o que chega de volta no webhook de
 * status e serve pra casar.
 */
async function enviarWhatsgw(phone: string, campos: Record<string, string>): Promise<SendResult> {
  const customId = `crm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  try {
    const res = await fetch(`${WHATSGW_URL}/Send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apikey: WHATSGW_KEY,
        phone_number: normalizePhone(WHATSGW_PHONE),
        contact_phone_number: normalizePhone(phone),
        message_custom_id: customId,
        check_status: "1",
        ...campos,
      }),
    });
    const texto = await res.text();
    let data: Record<string, unknown> = {};
    try { data = JSON.parse(texto) as Record<string, unknown>; } catch { /* resposta não-JSON */ }
    const recusado = data.result === "error" || data.success === false || data.status === "error";
    if (!res.ok || recusado) {
      return { ok: false, error: `WhatsGW recusou o envio (HTTP ${res.status}): ${texto.slice(0, 200)}` };
    }
    const id = data.message_id ?? data.messageId ?? data.id ?? customId;
    return { ok: true, providerMessageId: String(id) };
  } catch {
    return { ok: false, error: "Não foi possível conectar na WhatsGW (app.whatsgw.com.br)." };
  }
}

/** `instancia`: número de saída (instância da Evolution); sem ele, a padrão (`EVOLUTION_INSTANCE`). Ignorado na WhatsGW. */
export async function sendWhatsappMessage(phone: string, text: string, instancia?: string | null): Promise<SendResult> {
  const modo = whatsappMode();
  if (modo === "simulated") {
    // Sem provedor configurado: grava como enviado localmente.
    return { ok: true, providerMessageId: `sim_${Date.now()}` };
  }
  if (modo === "whatsgw") {
    return enviarWhatsgw(phone, { message_type: "text", message_body: text });
  }

  try {
    const res = await fetch(`${EVOLUTION_URL}/message/sendText/${encodeURIComponent(instancia || EVOLUTION_INSTANCE)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: EVOLUTION_KEY ?? "" },
      body: JSON.stringify({ number: normalizePhone(phone), text }),
    });
    if (!res.ok) {
      return { ok: false, error: `Evolution API retornou ${res.status}` };
    }
    const data = (await res.json()) as { key?: { id?: string } };
    return { ok: true, providerMessageId: data.key?.id };
  } catch {
    return { ok: false, error: `Não foi possível conectar em ${EVOLUTION_URL}. O servidor Evolution está no ar?` };
  }
}

export type MediaKind = "image" | "video" | "document";

const MIME_PADRAO: Record<MediaKind, string> = { image: "image/jpeg", video: "video/mp4", document: "application/pdf" };

/**
 * Envia um anexo (imagem, vídeo ou documento). `mediaUrl` precisa ser
 * alcançável pelo provedor — por isso as rotas que servem mídia (ex.:
 * /api/wa/messages/media/[id]) não exigem sessão de usuário, só um id não
 * adivinhável, mesmo padrão já usado pela mídia de campanha.
 *
 * Na WhatsGW o arquivo vai em base64 no próprio corpo (`message_body`), então
 * o CRM baixa a mídia da própria URL e embute.
 */
export async function sendWhatsappMedia(
  phone: string, mediaUrl: string, mediaKind: MediaKind, caption?: string, instancia?: string | null,
): Promise<SendResult> {
  const modo = whatsappMode();
  if (modo === "simulated") {
    return { ok: true, providerMessageId: `sim_${Date.now()}` };
  }
  if (modo === "whatsgw") {
    try {
      const arq = await fetch(mediaUrl, { cache: "no-store" });
      if (!arq.ok) return { ok: false, error: `Não consegui ler a mídia em ${mediaUrl} (HTTP ${arq.status}).` };
      const mime = arq.headers.get("content-type")?.split(";")[0] || MIME_PADRAO[mediaKind];
      const base64 = Buffer.from(await arq.arrayBuffer()).toString("base64");
      const extensao = mime.split("/")[1] ?? "bin";
      return enviarWhatsgw(phone, {
        message_type: mediaKind,
        message_body: base64,
        message_body_mimetype: mime,
        message_body_filename: `arquivo.${extensao}`,
        message_caption: caption ?? "",
      });
    } catch {
      return { ok: false, error: `Não consegui baixar a mídia em ${mediaUrl}.` };
    }
  }

  try {
    const res = await fetch(`${EVOLUTION_URL}/message/sendMedia/${encodeURIComponent(instancia || EVOLUTION_INSTANCE)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: EVOLUTION_KEY ?? "" },
      body: JSON.stringify({
        number: normalizePhone(phone), mediatype: mediaKind, media: mediaUrl, caption: caption ?? "",
      }),
    });
    if (!res.ok) {
      return { ok: false, error: `Evolution API retornou ${res.status}` };
    }
    const data = (await res.json()) as { key?: { id?: string } };
    return { ok: true, providerMessageId: data.key?.id };
  } catch {
    return { ok: false, error: `Não foi possível conectar em ${EVOLUTION_URL}. O servidor Evolution está no ar?` };
  }
}

/** URL pela qual o próprio CRM se enxerga de dentro da rede Docker. */
export function appInternalUrl(): string {
  return process.env.APP_INTERNAL_URL ?? "http://lovet-crm:3000";
}

export function connectionInstructions(): string {
  return (
    "Para conectar o WhatsApp de verdade:\n" +
    "1. Suba o Evolution API (docker run, ver docs.evolution-api.com)\n" +
    "2. Configure EVOLUTION_API_URL, EVOLUTION_API_KEY e EVOLUTION_INSTANCE em .env.local\n" +
    "3. Escaneie o QR code gerado pelo Evolution para parear seu número\n" +
    "4. Aponte o webhook do Evolution para /api/webhooks/evolution deste CRM"
  );
}

// ── Números (instâncias) da Evolution — tela "Números de WhatsApp" ──────────

export type EstadoNumero = "conectado" | "aguardando_qr" | "desconectado" | "inexistente" | "simulado";

async function evolution(caminho: string, init?: RequestInit): Promise<Response> {
  return fetch(`${EVOLUTION_URL}${caminho}`, {
    ...init,
    headers: { "Content-Type": "application/json", apikey: EVOLUTION_KEY ?? "", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
}

export async function estadoDoNumero(instancia: string): Promise<EstadoNumero> {
  if (whatsappMode() === "simulated") return "simulado";
  // Na WhatsGW o pareamento (QR) é feito no painel dela, não pelo CRM.
  if (whatsappMode() === "whatsgw") return "conectado";
  try {
    const res = await evolution(`/instance/connectionState/${encodeURIComponent(instancia)}`);
    if (res.status === 404) return "inexistente";
    const data = (await res.json()) as { instance?: { state?: string } };
    const estado = data.instance?.state;
    return estado === "open" ? "conectado" : estado === "connecting" ? "aguardando_qr" : "desconectado";
  } catch {
    return "desconectado";
  }
}

/**
 * Cria a instância na Evolution já entregando as mensagens pro MESMO destino
 * do número de referência (o do gestor → n8n): o chatbot recebe, registra no
 * CRM e — por não ser o número do gestor — não responde (atendimento manual).
 */
export async function criarNumero(instancia: string, instanciaReferencia: string): Promise<{ ok: boolean; erro?: string }> {
  if (whatsappMode() === "simulated") return { ok: false, erro: "WhatsApp em modo simulado (sem Evolution configurada)." };
  if (whatsappMode() === "whatsgw") return { ok: false, erro: "Na WhatsGW os números são adicionados e pareados no painel app.whatsgw.com.br." };
  const ref = await evolution(`/webhook/find/${encodeURIComponent(instanciaReferencia)}`).then((r) => r.ok ? r.json() : null).catch(() => null) as
    { url?: string; events?: string[]; enabled?: boolean } | null;
  if (!ref?.url) return { ok: false, erro: `Não achei o destino das mensagens do número "${instanciaReferencia}" pra copiar.` };
  const res = await evolution("/instance/create", {
    method: "POST",
    body: JSON.stringify({
      instanceName: instancia, integration: "WHATSAPP-BAILEYS", qrcode: true,
      webhook: { url: ref.url, byEvents: false, base64: false, events: ref.events?.length ? ref.events : ["MESSAGES_UPSERT"] },
    }),
  });
  if (!res.ok) return { ok: false, erro: `Evolution recusou criar o número (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}` };
  return { ok: true };
}

/** QR Code (imagem base64) pra parear o celular. Null se já conectado ou indisponível. */
export async function qrDoNumero(instancia: string): Promise<string | null> {
  if (whatsappMode() !== "evolution") return null;
  try {
    const res = await evolution(`/instance/connect/${encodeURIComponent(instancia)}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { base64?: string };
    return data.base64 ?? null;
  } catch {
    return null;
  }
}

/** Desconecta o celular e apaga a instância na Evolution (as conversas no CRM ficam). */
export async function removerNumero(instancia: string): Promise<void> {
  if (whatsappMode() !== "evolution") return;
  await evolution(`/instance/logout/${encodeURIComponent(instancia)}`, { method: "DELETE" }).catch(() => null);
  await evolution(`/instance/delete/${encodeURIComponent(instancia)}`, { method: "DELETE" }).catch(() => null);
}
