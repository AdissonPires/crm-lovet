"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ChevronDown, ChevronUp, Search, Settings2, Plus, Trash2, ArrowUpDown,
  ArrowLeftRight, ThumbsDown, X, Check, Loader2,
} from "lucide-react";

export type FunnelItem = {
  id: string;
  name: string;
  color: string;
  sectorId: string | null;
  sectorName: string | null;
  sectorColor: string | null;
  isDefault: boolean;
  /** Funil terminal de perda — ganha o ícone de "polegar pra baixo". */
  isLossFunnel: boolean;
  /** Funil que recebe transferência de outro — ganha o ícone de setas. */
  receivesTransfer: boolean;
  archived: boolean;
  count: number;
};

type Group = { id: string | null; name: string; color: string; funnels: FunnelItem[] };

/**
 * Seletor de funis: lista agrupada por setor, com busca, cor por funil e as
 * ações de gestão (criar, reordenar, lixeira).
 *
 * Fica num painel deslizante e não fixo na tela porque o Kanban já disputa
 * largura com as colunas de etapa — roubar 280px permanentes encolheria o
 * quadro, que é o conteúdo principal da página.
 */
export function FunnelPicker({
  funnels,
  sectors,
  currentId,
  basePath,
  onCreate,
  onCreateSector,
  onArchive,
  onRestore,
  onReorder,
}: {
  funnels: FunnelItem[];
  /**
   * Todos os setores do workspace. Vem de fora, e não derivado dos funis:
   * setor recém-criado ainda não tem funil nenhum, e derivar da lista o
   * deixaria invisível justamente na hora de criar o primeiro funil dele.
   */
  sectors: { id: string; name: string }[];
  currentId: string;
  basePath: string;
  onCreate: (name: string, sectorId: string | null, color: string) => Promise<{ ok: boolean; error?: string }>;
  onCreateSector: (name: string, color: string) => Promise<{ ok: boolean; error?: string }>;
  onArchive: (id: string) => Promise<{ ok: boolean; error?: string }>;
  onRestore: (id: string) => Promise<{ ok: boolean; error?: string }>;
  onReorder: (id: string, direction: "up" | "down") => Promise<{ ok: boolean; error?: string }>;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [mode, setMode] = useState<"list" | "newFunnel" | "newSector" | "trash" | "reorder">("list");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const atual = funnels.find((f) => f.id === currentId);

  const grupos = useMemo<Group[]>(() => {
    const termo = q.trim().toLowerCase();
    const visiveis = funnels.filter((f) =>
      f.archived === (mode === "trash") && (!termo || f.name.toLowerCase().includes(termo)));

    const mapa = new Map<string, Group>();
    for (const f of visiveis) {
      const chave = f.sectorId ?? "__none__";
      if (!mapa.has(chave)) {
        mapa.set(chave, {
          id: f.sectorId,
          name: f.sectorName ?? "Sem setor",
          color: f.sectorColor ?? "#a1a1aa",
          funnels: [],
        });
      }
      mapa.get(chave)!.funnels.push(f);
    }
    // "Sem setor" primeiro, como no padrão de mercado; o resto por nome.
    return [...mapa.values()].sort((a, b) => {
      if (a.id === null) return -1;
      if (b.id === null) return 1;
      return a.name.localeCompare(b.name, "pt-BR");
    });
  }, [funnels, q, mode]);

  function irPara(id: string) {
    const next = new URLSearchParams(params.toString());
    next.set("funil", id);
    router.push(`${basePath}?${next.toString()}`);
    setOpen(false);
  }

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    setErro(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok) setErro(r.error ?? "Não foi possível concluir.");
    else {
      setMode("list");
      router.refresh();
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-[13px] font-semibold text-zinc-700 shadow-sm hover:border-brand-300 transition-colors"
      >
        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: atual?.color ?? "#a1a1aa" }} />
        <span className="max-w-[220px] truncate">{atual?.name ?? "Selecionar funil"}</span>
        <ChevronDown className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute left-0 z-40 mt-2 w-[340px] rounded-2xl bg-white border border-zinc-200 shadow-xl overflow-hidden">
            <div className="p-3 border-b border-zinc-100">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Buscar funil…"
                  className="w-full rounded-xl border border-zinc-200 bg-white pl-9 pr-3 py-2.5 text-[13px] focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                />
              </div>
            </div>

            {mode === "newFunnel" && (
              <NewFunnelForm
                sectors={sectors}
                busy={busy}
                onCancel={() => setMode("list")}
                onSubmit={(name, sectorId, color) => run(() => onCreate(name, sectorId, color))}
              />
            )}

            {mode === "newSector" && (
              <NewSectorForm
                busy={busy}
                onCancel={() => setMode("list")}
                onSubmit={(name, color) => run(() => onCreateSector(name, color))}
              />
            )}

            {(mode === "list" || mode === "trash" || mode === "reorder") && (
              <div className="max-h-[340px] overflow-y-auto">
                {mode === "trash" && (
                  <div className="px-4 py-2 bg-zinc-50 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                    Lixeira — funis arquivados
                  </div>
                )}
                {grupos.map((g) => {
                  const chave = g.id ?? "__none__";
                  const fechado = collapsed[chave];
                  return (
                    <div key={chave}>
                      <button
                        type="button"
                        onClick={() => setCollapsed((c) => ({ ...c, [chave]: !c[chave] }))}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 bg-zinc-50/80 hover:bg-zinc-100 transition-colors"
                      >
                        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: g.color }} />
                        <span className="flex-1 text-left text-[13px] font-bold text-zinc-700">{g.name}</span>
                        {fechado
                          ? <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
                          : <ChevronUp className="h-3.5 w-3.5 text-zinc-400" />}
                      </button>

                      {!fechado && g.funnels.map((f, i) => (
                        <div
                          key={f.id}
                          className={`flex items-center gap-2.5 px-4 py-2.5 border-b border-zinc-50 ${
                            f.id === currentId ? "bg-brand-50/60" : "hover:bg-zinc-50"
                          }`}
                        >
                          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: f.color }} />
                          <button
                            type="button"
                            onClick={() => (mode === "trash" ? undefined : irPara(f.id))}
                            disabled={mode === "trash"}
                            className="flex-1 min-w-0 text-left disabled:cursor-default"
                          >
                            <span className="block text-[13px] text-zinc-700 truncate">{f.name}</span>
                          </button>

                          {f.count > 0 && (
                            <span className="text-[10.5px] tabular-nums text-zinc-400 shrink-0">{f.count}</span>
                          )}
                          {f.receivesTransfer && (
                            <span className="shrink-0" title="Recebe transferência de outro funil">
                              <ArrowLeftRight className="h-3.5 w-3.5 text-zinc-300" />
                            </span>
                          )}
                          {f.isLossFunnel && (
                            <span className="shrink-0" title="Funil de perda">
                              <ThumbsDown className="h-3.5 w-3.5 text-zinc-300" />
                            </span>
                          )}

                          {mode === "reorder" && (
                            <span className="flex items-center gap-0.5 shrink-0">
                              <button type="button" disabled={busy || i === 0}
                                onClick={() => run(() => onReorder(f.id, "up"))}
                                className="p-1 text-zinc-400 hover:text-zinc-700 disabled:opacity-30" title="Subir">
                                <ChevronUp className="h-3.5 w-3.5" />
                              </button>
                              <button type="button" disabled={busy || i === g.funnels.length - 1}
                                onClick={() => run(() => onReorder(f.id, "down"))}
                                className="p-1 text-zinc-400 hover:text-zinc-700 disabled:opacity-30" title="Descer">
                                <ChevronDown className="h-3.5 w-3.5" />
                              </button>
                            </span>
                          )}

                          {mode === "trash" ? (
                            <button type="button" disabled={busy}
                              onClick={() => run(() => onRestore(f.id))}
                              className="shrink-0 text-[11px] font-semibold text-brand-700 hover:text-brand-800 disabled:opacity-50">
                              Restaurar
                            </button>
                          ) : mode === "list" && !f.isDefault ? (
                            <button type="button" disabled={busy}
                              onClick={() => run(() => onArchive(f.id))}
                              className="shrink-0 p-1 text-zinc-300 hover:text-red-500 disabled:opacity-50"
                              title="Mover para a lixeira">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  );
                })}

                {grupos.length === 0 && (
                  <div className="px-4 py-8 text-center text-[13px] text-zinc-400">
                    {mode === "trash" ? "A lixeira está vazia." : "Nenhum funil encontrado."}
                  </div>
                )}
              </div>
            )}

            {erro && <div className="px-4 py-2 text-[11.5px] text-red-600 bg-red-50">{erro}</div>}

            <div className="border-t border-zinc-100 p-3 space-y-2">
              {mode === "list" && (
                <>
                  <a
                    href={`/funis/${currentId}/etapas`}
                    className="flex items-center justify-center gap-1.5 text-[12.5px] font-semibold text-brand-700 hover:text-brand-800 py-1.5 transition-colors"
                  >
                    <Settings2 className="h-3.5 w-3.5" /> Configurar etapas
                  </a>
                  <button type="button" onClick={() => setMode("newFunnel")}
                    className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand-600 text-white text-[13px] font-semibold px-4 py-2.5 hover:bg-brand-700 transition-colors">
                    <Plus className="h-4 w-4" /> Criar funil
                  </button>
                  <div className="grid grid-cols-3 gap-2">
                    <button type="button" onClick={() => setMode("reorder")}
                      className="inline-flex items-center justify-center gap-1 rounded-xl border border-zinc-200 text-zinc-600 text-[11.5px] font-medium px-2 py-2 hover:bg-zinc-50 transition-colors">
                      <ArrowUpDown className="h-3.5 w-3.5" /> Reordenar
                    </button>
                    <button type="button" onClick={() => setMode("newSector")}
                      className="inline-flex items-center justify-center gap-1 rounded-xl border border-zinc-200 text-zinc-600 text-[11.5px] font-medium px-2 py-2 hover:bg-zinc-50 transition-colors">
                      <Plus className="h-3.5 w-3.5" /> Setor
                    </button>
                    <button type="button" onClick={() => setMode("trash")}
                      className="inline-flex items-center justify-center gap-1 rounded-xl border border-zinc-200 text-zinc-600 text-[11.5px] font-medium px-2 py-2 hover:bg-zinc-50 transition-colors">
                      <Trash2 className="h-3.5 w-3.5" /> Lixeira
                    </button>
                  </div>
                </>
              )}
              {(mode === "trash" || mode === "reorder") && (
                <button type="button" onClick={() => setMode("list")}
                  className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-zinc-200 text-zinc-600 text-[12.5px] font-medium px-3 py-2 hover:bg-zinc-50 transition-colors">
                  <X className="h-3.5 w-3.5" /> Voltar à lista
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const CORES = ["#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#3b82f6", "#ef4444", "#14b8a6", "#a855f7"];

function ColorRow({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {CORES.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          aria-label={`Cor ${c}`}
          className={`h-6 w-6 rounded-full transition-transform ${value === c ? "ring-2 ring-offset-2 ring-zinc-400 scale-110" : ""}`}
          style={{ background: c }}
        />
      ))}
    </div>
  );
}

function NewFunnelForm({
  sectors, busy, onCancel, onSubmit,
}: {
  sectors: { id: string; name: string }[];
  busy: boolean;
  onCancel: () => void;
  onSubmit: (name: string, sectorId: string | null, color: string) => void;
}) {
  const [name, setName] = useState("");
  const [sectorId, setSectorId] = useState("");
  const [color, setColor] = useState(CORES[0]);

  return (
    <div className="p-4 space-y-3 border-b border-zinc-100">
      <div className="text-[12px] font-bold uppercase tracking-wide text-zinc-500">Novo funil</div>
      <input
        value={name} onChange={(e) => setName(e.target.value)} autoFocus
        placeholder="Ex.: Tráfego Motos"
        className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-[13px] focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
      />
      <select
        value={sectorId} onChange={(e) => setSectorId(e.target.value)}
        className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-[13px] focus:outline-none focus:border-brand-400"
      >
        <option value="">Sem setor</option>
        {sectors.map((sec) => <option key={sec.id} value={sec.id}>{sec.name}</option>)}
      </select>
      <ColorRow value={color} onChange={setColor} />
      <div className="flex gap-2">
        <button
          type="button" disabled={busy || !name.trim()}
          onClick={() => onSubmit(name.trim(), sectorId || null, color)}
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand-600 text-white text-[12.5px] font-semibold px-3 py-2 hover:bg-brand-700 disabled:opacity-50 transition-colors"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Criar
        </button>
        <button type="button" onClick={onCancel}
          className="rounded-xl border border-zinc-200 text-zinc-500 px-3 py-2 hover:bg-zinc-50 transition-colors">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <p className="text-[11px] text-zinc-400">
        O funil nasce com as etapas padrão do tipo — você ajusta depois em “Configurar etapas”.
      </p>
    </div>
  );
}

function NewSectorForm({
  busy, onCancel, onSubmit,
}: {
  busy: boolean;
  onCancel: () => void;
  onSubmit: (name: string, color: string) => void;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(CORES[2]);

  return (
    <div className="p-4 space-y-3 border-b border-zinc-100">
      <div className="text-[12px] font-bold uppercase tracking-wide text-zinc-500">Novo setor</div>
      <input
        value={name} onChange={(e) => setName(e.target.value)} autoFocus
        placeholder="Ex.: Comercial"
        className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-[13px] focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
      />
      <ColorRow value={color} onChange={setColor} />
      <div className="flex gap-2">
        <button
          type="button" disabled={busy || !name.trim()}
          onClick={() => onSubmit(name.trim(), color)}
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand-600 text-white text-[12.5px] font-semibold px-3 py-2 hover:bg-brand-700 disabled:opacity-50 transition-colors"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Criar setor
        </button>
        <button type="button" onClick={onCancel}
          className="rounded-xl border border-zinc-200 text-zinc-500 px-3 py-2 hover:bg-zinc-50 transition-colors">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
