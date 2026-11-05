import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/policy";
import { listarPedidos, opcoesFiltro, PEDIDO_STATUS, periodoDe } from "@/lib/gestao";
import { PageHeader } from "@/components/ui";
import { AvisoSimulado } from "@/components/graficos";
import { ListaDocumentos } from "@/components/gestao/ListaDocumentos";

type SP = { q?: string; status?: string; rep?: string; regiao?: string; de?: string; ate?: string; pagina?: string };

export default async function PedidosPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  if (!can(user.role, "view_pipeline")) redirect("/conta/senha");
  const sp = await searchParams;
  const per = periodoDe(sp);
  const pagina = Math.max(1, Number(sp.pagina) || 1);
  const filtro = { q: sp.q?.trim(), status: sp.status && sp.status in PEDIDO_STATUS ? sp.status : "", rep: sp.rep ?? "", regiao: sp.regiao ?? "", pagina, deTs: per.deTs, ateTs: per.ateTs };
  const [lista, opc] = await Promise.all([listarPedidos(user.workspaceId, filtro), opcoesFiltro(user.workspaceId)]);
  return (
    <div className="p-4 md:p-8 max-w-[1300px] mx-auto">
      <PageHeader module="Vendas" title="Pedidos" subtitle="Pedidos por cliente, vendedor e região. Clique no número para ver os itens." />
      <AvisoSimulado />
      <ListaDocumentos
        base="/pedidos" titulo="pedidos" rotuloNumero="Pedido" rotuloExtra="Origem" linhas={lista.linhas} total={lista.total} soma={lista.soma}
        filtros={{ q: filtro.q ?? "", status: filtro.status, rep: filtro.rep, regiao: filtro.regiao, de: per.de, ate: per.ate, pagina }}
        statusOpcoes={PEDIDO_STATUS} reps={opc.reps} regioes={opc.regioes}
      />
    </div>
  );
}
