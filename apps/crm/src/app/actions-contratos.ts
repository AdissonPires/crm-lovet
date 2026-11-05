"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/policy";

/**
 * Assina o contrato — a acao que faltava por completo: a tela de Contratos ja
 * dizia "ao assinar, dispara projeto de instalacao e contas a receber", mas
 * nao havia nenhum jeito de assinar um contrato ate agora.
 *
 * Projeto de instalacao ja nasce quando a oportunidade entra na etapa ganha
 * (workflow em actions.ts); esta acao cobre a outra metade da promessa: gerar
 * os registros de cobrança.
 */
export async function signContract(contractId: string) {
  const user = await requireUser();
  if (!can(user.role, "manage_records")) throw new Error("FORBIDDEN");

  const [contract] = await db
    .select()
    .from(s.contracts)
    .where(and(eq(s.contracts.id, contractId), eq(s.contracts.workspaceId, user.workspaceId)));

  if (!contract || contract.status === "signed" || contract.status === "canceled") return;

  const [opportunity] = await db
    .select()
    .from(s.opportunities)
    .where(eq(s.opportunities.id, contract.opportunityId));

  let companyId: string | null = null;
  let companyName: string | null = null;
  if (opportunity?.companyId) {
    const [company] = await db.select().from(s.companies).where(eq(s.companies.id, opportunity.companyId));
    companyId = company?.id ?? null;
    companyName = company?.name ?? null;
  }

  const signedAt = new Date();

  await db
    .update(s.contracts)
    .set({ status: "signed", signedAt })
    .where(eq(s.contracts.id, contractId));

  await db.insert(s.activities).values({
    workspaceId: user.workspaceId,
    actorId: user.id,
    actorType: "user",
    relatedToType: "opportunity",
    relatedToId: contract.opportunityId,
    type: "contract_signed",
    payload: { text: `Contrato ${contract.number} assinado.` },
  });

  revalidatePath("/contratos");
  revalidatePath(`/oportunidades/${contract.opportunityId}`);
}
