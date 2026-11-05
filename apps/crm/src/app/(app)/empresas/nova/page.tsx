import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/policy";
import { createCompany } from "@/app/actions-create";

export default async function NovoClientePage() {
  const user = await requireUser();
  if (!can(user.role, "manage_records")) redirect("/conta/senha");

  const input = "w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";
  const label = "block text-xs font-medium text-zinc-500 mb-1";
  const section = "text-sm font-semibold text-zinc-700 pt-2";

  return (
    <div className="p-4 md:p-8 max-w-xl">
      <h1 className="text-2xl font-bold text-zinc-900 tracking-tight mb-6">Novo cliente</h1>
      <form action={createCompany} className="space-y-4 rounded-2xl bg-white border border-zinc-100 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-14px_rgba(0,0,0,0.12)] p-6">
        <div>
          <label className={label}>Nome completo *</label>
          <input name="name" required placeholder="Ex.: Maria da Silva" className={input} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={label}>CPF</label>
            <input name="contactCpf" inputMode="numeric" placeholder="000.000.000-00" className={input} />
          </div>
          <div>
            <label className={label}>Data de nascimento</label>
            <input name="contactBirthDate" type="date" className={input} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={label}>Telefone / WhatsApp</label>
            <input name="contactPhone" type="tel" placeholder="(48) 99999-0000" className={input} />
          </div>
          <div>
            <label className={label}>E-mail</label>
            <input name="contactEmail" type="email" className={input} />
          </div>
        </div>

        <div className={section}>Endereço</div>
        <div>
          <label className={label}>Endereço</label>
          <input name="siteAddress" className={input} />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <label className={label}>Cidade</label>
            <input name="siteCity" className={input} />
          </div>
          <div>
            <label className={label}>UF</label>
            <input name="siteState" defaultValue="SC" maxLength={2} className={input} />
          </div>
        </div>

        <button className="rounded-xl bg-zinc-900 text-white text-[13px] font-semibold px-6 py-2.5 hover:bg-zinc-700 shadow-sm transition-colors">
          Criar cliente
        </button>
      </form>
    </div>
  );
}
