import Form from "next/form";
import { redirect } from "next/navigation";
import Link from "next/link";
import { sql } from "drizzle-orm";
import { Search, User, Building2 } from "lucide-react";
import { can } from "@/lib/policy";
import { db } from "@/db";
import { requireUser } from "@/lib/auth";

const POR_PAGINA = 100;

type Linha = {
  id: string; name: string; documento: string | null; industry: string | null; ownerName: string | null;
  phone: string | null; cidade: string | null; uf: string | null;
};

function formatarDocumento(d: string | null): string {
  if (!d) return "—";
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return d;
}

/**
 * Lista de clientes com filtro por busca (nome, CPF/CNPJ ou telefone) e por
 * vendedor. Busca, filtro e paginação rodam no banco; carregar tudo e filtrar
 * em memória travaria a tela com bases grandes.
 */
export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const busca = typeof sp.q === "string" ? sp.q.trim() : "";
  const vendedor = typeof sp.vendedor === "string" ? sp.vendedor : "";
  const user = await requireUser();
  if (!can(user.role, "view_pipeline")) redirect("/conta/senha");

  const rows = async <T,>(q: ReturnType<typeof sql>) => ((await db.execute(q)) as unknown as { rows: T[] }).rows;
  const digitos = busca.replace(/\D/g, "");
  const filtro = sql`c.workspace_id = ${user.workspaceId} and c.deleted_at is null
    ${vendedor ? sql`and c.owner_id = ${vendedor}::uuid` : sql``}
    ${busca ? sql`and (c.name ilike ${`%${busca}%`} or c.custom_fields->>'nomeFantasia' ilike ${`%${busca}%`}
      ${digitos.length >= 3 ? sql`or c.documento like ${`%${digitos}%`}
        or exists (select 1 from crm.contacts ct where ct.company_id = c.id and regexp_replace(coalesce(ct.phone, ''), '[^0-9]', '', 'g') like ${`%${digitos}%`})` : sql``})` : sql``}`;

  const [[{ total }], [{ filtrados }], vendedores] = await Promise.all([
    rows<{ total: number }>(sql`select count(*)::int total from crm.companies c where c.workspace_id = ${user.workspaceId} and c.deleted_at is null`),
    rows<{ filtrados: number }>(sql`select count(*)::int filtrados from crm.companies c where ${filtro}`),
    rows<{ id: string; name: string }>(sql`select distinct u.id, u.name from crm.companies c join crm.users u on u.id = c.owner_id
      where c.workspace_id = ${user.workspaceId} order by u.name`),
  ]);
  const totalPaginas = Math.max(1, Math.ceil(filtrados / POR_PAGINA));
  const pagina = Math.min(Math.max(1, Number(sp.pagina) || 1), totalPaginas);

  const lista = await rows<Linha>(sql`
    select c.id, c.name, c.documento, c.industry, u.name "ownerName",
           (select ct.phone from crm.contacts ct where ct.company_id = c.id and ct.phone is not null order by ct.created_at limit 1) phone,
           c.custom_fields->>'cidade' cidade, c.custom_fields->>'uf' uf
      from crm.companies c left join crm.users u on u.id = c.owner_id
     where ${filtro}
     order by c.name
     limit ${POR_PAGINA} offset ${(pagina - 1) * POR_PAGINA}`);

  const filtrando = Boolean(busca || vendedor);
  const href = (p: number) => {
    const params = new URLSearchParams();
    if (busca) params.set("q", busca);
    if (vendedor) params.set("vendedor", vendedor);
    if (p > 1) params.set("pagina", String(p));
    const qs = params.toString();
    return qs ? `/empresas?${qs}` : "/empresas";
  };
  const n = (v: number) => v.toLocaleString("pt-BR");

  return (
    <div className="p-4 md:p-8 max-w-[1200px]">
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">Clientes</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            {filtrando ? `${n(filtrados)} de ${n(total)} clientes` : `${n(total)} clientes na base`}
          </p>
        </div>
      </div>
      <Form action="/empresas" scroll={false} className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="h-4 w-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            name="q" defaultValue={busca} placeholder="Buscar por nome, CPF/CNPJ ou telefone"
            className="w-full rounded-xl border border-zinc-200 bg-white pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-brand-400"
          />
        </div>
        <select
          name="vendedor" defaultValue={vendedor}
          className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm focus:outline-none focus:border-brand-400 max-w-full"
        >
          <option value="">Todos os vendedores</option>
          {vendedores.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        <button type="submit" className="rounded-xl bg-zinc-900 text-white text-[13px] font-semibold px-4 py-2 hover:bg-zinc-700 transition-colors">
          Filtrar
        </button>
        {filtrando && (
          <Link href="/empresas" className="text-[13px] text-zinc-500 hover:text-zinc-800 px-2">Limpar</Link>
        )}
      </Form>
      <div className="rounded-2xl bg-white border border-zinc-100 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-14px_rgba(0,0,0,0.12)] overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50/80 text-left text-[11px] uppercase tracking-wide text-zinc-400">
            <tr>
              <th className="px-5 py-3.5 font-semibold">Cliente</th>
              <th className="px-5 py-3.5 font-semibold">CPF/CNPJ</th>
              <th className="px-5 py-3.5 font-semibold">Telefone</th>
              <th className="px-5 py-3.5 font-semibold">Cidade</th>
              <th className="px-5 py-3.5 font-semibold">Vendedor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-50">
            {lista.length === 0 && (
              <tr><td colSpan={5} className="px-5 py-10 text-center text-sm text-zinc-400">Nenhum cliente encontrado com esses filtros.</td></tr>
            )}
            {lista.map((r) => (
              <tr key={r.id} className="hover:bg-brand-50/30 transition-colors">
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-zinc-100 flex items-center justify-center shrink-0">
                      {r.industry === "Pessoa jurídica" ? <Building2 className="h-4 w-4 text-zinc-400" /> : <User className="h-4 w-4 text-zinc-400" />}
                    </div>
                    <span className="font-semibold text-zinc-900">{r.name}</span>
                  </div>
                </td>
                <td className="px-5 py-3.5 text-zinc-500 tabular-nums whitespace-nowrap">{formatarDocumento(r.documento)}</td>
                <td className="px-5 py-3.5 text-zinc-500 tabular-nums whitespace-nowrap">{r.phone ?? "—"}</td>
                <td className="px-5 py-3.5 text-zinc-500 whitespace-nowrap">{r.cidade ? `${r.cidade}${r.uf ? `/${r.uf}` : ""}` : "—"}</td>
                <td className="px-5 py-3.5 text-zinc-500">{r.ownerName ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPaginas > 1 && (
        <nav className="flex items-center justify-between gap-3 text-sm mt-4" aria-label="Paginação">
          <span className="text-zinc-500">
            {n((pagina - 1) * POR_PAGINA + 1)}–{n(Math.min(pagina * POR_PAGINA, filtrados))} de {n(filtrados)}
          </span>
          <div className="flex items-center gap-2">
            {pagina > 1
              ? <Link href={href(pagina - 1)} className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50">Anterior</Link>
              : <span className="rounded-lg border border-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-300">Anterior</span>}
            <span className="text-xs text-zinc-500 tabular-nums">Página {pagina} de {n(totalPaginas)}</span>
            {pagina < totalPaginas
              ? <Link href={href(pagina + 1)} className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50">Próxima</Link>
              : <span className="rounded-lg border border-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-300">Próxima</span>}
          </div>
        </nav>
      )}
    </div>
  );
}
