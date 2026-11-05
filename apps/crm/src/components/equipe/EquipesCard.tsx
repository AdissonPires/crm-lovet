import { Users } from "lucide-react";
import { card } from "@/components/ui";
import { excluirEquipe, salvarEquipe } from "@/app/actions-equipes";
import type { Equipe, Pessoa } from "@/lib/equipes";

const campo = "w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-[13px] outline-none focus:border-brand-400";

/** Campos de uma equipe (nova ou existente). Formulário comum — funciona sem JavaScript. */
function CamposEquipe({ pessoas, equipe }: { pessoas: Pessoa[]; equipe?: Equipe }) {
  const membros = new Set(equipe?.membros.map((m) => m.id));
  const sufixo = equipe?.id ?? "nova";
  return (
    <>
      {equipe && <input type="hidden" name="id" value={equipe.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`eq-nome-${sufixo}`} className="block text-xs font-semibold text-zinc-500 mb-1">Nome</label>
          <input id={`eq-nome-${sufixo}`} name="nome" required maxLength={60} defaultValue={equipe?.nome} placeholder="Ex.: Renovação e Pós-venda" className={campo} />
        </div>
        <div>
          <label htmlFor={`eq-lider-${sufixo}`} className="block text-xs font-semibold text-zinc-500 mb-1">Líder</label>
          <select id={`eq-lider-${sufixo}`} name="liderId" defaultValue={equipe?.lider?.id ?? ""} className={campo}>
            <option value="">Sem líder</option>
            {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </div>
      </div>
      <fieldset className="mt-3">
        <legend className="block text-xs font-semibold text-zinc-500 mb-1.5">Integrantes</legend>
        <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
          {pessoas.map((p) => (
            <label key={p.id} className="flex items-center gap-2 text-[12.5px] text-zinc-700 cursor-pointer">
              <input type="checkbox" name="membros" value={p.id} defaultChecked={membros.has(p.id)} className="rounded border-zinc-300" />
              {p.nome}
            </label>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-zinc-400">O líder entra como integrante automaticamente.</p>
      </fieldset>
    </>
  );
}

/**
 * Equipes internas — base do relatório por equipe e da produção semanal.
 * `podeEditar` = gestão; os demais só consultam.
 */
export function EquipesCard({ equipes, pessoas, podeEditar }: { equipes: Equipe[]; pessoas: Pessoa[]; podeEditar: boolean }) {
  return (
    <div className={`${card} mb-6 p-5`}>
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-brand-600" />
        <h2 className="text-sm font-semibold text-zinc-900">Equipes</h2>
      </div>
      <p className="mt-1 text-[12.5px] text-zinc-500">
        Usadas no relatório por equipe (Relatórios → Equipe) e na produção semanal, que conta as tarefas do CRM concluídas pelos integrantes.
      </p>

      {equipes.length === 0 ? (
        <p className="mt-3 text-[13px] text-zinc-400">Nenhuma equipe cadastrada.</p>
      ) : (
        <ul className="mt-3 divide-y divide-zinc-100 rounded-xl border border-zinc-100">
          {equipes.map((e) => (
            <li key={e.id} className="px-4 py-3">
              <details>
                <summary className="flex cursor-pointer flex-wrap items-baseline gap-x-2 text-[13px]">
                  <span className="font-semibold text-zinc-900">{e.nome}</span>
                  <span className="text-zinc-500">· {e.membros.length} integrante(s){e.lider ? ` · líder ${e.lider.nome}` : ""}</span>
                  {podeEditar && <span className="ml-auto text-[12px] font-semibold text-brand-700">Editar</span>}
                </summary>
                {!podeEditar ? (
                  <p className="mt-2 text-[12.5px] text-zinc-600">{e.membros.map((m) => m.nome).join(", ") || "Sem integrantes."}</p>
                ) : (
                  <div className="mt-3 space-y-3">
                    <form action={salvarEquipe}>
                      <CamposEquipe pessoas={pessoas} equipe={e} />
                      <button className="mt-3 rounded-lg bg-zinc-900 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-zinc-700">Salvar equipe</button>
                    </form>
                    <form action={excluirEquipe}>
                      <input type="hidden" name="id" value={e.id} />
                      <button className="rounded-lg border border-red-200 px-3 py-1.5 text-[12px] font-semibold text-red-700 hover:bg-red-50">Excluir equipe</button>
                    </form>
                  </div>
                )}
              </details>
            </li>
          ))}
        </ul>
      )}

      {podeEditar && (
        <details className="mt-4">
          <summary className="cursor-pointer text-[13px] font-semibold text-brand-700">+ Nova equipe</summary>
          <form action={salvarEquipe} className="mt-3">
            <CamposEquipe pessoas={pessoas} />
            <button className="mt-3 rounded-lg bg-zinc-900 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-zinc-700">Criar equipe</button>
          </form>
        </details>
      )}
    </div>
  );
}
