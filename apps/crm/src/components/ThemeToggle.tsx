"use client";

import { Moon, Sun } from "lucide-react";

/** Chave no localStorage; o script do layout raiz lê a mesma pra aplicar o tema antes de pintar. */
export const CHAVE_TEMA = "tema";

/**
 * Alterna tema claro/escuro. O tema vive em `<html data-theme>` (regras em
 * globals.css); aqui só troca o atributo e guarda a escolha. Os dois ícones
 * ficam no HTML e o CSS mostra o certo — assim não depende de estado nem
 * pisca na hidratação.
 */
export function ThemeToggle() {
  function alternar() {
    const html = document.documentElement;
    const proximo = html.dataset.theme === "dark" ? "light" : "dark";
    html.dataset.theme = proximo;
    try { localStorage.setItem(CHAVE_TEMA, proximo); } catch { /* sem armazenamento: vale só nesta página */ }
  }

  return (
    <button
      type="button"
      onClick={alternar}
      title="Alternar tema claro/escuro"
      aria-label="Alternar tema claro/escuro"
      className="h-10 w-10 rounded-xl bg-white border border-slate-200/60 shadow-sm flex items-center justify-center text-zinc-500 hover:text-brand-700 hover:border-brand-200 transition-colors"
    >
      <Moon className="tema-icone-claro h-4 w-4" strokeWidth={2} />
      <Sun className="tema-icone-escuro h-4 w-4" strokeWidth={2} />
    </button>
  );
}
