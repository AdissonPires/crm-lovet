import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import {
  ArrowLeft, Building2, Bot, Check, Smartphone, CheckCheck, Circle, FileText, MessageCircle, Paperclip, Plug, Search, Send, Target, User, Wifi, WifiOff,
} from "lucide-react";
import { db, schema as s } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/policy";
import { relTime } from "@/lib/format";
import { sendMessage } from "@/app/actions-whatsapp";
import { whatsappMode, connectionInstructions } from "@/lib/whatsapp";

export default async function WhatsappPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const user = await requireUser();
  const { c: selectedId } = await searchParams;

  const conversations = await db.select({
    conv: s.whatsappConversations,
    ownerName: s.users.name,
  }).from(s.whatsappConversations)
    .leftJoin(s.users, eq(s.users.id, s.whatsappConversations.assignedTo))
    // Consultor vê só as conversas que estão com ele (número dele ou atribuídas);
    // gestor vê todas. Regra: cada consultor atende o próprio número.
    .where(and(
      eq(s.whatsappConversations.workspaceId, user.workspaceId),
      ...(can(user.role, "view_team_dashboard") ? [] : [eq(s.whatsappConversations.assignedTo, user.id)]),
    ))
    .orderBy(desc(s.whatsappConversations.lastMessageAt));

  const active = selectedId
    ? conversations.find((c) => c.conv.id === selectedId)
    : conversations[0];

  if (active && active.conv.unreadCount > 0) {
    // Update direto (sem revalidatePath) — não é permitido chamar uma
    // server action com revalidatePath durante a renderização da página.
    await db.update(s.whatsappConversations)
      .set({ unreadCount: 0 })
      .where(eq(s.whatsappConversations.id, active.conv.id));
  }

  const messages = active
    ? await db.select().from(s.whatsappMessages)
        .where(and(eq(s.whatsappMessages.conversationId, active.conv.id), eq(s.whatsappMessages.workspaceId, user.workspaceId)))
        .orderBy(s.whatsappMessages.createdAt)
    : [];

  const opportunity = active?.conv.opportunityId
    ? (await db.select().from(s.opportunities).where(eq(s.opportunities.id, active.conv.opportunityId)))[0]
    : null;

  const mode = whatsappMode();

  async function sendAction(formData: FormData) {
    "use server";
    if (!active) return;
    await sendMessage(active.conv.id, formData);
  }

  const statusDot: Record<string, string> = {
    open: "bg-emerald-500", pending: "bg-brand-500", closed: "bg-zinc-400",
  };

  return (
    <div className="flex h-full">
      {/* Lista de conversas */}
      {/* Celular: lista OU conversa. No desktop a 1ª conversa abre sozinha; no
          celular só abre quando a pessoa escolhe (?c=), senão a lista nunca apareceria. */}
      <div className={`w-[340px] max-md:w-full shrink-0 border-r border-zinc-100 bg-white flex flex-col ${selectedId ? "max-md:hidden" : ""}`}>
        <div className="px-5 py-4 border-b border-zinc-100">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-zinc-900 tracking-tight">WhatsApp</h1>
              <Link href="/whatsapp/numeros" title="Números de WhatsApp conectados"
                className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2 py-1 text-[11px] font-semibold text-zinc-600 hover:text-brand-700 hover:border-brand-300">
                <Smartphone className="h-3.5 w-3.5" /> Números
              </Link>
              {can(user.role, "view_team_dashboard") && (
                <Link href="/whatsapp/follow-up" title="Bot e follow-up automático (número do gestor)"
                  className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2 py-1 text-[11px] font-semibold text-zinc-600 hover:text-brand-700 hover:border-brand-300">
                  <Bot className="h-3.5 w-3.5" /> Follow-up
                </Link>
              )}
            </div>
            <span className={`inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2 py-1 ${
              mode !== "simulated" ? "bg-emerald-50 text-emerald-600" : "bg-brand-50 text-brand-600"
            }`}>
              {mode !== "simulated" ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
              {mode === "whatsgw" ? "WhatsGW" : mode === "evolution" ? "Conectado" : "Simulado"}
            </span>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
            <input placeholder="Buscar conversa…" disabled
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 pl-9 pr-3 py-2 text-sm placeholder:text-zinc-400" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.map(({ conv, ownerName }) => {
            const isActive = active?.conv.id === conv.id;
            return (
              <Link key={conv.id} href={`/whatsapp?c=${conv.id}`}
                className={`flex items-start gap-3 px-4 py-3.5 border-b border-zinc-50 transition-colors ${
                  isActive ? "bg-brand-50/70" : "hover:bg-zinc-50"
                }`}>
                <div className="relative shrink-0">
                  <div className="h-11 w-11 rounded-full bg-gradient-to-br from-zinc-700 to-zinc-900 text-white flex items-center justify-center text-xs font-bold">
                    {conv.contactName.split(" ").map((p) => p[0]).slice(0, 2).join("")}
                  </div>
                  <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-white ${statusDot[conv.status]}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-semibold text-zinc-900 truncate">{conv.contactName}</span>
                    <span className="text-[11px] text-zinc-400 shrink-0 tabular-nums">{relTime(conv.lastMessageAt)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <span className="text-xs text-zinc-500 truncate">{conv.lastMessagePreview}</span>
                    {conv.unreadCount > 0 && (
                      <span className="shrink-0 h-4.5 min-w-[18px] px-1 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center">
                        {conv.unreadCount}
                      </span>
                    )}
                  </div>
                  {ownerName && <div className="text-[10px] text-zinc-400 mt-1">{ownerName}</div>}
                </div>
              </Link>
            );
          })}
          {conversations.length === 0 && (
            <div className="p-8 text-center text-sm text-zinc-400">Nenhuma conversa ainda.</div>
          )}
        </div>
      </div>

      {/* Thread */}
      {active ? (
        <div className={`flex-1 flex flex-col bg-[#eef2f7] min-w-0 ${selectedId ? "" : "max-md:hidden"}`}>
          <div className="px-3 md:px-6 py-3.5 bg-white border-b border-zinc-100 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <Link href="/whatsapp" className="md:hidden -ml-1 p-1.5 rounded-lg text-zinc-500 hover:bg-zinc-100" title="Voltar às conversas">
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <div className="h-9 w-9 shrink-0 rounded-full bg-gradient-to-br from-zinc-700 to-zinc-900 text-white flex items-center justify-center text-xs font-bold">
                {active.conv.contactName.split(" ").map((p) => p[0]).slice(0, 2).join("")}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-zinc-900 truncate">{active.conv.contactName}</div>
                <div className="text-xs text-zinc-400 tabular-nums">{active.conv.phone}</div>
              </div>
            </div>
            {opportunity && (
              <Link href={`/oportunidades/${opportunity.id}`}
                className="flex items-center gap-1.5 text-xs font-medium text-brand-700 bg-brand-50 rounded-lg px-3 py-1.5 hover:bg-brand-100 transition-colors max-w-[45%] min-w-0">
                <Target className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{opportunity.name}</span>
              </Link>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-3 md:px-8 py-4 md:py-6 flex flex-col gap-2">
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.direction === "out" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] md:max-w-[65%] break-words rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed shadow-sm ${
                  m.direction === "out" ? "bg-[#d9fdd3] text-zinc-800 rounded-br-sm" : "bg-white text-zinc-800 rounded-bl-sm"
                }`}>
                  {m.mediaPath && m.mediaType === "image" && (
                    <img src={`/api/wa/messages/media/${m.id}`} alt="Anexo" className="rounded-lg mb-1.5 max-h-64 w-auto" />
                  )}
                  {m.mediaPath && m.mediaType === "video" && (
                    <video src={`/api/wa/messages/media/${m.id}`} controls className="rounded-lg mb-1.5 max-h-64 w-auto" />
                  )}
                  {m.mediaPath && m.mediaType === "document" && (
                    <a href={`/api/wa/messages/media/${m.id}`} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 rounded-lg bg-black/5 px-2.5 py-2 mb-1.5 text-xs font-medium text-zinc-700 hover:bg-black/10 transition-colors">
                      <FileText className="h-4 w-4 shrink-0" /> Ver documento
                    </a>
                  )}
                  {m.body && m.body !== "[anexo]" && m.body}
                  <div className="flex items-center justify-end gap-1 mt-1">
                    <span className="text-[10px] text-zinc-400">{relTime(m.createdAt)}</span>
                    {m.direction === "out" && (
                      m.status === "failed"
                        ? <Circle className="h-3 w-3 text-red-400" />
                        : m.status === "read"
                        ? <CheckCheck className="h-3.5 w-3.5 text-sky-500" />
                        : <Check className="h-3.5 w-3.5 text-zinc-400" />
                    )}
                  </div>
                </div>
              </div>
            ))}
            {messages.length === 0 && (
              <div className="m-auto text-center text-sm text-zinc-500">
                <MessageCircle className="h-8 w-8 mx-auto mb-2 text-zinc-400" />
                Nenhuma mensagem ainda.
              </div>
            )}
          </div>

          <form action={sendAction} className="px-3 md:px-6 py-3 md:py-4 bg-white border-t border-zinc-100 flex items-center gap-2 shrink-0">
            <label title="Anexar imagem, vídeo ou PDF"
              className="h-11 w-11 shrink-0 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors cursor-pointer">
              <Paperclip className="h-4.5 w-4.5" />
              <input type="file" name="attachment" accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm,application/pdf" className="hidden" />
            </label>
            <input name="body" autoComplete="off" placeholder="Digite uma mensagem…"
              className="flex-1 min-w-0 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
            <button className="h-11 w-11 shrink-0 rounded-full bg-emerald-500 text-white flex items-center justify-center hover:bg-emerald-600 transition-colors">
              <Send className="h-4.5 w-4.5" />
            </button>
          </form>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-[#f7f9fc] text-zinc-400 max-md:hidden">
          <div className="text-center">
            <MessageCircle className="h-10 w-10 mx-auto mb-3" />
            Selecione uma conversa
          </div>
        </div>
      )}

      {/* Painel lateral de contexto */}
      {active && (
        <div className="w-[280px] shrink-0 border-l border-zinc-100 bg-white p-5 space-y-4 overflow-y-auto max-lg:hidden">
          <div>
            <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide mb-3">Contato</div>
            <div className="flex items-center gap-2 text-sm text-zinc-700">
              <User className="h-4 w-4 text-zinc-400" /> {active.conv.contactName}
            </div>
            <div className="flex items-center gap-2 text-sm text-zinc-500 mt-2 tabular-nums">
              {active.conv.phone}
            </div>
          </div>

          {mode === "simulated" && (
            <div className="rounded-xl bg-brand-50 border border-brand-100 p-3.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-brand-700 mb-2">
                <Plug className="h-3.5 w-3.5" /> Modo simulado
              </div>
              <p className="text-[11px] text-brand-700/80 leading-relaxed whitespace-pre-line">{connectionInstructions()}</p>
            </div>
          )}

          <div>
            <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide mb-2">Vínculos</div>
            {active.conv.companyId ? (
              <Link href="/empresas" className="flex items-center gap-2 text-sm text-zinc-700 hover:text-brand-600 transition-colors">
                <Building2 className="h-4 w-4 text-zinc-400" /> Ver empresa
              </Link>
            ) : (
              <p className="text-xs text-zinc-400">Sem empresa vinculada.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
