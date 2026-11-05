import Link from "next/link";
import { and, desc, eq, ne } from "drizzle-orm";
import { Headphones, Clock, CheckCircle2, MessageCircle, AlertCircle } from "lucide-react";
import { db, schema as s } from "@/db";
import { requireUser } from "@/lib/auth";
import { relTime } from "@/lib/format";
import { isAgentAvailable, pendingHandoffsFor, sectorsOf } from "@/lib/handoff";
import { claimAndOpen, finishServiceForm } from "@/app/actions-handoff";

export const dynamic = "force-dynamic";

/**
 * Fila de atendimento humano.
 *
 * Mostra três coisas na ordem em que importam para quem opera:
 *  1. o que exige ação agora (pedidos aguardando alguém assumir);
 *  2. o que já é meu (conversas atribuídas a mim, para encerrar quando acabar);
 *  3. por que eu talvez não esteja vendo pedido nenhum — a explicação evita o
 *     "não aparece nada" sem motivo aparente.
 */
export default async function AtendimentosPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const user = await requireUser();
  const { erro } = await searchParams;

  const [pendentes, livre, meusSetores] = await Promise.all([
    pendingHandoffsFor(user.workspaceId, user.id),
    isAgentAvailable(user.workspaceId, user.id),
    sectorsOf(user.workspaceId, user.id),
  ]);

  const minhas = await db
    .select({ conv: s.whatsappConversations, sectorName: s.serviceSectors.name })
    .from(s.whatsappConversations)
    .leftJoin(s.serviceSectors, eq(s.serviceSectors.id, s.whatsappConversations.serviceSectorId))
    .where(and(
      eq(s.whatsappConversations.workspaceId, user.workspaceId),
      eq(s.whatsappConversations.assignedTo, user.id),
      ne(s.whatsappConversations.status, "closed"),
    ))
    .orderBy(desc(s.whatsappConversations.lastMessageAt));

  const card = "rounded-2xl bg-white border border-zinc-100 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-14px_rgba(0,0,0,0.12)]";

  return (
    <div className="p-4 md:p-8 max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">Atendimentos</h1>
        <p className="text-sm text-zinc-500 mt-0.5">
          Clientes que pediram para falar com uma pessoa. Quem assumir primeiro fica com o atendimento.
        </p>
      </div>

      {erro === "assumido" && (
        <div className="flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-[13px] text-amber-800">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Outro atendente assumiu esse cliente antes de você.
        </div>
      )}

      {/* ── Aguardando alguém assumir ─────────────────────────────────────── */}
      <div className={card}>
        <div className="px-5 py-4 border-b border-zinc-100 flex items-center gap-2">
          <Headphones className="h-4 w-4 text-brand-600" />
          <span className="font-semibold text-sm text-zinc-800">Aguardando atendimento</span>
          {pendentes.length > 0 && (
            <span className="h-5 min-w-[20px] px-1.5 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">
              {pendentes.length}
            </span>
          )}
        </div>

        <div className="divide-y divide-zinc-50">
          {pendentes.map((h) => (
            <div key={h.id} className="px-5 py-4 flex flex-wrap items-center justify-between gap-3 bg-amber-50/40">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[13px] font-semibold text-zinc-800">{h.contactName}</span>
                  {h.sectorName && (
                    <span className="rounded-full bg-brand-100 text-brand-800 text-[10.5px] font-semibold px-2 py-0.5">
                      {h.sectorName}
                    </span>
                  )}
                </div>
                <div className="text-xs text-zinc-500 mt-1">{h.summary ?? "Pediu atendente humano"}</div>
                <div className="flex items-center gap-1 text-[11px] text-zinc-400 mt-1">
                  <Clock className="h-3 w-3" /> esperando há {relTime(h.createdAt)}
                </div>
              </div>
              <form action={claimAndOpen.bind(null, h.id)}>
                <button className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 text-white text-[12.5px] font-semibold px-4 py-2.5 hover:bg-brand-700 shadow-sm transition-colors">
                  <MessageCircle className="h-3.5 w-3.5" /> Assumir
                </button>
              </form>
            </div>
          ))}

          {pendentes.length === 0 && (
            <div className="px-5 py-10 text-center">
              <p className="text-sm text-zinc-500">Nenhum cliente na fila agora.</p>
              {/* Explica o silêncio: sem isto, quem está ocupado acha que o
                  sistema parou de avisar. */}
              {!livre && (
                <p className="mt-2 text-[12px] text-zinc-400 max-w-md mx-auto">
                  Você está em atendimento — novos pedidos vão para quem está livre.
                  Encerre o atendimento abaixo para voltar a receber.
                </p>
              )}
              {livre && meusSetores.length > 0 && (
                <p className="mt-2 text-[12px] text-zinc-400">
                  Você recebe pedidos dos setores que atende.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Meus atendimentos em andamento ────────────────────────────────── */}
      <div className={card}>
        <div className="px-5 py-4 border-b border-zinc-100 flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-zinc-400" />
          <span className="font-semibold text-sm text-zinc-800">Meus atendimentos</span>
        </div>
        <div className="divide-y divide-zinc-50">
          {minhas.map(({ conv, sectorName }) => (
            <div key={conv.id} className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Link href={`/whatsapp?c=${conv.id}`} className="text-[13px] font-semibold text-zinc-800 hover:text-brand-700 transition-colors">
                    {conv.contactName}
                  </Link>
                  {sectorName && (
                    <span className="rounded-full bg-zinc-100 text-zinc-600 text-[10.5px] font-semibold px-2 py-0.5">
                      {sectorName}
                    </span>
                  )}
                </div>
                <div className="text-xs text-zinc-400 mt-0.5 truncate max-w-md">
                  {conv.lastMessagePreview ?? "—"} · {relTime(conv.lastMessageAt)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link href={`/whatsapp?c=${conv.id}`}
                  className="rounded-xl border border-zinc-200 text-zinc-600 text-[12.5px] font-medium px-3.5 py-2 hover:bg-zinc-50 transition-colors">
                  Abrir conversa
                </Link>
                <form action={finishServiceForm.bind(null, conv.id)}>
                  <button className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 text-white text-[12.5px] font-semibold px-3.5 py-2 hover:bg-emerald-700 transition-colors">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Encerrar
                  </button>
                </form>
              </div>
            </div>
          ))}
          {minhas.length === 0 && (
            <div className="px-5 py-8 text-center text-sm text-zinc-400">
              Você não está atendendo ninguém no momento.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
