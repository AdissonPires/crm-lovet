import { redirect } from "next/navigation";
import Link from "next/link";
import { sql } from "drizzle-orm";
import { Building2, Filter, ShoppingBag, Users } from "lucide-react";
import { db } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/policy";
import { brl, dateBR } from "@/lib/format";

// "Clientes por Segmento" — clientes (companies) agrupados por origem da última
// compra (lead_source da oportunidade ganha: parceiro contador/vendedor ou
// outra origem registrada no CRM) e por perfil (pessoa física/jurídica).
// Compras = oportunidades ganhas (o espelho traz os últimos 12 meses).
// Tudo agregado no banco: são ~75 mil clientes. Somente leitura.

const LIMITE_LISTA = 200;
const SEM_COMPRA = "Sem compra no período";

type Linha = { id: string; name: string; perfil: string | null; origem: string; compras: number; total: number; ultima: Date | null };

export default async function SegmentacaoPage({
  searchParams,
}: {
  searchParams: Promise<{ origem?: string; perfil?: string }>;
}) {
  const user = await requireUser();
  if (!can(user.role, "view_pipeline")) redirect("/");
  const { origem, perfil } = await searchParams;
  const wsId = user.workspaceId;

  const rows = async <T,>(q: ReturnType<typeof sql>) => ((await db.execute(q)) as unknown as { rows: T[] }).rows;

  // Uma linha por cliente com o resumo das compras — base de tudo abaixo.
  const base = sql`
    with compras as (
      select company_id, count(*)::int compras, coalesce(sum(amount), 0)::float total, max(closed_at) ultima,
             (array_agg(lead_source order by closed_at desc nulls last))[1] origem
        from crm.opportunities
       where workspace_id = ${wsId} and status = 'won' and company_id is not null
       group by company_id
    )
    select c.id, c.name, c.industry perfil, coalesce(k.origem, ${SEM_COMPRA}) origem,
           coalesce(k.compras, 0) compras, coalesce(k.total, 0) total, k.ultima
      from crm.companies c left join compras k on k.company_id = c.id
     where c.workspace_id = ${wsId} and c.deleted_at is null`;

  const [resumo, porOrigem, porPerfil, lista] = await Promise.all([
    rows<{ total: number; comCompra: number; recorrentes: number }>(sql`
      select count(*)::int total, count(*) filter (where compras > 0)::int "comCompra", count(*) filter (where compras > 1)::int recorrentes
        from (${base}) b`),
    rows<{ chave: string; n: number }>(sql`select origem chave, count(*)::int n from (${base}) b group by 1 order by 2 desc`),
    rows<{ chave: string; n: number }>(sql`select coalesce(perfil, 'Não informado') chave, count(*)::int n from (${base}) b group by 1 order by 2 desc`),
    rows<Linha>(sql`
      select * from (${base}) b
       where (${origem ?? null}::text is null or b.origem = ${origem ?? null})
         and (${perfil ?? null}::text is null or coalesce(b.perfil, 'Não informado') = ${perfil ?? null})
       order by b.total desc, b.name
       limit ${LIMITE_LISTA}`),
  ]);
  const { total, comCompra, recorrentes } = resumo[0] ?? { total: 0, comCompra: 0, recorrentes: 0 };
  const noSegmento = (origem || perfil)
    ? (await rows<{ n: number }>(sql`select count(*)::int n from (${base}) b
         where (${origem ?? null}::text is null or b.origem = ${origem ?? null})
           and (${perfil ?? null}::text is null or coalesce(b.perfil, 'Não informado') = ${perfil ?? null})`))[0]?.n ?? 0
    : total;

  const card = "rounded-2xl bg-white border border-zinc-100 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-14px_rgba(0,0,0,0.12)]";
  const chip = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-full text-xs font-semibold px-3 py-1.5 transition-colors ${
      active ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
    }`;
  const qs = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { origem, perfil, ...over };
    if (merged.origem) p.set("origem", merged.origem);
    if (merged.perfil) p.set("perfil", merged.perfil);
    const str = p.toString();
    return str ? `?${str}` : "";
  };
  const n = (v: number) => v.toLocaleString("pt-BR");

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-[1400px]">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">Clientes por segmento</h1>
        <p className="text-sm text-zinc-500 mt-0.5">
          Clientes agrupados pela origem da última compra e pelo perfil. Compras dos últimos 12 meses.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className={`${card} p-5`}>
          <div className="flex items-center gap-2 text-xs font-medium text-zinc-400 uppercase tracking-wide mb-1">
            <Users className="h-3.5 w-3.5" /> Total de clientes
          </div>
          <div className="text-2xl font-bold text-zinc-900">{n(total)}</div>
        </div>
        <div className={`${card} p-5`}>
          <div className="flex items-center gap-2 text-xs font-medium text-zinc-400 uppercase tracking-wide mb-1">
            <ShoppingBag className="h-3.5 w-3.5" /> Com pelo menos 1 compra
          </div>
          <div className="text-2xl font-bold text-zinc-900">{n(comCompra)}</div>
        </div>
        <div className={`${card} p-5`}>
          <div className="flex items-center gap-2 text-xs font-medium text-zinc-400 uppercase tracking-wide mb-1">
            <ShoppingBag className="h-3.5 w-3.5" /> Compradores recorrentes (2+)
          </div>
          <div className="text-2xl font-bold text-zinc-900">{n(recorrentes)}</div>
        </div>
      </div>

      <div className={`${card} p-5 space-y-4`}>
        <div className="flex items-center gap-2 text-sm font-semibold text-zinc-800">
          <Filter className="h-4 w-4 text-zinc-400" /> Filtrar por segmento
        </div>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400 mb-2">Origem da última compra</div>
          <div className="flex flex-wrap gap-2">
            <Link href={qs({ origem: undefined })} className={chip(!origem)}>Todas ({n(total)})</Link>
            {porOrigem.map(({ chave, n: qtd }) => (
              <Link key={chave} href={qs({ origem: origem === chave ? undefined : chave })} className={chip(origem === chave)}>
                {chave} ({n(qtd)})
              </Link>
            ))}
          </div>
        </div>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400 mb-2">Perfil</div>
          <div className="flex flex-wrap gap-2">
            <Link href={qs({ perfil: undefined })} className={chip(!perfil)}>Todos ({n(total)})</Link>
            {porPerfil.map(({ chave, n: qtd }) => (
              <Link key={chave} href={qs({ perfil: perfil === chave ? undefined : chave })} className={chip(perfil === chave)}>
                {chave} ({n(qtd)})
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className={card}>
        <div className="px-5 py-4 border-b border-zinc-100 flex flex-wrap items-center gap-2 font-semibold text-sm text-zinc-800">
          <Building2 className="h-4 w-4 text-zinc-400" /> {n(noSegmento)} cliente{noSegmento === 1 ? "" : "s"}
          {noSegmento > LIMITE_LISTA && (
            <span className="text-xs font-normal text-zinc-400">— mostrando os {LIMITE_LISTA} que mais compraram</span>
          )}
        </div>
        <div className="divide-y divide-zinc-50">
          {lista.map((seg) => (
            <div key={seg.id} className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-zinc-800 truncate">{seg.name}</div>
                <div className="text-xs text-zinc-400 mt-0.5">
                  {seg.origem}{seg.perfil && ` · ${seg.perfil}`}
                </div>
              </div>
              <div className="flex items-center gap-5 text-xs text-zinc-500 shrink-0">
                <span>{seg.compras} compra{seg.compras === 1 ? "" : "s"}</span>
                <span className="font-semibold text-emerald-700 tabular-nums">{brl(Number(seg.total))}</span>
                <span className="tabular-nums">{seg.ultima ? dateBR(seg.ultima) : "—"}</span>
              </div>
            </div>
          ))}
          {lista.length === 0 && (
            <div className="px-5 py-10 text-center text-sm text-zinc-400">Nenhum cliente neste segmento.</div>
          )}
        </div>
      </div>
    </div>
  );
}
