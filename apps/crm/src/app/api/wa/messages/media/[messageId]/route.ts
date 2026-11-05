import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { lerMidia } from "@/lib/storage";

/**
 * Serve o anexo de uma mensagem 1:1 por URL — é assim que a Evolution API
 * busca o arquivo pra anexar (sendMedia aceita URL, não só base64). Mesmo
 * padrão e mesmo risco aceito da rota de mídia de campanha: sem autenticação
 * por header, só o id (UUID) não adivinhável.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ messageId: string }> },
) {
  const { messageId } = await params;

  const [msg] = await db.select().from(s.whatsappMessages).where(eq(s.whatsappMessages.id, messageId));
  if (!msg?.mediaPath) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const buffer = await lerMidia(msg.mediaPath);
  const contentType = msg.mediaMime ?? (
    msg.mediaType === "video" ? "video/mp4" : msg.mediaType === "document" ? "application/pdf" : "image/jpeg"
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: { "Content-Type": contentType, "Cache-Control": "private, max-age=3600" },
  });
}
