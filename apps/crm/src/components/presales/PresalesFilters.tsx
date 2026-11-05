"use client";

import { useRef } from "react";
import Link from "next/link";
import { Search, SlidersHorizontal, X } from "lucide-react";
import type { CloserOption } from "./types";

export type FilterValues = {
  q?: string;
  sdr?: string;
  de?: string;
  ate?: string;
  qtyMin?: string;
  qtyMax?: string;
  sla?: string;
};

const field =
  "rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-[12.5px] text-zinc-700 focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";
const label = "block text-[10px] font-semibold uppercase tracking-wide text-zinc-400 mb-1";

/**
 * Filtros do board. Form GET puro — o servidor lê tudo de searchParams, sem
 * estado de cliente e sem recarregar dados no navegador.
 */
export function PresalesFilters({
  values,
  sdrs,
  activeCount,
}: {
  values: FilterValues;
  sdrs: CloserOption[];
  activeCount: number;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const submit = () => formRef.current?.requestSubmit();

  return (
    <form ref={formRef} action="/pre-vendas" method="get" className="rounded-2xl bg-white border border-zinc-100 p-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <input type="hidden" name="view" value="kanban" />

      <div className="flex flex-wrap items-end gap-3">
        {/* Busca */}
        <div className="flex-1 min-w-[220px]">
          <label className={label} htmlFor="f-q">Buscar</label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
            <input
              id="f-q"
              name="q"
              defaultValue={values.q ?? ""}
              placeholder="Nome ou telefone…"
              className={`${field} w-full pl-8`}
            />
          </div>
        </div>

        <div>
          <label className={label} htmlFor="f-sdr">SDR</label>
          <select id="f-sdr" name="sdr" defaultValue={values.sdr ?? ""} onChange={submit} className={field}>
            <option value="">Todos</option>
            {sdrs.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={label} htmlFor="f-de">Entrada de</label>
          <input id="f-de" type="date" name="de" defaultValue={values.de ?? ""} onChange={submit} className={field} />
        </div>

        <div>
          <label className={label} htmlFor="f-ate">até</label>
          <input id="f-ate" type="date" name="ate" defaultValue={values.ate ?? ""} onChange={submit} className={field} />
        </div>

        <div>
          <label className={label} htmlFor="f-qtymin">Qtd. itens</label>
          <div className="flex items-center gap-1">
            <input
              id="f-qtymin"
              type="number"
              min="0"
              name="qtyMin"
              defaultValue={values.qtyMin ?? ""}
              placeholder="mín."
              className={`${field} w-[78px]`}
            />
            <span className="text-zinc-300">–</span>
            <input
              type="number"
              min="0"
              name="qtyMax"
              defaultValue={values.qtyMax ?? ""}
              placeholder="máx."
              aria-label="Qtd. máxima de itens"
              className={`${field} w-[78px]`}
            />
          </div>
        </div>

        <div>
          <label className={label} htmlFor="f-sla">SLA</label>
          <select id="f-sla" name="sla" defaultValue={values.sla ?? ""} onChange={submit} className={field}>
            <option value="">Todos</option>
            <option value="ok">No prazo</option>
            <option value="atrasado">Atrasado</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 text-white text-[12.5px] font-semibold px-3.5 py-2 hover:bg-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 transition-colors"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" /> Filtrar
          </button>
          {activeCount > 0 && (
            <Link
              href="/pre-vendas"
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 text-zinc-500 text-[12.5px] font-medium px-2.5 py-2 hover:bg-zinc-50 transition-colors"
            >
              <X className="h-3.5 w-3.5" /> Limpar ({activeCount})
            </Link>
          )}
        </div>
      </div>
    </form>
  );
}
