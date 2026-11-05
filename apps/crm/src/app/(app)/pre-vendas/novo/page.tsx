import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/policy";
import { createPresalesLead } from "@/app/actions-presales";
import { PRESALES_CHANNELS, VISIT_REASONS } from "@/lib/presalesChannels";

export default async function NovoLeadPreVendaPage() {
  const user = await requireUser();
  if (!can(user.role, "manage_records")) redirect("/pre-vendas");

  const input = "w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";
  const label = "block text-xs font-medium text-zinc-500 mb-1";

  return (
    <div className="p-4 md:p-8 max-w-xl">
      <h1 className="text-2xl font-bold text-zinc-900 tracking-tight mb-1">Novo lead de pré-venda</h1>
      <p className="text-sm text-zinc-500 mb-6">Cadastre um lead cru antes dele virar uma oportunidade de verdade.</p>
      <form action={createPresalesLead} className="space-y-4 rounded-2xl bg-white border border-zinc-100 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-14px_rgba(0,0,0,0.12)] p-6">
        <div>
          <label className={label}>Nome *</label>
          <input name="name" required placeholder="Ex.: Maria da Silva" className={input} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={label}>Telefone / WhatsApp *</label>
            <input name="phone" required type="tel" placeholder="(48) 99999-0000" className={input} />
          </div>
          <div>
            <label className={label}>E-mail</label>
            <input name="email" type="email" placeholder="maria@email.com" className={input} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={label}>Canal de origem *</label>
            <select name="channel" required defaultValue="outro" className={input}>
              {PRESALES_CHANNELS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>Rede social (se aplicável)</label>
            <input name="socialNetwork" list="redes-sociais" placeholder="Instagram, Facebook…" className={input} />
            <datalist id="redes-sociais">
              <option value="Instagram" />
              <option value="Facebook" />
              <option value="TikTok" />
              <option value="YouTube" />
            </datalist>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={label}>Motivo da visita/contato</label>
            <select name="visitReason" defaultValue="" className={input}>
              <option value="">Não informado</option>
              {VISIT_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>Custo por lead (R$)</label>
            <input name="costPerLead" defaultValue="0,33" placeholder="0,33" className={input} />
          </div>
        </div>

        <div className="pt-2 text-sm font-semibold text-zinc-700">Perfil do cliente (opcional agora)</div>
        <p className="-mt-2 text-[11px] text-zinc-400">
          Pode ficar em branco — o SDR completa na etapa de qualificação. Estes dados são exigidos
          para entregar o lead ao vendedor.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={label}>Ponto de atendimento</label>
            <input name="pontoAtendimento" list="distribuidoras" placeholder="Lovet Matriz" className={input} />
            <datalist id="distribuidoras">
              <option value="Lovet Matriz" /><option value="Lovet Filial" />
              <option value="Loja online" />
            </datalist>
          </div>
          <div>
            <label className={label}>Qtd. de itens</label>
            <input name="productQty" type="number" min="1" placeholder="2" className={input} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <label className={label}>Cidade</label>
            <input name="city" placeholder="Florianópolis" className={input} />
          </div>
          <div>
            <label className={label}>UF</label>
            <input name="state" maxLength={2} defaultValue="SC" className={input} />
          </div>
        </div>

        <div>
          <label className={label}>Observação</label>
          <textarea name="notes" rows={3} placeholder="Detalhes do contato inicial…" className={input} />
        </div>
        <button className="w-full rounded-xl bg-zinc-900 text-white text-[13px] font-semibold px-6 py-2.5 hover:bg-zinc-700 shadow-sm transition-colors">
          Criar lead
        </button>
      </form>
    </div>
  );
}
