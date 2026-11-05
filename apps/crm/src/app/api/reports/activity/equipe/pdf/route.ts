import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { collectTeamActivityReport, podeVerRelatorioDeOutros } from "@/lib/activityReport";
import { buildTeamActivityReportPdf } from "@/lib/reportPdf";
import { fimDoDia, inicioDoDia } from "@/lib/periodo";

export async function POST(req: Request) {
  const user = await requireUser();
  if (!podeVerRelatorioDeOutros(user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const formData = await req.formData();
  const from = inicioDoDia(String(formData.get("from") ?? ""));
  const to = fimDoDia(String(formData.get("to") ?? ""));
  if (!from || !to) {
    return NextResponse.json({ ok: false, error: "periodo invalido" }, { status: 400 });
  }

  const relatorio = await collectTeamActivityReport(user.workspaceId, String(formData.get("equipe") ?? ""), from, to);
  if (!relatorio) return NextResponse.json({ ok: false, error: "equipe nao encontrada" }, { status: 404 });

  const pdf = await buildTeamActivityReportPdf(relatorio);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="relatorio-equipe-${relatorio.equipe.nome.replace(/\s+/g, "-").toLowerCase()}.pdf"`,
    },
  });
}
