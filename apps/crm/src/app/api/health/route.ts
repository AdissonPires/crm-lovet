import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * Healthcheck de verdade: confere o banco, nao so "o processo Node responde".
 * Um processo pode estar de pe e ainda assim incapaz de servir uma unica
 * pagina porque o Postgres caiu — e exatamente o cenario que aconteceu nesta
 * mesma maquina mais cedo (disco cheio derrubando o Postgres). `docker ps`
 * sozinho nao pega isso; esta rota, sim.
 */
export async function GET() {
  try {
    await db.execute(sql`SELECT 1`);
    return NextResponse.json({ status: "ok" });
  } catch (err) {
    return NextResponse.json(
      { status: "erro", detalhe: err instanceof Error ? err.message : String(err) },
      { status: 503 },
    );
  }
}
