import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { Mic } from "lucide-react";
import { db, schema as s } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/policy";
import { Gravador } from "@/components/reunioes/Gravador";
import { AtaReuniao, podeReprocessar, type AtaItem } from "@/components/reunioes/AtaReuniao";
import type { MeetingAnalysis } from "@/lib/ai";

/**
 * FeedMeet — a IA que ouve a reunião e devolve a ata (tópicos, insights e
 * encaminhamentos). Substituiu o Discador a pedido do negócio. /discador redireciona pra cá.
 */
export default async function FeedMeetPage() {
  const user = await requireUser();
  if (!can(user.role, "view_pipeline")) redirect("/projetos");

  const atas = await carregarAtas(user.workspaceId);
  const card = "rounded-2xl bg-white border border-zinc-100 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-14px_rgba(0,0,0,0.12)]";

  return (
    <div className="p-4 md:p-8 max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">FeedMeet</h1>
        <p className="text-sm text-zinc-500 mt-0.5">
          Grave a reunião e a IA devolve a ata: tópicos, insights e quem ficou com cada tarefa.
        </p>
      </div>

      <div className="space-y-5">
        <Gravador />
        {atas.length === 0 && (
          <div className={`${card} p-10 text-center`}>
            <Mic className="h-8 w-8 text-zinc-300 mx-auto mb-3" />
            <div className="font-semibold text-zinc-800">Nenhuma reunião gravada ainda</div>
            <p className="text-sm text-zinc-500 mt-1">
              Clique em “Começar a gravar” e conduza a reunião normalmente. Ao parar, a IA monta a ata.
            </p>
          </div>
        )}
        {atas.map((ata) => <AtaReuniao key={ata.id} ata={ata} />)}
      </div>
    </div>
  );
}

/**
 * Atas com seus encaminhamentos.
 *
 * Duas consultas em vez de um join: uma reunião tem muitos encaminhamentos e o
 * join repetiria a transcrição inteira — que pode ter milhares de caracteres —
 * em cada linha do resultado.
 */
async function carregarAtas(workspaceId: string): Promise<AtaItem[]> {
  const notas = await db.select().from(s.meetingNotes)
    .where(eq(s.meetingNotes.workspaceId, workspaceId))
    .orderBy(desc(s.meetingNotes.createdAt))
    .limit(20);
  if (notas.length === 0) return [];

  const itens = await db.select({
    item: s.meetingActionItems,
    ownerNome: s.users.name,
  }).from(s.meetingActionItems)
    .leftJoin(s.users, eq(s.users.id, s.meetingActionItems.ownerId))
    .where(eq(s.meetingActionItems.workspaceId, workspaceId));

  return notas.map((n) => ({
    id: n.id,
    titulo: n.title,
    status: n.status,
    errorMessage: n.errorMessage,
    durationSec: n.durationSec,
    createdAt: n.createdAt,
    analysis: (n.analysis as MeetingAnalysis | null) ?? null,
    transcript: n.transcript,
    podeReprocessar: podeReprocessar(n, Date.now()),
    encaminhamentos: itens
      .filter((i) => i.item.meetingNoteId === n.id)
      .map((i) => ({
        id: i.item.id,
        description: i.item.description,
        ownerName: i.item.ownerName,
        ownerNome: i.ownerNome ?? null,
        dueHint: i.item.dueHint,
        virouTarefa: !!i.item.taskId,
      })),
  }));
}
