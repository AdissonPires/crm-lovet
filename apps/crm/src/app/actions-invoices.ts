"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/policy";
import { getFocusNfeConfig, emitirNfse, consultarNfse } from "@/lib/focusNfe";
import { sendEmailWithAttachment } from "@/lib/mailer";

export async function saveFocusNfeConfig(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "view_financials")) throw new Error("FORBIDDEN");

  const token = String(formData.get("token") ?? "").trim();
  const ambiente = String(formData.get("ambiente") ?? "homologacao");
  const cnpj = String(formData.get("cnpj") ?? "").trim();
  const codigoServico = String(formData.get("codigoServico") ?? "").trim();
  const aliquotaIss = String(formData.get("aliquotaIss") ?? "").trim();

  const [workspace] = await db.select().from(s.workspaces).where(eq(s.workspaces.id, user.workspaceId));
  const settings = (workspace?.settings as Record<string, unknown>) ?? {};

  await db.update(s.workspaces).set({
    settings: { ...settings, focusNfe: { token, ambiente, cnpj, codigoServico, aliquotaIss } },
  }).where(eq(s.workspaces.id, user.workspaceId));

  revalidatePath("/financeiro/notas");
}

export async function emitInvoice(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "view_financials")) throw new Error("FORBIDDEN");

  const companyId = String(formData.get("companyId") ?? "").trim() || null;
  const kind = String(formData.get("kind") ?? "nfse") as "nfe" | "nfse";
  const amount = String(formData.get("amount") ?? "0").trim();
  const discriminacao = String(formData.get("discriminacao") ?? "").trim();
  const tomadorNome = String(formData.get("tomadorNome") ?? "").trim();
  const tomadorEmail = String(formData.get("tomadorEmail") ?? "").trim() || null;

  const [workspace] = await db.select().from(s.workspaces).where(eq(s.workspaces.id, user.workspaceId));
  const config = getFocusNfeConfig(workspace?.settings);

  const [invoice] = await db.insert(s.invoices).values({
    workspaceId: user.workspaceId,
    companyId,
    kind,
    number: "pendente",
    amount,
    status: "draft",
  }).returning();

  if (!config) {
    await db.update(s.invoices).set({ status: "error" }).where(eq(s.invoices.id, invoice.id));
    revalidatePath("/financeiro/notas");
    return;
  }

  const settings = workspace?.settings as { focusNfe?: { cnpj?: string; codigoServico?: string; aliquotaIss?: string } };
  const prestadorCnpj = settings?.focusNfe?.cnpj ?? "";
  const codigoServico = settings?.focusNfe?.codigoServico ?? "";
  const aliquotaIss = parseFloat(settings?.focusNfe?.aliquotaIss ?? "0");

  try {
    if (kind === "nfse") {
      await emitirNfse(config, {
        ref: invoice.id,
        prestadorCnpj,
        tomadorNome,
        tomadorEmail,
        valorServicos: parseFloat(amount),
        discriminacao,
        codigoServico,
        aliquotaIss,
      });
    } else {
      throw new Error("Emissão de NF-e (produto) ainda não implementada — só NFS-e (serviço) por enquanto.");
    }
    // A Focus NFe processa de forma assincrona: fica "processando" ate confirmar.
    await db.update(s.invoices).set({ status: "draft" }).where(eq(s.invoices.id, invoice.id));
  } catch (err) {
    await db.update(s.invoices).set({
      status: "error",
      taxAmount: null,
    }).where(eq(s.invoices.id, invoice.id));
    revalidatePath("/financeiro/notas");
    throw err;
  }

  revalidatePath("/financeiro/notas");
}

export async function refreshInvoiceStatus(invoiceId: string) {
  const user = await requireUser();

  const [invoice] = await db.select().from(s.invoices)
    .where(eq(s.invoices.id, invoiceId));
  if (!invoice || invoice.workspaceId !== user.workspaceId) return;

  const [workspace] = await db.select().from(s.workspaces).where(eq(s.workspaces.id, user.workspaceId));
  const config = getFocusNfeConfig(workspace?.settings);
  if (!config) return;

  const result = await consultarNfse(config, invoiceId);

  if (result.status === "autorizado") {
    await db.update(s.invoices).set({
      status: "issued",
      number: result.numero ?? invoice.number,
      series: result.serie ?? invoice.series,
      issuedAt: new Date(),
    }).where(eq(s.invoices.id, invoiceId));
  } else if (result.status === "erro_autorizacao") {
    await db.update(s.invoices).set({ status: "error" }).where(eq(s.invoices.id, invoiceId));
  }

  revalidatePath("/financeiro/notas");
}

export async function emailInvoicePdf(invoiceId: string, formData: FormData) {
  const user = await requireUser();
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return;

  const [invoice] = await db.select().from(s.invoices).where(eq(s.invoices.id, invoiceId));
  if (!invoice || invoice.workspaceId !== user.workspaceId || invoice.status !== "issued") return;

  const [workspace] = await db.select().from(s.workspaces).where(eq(s.workspaces.id, user.workspaceId));
  const config = getFocusNfeConfig(workspace?.settings);
  if (!config) return;

  const result = await consultarNfse(config, invoiceId);
  if (!result.caminho_download_pdf && !result.url) return;

  const pdfUrl = result.caminho_download_pdf?.startsWith("http")
    ? result.caminho_download_pdf
    : `${config.ambiente === "producao" ? "https://api.focusnfe.com.br" : "https://homologacao.focusnfe.com.br"}${result.caminho_download_pdf ?? ""}`;

  const pdfRes = await fetch(pdfUrl);
  const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());

  await sendEmailWithAttachment({
    to: email,
    subject: `Nota fiscal ${invoice.kind.toUpperCase()} ${invoice.number}`,
    text: `Segue em anexo a nota fiscal ${invoice.number}, no valor de R$ ${invoice.amount}.`,
    filename: `nota-fiscal-${invoice.number}.pdf`,
    content: pdfBuffer,
    contentType: "application/pdf",
  });
}
