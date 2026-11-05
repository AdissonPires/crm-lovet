import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { getWorkspace } from "@/lib/waApi";
import { normalizePhone, variantesTelefone } from "@/lib/whatsapp";

/**
 * Mensagens RECEBIDAS pela WhatsGW. Configure no painel da WhatsGW
 * (Administração → Telefones → Webhook) a URL:
 *
 *   https://<domínio-do-crm>/api/webhooks/whatsgw?token=<WHATSGW_WEBHOOK_TOKEN>
 *
 * O token vai na URL porque a WhatsGW não manda header customizado.
 *
 * Formato oficial (OpenAPI da WhatsGW, conferido em 20/10/2026): form-urlencoded com `event`
 * (message | status | phonestate), `apikey`, `phone_number` (nosso número), `contact_phone_number`,
 * `contact_name`, `chat_type` (user | group | newsletter | lid | broadcast), `message_type`,
 * `message_state` (received | sent | deleted | edited), `message_body` (texto; base64 na mídia),
 * `message_caption`, `context_type` (0 normal, 1 reação, 2 resposta), `message_id`, `waid`.
 * Só entra mensagem RECEBIDA de conversa individual; o resto é ignorado. A leitura continua
 * tolerante a outros nomes de campo, e o payload cru vai pro log (WHATSGW_LOG_PAYLOAD=off desliga).
 * Mensagem registrada na conversa do cliente.
 */
type Payload = Record<string, unknown>;

function campo(p: Payload, ...nomes: string[]): string {
  for (const nome of nomes) {
    const v = p[nome];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return "";
}

async function lerPayload(req: Request): Promise<Payload | null> {
  const tipo = req.headers.get("content-type") ?? "";
  const bruto = await req.text();
  if (!bruto) return null;
  if (tipo.includes("application/json") || bruto.trim().startsWith("{")) {
    try { return JSON.parse(bruto) as Payload; } catch { return null; }
  }
  return Object.fromEntries(new URLSearchParams(bruto));
}

export async function POST(req: Request) {
  const esperado = process.env.WHATSGW_WEBHOOK_TOKEN;
  if (!esperado || new URL(req.url).searchParams.get("token") !== esperado) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const corpo = await lerPayload(req);
  if (!corpo) return NextResponse.json({ ok: true, ignored: "vazio" });
  // A WhatsGW manda a própria apikey no evento: se vier diferente da nossa, não é da nossa conta.
  const chave = process.env.WHATSGW_API_KEY;
  if (chave && typeof corpo.apikey === "string" && corpo.apikey && corpo.apikey !== chave) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (process.env.WHATSGW_LOG_PAYLOAD !== "off") {
    const semChave = { ...corpo }; delete semChave.apikey; // não grava a chave no log
    console.log("[whatsgw] payload", JSON.stringify(semChave).slice(0, 2000));
  }

  // Alguns eventos vêm aninhados ({ event, data: {...} }).
  const p: Payload = typeof corpo.data === "object" && corpo.data ? { ...corpo, ...(corpo.data as Payload) } : corpo;

  const evento = campo(p, "event", "type", "event_type").toLowerCase();
  if (evento && !/message|mensagem|received|inbound/.test(evento)) {
    return NextResponse.json({ ok: true, ignored: evento }); // status/ack/conexão
  }
  const deMim = p.fromMe === true || p.from_me === true || campo(p, "fromMe", "from_me", "message_direction") === "1"
    || /^(out|sent|enviada)$/i.test(campo(p, "message_direction", "direction"));
  if (deMim) return NextResponse.json({ ok: true, ignored: "saida" });
  // message_state: sent = enviada pelo nosso número (celular ou API); deleted/edited = alteração, não mensagem nova.
  const estado = campo(p, "message_state").toLowerCase();
  if (estado && estado !== "received") return NextResponse.json({ ok: true, ignored: `estado ${estado}` });
  // Só conversa individual: grupo, canal, lista de transmissão e contato só por LID (sem número) ficam de fora.
  const tipoChat = campo(p, "chat_type").toLowerCase();
  if (tipoChat && tipoChat !== "user") return NextResponse.json({ ok: true, ignored: `chat ${tipoChat}` });
  // Reação (👍 numa mensagem) não é mensagem do cliente.
  if (campo(p, "context_type") === "1") return NextResponse.json({ ok: true, ignored: "reacao" });

  const telefoneBruto = campo(p, "contact_phone_number", "sender", "from", "phone", "contact_phone").replace(/@.*/, "");
  const tipoMensagem = campo(p, "message_type", "messageType").toLowerCase() || "text";
  const ehTexto = tipoMensagem === "text" || tipoMensagem === "chat";
  // Na mídia o message_body é o arquivo em base64: o texto é a legenda (message_caption).
  const texto = ehTexto
    ? campo(p, "message_body", "body", "text", "message", "caption", "message_caption")
    : campo(p, "message_caption", "caption");
  if (!telefoneBruto) return NextResponse.json({ ok: true, ignored: "sem telefone" });
  // Grupo não é cliente.
  if (/g\.us$/.test(campo(p, "contact_phone_number", "sender", "from")) || p.is_group === true) {
    return NextResponse.json({ ok: true, ignored: "grupo" });
  }

  const corpoMensagem = ehTexto
    ? texto
    : texto && !/^[A-Za-z0-9+/=]{200,}$/.test(texto) ? `[${tipoMensagem}] ${texto}` : `[${tipoMensagem} recebido]`;
  if (!corpoMensagem) return NextResponse.json({ ok: true, ignored: "sem texto" });

  const workspace = await getWorkspace();
  if (!workspace) return NextResponse.json({ ok: false, error: "no workspace" }, { status: 500 });

  const telefone = normalizePhone(telefoneBruto);
  const nome = campo(p, "contact_name", "name", "pushName", "sender_name") || telefone;
  const agora = new Date();

  // Conversa existente com qualquer grafia do número (com/sem o 9º dígito).
  let [conversa] = await db.select().from(s.whatsappConversations).where(and(
    eq(s.whatsappConversations.workspaceId, workspace.id),
    inArray(s.whatsappConversations.phone, variantesTelefone(telefone)),
  )).limit(1);

  if (!conversa) {
    const [contato] = await db.select().from(s.contacts).where(and(
      eq(s.contacts.workspaceId, workspace.id), inArray(s.contacts.phone, variantesTelefone(telefone)),
    )).limit(1);
    [conversa] = await db.insert(s.whatsappConversations).values({
      workspaceId: workspace.id, contactId: contato?.id, companyId: contato?.companyId, phone: telefone,
      contactName: contato?.name ?? nome, lastMessagePreview: corpoMensagem, lastMessageAt: agora, lastInboundAt: agora, unreadCount: 1,
    }).onConflictDoUpdate({
      target: [s.whatsappConversations.workspaceId, s.whatsappConversations.phone],
      set: { lastMessagePreview: corpoMensagem, lastMessageAt: agora, lastInboundAt: agora },
    }).returning();
  } else {
    await db.update(s.whatsappConversations).set({
      lastMessagePreview: corpoMensagem, lastMessageAt: agora, lastInboundAt: agora, unreadCount: conversa.unreadCount + 1,
    }).where(eq(s.whatsappConversations.id, conversa.id));
  }

  const mediaType = (["image", "document", "audio", "video"] as const).find((m) => tipoMensagem.startsWith(m)) ?? "text";
  await db.insert(s.whatsappMessages).values({
    workspaceId: workspace.id, conversationId: conversa.id, direction: "in", body: corpoMensagem, mediaType,
    providerMessageId: campo(p, "message_id", "id", "messageId") || null,
  });

  return NextResponse.json({ ok: true });
}

/** Alguns painéis testam a URL com GET antes de salvar. */
export async function GET() {
  return NextResponse.json({ ok: true });
}
