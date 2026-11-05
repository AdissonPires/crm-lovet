import { requireUser } from "@/lib/auth";
import { PageHeader, card } from "@/components/ui";
import { TrocarSenhaForm } from "@/components/equipe/AcessoForms";

/** Trocar a própria senha — qualquer usuário logado. */
export default async function MinhaSenhaPage() {
  const user = await requireUser();
  return (
    <div className="p-4 md:p-8 max-w-[700px]">
      <PageHeader module="Conta" title="Minha senha" subtitle={`${user.name} · ${user.email}`} />
      <div className={`${card} p-6`}><TrocarSenhaForm /></div>
    </div>
  );
}
