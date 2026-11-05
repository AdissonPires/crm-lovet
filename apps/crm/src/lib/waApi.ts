import { db, schema as s } from "@/db";

// Helpers das rotas /api chamadas pelo n8n (orquestrador do WhatsApp).
// Autenticacao simples por token de header, no mesmo padrao do webhook de
// presales — estes endpoints nao tem sessao de usuario (sistema externo).

export function checkToken(req: Request): boolean {
  const expected = process.env.WA_API_TOKEN;
  return !!expected && req.headers.get("x-webhook-token") === expected;
}

// Protótipo single-workspace: resolve o único workspace (slug "lovet").
export async function getWorkspace() {
  const [workspace] = await db.select().from(s.workspaces).limit(1);
  return workspace ?? null;
}
