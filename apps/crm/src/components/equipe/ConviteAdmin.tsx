"use client";

import { useState, useTransition } from "react";
import { Check, Copy, Link2 } from "lucide-react";
import { criarConviteAdmin } from "@/app/actions-convites";

/**
 * Gera o link de convite Admin. O link só existe na resposta da ação: depois de
 * fechar a página não dá pra recuperar (no banco fica só o hash) — gere outro.
 */
export function ConviteAdminBotao({ userId, compacto = false }: { userId?: string; compacto?: boolean } = {}) {
  const [link, setLink] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [pendente, iniciar] = useTransition();

  function gerar() {
    setCopiado(false);
    iniciar(async () => {
      const r = await criarConviteAdmin(userId);
      if (r?.ok && r.token) {
        setLink(`${window.location.origin}/convite/${r.token}`);
        setMensagem(r.mensagem);
      } else {
        setLink(null);
        setMensagem(r?.mensagem ?? "Não foi possível gerar o convite.");
      }
    });
  }

  async function copiar() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
    } catch { /* sem permissão de área de transferência: o link continua selecionável */ }
  }

  return (
    <div>
      <button
        type="button" onClick={gerar} disabled={pendente}
        className={compacto
          ? "inline-flex items-center gap-1 rounded-lg border border-brand-200 px-3 py-1.5 text-[12px] font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-50"
          : "inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-brand-700 disabled:opacity-50"}
      >
        <Link2 className={compacto ? "h-3.5 w-3.5" : "h-4 w-4"} /> {pendente ? "Gerando…" : compacto ? "Gerar link de cadastro" : "Gerar link de convite Admin"}
      </button>

      {mensagem && (
        <div className={`mt-3 rounded-lg px-3 py-2.5 text-[12.5px] ${link ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>
          <p>{mensagem}</p>
          {link && (
            <div className="mt-2 flex items-center gap-2">
              <input
                readOnly value={link} onFocus={(e) => e.currentTarget.select()}
                className="min-w-0 flex-1 rounded-md border border-emerald-200 bg-white px-2.5 py-1.5 font-mono text-[12px] text-zinc-800"
              />
              <button type="button" onClick={copiar} className="inline-flex shrink-0 items-center gap-1 rounded-md border border-emerald-300 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-emerald-800 hover:bg-emerald-100">
                {copiado ? <><Check className="h-3.5 w-3.5" /> Copiado</> : <><Copy className="h-3.5 w-3.5" /> Copiar</>}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
