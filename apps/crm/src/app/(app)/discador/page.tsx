import { redirect } from "next/navigation";

/**
 * O Discador saiu do CRM (decisão de negócio) — ficou só a IA
 * que ouve a reunião, agora em /feedmeet. Mantido como redirecionamento pra
 * não quebrar link salvo. As actions de ligação (actions-sales.ts) e a rota
 * /api/dialer/import continuam no código, sem tela.
 */
export default function DiscadorPage() {
  redirect("/feedmeet");
}
