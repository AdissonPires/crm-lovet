import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db";

/** Consultas da gestão comercial (catálogo, cotações, pedidos e indicadores). */

/** Campos personalizados (jsonb) de clientes e contatos — formato livre. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Campos = Record<string, any>;

async function rows<T>(q: SQL): Promise<T[]> {
  return ((await db.execute(q)) as unknown as { rows: T[] }).rows;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Período do filtro (`de`/`ate` em AAAA-MM-DD). Padrão: desde o início do mês de 12 meses atrás até hoje. */
export function periodoDe(sp: { de?: string; ate?: string }): { de: string; ate: string; deTs: string; ateTs: string } {
  const hoje = new Date();
  const de = sp.de && ISO.test(sp.de) ? sp.de : ymd(new Date(hoje.getFullYear(), hoje.getMonth() - 12, 1));
  const ate = sp.ate && ISO.test(sp.ate) ? sp.ate : ymd(hoje);
  return { de, ate, deTs: `${de} 00:00:00`, ateTs: `${ate} 23:59:59` };
}

export type Par = { label: string; valor: number; extra?: number | null };

export interface Indicadores {
  resumo: { pedidos: number; faturamento: number; ticket: number; clientes: number; cancelados: number; pedidosOcorrencia: number };
  mensal: { mes: string; pedidos: number; valor: number; meta: number }[];
  porRegiao: Par[];
  porRepresentante: (Par & { equipe: string })[];
  porSegmento: Par[];
  porCategoria: Par[];
  porMarca: Par[];
  topProdutos: Par[];
  topClientes: { id: string; nome: string; uf: string; abc: string | null; total: number; pedidos: number }[];
  funil: { aberta: number; ganha: number; perdida: number; valorAberto: number; valorGanho: number; conversao: number | null; diasFechar: number | null };
  cotacoes: Par[];
  perdas: Par[];
  carteira: { status: Par[]; abc: Par[]; rfm: Par[]; perfil: Par[] };
  campanhas: { nome: string; alcancados: number; oportunidades: number; cotacoes: number; vendas: number; avaliacao: number | null }[];
  atendimento: Par[];
}

export async function indicadores(ws: string, deTs: string, ateTs: string): Promise<Indicadores> {
  const P = sql`o.workspace_id = ${ws} and o.status <> 'cancelado' and o.ordered_at >= ${deTs}::timestamp and o.ordered_at <= ${ateTs}::timestamp`;
  const par = (r: { label: string; valor: number; extra?: number | null }[]): Par[] => r.map((x) => ({ label: x.label, valor: Number(x.valor), extra: x.extra == null ? null : Number(x.extra) }));

  const [resumo] = await rows<{ pedidos: number; faturamento: number; ticket: number; clientes: number; cancelados: number; ocorr: number }>(sql`
    select count(*) filter (where o.status <> 'cancelado')::int pedidos,
           coalesce(sum(o.total) filter (where o.status <> 'cancelado'), 0)::float faturamento,
           coalesce(avg(o.total) filter (where o.status <> 'cancelado'), 0)::float ticket,
           count(distinct o.company_id) filter (where o.status <> 'cancelado')::int clientes,
           count(*) filter (where o.status = 'cancelado')::int cancelados,
           count(*) filter (where o.status = 'com_ocorrencia')::int ocorr
      from crm.sales_orders o
     where o.workspace_id = ${ws} and o.ordered_at >= ${deTs}::timestamp and o.ordered_at <= ${ateTs}::timestamp`);

  const mensal = await rows<{ mes: string; pedidos: number; valor: number; meta: number }>(sql`
    with v as (
      select to_char(o.ordered_at, 'YYYY-MM') mes, count(*)::int pedidos, sum(o.total)::float valor
        from crm.sales_orders o where ${P} group by 1),
    m as (
      select month mes, sum(target_amount)::float meta from crm.sales_targets
       where workspace_id = ${ws} and user_id is not null and month >= to_char(${deTs}::timestamp, 'YYYY-MM') and month <= to_char(${ateTs}::timestamp, 'YYYY-MM') group by 1)
    select coalesce(v.mes, m.mes) mes, coalesce(v.pedidos, 0)::int pedidos, coalesce(v.valor, 0)::float valor, coalesce(m.meta, 0)::float meta
      from v full join m on m.mes = v.mes order by 1`);

  const porRegiao = await rows<{ label: string; valor: number; extra: number }>(sql`
    select c.custom_fields->>'regiaoComercial' label, sum(o.total)::float valor, count(distinct o.company_id)::int extra
      from crm.sales_orders o join crm.companies c on c.id = o.company_id where ${P} group by 1 order by 2 desc`);
  const porRep = await rows<{ label: string; valor: number; extra: number; equipe: string }>(sql`
    select u.name label, m.equipe, sum(o.total)::float valor, count(*)::int extra
      from crm.sales_orders o join crm.users u on u.id = o.owner_id
      join crm.workspace_members m on m.user_id = u.id and m.workspace_id = o.workspace_id
     where ${P} group by 1, 2 order by 3 desc`);
  const porSeg = await rows<{ label: string; valor: number; extra: number }>(sql`
    select c.industry label, sum(o.total)::float valor, count(*)::int extra
      from crm.sales_orders o join crm.companies c on c.id = o.company_id where ${P} group by 1 order by 2 desc`);
  const itemBase = sql`from crm.sales_order_items i join crm.catalog_products p on p.id = i.product_id join crm.sales_orders o on o.id = i.order_id where ${P}`;
  const porCat = await rows<{ label: string; valor: number }>(sql`select p.category label, sum(i.total)::float valor ${itemBase} group by 1 order by 2 desc`);
  const porMarca = await rows<{ label: string; valor: number }>(sql`select coalesce(p.brand, 'Sem marca') label, sum(i.total)::float valor ${itemBase} group by 1 order by 2 desc`);
  const topProd = await rows<{ label: string; valor: number; extra: number }>(sql`select p.sku || ' · ' || p.category label, sum(i.total)::float valor, sum(i.qty)::int extra ${itemBase} group by p.sku, p.category order by 2 desc limit 8`);

  const topClientes = await rows<{ id: string; nome: string; uf: string; abc: string | null; total: number; pedidos: number }>(sql`
    select c.id, c.name nome, c.custom_fields->>'uf' uf, c.custom_fields->>'classificacaoABC' abc, sum(o.total)::float total, count(*)::int pedidos
      from crm.sales_orders o join crm.companies c on c.id = o.company_id where ${P} group by 1,2,3,4 order by 5 desc limit 10`);

  const [funil] = await rows<{ aberta: number; ganha: number; perdida: number; valor_aberto: number; valor_ganho: number; dias: number | null }>(sql`
    select count(*) filter (where status='open')::int aberta, count(*) filter (where status='won')::int ganha, count(*) filter (where status='lost')::int perdida,
           coalesce(sum(amount) filter (where status='open'),0)::float valor_aberto, coalesce(sum(amount) filter (where status='won'),0)::float valor_ganho,
           (avg(extract(epoch from closed_at - created_at)/86400) filter (where status='won'))::float dias
      from crm.opportunities where workspace_id = ${ws} and created_at >= ${deTs}::timestamp and created_at <= ${ateTs}::timestamp`);
  const decididas = funil.ganha + funil.perdida;

  const cotacoes = await rows<{ label: string; valor: number }>(sql`
    select status label, count(*)::int valor from crm.sales_quotes where workspace_id = ${ws} and issued_at >= ${deTs}::timestamp and issued_at <= ${ateTs}::timestamp group by 1 order by 2 desc`);
  const perdas = await rows<{ label: string; valor: number }>(sql`
    select lost_reason label, count(*)::int valor from crm.opportunities where workspace_id = ${ws} and status='lost' and lost_reason is not null
       and created_at >= ${deTs}::timestamp and created_at <= ${ateTs}::timestamp group by 1 order by 2 desc limit 8`);

  const cf = (campo: string) => rows<{ label: string; valor: number }>(sql`
    select coalesce(${sql.raw(campo)}, 'Sem classificação') label, count(*)::int valor from crm.companies c
     where c.workspace_id = ${ws} and c.custom_fields->>'sintetico' = 'true' group by 1 order by 2 desc`);
  const status = await cf(`c.custom_fields->>'status'`);
  const abc = await cf(`c.custom_fields->>'classificacaoABC'`);
  const rfm = await cf(`c.custom_fields->'rfm'->>'segmento'`);
  const perfil = await cf(`c.custom_fields->>'perfilCompra'`);

  const campanhas = await rows<{ nome: string; alcancados: number; oportunidades: number; cotacoes: number; vendas: number; avaliacao: number | null }>(sql`
    select c.name nome, r.clients_reached alcancados, r.opportunities_generated oportunidades, r.quotes_generated cotacoes, r.simulated_sales::float vendas, r.rating avaliacao
      from crm.campaign_results r join crm.campaigns c on c.id = r.campaign_id where r.workspace_id = ${ws} order by r.period_start`);
  const atendimento = await rows<{ label: string; valor: number }>(sql`
    select replace(subject, '[SIMULADO] ', '') label, count(*)::int valor from crm.tickets where workspace_id = ${ws}
       and created_at >= ${deTs}::timestamp and created_at <= ${ateTs}::timestamp group by 1 order by 2 desc limit 8`);

  return {
    resumo: { pedidos: resumo.pedidos, faturamento: resumo.faturamento, ticket: resumo.ticket, clientes: resumo.clientes, cancelados: resumo.cancelados, pedidosOcorrencia: resumo.ocorr },
    mensal: mensal.map((m) => ({ mes: m.mes, pedidos: Number(m.pedidos), valor: Number(m.valor), meta: Number(m.meta) })),
    porRegiao: par(porRegiao), porRepresentante: porRep.map((r) => ({ label: r.label, valor: Number(r.valor), extra: Number(r.extra), equipe: r.equipe })),
    porSegmento: par(porSeg), porCategoria: par(porCat), porMarca: par(porMarca), topProdutos: par(topProd),
    topClientes: topClientes.map((c) => ({ ...c, total: Number(c.total), pedidos: Number(c.pedidos) })),
    funil: { aberta: funil.aberta, ganha: funil.ganha, perdida: funil.perdida, valorAberto: funil.valor_aberto, valorGanho: funil.valor_ganho, conversao: decididas ? (funil.ganha / decididas) * 100 : null, diasFechar: funil.dias == null ? null : Number(funil.dias) },
    cotacoes: par(cotacoes), perdas: par(perdas), carteira: { status: par(status), abc: par(abc), rfm: par(rfm), perfil: par(perfil) },
    campanhas: campanhas.map((c) => ({ ...c, alcancados: Number(c.alcancados), oportunidades: Number(c.oportunidades), cotacoes: Number(c.cotacoes), vendas: Number(c.vendas), avaliacao: c.avaliacao })),
    atendimento: par(atendimento),
  };
}

// ── listas ──────────────────────────────────────────────────────────────────
export const POR_PAGINA = 50;

export interface FiltroLista { q?: string; status?: string; rep?: string; regiao?: string; pagina: number; deTs: string; ateTs: string }

export const PEDIDO_STATUS: Record<string, string> = {
  recebido: "Recebido", em_separacao: "Em separação", faturado_simulado: "Faturado (simulado)", enviado: "Enviado", entregue: "Entregue", cancelado: "Cancelado", com_ocorrencia: "Com ocorrência",
};
export const COTACAO_STATUS: Record<string, string> = { enviada: "Enviada", aprovada: "Aprovada", recusada: "Recusada", expirada: "Expirada", substituida: "Substituída" };

function filtros(ws: string, f: FiltroLista, tabela: "o" | "q", campoData: string) {
  const partes: SQL[] = [sql`${sql.raw(tabela)}.workspace_id = ${ws}`, sql`${sql.raw(`${tabela}.${campoData}`)} >= ${f.deTs}::timestamp`, sql`${sql.raw(`${tabela}.${campoData}`)} <= ${f.ateTs}::timestamp`];
  if (f.status) partes.push(sql`${sql.raw(tabela)}.status = ${f.status}`);
  if (f.rep && UUID_RE.test(f.rep)) partes.push(sql`${sql.raw(tabela)}.owner_id = ${f.rep}::uuid`);
  if (f.regiao) partes.push(sql`c.custom_fields->>'regiaoComercial' = ${f.regiao}`);
  if (f.q) partes.push(sql`(${sql.raw(tabela)}.number ilike ${`%${f.q}%`} or c.name ilike ${`%${f.q}%`})`);
  return sql.join(partes, sql` and `);
}

export interface LinhaDoc { id: string; numero: string; data: Date; cliente: string; clienteId: string; regiao: string | null; vendedor: string | null; status: string; total: number; extra: string | null }

export async function listarPedidos(ws: string, f: FiltroLista) {
  const w = filtros(ws, f, "o", "ordered_at");
  const [{ n, soma }] = await rows<{ n: number; soma: number }>(sql`select count(*)::int n, coalesce(sum(o.total) filter (where o.status <> 'cancelado'),0)::float soma from crm.sales_orders o join crm.companies c on c.id = o.company_id where ${w}`);
  const linhas = await rows<LinhaDoc>(sql`
    select o.id, o.number numero, o.ordered_at data, c.name cliente, c.id "clienteId", c.custom_fields->>'regiaoComercial' regiao, u.name vendedor, o.status, o.total::float total, o.channel extra
      from crm.sales_orders o join crm.companies c on c.id = o.company_id left join crm.users u on u.id = o.owner_id
     where ${w} order by o.ordered_at desc limit ${POR_PAGINA} offset ${(f.pagina - 1) * POR_PAGINA}`);
  return { total: Number(n), soma: Number(soma), linhas: linhas.map((l) => ({ ...l, data: new Date(l.data), total: Number(l.total) })) };
}

export async function listarCotacoes(ws: string, f: FiltroLista) {
  const w = filtros(ws, f, "q", "issued_at");
  const [{ n, soma }] = await rows<{ n: number; soma: number }>(sql`select count(*)::int n, coalesce(sum(q.total),0)::float soma from crm.sales_quotes q join crm.companies c on c.id = q.company_id where ${w}`);
  const linhas = await rows<LinhaDoc>(sql`
    select q.id, q.number numero, q.issued_at data, c.name cliente, c.id "clienteId", c.custom_fields->>'regiaoComercial' regiao, u.name vendedor, q.status, q.total::float total, 'v' || q.version extra
      from crm.sales_quotes q join crm.companies c on c.id = q.company_id left join crm.users u on u.id = q.owner_id
     where ${w} order by q.issued_at desc limit ${POR_PAGINA} offset ${(f.pagina - 1) * POR_PAGINA}`);
  return { total: Number(n), soma: Number(soma), linhas: linhas.map((l) => ({ ...l, data: new Date(l.data), total: Number(l.total) })) };
}

export async function opcoesFiltro(ws: string) {
  const reps = await rows<{ id: string; nome: string }>(sql`select distinct u.id, u.name nome from crm.sales_orders o join crm.users u on u.id = o.owner_id where o.workspace_id = ${ws} order by 2`);
  const regioes = await rows<{ nome: string }>(sql`select name nome from crm.sales_regions where workspace_id = ${ws} order by 1`);
  return { reps, regioes: regioes.map((r) => r.nome) };
}

export interface ItemDoc { sku: string; nome: string; categoria: string; qtd: number; unitario: number; desconto: number; total: number }

export async function detalheDocumento(ws: string, tipo: "pedido" | "cotacao", id: string) {
  const t = tipo === "pedido" ? sql.raw("crm.sales_orders") : sql.raw("crm.sales_quotes");
  const campoData = tipo === "pedido" ? sql.raw("d.ordered_at") : sql.raw("d.issued_at");
  const [doc] = await rows<{
    id: string; numero: string; status: string; data: Date; subtotal: number; desconto: number; total: number; notas: string | null; cliente: string; clienteId: string; regiao: string | null;
    vendedor: string | null; contato: string | null; canal: string | null; entrega: Date | null; validade: Date | null; decidida: Date | null; oppId: string | null; oppNome: string | null; versao: number | null; cotacaoNumero: string | null;
  }>(sql`
    select d.id, d.number numero, d.status, ${campoData} data, d.subtotal::float subtotal, d.discount_total::float desconto, d.total::float total, d.notes notas,
           c.name cliente, c.id "clienteId", c.custom_fields->>'regiaoComercial' regiao, u.name vendedor, ct.name contato,
           ${tipo === "pedido" ? sql`d.channel` : sql`null`} canal, ${tipo === "pedido" ? sql`d.delivered_at` : sql`null`} entrega,
           ${tipo === "cotacao" ? sql`d.valid_until` : sql`null`} validade, ${tipo === "cotacao" ? sql`d.decided_at` : sql`null`} decidida,
           d.opportunity_id "oppId", op.name "oppNome", ${tipo === "cotacao" ? sql`d.version` : sql`null`} versao,
           ${tipo === "pedido" ? sql`(select number from crm.sales_quotes where id = d.quote_id)` : sql`null`} "cotacaoNumero"
      from ${t} d join crm.companies c on c.id = d.company_id left join crm.users u on u.id = d.owner_id
      left join crm.contacts ct on ct.id = d.contact_id left join crm.opportunities op on op.id = d.opportunity_id
     where d.id = ${id}::uuid and d.workspace_id = ${ws}`);
  if (!doc) return null;
  const itensTab = tipo === "pedido" ? sql.raw("crm.sales_order_items") : sql.raw("crm.sales_quote_items");
  const fk = tipo === "pedido" ? sql.raw("i.order_id") : sql.raw("i.quote_id");
  const itens = await rows<ItemDoc>(sql`
    select p.sku, p.name nome, p.category categoria, i.qty::int qtd, i.unit_price::float unitario, i.discount_pct::float desconto, i.total::float total
      from ${itensTab} i join crm.catalog_products p on p.id = i.product_id where ${fk} = ${id}::uuid order by i.total desc`);
  return { doc, itens };
}

// ── produtos ────────────────────────────────────────────────────────────────
export interface LinhaProduto {
  id: string; sku: string; nome: string; categoria: string; subcategoria: string | null; marca: string | null; fabricante: string | null; especie: string | null; embalagem: string | null;
  preco: number; status: string; qtdVendida: number; valorVendido: number; vezesCotado: number;
}
export async function listarProdutos(ws: string): Promise<LinhaProduto[]> {
  const r = await rows<LinhaProduto>(sql`
    select p.id, p.sku, p.name nome, p.category categoria, p.subcategory subcategoria, p.brand marca, p.manufacturer fabricante, p.species especie, p.packaging embalagem,
           coalesce(p.list_price, 0)::float preco, p.catalog_status status,
           coalesce((select sum(i.qty) from crm.sales_order_items i join crm.sales_orders o on o.id = i.order_id where i.product_id = p.id and o.status <> 'cancelado'), 0)::int "qtdVendida",
           coalesce((select sum(i.total) from crm.sales_order_items i join crm.sales_orders o on o.id = i.order_id where i.product_id = p.id and o.status <> 'cancelado'), 0)::float "valorVendido",
           (select count(*) from crm.sales_quote_items i where i.product_id = p.id)::int "vezesCotado"
      from crm.catalog_products p where p.workspace_id = ${ws} order by p.category, p.sku`);
  return r.map((x) => ({ ...x, preco: Number(x.preco), qtdVendida: Number(x.qtdVendida), valorVendido: Number(x.valorVendido), vezesCotado: Number(x.vezesCotado) }));
}

// ── cliente 360 ─────────────────────────────────────────────────────────────
export async function cliente360(ws: string, id: string) {
  const [c] = await rows<{ id: string; nome: string; segmento: string | null; porte: string | null; campos: Campos; dono: string | null; criado: Date }>(sql`
    select c.id, c.name nome, c.industry segmento, c.size porte, c.custom_fields campos, u.name dono, c.created_at criado
      from crm.companies c left join crm.users u on u.id = c.owner_id where c.id = ${id}::uuid and c.workspace_id = ${ws} and c.deleted_at is null`);
  if (!c) return null;
  const contatos = await rows<{ id: string; nome: string; cargo: string | null; email: string | null; telefone: string | null; campos: Campos }>(sql`
    select id, name nome, title cargo, email, phone telefone, custom_fields campos from crm.contacts where company_id = ${id}::uuid and deleted_at is null order by created_at`);
  const pedidos = await rows<{ id: string; numero: string; data: Date; status: string; total: number; canal: string; itens: number }>(sql`
    select o.id, o.number numero, o.ordered_at data, o.status, o.total::float total, o.channel canal, (select count(*) from crm.sales_order_items i where i.order_id = o.id)::int itens
      from crm.sales_orders o where o.company_id = ${id}::uuid order by o.ordered_at desc limit 60`);
  const cotacoes = await rows<{ id: string; numero: string; data: Date; status: string; total: number; versao: number }>(sql`
    select id, number numero, issued_at data, status, total::float total, version versao from crm.sales_quotes where company_id = ${id}::uuid order by issued_at desc limit 40`);
  const oportunidades = await rows<{ id: string; nome: string; status: string; valor: number; criada: Date; fechada: Date | null; motivo: string | null; etapa: string | null }>(sql`
    select id, name nome, status, amount::float valor, created_at criada, closed_at fechada, lost_reason motivo, custom_fields->>'etapaDetalhada' etapa
      from crm.opportunities where company_id = ${id}::uuid order by created_at desc limit 40`);
  const atividades = await rows<{ id: string; tipo: string; quando: Date; texto: string | null; resultado: string | null; quem: string | null }>(sql`
    select a.id, a.type tipo, a.created_at quando, a.payload->>'text' texto, a.payload->>'resultado' resultado, u.name quem
      from crm.activities a left join crm.users u on u.id = a.actor_id
     where (a.related_to_type = 'company' and a.related_to_id = ${id}::uuid) or a.payload->>'companyId' = ${id}
     order by a.created_at desc limit 40`);
  const ocorrencias = await rows<{ id: string; assunto: string; status: string; prioridade: string; aberta: Date }>(sql`
    select id, subject assunto, status, priority prioridade, created_at aberta from crm.tickets where company_id = ${id}::uuid order by created_at desc limit 20`);
  const porCategoria = await rows<{ label: string; valor: number }>(sql`
    select p.category label, sum(i.total)::float valor from crm.sales_order_items i join crm.catalog_products p on p.id = i.product_id join crm.sales_orders o on o.id = i.order_id
     where o.company_id = ${id}::uuid and o.status <> 'cancelado' group by 1 order by 2 desc`);
  const mensal = await rows<{ mes: string; valor: number }>(sql`
    select to_char(ordered_at, 'YYYY-MM') mes, sum(total)::float valor from crm.sales_orders where company_id = ${id}::uuid and status <> 'cancelado' group by 1 order by 1`);
  return { c, contatos, pedidos, cotacoes, oportunidades, atividades, ocorrencias, porCategoria: porCategoria.map((x) => ({ label: x.label, valor: Number(x.valor) })), mensal: mensal.map((m) => ({ mes: m.mes, valor: Number(m.valor) })) };
}
