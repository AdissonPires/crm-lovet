import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { checkToken, getWorkspace } from "@/lib/waApi";

/**
 * Registra o setor escolhido pelo cliente e devolve a persona para a IA usar.
 *
 * Aceita o número da opção OU texto livre ("suporte", "quero renovar"): o
 * cliente responde do jeito que quer, e exigir exatamente "3" faria o
 * atendimento travar na primeira mensagem fora do script.
 *
 * Body: { conversationId, answer }
 */
export async function POST(req: Request) {
  if (!checkToken(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const conversationId = String(body?.conversationId ?? "").trim();
  const answer = String(body?.answer ?? "").trim();
  if (!conversationId) {
    return NextResponse.json({ ok: false, error: "conversationId required" }, { status: 400 });
  }

  const workspace = await getWorkspace();
  if (!workspace) return NextResponse.json({ ok: false, error: "no workspace" }, { status: 500 });

  const sectors = await db.select().from(s.serviceSectors)
    .where(and(eq(s.serviceSectors.workspaceId, workspace.id), eq(s.serviceSectors.active, true)))
    .orderBy(asc(s.serviceSectors.sortOrder));
  if (sectors.length === 0) {
    return NextResponse.json({ ok: false, error: "nenhum setor configurado" }, { status: 500 });
  }

  const escolhido = matchSector(answer, sectors);
  if (!escolhido) {
    return NextResponse.json({ ok: true, matched: false });
  }

  await db.update(s.whatsappConversations).set({
    serviceSectorId: escolhido.id,
    flowState: "sector",
  }).where(and(
    eq(s.whatsappConversations.workspaceId, workspace.id),
    eq(s.whatsappConversations.id, conversationId),
  ));

  return NextResponse.json({
    ok: true,
    matched: true,
    sector: { id: escolhido.id, name: escolhido.name, aiPersona: escolhido.aiPersona },
  });
}

type Sector = typeof s.serviceSectors.$inferSelect;

/**
 * Número da opção, nome do setor, ou palavra-chave do assunto.
 *
 * A ORDEM importa: "meu pedido atrasou" poderia cair em "Comercial / Novo pedido"
 * porque a palavra "pedido" está no nome daquele setor. Palavra genérica do domínio aparece em vários nomes, então o
 * casamento por palavra solta do nome é o sinal MAIS FRACO e ficou por último —
 * depois das palavras-chave de intenção, que são específicas ("venceu",
 * "renovar") e dizem o que a pessoa quer, não de que assunto ela fala.
 */
function matchSector(answer: string, sectors: Sector[]): Sector | null {
  const limpo = answer.toLowerCase().trim();
  if (!limpo) return null;

  const semAcento = (t: string) => t.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const alvo = semAcento(limpo);

  // 1) Número da opção ("3", "opção 3")
  const numero = limpo.match(/\b([1-9])\b/);
  if (numero) {
    const idx = parseInt(numero[1], 10) - 1;
    if (idx >= 0 && idx < sectors.length) return sectors[idx];
  }

  // 2) Nome do setor por INTEIRO — sinal forte, sem ambiguidade.
  for (const sec of sectors) {
    if (alvo.includes(semAcento(sec.name))) return sec;
  }

  // 3) Intenção por palavra-chave. Vem antes do match parcial de nome porque
  //    descreve o que a pessoa QUER, e é isso que decide o setor.
  const intencoes: { termos: string[]; ordem: number }[] = [
    { termos: ["recompra", "reposicao", "repor", "reabastecer", "novo pedido", "pedir de novo"], ordem: 2 },
    { termos: ["defeito", "avaria", "quebrado", "troca", "devolucao", "garantia", "problema", "suporte", "reclamacao"], ordem: 3 },
    { termos: ["entrega", "frete", "prazo", "rastreio", "rastrear", "atrasou", "transportadora", "agendar"], ordem: 4 },
    { termos: ["boleto", "pagamento", "nota fiscal", "financeiro", "cobranca", "reembolso", "segunda via", "pagar"], ordem: 5 },
    { termos: ["comprar", "contratar", "preco", "valor", "quanto custa", "primeira compra", "nunca comprei", "orcamento"], ordem: 1 },
  ];
  for (const i of intencoes) {
    if (i.termos.some((termo) => alvo.includes(semAcento(termo)))) {
      const achado = sectors[i.ordem - 1];
      if (achado) return achado;
    }
  }

  // 4) Palavra solta do nome do setor — último recurso, ignorando termos
  //    genéricos que aparecem em mais de um setor e não distinguem nada.
  const GENERICAS = new Set(["pedido", "pedidos", "novo", "nova", "atendimento"]);
  for (const sec of sectors) {
    const partes = semAcento(sec.name).split(/[\s/]+/).filter((p) => p.length > 4 && !GENERICAS.has(p));
    if (partes.some((p) => alvo.includes(p))) return sec;
  }

  return null;
}
