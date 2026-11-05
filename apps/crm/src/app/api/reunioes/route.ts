import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/policy";
import { salvarAudioReuniao, TIPOS_AUDIO, TAMANHO_MAXIMO_AUDIO } from "@/lib/storage";

/**
 * Recebe a gravação da reunião e devolve o id, sem processar nada.
 *
 * O upload é separado do processamento de propósito: transcrever leva minutos,
 * e amarrar as duas coisas na mesma requisição significa que um timeout do
 * navegador perde o áudio — a única parte que não se pode refazer. Aqui o
 * arquivo fica salvo em segundos e a etapa lenta roda depois, retomável.
 */
export async function POST(req: Request) {
  const user = await requireUser();
  if (!can(user.role, "use_ai")) {
    return NextResponse.json({ ok: false, error: "Sem permissão para usar a IA." }, { status: 403 });
  }

  const form = await req.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!(audio instanceof File) || audio.size === 0) {
    return NextResponse.json({ ok: false, error: "Envie o arquivo de áudio." }, { status: 400 });
  }
  if (audio.size > TAMANHO_MAXIMO_AUDIO) {
    return NextResponse.json({ ok: false, error: "Gravação acima de 120 MB." }, { status: 413 });
  }

  // O MediaRecorder manda o codec junto ("audio/webm;codecs=opus"), então a
  // comparação é pelo tipo base — senão toda gravação do Chrome seria recusada.
  const tipoBase = audio.type.split(";")[0].trim();
  if (audio.type && !TIPOS_AUDIO.has(audio.type) && !TIPOS_AUDIO.has(tipoBase)) {
    return NextResponse.json({ ok: false, error: `Formato de áudio não aceito: ${audio.type}` }, { status: 415 });
  }

  const titulo = String(form?.get("titulo") ?? "").trim();
  const duracao = Number(form?.get("duracaoSeg") ?? 0);
  const opportunityId = String(form?.get("opportunityId") ?? "").trim();

  const [nota] = await db.insert(s.meetingNotes).values({
    workspaceId: user.workspaceId,
    title: titulo || `Reunião de ${new Date().toLocaleDateString("pt-BR")}`,
    relatedToType: opportunityId ? "opportunity" : undefined,
    relatedToId: opportunityId || undefined,
    audioMime: tipoBase || "audio/webm",
    durationSec: Number.isFinite(duracao) && duracao > 0 ? Math.round(duracao) : null,
    status: "pendente",
    createdBy: user.id,
  }).returning({ id: s.meetingNotes.id });

  const buffer = Buffer.from(await audio.arrayBuffer());
  const caminho = await salvarAudioReuniao(nota.id, buffer);
  await db.update(s.meetingNotes).set({ audioPath: caminho })
    .where(eq(s.meetingNotes.id, nota.id));

  return NextResponse.json({ ok: true, id: nota.id });
}

