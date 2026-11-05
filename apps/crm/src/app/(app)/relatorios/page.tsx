import Form from "next/form";
import Link from "next/link";
import { FileDown, Mail, FileText, Users, User } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { sendActivityReportEmail } from "@/app/actions-reports";
import {
  collectActivityReport, collectTeamActivityReport, listarColaboradorasDaEquipe,
  podeVerRelatorioDeOutros, resolverColaboradorDoRelatorio,
} from "@/lib/activityReport";
import { listarEquipes } from "@/lib/equipes";
import { brl } from "@/lib/format";
import { ProducaoEquipeChart } from "@/components/relatorios/ProducaoEquipeChart";
import { fimDoDia, inicioDoDia } from "@/lib/periodo";

export const dynamic = "force-dynamic";

const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const campo =
  "mt-1 w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";
const cardCls = "rounded-2xl bg-white border border-zinc-100 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-14px_rgba(0,0,0,0.12)]";

function Numero({ rotulo, valor, sub }: { rotulo: string; valor: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-zinc-100 bg-zinc-50/60 px-4 py-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">{rotulo}</div>
      <div className="mt-1 text-xl font-bold tabular-nums text-zinc-900">{valor}</div>
      {sub && <div className="text-[11px] text-zinc-400">{sub}</div>}
    </div>
  );
}

export default async function RelatoriosPage({
  searchParams,
}: {
  searchParams: Promise<{
    sent?: string; error?: string; escopo?: string; equipe?: string; colaborador?: string; from?: string; to?: string;
  }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const gestor = podeVerRelatorioDeOutros(user.role);
  const escopo = gestor && sp.escopo === "equipe" ? "equipe" : "individual";

  const hoje = new Date();
  const mesAtras = new Date(hoje);
  mesAtras.setDate(mesAtras.getDate() - 30);
  const fromStr = /^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? "") ? sp.from! : isoDate(mesAtras);
  const toStr = /^\d{4}-\d{2}-\d{2}$/.test(sp.to ?? "") ? sp.to! : isoDate(hoje);
  const from = inicioDoDia(fromStr)!;
  const to = fimDoDia(toStr)!;
  to.setHours(23, 59, 59, 999);

  const periodoQuery = `from=${fromStr}&to=${toStr}`;
  const aba = (ativa: boolean) =>
    `inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors ${
      ativa ? "bg-zinc-900 text-white" : "border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
    }`;

  return (
    <div className="p-4 md:p-8 max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">Relatório de atividades</h1>
        <p className="text-sm text-zinc-500 mt-0.5">
          O que foi feito no período — individual ou por equipe. Baixe em PDF{escopo === "individual" ? " ou envie por email" : ""}.
        </p>
      </div>

      {gestor && (
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Tipo de relatório">
          <Link href={`/relatorios?escopo=individual&${periodoQuery}`} role="tab" aria-selected={escopo === "individual"} className={aba(escopo === "individual")}>
            <User className="h-3.5 w-3.5" /> Individual
          </Link>
          <Link href={`/relatorios?escopo=equipe&${periodoQuery}`} role="tab" aria-selected={escopo === "equipe"} className={aba(escopo === "equipe")}>
            <Users className="h-3.5 w-3.5" /> Por equipe
          </Link>
        </div>
      )}

      {sp.sent && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm px-4 py-3">
          Relatório enviado por email com sucesso.
        </div>
      )}
      {sp.error && (
        <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">
          Não foi possível enviar: {decodeURIComponent(sp.error)}
        </div>
      )}

      {escopo === "individual" ? (
        <Individual
          user={user}
          gestor={gestor}
          colaboradorId={sp.colaborador}
          fromStr={fromStr}
          toStr={toStr}
          from={from}
          to={to}
        />
      ) : (
        <Equipe user={user} equipeId={sp.equipe} fromStr={fromStr} toStr={toStr} from={from} to={to} />
      )}
    </div>
  );
}

async function Individual({
  user, gestor, colaboradorId, fromStr, toStr, from, to,
}: {
  user: { id: string; name: string; email: string; role: string; workspaceId: string };
  gestor: boolean;
  colaboradorId?: string;
  fromStr: string; toStr: string; from: Date; to: Date;
}) {
  let alvo = { id: user.id, name: user.name };
  try {
    alvo = await resolverColaboradorDoRelatorio(user, colaboradorId);
  } catch { /* id inválido ou sem permissão: cai no próprio usuário */ }

  const [dados, colaboradoras] = await Promise.all([
    collectActivityReport(alvo.id, user.workspaceId, alvo.name, from, to, ""),
    gestor ? listarColaboradorasDaEquipe(user.workspaceId) : Promise.resolve([]),
  ]);
  const opcoes = colaboradoras.some((c) => c.id === user.id) || !gestor ? colaboradoras : [{ id: user.id, name: user.name }, ...colaboradoras];

  return (
    <div className={`${cardCls} p-6 space-y-5`}>
      <div className="text-sm font-semibold text-zinc-800 flex items-center gap-2">
        <FileText className="h-4 w-4 text-zinc-400" /> {alvo.name}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Numero rotulo="Vendas" valor={String(dados.vendas.quantidade)} sub={brl(dados.vendas.faturamento)} />
        <Numero rotulo="Tarefas concluídas" valor={String(dados.tasksCompleted.length)} />
        <Numero rotulo="Tarefas pendentes" valor={String(dados.tasksPending.length)} />
        <Numero rotulo="Ligações" valor={String(dados.callsLogged.length)} />
        <Numero
          rotulo="Em aberto"
          valor={brl(dados.valores.aberto)}
          sub={`Perdido ${brl(dados.valores.perdido)}`}
        />
      </div>

      <Form action="/relatorios" scroll={false} className="space-y-4 border-t border-zinc-100 pt-4">
        <input type="hidden" name="escopo" value="individual" />
        <div className={`grid gap-3 ${gestor ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
          {gestor && (
            <div>
              <label className="text-xs font-semibold text-zinc-500" htmlFor="rel-colab">Colaboradora</label>
              <select id="rel-colab" name="colaborador" defaultValue={alvo.id} className={campo}>
                {opcoes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="text-xs font-semibold text-zinc-500">De</label>
            <input type="date" name="from" defaultValue={fromStr} required className={campo} />
          </div>
          <div>
            <label className="text-xs font-semibold text-zinc-500">Até</label>
            <input type="date" name="to" defaultValue={toStr} required className={campo} />
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-zinc-500">Observações (opcional — vai junto no PDF/email)</label>
          <textarea name="notes" rows={3} placeholder="Qualquer coisa que você queira registrar junto…" className={campo} />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 text-zinc-700 text-xs font-semibold px-4 py-2.5 hover:bg-zinc-50 transition-colors">
            Atualizar
          </button>
          <button type="submit" formAction="/api/reports/activity/pdf" formMethod="post" formTarget="_blank"
            className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 text-white text-xs font-semibold px-4 py-2.5 hover:bg-zinc-800 transition-colors">
            <FileDown className="h-3.5 w-3.5" /> Baixar PDF
          </button>
        </div>

        <div className="border-t border-zinc-100 pt-4 flex flex-wrap items-center gap-3">
          <input type="email" name="email" defaultValue={user.email} placeholder="Enviar para…"
            className="flex-1 min-w-[220px] rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
          <button type="submit" formAction={sendActivityReportEmail}
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand-500 text-white text-xs font-semibold px-4 py-2.5 hover:bg-brand-400 transition-colors">
            <Mail className="h-3.5 w-3.5" /> Enviar por email
          </button>
        </div>
      </Form>
    </div>
  );
}

async function Equipe({
  user, equipeId, fromStr, toStr, from, to,
}: {
  user: { workspaceId: string };
  equipeId?: string;
  fromStr: string; toStr: string; from: Date; to: Date;
}) {
  const equipes = await listarEquipes(user.workspaceId);
  const escolhida = equipes.find((e) => e.id === equipeId) ?? equipes[0];
  const relatorio = escolhida ? await collectTeamActivityReport(user.workspaceId, escolhida.id, from, to) : null;

  return (
    <div className="space-y-6">
      <div className={`${cardCls} p-6`}>
        <Form action="/relatorios" scroll={false} className="grid gap-3 sm:grid-cols-4 sm:items-end">
          <input type="hidden" name="escopo" value="equipe" />
          <div className="sm:col-span-2">
            <label className="text-xs font-semibold text-zinc-500" htmlFor="rel-equipe">Equipe</label>
            <select id="rel-equipe" name="equipe" defaultValue={escolhida?.id} className={campo}>
              {equipes.map((e) => <option key={e.id} value={e.id}>{e.nome} · {e.membros.length} pessoas</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-zinc-500">De</label>
            <input type="date" name="from" defaultValue={fromStr} required className={campo} />
          </div>
          <div>
            <label className="text-xs font-semibold text-zinc-500">Até</label>
            <input type="date" name="to" defaultValue={toStr} required className={campo} />
          </div>
          <div className="sm:col-span-4 flex flex-wrap gap-3">
            <button type="submit" className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 text-zinc-700 text-xs font-semibold px-4 py-2.5 hover:bg-zinc-50 transition-colors">
              Atualizar
            </button>
            <button type="submit" formAction="/api/reports/activity/equipe/pdf" formMethod="post" formTarget="_blank"
              className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 text-white text-xs font-semibold px-4 py-2.5 hover:bg-zinc-800 transition-colors">
              <FileDown className="h-3.5 w-3.5" /> Baixar PDF da equipe
            </button>
          </div>
        </Form>
      </div>

      {!relatorio ? (
        <div className={`${cardCls} p-6 text-sm text-zinc-500`}>
          Nenhuma equipe cadastrada. A gestão cadastra as equipes em{" "}
          <Link href="/equipe" className="font-semibold text-brand-700 hover:text-brand-800">Equipe e acessos</Link>.
        </div>
      ) : (
        <>
          <div className={`${cardCls} p-6`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-zinc-800">Produção da equipe — {relatorio.equipe.nome}</h2>
                <p className="text-[11px] text-zinc-400">Tarefas do CRM concluídas por semana pelos integrantes{relatorio.equipe.lider ? ` · líder ${relatorio.equipe.lider.nome}` : ""}</p>
              </div>
            </div>
            <div className="mt-3"><ProducaoEquipeChart semanas={relatorio.producao} /></div>
          </div>

          <div className={`${cardCls} p-6 space-y-4`}>
            <h2 className="text-sm font-semibold text-zinc-800">Atividades da equipe no período</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Numero rotulo="Vendas" valor={String(relatorio.totais.vendas)} sub={brl(relatorio.totais.faturamento)} />
              <Numero rotulo="Tarefas concluídas" valor={String(relatorio.totais.tarefasConcluidas)} />
              <Numero rotulo="Tarefas pendentes" valor={String(relatorio.totais.tarefasPendentes)} />
              <Numero rotulo="Ligações" valor={String(relatorio.totais.ligacoes)} />
              <Numero rotulo="Em aberto" valor={brl(relatorio.totais.emAberto)} sub={`Perdido ${brl(relatorio.totais.perdido)}`} />
            </div>

            <div className="overflow-x-auto rounded-xl border border-zinc-100">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 text-left text-[11px] uppercase tracking-wide text-zinc-400">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Integrante</th>
                    <th className="px-2 py-2.5 text-right font-semibold">Tarefas</th>
                    <th className="px-2 py-2.5 text-right font-semibold">Ligações</th>
                    <th className="px-2 py-2.5 text-right font-semibold">Vendas</th>
                    <th className="px-2 py-2.5 text-right font-semibold">Faturamento</th>
                    <th className="px-2 py-2.5 text-right font-semibold">Em aberto</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Perdido</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50">
                  {relatorio.membros.map((m) => (
                    <tr key={m.nome}>
                      <td className="px-4 py-2.5 font-medium text-zinc-800">
                        {m.nome}
                        {m.userId === relatorio.equipe.lider?.id && <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-700">líder</span>}
                        {!m.userId && <span className="ml-2 text-[11px] font-normal text-zinc-400">sem usuário no CRM</span>}
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-zinc-700">
                        {m.tarefasConcluidas}<span className="text-zinc-400"> / {m.tarefasPendentes} pend.</span>
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-zinc-700">{m.ligacoes}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-zinc-700">{m.vendas}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums font-semibold text-zinc-900">{brl(m.faturamento)}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-zinc-700">{brl(m.emAberto)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-red-600">{brl(m.perdido)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
