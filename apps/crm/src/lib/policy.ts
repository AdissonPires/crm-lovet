export type Role = "owner" | "admin" | "admin2" | "manager" | "rep" | "sdr" | "viewer";

// Capacidades por papel. Cada módulo tem uma capability própria:
//  - view_presales                 → Pré-vendas (SDR)
//  - view_pipeline / manage_records → Vendas
//  - view_financials               → Financeiro (ERP)
//  - view_team_dashboard           → Visão consolidada da equipe (faturamento, ranking, acessos)
// sdr = pré-vendedor: qualifica leads e conversa no WhatsApp, não vê o funil
// de vendas nem o financeiro.
// manage_access (owner/admin): dar/retirar acesso, resetar senha e convidar Admins — o Gestor tem as
// mesmas telas, mas não gerencia acessos.
// export_data: baixar relatórios (Excel/PDF) e CSV/PNG/SVG dos gráficos. O admin2 enxerga
// tudo como o Admin, mas NÃO exporta nem gerencia acessos.
// view_team_dashboard fica só com quem gerencia a operação — rep/sdr
// não veem faturamento consolidado nem o ranking dos outros.
// view_own_dashboard (rep): visão "Minha visão", travada nos dados DELA. O escopo é
// forçado no servidor, nunca pelo navegador.
const capabilities: Record<Role, Set<string>> = {
  owner: new Set(["view_presales", "view_pipeline", "view_financials", "manage_records", "use_ai", "use_whatsapp", "view_team_dashboard", "manage_access", "export_data"]),
  admin: new Set(["view_presales", "view_pipeline", "view_financials", "manage_records", "use_ai", "use_whatsapp", "view_team_dashboard", "manage_access", "export_data"]),
  admin2: new Set(["view_presales", "view_pipeline", "view_financials", "manage_records", "use_ai", "use_whatsapp", "view_team_dashboard"]),
  manager: new Set(["view_presales", "view_pipeline", "view_financials", "manage_records", "use_ai", "use_whatsapp", "view_team_dashboard", "export_data"]),
  rep: new Set(["view_presales", "view_pipeline", "manage_records", "use_ai", "use_whatsapp", "view_own_dashboard", "export_data"]),
  sdr: new Set(["view_presales", "manage_records", "use_ai", "use_whatsapp"]),
  viewer: new Set(["view_presales", "view_pipeline"]),
};

export function can(role: string, action: string): boolean {
  return capabilities[role as Role]?.has(action) ?? false;
}

/** Teto de linhas por tabela do dashboard pra quem não tem `export_data` — vê o recorte, não leva a base inteira. */
export const LIMITE_LINHAS_SEM_EXPORTAR = 500;
