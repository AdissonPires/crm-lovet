import { unstable_cache, revalidateTag, updateTag } from "next/cache";

/**
 * Cache dos números pesados do Dashboard: agregações refeitas a cada
 * carregamento. Guarda por 10 min e as ações que alteram os dados limpam o
 * cache (`limparCacheDados`).
 *
 * `unstable_cache` serializa em JSON, o que transformaria Date em texto e
 * quebraria os componentes; aqui as datas vão marcadas e voltam como Date.
 */
export const TAG_DADOS = "dados-crm";
const MARCA_DATA = "\u0000d:";
const JANELA_MS = 10 * 60 * 1000;

function serializar(valor: unknown): string {
  return JSON.stringify(valor, function (this: Record<string, unknown>, chave, v) {
    const bruto = this[chave];
    return bruto instanceof Date ? MARCA_DATA + bruto.toISOString() : v;
  });
}

function desserializar<T>(texto: string): T {
  return JSON.parse(texto, (_chave, v) => (typeof v === "string" && v.startsWith(MARCA_DATA) ? new Date(v.slice(MARCA_DATA.length)) : v)) as T;
}

/**
 * "Agora" chega como `new Date()` em vários argumentos — cada milissegundo
 * seria uma chave de cache diferente. Arredonda datas pra janela de 10 min:
 * a mesma página aberta duas vezes no intervalo reaproveita o resultado.
 */
function arredondar(arg: unknown): unknown {
  if (arg instanceof Date) return new Date(Math.floor(arg.getTime() / JANELA_MS) * JANELA_MS);
  if (Array.isArray(arg)) return arg.map(arredondar);
  if (arg && typeof arg === "object") return Object.fromEntries(Object.entries(arg).map(([k, v]) => [k, arredondar(v)]));
  return arg;
}

export function emCache<A extends unknown[], R>(nome: string, fn: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
  const guardado = unstable_cache(async (...args: A) => serializar(await fn(...args)), ["dados", nome], {
    tags: [TAG_DADOS],
    revalidate: JANELA_MS / 1000,
  });
  return async (...args: A) => desserializar<R>(await guardado(...(arredondar(args) as A)));
}

/** Chamado quando o sync termina uma rodada — o próximo acesso já vê o dado novo. */
export function limparCacheDados(): void {
  revalidateTag(TAG_DADOS, "max");
}

/**
 * Pra edição feita pelo próprio usuário (trocar consultor, importar planilha):
 * expira na hora, quem editou já vê o número novo. `updateTag` só existe em
 * Server Action — chamado de outro lugar, cai no `revalidateTag`.
 */
export function limparCacheDadosAgora(): void {
  try {
    updateTag(TAG_DADOS);
  } catch {
    revalidateTag(TAG_DADOS, "max");
  }
}
