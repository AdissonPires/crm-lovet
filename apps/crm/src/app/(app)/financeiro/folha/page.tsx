import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { FileText } from "lucide-react";
import { db, schema as s } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/policy";
import { brl } from "@/lib/format";
import { PageHeader, Kpi, Badge, EmptyState, card } from "@/components/ui";

const statusTone: Record<string, "green" | "amber" | "blue"> = { paid: "green", approved: "blue", draft: "amber" };
const statusLabel: Record<string, string> = { paid: "Paga", approved: "Aprovada", draft: "Rascunho" };

export default async function FolhaPage() {
  const user = await requireUser();
  if (!can(user.role, "view_financials")) redirect("/");

  const rows = await db.select({ p: s.payrollEntries, userName: s.users.name })
    .from(s.payrollEntries)
    .leftJoin(s.users, eq(s.users.id, s.payrollEntries.userId))
    .where(eq(s.payrollEntries.workspaceId, user.workspaceId))
    .orderBy(desc(s.payrollEntries.referenceMonth));

  const month = rows[0]?.p.referenceMonth ?? "—";
  const totalNet = rows.reduce((a, x) => a + parseFloat(x.p.netPay), 0);
  const totalComm = rows.reduce((a, x) => a + parseFloat(x.p.commissionTotal), 0);
  const [y, m] = month.split("-");
  const monthName = month !== "—" ? new Date(Number(y), Number(m) - 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" }) : "—";

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-[1300px]">
      <PageHeader module="Financeiro · RH" title="Folha de Pagamento"
        subtitle={`Competência ${monthName}. Comissões de vendas integradas automaticamente ao salário.`} />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <Kpi label="Total líquido da folha" value={brl(totalNet)} sub={`${rows.length} colaboradores`} Icon={FileText} tint="bg-violet-50 text-violet-600" />
        <Kpi label="Comissões incluídas" value={brl(totalComm)} tint="bg-emerald-50 text-emerald-600" />
        <Kpi label="Competência" value={monthName} />
      </div>

      <div className={`${card} overflow-hidden`}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-zinc-400 border-b border-zinc-100">
              <th className="px-5 py-3 font-semibold">Colaborador</th>
              <th className="px-3 py-3 font-semibold text-right">Salário base</th>
              <th className="px-3 py-3 font-semibold text-right">Comissão</th>
              <th className="px-3 py-3 font-semibold text-right">Benefícios</th>
              <th className="px-3 py-3 font-semibold text-right">Descontos</th>
              <th className="px-3 py-3 font-semibold text-right">Líquido</th>
              <th className="px-5 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-50">
            {rows.map(({ p, userName }) => (
              <tr key={p.id} className="hover:bg-zinc-50/60">
                <td className="px-5 py-3 font-medium text-zinc-800">{userName}</td>
                <td className="px-3 py-3 text-right text-zinc-600 tabular-nums">{brl(p.baseSalary)}</td>
                <td className="px-3 py-3 text-right text-emerald-700 tabular-nums">{parseFloat(p.commissionTotal) > 0 ? brl(p.commissionTotal) : "—"}</td>
                <td className="px-3 py-3 text-right text-zinc-600 tabular-nums">{brl(p.benefits)}</td>
                <td className="px-3 py-3 text-right text-red-600 tabular-nums">−{brl(p.deductions)}</td>
                <td className="px-3 py-3 text-right font-semibold text-zinc-900 tabular-nums">{brl(p.netPay)}</td>
                <td className="px-5 py-3"><Badge tone={statusTone[p.status]}>{statusLabel[p.status]}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <EmptyState title="Folha não gerada." />}
      </div>
    </div>
  );
}
