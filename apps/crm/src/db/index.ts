import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

// O CRM usa o Postgres do stack, no schema "crm". O PGlite foi aposentado na
// Fase 1: era single-process e nao podia ser compartilhado.
//
// A conexao e criada de forma tardia, no primeiro uso — e nao no import. O
// `next build` importa estes modulos para coletar dados das rotas, e compilar
// nao deve exigir um banco no ar.

type LovetDb = NodePgDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { lovetDb?: LovetDb; lovetPool?: Pool };

function connect(): LovetDb {
  if (globalForDb.lovetDb) return globalForDb.lovetDb;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL nao definida. O CRM precisa do Postgres do stack " +
        "(ex.: postgresql://crm_app:senha@postgres:5432/lovet).",
    );
  }

  const pool = globalForDb.lovetPool ?? new Pool({ connectionString: databaseUrl, max: 10 });
  globalForDb.lovetPool = pool;

  const instance = drizzle(pool, { schema });
  globalForDb.lovetDb = instance;
  return instance;
}

export const db = new Proxy({} as LovetDb, {
  get(_target, prop, receiver) {
    const real = connect() as unknown as Record<string | symbol, unknown>;
    const value = Reflect.get(real, prop, receiver);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export { schema };
