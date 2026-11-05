import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/policy";
import { COTACAO_STATUS, listarCotacoes, opcoesFiltro, periodoDe } from "@/lib/gestao";
import { PageHeader } from "@/components/ui";
import { AvisoSimulado } from "@/components/graficos";
import { ListaDocumentos } from "@/components/gestao/ListaDocumentos";

type SP = { q?: string; status?: string; rep?: string; regiao?: string; de?: string; ate?: string; pagina?: string };

export default async function CotacoesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  if (!can(user.role, "view_pipeline")) redirect("/conta/senha");
  const sp = await searchParams;
  const per = periodoDe(sp);
  const pagina = Math.max(1, Number(sp.pagina) || 1);
  const filtro = { q: sp.q?.trim(), status: sp.status && sp.status in COTACAO_STATUS ? sp.status : "", rep: sp.rep ?? "", regiao: sp.regiao ?? "", pagina, deTs: per.deTs, ateTs: per.ateTs };
  const [lista, opc] = await Promise.all([listarCotacoes(user.workspaceId, filtro), opcoesFiltro(user.workspaceId)]);
  return (
    <div className="p-4 md:p-8 max-w-[1300px] mx-auto">
      <PageHeader module="Vendas" title="Cotações" subtitle="Cotações emitidas, com versões e situação. Clique no número para ver os itens." />
      <AvisoSimulado />
      <ListaDocumentos
        base="/cotacoes" titulo="cotações" rotuloNumero="Cotação" rotuloExtra="Versão" linhas={lista.linhas} total={lista.total} soma={lista.soma}
        filtros={{ q: filtro.q ?? "", status: filtro.status, rep: filtro.rep, regiao: filtro.regiao, de: per.de, ate: per.ate, pagina }}
        statusOpcoes={COTACAO_STATUS} reps={opc.reps} regioes={opc.regioes}
      />
    </div>
  );
}
