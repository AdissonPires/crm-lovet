import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/policy";
import { detalheDocumento, UUID_RE } from "@/lib/gestao";
import { DetalheDocumento } from "@/components/gestao/DetalheDocumento";

export default async function PedidoPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!can(user.role, "view_pipeline")) redirect("/conta/senha");
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const d = await detalheDocumento(user.workspaceId, "pedido", id);
  if (!d) notFound();
  return <DetalheDocumento tipo="pedido" d={d} />;
}
