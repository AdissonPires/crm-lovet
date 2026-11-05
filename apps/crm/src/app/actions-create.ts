"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, asc, desc, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/policy";
import { produtoLabel } from "@/lib/produtos";

export async function createCompany(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "manage_records")) throw new Error("FORBIDDEN");

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  // B2C: cada "empresa" é um cliente pessoa física; o contato principal
  // nasce junto, com CPF, telefone e data de nascimento.
  const birthDate = String(formData.get("contactBirthDate") ?? "");
  const [company] = await db.insert(s.companies).values({
    workspaceId: user.workspaceId,
    name,
    industry: "Pessoa Física",
    ownerId: user.id,
  }).returning();

  await db.insert(s.contacts).values({
    workspaceId: user.workspaceId,
    companyId: company.id,
    name,
    email: String(formData.get("contactEmail") ?? "") || null,
    phone: String(formData.get("contactPhone") ?? "") || null,
    cpf: String(formData.get("contactCpf") ?? "") || null,
    birthDate: birthDate ? new Date(`${birthDate}T00:00:00`) : null,
    ownerId: user.id,
  });

  const address = String(formData.get("siteAddress") ?? "").trim();
  if (address) {
    await db.insert(s.sites).values({
      workspaceId: user.workspaceId,
      companyId: company.id,
      address,
      city: String(formData.get("siteCity") ?? "") || null,
      state: String(formData.get("siteState") ?? "") || "SC",
      utilityCompany: "CELESC",
      tariffClass: "B1",
    });
  }

  revalidatePath("/empresas");
  redirect("/empresas");
}

// Fluxo B2C de loja: um formulário único cria (ou reaproveita) o cliente,
// o contato com telefone/CPF/nascimento, o local de instalação e a oportunidade.
export async function createOpportunity(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "manage_records")) throw new Error("FORBIDDEN");

  const customerName = String(formData.get("customerName") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  if (!customerName || !phone) return;

  const cpf = String(formData.get("cpf") ?? "").trim();
  const birthDate = String(formData.get("birthDate") ?? "");
  const city = String(formData.get("city") ?? "").trim();
  const state = String(formData.get("state") ?? "").trim().toUpperCase() || "SC";
  const qty = parseInt(String(formData.get("productQty") ?? ""), 10);
  const closeDate = String(formData.get("expectedCloseDate") ?? "");

  const [pipe] = await db.select().from(s.pipelines)
    .where(and(eq(s.pipelines.workspaceId, user.workspaceId), eq(s.pipelines.kind, "sales")));
  const [firstStage] = await db.select().from(s.pipelineStages)
    .where(eq(s.pipelineStages.pipelineId, pipe.id)).orderBy(asc(s.pipelineStages.order)).limit(1);

  // Reaproveita o cliente se o nome digitado já existe na base
  let [company] = await db.select().from(s.companies)
    .where(and(eq(s.companies.workspaceId, user.workspaceId), eq(s.companies.name, customerName)));
  if (!company) {
    [company] = await db.insert(s.companies).values({
      workspaceId: user.workspaceId,
      name: customerName,
      industry: "Pessoa Física",
      ownerId: user.id,
    }).returning();
  }

  let [contact] = await db.select().from(s.contacts)
    .where(and(eq(s.contacts.workspaceId, user.workspaceId), eq(s.contacts.companyId, company.id)))
    .limit(1);
  const contactData = {
    phone,
    cpf: cpf || null,
    // "T00:00:00" força o fuso local — sem isso a data nasce em UTC e
    // aparece um dia antes no Brasil.
    birthDate: birthDate ? new Date(`${birthDate}T00:00:00`) : null,
  };
  if (!contact) {
    [contact] = await db.insert(s.contacts).values({
      workspaceId: user.workspaceId,
      companyId: company.id,
      name: customerName,
      ownerId: user.id,
      ...contactData,
    }).returning();
  } else {
    await db.update(s.contacts).set({
      phone,
      cpf: contactData.cpf ?? contact.cpf,
      birthDate: contactData.birthDate ?? contact.birthDate,
      updatedAt: new Date(),
    }).where(eq(s.contacts.id, contact.id));
  }

  if (city) {
    const [site] = await db.select().from(s.sites)
      .where(and(eq(s.sites.workspaceId, user.workspaceId), eq(s.sites.companyId, company.id)));
    if (!site) {
      await db.insert(s.sites).values({
        workspaceId: user.workspaceId,
        companyId: company.id,
        contactId: contact.id,
        address: `${city}/${state}`,
        city,
        state,
        utilityCompany: "CELESC",
        tariffClass: "B1",
      });
    }
  }

  const [opp] = await db.insert(s.opportunities).values({
    workspaceId: user.workspaceId,
    pipelineId: pipe.id,
    stageId: firstStage.id,
    companyId: company.id,
    primaryContactId: contact.id,
    ownerId: user.id,
    name: customerName,
    leadSource: String(formData.get("leadSource") ?? "") || null,
    productQty: Number.isNaN(qty) || qty < 1 ? null : qty,
    expectedCloseDate: closeDate ? new Date(closeDate) : null,
  }).returning();

  await db.insert(s.opportunityStageHistory).values({
    opportunityId: opp.id, fromStageId: null, toStageId: firstStage.id, changedBy: user.id,
  });
  await db.insert(s.activities).values({
    workspaceId: user.workspaceId, actorId: user.id, actorType: "user",
    relatedToType: "opportunity", relatedToId: opp.id,
    type: "note", payload: { text: "Oportunidade criada." },
  });

  revalidatePath("/pipeline");
  redirect(`/oportunidades/${opp.id}`);
}

export async function createProposal(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "manage_records")) throw new Error("FORBIDDEN");

  const opportunityId = String(formData.get("opportunityId") ?? "");
  const productLine = String(formData.get("productLine") ?? "");
  const totalPrice = String(formData.get("totalPrice") ?? "").replace(",", ".");
  if (!opportunityId || !productLine || !totalPrice) return;

  const [last] = await db.select().from(s.proposals)
    .where(eq(s.proposals.opportunityId, opportunityId))
    .orderBy(desc(s.proposals.version)).limit(1);

  const qty = parseInt(String(formData.get("qty") ?? ""), 10);
  const validityMonths = parseInt(String(formData.get("validityMonths") ?? ""), 10);
  const financingType = String(formData.get("financingType") ?? "cash") as "cash" | "financing" | "leasing";
  const installments = parseInt(String(formData.get("installments") ?? ""), 10);
  const version = (last?.version ?? 0) + 1;
  const productVariant = String(formData.get("productVariant") ?? "") || null;

  await db.insert(s.proposals).values({
    workspaceId: user.workspaceId,
    opportunityId,
    version,
    productLine,
    productVariant,
    qty: Number.isNaN(qty) || qty < 1 ? 1 : qty,
    unitPrice: String(formData.get("unitPrice") ?? "").replace(",", ".") || null,
    validityMonths: Number.isNaN(validityMonths) ? null : validityMonths,
    totalPrice,
    financingType,
    installments: financingType === "financing" && !Number.isNaN(installments) ? installments : null,
    status: "draft",
  });

  await db.insert(s.activities).values({
    workspaceId: user.workspaceId, actorId: user.id, actorType: "user",
    relatedToType: "opportunity", relatedToId: opportunityId,
    type: "note",
    payload: { text: `Nova proposta criada (v${version}, ${produtoLabel(productLine, productVariant, qty)}).` },
  });

  revalidatePath(`/oportunidades/${opportunityId}`);
}
