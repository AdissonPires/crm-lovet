import { redirect } from "next/navigation";
import Link from "next/link";
import { BadgeDollarSign, ShoppingCart, Receipt, Users, Percent, Timer } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/policy";
import { brl } from "@/lib/format";
import { indicadores, periodoDe } from "@/lib/gestao";
import { PageHeader, Kpi, card } from "@/components/ui";
import { AvisoSimulado, BarrasHorizontais, brlCompacto, CardGrafico, ColunasMensais, Contagens, Rosca } from "@/components/graficos";

const nInt = (v: number) => v.toLocaleString("pt-BR");
const STATUS_COTACAO: Record<string, string> = { enviada: "Enviadas", aprovada: "Aprovadas", recusada: "Recusadas", expirada: "Expiradas", substituida: "Substituídas (revisão)" };

/**
 * Painel gerencial: faturamento, funil, carteira, produtos, representantes,
 * regiões, campanhas e atendimento do período escolhido.
 */
export default async function IndicadoresPage({ searchParams }: { searchParams: Promise<{ de?: string; ate?: string }> }) {
  const user = await requireUser();
  if (!can(user.role, "view_team_dashboard")) redirect("/");
  const sp = await searchParams;
  const per = periodoDe(sp);
  const d = await indicadores(user.workspaceId, per.deTs, per.ateTs);
  const atingimento = (() => {
    const meta = d.mensal.reduce((a, m) => a + m.meta, 0);
    const real = d.mensal.filter((m) => m.meta > 0).reduce((a, m) => a + m.valor, 0);
    return meta ? (real / meta) * 100 : null;
  })();

  return (
    <div className="p-4 md:p-8 max-w-[1400px] mx-auto space-y-6">
      <PageHeader module="Gestão" title="Indicadores comerciais" subtitle="Faturamento, funil, carteira, produtos, representantes e regiões do período." />
      <AvisoSimulado />

      <form method="get" className={`${card} p-4 flex flex-wrap items-end gap-3`}>
        <label className="text-xs font-semibold text-zinc-500">De
          <input type="date" name="de" defaultValue={per.de} className="mt-1 block rounded-xl border border-zinc-200 px-3 py-2 text-sm font-normal text-zinc-800" />
        </label>
        <label className="text-xs font-semibold text-zinc-500">Até
          <input type="date" name="ate" defaultValue={per.ate} className="mt-1 block rounded-xl border border-zinc-200 px-3 py-2 text-sm font-normal text-zinc-800" />
        </label>
        <button className="rounded-xl bg-zinc-900 text-white text-[13px] font-semibold px-5 py-2 hover:bg-zinc-700 transition-colors">Aplicar</button>
        <Link href="/indicadores" className="text-[13px] text-zinc-500 hover:text-zinc-800 px-2 py-2">Período padrão</Link>
      </form>

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <Kpi label="Faturamento simulado" value={brlCompacto(d.resumo.faturamento)} sub={brl(d.resumo.faturamento)} Icon={BadgeDollarSign} tint="bg-emerald-50 text-emerald-700" />
        <Kpi label="Pedidos" value={nInt(d.resumo.pedidos)} sub={`${nInt(d.resumo.cancelados)} cancelados · ${nInt(d.resumo.pedidosOcorrencia)} com ocorrência`} Icon={ShoppingCart} tint="bg-zinc-100 text-zinc-700" />
        <Kpi label="Ticket médio" value={brl(d.resumo.ticket)} Icon={Receipt} tint="bg-amber-50 text-amber-700" />
        <Kpi label="Clientes que compraram" value={nInt(d.resumo.clientes)} Icon={Users} tint="bg-sky-50 text-sky-700" />
        <Kpi label="Conversão do funil" value={d.funil.conversao == null ? "—" : `${d.funil.conversao.toFixed(1).replace(".", ",")}%`} sub={`${nInt(d.funil.ganha)} ganhas · ${nInt(d.funil.perdida)} perdidas`} Icon={Percent} tint="bg-violet-50 text-violet-700" />
        <Kpi label="Tempo médio de fechamento" value={d.funil.diasFechar == null ? "—" : `${d.funil.diasFechar.toFixed(1).replace(".", ",")} dias`} sub={atingimento == null ? undefined : `Meta atingida: ${atingimento.toFixed(1).replace(".", ",")}%`} Icon={Timer} tint="bg-rose-50 text-rose-700" />
      </div>

      <CardGrafico titulo="Faturamento por mês x meta" sub="Pedidos não cancelados; meta demonstrativa somada dos representantes de campo.">
        <ColunasMensais dados={d.mensal.map((m) => ({ mes: m.mes, valor: m.valor, meta: m.meta }))} />
      </CardGrafico>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <CardGrafico titulo="Vendas por região" sub="Faturamento e nº de clientes">
          <BarrasHorizontais sub dados={d.porRegiao.map((r) => ({ label: r.label, valor: r.valor, extra: `${nInt(r.extra ?? 0)} clientes` }))} />
        </CardGrafico>
        <CardGrafico titulo="Vendas por segmento" sub="Faturamento e nº de pedidos">
          <BarrasHorizontais sub cor="var(--chart-grafite)" dados={d.porSegmento.map((r) => ({ label: r.label, valor: r.valor, extra: `${nInt(r.extra ?? 0)} pedidos` }))} />
        </CardGrafico>
        <CardGrafico titulo="Categorias" sub="Participação no faturamento">
          <Rosca dados={d.porCategoria} />
        </CardGrafico>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <CardGrafico titulo="Desempenho por representante" sub="Faturamento, pedidos e equipe" className="lg:col-span-2">
          <BarrasHorizontais sub dados={d.porRepresentante.map((r) => ({ label: r.label.replace("[SIMULADO] ", ""), valor: r.valor, extra: `${r.equipe} · ${nInt(r.extra ?? 0)} pedidos` }))} />
        </CardGrafico>
        <CardGrafico titulo="Marcas" sub="Marcas fictícias do catálogo de teste">
          <Rosca dados={d.porMarca} />
        </CardGrafico>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <CardGrafico titulo="Funil de oportunidades" sub="Criadas no período">
          <ul className="space-y-3 text-[13px]">
            <li className="flex justify-between"><span className="text-zinc-600">Em aberto</span><b className="tabular-nums">{nInt(d.funil.aberta)} · {brlCompacto(d.funil.valorAberto)}</b></li>
            <li className="flex justify-between"><span className="text-zinc-600">Ganhas</span><b className="tabular-nums text-emerald-700">{nInt(d.funil.ganha)} · {brlCompacto(d.funil.valorGanho)}</b></li>
            <li className="flex justify-between"><span className="text-zinc-600">Perdidas</span><b className="tabular-nums text-red-700">{nInt(d.funil.perdida)}</b></li>
          </ul>
          <div className="mt-4 border-t border-zinc-100 pt-4"><div className="text-[11.5px] font-semibold text-zinc-500 mb-2">Cotações por situação</div>
            <Contagens dados={d.cotacoes.map((c) => ({ label: STATUS_COTACAO[c.label] ?? c.label, valor: c.valor }))} />
          </div>
        </CardGrafico>
        <CardGrafico titulo="Motivos de perda" sub="Oportunidades perdidas">
          <BarrasHorizontais cor="#e06666" formato={nInt} dados={d.perdas.map((x) => ({ label: x.label, valor: x.valor }))} />
        </CardGrafico>
        <CardGrafico titulo="Produtos mais vendidos" sub="Por valor (SKUs de teste)">
          <BarrasHorizontais sub cor="#f5a524" dados={d.topProdutos.map((p) => ({ label: p.label, valor: p.valor, extra: `${nInt(p.extra ?? 0)} unidades` }))} />
        </CardGrafico>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        <CardGrafico titulo="Carteira por situação"><Contagens dados={d.carteira.status} /></CardGrafico>
        <CardGrafico titulo="Curva ABC" sub="Por valor acumulado"><Contagens dados={d.carteira.abc} /></CardGrafico>
        <CardGrafico titulo="Segmentos RFM" sub="Recência, frequência e valor"><Contagens dados={d.carteira.rfm} /></CardGrafico>
        <CardGrafico titulo="Perfil de compra" sub="Mix e potencial de venda cruzada"><Contagens dados={d.carteira.perfil} /></CardGrafico>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <section className={`${card} p-5 lg:col-span-2 overflow-x-auto`}>
          <h2 className="text-sm font-semibold text-zinc-800 mb-3">Campanhas (resultados simulados)</h2>
          <table className="w-full text-[12.5px]">
            <thead><tr className="text-left text-[11px] uppercase tracking-wide text-zinc-400 border-b border-zinc-100">
              <th className="py-2 font-semibold">Campanha</th><th className="py-2 text-right font-semibold">Alcance</th><th className="py-2 text-right font-semibold">Opps</th>
              <th className="py-2 text-right font-semibold">Cotações</th><th className="py-2 text-right font-semibold">Vendas</th><th className="py-2 text-right font-semibold">Nota</th>
            </tr></thead>
            <tbody className="divide-y divide-zinc-50">
              {d.campanhas.map((c) => (
                <tr key={c.nome}>
                  <td className="py-2 pr-3 text-zinc-800">{c.nome.replace("[SIMULADO] ", "")}</td>
                  <td className="py-2 text-right tabular-nums">{nInt(c.alcancados)}</td><td className="py-2 text-right tabular-nums">{nInt(c.oportunidades)}</td>
                  <td className="py-2 text-right tabular-nums">{nInt(c.cotacoes)}</td><td className="py-2 text-right tabular-nums font-semibold">{brlCompacto(c.vendas)}</td>
                  <td className="py-2 text-right tabular-nums">{c.avaliacao ?? "—"}/5</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <CardGrafico titulo="Atendimento" sub="Ocorrências por categoria"><BarrasHorizontais cor="#8b6fd1" formato={nInt} dados={d.atendimento.map((x) => ({ label: x.label, valor: x.valor }))} /></CardGrafico>
      </div>

      <section className={`${card} p-5 overflow-x-auto`}>
        <h2 className="text-sm font-semibold text-zinc-800 mb-3">Clientes de maior valor</h2>
        <table className="w-full text-[13px]">
          <thead><tr className="text-left text-[11px] uppercase tracking-wide text-zinc-400 border-b border-zinc-100">
            <th className="py-2 font-semibold">Cliente</th><th className="py-2 font-semibold">UF</th><th className="py-2 font-semibold">ABC</th>
            <th className="py-2 text-right font-semibold">Pedidos</th><th className="py-2 text-right font-semibold">Valor simulado</th>
          </tr></thead>
          <tbody className="divide-y divide-zinc-50">
            {d.topClientes.map((c) => (
              <tr key={c.id} className="hover:bg-zinc-50/60">
                <td className="py-2.5"><Link href={`/empresas/${c.id}`} className="font-semibold text-zinc-800 hover:text-brand-700">{c.nome}</Link></td>
                <td className="py-2.5 text-zinc-500">{c.uf}</td><td className="py-2.5 text-zinc-500">{c.abc ?? "—"}</td>
                <td className="py-2.5 text-right tabular-nums">{nInt(c.pedidos)}</td><td className="py-2.5 text-right tabular-nums font-semibold">{brl(c.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
