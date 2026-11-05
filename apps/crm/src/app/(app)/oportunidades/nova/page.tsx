import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/policy";
import { createOpportunity } from "@/app/actions-create";
import { LEAD_SOURCES } from "@/lib/leadSources";

export default async function NovaOportunidadePage() {
  const user = await requireUser();
  if (!can(user.role, "manage_records")) redirect("/projetos");

  const clientes = await db.select().from(s.companies)
    .where(eq(s.companies.workspaceId, user.workspaceId));

  const input = "w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";
  const label = "block text-xs font-medium text-zinc-500 mb-1";
  const section = "text-sm font-semibold text-zinc-700 pt-2";

  return (
    <div className="p-4 md:p-8 max-w-xl">
      <h1 className="text-2xl font-bold text-zinc-900 tracking-tight mb-1">Nova oportunidade</h1>
      <p className="text-sm text-zinc-500 mb-6">Preencha na ordem do atendimento — se o cliente ainda não existe, ele é criado automaticamente.</p>
      <form action={createOpportunity} className="space-y-4 rounded-2xl bg-white border border-zinc-100 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-14px_rgba(0,0,0,0.12)] p-6">
        <div className={section}>1 · Quem é o cliente</div>
        <div>
          <label className={label}>Nome do cliente *</label>
          <input name="customerName" required list="clientes-existentes" placeholder="Ex.: Maria da Silva" className={input} />
          <datalist id="clientes-existentes">
            {clientes.map((c) => <option key={c.id} value={c.name} />)}
          </datalist>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={label}>Telefone / WhatsApp *</label>
            <input name="phone" required type="tel" placeholder="(48) 99999-0000" className={input} />
          </div>
          <div>
            <label className={label}>CPF</label>
            <input name="cpf" inputMode="numeric" placeholder="000.000.000-00" className={input} />
          </div>
        </div>
        <div>
          <label className={label}>Data de nascimento</label>
          <input name="birthDate" type="date" className={input} />
        </div>

        <div className={section}>2 · Onde ele mora</div>
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <label className={label}>Cidade</label>
            <input name="city" placeholder="Florianópolis" className={input} />
          </div>
          <div>
            <label className={label}>UF</label>
            <input name="state" defaultValue="SC" maxLength={2} className={input} />
          </div>
        </div>

        <div className={section}>3 · Sobre a venda</div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={label}>De onde veio o lead *</label>
            <select name="leadSource" required className={input}>
              <option value="">Selecione…</option>
              {LEAD_SOURCES.map((src) => <option key={src}>{src}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>Qtd. de itens</label>
            <input name="productQty" type="number" min="1" placeholder="2" className={input} />
          </div>
        </div>
        <div>
          <label className={label}>Fechamento esperado</label>
          <input name="expectedCloseDate" type="date" className={input} />
        </div>
        <button className="w-full rounded-xl bg-zinc-900 text-white text-[13px] font-semibold px-6 py-2.5 hover:bg-zinc-700 shadow-sm transition-colors">
          Criar oportunidade
        </button>
      </form>
    </div>
  );
}
