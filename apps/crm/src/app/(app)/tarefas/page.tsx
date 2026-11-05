import { asc, eq } from "drizzle-orm";
import { Car, Check, CheckSquare, Mail, Phone, Sparkles, Users } from "lucide-react";
import { db, schema as s } from "@/db";
import { requireUser } from "@/lib/auth";
import { createTask, toggleTask } from "@/app/actions";
import { relTime } from "@/lib/format";

export default async function TarefasPage() {
  const user = await requireUser();

  const rows = await db.select({
    task: s.tasks,
    assigneeName: s.users.name,
  }).from(s.tasks)
    .leftJoin(s.users, eq(s.users.id, s.tasks.assigneeId))
    .where(eq(s.tasks.workspaceId, user.workspaceId))
    .orderBy(asc(s.tasks.dueAt));

  const open = rows.filter((r) => !r.task.completedAt);
  const done = rows.filter((r) => r.task.completedAt);

  const typeIcon: Record<string, React.ReactNode> = {
    call: <Phone className="h-3.5 w-3.5" />,
    email: <Mail className="h-3.5 w-3.5" />,
    meeting: <Users className="h-3.5 w-3.5" />,
    visit: <Car className="h-3.5 w-3.5" />,
    todo: <CheckSquare className="h-3.5 w-3.5" />,
  };

  function TaskRow({ r }: { r: (typeof rows)[number] }) {
    const overdue = !r.task.completedAt && r.task.dueAt && new Date(r.task.dueAt) < new Date();
    return (
      <div className="flex items-center gap-3.5 px-5 py-3.5">
        <form action={toggleTask.bind(null, r.task.id)}>
          <button className={`h-5 w-5 rounded-md border-2 flex items-center justify-center transition-all ${
            r.task.completedAt
              ? "bg-emerald-500 border-emerald-500 text-white"
              : "border-zinc-300 hover:border-emerald-400 bg-white"
          }`}>
            {r.task.completedAt && <Check className="h-3 w-3" strokeWidth={3} />}
          </button>
        </form>
        <div className="h-7 w-7 rounded-lg bg-zinc-100 text-zinc-500 flex items-center justify-center shrink-0">
          {typeIcon[r.task.type]}
        </div>
        <div className="flex-1 min-w-0">
          <div className={`text-[13px] font-medium ${r.task.completedAt ? "line-through text-zinc-400" : "text-zinc-800"}`}>
            {r.task.createdByAgent && (
              <span className="inline-flex items-center gap-1 text-[10px] rounded-md bg-violet-100 text-violet-700 px-1.5 py-0.5 mr-1.5 font-semibold align-middle">
                <Sparkles className="h-2.5 w-2.5" /> IA
              </span>
            )}
            {r.task.title.replace(/^\[IA\]\s*/, "")}
          </div>
          <div className="text-xs text-zinc-400 mt-0.5">{r.assigneeName}</div>
        </div>
        <div className={`text-xs font-medium tabular-nums ${overdue ? "text-red-600" : "text-zinc-400"}`}>
          {r.task.dueAt ? relTime(r.task.dueAt) : ""}
        </div>
      </div>
    );
  }

  const inputCls = "rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

  return (
    <div className="p-4 md:p-8 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">Tarefas</h1>
        <p className="text-sm text-zinc-500 mt-0.5">{open.length} abertas · {done.length} concluídas</p>
      </div>

      {/* Celular: o título vai pra linha de cima (largura toda) e tipo/data/botão ficam embaixo. */}
      <form action={createTask} className="flex flex-wrap gap-2 mb-6">
        <select name="type" className={inputCls}>
          <option value="todo">Tarefa</option>
          <option value="call">Ligação</option>
          <option value="email">E-mail</option>
          <option value="meeting">Reunião</option>
          <option value="visit">Visita</option>
        </select>
        <input name="title" required placeholder="Nova tarefa…" className={`flex-1 min-w-0 max-sm:basis-full max-sm:order-first ${inputCls}`} />
        <input name="dueAt" type="date" className={inputCls} />
        <button className="rounded-xl bg-zinc-900 text-white text-[13px] font-semibold px-5 py-2 hover:bg-zinc-700 transition-colors max-sm:flex-1">
          Criar
        </button>
      </form>

      <div className="rounded-2xl bg-white border border-zinc-100 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-14px_rgba(0,0,0,0.12)] divide-y divide-zinc-50">
        {open.map((r) => <TaskRow key={r.task.id} r={r} />)}
        {open.length === 0 && <div className="px-5 py-10 text-center text-sm text-zinc-400">Tudo em dia.</div>}
      </div>

      {done.length > 0 && (
        <div className="mt-5 rounded-2xl bg-white border border-zinc-100 divide-y divide-zinc-50 opacity-60">
          {done.map((r) => <TaskRow key={r.task.id} r={r} />)}
        </div>
      )}
    </div>
  );
}
