import Link from "next/link";
import { Search } from "lucide-react";
import { brl, dateBR } from "@/lib/format";
import { card, Badge, EmptyState } from "@/components/ui";
import { POR_PAGINA, type LinhaDoc } from "@/lib/gestao";

type Tom = "green" | "red" | "amber" | "blue" | "violet" | "zinc";
const TOM: Record<string, Tom> = {
  entregue: "green", aprovada: "green", enviado: "blue", enviada: "blue", faturado_simulado: "blue", em_separacao: "amber", recebido: "zinc",
  cancelado: "red", recusada: "red", com_ocorrencia: "red", expirada: "zinc", substituida: "violet",
};

export interface Filtros { q: string; status: string; rep: string; regiao: string; de: string; ate: string; pagina: number }

/** Lista paginada com filtros (pedidos e cotações). */
export function ListaDocumentos({ base, titulo, rotuloNumero, linhas, total, soma, filtros, statusOpcoes, reps, regioes, rotuloExtra }: {
  base: "/pedidos" | "/cotacoes"; titulo: string; rotuloNumero: string; linhas: LinhaDoc[]; total: number; soma: number; filtros: Filtros;
  statusOpcoes: Record<string, string>; reps: { id: string; nome: string }[]; regioes: string[]; rotuloExtra: string;
}) {
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const href = (p: number) => {
    const u = new URLSearchParams();
    (["q", "status", "rep", "regiao", "de", "ate"] as const).forEach((k) => { if (filtros[k]) u.set(k, filtros[k]); });
    if (p > 1) u.set("pagina", String(p));
    const qs = u.toString();
    return qs ? `${base}?${qs}` : base;
  };
  const campo = "rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm focus:outline-none focus:border-brand-400";
  const filtrando = Boolean(filtros.q || filtros.status || filtros.rep || filtros.regiao);
  return (
    <>
      <form method="get" action={base} className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="h-4 w-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input name="q" defaultValue={filtros.q} placeholder={`Buscar por nº do ${rotuloNumero} ou cliente`} className={`${campo} w-full pl-9`} />
        </div>
        <select name="status" defaultValue={filtros.status} className={campo}>
          <option value="">Todas as situações</option>
          {Object.entries(statusOpcoes).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select name="rep" defaultValue={filtros.rep} className={campo}>
          <option value="">Todos os vendedores</option>
          {reps.map((r) => <option key={r.id} value={r.id}>{r.nome.replace("[SIMULADO] ", "")}</option>)}
        </select>
        <select name="regiao" defaultValue={filtros.regiao} className={campo}>
          <option value="">Todas as regiões</option>
          {regioes.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <input type="date" name="de" defaultValue={filtros.de} aria-label="De" className={campo} />
        <input type="date" name="ate" defaultValue={filtros.ate} aria-label="Até" className={campo} />
        <button className="rounded-xl bg-zinc-900 text-white text-[13px] font-semibold px-4 py-2 hover:bg-zinc-700 transition-colors">Filtrar</button>
        {filtrando && <Link href={base} className="text-[13px] text-zinc-500 hover:text-zinc-800 px-2">Limpar</Link>}
      </form>
      <p className="text-[12.5px] text-zinc-500 mb-3">
        <b className="text-zinc-800">{total.toLocaleString("pt-BR")}</b> {titulo} · soma <b className="text-zinc-800">{brl(soma)}</b> (valores simulados)
      </p>
      <div className={`${card} overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead className="bg-zinc-50/80 text-left text-[11px] uppercase tracking-wide text-zinc-400">
            <tr>
              <th className="px-5 py-3 font-semibold">{rotuloNumero}</th><th className="px-3 py-3 font-semibold">Data</th><th className="px-3 py-3 font-semibold">Cliente</th>
              <th className="px-3 py-3 font-semibold">Região</th><th className="px-3 py-3 font-semibold">Vendedor</th><th className="px-3 py-3 font-semibold">{rotuloExtra}</th>
              <th className="px-3 py-3 font-semibold">Situação</th><th className="px-5 py-3 font-semibold text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-50">
            {linhas.map((l) => (
              <tr key={l.id} className="hover:bg-brand-50/30 transition-colors">
                <td className="px-5 py-3 whitespace-nowrap"><Link href={`${base}/${l.id}`} className="font-semibold text-zinc-900 hover:text-brand-700 tabular-nums">{l.numero}</Link></td>
                <td className="px-3 py-3 text-zinc-500 tabular-nums whitespace-nowrap">{dateBR(l.data)}</td>
                <td className="px-3 py-3 max-w-[260px] truncate"><Link href={`/empresas/${l.clienteId}`} className="text-zinc-800 hover:text-brand-700">{l.cliente}</Link></td>
                <td className="px-3 py-3 text-zinc-500 text-[13px] whitespace-nowrap">{l.regiao ?? "—"}</td>
                <td className="px-3 py-3 text-zinc-500 text-[13px] whitespace-nowrap">{l.vendedor?.replace("[SIMULADO] ", "") ?? "—"}</td>
                <td className="px-3 py-3 text-zinc-500 text-[13px] whitespace-nowrap">{l.extra === "cotacao" ? "Cotação" : l.extra === "recompra_direta" ? "Recompra direta" : l.extra ?? "—"}</td>
                <td className="px-3 py-3 whitespace-nowrap"><Badge tone={TOM[l.status] ?? "zinc"}>{statusOpcoes[l.status] ?? l.status}</Badge></td>
                <td className="px-5 py-3 text-right font-semibold text-zinc-900 tabular-nums whitespace-nowrap">{brl(l.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {linhas.length === 0 && <EmptyState title="Nada encontrado com esses filtros." />}
      </div>
      {paginas > 1 && (
        <nav className="flex items-center justify-between gap-3 text-sm mt-4" aria-label="Paginação">
          <span className="text-zinc-500">Página {filtros.pagina} de {paginas}</span>
          <div className="flex gap-2">
            {filtros.pagina > 1 ? <Link href={href(filtros.pagina - 1)} className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50">Anterior</Link> : <span className="rounded-lg border border-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-300">Anterior</span>}
            {filtros.pagina < paginas ? <Link href={href(filtros.pagina + 1)} className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50">Próxima</Link> : <span className="rounded-lg border border-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-300">Próxima</span>}
          </div>
        </nav>
      )}
    </>
  );
}
