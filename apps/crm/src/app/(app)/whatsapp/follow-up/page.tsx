import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowLeft, Bot } from "lucide-react";
import { db, schema as s } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/policy";
import { PageHeader, card } from "@/components/ui";
import { lerFollowupConfig, renderizarMensagem } from "@/lib/followupConfig";
import { salvarFollowupConfig } from "@/app/actions-whatsapp";

/**
 * Bot e follow-up automático — só o gestor edita (decisão de negócio:
 * "somente um gestor, número para follow-up, vai ter bot; o resto manual").
 * Ver lib/followupConfig.ts.
 */
export default async function FollowupConfigPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; erro?: string }>;
}) {
  const user = await requireUser();
  if (!can(user.role, "view_team_dashboard")) redirect("/whatsapp");
  const { ok, erro } = await searchParams;

  const [ws] = await db.select({ settings: s.workspaces.settings }).from(s.workspaces).where(eq(s.workspaces.id, user.workspaceId));
  const config = lerFollowupConfig(ws?.settings);
  const campo = "w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm focus:outline-none focus:border-brand-400";

  return (
    <div className="p-4 md:p-8 max-w-3xl">
      <Link href="/whatsapp" className="inline-flex items-center gap-1.5 text-[13px] text-zinc-500 hover:text-zinc-800 mb-4">
        <ArrowLeft className="h-4 w-4" /> Voltar ao WhatsApp
      </Link>
      <PageHeader
        module="WhatsApp"
        title="Bot e follow-up automático"
        subtitle="Só o número do gestor tem bot e envia follow-up. Os números dos consultores são atendidos manualmente."
      />
      {ok && <div className="mb-4 rounded-lg bg-emerald-50 text-emerald-700 text-[13px] px-3 py-2">Configuração salva. O n8n usa na próxima execução.</div>}
      {erro && <div className="mb-4 rounded-lg bg-red-50 text-red-700 text-[13px] px-3 py-2">{erro}</div>}

      <form action={salvarFollowupConfig} className={`${card} p-6 space-y-5`}>
        <div>
          <label className="block text-[13px] font-semibold text-zinc-800 mb-1">Número do gestor (instância da Evolution)</label>
          <input name="instanciaGestor" defaultValue={config.instanciaGestor} className={campo} />
          <p className="text-[12px] text-zinc-500 mt-1">
            Nome da instância conectada ao número do gestor. O chatbot só responde mensagens que chegam por ela; nas demais, a conversa é só registrada no CRM.
          </p>
        </div>

        <div>
          <label className="block text-[13px] font-semibold text-zinc-800 mb-1">Retomada — cliente parou de responder há 3 dias</label>
          <textarea name="mensagemRetomada" rows={3} defaultValue={config.mensagemRetomada} className={campo} />
          <p className="text-[12px] text-zinc-500 mt-1">
            Enviada no máximo 2 vezes, a cada 3 dias. Use <code className="bg-zinc-100 px-1 rounded">{"{nome}"}</code> para o primeiro nome.
            Exemplo: “{renderizarMensagem(config.mensagemRetomada, "Maria Silva")}”
          </p>
        </div>

        <div>
          <label className="block text-[13px] font-semibold text-zinc-800 mb-1">30 dias depois do primeiro contato</label>
          <textarea name="mensagem30Dias" rows={3} defaultValue={config.mensagem30Dias} className={campo} />
          <p className="text-[12px] text-zinc-500 mt-1">Exemplo: “{renderizarMensagem(config.mensagem30Dias, "Maria Silva")}”</p>
        </div>

        <div className="rounded-xl border border-zinc-100 bg-zinc-50/60 p-4 space-y-3">
          <label className="flex items-center gap-2 text-[13px] font-semibold text-zinc-800">
            <input type="checkbox" name="usarIaNaRetomada" defaultChecked={config.usarIaNaRetomada} className="h-4 w-4" />
            <Bot className="h-4 w-4 text-brand-600" /> Personalizar a retomada com IA
          </label>
          <p className="text-[12px] text-zinc-500">
            A IA lê a conversa e escreve uma retomada específica. Se falhar, vai a mensagem de retomada acima.
          </p>
          <textarea name="instrucaoIa" rows={4} defaultValue={config.instrucaoIa} className={campo} />
        </div>

        <button type="submit" className="rounded-xl bg-zinc-900 text-white text-[13px] font-semibold px-5 py-2.5 hover:bg-zinc-700 transition-colors">
          Salvar
        </button>
      </form>
    </div>
  );
}
