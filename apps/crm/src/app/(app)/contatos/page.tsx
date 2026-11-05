import Form from "next/form";
import { redirect } from "next/navigation";
import Link from "next/link";
import { sql } from "drizzle-orm";
import { Search } from "lucide-react";
import { can } from "@/lib/policy";
import { db } from "@/db";
import { requireUser } from "@/lib/auth";

const POR_PAGINA = 100;

type Linha = { id: string; name: string; title: string | null; companyName: string | null; phone: string | null; email: string | null };

/**
 * Contatos do CRM. Busca e paginação no banco.
 */
export default async function ContatosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const busca = typeof sp.q === "string" ? sp.q.trim() : "";
  const user = await requireUser();
  if (!can(user.role, "view_pipeline")) redirect("/conta/senha");

  const rows = async <T,>(q: ReturnType<typeof sql>) => ((await db.execute(q)) as unknown as { rows: T[] }).rows;
  const digitos = busca.replace(/\D/g, "");
  const filtro = sql`ct.workspace_id = ${user.workspaceId} and ct.deleted_at is null
    ${busca ? sql`and (ct.name ilike ${`%${busca}%`} or ct.email ilike ${`%${busca}%`}
      ${digitos.length >= 3 ? sql`or regexp_replace(coalesce(ct.phone, ''), '[^0-9]', '', 'g') like ${`%${digitos}%`} or ct.cpf like ${`%${digitos}%`}` : sql``})` : sql``}`;

  const [[{ total }], [{ filtrados }]] = await Promise.all([
    rows<{ total: number }>(sql`select count(*)::int total from crm.contacts ct where ct.workspace_id = ${user.workspaceId} and ct.deleted_at is null`),
    rows<{ filtrados: number }>(sql`select count(*)::int filtrados from crm.contacts ct where ${filtro}`),
  ]);
  const totalPaginas = Math.max(1, Math.ceil(filtrados / POR_PAGINA));
  const pagina = Math.min(Math.max(1, Number(sp.pagina) || 1), totalPaginas);
  const lista = await rows<Linha>(sql`
    select ct.id, ct.name, ct.title, c.name "companyName", ct.phone, ct.email
      from crm.contacts ct left join crm.companies c on c.id = ct.company_id
     where ${filtro}
     order by ct.name
     limit ${POR_PAGINA} offset ${(pagina - 1) * POR_PAGINA}`);

  const href = (p: number) => {
    const params = new URLSearchParams();
    if (busca) params.set("q", busca);
    if (p > 1) params.set("pagina", String(p));
    const qs = params.toString();
    return qs ? `/contatos?${qs}` : "/contatos";
  };
  const n = (v: number) => v.toLocaleString("pt-BR");

  return (
    <div className="p-4 md:p-8 max-w-[1100px]">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">Contatos</h1>
        <p className="text-sm text-zinc-500 mt-0.5">{busca ? `${n(filtrados)} de ${n(total)} pessoas` : `${n(total)} pessoas na base`}</p>
      </div>
      <Form action="/contatos" scroll={false} className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="h-4 w-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            name="q" defaultValue={busca} placeholder="Buscar por nome, e-mail, telefone ou CPF"
            className="w-full rounded-xl border border-zinc-200 bg-white pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-brand-400"
          />
        </div>
        <button type="submit" className="rounded-xl bg-zinc-900 text-white text-[13px] font-semibold px-4 py-2 hover:bg-zinc-700 transition-colors">
          Buscar
        </button>
        {busca && <Link href="/contatos" className="text-[13px] text-zinc-500 hover:text-zinc-800 px-2">Limpar</Link>}
      </Form>
      <div className="rounded-2xl bg-white border border-zinc-100 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-14px_rgba(0,0,0,0.12)] overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50/80 text-left text-[11px] uppercase tracking-wide text-zinc-400">
            <tr>
              <th className="px-5 py-3.5 font-semibold">Nome</th>
              <th className="px-5 py-3.5 font-semibold">Cargo</th>
              <th className="px-5 py-3.5 font-semibold">Empresa</th>
              <th className="px-5 py-3.5 font-semibold">Telefone</th>
              <th className="px-5 py-3.5 font-semibold">E-mail</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-50">
            {lista.length === 0 && (
              <tr><td colSpan={5} className="px-5 py-10 text-center text-sm text-zinc-400">Nenhum contato encontrado.</td></tr>
            )}
            {lista.map((r) => (
              <tr key={r.id} className="hover:bg-brand-50/30 transition-colors">
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-zinc-800 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                      {r.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
                    </div>
                    <span className="font-semibold text-zinc-900">{r.name}</span>
                  </div>
                </td>
                <td className="px-5 py-3.5 text-zinc-500">{r.title ?? "—"}</td>
                <td className="px-5 py-3.5 text-zinc-500">{r.companyName ?? "—"}</td>
                <td className="px-5 py-3.5 text-zinc-500 tabular-nums whitespace-nowrap">{r.phone ?? "—"}</td>
                <td className="px-5 py-3.5 text-zinc-500">{r.email ?? "—"}</td>
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
