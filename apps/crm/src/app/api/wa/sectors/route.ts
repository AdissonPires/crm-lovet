import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { checkToken, getWorkspace } from "@/lib/waApi";

/**
 * Setores de atendimento ativos, já com o texto do menu pronto.
 *
 * O menu é montado aqui, e não no n8n, para o texto enviado ao cliente ficar
 * junto do dado que o origina: quem edita um setor no CRM muda o menu na hora
 * seguinte, sem reimportar workflow.
 *
 * Header: x-webhook-token: <WA_API_TOKEN>
 */
export async function GET(req: Request) {
  if (!checkToken(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const workspace = await getWorkspace();
  if (!workspace) return NextResponse.json({ ok: false, error: "no workspace" }, { status: 500 });

  const sectors = await db.select().from(s.serviceSectors)
    .where(and(eq(s.serviceSectors.workspaceId, workspace.id), eq(s.serviceSectors.active, true)))
    .orderBy(asc(s.serviceSectors.sortOrder));

  const items = sectors.map((sec, i) => ({
    id: sec.id,
    option: i + 1,
    name: sec.name,
    description: sec.description,
    aiPersona: sec.aiPersona,
  }));

  const menu = [
    "Pra te direcionar certo, escolha o setor respondendo com o número:",
    "",
    ...items.map((it) => `*${it.option}* — ${it.name}${it.description ? `\n_${it.description}_` : ""}`),
  ].join("\n");

  return NextResponse.json({ ok: true, count: items.length, items, menu });
}
