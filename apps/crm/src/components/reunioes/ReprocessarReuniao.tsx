"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCw } from "lucide-react";

/**
 * Reprocessa uma reunião que falhou ou ficou parada — o áudio continua
 * guardado. Transcrever é idempotente (se já tem transcrição, só devolve) e a
 * análise apaga os encaminhamentos antigos antes de criar de novo.
 */
export function ReprocessarReuniao({ id }: { id: string }) {
  const router = useRouter();
  const [fase, setFase] = useState<"parado" | "transcrevendo" | "analisando">("parado");
  const [erro, setErro] = useState<string | null>(null);

  async function processar() {
    setErro(null);
    try {
      setFase("transcrevendo");
      const tr = await fetch(`/api/reunioes/${id}/processar?etapa=transcrever`, { method: "POST" });
      const trJson = await tr.json();
      if (!tr.ok || !trJson.ok) throw new Error(trJson.error ?? "falha ao transcrever");
      setFase("analisando");
      const an = await fetch(`/api/reunioes/${id}/processar?etapa=analisar`, { method: "POST" });
      const anJson = await an.json();
      if (!an.ok || !anJson.ok) throw new Error(anJson.error ?? "falha ao analisar");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "erro desconhecido");
    } finally {
      setFase("parado");
      router.refresh();
    }
  }

  const ocupado = fase !== "parado";
  return (
    <div className="px-5 pb-4">
      <button onClick={processar} disabled={ocupado}
        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 transition-colors">
        {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
        {fase === "transcrevendo" ? "Transcrevendo…" : fase === "analisando" ? "Montando a ata…" : "Processar de novo"}
      </button>
      {erro && <p className="text-[11px] text-red-600 mt-1.5">{erro}</p>}
    </div>
  );
}
