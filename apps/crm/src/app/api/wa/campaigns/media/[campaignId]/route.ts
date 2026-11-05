import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { lerMidia } from "@/lib/storage";

/**
 * Serve a mídia de uma campanha por URL — é assim que o Evolution API busca
 * o arquivo pra anexar na mensagem (sendMedia aceita URL, não só base64).
 * Chamada só de dentro da rede Docker (n8n → lovet-crm), então sem
 * autenticação por header: o campaignId (UUID) já não é adivinhável, mesmo
 * risco de exposição que o link de fatura em presales_leads.bill_file_url.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  const { campaignId } = await params;

  const [camp] = await db.select().from(s.campaigns).where(eq(s.campaigns.id, campaignId));
  if (!camp?.mediaPath) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const buffer = await lerMidia(camp.mediaPath);
  const contentType = camp.mediaMime ?? (camp.mediaType === "video" ? "video/mp4" : "image/jpeg");

  return new NextResponse(new Uint8Array(buffer), {
    headers: { "Content-Type": contentType, "Cache-Control": "private, max-age=3600" },
  });
}
