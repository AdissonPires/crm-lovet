import { and, desc, eq, ne } from "drizzle-orm";
import { MessageSquareHeart, Send } from "lucide-react";
import { db, schema as s } from "@/db";
import { requireUser } from "@/lib/auth";
import { relTime } from "@/lib/format";
import { sendFeedback, markFeedbackRead } from "@/app/actions-feedback";
import { idsMembrosDaPlataforma } from "@/lib/colaboradores";

// Feedback direto entre colegas, sem passar por RH ou gerente — qualquer
// colaborador pode mandar pra qualquer outro do mesmo workspace.
export default async function FeedbackPage() {
  const user = await requireUser();
  const card = "rounded-2xl bg-white border border-zinc-100 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-14px_rgba(0,0,0,0.12)]";

  const naPlataforma = await idsMembrosDaPlataforma(user.workspaceId);
  const colleagues = (await db.select({ userId: s.workspaceMembers.userId, name: s.users.name })
    .from(s.workspaceMembers)
    .innerJoin(s.users, eq(s.users.id, s.workspaceMembers.userId))
    .where(and(eq(s.workspaceMembers.workspaceId, user.workspaceId), ne(s.workspaceMembers.userId, user.id)))
    .orderBy(s.users.name))
    .filter((c) => naPlataforma.has(c.userId));

  const received = await db.select({ fb: s.feedbackMessages, fromName: s.users.name })
    .from(s.feedbackMessages)
    .innerJoin(s.users, eq(s.users.id, s.feedbackMessages.fromUserId))
    .where(and(eq(s.feedbackMessages.workspaceId, user.workspaceId), eq(s.feedbackMessages.toUserId, user.id)))
    .orderBy(desc(s.feedbackMessages.createdAt));

  const unreadCount = received.filter((r) => !r.fb.readAt).length;

  return (
    <div className="p-4 md:p-8 max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">Feedback</h1>
        <p className="text-sm text-zinc-500 mt-0.5">
          Mande um feedback direto pra um colega — sem burocracia.
        </p>
      </div>

      <div className={`${card} p-6`}>
        <div className="text-sm font-semibold text-zinc-800 mb-4 flex items-center gap-2">
          <Send className="h-4 w-4 text-zinc-400" /> Enviar feedback
        </div>
        <form action={sendFeedback} className="space-y-3">
          <select name="toUserId" required
            className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100">
            <option value="">Selecione o colega…</option>
            {colleagues.map((c) => <option key={c.userId} value={c.userId}>{c.name}</option>)}
          </select>
          <textarea name="message" required rows={3} placeholder="O que você quer dizer pra essa pessoa?"
            className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
          <button type="submit"
            className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 text-white text-xs font-semibold px-4 py-2.5 hover:bg-zinc-800 transition-colors">
            <Send className="h-3.5 w-3.5" /> Enviar
          </button>
        </form>
      </div>

      <div className={card}>
        <div className="px-5 py-4 border-b border-zinc-100 flex items-center gap-2 font-semibold text-sm text-zinc-800">
          <MessageSquareHeart className="h-4 w-4 text-zinc-400" /> Recebidos
          {unreadCount > 0 && (
            <span className="h-5 min-w-[20px] px-1.5 rounded-full bg-brand-500 text-white text-[10px] font-bold flex items-center justify-center">
              {unreadCount} novo{unreadCount > 1 ? "s" : ""}
            </span>
          )}
        </div>
        {received.length === 0 && (
          <div className="p-8 text-center text-sm text-zinc-500">Você ainda não recebeu nenhum feedback.</div>
        )}
        <div className="divide-y divide-zinc-50">
          {received.map(({ fb, fromName }) => (
            <div key={fb.id} className={`px-5 py-4 flex items-start justify-between gap-4 ${!fb.readAt ? "bg-brand-50/40" : ""}`}>
              <div>
                <div className="text-sm font-semibold text-zinc-800">{fromName}</div>
                <p className="text-sm text-zinc-600 mt-1">{fb.message}</p>
                <div className="text-xs text-zinc-400 mt-1">{relTime(fb.createdAt)}</div>
              </div>
              {!fb.readAt && (
                <form action={markFeedbackRead.bind(null, fb.id)}>
                  <button type="submit"
                    className="shrink-0 text-xs font-semibold text-brand-700 hover:text-brand-800 transition-colors">
                    Marcar como lido
                  </button>
                </form>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

