import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, MapPin, UserRound } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/policy";
import { brl, dateBR } from "@/lib/format";
import { cliente360, PEDIDO_STATUS, COTACAO_STATUS, UUID_RE } from "@/lib/gestao";
import { Badge, card, Kpi } from "@/components/ui";
import { AvisoSimulado, BarrasHorizontais, brlCompacto, CardGrafico, ColunasMensais } from "@/components/graficos";

const ATIV: Record<string, string> = {
  call_logged: "Ligação", whatsapp_sim: "WhatsApp", email_sim: "E-mail", visit: "Visita", meeting: "Reunião", presentation: "Apresentação", quote_sent: "Cotação enviada",
  price_negotiation: "Negociação", follow_up: "Acompanhamento", order_tracking: "Pedido", post_sale: "Pós-venda", recovery: "Recuperação", campaign_touch: "Campanha",
  satisfaction_survey: "Pesquisa", stage_changed: "Etapa", note: "Nota",
};
const OPP_TOM = { won: "green", lost: "red", open: "blue" } as const;
const OPP_ROTULO = { won: "Ganha", lost: "Perdida", open: "Em aberto" } as const;

/** Ficha 360 do cliente: dados, contatos, compras, cotações, negociações, atividades e ocorrências. */
export default async function ClientePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!can(user.role, "view_pipeline")) redirect("/conta/senha");
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const d = await cliente360(user.workspaceId, id);
  if (!d) notFound();
  const { c, contatos } = d;
  const f = c.campos ?? {};
  const sint = f.sintetico === true;
  const rfm = f.rfm as { recenciaDias?: number; frequencia?: number; segmento?: string } | null;

  return (
    <div className="p-4 md:p-8 max-w-[1200px] mx-auto space-y-5">
      <Link href="/empresas" className="inline-flex items-center gap-1.5 text-[13px] text-zinc-500 hover:text-zinc-800"><ArrowLeft className="h-4 w-4" /> Voltar para clientes</Link>
      <div>
        <div className="text-[11px] font-bold uppercase tracking-wider text-brand-500">{c.segmento ?? "Cliente"}{f.codigoInterno ? ` · ${f.codigoInterno}` : ""}</div>
        <h1 className="text-2xl font-bold text-zinc-900 tracking-tight flex flex-wrap items-center gap-3">{c.nome}
          {f.status && <Badge tone={f.status === "Ativo" ? "green" : f.status === "Prospect" ? "blue" : f.status === "Inativo/em risco" ? "amber" : "red"}>{String(f.status)}</Badge>}
          {f.classificacaoABC && <Badge tone="violet">Classe {String(f.classificacaoABC)}</Badge>}
        </h1>
        <p className="text-sm text-zinc-500 mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
          {f.cidade && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{String(f.cidade)}/{String(f.uf)} · {String(f.regiaoComercial)}</span>}
          <span className="inline-flex items-center gap-1"><UserRound className="h-3.5 w-3.5" />Representante: {c.dono?.replace("[SIMULADO] ", "") ?? "—"}</span>
          {f.porte && <span>Porte {String(f.porte)}{f.funcionarios ? ` · ${f.funcionarios} func.` : ""}</span>}
        </p>
      </div>
      {sint && <AvisoSimulado>Cliente fictício para demonstração. Endereço, contatos e valores são inventados.</AvisoSimulado>}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Kpi label="Total comprado (simulado)" value={brlCompacto(Number(f.totalComprasSimulado ?? 0))} sub={`${f.pedidos ?? 0} pedidos`} />
        <Kpi label="Ticket médio" value={f.ticketMedioSimulado ? brl(Number(f.ticketMedioSimulado)) : "—"} />
        <Kpi label="Primeira / última compra" value={f.ultimaCompra ? dateBR(String(f.ultimaCompra)) : "—"} sub={f.primeiraCompra ? `desde ${dateBR(String(f.primeiraCompra))}` : "Sem compras"} />
        <Kpi label="Segmento RFM" value={rfm?.segmento ?? "—"} sub={rfm ? `${rfm.recenciaDias} dias sem comprar · ${rfm.frequencia} pedidos` : undefined} />
        <Kpi label="Propensão de recompra" value={f.propensaoRecompraSimulada != null ? `${Math.round(Number(f.propensaoRecompraSimulada) * 100)}%` : "—"} sub="estimativa simulada" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <CardGrafico titulo="Compras por mês" className="lg:col-span-2"><ColunasMensais dados={d.mensal} rotuloValor="Compras" /></CardGrafico>
        <CardGrafico titulo="Mix por categoria" sub={String(f.perfilCompra ?? "")}><BarrasHorizontais dados={d.porCategoria} /></CardGrafico>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <section className={`${card} p-5 lg:col-span-1`}>
          <h2 className="text-sm font-semibold text-zinc-800 mb-3">Contatos ({contatos.length})</h2>
          <ul className="space-y-3">
            {contatos.map((t) => (
              <li key={t.id} className="text-[13px]">
                <div className="font-semibold text-zinc-800">{t.nome}</div>
                <div className="text-zinc-500">{t.cargo ?? "—"} · {t.campos?.influenciaDecisao ?? ""}</div>
                <div className="text-[11.5px] text-zinc-400">{t.email}</div>
                <div className="text-[11.5px] text-zinc-400">Prefere {String(t.campos?.preferenciaContato ?? "—")} · último contato {t.campos?.ultimoContato ? dateBR(String(t.campos.ultimoContato)) : "—"}</div>
              </li>
            ))}
          </ul>
          <div className="mt-4 border-t border-zinc-100 pt-3 text-[12.5px] text-zinc-500">
            <div><b className="text-zinc-700">Próxima ação:</b> {String(f.proximaAcao ?? "—")}</div>
            <div className="mt-1"><b className="text-zinc-700">Potencial:</b> {String(f.potencialCompra ?? "—")} · {String(f.potencialCrescimento ?? "—")}</div>
          </div>
        </section>

        <section className={`${card} overflow-x-auto lg:col-span-2`}>
          <h2 className="text-sm font-semibold text-zinc-800 px-5 pt-5 mb-2">Pedidos recentes</h2>
          <table className="w-full text-[13px]">
            <tbody className="divide-y divide-zinc-50">
              {d.pedidos.slice(0, 12).map((p) => (
                <tr key={p.id} className="hover:bg-brand-50/30">
                  <td className="px-5 py-2.5"><Link href={`/pedidos/${p.id}`} className="font-semibold text-zinc-800 hover:text-brand-700 tabular-nums">{p.numero}</Link></td>
                  <td className="px-3 py-2.5 text-zinc-500 tabular-nums">{dateBR(p.data)}</td>
                  <td className="px-3 py-2.5 text-zinc-500">{p.itens} itens · {p.canal === "cotacao" ? "cotação" : "recompra"}</td>
                  <td className="px-3 py-2.5"><Badge tone={p.status === "entregue" ? "green" : p.status === "cancelado" || p.status === "com_ocorrencia" ? "red" : "blue"}>{PEDIDO_STATUS[p.status] ?? p.status}</Badge></td>
                  <td className="px-5 py-2.5 text-right font-semibold tabular-nums">{brl(p.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {d.pedidos.length === 0 && <p className="px-5 py-8 text-center text-sm text-zinc-400">Sem pedidos.</p>}
          {d.pedidos.length > 12 && <p className="px-5 py-3 text-xs text-zinc-400 border-t border-zinc-50">Mostrando 12 de {d.pedidos.length}.</p>}
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <section className={`${card} overflow-x-auto`}>
          <h2 className="text-sm font-semibold text-zinc-800 px-5 pt-5 mb-2">Negociações ({d.oportunidades.length})</h2>
          <ul className="divide-y divide-zinc-50">
            {d.oportunidades.slice(0, 10).map((o) => (
              <li key={o.id} className="px-5 py-2.5 text-[13px] flex items-center gap-3">
                <div className="flex-1 min-w-0"><Link href={`/oportunidades/${o.id}`} className="font-semibold text-zinc-800 hover:text-brand-700 truncate block">{o.nome}</Link>
                  <div className="text-[11.5px] text-zinc-400">{dateBR(o.criada)}{o.fechada ? ` → ${dateBR(o.fechada)}` : ""}{o.motivo ? ` · ${o.motivo}` : ""}{o.status === "open" && o.etapa ? ` · ${o.etapa}` : ""}</div></div>
                <Badge tone={OPP_TOM[o.status as keyof typeof OPP_TOM] ?? "zinc"}>{OPP_ROTULO[o.status as keyof typeof OPP_ROTULO] ?? o.status}</Badge>
                <span className="tabular-nums font-semibold w-24 text-right">{brl(o.valor)}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className={`${card} overflow-x-auto`}>
          <h2 className="text-sm font-semibold text-zinc-800 px-5 pt-5 mb-2">Cotações ({d.cotacoes.length})</h2>
          <ul className="divide-y divide-zinc-50">
            {d.cotacoes.slice(0, 10).map((q) => (
              <li key={q.id} className="px-5 py-2.5 text-[13px] flex items-center gap-3">
                <Link href={`/cotacoes/${q.id}`} className="font-semibold text-zinc-800 hover:text-brand-700 tabular-nums">{q.numero}</Link>
                <span className="text-zinc-400 text-[12px]">v{q.versao} · {dateBR(q.data)}</span>
                <span className="ml-auto"><Badge tone={q.status === "aprovada" ? "green" : q.status === "recusada" ? "red" : "zinc"}>{COTACAO_STATUS[q.status] ?? q.status}</Badge></span>
                <span className="tabular-nums font-semibold w-24 text-right">{brl(q.total)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <section className={`${card} p-5 lg:col-span-2`}>
          <h2 className="text-sm font-semibold text-zinc-800 mb-3">Histórico de relacionamento</h2>
          <ul className="space-y-3">
            {d.atividades.slice(0, 12).map((a) => (
              <li key={a.id} className="flex gap-3 text-[13px]">
                <span className="w-24 shrink-0 text-[11.5px] text-zinc-400 tabular-nums pt-0.5">{dateBR(a.quando)}</span>
                <div className="min-w-0"><span className="font-semibold text-zinc-700">{ATIV[a.tipo] ?? a.tipo}</span>
                  <span className="text-zinc-400"> · {a.quem?.replace("[SIMULADO] ", "") ?? "Sistema"}</span>
                  <div className="text-zinc-500">{a.texto}{a.resultado ? <span className="text-zinc-400"> — {a.resultado}</span> : null}</div></div>
              </li>
            ))}
            {d.atividades.length === 0 && <li className="text-sm text-zinc-400">Sem atividades registradas.</li>}
          </ul>
        </section>
        <section className={`${card} p-5`}>
          <h2 className="text-sm font-semibold text-zinc-800 mb-3">Ocorrências ({d.ocorrencias.length})</h2>
          <ul className="space-y-2.5 text-[13px]">
            {d.ocorrencias.map((o) => (
              <li key={o.id}><div className="text-zinc-700">{o.assunto.replace("[SIMULADO] ", "")}</div><div className="text-[11.5px] text-zinc-400">{dateBR(o.aberta)} · {o.status} · prioridade {o.prioridade}</div></li>
            ))}
            {d.ocorrencias.length === 0 && <li className="text-sm text-zinc-400">Nenhuma ocorrência.</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}
