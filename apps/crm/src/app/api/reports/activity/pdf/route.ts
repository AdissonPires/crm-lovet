import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { collectActivityReport, resolverColaboradorDoRelatorio } from "@/lib/activityReport";
import { buildActivityReportPdf } from "@/lib/reportPdf";
import { fimDoDia, inicioDoDia } from "@/lib/periodo";

export async function POST(req: Request) {
  const user = await requireUser();
  const formData = await req.formData();

  const from = inicioDoDia(String(formData.get("from") ?? ""));
  const to = fimDoDia(String(formData.get("to") ?? ""));
  if (!from || !to) return NextResponse.json({ ok: false, error: "periodo invalido" }, { status: 400 });
  const notes = String(formData.get("notes") ?? "");

  let alvo: { id: string; name: string };
  try {
    alvo = await resolverColaboradorDoRelatorio(user, String(formData.get("colaborador") ?? "") || null);
  } catch {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const data = await collectActivityReport(alvo.id, user.workspaceId, alvo.name, from, to, notes);
  const pdf = await buildActivityReportPdf(data);

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="relatorio-${alvo.name.replace(/\s+/g, "-").toLowerCase()}.pdf"`,
    },
  });
}
