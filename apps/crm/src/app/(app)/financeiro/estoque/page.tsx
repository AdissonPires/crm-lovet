import { redirect } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { Package, AlertTriangle, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { db, schema as s } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/policy";
import { brl, relTime } from "@/lib/format";
import { PageHeader, Kpi, Badge, SectionCard, EmptyState, card } from "@/components/ui";

export default async function EstoquePage() {
  const user = await requireUser();
  if (!can(user.role, "view_financials")) redirect("/");

  const items = await db.select().from(s.inventoryItems)
    .where(eq(s.inventoryItems.workspaceId, user.workspaceId))
    .orderBy(asc(s.inventoryItems.name));
  const moves = await db.select({ m: s.stockMovements, itemName: s.inventoryItems.name, userName: s.users.name })
    .from(s.stockMovements)
    .leftJoin(s.inventoryItems, eq(s.inventoryItems.id, s.stockMovements.itemId))
    .leftJoin(s.users, eq(s.users.id, s.stockMovements.createdBy))
    .where(eq(s.stockMovements.workspaceId, user.workspaceId))
    .orderBy(desc(s.stockMovements.createdAt)).limit(10);

  const totalValue = items.reduce((a, i) => a + i.quantity * parseFloat(i.unitCost ?? "0"), 0);
  const lowStock = items.filter((i) => i.quantity < i.minStock);

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-[1400px]">
      <PageHeader module="Financeiro" title="Estoque / Inventário"
        subtitle="Controle de equipamentos e materiais. Baixa automática ao vincular a uma instalação." />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <Kpi label="Itens em catálogo" value={String(items.length)} Icon={Package} tint="bg-sky-50 text-sky-600" />
        <Kpi label="Valor imobilizado" value={brl(totalValue)} sub="a custo" />
        <Kpi label="Abaixo do mínimo" value={String(lowStock.length)} sub="itens para repor" Icon={AlertTriangle} tint="bg-brand-50 text-brand-600" />
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <div className={`${card} lg:col-span-2 overflow-hidden`}>
          <div className="px-5 py-4 border-b border-zinc-100 font-semibold text-sm text-zinc-800">Itens</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-zinc-400 border-b border-zinc-100">
                <th className="px-5 py-2.5 font-semibold">Item</th>
                <th className="px-3 py-2.5 font-semibold">Local</th>
                <th className="px-3 py-2.5 font-semibold text-right">Qtd</th>
                <th className="px-3 py-2.5 font-semibold text-right">Mín</th>
                <th className="px-5 py-2.5 font-semibold text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {items.map((i) => {
                const low = i.quantity < i.minStock;
                return (
                  <tr key={i.id} className="hover:bg-zinc-50/60">
                    <td className="px-5 py-3">
                      <div className="font-medium text-zinc-800">{i.name}</div>
                      <div className="text-xs text-zinc-400 font-mono">{i.sku}</div>
                    </td>
                    <td className="px-3 py-3 text-zinc-500 text-[13px]">{i.location ?? "—"}</td>
                    <td className={`px-3 py-3 text-right font-semibold tabular-nums ${low ? "text-brand-600" : "text-zinc-900"}`}>{i.quantity}</td>
                    <td className="px-3 py-3 text-right text-zinc-400 tabular-nums">{i.minStock}</td>
                    <td className="px-5 py-3 text-right">{low ? <Badge tone="amber">Repor</Badge> : <Badge tone="green">OK</Badge>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {items.length === 0 && <EmptyState title="Estoque vazio." />}
        </div>

        <SectionCard title="Movimentações recentes">
          <div className="divide-y divide-zinc-50">
            {moves.map(({ m, itemName, userName }) => (
              <div key={m.id} className="px-5 py-3 flex gap-3">
                <div className={`mt-0.5 h-6 w-6 shrink-0 rounded-md flex items-center justify-center ${m.kind === "in" ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"}`}>
                  {m.kind === "in" ? <ArrowDownLeft className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
                </div>
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-zinc-800">
                    {m.kind === "in" ? "+" : "−"}{m.quantity} · {itemName}
                  </div>
                  <div className="text-xs text-zinc-400">{m.reason} · {userName?.split(" ")[0]} · {relTime(m.createdAt)}</div>
                </div>
              </div>
            ))}
            {moves.length === 0 && <EmptyState title="Sem movimentações." />}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
