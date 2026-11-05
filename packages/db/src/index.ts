import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";

export * as shared from "./shared";

/**
 * Cria um cliente Drizzle com conexao TARDIA — aberta no primeiro uso, nao no
 * import.
 *
 * Isso e deliberado: o `next build` importa os modulos de rota para coletar
 * metadados, e compilar nao deve exigir um banco no ar. Uma versao anterior
 * lancava erro no import e quebrava o build.
 */
export function createDb<TSchema extends Record<string, unknown>>(options: {
  /** Schema Drizzle do modulo. */
  schema: TSchema;
  /** Variavel de ambiente com a string de conexao. */
  urlEnvVar: string;
  /** Chave no globalThis, para sobreviver ao hot-reload do Next em dev. */
  globalKey: string;
  /** Conexoes maximas no pool. */
  max?: number;
}): NodePgDatabase<TSchema> {
  type Cache = { db?: NodePgDatabase<TSchema>; pool?: Pool };
  const store = globalThis as unknown as Record<string, Cache | undefined>;

  function connect(): NodePgDatabase<TSchema> {
    const cache = (store[options.globalKey] ??= {});
    if (cache.db) return cache.db;

    const url = process.env[options.urlEnvVar];
    if (!url) {
      throw new Error(
        `${options.urlEnvVar} nao definida. Esperado algo como ` +
          "postgresql://usuario:senha@postgres:5432/lovet",
      );
    }

    cache.pool ??= new Pool({ connectionString: url, max: options.max ?? 10 });
    cache.db = drizzle(cache.pool, { schema: options.schema });
    return cache.db;
  }

  return new Proxy({} as NodePgDatabase<TSchema>, {
    get(_target, prop, receiver) {
      const real = connect() as unknown as Record<string | symbol, unknown>;
      const value = Reflect.get(real, prop, receiver);
      return typeof value === "function" ? value.bind(real) : value;
    },
  });
}
