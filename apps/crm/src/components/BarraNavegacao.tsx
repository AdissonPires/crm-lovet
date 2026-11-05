"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Barra fina no topo enquanto a página nova carrega (menu, filtros, links).
 * Sem ela, entre o clique e a troca dos dados a tela ficava parada — parecia
 * travado mesmo quando levava meio segundo.
 *
 * O App Router não expõe evento de "navegação começou": o início é o clique em
 * link interno / envio de formulário GET (guardando de qual rota saiu), e a
 * barra some sozinha quando a rota atual deixa de ser essa. Trava de 15 s.
 */
function rotaDe(pathname: string, search: string) {
  return `${pathname}?${new URLSearchParams(search).toString()}`;
}

export function BarraNavegacao() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rotaAtual = rotaDe(pathname, searchParams.toString());
  const [saindoDe, setSaindoDe] = useState<{ rota: string; desde: number } | null>(null);
  const [progresso, setProgresso] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const visivel = saindoDe !== null && saindoDe.rota === rotaAtual;

  // Enquanto visível, avança devagar até ~90% (o resto "completa" ao trocar a página).
  useEffect(() => {
    if (!visivel) return;
    timer.current = setInterval(() => {
      setProgresso((p) => (p < 90 ? p + (90 - p) * 0.12 : p));
      if (saindoDe && Date.now() - saindoDe.desde > 15000) setSaindoDe(null);
    }, 150);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [visivel, saindoDe]);

  useEffect(() => {
    function comecar() {
      setProgresso(12);
      setSaindoDe({ rota: rotaDe(location.pathname, location.search), desde: Date.now() });
    }

    function aoClicar(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      const url = new URL(a.href, location.href);
      // Só troca de página interna — rota de API/arquivo (relatórios) não navega.
      if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      comecar();
    }

    function aoEnviar(e: SubmitEvent) {
      const form = e.target as HTMLFormElement | null;
      if (!form || e.defaultPrevented) return;
      // Filtro (GET pra uma página). Server Action (POST) tem o próprio estado de envio.
      if ((form.getAttribute("method") ?? "get").toLowerCase() !== "get") return;
      const url = new URL(form.getAttribute("action") || location.href, location.href);
      if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
      // Filtrar sem mudar nada não troca de rota — a barra ficaria presa.
      const destino = new URLSearchParams();
      new FormData(form).forEach((v, k) => { if (typeof v === "string") destino.append(k, v); });
      if (rotaDe(url.pathname, destino.toString()) === rotaDe(location.pathname, location.search)) return;
      comecar();
    }

    document.addEventListener("click", aoClicar, true);
    document.addEventListener("submit", aoEnviar, true);
    return () => {
      document.removeEventListener("click", aoClicar, true);
      document.removeEventListener("submit", aoEnviar, true);
    };
  }, []);

  if (!visivel) return null;
  return (
    <div className="fixed top-0 inset-x-0 z-[60] h-[3px] pointer-events-none" aria-hidden>
      <div
        className="h-full bg-brand-500 shadow-[0_0_8px_rgba(59,130,246,0.6)] transition-[width] duration-150 ease-out"
        style={{ width: `${progresso}%` }}
      />
    </div>
  );
}
