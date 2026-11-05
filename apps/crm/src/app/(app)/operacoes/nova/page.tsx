import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/policy";
import { createServiceOrder } from "@/app/actions-ops";
import { card } from "@/components/ui";

export default async function NovaOSPage() {
  const user = await requireUser();
  if (!can(user.role, "view_ops") && !can(user.role, "view_installs")) redirect("/");

  const companies = await db.select().from(s.companies)
    .where(eq(s.companies.workspaceId, user.workspaceId)).orderBy(asc(s.companies.name));
  const techs = await db.select({ id: s.users.id, name: s.users.name })
    .from(s.users)
    .innerJoin(s.workspaceMembers, and(eq(s.workspaceMembers.userId, s.users.id), eq(s.workspaceMembers.workspaceId, user.workspaceId)))
    .where(inArray(s.workspaceMembers.role, ["installer", "manager", "admin", "owner"]));

  const input = "w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";
  const label = "block text-xs font-medium text-zinc-500 mb-1";

  return (
    <div className="p-4 md:p-8 max-w-xl">
      <Link href="/operacoes" className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800 mb-4"><ArrowLeft className="h-4 w-4" /> Ordens de Serviço</Link>
      <h1 className="text-2xl font-bold text-zinc-900 tracking-tight mb-6">Nova ordem de serviço</h1>
      <form action={createServiceOrder} className={`space-y-4 ${card} p-6`}>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={label}>Tipo</label>
            <select name="kind" className={input} defaultValue="installation">
              <option value="installation">Instalação</option>
              <option value="maintenance">Manutenção</option>
              <option value="inspection">Inspeção</option>
              <option value="repair">Reparo</option>
              <option value="survey">Visita técnica</option>
            </select>
          </div>
          <div>
            <label className={label}>Prioridade</label>
            <select name="priority" className={input} defaultValue="normal">
              <option value="low">Baixa</option>
              <option value="normal">Normal</option>
              <option value="high">Alta</option>
              <option value="urgent">Urgente</option>
            </select>
          </div>
        </div>
        <div>
          <label className={label}>Descrição *</label>
          <input name="description" required placeholder="Ex.: Ajuste de armação + troca de lentes" className={input} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={label}>Cliente</label>
            <select name="companyId" className={input} defaultValue="">
              <option value="">—</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>Técnico responsável</label>
            <select name="technicianId" className={input} defaultValue="">
              <option value="">—</option>
              {techs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className={label}>Agendada para</label>
          <input name="scheduledAt" type="datetime-local" className={input} />
        </div>
        <div>
          <label className={label}>Checklist (uma tarefa por linha)</label>
          <textarea name="checklist" rows={4} placeholder={"Separar itens do pedido\nConferir nota fiscal\nAgendar a entrega\nConfirmar recebimento"} className={input} />
        </div>
        <button className="rounded-xl bg-zinc-900 text-white text-[13px] font-semibold px-6 py-2.5 hover:bg-zinc-700 shadow-sm transition-colors">
          Abrir OS
        </button>
      </form>
    </div>
  );
}
