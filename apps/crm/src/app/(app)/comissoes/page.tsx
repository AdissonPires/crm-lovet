import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { Percent } from "lucide-react";
import { db, schema as s } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/policy";
import { brl } from "@/lib/format";
import { PageHeader, Kpi, Badge, EmptyState, card } from "@/components/ui";
import { setCommissionStatus } from "@/app/actions-sales";

const statusTone: Record<string, "green" | "amber" | "blue" | "zinc"> = { paid: "green", approved: "blue", pending: "amber", canceled: "zinc" };
const statusLabel: Record<string, string> = { paid: "Paga", approved: "Aprovada", pending: "Pendente", canceled: "Cancelada" };

export default async function ComissoesPage() {
  const user = await requireUser();
  if (!can(user.role, "view_pipeline")) redirect("/");
  const isManager = ["owner", "admin", "admin2", "manager"].includes(user.role);

  const rows = await db.select({ c: s.commissions, oppName: s.opportunities.name, repName: s.users.name })
    .from(s.commissions)
    .leftJoin(s.opportunities, eq(s.opportunities.id, s.commissions.opportunityId))
    .leftJoin(s.users, eq(s.users.id, s.commissions.userId))
    .where(eq(s.commissions.workspaceId, user.workspaceId))
    .orderBy(desc(s.commissions.createdAt));

  const visible = isManager ? rows : rows.filter((r) => r.c.userId === user.id);
  const pending = visible.filter((r) => r.c.status === "pending" || r.c.status === "approved");
  const totalPending = pending.reduce((a, r) => a + parseFloat(r.c.amount), 0);
  const totalPaid = visible.filter((r) => r.c.status === "paid").reduce((a, r) => a + parseFloat(r.c.amount), 0);

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-[1300px]">
      <PageHeader module="Vendas" title="Comissões"
        subtitle={isManager ? "Comissões por venda fechada. Aprove e libere o pagamento — reflete na folha." : "Suas comissões por venda fechada."} />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <Kpi label="A pagar" value={brl(totalPending)} sub={`${pending.length} comissões`} Icon={Percent} tint="bg-brand-50 text-brand-600" />
        <Kpi label="Pagas" value={brl(totalPaid)} tint="bg-emerald-50 text-emerald-600" />
        <Kpi label="Taxa média" value="3,0%" sub="sobre valor do contrato" />
      </div>

      <div className={`${card} overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-zinc-400 border-b border-zinc-100">
              <th className="px-5 py-3 font-semibold">Negócio</th>
              {isManager && <th className="px-3 py-3 font-semibold">Vendedor</th>}
              <th className="px-3 py-3 font-semibold text-right">Base</th>
              <th className="px-3 py-3 font-semibold text-right">Taxa</th>
              <th className="px-3 py-3 font-semibold text-right">Comissão</th>
              <th className="px-3 py-3 font-semibold">Status</th>
              {isManager && <th className="px-5 py-3 font-semibold text-right">Ação</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-50">
            {visible.map(({ c, oppName, repName }) => (
              <tr key={c.id} className="hover:bg-zinc-50/60">
                <td className="px-5 py-3 font-medium text-zinc-800">{oppName}</td>
                {isManager && <td className="px-3 py-3 text-zinc-500 text-[13px]">{repName}</td>}
                <td className="px-3 py-3 text-right text-zinc-600 tabular-nums">{brl(c.baseAmount)}</td>
                <td className="px-3 py-3 text-right text-zinc-500 tabular-nums">{parseFloat(c.ratePct).toFixed(1)}%</td>
                <td className="px-3 py-3 text-right font-semibold text-zinc-900 tabular-nums">{brl(c.amount)}</td>
                <td className="px-3 py-3"><Badge tone={statusTone[c.status]}>{statusLabel[c.status]}</Badge></td>
                {isManager && (
                  <td className="px-5 py-3 text-right">
                    {c.status === "pending" && (
                      <form action={setCommissionStatus.bind(null, c.id, "approved")}>
                        <button className="rounded-lg bg-sky-600 text-white text-xs font-semibold px-3 py-1.5 hover:bg-sky-500 transition-colors">Aprovar</button>
                      </form>
                    )}
                    {c.status === "approved" && (
                      <form action={setCommissionStatus.bind(null, c.id, "paid")}>
                        <button className="rounded-lg bg-emerald-600 text-white text-xs font-semibold px-3 py-1.5 hover:bg-emerald-500 transition-colors">Pagar</button>
                      </form>
                    )}
                    {c.status === "paid" && <span className="text-xs text-zinc-400">✓ liberada</span>}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && <EmptyState title="Nenhuma comissão registrada." hint="Comissões são geradas ao fechar uma venda." />}
      </div>
    </div>
  );
}
