"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { collectActivityReport, resolverColaboradorDoRelatorio } from "@/lib/activityReport";
import { buildActivityReportPdf } from "@/lib/reportPdf";
import { sendEmailWithAttachment } from "@/lib/mailer";
import { fimDoDia, inicioDoDia } from "@/lib/periodo";

export async function sendActivityReportEmail(formData: FormData) {
  const user = await requireUser();

  const from = inicioDoDia(String(formData.get("from") ?? ""));
  const to = fimDoDia(String(formData.get("to") ?? ""));
  if (!from || !to) redirect("/relatorios?error=periodo_invalido");
  const notes = String(formData.get("notes") ?? "");
  const to_email = String(formData.get("email") ?? "").trim();

  if (!to_email) redirect("/relatorios?error=email_obrigatorio");

  const alvo = await resolverColaboradorDoRelatorio(user, String(formData.get("colaborador") ?? "") || null);
  const data = await collectActivityReport(alvo.id, user.workspaceId, alvo.name, from, to, notes);
  const pdf = await buildActivityReportPdf(data);

  try {
    await sendEmailWithAttachment({
      to: to_email,
      subject: `Relatório de atividades — ${alvo.name}`,
      text: `Relatório de atividades de ${alvo.name}, período de ${from.toLocaleDateString("pt-BR")} a ${to.toLocaleDateString("pt-BR")}.`,
      filename: `relatorio-${alvo.name.replace(/\s+/g, "-").toLowerCase()}.pdf`,
      content: pdf,
      contentType: "application/pdf",
    });
  } catch (err) {
    redirect(`/relatorios?error=${encodeURIComponent(err instanceof Error ? err.message : String(err))}`);
  }

  redirect("/relatorios?sent=1");
}
