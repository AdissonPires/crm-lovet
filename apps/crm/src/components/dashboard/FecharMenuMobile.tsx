"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Fecha o menu lateral do celular ao trocar de página. O menu abre/fecha por
 * um checkbox oculto (#menu-mobile, CSS puro no layout); a navegação do Next
 * não recarrega o layout, então sem isto o menu continuaria aberto por cima
 * da página nova.
 */
export function FecharMenuMobile() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  useEffect(() => {
    const menu = document.getElementById("menu-mobile") as HTMLInputElement | null;
    if (menu) menu.checked = false;
  }, [pathname, searchParams]);
  return null;
}
