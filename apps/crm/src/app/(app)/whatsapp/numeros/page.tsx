import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { ArrowLeft, Smartphone, Bot, Trash2, QrCode } from "lucide-react";
import { db, schema as s } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/policy";
import { PageHeader, Badge, card } from "@/components/ui";
import { lerFollowupConfig } from "@/lib/followupConfig";
import { estadoDoNumero, qrDoNumero, type EstadoNumero } from "@/lib/whatsapp";
import { conectarNumeroConsultor, removerNumeroConsultor } from "@/app/actions-numeros";
import { AtualizarSozinho } from "@/components/AtualizarSozinho";

const ESTADO: Record<EstadoNumero, { label: string; tom: "green" | "amber" | "zinc" | "red" }> = {
  conectado: { label: "Conectado", tom: "green" },
  aguardando_qr: { label: "Aguardando leitura do QR", tom: "amber" },
  desconectado: { label: "Desconectado", tom: "red" },
  inexistente: { label: "Não existe na Evolution", tom: "red" },
  simulado: { label: "Modo simulado", tom: "zinc" },
};

/**
 * Números de WhatsApp — o do gestor (único com bot) e o de cada consultor
 * (atendimento manual pelo próprio número). Ver app/actions-numeros.ts.
 */
export default async function NumerosWhatsappPage({
  searchParams,
}: {
  searchParams: Promise<{ qr?: string; erro?: string; ok?: string }>;
}) {
  const user = await requireUser();
  if (!can(user.role, "use_whatsapp")) redirect("/");
  const gestor = can(user.role, "view_team_dashboard");
  const { qr, erro, ok } = await searchParams;

  const [ws] = await db.select({ settings: s.workspaces.settings }).from(s.workspaces).where(eq(s.workspaces.id, user.workspaceId));
  const instanciaGestor = lerFollowupConfig(ws?.settings).instanciaGestor;

  const numeros = await db.select({ id: s.whatsappInstances.id, nome: s.whatsappInstances.nome, userId: s.whatsappInstances.userId, dono: s.users.name })
    .from(s.whatsappInstances).leftJoin(s.users, eq(s.users.id, s.whatsappInstances.userId))
    .where(and(eq(s.whatsappInstances.workspaceId, user.workspaceId), ...(gestor ? [] : [eq(s.whatsappInstances.userId, user.id)])));

  const estados = new Map(await Promise.all(
    [...(gestor ? [instanciaGestor] : []), ...numeros.map((n) => n.nome)].map(async (nome) => [nome, await estadoDoNumero(nome)] as const),
  ));
  const qrVisivel = qr && (gestor || numeros.some((n) => n.nome === qr)) && estados.get(qr) !== "conectado" ? await qrDoNumero(qr) : null;

  const membros = gestor
    ? await db.select({ id: s.users.id, nome: s.users.name }).from(s.workspaceMembers).innerJoin(s.users, eq(s.users.id, s.workspaceMembers.userId))
      .where(eq(s.workspaceMembers.workspaceId, user.workspaceId)).orderBy(s.users.name)
    : [];
  const comNumero = new Set(numeros.map((n) => n.userId));
  const semNumero = membros.filter((m) => !comNumero.has(m.id));
  const euTenho = numeros.some((n) => n.userId === user.id);

  return (
    <div className="p-4 md:p-8 max-w-3xl">
      <Link href="/whatsapp" className="inline-flex items-center gap-1.5 text-[13px] text-zinc-500 hover:text-zinc-800 mb-4">
        <ArrowLeft className="h-4 w-4" /> Voltar ao WhatsApp
      </Link>
      <PageHeader module="WhatsApp" title="Números de WhatsApp"
        subtitle="O número do gestor tem bot e faz os follow-ups. Cada consultor atende manualmente pelo próprio número — as conversas dele caem direto pra ele." />
      {erro && <div className="mb-4 rounded-lg bg-red-50 text-red-700 text-[13px] px-3 py-2">{erro}</div>}
      {ok && <div className="mb-4 rounded-lg bg-emerald-50 text-emerald-700 text-[13px] px-3 py-2">Número removido. As conversas dele continuam no CRM e passam a sair pelo número do gestor.</div>}

      {qrVisivel && (
        <div className={`${card} p-5 mb-5 flex flex-col sm:flex-row items-center gap-5`}>
          <AtualizarSozinho segundos={15} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrVisivel} alt="QR Code do WhatsApp" className="h-56 w-56 rounded-lg border border-zinc-100" />
          <div className="text-[13px] text-zinc-600 space-y-1.5">
            <div className="font-semibold text-zinc-900 flex items-center gap-1.5"><QrCode className="h-4 w-4" /> Conectar {qr}</div>
            <p>No celular do consultor: WhatsApp → <b>Configurações</b> → <b>Aparelhos conectados</b> → <b>Conectar um aparelho</b>, e aponte a câmera pro código.</p>
            <p className="text-zinc-400">O código se renova sozinho. Quando conectar, o estado muda pra “Conectado”.</p>
          </div>
        </div>
      )}

      <div className={`${card} divide-y divide-zinc-50`}>
        {gestor && (
          <div className="px-5 py-3.5 flex flex-wrap items-center gap-3">
            <Bot className="h-5 w-5 text-brand-600" />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-zinc-900 text-[14px]">Número do gestor · {instanciaGestor}</div>
              <div className="text-[12px] text-zinc-500">Bot + follow-ups automáticos (configurar em WhatsApp → Follow-up)</div>
            </div>
            <Badge tone={ESTADO[estados.get(instanciaGestor) ?? "desconectado"].tom}>{ESTADO[estados.get(instanciaGestor) ?? "desconectado"].label}</Badge>
          </div>
        )}
        {numeros.map((n) => {
          const estado = estados.get(n.nome) ?? "desconectado";
          return (
            <div key={n.id} className="px-5 py-3.5 flex flex-wrap items-center gap-3">
              <Smartphone className="h-5 w-5 text-zinc-400" />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-zinc-900 text-[14px] truncate">{n.dono ?? "—"}</div>
                <div className="text-[12px] text-zinc-500 truncate">{n.nome} · atendimento manual</div>
              </div>
              <Badge tone={ESTADO[estado].tom}>{ESTADO[estado].label}</Badge>
              {estado !== "conectado" && (
                <Link href={`/whatsapp/numeros?qr=${encodeURIComponent(n.nome)}`} className="text-[12px] font-semibold text-brand-600 hover:text-brand-700">Mostrar QR</Link>
              )}
              <form action={removerNumeroConsultor}>
                <input type="hidden" name="id" value={n.id} />
                <button title="Desconectar e remover" className="p-1.5 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
              </form>
            </div>
          );
        })}
        {!gestor && !euTenho && (
          <div className="px-5 py-5 text-[13px] text-zinc-500">Você ainda não conectou seu número.</div>
        )}
      </div>

      {(gestor ? semNumero.length > 0 : !euTenho) && (
        <form action={conectarNumeroConsultor} className={`${card} p-5 mt-5 flex flex-wrap items-end gap-3`}>
          {gestor ? (
            <label className="flex-1 min-w-[220px]">
              <span className="block text-[13px] font-semibold text-zinc-700 mb-1">Conectar o número de um consultor</span>
              <select name="userId" required defaultValue="" className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm">
                <option value="" disabled>Escolha o consultor</option>
                {semNumero.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </select>
            </label>
          ) : (
            <div className="flex-1 text-[13px] text-zinc-600">Conecte seu WhatsApp pra atender seus clientes pelo CRM.</div>
          )}
          <button className="rounded-xl bg-zinc-900 text-white text-[13px] font-semibold px-4 py-2 hover:bg-zinc-700">Gerar QR Code</button>
        </form>
      )}
    </div>
  );
}
