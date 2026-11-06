import { createHmac, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";

/**
 * Entrada no WeFlow (gestor de tarefas da Lovet) sem segunda senha.
 *
 * Gera um token curto (HS256, 60 s, uso único, audiência "weflow") assinado com
 * SSO_SHARED_SECRET — o mesmo segredo configurado no WeFlow — e redireciona
 * para o endereço de entrada dele. O WeFlow cria/atualiza o usuário pelo e-mail.
 */
const b64 = (v: object) => Buffer.from(JSON.stringify(v)).toString("base64url");

/** Papéis do CRM que viram "gestor" no WeFlow; os demais entram como funcionário. */
const GESTORES = new Set(["owner", "admin", "admin2", "manager"]);

export async function GET(req: Request) {
  const base = new URL(req.url).origin;
  const user = await getSessionUser();
  if (!user || user.license !== "licensed") return NextResponse.redirect(new URL("/login", base));

  const secret = process.env.SSO_SHARED_SECRET ?? "";
  if (secret.length < 24) return NextResponse.redirect(new URL("/?weflow=nao-configurado", base));

  const agora = Math.floor(Date.now() / 1000);
  const corpo = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({
    sub: user.id, email: user.email, name: user.name, role: GESTORES.has(user.role) ? "gestor" : "funcionario",
    aud: "weflow", iss: "lovet-crm", iat: agora, exp: agora + 60, jti: randomUUID(),
  })}`;
  const token = `${corpo}.${createHmac("sha256", secret).update(corpo).digest("base64url")}`;

  const destino = new URL("/api/auth/sso", process.env.WEFLOW_PUBLIC_URL ?? "http://localhost:5174");
  destino.searchParams.set("token", token);
  return NextResponse.redirect(destino);
}
