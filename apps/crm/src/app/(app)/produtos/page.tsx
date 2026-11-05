import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/policy";
import { brl } from "@/lib/format";
import { listarProdutos } from "@/lib/gestao";
import { PageHeader, Badge, card, Kpi } from "@/components/ui";
import { AvisoSimulado, brlCompacto } from "@/components/graficos";
import { Package, Layers, ShoppingBag } from "lucide-react";

const STATUS: Record<string, { rotulo: string; tom: "green" | "amber" | "violet" }> = {
  confirmado: { rotulo: "Confirmado", tom: "green" },
  pendente_confirmacao: { rotulo: "Pendente de confirmação", tom: "amber" },
  simulado: { rotulo: "Produto de teste", tom: "violet" },
};

/** Catálogo por categoria, com vendas e cotações simuladas de cada SKU. */
export default async function ProdutosPage() {
  const user = await requireUser();
  if (!can(user.role, "view_pipeline")) redirect("/conta/senha");
  const produtos = await listarProdutos(user.workspaceId);
  const porCategoria = new Map<string, typeof produtos>();
  for (const p of produtos) porCategoria.set(p.categoria, [...(porCategoria.get(p.categoria) ?? []), p]);
  const totalVendido = produtos.reduce((a, p) => a + p.valorVendido, 0);
  const confirmados = produtos.filter((p) => p.status === "confirmado").length;

  return (
    <div className="p-4 md:p-8 max-w-[1300px] mx-auto space-y-5">
      <PageHeader module="Vendas" title="Produtos" subtitle="Catálogo por categoria, com situação de validação, vendas e cotações simuladas de cada SKU." />
      <AvisoSimulado>
        Nenhum produto real da Lovet foi confirmado ainda: os {produtos.length} SKUs abaixo são <b>produtos de teste</b> (&quot;NÃO COMERCIALIZAR&quot;), com preços fictícios.
        A associação a fabricantes parceiros é hipotética.
      </AvisoSimulado>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="SKUs no catálogo" value={String(produtos.length)} sub={`${confirmados} confirmados`} Icon={Package} tint="bg-emerald-50 text-emerald-700" />
        <Kpi label="Categorias" value={String(porCategoria.size)} Icon={Layers} tint="bg-zinc-100 text-zinc-700" />
        <Kpi label="Vendido (simulado)" value={brlCompacto(totalVendido)} Icon={ShoppingBag} tint="bg-amber-50 text-amber-700" />
        <Kpi label="Cotações com itens" value={produtos.reduce((a, p) => a + p.vezesCotado, 0).toLocaleString("pt-BR")} sub="linhas de cotação" Icon={Layers} tint="bg-sky-50 text-sky-700" />
      </div>

      {[...porCategoria.entries()].map(([cat, lista]) => {
        const valorCat = lista.reduce((a, p) => a + p.valorVendido, 0);
        return (
          <section key={cat} className={`${card} overflow-x-auto`}>
            <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-zinc-800">{cat} <span className="ml-1 text-zinc-400 font-normal">{lista.length} SKUs</span></h2>
              <span className="text-xs text-zinc-500">Vendido: <b className="text-zinc-800 tabular-nums">{brlCompacto(valorCat)}</b> ({totalVendido ? ((valorCat / totalVendido) * 100).toFixed(1).replace(".", ",") : "0"}%)</span>
            </div>
            <table className="w-full text-[13px]">
              <thead className="text-left text-[11px] uppercase tracking-wide text-zinc-400">
                <tr><th className="px-5 py-2.5 font-semibold">SKU</th><th className="px-3 py-2.5 font-semibold">Subcategoria</th><th className="px-3 py-2.5 font-semibold">Marca / fabricante</th>
                  <th className="px-3 py-2.5 font-semibold">Espécie</th><th className="px-3 py-2.5 font-semibold">Embalagem</th><th className="px-3 py-2.5 text-right font-semibold">Preço (fictício)</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Vendido</th><th className="px-3 py-2.5 text-right font-semibold">Cotado</th><th className="px-5 py-2.5 font-semibold">Situação</th></tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {lista.map((p) => (
                  <tr key={p.id} className="hover:bg-brand-50/30 transition-colors">
                    <td className="px-5 py-2.5"><div className="font-semibold text-zinc-800 tabular-nums">{p.sku}</div><div className="text-[11px] text-zinc-400 max-w-[300px] truncate" title={p.nome}>{p.nome}</div></td>
                    <td className="px-3 py-2.5 text-zinc-500">{p.subcategoria ?? "—"}</td>
                    <td className="px-3 py-2.5 text-zinc-600">{p.marca ?? "—"}<div className="text-[11px] text-zinc-400">{p.fabricante ?? ""}</div></td>
                    <td className="px-3 py-2.5 text-zinc-500">{p.especie ?? "—"}</td><td className="px-3 py-2.5 text-zinc-500">{p.embalagem ?? "—"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">{brl(p.preco)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap"><div className="font-semibold">{brlCompacto(p.valorVendido)}</div><div className="text-[11px] text-zinc-400">{p.qtdVendida.toLocaleString("pt-BR")} un.</div></td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-zinc-500">{p.vezesCotado.toLocaleString("pt-BR")}×</td>
                    <td className="px-5 py-2.5"><Badge tone={STATUS[p.status]?.tom ?? "zinc"}>{STATUS[p.status]?.rotulo ?? p.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}
