import { NextResponse } from "next/server";
import { checkToken, getWorkspace } from "@/lib/waApi";
import { lerFollowupConfig } from "@/lib/followupConfig";

// Config do bot pro n8n — hoje só a instância do gestor, que é a ÚNICA em que o
// chatbot responde (ver lib/followupConfig.ts). O workflow do chatbot chama
// isso a cada mensagem: mensagem de outra instância só é registrada (manual).
// Header: x-webhook-token: <WA_API_TOKEN>
export async function GET(req: Request) {
  if (!checkToken(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const workspace = await getWorkspace();
  if (!workspace) return NextResponse.json({ ok: false, error: "no workspace" }, { status: 500 });
  const config = lerFollowupConfig(workspace.settings);
  return NextResponse.json({ ok: true, instanciaGestor: config.instanciaGestor });
}
