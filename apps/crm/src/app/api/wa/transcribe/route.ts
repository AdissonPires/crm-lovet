import { NextResponse } from "next/server";
import { checkToken } from "@/lib/waApi";

/** Termos que o Whisper erra sem contexto em áudio de cliente (ex.: nomes de produto e siglas). */
const VOCABULARIO_WHATSAPP =
  "Mensagem de cliente da Lovet Distribuidora sobre pedido, orçamento, entrega, nota fiscal, boleto e Pix.";

/**
 * Transcreve áudio via Whisper. Existe porque o n8n NÃO consegue fazer essa
 * chamada diretamente: o Code node roda num processo separado (Task Runner)
 * e, ao mandar um Buffer binário pro processo principal montar a requisição
 * HTTP, o Buffer é serializado como {type:"Buffer", data:[...]} — vira um
 * "campo" multipart por byte de áudio, e o servidor rejeita com "too many
 * fields". Aqui é Node.js de verdade, sem essa restrição: fetch/FormData/
 * Blob funcionam normalmente.
 * Header: x-webhook-token: <WA_API_TOKEN>
 * Body: { base64: string, mimetype?: string }
 */
export async function POST(req: Request) {
  if (!checkToken(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const base64 = body?.base64;
  if (!base64) {
    return NextResponse.json({ ok: false, error: "base64 is required" }, { status: 400 });
  }
  const mimetype = String(body?.mimetype ?? "audio/ogg");

  const buffer = Buffer.from(base64, "base64");
  const form = new FormData();
  form.append("audio_file", new Blob([buffer], { type: mimetype }), "audio.ogg");

  // Vocabulário do negócio no `initial_prompt` (mesma técnica das atas, em
  // lib/meetings.ts) + `vad_filter` pra ignorar silêncio.
  const params = new URLSearchParams({
    task: "transcribe",
    language: "pt",
    output: "json",
    vad_filter: "true",
    initial_prompt: VOCABULARIO_WHATSAPP,
  });
  const whisperUrl = process.env.WHISPER_URL ?? "http://whisper:9000";
  const res = await fetch(`${whisperUrl}/asr?${params.toString()}`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return NextResponse.json({ ok: false, error: `whisper respondeu ${res.status}`, detail }, { status: 502 });
  }

  const data = await res.json() as { text?: string };
  return NextResponse.json({ ok: true, text: String(data.text ?? "").trim() });
}
