import { NextResponse } from "next/server";
import { upsertInboundLead } from "@/lib/leadIngest";

/**
 * Webhook de Lead Ads da Meta (Facebook/Instagram). Meta manda so o
 * `leadgen_id` no evento; os dados do formulario (nome, telefone, email) sao
 * buscados depois na Graph API com o token da pagina.
 *
 * Handshake de verificacao (GET) exigido pela Meta ao cadastrar o webhook:
 * https://developers.facebook.com/docs/graph-api/webhooks/getting-started
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token && token === process.env.META_VERIFY_TOKEN) {
    return new Response(challenge ?? "", { status: 200 });
  }
  return NextResponse.json({ ok: false }, { status: 403 });
}

type MetaLeadgenChange = {
  field: string;
  value?: { leadgen_id?: string; page_id?: string; form_id?: string };
};

type MetaFieldData = { name: string; values: string[] };

function extractField(fields: MetaFieldData[], ...names: string[]): string | null {
  for (const n of names) {
    const f = fields.find((x) => x.name.toLowerCase() === n);
    if (f?.values?.[0]) return f.values[0];
  }
  return null;
}

export async function POST(req: Request) {
  const pageToken = process.env.META_PAGE_ACCESS_TOKEN;
  if (!pageToken) {
    return NextResponse.json({ ok: false, error: "META_PAGE_ACCESS_TOKEN nao configurado" }, { status: 500 });
  }

  const body = await req.json().catch(() => null);
  const entries: { changes?: MetaLeadgenChange[] }[] = body?.entry ?? [];

  const results: { leadgenId: string; leadId?: string; error?: string }[] = [];

  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      const leadgenId = change.value?.leadgen_id;
      if (change.field !== "leadgen" || !leadgenId) continue;

      try {
        const res = await fetch(
          `https://graph.facebook.com/v19.0/${leadgenId}?access_token=${pageToken}`,
        );
        if (!res.ok) throw new Error(`Graph API respondeu ${res.status}`);
        const data = await res.json() as { field_data?: MetaFieldData[]; platform?: string };
        const fields = data.field_data ?? [];

        const phone = extractField(fields, "phone_number", "phone");
        if (!phone) throw new Error("formulario sem telefone");

        const { leadId } = await upsertInboundLead({
          channel: "meta_ads",
          socialNetwork: data.platform === "ig" ? "instagram" : "facebook",
          name: extractField(fields, "full_name", "first_name") ?? phone,
          phone,
          email: extractField(fields, "email"),
          city: extractField(fields, "city"),
        });
        results.push({ leadgenId, leadId });
      } catch (err) {
        results.push({ leadgenId, error: err instanceof Error ? err.message : String(err) });
      }
    }
  }

  return NextResponse.json({ ok: true, results });
}
