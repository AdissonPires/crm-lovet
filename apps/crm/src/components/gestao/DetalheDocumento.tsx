import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { brl, dateBR } from "@/lib/format";
import { card, Badge } from "@/components/ui";
import { AvisoSimulado } from "@/components/graficos";
import { COTACAO_STATUS, PEDIDO_STATUS, type ItemDoc } from "@/lib/gestao";

type Doc = NonNullable<Awaited<ReturnType<typeof import("@/lib/gestao").detalheDocumento>>>;

const Campo = ({ r, v }: { r: string; v: React.ReactNode }) => (
  <div><div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">{r}</div><div className="mt-0.5 text-sm text-zinc-800">{v ?? "—"}</div></div>
);

export function DetalheDocumento({ tipo, d }: { tipo: "pedido" | "cotacao"; d: Doc }) {
  const { doc, itens } = d;
  const lista = tipo === "pedido" ? "/pedidos" : "/cotacoes";
  const statusMap = tipo === "pedido" ? PEDIDO_STATUS : COTACAO_STATUS;
  const unidades = itens.reduce((a: number, i: ItemDoc) => a + i.qtd, 0);
  return (
    <div className="p-4 md:p-8 max-w-[1100px] mx-auto space-y-5">
      <Link href={lista} className="inline-flex items-center gap-1.5 text-[13px] text-zinc-500 hover:text-zinc-800"><ArrowLeft className="h-4 w-4" /> Voltar para {tipo === "pedido" ? "pedidos" : "cotações"}</Link>
      <div>
        <div className="text-[11px] font-bold uppercase tracking-wider text-brand-500">{tipo === "pedido" ? "Pedido" : "Cotação"}</div>
        <h1 className="text-2xl font-bold text-zinc-900 tracking-tight tabular-nums flex items-center gap-3">{doc.numero} <Badge tone={doc.status === "entregue" || doc.status === "aprovada" ? "green" : doc.status === "cancelado" || doc.status === "recusada" ? "red" : "blue"}>{statusMap[doc.status] ?? doc.status}</Badge></h1>
      </div>
      <AvisoSimulado>Todos os valores e itens são fictícios; os produtos são de teste.</AvisoSimulado>

      <section className={`${card} p-5 grid grid-cols-2 md:grid-cols-4 gap-5`}>
        <Campo r="Cliente" v={<Link href={`/empresas/${doc.clienteId}`} className="font-semibold hover:text-brand-700">{doc.cliente}</Link>} />
        <Campo r="Região" v={doc.regiao} />
        <Campo r="Vendedor" v={doc.vendedor?.replace("[SIMULADO] ", "")} />
        <Campo r="Contato" v={doc.contato} />
        <Campo r={tipo === "pedido" ? "Data do pedido" : "Emitida em"} v={dateBR(doc.data)} />
        {tipo === "pedido" ? <Campo r="Entrega" v={doc.entrega ? dateBR(doc.entrega) : "Não entregue"} /> : <Campo r="Validade" v={doc.validade ? dateBR(doc.validade) : null} />}
        {tipo === "pedido" ? <Campo r="Origem" v={doc.canal === "cotacao" ? "Cotação aprovada" : "Recompra direta"} /> : <Campo r="Versão" v={`v${doc.versao}`} />}
        {tipo === "pedido"
          ? <Campo r="Cotação de origem" v={doc.cotacaoNumero ?? "— (compra direta)"} />
          : <Campo r="Decidida em" v={doc.decidida ? dateBR(doc.decidida) : "Em aberto"} />}
        {doc.oppId && <Campo r="Oportunidade" v={<Link href={`/oportunidades/${doc.oppId}`} className="hover:text-brand-700">{doc.oppNome}</Link>} />}
      </section>

      <section className={`${card} overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead className="bg-zinc-50/80 text-left text-[11px] uppercase tracking-wide text-zinc-400">
            <tr><th className="px-5 py-3 font-semibold">Item</th><th className="px-3 py-3 font-semibold">Categoria</th><th className="px-3 py-3 text-right font-semibold">Qtd.</th>
              <th className="px-3 py-3 text-right font-semibold">Preço (fictício)</th><th className="px-3 py-3 text-right font-semibold">Desc.</th><th className="px-5 py-3 text-right font-semibold">Total</th></tr>
          </thead>
          <tbody className="divide-y divide-zinc-50">
            {itens.map((i: ItemDoc) => (
              <tr key={i.sku}>
                <td className="px-5 py-3"><div className="font-semibold text-zinc-800 tabular-nums">{i.sku}</div><div className="text-[11.5px] text-zinc-400 max-w-[420px] truncate" title={i.nome}>{i.nome}</div></td>
                <td className="px-3 py-3 text-zinc-500 text-[13px]">{i.categoria}</td>
                <td className="px-3 py-3 text-right tabular-nums">{i.qtd}</td>
                <td className="px-3 py-3 text-right tabular-nums">{brl(i.unitario)}</td>
                <td className="px-3 py-3 text-right tabular-nums text-zinc-500">{i.desconto.toFixed(1).replace(".", ",")}%</td>
                <td className="px-5 py-3 text-right font-semibold tabular-nums">{brl(i.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="text-sm">
            <tr className="border-t border-zinc-100"><td colSpan={5} className="px-5 py-2 text-right text-zinc-500">Subtotal ({itens.length} itens · {unidades} un.)</td><td className="px-5 py-2 text-right tabular-nums">{brl(doc.subtotal)}</td></tr>
            <tr><td colSpan={5} className="px-5 py-2 text-right text-zinc-500">Descontos</td><td className="px-5 py-2 text-right tabular-nums text-red-700">− {brl(doc.desconto)}</td></tr>
            <tr className="bg-zinc-50/60"><td colSpan={5} className="px-5 py-3 text-right font-semibold text-zinc-800">Total</td><td className="px-5 py-3 text-right text-base font-bold tabular-nums">{brl(doc.total)}</td></tr>
          </tfoot>
        </table>
      </section>
      {doc.notas && <p className="text-xs text-zinc-400">{doc.notas}</p>}
    </div>
  );
}
