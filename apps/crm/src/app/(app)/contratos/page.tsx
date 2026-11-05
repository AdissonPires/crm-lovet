import { redirect } from "next/navigation";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { FileSignature, PenLine } from "lucide-react";
import { db, schema as s } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/policy";
import { brl, dateBR } from "@/lib/format";
import { PageHeader, Kpi, Badge, EmptyState, card } from "@/components/ui";
import { signContract } from "@/app/actions-contratos";

const statusTone: Record<string, "green" | "amber" | "blue" | "zinc"> = { signed: "green", sent: "blue", draft: "amber", canceled: "zinc" };
const statusLabel: Record<string, string> = { signed: "Assinado", sent: "Enviado", draft: "Rascunho", canceled: "Cancelado" };

const LIMITE_LISTA = 100;

export default async function ContratosPage() {
  const user = await requireUser();
  if (!can(user.role, "view_pipeline")) redirect("/");

  const rows = await db.select({ c: s.contracts, oppName: s.opportunities.name, oppId: s.opportunities.id, companyName: s.companies.name })
    .from(s.contracts)
    .leftJoin(s.opportunities, eq(s.opportunities.id, s.contracts.opportunityId))
    .leftJoin(s.companies, eq(s.companies.id, s.opportunities.companyId))
    .where(eq(s.contracts.workspaceId, user.workspaceId))
    .orderBy(desc(s.contracts.createdAt));

  const signed = rows.filter((r) => r.c.status === "signed");
  const totalSigned = signed.reduce((a, r) => a + parseFloat(r.c.value), 0);
  const pending = rows.filter((r) => r.c.status === "sent");
  const podeAssinar = can(user.role, "manage_records");

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-[1300px]">
      <PageHeader module="Vendas" title="Contratos"
        subtitle="Geração e assinatura de contratos. Ao assinar, o contrato fica registrado como fechado." />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <Kpi label="Contratos assinados" value={String(signed.length)} sub={brl(totalSigned)} Icon={FileSignature} tint="bg-emerald-50 text-emerald-600" />
        <Kpi label="Aguardando assinatura" value={String(pending.length)} tint="bg-sky-50 text-sky-600" />
        <Kpi label="Ticket médio" value={brl(signed.length ? totalSigned / signed.length : 0)} />
      </div>

      <div className={`${card} overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-zinc-400 border-b border-zinc-100">
              <th className="px-5 py-3 font-semibold">Contrato</th>
              <th className="px-3 py-3 font-semibold">Cliente</th>
              <th className="px-3 py-3 font-semibold">Condições</th>
              <th className="px-3 py-3 font-semibold text-right">Valor</th>
              <th className="px-3 py-3 font-semibold">Assinatura</th>
              <th className="px-3 py-3 font-semibold">Status</th>
              <th className="px-5 py-3 font-semibold text-right">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-50">
            {rows.slice(0, LIMITE_LISTA).map(({ c, oppId, companyName, oppName }) => {
              const podeAssinarEste = podeAssinar && c.status !== "signed" && c.status !== "canceled";
              return (
                <tr key={c.id} className="hover:bg-zinc-50/60">
                  <td className="px-5 py-3">
                    <Link href={`/oportunidades/${oppId}`} className="font-semibold text-zinc-800 hover:text-brand-600 tabular-nums">{c.number}</Link>
                  </td>
                  <td className="px-3 py-3 text-zinc-600 text-[13px]">{companyName ?? oppName}</td>
                  <td className="px-3 py-3 text-zinc-500 text-[13px]">{c.paymentTerms ?? "—"}</td>
                  <td className="px-3 py-3 text-right font-semibold text-zinc-900 tabular-nums">{brl(c.value)}</td>
                  <td className="px-3 py-3 text-zinc-500 text-[13px] tabular-nums">{c.signedAt ? dateBR(c.signedAt) : "—"}</td>
                  <td className="px-3 py-3"><Badge tone={statusTone[c.status]}>{statusLabel[c.status]}</Badge></td>
                  <td className="px-5 py-3 text-right">
                    {podeAssinarEste ? (
                      <form action={signContract.bind(null, c.id)}>
                        <button className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 text-white text-xs font-semibold px-3 py-1.5 hover:bg-zinc-700 transition-colors">
                          <PenLine className="h-3.5 w-3.5" /> Assinar
                        </button>
                      </form>
                    ) : (
                      <span className="text-xs text-zinc-400">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <EmptyState title="Nenhum contrato." />}
        {rows.length > LIMITE_LISTA && <div className="px-5 py-3 text-center text-xs text-zinc-400 border-t border-zinc-50">Mostrando os {LIMITE_LISTA} mais recentes de {rows.length} contratos.</div>}
      </div>

    </div>
  );
}
