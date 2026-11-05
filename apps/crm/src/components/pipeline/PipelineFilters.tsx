"use client";

import Form from "next/form";
import { useRef } from "react";
import Link from "next/link";
import { Search, SlidersHorizontal, X } from "lucide-react";

export type PipelineFilterValues = {
  q?: string;
  owner?: string;
  source?: string;
  status?: string;
  de?: string;
  ate?: string;
  valorMin?: string;
  valorMax?: string;
  parados?: string;
};

export type OwnerOption = { id: string; name: string };

const field =
  "rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-[12.5px] text-zinc-700 focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";
const label = "block text-[10px] font-semibold uppercase tracking-wide text-zinc-400 mb-1";

/**
 * Filtros do funil de vendas. Form GET puro — o servidor lê tudo de
 * searchParams, mesmo padrão já usado em PresalesFilters: sem estado de
 * cliente, sem recarregar dados no navegador, e o filtro sobrevive a recarregar
 * a página ou compartilhar o link.
 *
 * Os selects submetem no onChange (escolher já filtra); os campos de texto e
 * número esperam o botão, senão o filtro dispararia a cada dígito.
 */
export function PipelineFilters({
  values,
  owners,
  sources,
  activeCount,
}: {
  values: PipelineFilterValues;
  owners: OwnerOption[];
  sources: string[];
  activeCount: number;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const submit = () => formRef.current?.requestSubmit();

  return (
    <Form
      ref={formRef}
      action="/pipeline"
      scroll={false}
      className="rounded-2xl bg-white border border-zinc-100 p-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)] mb-5"
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[210px]">
          <label className={label} htmlFor="p-q">Buscar</label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
            <input
              id="p-q"
              name="q"
              defaultValue={values.q ?? ""}
              placeholder="Cliente ou oportunidade…"
              className={`${field} w-full pl-8`}
            />
          </div>
        </div>

        <div>
          <label className={label} htmlFor="p-owner">Vendedor</label>
          <select id="p-owner" name="owner" defaultValue={values.owner ?? ""} onChange={submit} className={field}>
            <option value="">Todos</option>
            {owners.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={label} htmlFor="p-source">Origem</label>
          <select id="p-source" name="source" defaultValue={values.source ?? ""} onChange={submit} className={field}>
            <option value="">Todas</option>
            {sources.map((src) => (
              <option key={src} value={src}>{src}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={label} htmlFor="p-status">Situação</label>
          <select id="p-status" name="status" defaultValue={values.status ?? "open"} onChange={submit} className={field}>
            <option value="open">Em aberto</option>
            <option value="won">Ganhas</option>
            <option value="lost">Perdidas</option>
            <option value="all">Todas</option>
          </select>
        </div>

        <div>
          <label className={label} htmlFor="p-valormin">Valor (R$)</label>
          <div className="flex items-center gap-1">
            <input
              id="p-valormin" type="number" min="0" name="valorMin"
              defaultValue={values.valorMin ?? ""} placeholder="mín."
              className={`${field} w-[84px]`}
            />
            <span className="text-zinc-300">–</span>
            <input
              type="number" min="0" name="valorMax"
              defaultValue={values.valorMax ?? ""} placeholder="máx."
              aria-label="Valor máximo"
              className={`${field} w-[84px]`}
            />
          </div>
        </div>

        <div>
          <label className={label} htmlFor="p-de">Criada de</label>
          <input id="p-de" type="date" name="de" defaultValue={values.de ?? ""} onChange={submit} className={field} />
        </div>

        <div>
          <label className={label} htmlFor="p-ate">até</label>
          <input id="p-ate" type="date" name="ate" defaultValue={values.ate ?? ""} onChange={submit} className={field} />
        </div>

        <div>
          <label className={label} htmlFor="p-parados">Tempo na etapa</label>
          <select id="p-parados" name="parados" defaultValue={values.parados ?? ""} onChange={submit} className={field}>
            <option value="">Qualquer</option>
            <option value="sla">Fora do SLA</option>
            <option value="7">Paradas +7 dias</option>
            <option value="15">Paradas +15 dias</option>
            <option value="30">Paradas +30 dias</option>
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
              href="/pipeline"
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 text-zinc-500 text-[12.5px] font-medium px-2.5 py-2 hover:bg-zinc-50 transition-colors"
            >
              <X className="h-3.5 w-3.5" /> Limpar ({activeCount})
            </Link>
          )}
        </div>
      </div>
    </Form>
  );
}
