/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Povoamento HISTÓRICO SINTÉTICO do CRM — Lovet Distribuidora (12 meses).
 *
 * Tudo que este script grava é DADO SINTÉTICO (origem SIMULACAO_IA, lote
 * LOVET_DEMO_2025_11_2026_10_V1). Nada representa operação, cliente, preço ou
 * pedido reais da Lovet. Não envia mensagens, não emite nota, não toca ERP.
 *
 * Uso (a partir de apps/crm, com DATABASE_URL de um banco LOCAL):
 *   npx tsx scripts/povoar-demo-lovet.ts --dry        # só gera e imprime estatísticas
 *   npx tsx scripts/povoar-demo-lovet.ts              # grava (aborta se o lote já existir)
 *   npx tsx scripts/povoar-demo-lovet.ts --reverter   # remove SOMENTE linhas do lote
 *   npx tsx scripts/povoar-demo-lovet.ts --refazer    # reverter + gravar de novo
 *
 * Determinístico (semente fixa): rodar de novo gera exatamente os mesmos dados.
 */
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import * as s from "../src/db/schema";

const BATCH = "LOVET_DEMO_2025_11_2026_10_V1";
const ORIGEM = "SIMULACAO_IA";
const MARK = "[SIMULADO]";
const START = new Date(2025, 10, 1, 0, 0, 0);
const END = new Date(2026, 9, 31, 23, 59, 59);
const DAY = 86400000;

const args = new Set(process.argv.slice(2));
const DRY = args.has("--dry");

// ── segurança: só banco local ───────────────────────────────────────────────
const dbUrl = process.env.DATABASE_URL ?? "";
if (!dbUrl) throw new Error("DATABASE_URL nao definida.");
const host = new URL(dbUrl).hostname;
if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
  throw new Error(`Abortado: o host "${host}" nao e local. Este script so roda em banco local/de testes.`);
}

// ── PRNG determinístico ─────────────────────────────────────────────────────
let seed = 20251101;
function rng(): number {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const rint = (a: number, b: number) => a + Math.floor(rng() * (b - a + 1));
const chance = (p: number) => rng() < p;
const pick = <T,>(a: readonly T[]): T => a[Math.floor(rng() * a.length)];
function wpick<T>(items: readonly T[], w: (x: T) => number): T {
  const tot = items.reduce((a, x) => a + w(x), 0);
  let r = rng() * tot;
  for (const x of items) { r -= w(x); if (r <= 0) return x; }
  return items[items.length - 1];
}
function shuffle<T>(a: T[]): T[] {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
}
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);
const clampEnd = (d: Date) => (d.getTime() > END.getTime() ? new Date(END.getTime() - rint(0, 5) * 3600000) : d);
const clampStart = (d: Date) => (d.getTime() < START.getTime() ? new Date(START) : d);
const r2 = (n: number) => Math.round(n * 100) / 100;
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const ym = (d: Date) => ymd(d).slice(0, 7);
/** Horário comercial (08–17h), evitando domingo. */
function biz(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), rint(8, 17), rint(0, 59), rint(0, 59));
  if (x.getDay() === 0) x.setDate(x.getDate() + (chance(0.5) ? 1 : -1));
  return x;
}
const slug = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const SEASON = [1.15, 0.9, 0.85, 1.0, 0.95, 1.05, 1.0, 0.9, 1.05, 1.1, 1.1, 1.15]; // por mês (0=jan)
const seasonAt = (d: Date) => SEASON[d.getMonth()] * (1 + 0.12 * ((d.getTime() - START.getTime()) / (END.getTime() - START.getTime())));

// ── dados de referência ─────────────────────────────────────────────────────
const REGIONS = [
  { code: "RM", name: "Região Metropolitana", states: "PA" },
  { code: "NE", name: "Nordeste do Pará", states: "PA" },
  { code: "SE", name: "Sudeste do Pará", states: "PA" },
  { code: "OE", name: "Oeste do Pará", states: "PA" },
  { code: "AP", name: "Amapá", states: "AP" },
] as const;
const CITIES: [string, string, string, number][] = [
  ["Belém", "PA", "RM", 90], ["Ananindeua", "PA", "RM", 60], ["Marituba", "PA", "RM", 20], ["Santa Izabel do Pará", "PA", "RM", 10],
  ["Abaetetuba", "PA", "RM", 14], ["Barcarena", "PA", "RM", 12], ["Castanhal", "PA", "NE", 26], ["Bragança", "PA", "NE", 14],
  ["Capanema", "PA", "NE", 10], ["Paragominas", "PA", "SE", 12], ["Tucuruí", "PA", "SE", 10], ["Marabá", "PA", "SE", 24],
  ["Parauapebas", "PA", "SE", 18], ["Redenção", "PA", "SE", 10], ["Santarém", "PA", "OE", 26], ["Altamira", "PA", "OE", 14],
  ["Itaituba", "PA", "OE", 10], ["Macapá", "AP", "AP", 34], ["Santana", "AP", "AP", 14], ["Laranjal do Jari", "AP", "AP", 5], ["Oiapoque", "AP", "AP", 4],
];
const BAIRROS = ["Centro", "Nazaré", "Marco", "Pedreira", "Cidade Nova", "Coqueiro", "Jaderlândia", "Aeroporto", "Liberdade", "Novo Horizonte", "São Brás", "Industrial", "Boa Vista", "Santa Rita"];
const RUAS = ["Rua das Mangueiras", "Av. Principal", "Travessa do Comércio", "Rua Sete de Setembro", "Av. Beira Rio", "Rua Projetada", "Travessa Nova", "Av. das Palmeiras", "Rua do Mercado", "Rua Bom Jesus"];
const FIRST = ["Ana", "Bruno", "Carla", "Daniel", "Eliane", "Fábio", "Gisele", "Hugo", "Ivone", "João", "Karla", "Leandro", "Mariana", "Nelson", "Olívia", "Paulo", "Quitéria", "Rafael", "Sandra", "Tiago", "Úrsula", "Vitor", "Wanda", "Xavier", "Yara", "Zeca", "Adriana", "Breno", "Cássia", "Diego", "Elaine", "Flávio", "Giovana", "Heitor", "Iara", "Jorge", "Kelly", "Luciano", "Mônica", "Natália", "Otávio", "Patrícia", "Rodrigo", "Simone", "Tatiane", "Valter", "Viviane", "Wilson"];
const LAST = ["Silva", "Santos", "Oliveira", "Souza", "Costa", "Pereira", "Rodrigues", "Almeida", "Nascimento", "Lima", "Araújo", "Ferreira", "Barbosa", "Ribeiro", "Carvalho", "Gomes", "Martins", "Rocha", "Moreira", "Cardoso", "Pantoja", "Lobato", "Furtado", "Brito", "Monteiro", "Amaral", "Teixeira", "Maia", "Farias", "Sales", "Tavares", "Vasconcelos", "Pinheiro", "Corrêa", "Campos", "Duarte", "Freitas", "Mendes", "Reis", "Batista"];
const WORDS = ["Patinhas", "Bicho Feliz", "Amigo Fiel", "Mundo Animal", "Focinho Gelado", "Rabo Alegre", "Pelúcia", "Tucumã", "Igarapé", "Marajó", "Guamá", "Tapajós", "Vila Pet", "Pata Forte", "Terra Nova", "Bem Estar", "Cachorrão", "Gatil Real", "Pelo Macio", "Canto dos Bichos", "Arca", "Verde Vida", "Bosque", "Estrela do Norte", "Sol Nascente", "Boa Ração", "Quatro Patas", "Casa Animal", "Dois Irmãos", "Primavera", "Vitória", "Esperança", "Horizonte", "Nativa", "Tropical", "Amazônia Pet", "Rio Branco", "Cais", "Ponta Grossa", "Orla", "Cacau", "Castanheira", "Buriti", "Jambu", "Vitória-Régia", "Mangueira", "Samaúma", "Pirarucu", "Uirapuru", "Tamanduá", "Boto", "Curió", "Jabuti", "Capivara", "Macaúba", "Pupunha", "Taperebá", "Muiraquitã", "Cumaru", "Ipê", "Sucupira", "Guará", "Ararinha", "Tucano", "Jacaré", "Araguaia", "Xingu", "Tocantins", "Anajás", "Mosqueiro", "Salinas", "Outeiro", "Cotijuba", "Icoaraci", "Bengui", "Terra Firme", "Carmelo", "Beira-Mar", "Trapiche", "Aurora", "Alvorada", "Pioneiro", "Central", "Premium", "Express", "Total", "Ideal", "Gold", "Master", "Plus", "Prime", "Top", "Real", "Nobre", "Fiel", "Feliz", "Doce Lar", "Lar dos Bichos", "Cantinho", "Recanto", "Oásis", "Jardim", "Campo Verde", "Fazenda Nova", "Sítio Bom", "Boiadeiro", "Rancho", "Pasto Verde", "Lavoura", "Safra", "Colheita", "Agro Norte", "Agro Brasil", "Cerrado", "Vale", "Serra", "Lago"];

// Perfis: intervalo médio de recompra (dias), itens/pedido, quantidade, desconto médio (%)
type Perfil = "pequeno_petshop" | "medio_petshop" | "grande_petshop" | "clinica" | "hospital" | "agropecuaria" | "outro";
const PERF: Record<Perfil, { interval: number; lines: [number, number]; qty: [number, number]; disc: number }> = {
  pequeno_petshop: { interval: 50, lines: [2, 5], qty: [1, 5], disc: 2 },
  medio_petshop: { interval: 40, lines: [3, 7], qty: [2, 9], disc: 4 },
  grande_petshop: { interval: 22, lines: [5, 11], qty: [4, 22], disc: 7 },
  clinica: { interval: 62, lines: [2, 6], qty: [1, 7], disc: 3 },
  hospital: { interval: 44, lines: [5, 12], qty: [2, 12], disc: 5 },
  agropecuaria: { interval: 58, lines: [3, 8], qty: [2, 14], disc: 4 },
  outro: { interval: 70, lines: [1, 4], qty: [1, 5], disc: 2 },
};
const SEGMENTOS = ["Pet shop", "Clínica veterinária", "Hospital veterinário", "Agropecuária", "Outro lojista especializado"] as const;
type Segmento = (typeof SEGMENTOS)[number];

// Catálogo DEMONSTRATIVO — nenhum produto real foi validado (ver relatório).
const CATS = [
  { cat: "Medicamentos veterinários", n: 10, price: [25, 180], species: ["Cães", "Gatos", "Cães e gatos", "Bovinos", "Equinos"], pack: ["Frasco", "Caixa", "Ampola"], unit: "UN", partners: ["Labovet", "Elanco", "Vansil", "Labyes"], subs: ["Linha injetável (teste)", "Linha oral (teste)", "Linha tópica (teste)"] },
  { cat: "Antiparasitários", n: 14, price: [35, 220], species: ["Cães", "Gatos", "Cães e gatos", "Bovinos"], pack: ["Caixa", "Frasco", "Cartela"], unit: "UN", partners: ["Elanco", "Labovet", "Vansil", "Labyes"], subs: ["Comprimido (teste)", "Pipeta (teste)", "Coleira (teste)", "Injetável (teste)"] },
  { cat: "Produtos de higiene veterinária", n: 8, price: [12, 90], species: ["Cães", "Gatos", "Cães e gatos"], pack: ["Frasco", "Pote", "Pacote"], unit: "UN", partners: ["MegaNux", "Labovet", "Labyes"], subs: ["Higiene geral (teste)", "Banho e tosa (teste)"] },
  { cat: "Alimentação para cães", n: 12, price: [60, 280], species: ["Cães"], pack: ["Saco 1 kg", "Saco 10,1 kg", "Saco 15 kg", "Sachê 100 g"], unit: "SC", partners: ["Panelaço Pet"], brands: ["Green Paws", "Seven Pets", "Mandala"], subs: ["Ração seca (teste)", "Petisco (teste)", "Alimento úmido (teste)"] },
  { cat: "Alimentação para gatos", n: 8, price: [45, 190], species: ["Gatos"], pack: ["Saco 1 kg", "Saco 10,1 kg", "Sachê 85 g"], unit: "SC", partners: ["Panelaço Pet"], brands: ["Green Paws", "Seven Pets", "Mandala"], subs: ["Ração seca (teste)", "Alimento úmido (teste)"] },
  { cat: "Produtos para animais de grande porte", n: 8, price: [40, 400], species: ["Bovinos", "Equinos", "Ovinos"], pack: ["Balde", "Saco", "Frasco 500 ml"], unit: "UN", partners: ["Labovet", "Vansil", "Labyes"], subs: ["Suplemento (teste)", "Manejo (teste)"] },
  { cat: "Produtos para clínicas e hospitais veterinários", n: 8, price: [8, 250], species: ["Cães e gatos"], pack: ["Caixa 100 un", "Pacote", "Kit"], unit: "CX", partners: ["Fabricante simulado"], subs: ["Descartáveis (teste)", "Insumos de rotina (teste)"] },
] as const;
type Prod = { id: string; sku: string; name: string; cat: string; price: number; manufacturer: string; brand: string; row: Record<string, any> };

const AFFINITY: Record<Segmento, Record<string, number>> = {
  "Pet shop": { "Alimentação para cães": 0.92, "Alimentação para gatos": 0.62, "Antiparasitários": 0.8, "Produtos de higiene veterinária": 0.5, "Medicamentos veterinários": 0.25, "Produtos para animais de grande porte": 0.03, "Produtos para clínicas e hospitais veterinários": 0.08 },
  "Clínica veterinária": { "Medicamentos veterinários": 0.95, "Antiparasitários": 0.85, "Produtos de higiene veterinária": 0.55, "Produtos para clínicas e hospitais veterinários": 0.9, "Alimentação para cães": 0.3, "Alimentação para gatos": 0.2, "Produtos para animais de grande porte": 0.03 },
  "Hospital veterinário": { "Medicamentos veterinários": 0.97, "Antiparasitários": 0.85, "Produtos de higiene veterinária": 0.8, "Produtos para clínicas e hospitais veterinários": 0.97, "Alimentação para cães": 0.55, "Alimentação para gatos": 0.5, "Produtos para animais de grande porte": 0.3 },
  "Agropecuária": { "Produtos para animais de grande porte": 0.92, "Medicamentos veterinários": 0.6, "Antiparasitários": 0.72, "Alimentação para cães": 0.5, "Produtos de higiene veterinária": 0.3, "Alimentação para gatos": 0.2, "Produtos para clínicas e hospitais veterinários": 0.04 },
  "Outro lojista especializado": { "Alimentação para cães": 0.8, "Alimentação para gatos": 0.55, "Produtos de higiene veterinária": 0.6, "Antiparasitários": 0.3, "Medicamentos veterinários": 0.05, "Produtos para animais de grande porte": 0.02, "Produtos para clínicas e hospitais veterinários": 0.03 },
};

const STAGES = ["Lead identificado", "Primeiro contato", "Cliente qualificado", "Necessidade identificada", "Apresentação de produtos", "Cotação solicitada", "Proposta enviada", "Negociação", "Aguardando decisão"];
const STAGE_PROB = [5, 10, 20, 30, 40, 50, 60, 70, 80];
const LOST_REASONS = [
  ["Preço considerado elevado", 28], ["Concorrência — condição comercial melhor", 18], ["Falta de disponibilidade (simulada)", 10],
  ["Atendimento comercial insuficiente", 8], ["Prazo de entrega", 10], ["Sem retorno do cliente", 16], ["Compra concentrada em outro fornecedor", 10],
] as const;
const COMPETITORS = ["Concorrente regional A (hipotético)", "Concorrente regional B (hipotético)", "Distribuidor de outro estado (hipotético)", "Venda direta de fabricante (hipotético)"];
const LEAD_SOURCES = ["Cliente da carteira", "Prospecção ativa", "Visita presencial", "WhatsApp", "Telemarketing", "Indicação", "Evento/feira (simulado)"];

// ── tipos de trabalho em memória ────────────────────────────────────────────
type R = Record<string, any>;
interface Rep { id: string; name: string; email: string; role: "manager" | "rep" | "sdr"; equipe: string; region?: string }
interface Contact { id: string; companyId: string; row: R; last?: Date }
interface Line { prod: Prod; qty: number; disc: number }
interface Quote { id: string; opp: Opp; version: number; issuedAt: Date; decidedAt?: Date; validUntil: Date; status: string; lines: Line[]; total: number; subtotal: number; discTotal: number; number?: string }
interface Order { id: string; client: Client; owner: Rep; issuedAt: Date; channel: string; quote?: Quote; opp?: Opp; lines: Line[]; status: string; deliveredAt?: Date; total: number; subtotal: number; discTotal: number; number?: string; campaignId?: string; contact?: Contact; occurrence?: boolean }
interface Opp { id: string; client: Client; owner: Rep; contact: Contact; name: string; tipo: string; outcome: "won" | "lost" | "open"; stages: { st: number; at: Date }[]; created: Date; closedAt?: Date; lostReason?: string; amount: number; quotes: Quote[]; order?: Order; source: string; campaignExt?: string; competitor?: string; expectedClose: Date; lines: Line[]; ext: string; mainCat: string; qtyTotal: number }
interface Client {
  id: string; ext: string; name: string; razao: string; segmento: Segmento; perfil: Perfil; porte: string; employees: number;
  city: string; uf: string; region: string; address: string; owner: Rep;
  kind: "ativo_base" | "ativo_novo" | "reativado" | "inativo" | "perdido_cliente" | "perdido_prospect" | "prospect";
  created: Date; cats: string[]; fav: Prod[]; interval: number; first?: Date; stopAt?: Date; gap?: [Date, Date];
  contacts: Contact[]; orders: Order[]; opps: Opp[]; reason?: string; seq: number; isNew: boolean;
}
const acts: R[] = []; const tasks: R[] = []; const tickets: R[] = [];

// ── geração ─────────────────────────────────────────────────────────────────
function buildReps(): Rep[] {
  const mk = (n: string, role: Rep["role"], equipe: string, region?: string): Rep => ({ id: randomUUID(), name: `${MARK} ${n}`, email: `sim.${slug(n)}@lovet.invalid`, role, equipe, region });
  return [
    mk("Helena Moreira", "manager", "Supervisão Comercial"),
    mk("Ricardo Tavares", "rep", "Região Metropolitana", "RM"), mk("Juliana Pantoja", "rep", "Região Metropolitana", "RM"), mk("Anderson Pinheiro", "rep", "Região Metropolitana", "RM"),
    mk("Marcos Vasconcelos", "rep", "Nordeste do Pará", "NE"),
    mk("Cláudia Furtado", "rep", "Sudeste do Pará", "SE"), mk("Edson Lobato", "rep", "Sudeste do Pará", "SE"),
    mk("Paulo Brasil", "rep", "Oeste do Pará", "OE"),
    mk("Larissa Nascimento", "rep", "Amapá", "AP"),
    mk("Bianca Soares", "sdr", "Telemarketing"), mk("Thiago Amaral", "sdr", "Telemarketing"),
    mk("Fernanda Cardoso", "rep", "Trade Marketing"), mk("Gustavo Monteiro", "rep", "Trade Marketing"),
  ];
}

function buildCatalog(ws: string): Prod[] {
  const out: Prod[] = []; let n = 0;
  for (const c of CATS) {
    for (let i = 0; i < c.n; i++) {
      n++;
      const partner = pick(c.partners as readonly string[]);
      const brand = "brands" in c ? pick(c.brands as readonly string[]) : "Linha simulada";
      const sub = pick(c.subs as readonly string[]);
      const pack = pick(c.pack as readonly string[]);
      const price = r2(c.price[0] + rng() * (c.price[1] - c.price[0]));
      const sku = `SIM-${String(n).padStart(3, "0")}`;
      const name = `SIMULADO — PRODUTO DE TESTE — NÃO COMERCIALIZAR · ${c.cat} ${String(i + 1).padStart(2, "0")}`;
      const id = randomUUID();
      out.push({
        id, sku, name, cat: c.cat, price, manufacturer: partner, brand,
        row: {
          id, workspaceId: ws, sku, name, manufacturer: partner, brand, category: c.cat, subcategory: sub,
          species: pick(c.species as readonly string[]), packaging: pack, unit: c.unit, presentation: `${pack} (apresentação demonstrativa)`,
          audience: "B2B — lojistas, clínicas e hospitais veterinários", catalogStatus: "simulado",
          source: `Produto de teste. Associação ao fabricante "${partner}" é HIPOTÉTICA; SKU real pendente de confirmação. Preço de lista FICTÍCIO.`,
          validatedAt: null, listPrice: price.toFixed(2), isSynthetic: true, origin: ORIGEM, batch: BATCH, externalId: sku,
        },
      });
    }
  }
  return out;
}

function genLines(client: Client, catalog: Prod[], opts: { expansion?: boolean; mult?: number } = {}): Line[] {
  const P = PERF[client.perfil];
  const nLines = Math.max(1, Math.round(rint(P.lines[0], P.lines[1]) * (opts.mult ?? 1)));
  const pool = client.fav.length ? client.fav : catalog;
  const chosen = new Map<string, Line>();
  let tries = 0;
  while (chosen.size < nLines && tries++ < 60) {
    const prod = pick(pool);
    if (chosen.has(prod.id)) continue;
    const disc = Math.max(0, r2(P.disc + (rng() - 0.5) * 4));
    chosen.set(prod.id, { prod, qty: Math.max(1, Math.round(rint(P.qty[0], P.qty[1]) * (prod.price > 150 ? 0.6 : 1))), disc });
  }
  if (opts.expansion) {
    const newCats = CATS.map((c) => c.cat).filter((c) => !client.cats.includes(c));
    const cat = newCats.length ? pick(newCats) : pick(CATS.map((c) => c.cat));
    const prod = pick(catalog.filter((p) => p.cat === cat));
    chosen.set(prod.id, { prod, qty: Math.max(1, rint(1, Math.ceil(P.qty[1] / 2))), disc: Math.max(0, r2(P.disc + 2 + rng() * 3)) });
  }
  return [...chosen.values()];
}
function totals(lines: Line[]) {
  let subtotal = 0, total = 0;
  for (const l of lines) { subtotal += l.qty * l.prod.price; total += r2(l.qty * l.prod.price * (1 - l.disc / 100)); }
  return { subtotal: r2(subtotal), total: r2(total), discTotal: r2(subtotal - total) };
}
const mainCatOf = (lines: Line[]) => {
  const m = new Map<string, number>();
  for (const l of lines) m.set(l.prod.cat, (m.get(l.prod.cat) ?? 0) + l.qty * l.prod.price);
  return [...m.entries()].sort((a, b) => b[1] - a[1])[0][0];
};

const usedNames = new Set<string>();
function companyName(seg: Segmento): { name: string; razao: string; owner: string } {
  for (let i = 0; i < 200; i++) {
    const w = pick(WORDS);
    let name: string;
    if (seg === "Pet shop") name = pick([`Pet Shop ${w}`, `${w} Pet`, `Mundo Pet ${w}`, `Casa do Pet ${w}`, `Pet & Cia ${w}`, `Bicho Chic ${w}`, `Pet Center ${w}`]);
    else if (seg === "Clínica veterinária") name = pick([`Clínica Veterinária ${w}`, `Vet ${w}`, `Centro Veterinário ${w}`, `Clínica ${w} Vet`]);
    else if (seg === "Hospital veterinário") name = pick([`Hospital Veterinário ${w}`, `Hospital Vet ${w}`]);
    else if (seg === "Agropecuária") name = pick([`Agropecuária ${w}`, `Casa do Criador ${w}`, `Agrovet ${w}`, `Agro ${w}`]);
    else name = pick([`Empório Pet ${w}`, `Banho & Tosa ${w}`, `Petisqueira ${w}`, `Empório Animal ${w}`]);
    if (usedNames.has(name)) continue;
    usedNames.add(name);
    const surname = pick(LAST);
    return { name, razao: `${surname} Comércio de Produtos ${seg === "Agropecuária" ? "Agropecuários" : "Pet"} Ltda (RAZÃO SOCIAL FICTÍCIA)`, owner: surname };
  }
  throw new Error("nomes esgotados");
}

function buildClients(reps: Rep[], catalog: Prod[], ws: string): Client[] {
  const field = reps.filter((r) => r.region);
  const byRegion = (reg: string) => field.filter((r) => r.region === reg);
  const kinds: Client["kind"][] = [
    ...Array(170).fill("ativo_base"), ...Array(110).fill("ativo_novo"), ...Array(20).fill("reativado"),
    ...Array(42).fill("inativo"), ...Array(18).fill("inativo"), // 60 inativos (42 base + 18 novos)
    ...Array(15).fill("perdido_cliente"), ...Array(25).fill("perdido_prospect"), ...Array(100).fill("prospect"),
  ];
  const segs: Segmento[] = shuffle([...Array(300).fill("Pet shop"), ...Array(100).fill("Clínica veterinária"), ...Array(25).fill("Hospital veterinário"), ...Array(50).fill("Agropecuária"), ...Array(25).fill("Outro lojista especializado")] as Segmento[]);
  const clients: Client[] = [];
  const ownerLoad = new Map<string, number>();
  shuffle(kinds).forEach((kind, i) => {
    const segmento = segs[i];
    const city = wpick(CITIES, (c) => c[3]);
    const region = city[2];
    const cands = byRegion(region);
    const owner = cands.reduce((a, b) => ((ownerLoad.get(a.id) ?? 0) <= (ownerLoad.get(b.id) ?? 0) ? a : b));
    ownerLoad.set(owner.id, (ownerLoad.get(owner.id) ?? 0) + 1);
    const porteRoll = rng();
    let porte: string; let perfil: Perfil; let employees: number;
    if (segmento === "Pet shop") {
      if (porteRoll < 0.55) { porte = "Pequeno"; perfil = "pequeno_petshop"; employees = rint(2, 6); }
      else if (porteRoll < 0.9) { porte = "Médio"; perfil = "medio_petshop"; employees = rint(7, 18); }
      else { porte = "Grande"; perfil = "grande_petshop"; employees = rint(19, 45); }
    } else if (segmento === "Clínica veterinária") { porte = porteRoll < 0.6 ? "Pequeno" : "Médio"; perfil = "clinica"; employees = porte === "Pequeno" ? rint(3, 8) : rint(9, 20); }
    else if (segmento === "Hospital veterinário") { porte = porteRoll < 0.4 ? "Médio" : "Grande"; perfil = "hospital"; employees = porte === "Médio" ? rint(15, 30) : rint(31, 80); }
    else if (segmento === "Agropecuária") { porte = porteRoll < 0.4 ? "Pequeno" : porteRoll < 0.85 ? "Médio" : "Grande"; perfil = "agropecuaria"; employees = porte === "Pequeno" ? rint(2, 6) : porte === "Médio" ? rint(7, 20) : rint(21, 50); }
    else { porte = porteRoll < 0.8 ? "Pequeno" : "Médio"; perfil = "outro"; employees = porte === "Pequeno" ? rint(1, 4) : rint(5, 12); }

    const nm = companyName(segmento);
    const aff = AFFINITY[segmento];
    let cats = CATS.map((c) => c.cat).filter((c) => chance(aff[c] ?? 0.05));
    if (!cats.length) cats = [wpick(CATS.map((c) => c.cat), (c) => aff[c] ?? 0.05)];
    const fav: Prod[] = [];
    for (const c of cats) { const ps = shuffle(catalog.filter((p) => p.cat === c)); fav.push(...ps.slice(0, rint(2, 4))); }
    const intervalMult = (porte === "Grande" ? 0.8 : porte === "Pequeno" ? 1.1 : 1) * (0.8 + rng() * 0.5);
    const client: Client = {
      id: randomUUID(), ext: `LDEMO-CLI-${String(i + 1).padStart(4, "0")}`, name: nm.name, razao: nm.razao, segmento, perfil, porte, employees,
      city: city[0], uf: city[1], region, address: `Endereço fictício: ${pick(RUAS)}, ${rint(10, 2400)}, ${pick(BAIRROS)}`, owner,
      kind, created: new Date(START), isNew: false, cats, fav, interval: Math.round(PERF[perfil].interval * intervalMult), contacts: [], orders: [], opps: [], seq: i,
    };
    clients.push(client);
  });
  // ciclo de vida
  let novoInativos = 0;
  for (const c of clients) {
    if (c.kind === "ativo_base" || c.kind === "reativado") {
      c.created = new Date(START);
      c.first = biz(addDays(START, rint(0, Math.max(3, Math.round(c.interval * 0.6)))));
    } else if (c.kind === "ativo_novo") {
      c.isNew = true;
      c.first = biz(addDays(START, rint(26, 330)));
    } else if (c.kind === "inativo") {
      if (novoInativos < 18) { novoInativos++; c.isNew = true; c.first = biz(addDays(START, rint(28, 120))); }
      else { c.created = new Date(START); c.first = biz(addDays(START, rint(0, Math.max(3, Math.round(c.interval * 0.6))))); }
      c.stopAt = biz(addDays(END, -rint(95, 240)));
      if (c.stopAt.getTime() < c.first.getTime() + 40 * DAY) c.stopAt = addDays(c.first, rint(45, 90));
      c.reason = pick(["Queda de frequência", "Preço considerado elevado", "Concorrência", "Problemas de atendimento", "Redução do mix", "Falta de disponibilidade (simulada)"]);
    } else if (c.kind === "perdido_cliente") {
      c.isNew = true;
      c.first = biz(addDays(START, rint(26, 110)));
      c.stopAt = addDays(c.first, rint(70, 150));
      if (c.stopAt.getTime() > END.getTime() - 60 * DAY) c.stopAt = biz(addDays(END, -rint(61, 80)));
      c.reason = wpick(LOST_REASONS, (x) => x[1])[0];
    }
    if (c.kind === "reativado") {
      const gs = addDays(START, rint(110, 250));
      c.gap = [gs, addDays(gs, rint(85, 140))];
    }
  }
  // datas de cadastro: carteira inicial = início do período; novos = antes da 1ª compra
  for (const c of clients) {
    if (c.isNew) c.created = clampStart(addDays(c.first!, -rint(12, 40)));
    else if (c.kind === "prospect") c.created = biz(addDays(START, rint(0, 360)));
    else if (c.kind === "perdido_prospect") c.created = biz(addDays(START, rint(0, 270)));
  }
  for (const c of clients) c.created = new Date(c.created.getFullYear(), c.created.getMonth(), c.created.getDate(), 7, 0, 0);
  return clients;
}

function buildContacts(c: Client, ws: string): void {
  const nRoll = rng();
  let n = 1;
  if (c.porte === "Pequeno") n = nRoll < 0.68 ? 1 : nRoll < 0.97 ? 2 : 3;
  else if (c.porte === "Médio") n = nRoll < 0.3 ? 1 : nRoll < 0.8 ? 2 : 3;
  else n = nRoll < 0.2 ? 2 : nRoll < 0.8 ? 3 : 4;
  const clinical = c.segmento === "Clínica veterinária" || c.segmento === "Hospital veterinário";
  const roles = c.porte === "Pequeno" ? ["Proprietário", "Comprador", "Responsável financeiro"] : ["Gerente", "Comprador", "Responsável pelo estoque", clinical ? "Médico-veterinário" : "Coordenador de compras", "Responsável financeiro"];
  const influence: Record<string, string> = { "Proprietário": "Decisor", "Gerente": "Decisor", "Comprador": "Influenciador", "Coordenador de compras": "Influenciador", "Responsável pelo estoque": "Usuário", "Médico-veterinário": "Influenciador", "Responsável financeiro": "Aprovador financeiro" };
  for (let i = 0; i < n; i++) {
    const title = i === 0 ? roles[0] : roles[Math.min(i, roles.length - 1)];
    const first = pick(FIRST), last = pick(LAST);
    const id = randomUUID();
    const seqN = ++contactSeq;
    c.contacts.push({
      id, companyId: c.id,
      row: {
        id, workspaceId: ws, companyId: c.id, name: `${first} ${last}`, email: `${slug(first)}.${slug(last)}${seqN}@cliente-sim.invalid`,
        phone: `550000${String(seqN).padStart(7, "0")}`, title, ownerId: c.owner.id,
        customFields: {
          sintetico: true, origem: ORIGEM, lote: BATCH, externalId: `LDEMO-CTT-${String(seqN).padStart(5, "0")}`,
          preferenciaContato: pick(["WhatsApp", "WhatsApp", "Telefone", "E-mail", "Visita presencial"]), influenciaDecisao: influence[title] ?? "Usuário",
          telefoneObs: "Número de teste (inválido)",
        },
        createdAt: new Date(c.created.getTime() + rint(0, 4) * DAY), updatedAt: c.created,
      },
    });
  }
}
let contactSeq = 0;

// ── pedidos recorrentes ─────────────────────────────────────────────────────
function genOrderDates(c: Client): Date[] {
  const out: Date[] = [];
  let t = c.first!;
  const limit = c.kind === "inativo" || c.kind === "perdido_cliente" ? c.stopAt! : END;
  let guard = 0;
  while (t.getTime() <= limit.getTime() && t.getTime() <= END.getTime() && guard++ < 80) {
    if (!(c.gap && t >= c.gap[0] && t < c.gap[1])) out.push(t);
    let iv = c.interval * (0.55 + 0.9 * rng()) / seasonAt(t);
    if (c.kind === "inativo" && c.stopAt) {
      const prog = (t.getTime() - c.first!.getTime()) / Math.max(1, c.stopAt.getTime() - c.first!.getTime());
      iv *= 1 + Math.max(0, prog - 0.45) * 2.2; // queda de frequência antes de parar
    }
    let nxt = addDays(t, Math.max(3, Math.round(iv)));
    if (c.gap && nxt >= c.gap[0] && nxt < c.gap[1]) nxt = addDays(c.gap[1], rint(0, 3));
    t = biz(nxt);
  }
  if (c.kind === "inativo") {
    while (out.length < 3) { const nx = biz(addDays(out[out.length - 1], rint(8, 20))); if (nx.getTime() > END.getTime()) break; out.push(nx); }
  }
  return out;
}

function orderStatus(at: Date, c: Client): { status: string; deliveredAt?: Date; occurrence: boolean } {
  const age = (END.getTime() - at.getTime()) / DAY;
  const extra = c.region === "AP" ? rint(3, 7) : c.region === "OE" || c.region === "SE" ? rint(1, 4) : 0;
  const deliv = addDays(at, rint(1, 4) + extra);
  if (age < 2) return { status: chance(0.5) ? "recebido" : "em_separacao", occurrence: false };
  if (age < 6) return { status: chance(0.5) ? "faturado_simulado" : "enviado", occurrence: false };
  const roll = rng();
  if (roll < 0.03) return { status: "cancelado", occurrence: false };
  if (roll < 0.09) return { status: "com_ocorrencia", deliveredAt: deliv.getTime() <= END.getTime() ? deliv : undefined, occurrence: true };
  return { status: "entregue", deliveredAt: deliv.getTime() <= END.getTime() ? deliv : undefined, occurrence: false };
}

// ── funil/oportunidades ─────────────────────────────────────────────────────
function backSchedule(D: Date, entry: number, lower: Date): { st: number; at: Date }[] {
  let d = addDays(D, -rint(0, 3));
  const list: { st: number; at: Date }[] = [];
  for (let st = 8; st >= entry; st--) { list.unshift({ st, at: d }); d = addDays(d, -rint(1, 4)); }
  while (list.length > 3 && list[0].at.getTime() < lower.getTime()) list.shift();
  if (list[0].at.getTime() < lower.getTime()) {
    const span = Math.max(1, D.getTime() - lower.getTime());
    list.forEach((x, i) => { x.at = new Date(lower.getTime() + (span * (i + 1)) / (list.length + 1)); });
  }
  return list
    .map((x) => { const t = biz(x.at); return { st: x.st, at: t.getTime() < lower.getTime() ? new Date(lower.getTime() + rint(1, 8) * 3600000) : t }; })
    .sort((a, b) => a.at.getTime() - b.at.getTime());
}

function newOpp(c: Client, catalog: Prod[], p: {
  outcome: Opp["outcome"]; tipo: string; stages: { st: number; at: Date }[]; closedAt?: Date; lines?: Line[]; owner?: Rep; mult?: number; expansion?: boolean; reason?: string;
}): Opp {
  const lines = p.lines ?? genLines(c, catalog, { expansion: p.expansion, mult: p.mult });
  const tt = totals(lines);
  const contact = pick(c.contacts.filter((x) => /Comprador|Proprietário|Gerente|Coordenador/.test(x.row.title)).concat(c.contacts[0]));
  const main = mainCatOf(lines);
  const seq = ++oppSeq;
  const o: Opp = {
    id: randomUUID(), client: c, owner: p.owner ?? c.owner, contact, name: "", tipo: p.tipo, outcome: p.outcome, stages: p.stages,
    created: p.stages[0].at, closedAt: p.closedAt, lostReason: p.reason, amount: tt.total, quotes: [], source: c.kind === "prospect" || c.kind === "perdido_prospect" ? pick(["Prospecção ativa", "Visita presencial", "Telemarketing", "Indicação", "WhatsApp", "Evento/feira (simulado)"]) : p.tipo === "primeira_compra" ? pick(LEAD_SOURCES) : "Cliente da carteira",
    expectedClose: addDays(p.closedAt ?? p.stages[p.stages.length - 1].at, p.outcome === "open" ? rint(5, 28) : 0), lines, ext: `LDEMO-OPP-${String(seq).padStart(5, "0")}`, mainCat: main, qtyTotal: lines.reduce((a, l) => a + l.qty, 0),
    competitor: p.outcome === "lost" && chance(0.55) ? pick(COMPETITORS) : undefined,
  };
  const label = p.tipo === "primeira_compra" ? "Primeira compra" : p.tipo === "expansao" ? "Expansão de mix" : p.tipo === "reativacao" ? "Reativação" : "Reposição";
  o.name = `${c.name} — ${label}: ${main}`;
  c.opps.push(o);
  return o;
}
let oppSeq = 0;

/** Garante fechamento depois da última etapa e da última cotação (e dentro do período). */
function fixClose(o: Opp): void {
  if (!o.closedAt) return;
  const lq = o.quotes[o.quotes.length - 1];
  const ls = o.stages[o.stages.length - 1].at;
  let t = Math.max(o.closedAt.getTime(), ls.getTime() + 3600000, lq ? lq.issuedAt.getTime() + 2 * 3600000 : 0);
  if (t > END.getTime()) t = END.getTime() - 60000;
  o.closedAt = new Date(t);
  if (lq && lq.status !== "expirada") lq.decidedAt = o.closedAt;
}

function makeQuotes(o: Opp): void {
  const s6 = o.stages.find((x) => x.st === 6);
  if (!s6) return;
  const s7 = o.stages.find((x) => x.st === 7);
  const mk = (version: number, at: Date, lines: Line[]): Quote => {
    const tt = totals(lines);
    return { id: randomUUID(), opp: o, version, issuedAt: at, validUntil: addDays(at, pick([7, 10, 15])), status: "enviada", lines, ...tt };
  };
  const first = mk(1, s6.at, o.lines);
  o.quotes.push(first);
  const t2 = s7 ? Math.max(addDays(s7.at, rint(0, 1)).getTime(), first.issuedAt.getTime() + 2 * 3600000) : 0;
  const revise = s7 && t2 <= END.getTime() && (o.outcome !== "open" ? chance(0.9) : chance(0.5));
  if (revise && s7) {
    const lines2 = o.lines.map((l) => ({ ...l, disc: r2(l.disc + rng() * 3) }));
    const q2 = mk(2, new Date(t2), lines2);
    first.status = "substituida"; first.decidedAt = q2.issuedAt;
    o.quotes.push(q2);
    o.lines = lines2;
  }
  const last = o.quotes[o.quotes.length - 1];
  if (o.outcome === "won") { last.status = "aprovada"; last.decidedAt = o.closedAt; }
  else if (o.outcome === "lost") {
    if (o.closedAt!.getTime() >= last.validUntil.getTime() && chance(0.5)) { last.status = "expirada"; last.decidedAt = last.validUntil; }
    else { last.status = "recusada"; last.decidedAt = o.closedAt; }
  } else {
    last.status = last.validUntil.getTime() < END.getTime() && chance(0.35) ? "expirada" : "enviada";
    if (last.status === "expirada") last.decidedAt = last.validUntil;
  }
  o.amount = last.total;
  fixClose(o);
}

const TXT: Record<string, string[]> = {
  note: ["Prospecção: estabelecimento identificado com potencial para as linhas {cat}.", "Lead identificado em visita de rota; perfil compatível com a carteira."],
  first: ["Primeiro contato realizado para apresentar a Lovet e entender o volume de compras.", "Contato inicial para conhecer o mix atual e os fornecedores utilizados."],
  qualify: ["Cliente qualificado: possui estrutura e demanda recorrente para {cat}.", "Levantamento de frequência de compra e prazos de pagamento praticados."],
  need: ["Necessidade identificada: reposição e ampliação de {cat}.", "Mapeadas as linhas de maior giro e rupturas no estoque do cliente."],
  present: ["Apresentação das linhas de {cat} (itens demonstrativos).", "Visita para apresentação do portfólio e das condições comerciais simuladas."],
  qreq: ["Cliente solicita cotação para {cat}.", "Pedido de cotação recebido por WhatsApp para {cat}."],
  qsent: ["Cotação simulada enviada com condições demonstrativas.", "Proposta com preços fictícios enviada ao comprador."],
  nego: ["Negociação de condições comerciais (prazo e desconto simulados).", "Cliente pediu ajuste de preço; revisão enviada."],
  wait: ["Cobrado retorno sobre a proposta; cliente aguarda aprovação interna.", "Acompanhamento da decisão de compra."],
};
function pushAct(a: { at: Date; actor: Rep; relType: "opportunity" | "company"; relId: string; type: string; client: Client; contact?: Contact; objetivo: string; texto: string; resultado: string; proxima?: string; prazo?: Date; ext: string }, ws: string) {
  if (a.at.getTime() < a.client.created.getTime()) a.at = new Date(a.client.created.getTime() + rint(1, 6) * 3600000);
  if (a.at.getTime() > END.getTime()) return;
  acts.push({
    id: randomUUID(), workspaceId: ws, actorId: a.actor.id, actorType: "user", relatedToType: a.relType, relatedToId: a.relId, type: a.type,
    payload: {
      text: a.texto, objetivo: a.objetivo, resultado: a.resultado, proximaAcao: a.proxima ?? null, prazo: a.prazo ? ymd(a.prazo) : null, situacao: "concluida",
      companyId: a.client.id, contactId: a.contact?.id ?? null, sintetico: true, origem: ORIGEM, lote: BATCH, externalId: a.ext,
    },
    createdAt: a.at,
  });
  if (a.contact && (!a.contact.last || a.contact.last < a.at)) a.contact.last = a.at;
}
const fill = (t: string, cat: string) => t.replace("{cat}", cat.toLowerCase());
let actSeq = 0;
const aext = () => `LDEMO-ACT-${String(++actSeq).padStart(6, "0")}`;

function oppActivities(o: Opp, ws: string, reps: Rep[]) {
  const tele = reps.filter((r) => r.role === "sdr");
  const trade = reps.filter((r) => r.equipe === "Trade Marketing");
  const c = o.client;
  const spec: Record<number, [string, string, string][]> = {
    0: [["note", "note", "Registrar lead"]], 1: [["call_logged", "first", "Primeiro contato"], ["whatsapp_sim", "first", "Primeiro contato"]],
    2: [["call_logged", "qualify", "Qualificação"]], 3: [["meeting", "need", "Levantar necessidade"], ["visit", "need", "Levantar necessidade"]],
    4: [["visit", "present", "Apresentar produtos"], ["presentation", "present", "Apresentar produtos"]], 5: [["whatsapp_sim", "qreq", "Receber pedido de cotação"], ["email_sim", "qreq", "Receber pedido de cotação"]],
    6: [["quote_sent", "qsent", "Enviar cotação"]], 7: [["price_negotiation", "nego", "Negociar condições"], ["call_logged", "nego", "Negociar condições"]], 8: [["follow_up", "wait", "Cobrar retorno"], ["whatsapp_sim", "wait", "Cobrar retorno"]],
  };
  const last = o.stages[o.stages.length - 1];
  for (const sg of o.stages) {
    const choices = spec[sg.st];
    const n = sg.st === 8 || sg.st === 7 ? rint(1, 2) : 1 + (chance(0.35) ? 1 : 0);
    for (let k = 0; k < n; k++) {
      const [type, tk, objetivo] = pick(choices);
      let actor = o.owner;
      if ((type === "call_logged" || type === "whatsapp_sim") && sg.st <= 2 && chance(0.4)) actor = pick(tele);
      if (type === "visit" && chance(0.12)) actor = pick(trade);
      const isLast = sg === last && o.outcome === "open";
      pushAct({
        at: biz(addDays(sg.at, k)), actor, relType: "opportunity", relId: o.id, type, client: c, contact: o.contact, objetivo,
        texto: fill(pick(TXT[tk]), o.mainCat), resultado: isLast ? "Em andamento" : pick(["Avançou de etapa", "Cliente receptivo", "Retorno agendado", "Cliente solicitou mais informações"]),
        proxima: isLast ? "Retornar contato" : "Avançar etapa", prazo: addDays(sg.at, rint(2, 6)), ext: aext(),
      }, ws);
    }
  }
  if (o.outcome !== "open" && o.closedAt) {
    pushAct({
      at: o.closedAt, actor: o.owner, relType: "opportunity", relId: o.id, type: "stage_changed", client: c, contact: o.contact, objetivo: "Registrar desfecho",
      texto: o.outcome === "won" ? "Venda ganha (simulada)." : `Venda perdida (simulada): ${o.lostReason}.`, resultado: o.outcome === "won" ? "Ganha" : "Perdida", ext: aext(),
    }, ws);
    acts[acts.length - 1].payload.to = o.outcome === "won" ? "Ganho" : "Perdido";
    if (o.outcome === "won" && o.order) {
      const pdt = addDays(o.order.issuedAt, rint(7, 14));
      pushAct({ at: biz(pdt), actor: o.owner, relType: "opportunity", relId: o.id, type: "post_sale", client: c, contact: o.contact, objetivo: "Pós-venda", texto: "Verificação de satisfação com o pedido simulado.", resultado: pick(["Cliente satisfeito", "Cliente satisfeito", "Pequena observação sobre prazo", "Sem retorno"]), proxima: "Oferecer recompra", prazo: addDays(pdt, 20), ext: aext() }, ws);
      if (chance(0.45)) pushAct({ at: biz(addDays(pdt, 1)), actor: pick(tele), relType: "opportunity", relId: o.id, type: "satisfaction_survey", client: c, contact: o.contact, objetivo: "Pesquisa de satisfação", texto: "Pesquisa de satisfação simulada aplicada por telefone.", resultado: `Nota simulada ${rint(3, 5)}/5`, ext: aext() }, ws);
    }
  }
}

// ── principal ───────────────────────────────────────────────────────────────
async function main() {
  const pool = new Pool({ connectionString: dbUrl });
  const db = drizzle(pool, { schema: s });
  try {
    const [ws] = await db.select().from(s.workspaces).limit(1);
    if (!ws) throw new Error("Nenhum workspace — rode db:seed primeiro.");
    const W = ws.id;

    const countBatch = async () => Number(((await db.execute(sql`select count(*)::int n from crm.companies where custom_fields->>'lote' = ${BATCH}`)) as any).rows[0].n);

    if (args.has("--reverter") || args.has("--refazer")) {
      const before = await countBatch();
      await db.transaction(async (tx) => {
        const L = BATCH;
        await tx.execute(sql`delete from crm.sales_order_items where order_id in (select id from crm.sales_orders where batch = ${L})`);
        await tx.execute(sql`delete from crm.sales_orders where batch = ${L}`);
        await tx.execute(sql`delete from crm.sales_quote_items where quote_id in (select id from crm.sales_quotes where batch = ${L})`);
        await tx.execute(sql`delete from crm.sales_quotes where batch = ${L}`);
        await tx.execute(sql`delete from crm.campaign_results where batch = ${L}`);
        await tx.execute(sql`delete from crm.campaign_recipients where campaign_id in (select id from crm.campaigns where name like ${MARK + "%"})`);
        await tx.execute(sql`delete from crm.campaigns where name like ${MARK + "%"}`);
        await tx.execute(sql`delete from crm.sales_targets where batch = ${L}`);
        await tx.execute(sql`delete from crm.catalog_products where batch = ${L}`);
        await tx.execute(sql`delete from crm.sales_regions where batch = ${L}`);
        await tx.execute(sql`delete from crm.contracts where number like 'SIM-CT-%'`);
        await tx.execute(sql`delete from crm.opportunity_stage_history where opportunity_id in (select id from crm.opportunities where custom_fields->>'lote' = ${L})`);
        await tx.execute(sql`delete from crm.activities where payload->>'lote' = ${L}`);
        await tx.execute(sql`delete from crm.tasks where title like ${MARK + "%"}`);
        await tx.execute(sql`delete from crm.tickets where subject like ${MARK + "%"}`);
        await tx.execute(sql`delete from crm.opportunities where custom_fields->>'lote' = ${L}`);
        await tx.execute(sql`delete from crm.contacts where custom_fields->>'lote' = ${L}`);
        await tx.execute(sql`delete from crm.companies where custom_fields->>'lote' = ${L}`);
        await tx.execute(sql`delete from crm.workspace_members where user_id in (select id from crm.users where email like '%@lovet.invalid')`);
        await tx.execute(sql`delete from crm.users where email like '%@lovet.invalid'`);
      });
      console.log(`Lote revertido (empresas do lote antes: ${before}).`);
      if (args.has("--reverter")) return;
    } else if (!DRY && (await countBatch()) > 0) {
      console.log(`Lote ${BATCH} ja existe — nada a fazer (idempotente). Use --refazer para regravar.`);
      return;
    }

    // ── geração em memória ──
    const reps = buildReps();
    const catalog = buildCatalog(W);
    const clients = buildClients(reps, catalog, W);
    for (const c of clients) buildContacts(c, W);

    const [pipe] = (await db.execute(sql`select id from crm.pipelines where workspace_id = ${W} and is_default = true and kind = 'sales' limit 1`) as any).rows as { id: string }[];
    const stg = (await db.execute(sql`select id, name from crm.pipeline_stages where pipeline_id = ${pipe.id}`) as any).rows as { id: string; name: string }[];
    const stageId = (n: string) => stg.find((x) => x.name === n)!.id;
    const STG = { neg: stageId("Negociação"), cob: stageId("Cobrança enviada"), won: stageId("Ganho"), lost: stageId("Perdido") };

    const orders: Order[] = []; const opps: Opp[] = [];
    // 1) pedidos por cliente + oportunidades vencidas "quote-backed"
    for (const c of clients) {
      if (!c.first) continue;
      const dates = genOrderDates(c);
      let idx = 0;
      for (const at of dates) {
        const isFirst = idx === 0;
        const reactivation = !!(c.gap && at.getTime() >= c.gap[1].getTime() && dates[idx - 1] && dates[idx - 1].getTime() < c.gap[0].getTime());
        const newCust = c.isNew;
        const backed = (isFirst && newCust) || reactivation || (!isFirst && chance(0.15));
        const st = orderStatus(at, c);
        const ord: Order = {
          id: randomUUID(), client: c, owner: c.owner, issuedAt: at, channel: backed ? "cotacao" : "recompra_direta", lines: [], status: st.status, deliveredAt: st.deliveredAt, total: 0, subtotal: 0, discTotal: 0,
          occurrence: st.occurrence, contact: pick(c.contacts),
        };
        if (backed) {
          const tipo = isFirst && newCust ? "primeira_compra" : reactivation ? "reativacao" : chance(0.45) ? "expansao" : "reposicao";
          const D = addDays(at, -rint(0, 2));
          const lower = tipo === "primeira_compra" ? c.created : addDays(clampStart(c.created), 1);
          const entry = tipo === "primeira_compra" ? rint(0, 1) : tipo === "reativacao" ? 3 : rint(3, 5);
          if (D.getTime() - lower.getTime() > 9 * DAY) {
            const stages = backSchedule(D, entry, lower);
            const o = newOpp(c, catalog, { outcome: "won", tipo, stages, closedAt: biz(D), expansion: tipo === "expansao", mult: tipo === "primeira_compra" ? 0.8 : 1 });
            makeQuotes(o);
            if (!o.quotes.length) { c.opps.pop(); }
            else {
              const fq = o.quotes[o.quotes.length - 1];
              ord.quote = fq; ord.opp = o; ord.lines = fq.lines; ord.contact = o.contact; o.order = ord; opps.push(o);
              let oAt = Math.max(at.getTime(), o.closedAt!.getTime() + rint(20, 300) * 60000);
              if (oAt > END.getTime()) { oAt = END.getTime() - 30000; o.closedAt = new Date(oAt - 10 * 60000); fq.decidedAt = o.closedAt; }
              ord.issuedAt = new Date(oAt);
              const st2 = orderStatus(ord.issuedAt, c);
              ord.status = st2.status; ord.deliveredAt = st2.deliveredAt; ord.occurrence = st2.occurrence;
            }
          }
        }
        if (!ord.lines.length) { ord.lines = genLines(c, catalog); ord.channel = "recompra_direta"; ord.quote = undefined; ord.opp = undefined; }
        Object.assign(ord, totals(ord.lines));
        ord.discTotal = totals(ord.lines).discTotal;
        orders.push(ord); c.orders.push(ord);
        idx++;
      }
    }
    // 2) oportunidades perdidas / abertas
    const lostReason = () => wpick(LOST_REASONS, (x) => x[1])[0];
    const randomLostDate = (lower: Date) => {
      const lo = lower.getTime() + 12 * DAY, hi = END.getTime() - 1 * DAY;
      return biz(new Date(lo + rng() * Math.max(DAY, hi - lo)));
    };
    for (const c of clients) {
      const buyer = c.orders.length > 0;
      if (c.kind === "perdido_prospect") {
        const n = chance(0.4) ? 2 : 1;
        for (let i = 0; i < n; i++) {
          const D = randomLostDate(c.created);
          if (D.getTime() > END.getTime() - DAY) continue;
          const o = newOpp(c, catalog, { outcome: "lost", tipo: "primeira_compra", stages: backSchedule(D, rint(0, 3), c.created), closedAt: D, reason: lostReason() });
          makeQuotes(o); opps.push(o);
        }
      } else if (c.kind === "perdido_cliente") {
        const D = biz(clampEnd(addDays(c.stopAt!, rint(5, 40))));
        const o = newOpp(c, catalog, { outcome: "lost", tipo: "reposicao", stages: backSchedule(D, 4, addDays(c.first!, 20)), closedAt: D, reason: c.reason });
        makeQuotes(o); opps.push(o);
        if (chance(0.5)) { const D2 = addDays(D, -rint(30, 60)); if (D2.getTime() > c.first!.getTime() + 30 * DAY) { const o2 = newOpp(c, catalog, { outcome: "lost", tipo: "expansao", expansion: true, stages: backSchedule(D2, 4, c.first!), closedAt: D2, reason: lostReason() }); makeQuotes(o2); opps.push(o2); } }
      } else if (c.kind === "prospect") {
        if (chance(0.7)) {
          const maxD = Math.floor((END.getTime() - c.created.getTime()) / DAY);
          if (maxD > 4) {
            const entryAt = biz(addDays(c.created, rint(0, Math.min(maxD - 2, 30))));
            const cur = Math.min(8, rint(0, 8));
            const stages: { st: number; at: Date }[] = []; let d = entryAt;
            for (let st = 0; st <= cur; st++) { if (d.getTime() > END.getTime()) break; stages.push({ st, at: d }); d = biz(addDays(d, rint(1, 4))); }
            const o = newOpp(c, catalog, { outcome: "open", tipo: "primeira_compra", stages });
            makeQuotes(o); opps.push(o);
          }
        }
      } else if (buyer) {
        // perdidas e abertas de expansão/recompra em clientes com histórico
        const risk = c.kind === "inativo";
        const nLost = risk ? rint(1, 3) : chance(0.3) ? 1 : chance(0.15) ? 2 : 0;
        for (let i = 0; i < nLost; i++) {
          const lower = addDays(clampStart(c.created), 10);
          const D = risk ? biz(clampEnd(addDays(c.stopAt!, rint(-40, 90)))) : randomLostDate(lower);
          if (D.getTime() - lower.getTime() < 10 * DAY || D.getTime() > END.getTime() - DAY) continue;
          const o = newOpp(c, catalog, { outcome: "lost", tipo: chance(0.5) ? "expansao" : "reposicao", expansion: chance(0.5), stages: backSchedule(D, rint(3, 5), lower), closedAt: D, reason: risk && chance(0.5) ? c.reason : lostReason() });
          makeQuotes(o); opps.push(o);
        }
        if ((c.kind === "ativo_base" || c.kind === "ativo_novo" || c.kind === "reativado") && chance(0.62)) {
          const lowerOpen = addDays(END, -rint(6, 90));
          const entryAt = biz(c.created.getTime() > lowerOpen.getTime() ? addDays(c.created, 12) : lowerOpen);
          if (entryAt.getTime() < END.getTime() - 3 * DAY) {
            const cur = rint(3, 8); const stages: { st: number; at: Date }[] = []; let d = entryAt; const e0 = rint(3, 5);
            for (let st = e0; st <= Math.max(cur, e0); st++) { if (d.getTime() > END.getTime()) break; stages.push({ st, at: d }); d = biz(addDays(d, rint(1, 4))); }
            if (stages.length) { const o = newOpp(c, catalog, { outcome: "open", tipo: chance(0.5) ? "expansao" : "reposicao", expansion: chance(0.5), stages, mult: 1.2 }); makeQuotes(o); opps.push(o); }
          }
        }
      }
    }
    // inativos / em risco: tentativas de recuperação + reativados
    for (const c of clients) {
      const att: { at: Date; res: string }[] = [];
      if (c.kind === "inativo") {
        const nAtt = rint(2, 5); let d = addDays(c.stopAt!, rint(14, 35));
        for (let i = 0; i < nAtt && d.getTime() < END.getTime(); i++) { att.push({ at: biz(d), res: pick(["Sem retorno", "Cliente pediu nova cotação", "Cliente informa compra em outro fornecedor", "Retorno agendado", "Sem interesse no momento"]) }); d = addDays(d, rint(12, 30)); }
      } else if (c.kind === "reativado" && c.gap) {
        const nAtt = rint(3, 5); let d = addDays(c.gap[0], rint(12, 25));
        for (let i = 0; i < nAtt && d.getTime() < c.gap[1].getTime(); i++) { att.push({ at: biz(d), res: i === nAtt - 1 ? "Cliente aceita nova proposta" : pick(["Sem retorno", "Cliente pediu prazo", "Retorno agendado"]) }); d = addDays(d, rint(14, 26)); }
      } else if (c.kind === "perdido_cliente") {
        let d = addDays(c.stopAt!, rint(5, 15));
        for (let i = 0; i < 3 && d.getTime() < END.getTime(); i++) { att.push({ at: biz(d), res: i === 2 ? "Cliente encerra relacionamento (perdido)" : "Sem retorno" }); d = addDays(d, rint(12, 24)); }
      }
      const tele = reps.filter((r) => r.role === "sdr");
      att.forEach((a, i) => {
        pushAct({ at: a.at, actor: chance(0.5) ? pick(tele) : c.owner, relType: "company", relId: c.id, type: "recovery", client: c, contact: c.contacts[0], objetivo: "Recuperação de cliente", texto: `Tentativa de recuperação nº ${i + 1}: contato para entender a queda de compras (${c.reason ?? "motivo a apurar"}).`, resultado: a.res, proxima: i < att.length - 1 ? "Nova tentativa" : "Avaliar encerramento", prazo: addDays(a.at, 14), ext: aext() }, W);
      });
    }
    // relacionamento da carteira (visitas, pós-venda, satisfação, campanhas)
    const trade = reps.filter((r) => r.equipe === "Trade Marketing");
    const tele = reps.filter((r) => r.role === "sdr");
    for (const c of clients) {
      if (!c.first) continue;
      const until = c.kind === "inativo" || c.kind === "perdido_cliente" ? c.stopAt! : END;
      const span = Math.max(1, (until.getTime() - c.first.getTime()) / DAY);
      const n = Math.min(10, Math.round(span / (c.porte === "Grande" ? 30 : c.porte === "Médio" ? 45 : 70)));
      for (let i = 0; i < n; i++) {
        const at = biz(addDays(c.first, rng() * span));
        const type = wpick(["visit", "call_logged", "whatsapp_sim", "post_sale", "satisfaction_survey", "campaign_touch"], (t) => ({ visit: 3, call_logged: 3, whatsapp_sim: 3, post_sale: 1.5, satisfaction_survey: 0.7, campaign_touch: 1 })[t]!);
        const actor = type === "campaign_touch" ? pick(trade) : type === "satisfaction_survey" || type === "whatsapp_sim" ? (chance(0.5) ? pick(tele) : c.owner) : c.owner;
        const tx: Record<string, string> = { visit: "Visita de manutenção da carteira: revisão de estoque e condições.", call_logged: "Ligação de acompanhamento de carteira e levantamento de necessidades.", whatsapp_sim: "Contato por WhatsApp (simulado) para confirmar reposição.", post_sale: "Pós-venda: confirmação de recebimento e satisfação com o pedido.", satisfaction_survey: "Pesquisa de satisfação simulada.", campaign_touch: "Ação de trade marketing no ponto de venda (simulada)." };
        pushAct({ at, actor, relType: "company", relId: c.id, type, client: c, contact: pick(c.contacts), objetivo: "Relacionamento", texto: tx[type], resultado: pick(["Cliente receptivo", "Sem necessidade no momento", "Reposição prevista", "Oportunidade de ampliar mix"]), proxima: "Próximo contato", prazo: addDays(at, rint(14, 45)), ext: aext() }, W);
      }
    }
    for (const o of opps) oppActivities(o, W, reps);
    // acompanhamento de pedidos (parte)
    for (const od of orders) if (chance(0.22)) pushAct({ at: biz(addDays(od.issuedAt, rint(1, 3))), actor: od.owner, relType: "company", relId: od.client.id, type: "order_tracking", client: od.client, contact: od.contact, objetivo: "Acompanhar pedido", texto: "Acompanhamento de separação/entrega do pedido simulado.", resultado: "Em acompanhamento", ext: aext() }, W);

    // 3) numeração, status do opp/estágio, campanhas
    orders.sort((a, b) => a.issuedAt.getTime() - b.issuedAt.getTime()).forEach((o, i) => { o.number = `SIM-PED-${String(i + 1).padStart(6, "0")}`; });
    const quotes = opps.flatMap((o) => o.quotes).sort((a, b) => a.issuedAt.getTime() - b.issuedAt.getTime());
    quotes.forEach((q, i) => { q.number = `SIM-COT-${String(i + 1).padStart(6, "0")}`; });

    const CAMPS = [
      { n: "Expansão da linha de alimentação pet", a: "2026-01-12", b: "2026-02-13", obj: "Ampliar o mix de alimentação em pet shops", pub: "Pet shops", reg: "Todas", prods: ["Alimentação para cães", "Alimentação para gatos"], f: (c: Client) => c.segmento === "Pet shop" && c.kind !== "perdido_prospect" },
      { n: "Campanha de antiparasitários", a: "2026-03-02", b: "2026-03-31", obj: "Impulsionar giro de antiparasitários de teste", pub: "Pet shops, clínicas e agropecuárias", reg: "Todas", prods: ["Antiparasitários"], f: (c: Client) => c.cats.includes("Antiparasitários") },
      { n: "Relacionamento com pet shops — Região Metropolitana", a: "2026-04-06", b: "2026-05-08", obj: "Fortalecer relacionamento com pet shops da região", pub: "Pet shops RM", reg: "Região Metropolitana", prods: ["Mix geral"], f: (c: Client) => c.segmento === "Pet shop" && c.region === "RM" },
      { n: "Reativação de clientes inativos", a: "2026-05-18", b: "2026-06-19", obj: "Recuperar clientes sem recompra", pub: "Clientes inativos ou em risco", reg: "Todas", prods: ["Mix geral"], f: (c: Client) => c.kind === "inativo" || c.kind === "reativado" },
      { n: "Clínicas e hospitais veterinários", a: "2026-06-08", b: "2026-07-10", obj: "Apresentar mix de rotina para clínicas e hospitais", pub: "Clínicas e hospitais", reg: "Todas", prods: ["Medicamentos veterinários", "Produtos para clínicas e hospitais veterinários"], f: (c: Client) => c.segmento === "Clínica veterinária" || c.segmento === "Hospital veterinário" },
      { n: "Apresentação de produtos — Nordeste e Amapá", a: "2026-07-13", b: "2026-08-14", obj: "Ampliar presença no interior", pub: "Todos os segmentos NE e AP", reg: "Nordeste do Pará e Amapá", prods: ["Mix geral"], f: (c: Client) => c.region === "NE" || c.region === "AP" },
      { n: "Lançamento de linha de teste (produtos simulados)", a: "2026-08-17", b: "2026-09-11", obj: "Testar a mecânica de lançamento (sem produtos confirmados)", pub: "Carteira ativa", reg: "Todas", prods: ["Linha de teste"], f: (c: Client) => c.kind === "ativo_base" || c.kind === "ativo_novo" },
      { n: "Incentivo à recompra", a: "2026-09-14", b: "2026-10-23", obj: "Estimular recompra de clientes ativos", pub: "Clientes ativos", reg: "Todas", prods: ["Mix geral"], f: (c: Client) => c.kind === "ativo_base" || c.kind === "ativo_novo" || c.kind === "reativado" },
    ];
    const campaigns: R[] = []; const recipients: R[] = []; const results: R[] = [];
    const campOrders = new Map<string, number>();
    CAMPS.forEach((cp, ci) => {
      const start = new Date(cp.a + "T09:00:00"), end = new Date(cp.b + "T18:00:00");
      const reached = clients.filter((c) => c.created.getTime() <= start.getTime() && cp.f(c) && c.contacts.length);
      const id = randomUUID();
      campaigns.push({ id, workspaceId: W, name: `${MARK} ${cp.n}`, body: `Olá {{nome}}! ${MARK} Mensagem de campanha DEMONSTRATIVA com condições fictícias. Nenhuma mensagem real foi enviada.`, status: "done", scheduledAt: start, createdBy: reps[0].id, createdAt: addDays(start, -3) });
      reached.slice(0, 260).forEach((c, ri) => {
        const ct = c.contacts[0];
        recipients.push({ id: randomUUID(), campaignId: id, workspaceId: W, contactId: ct.id, phone: ct.row.phone, name: ct.row.name, status: "skipped", error: "SIMULADO — não enviado", createdAt: start });
        void ri;
      });
      const reachedSet = new Set(reached.slice(0, 260).map((c) => c.id));
      let oppGen = 0, quoteGen = 0, sales = 0, ordCnt = 0;
      for (const o of opps) {
        if (!reachedSet.has(o.client.id) || o.created < start || o.created > addDays(end, 14) || o.campaignExt) continue;
        if (chance(0.3)) { o.campaignExt = `${MARK} ${cp.n}`; o.source = `Campanha — ${cp.n}`; oppGen++; quoteGen += o.quotes.length; }
      }
      for (const od of orders) {
        if (!reachedSet.has(od.client.id) || od.issuedAt < start || od.issuedAt > addDays(end, 30) || od.campaignId) continue;
        const viaOpp = od.opp?.campaignExt === `${MARK} ${cp.n}`;
        if (viaOpp || (od.channel === "recompra_direta" && chance(0.22))) { od.campaignId = id; sales += od.total; ordCnt++; }
      }
      campOrders.set(id, ordCnt);
      results.push({
        id: randomUUID(), workspaceId: W, campaignId: id, objective: cp.obj, targetAudience: cp.pub, region: cp.reg, periodStart: start, periodEnd: end, products: cp.prods.join("; "),
        clientsReached: reachedSet.size, opportunitiesGenerated: oppGen, quotesGenerated: quoteGen, simulatedSales: r2(sales).toFixed(2),
        result: `${ordCnt} pedidos simulados atribuídos (atribuição hipotética).`, rating: [3, 4, 3, 4, 4, 3, 2, 4][ci], isSynthetic: true, origin: ORIGEM, batch: BATCH, externalId: `LDEMO-CMP-${ci + 1}`,
      });
    });

    // 4) tickets
    const TK = {
      delay: ["Atraso de entrega", "Pedido entregue após o prazo combinado (simulado)."], incomplete: ["Pedido incompleto", "Itens ausentes na entrega do pedido simulado."], diverg: ["Divergência na cotação", "Valor do pedido difere da cotação aprovada (simulado)."],
      second: ["Solicitação de segunda via", "Cliente solicita segunda via de documento (simulado)."], doubt: ["Dúvida comercial", "Cliente pede esclarecimento de condições comerciais (simulado)."], info: ["Solicitação de informações sobre produtos", "Cliente solicita catálogo/informações de portfólio (simulado)."],
      claim: ["Reclamação de atendimento", "Cliente relata demora no retorno comercial (simulado)."], contact: ["Dificuldade de contato", "Cliente relata dificuldade para falar com o representante (simulado)."], swap: ["Troca/devolução", "Solicitação de troca de item entregue (simulado)."],
    } as const;
    let tkSeq = 0;
    const mkTicket = (c: Client, at: Date, key: keyof typeof TK, order?: Order) => {
      if (at.getTime() > END.getTime()) return;
      const [subj, desc] = TK[key];
      const age = (END.getTime() - at.getTime()) / DAY;
      const status = age < 4 ? pick(["open", "in_progress"]) : age < 12 && chance(0.15) ? "in_progress" : chance(0.6) ? "resolved" : "closed";
      const resolvedAt = status === "resolved" || status === "closed" ? clampEnd(addDays(at, rint(1, 6))) : null;
      const rating = resolvedAt ? rint(2, 5) : null;
      tickets.push({
        id: randomUUID(), workspaceId: W, companyId: c.id, contactId: pick(c.contacts).id, subject: `${MARK} ${subj}`,
        description: `${desc}${order ? ` Pedido ${order.number}.` : ""} Categoria: ${subj}. Prazo de atendimento: ${key === "delay" || key === "incomplete" ? "48h" : "5 dias úteis"}. ${resolvedAt ? `Solução simulada registrada; avaliação simulada do cliente: ${rating}/5.` : "Em tratamento."} [lote ${BATCH}; ref LDEMO-TKT-${String(++tkSeq).padStart(4, "0")}]`,
        channel: pick(["phone", "whatsapp", "whatsapp", "email", "portal"]), priority: key === "delay" || key === "incomplete" || key === "claim" ? pick(["normal", "high", "high", "urgent"]) : pick(["low", "normal", "normal"]),
        status, assignedTo: c.owner.id, resolvedAt, createdAt: at,
      });
    };
    for (const od of orders) if (od.occurrence) mkTicket(od.client, biz(addDays(od.deliveredAt ?? od.issuedAt, rint(0, 2))), pick(["delay", "delay", "incomplete", "diverg", "swap"] as const), od);
    const extra = clients.filter((c) => c.first);
    for (let i = 0; i < 95; i++) { const c = pick(extra); mkTicket(c, biz(addDays(START, rint(10, 360))), pick(["second", "doubt", "info", "claim", "contact", "doubt", "info"] as const)); }

    // 5) métricas por cliente (ABC / RFM / propensão)
    const spend = new Map<string, number>();
    for (const od of orders) if (od.status !== "cancelado") spend.set(od.client.id, (spend.get(od.client.id) ?? 0) + od.total);
    const ranked = clients.filter((c) => spend.has(c.id)).sort((a, b) => spend.get(b.id)! - spend.get(a.id)!);
    const grand = ranked.reduce((a, c) => a + spend.get(c.id)!, 0);
    const abc = new Map<string, string>(); let cum = 0;
    for (const c of ranked) { cum += spend.get(c.id)!; abc.set(c.id, cum / grand <= 0.8 ? "A" : cum / grand <= 0.95 ? "B" : "C"); }
    const quint = (vals: number[], v: number, invert: boolean) => { const sorted = vals.slice().sort((a, b) => a - b); const p = sorted.filter((x) => x <= v).length / sorted.length; const sc = Math.min(5, Math.max(1, Math.ceil(p * 5))); return invert ? 6 - sc : sc; };
    const rec = new Map<string, number>(), freq = new Map<string, number>(), valueM = new Map<string, number>();
    for (const c of ranked) { const ds = c.orders.filter((o) => o.status !== "cancelado").map((o) => o.issuedAt.getTime()); rec.set(c.id, Math.round((END.getTime() - Math.max(...ds)) / DAY)); freq.set(c.id, ds.length); valueM.set(c.id, spend.get(c.id)!); }
    const recV = [...rec.values()], freqV = [...freq.values()], valV = [...valueM.values()];

    const rowsCompanies: R[] = []; const rowsContacts: R[] = [];
    for (const c of clients) {
      const ords = c.orders.filter((o) => o.status !== "cancelado").sort((a, b) => a.issuedAt.getTime() - b.issuedAt.getTime());
      const bought = new Set<string>(); ords.forEach((o) => o.lines.forEach((l) => bought.add(l.prod.cat)));
      let rfm: string | null = null, rscore = 0, fscore = 0, mscore = 0, prop: number | null = null;
      if (ords.length) {
        rscore = quint(recV, rec.get(c.id)!, true); fscore = quint(freqV, freq.get(c.id)!, false); mscore = quint(valV, valueM.get(c.id)!, false);
        const rr = rec.get(c.id)!;
        rfm = rr > 150 || c.kind === "perdido_cliente" ? "Inativo" : rscore <= 2 && fscore >= 3 ? "Em risco" : rscore >= 4 && fscore >= 4 && mscore >= 4 ? "Estratégico" : fscore >= 4 && rscore >= 3 ? "Fiel" : rscore >= 4 && fscore <= 2 ? "Promissor" : "Em desenvolvimento";
        const ivs: number[] = []; for (let i = 1; i < ords.length; i++) ivs.push((ords[i].issuedAt.getTime() - ords[i - 1].issuedAt.getTime()) / DAY);
        const avgIv = ivs.length ? ivs.reduce((a, b) => a + b, 0) / ivs.length : c.interval;
        prop = c.kind === "perdido_cliente" ? 0.05 : Math.max(0.02, Math.min(0.98, r2(1 - rr / (2.2 * avgIv))));
      }
      const tot = spend.get(c.id) ?? 0;
      const status = c.kind === "prospect" ? "Prospect" : c.kind === "perdido_prospect" || c.kind === "perdido_cliente" ? "Perdido/desqualificado" : c.kind === "inativo" ? "Inativo/em risco" : "Ativo";
      const catsBought = [...bought];
      const perfilCompra = !catsBought.length ? "Sem compras" : catsBought.length === 1 ? `Compra apenas ${catsBought[0].toLowerCase()}` : catsBought.every((x) => /Medicamento|Antiparasit/.test(x)) ? "Compra apenas medicamentos/antiparasitários" : catsBought.every((x) => /Alimenta/.test(x)) ? "Compra apenas alimentação pet" : "Compra categorias diferentes";
      const potencial = c.porte === "Grande" ? "Alto" : c.porte === "Médio" ? "Médio" : "Baixo";
      const lastOrder = ords.length ? ords[ords.length - 1].issuedAt : null;
      const nextAct = c.kind === "prospect" ? "Qualificar e agendar apresentação" : c.kind === "inativo" ? "Tentativa de recuperação" : c.kind === "perdido_prospect" || c.kind === "perdido_cliente" ? "Reavaliar em 90 dias" : "Contato de reposição";
      rowsCompanies.push({
        id: c.id, workspaceId: W, name: c.name, industry: c.segmento, size: c.porte, ownerId: c.owner.id, documento: null,
        customFields: {
          sintetico: true, origem: ORIGEM, lote: BATCH, externalId: c.ext, codigoInterno: c.ext, razaoSocial: c.razao, segmento: c.segmento, cidade: c.city, uf: c.uf, regiaoComercial: REGIONS.find((r) => r.code === c.region)!.name, endereco: c.address,
          porte: c.porte, funcionarios: c.employees, potencialCompra: potencial, classificacaoABC: abc.get(c.id) ?? null, status, subtipo: c.kind, dataCadastro: ymd(c.created), carteiraInicial: !c.isNew && !!c.first,
          primeiraCompra: ords.length ? ymd(ords[0].issuedAt) : null, ultimaCompra: lastOrder ? ymd(lastOrder) : null, totalComprasSimulado: r2(tot), pedidos: ords.length, ticketMedioSimulado: ords.length ? r2(tot / ords.length) : null,
          frequenciaEstimadaDias: c.interval, categoriasCompradas: catsBought, perfilCompra, produtosInteresse: c.cats, potencialCrescimento: catsBought.length < 3 && ords.length ? "Ampliar mix (venda cruzada)" : ords.length ? "Manter e fidelizar" : "A qualificar",
          rfm: ords.length ? { recenciaDias: rec.get(c.id), frequencia: freq.get(c.id), valor: r2(valueM.get(c.id)!), scoreR: rscore, scoreF: fscore, scoreM: mscore, segmento: rfm } : null,
          propensaoRecompraSimulada: prop, propensaoNota: "Previsão simples sobre dados sintéticos — não é comportamento real observado.",
          motivoInatividade: c.reason ?? null, responsavelCarteira: c.owner.name, proximaAcao: nextAct, observacoes: `Cliente FICTÍCIO para demonstração (${status}). Valores simulados.`, reativado: c.kind === "reativado",
        },
        createdAt: c.created, updatedAt: lastOrder ?? c.created,
      });
      for (const ct of c.contacts) {
        ct.row.customFields.ultimoContato = ct.last ? ymd(ct.last) : null;
        ct.row.customFields.proximaAcao = c.kind === "prospect" ? "Apresentar portfólio" : "Confirmar reposição";
        ct.row.customFields.statusRelacionamento = !ct.last ? "Sem contato" : (END.getTime() - ct.last.getTime()) / DAY < 30 ? "Ativo" : (END.getTime() - ct.last.getTime()) / DAY < 90 ? "Morno" : "Frio";
        ct.row.customFields.historicoRelacionamento = `Contato de ${c.name} (${c.segmento}); relacionamento simulado com ${c.owner.name}.`;
        rowsContacts.push(ct.row);
      }
    }

    // metas demonstrativas (derivadas do realizado simulado)
    const real = new Map<string, number>();
    for (const od of orders) if (od.status !== "cancelado") { const k = `${od.owner.id}|${ym(od.issuedAt)}`; real.set(k, (real.get(k) ?? 0) + od.total); }
    const targets: R[] = []; const regAgg = new Map<string, number>();
    for (const r of reps.filter((x) => x.region)) {
      for (let m = 0; m < 12; m++) {
        const d = new Date(2025, 10 + m, 1); const k = `${r.id}|${ym(d)}`;
        const t = Math.round(((real.get(k) ?? 0) * (0.9 + rng() * 0.3)) / 1000) * 1000;
        targets.push({ id: randomUUID(), workspaceId: W, userId: r.id, regionCode: r.region, month: ym(d), targetAmount: t.toFixed(2), isSynthetic: true, origin: ORIGEM, batch: BATCH, externalId: `LDEMO-META-${r.region}-${slug(r.name)}-${ym(d)}` });
        regAgg.set(`${r.region}|${ym(d)}`, (regAgg.get(`${r.region}|${ym(d)}`) ?? 0) + t);
      }
    }
    for (const [k, v] of regAgg) { const [reg, mo] = k.split("|"); targets.push({ id: randomUUID(), workspaceId: W, userId: null, regionCode: reg, month: mo, targetAmount: v.toFixed(2), isSynthetic: true, origin: ORIGEM, batch: BATCH, externalId: `LDEMO-META-REG-${reg}-${mo}` }); }

    // tarefas (próximas ações / histórico)
    const mkTask = (assignee: Rep, rel: { t: "opportunity" | "company"; id: string }, title: string, type: string, due: Date, done?: Date) => tasks.push({ id: randomUUID(), workspaceId: W, relatedToType: rel.t, relatedToId: rel.id, assigneeId: assignee.id, createdBy: reps[0].id, createdByAgent: false, type, title: `${MARK} ${title}`, dueAt: due, completedAt: done ?? null, createdAt: addDays(due, -rint(2, 9)) });
    for (const o of opps) {
      if (o.outcome === "open") {
        const last = o.stages[o.stages.length - 1].at;
        mkTask(o.owner, { t: "opportunity", id: o.id }, `Retornar contato — ${o.client.name}`, pick(["call", "email", "visit", "meeting"]), biz(addDays(last, rint(3, 12) + Math.max(0, Math.round((END.getTime() - last.getTime()) / DAY) - 3))));
      } else if (chance(0.22)) {
        const at = o.closedAt!; mkTask(o.owner, { t: "opportunity", id: o.id }, `Acompanhar ${o.outcome === "won" ? "pós-venda" : "motivo de perda"} — ${o.client.name}`, "call", biz(addDays(at, rint(2, 7))), biz(addDays(at, rint(3, 9))));
      }
    }
    for (const c of clients) {
      if (c.kind === "inativo") mkTask(pick(reps.filter((r) => r.role === "sdr")), { t: "company", id: c.id }, `Recuperar cliente em risco — ${c.name}`, "call", biz(addDays(END, rint(2, 20))));
      else if ((c.kind === "ativo_base" || c.kind === "ativo_novo" || c.kind === "reativado") && chance(0.3)) mkTask(c.owner, { t: "company", id: c.id }, `Visita de acompanhamento — ${c.name}`, "visit", biz(addDays(END, rint(3, 25))));
      else if (c.kind === "prospect" && chance(0.5)) mkTask(c.owner, { t: "company", id: c.id }, `Qualificar prospect — ${c.name}`, "call", biz(addDays(END, rint(2, 14))));
    }
    for (const t of tasks) if (t.completedAt && t.completedAt.getTime() > END.getTime()) t.completedAt = new Date(END);

    // ── estatísticas ──
    const wonN = opps.filter((o) => o.outcome === "won").length, lostN = opps.filter((o) => o.outcome === "lost").length, openN = opps.filter((o) => o.outcome === "open").length;
    const stats = {
      empresas: clients.length, contatos: rowsContacts.length, produtos: catalog.length, usuariosSimulados: reps.length, oportunidades: opps.length, ganhas: wonN, perdidas: lostN, abertas: openN,
      cotacoes: quotes.length, pedidos: orders.length, itensPedido: orders.reduce((a, o) => a + o.lines.length, 0), atividades: acts.length, tarefas: tasks.length, ocorrencias: tickets.length,
      campanhas: campaigns.length, destinatariosSimulados: recipients.length, metas: targets.length, faturamentoSimulado: r2(orders.filter((o) => o.status !== "cancelado").reduce((a, o) => a + o.total, 0)),
    };
    console.log(stats);
    if (process.env.DEBUG_CLOSE) {
      const bad = opps.filter((o) => o.closedAt && o.closedAt.getHours() === 23 && o.closedAt.getMinutes() === 59);
      console.log("closedAt 23:59:", bad.length);
      for (const o of bad.slice(0, 3)) console.log(o.tipo, o.outcome, o.client.kind, o.closedAt, o.stages.map((x) => `${x.st}@${x.at.toISOString()}`).join(" "), o.quotes.map((q) => `${q.version}:${q.status}@${q.issuedAt.toISOString()}/${q.validUntil.toISOString()}`).join(" "));
    }
    if (DRY) return;

    // ── gravação (uma transação) ──
    const chunk = async (tx: any, table: any, rows: R[], size = 400) => { for (let i = 0; i < rows.length; i += size) await tx.insert(table).values(rows.slice(i, i + size)); };
    await db.transaction(async (tx) => {
      await chunk(tx, s.users, reps.map((r) => ({ id: r.id, email: r.email, name: r.name })));
      await chunk(tx, s.workspaceMembers, reps.map((r) => ({ workspaceId: W, userId: r.id, role: r.role, equipe: r.equipe, status: "active", joinedAt: START })));
      await chunk(tx, s.salesRegions, REGIONS.map((r) => ({ workspaceId: W, code: r.code, name: r.name, states: r.states, isSynthetic: true, origin: ORIGEM, batch: BATCH, externalId: `LDEMO-REG-${r.code}` })));
      await chunk(tx, s.catalogProducts, catalog.map((p) => p.row));
      await chunk(tx, s.companies, rowsCompanies);
      await chunk(tx, s.contacts, rowsContacts);
      const oppRows = opps.map((o) => {
        const last = o.stages[o.stages.length - 1];
        const detStage = o.outcome === "won" ? 9 : o.outcome === "lost" ? 10 : last.st;
        const stageIdDb = o.outcome === "won" ? STG.won : o.outcome === "lost" ? STG.lost : last.st <= 5 ? STG.neg : STG.cob;
        return {
          id: o.id, workspaceId: W, pipelineId: pipe.id, stageId: stageIdDb, companyId: o.client.id, primaryContactId: o.contact.id, ownerId: o.owner.id, name: o.name, amount: o.amount.toFixed(2),
          productLine: o.mainCat, productVariant: null, productQty: o.qtyTotal, leadSource: o.source, expectedCloseDate: o.expectedClose, closedAt: o.closedAt ?? null, status: o.outcome, lostReason: o.lostReason ?? null,
          stageEnteredAt: last.at, createdAt: o.created, updatedAt: o.closedAt ?? last.at,
          customFields: {
            sintetico: true, origem: ORIGEM, lote: BATCH, externalId: o.ext, tipo: o.tipo, etapaDetalhada: o.outcome === "open" ? STAGES[last.st] : o.outcome === "won" ? "Venda ganha" : "Venda perdida",
            etapaDetalhadaIndice: detStage, probabilidade: o.outcome === "won" ? 100 : o.outcome === "lost" ? 0 : STAGE_PROB[last.st], concorrenteHipotetico: o.competitor ?? null, campanha: o.campaignExt ?? null,
            valorEstimadoFicticio: true, historicoEtapas: o.stages.map((x) => ({ etapa: STAGES[x.st], data: ymd(x.at) })),
          },
        };
      });
      await chunk(tx, s.opportunities, oppRows);
      const hist: R[] = [];
      for (const o of opps) {
        const st1 = o.stages[0]; const last = o.stages[o.stages.length - 1];
        const idOf = (st: number) => (st <= 5 ? STG.neg : STG.cob);
        hist.push({ id: randomUUID(), opportunityId: o.id, fromStageId: null, toStageId: idOf(st1.st), changedBy: o.owner.id, changedAt: st1.at, timeInStageSeconds: null });
        const midChange = o.stages.find((x) => x.st === 6);
        if (midChange && idOf(st1.st) !== STG.cob) hist.push({ id: randomUUID(), opportunityId: o.id, fromStageId: STG.neg, toStageId: STG.cob, changedBy: o.owner.id, changedAt: midChange.at, timeInStageSeconds: Math.round((midChange.at.getTime() - st1.at.getTime()) / 1000) });
        if (o.outcome !== "open") hist.push({ id: randomUUID(), opportunityId: o.id, fromStageId: last.st <= 5 ? STG.neg : STG.cob, toStageId: o.outcome === "won" ? STG.won : STG.lost, changedBy: o.owner.id, changedAt: o.closedAt!, timeInStageSeconds: Math.max(0, Math.round((o.closedAt!.getTime() - last.at.getTime()) / 1000)) });
      }
      await chunk(tx, s.opportunityStageHistory, hist);
      const tagS = (ext: string) => ({ isSynthetic: true, origin: ORIGEM, batch: BATCH, externalId: ext });
      await chunk(tx, s.salesQuotes, quotes.map((q) => ({
        id: q.id, workspaceId: W, number: q.number, companyId: q.opp.client.id, contactId: q.opp.contact.id, opportunityId: q.opp.id, ownerId: q.opp.owner.id, version: q.version, status: q.status,
        issuedAt: q.issuedAt, validUntil: q.validUntil, decidedAt: q.decidedAt ?? null, subtotal: q.subtotal.toFixed(2), discountTotal: q.discTotal.toFixed(2), total: q.total.toFixed(2), notes: "SIMULADO — valores fictícios.", ...tagS(q.number!),
      })));
      await chunk(tx, s.salesQuoteItems, quotes.flatMap((q) => q.lines.map((l, i) => ({ id: randomUUID(), quoteId: q.id, productId: l.prod.id, qty: l.qty, unitPrice: l.prod.price.toFixed(2), discountPct: l.disc.toFixed(2), total: r2(l.qty * l.prod.price * (1 - l.disc / 100)).toFixed(2), ...tagS(`${q.number}-I${i + 1}`) }))));
      await chunk(tx, s.campaigns, campaigns);
      await chunk(tx, s.campaignRecipients, recipients);
      await chunk(tx, s.campaignResults, results);
      await chunk(tx, s.salesOrders, orders.map((o) => ({
        id: o.id, workspaceId: W, number: o.number, companyId: o.client.id, contactId: o.contact?.id ?? null, ownerId: o.owner.id, quoteId: o.quote?.id ?? null, opportunityId: o.opp?.id ?? null, campaignId: o.campaignId ?? null,
        channel: o.channel, status: o.status, orderedAt: o.issuedAt, deliveredAt: o.deliveredAt ?? null, subtotal: o.subtotal.toFixed(2), discountTotal: o.discTotal.toFixed(2), total: o.total.toFixed(2),
        notes: o.channel === "cotacao" ? "SIMULADO — pedido originado de cotação aprovada." : "SIMULADO — recompra direta (cliente recorrente, sem nova cotação).", ...tagS(o.number!),
      })));
      await chunk(tx, s.salesOrderItems, orders.flatMap((o) => o.lines.map((l, i) => ({ id: randomUUID(), orderId: o.id, productId: l.prod.id, qty: l.qty, unitPrice: l.prod.price.toFixed(2), discountPct: l.disc.toFixed(2), total: r2(l.qty * l.prod.price * (1 - l.disc / 100)).toFixed(2), ...tagS(`${o.number}-I${i + 1}`) }))), 600);
      await chunk(tx, s.contracts, orders.filter((o) => o.opp && o.status !== "cancelado").map((o, i) => ({
        workspaceId: W, opportunityId: o.opp!.id, number: `SIM-CT-${String(i + 1).padStart(5, "0")}`, value: o.total.toFixed(2), paymentTerms: "Boleto 28 dias — valores FICTÍCIOS (SIMULADO)", status: "signed", sentAt: addDays(o.issuedAt, -1), signedAt: o.issuedAt, createdAt: addDays(o.issuedAt, -1),
      })));
      await chunk(tx, s.activities, acts, 800);
      await chunk(tx, s.tasks, tasks);
      await chunk(tx, s.tickets, tickets);
      await chunk(tx, s.salesTargets, targets);
    });
    console.log("Carga gravada com sucesso.");
  } finally {
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
