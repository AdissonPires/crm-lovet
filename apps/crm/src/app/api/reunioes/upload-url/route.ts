import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/policy";
import { storageMode, urlUploadAudioReuniao, TIPOS_AUDIO, TAMANHO_MAXIMO_AUDIO } from "@/lib/storage";

/**
 * Primeiro passo do upload em produção (Vercel + Supabase Storage): cria a
 * reunião e devolve uma URL assinada pro navegador mandar o áudio direto pro
 * Storage — a Vercel recusa corpo acima de 4,5 MB, e reunião passa disso fácil.
 *
 * Sem Supabase Storage (stack local), responde `{ modo: "direto" }` e o
 * Gravador cai no POST /api/reunioes de sempre, com o arquivo no corpo.
 */
export async function POST(req: Request) {
  const user = await requireUser();
  if (!can(user.role, "use_ai")) {
    return NextResponse.json({ ok: false, error: "Sem permissão para usar a IA." }, { status: 403 });
  }
  if (storageMode() !== "supabase") return NextResponse.json({ ok: true, modo: "direto" });

  const body = await req.json().catch(() => null);
  const tamanho = Number(body?.tamanho ?? 0);
  if (tamanho > TAMANHO_MAXIMO_AUDIO) {
    return NextResponse.json({ ok: false, error: "Gravação acima de 120 MB." }, { status: 413 });
  }
  const tipo = String(body?.tipo ?? "");
  const tipoBase = tipo.split(";")[0].trim();
  if (tipo && !TIPOS_AUDIO.has(tipo) && !TIPOS_AUDIO.has(tipoBase)) {
    return NextResponse.json({ ok: false, error: `Formato de áudio não aceito: ${tipo}` }, { status: 415 });
  }

  const titulo = String(body?.titulo ?? "").trim();
  const duracao = Number(body?.duracaoSeg ?? 0);
  const opportunityId = String(body?.opportunityId ?? "").trim();

  const [nota] = await db.insert(s.meetingNotes).values({
    workspaceId: user.workspaceId,
    title: titulo || `Reunião de ${new Date().toLocaleDateString("pt-BR")}`,
    relatedToType: opportunityId ? "opportunity" : undefined,
    relatedToId: opportunityId || undefined,
    audioMime: tipoBase || "audio/webm",
    durationSec: Number.isFinite(duracao) && duracao > 0 ? Math.round(duracao) : null,
    // Nasce como "erro" e só vira "pendente"/"transcrevendo" quando o navegador
    // termina de mandar o áudio e chama /processar. Se o envio for interrompido
    // (aba fechada, conexão caiu), fica o aviso certo — antes ficava "Na fila"
    // pra sempre, sem arquivo nenhum no Storage (visto em 09/10/2026).
    status: "erro",
    errorMessage: "A gravação não chegou ao servidor (o envio foi interrompido). Grave de novo.",
    createdBy: user.id,
  }).returning({ id: s.meetingNotes.id });

  try {
    const { caminho, uploadUrl } = await urlUploadAudioReuniao(nota.id);
    await db.update(s.meetingNotes).set({ audioPath: caminho }).where(eq(s.meetingNotes.id, nota.id));
    return NextResponse.json({ ok: true, modo: "assinado", id: nota.id, uploadUrl });
  } catch (e) {
    await db.delete(s.meetingNotes).where(eq(s.meetingNotes.id, nota.id));
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "falha ao preparar o upload" }, { status: 500 });
  }
}
