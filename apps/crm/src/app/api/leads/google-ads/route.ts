import { NextResponse } from "next/server";
import { upsertInboundLead } from "@/lib/leadIngest";

/**
 * Webhook de formulario de leads do Google Ads (Lead Form Extensions).
 * Google manda um array `user_column_data` com pares column_name/string_value,
 * mais uma `google_key` que precisa bater com a que foi cadastrada no Google
 * Ads Manager na hora de configurar o webhook.
 * https://developers.google.com/google-ads/webhook
 */
type GoogleColumn = { column_id?: string; column_name?: string; string_value?: string };

function extractColumn(columns: GoogleColumn[], ...names: string[]): string | null {
  for (const n of names) {
    const c = columns.find((x) => (x.column_name ?? x.column_id)?.toUpperCase() === n);
    if (c?.string_value) return c.string_value;
  }
  return null;
}

export async function POST(req: Request) {
  const expected = process.env.GOOGLE_ADS_WEBHOOK_KEY;
  const body = await req.json().catch(() => null);

  if (!expected || body?.google_key !== expected) {
    return NextResponse.json({ ok: false, error: "chave invalida" }, { status: 401 });
  }

  const columns: GoogleColumn[] = body?.user_column_data ?? [];
  const phone = extractColumn(columns, "PHONE_NUMBER");
  if (!phone) {
    return NextResponse.json({ ok: false, error: "formulario sem telefone" }, { status: 400 });
  }

  const { leadId } = await upsertInboundLead({
    channel: "google_ads",
    name: extractColumn(columns, "FULL_NAME", "FIRST_NAME") ?? phone,
    phone,
    email: extractColumn(columns, "EMAIL"),
    city: extractColumn(columns, "CITY"),
  });

  return NextResponse.json({ ok: true, leadId });
}
