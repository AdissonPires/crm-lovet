import { NextResponse } from "next/server";
import { and, asc, eq, ilike, isNull, or } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { requireUser } from "@/lib/auth";

/**
 * Busca de cliente por nome ou CPF/CNPJ — alimenta o campo "Cliente" da
 * emissão de nota. Existe porque a carteira pode ser grande: mandar todas
 * num <select> deixaria a página lenta.
 */
export async function GET(req: Request) {
  const user = await requireUser();
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ itens: [] });

  const digitos = q.replace(/\D/g, "");
  const itens = await db.select({ id: s.companies.id, nome: s.companies.name, documento: s.companies.documento })
    .from(s.companies)
    .where(and(
      eq(s.companies.workspaceId, user.workspaceId),
      isNull(s.companies.deletedAt),
      digitos.length >= 3
        ? or(ilike(s.companies.name, `%${q}%`), ilike(s.companies.documento, `${digitos}%`))
        : ilike(s.companies.name, `%${q}%`),
    ))
    .orderBy(asc(s.companies.name))
    .limit(20);
  return NextResponse.json({ itens });
}
