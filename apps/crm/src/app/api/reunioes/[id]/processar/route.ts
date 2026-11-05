import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/policy";
import { transcreverReuniao, analisarReuniao } from "@/lib/meetings";

/**
 * Roda o processamento da reunião: transcreve e depois analisa.
 *
 * Uma requisição por etapa, escolhida pelo cliente, para a tela poder dizer em
 * qual fase está — "transcrevendo" e "analisando" têm durações muito
 * diferentes, e uma barra genérica de 4 minutos não informa nada.
 *
 * `etapa=tudo` faz as duas em sequência, para quem só quer clicar uma vez.
 */
// Teto de função no Hobby da Vercel. Com a transcrição no Groq uma reunião de
// 1 h sai em ~1 min, e a ata no Claude em outro — cabe.
export const maxDuration = 300;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (!can(user.role, "use_ai")) {
    return NextResponse.json({ ok: false, error: "Sem permissão para usar a IA." }, { status: 403 });
  }

  const { id } = await params;
  const etapa = new URL(req.url).searchParams.get("etapa") ?? "tudo";

  try {
    if (etapa === "transcrever") {
      const texto = await transcreverReuniao(id, user.workspaceId);
      return NextResponse.json({ ok: true, etapa: "transcrito", caracteres: texto.length });
    }

    if (etapa === "analisar") {
      const analise = await analisarReuniao(id, user.workspaceId, user.id);
      return NextResponse.json({ ok: true, etapa: "analisado", analise });
    }

    await transcreverReuniao(id, user.workspaceId);
    const analise = await analisarReuniao(id, user.workspaceId, user.id);
    return NextResponse.json({ ok: true, etapa: "analisado", analise });
  } catch (e) {
    // O motivo real vai para a tela: "Whisper retornou 500" e "a transcrição
    // saiu vazia" pedem ações diferentes de quem gravou.
    const msg = e instanceof Error ? e.message : "erro desconhecido";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
