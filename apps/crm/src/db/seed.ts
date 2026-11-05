import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import * as s from "./schema";
import { stageLabel } from "../lib/presalesFunnel";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL nao definida — necessaria para semear o Postgres do stack.");
}
const client = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(client, { schema: s });

function daysAgo(n: number) {
  return new Date(Date.now() - n * 86400000);
}
function daysAhead(n: number) {
  return new Date(Date.now() + n * 86400000);
}

async function main() {
  console.log("Seeding Lovet Distribuidora CRM…");

  // Idempotente: limpa tudo antes de semear (evita duplicar em re-execuções).
  const allTables = [
    "plant_readings", "tickets", "plants", "delivery_routes", "service_orders",
    "credit_beneficiaries", "credit_plants", "engineering_designs",
    "payroll_entries", "invoices", "stock_movements", "inventory_items",
    "bank_transactions", "receivables", "payables", "financial_accounts",
    "contracts", "commissions",
    "presales_handoffs", "presales_leads",
    "whatsapp_messages", "whatsapp_conversations", "whatsapp_templates",
    "installation_projects", "proposals", "site_surveys", "sites", "equipment_catalog",
    "tasks", "activities", "opportunity_stage_history", "opportunities",
    "pipeline_stages", "pipelines", "contacts", "companies",
    "workspace_members", "users", "workspaces",
  ];
  for (const t of allTables) {
    await db.execute(sql.raw(`TRUNCATE TABLE "${t}" CASCADE`)).catch(() => {});
  }

  const [ws] = await db.insert(s.workspaces).values({
    name: "Lovet Distribuidora",
    slug: "lovet",
    plan: "pro",
    settings: { currency: "BRL", timezone: "America/Sao_Paulo" },
  }).returning();

  const usersData = [
    { email: "ana@lovet.local", name: "Ana Ribeiro", role: "owner" as const },
    { email: "bruno@lovet.local", name: "Bruno Costa", role: "manager" as const },
    { email: "carla@lovet.local", name: "Carla Mendes", role: "rep" as const },
    { email: "diego@lovet.local", name: "Diego Alves", role: "rep" as const },
    { email: "edu@lovet.local", name: "Eduardo Lima", role: "installer" as const },
    { email: "marina@lovet.local", name: "Marina Rocha", role: "sdr" as const },
    { email: "rafael@lovet.local", name: "Rafael Duarte", role: "sdr" as const },
  ];
  const users = await db.insert(s.users).values(usersData.map(({ email, name }) => ({ email, name }))).returning();
  await db.insert(s.workspaceMembers).values(
    users.map((u, i) => ({ workspaceId: ws.id, userId: u.id, role: usersData[i].role }))
  );
  const [ana, bruno, carla, diego, edu, marina, rafael] = users;

  // Pipelines — dois funis de venda: venda ao cliente final e captação
  // do parceiro que revende (ver DEFAULT_STAGES em app/actions-funnels.ts).
  const [salesPipe] = await db.insert(s.pipelines).values({
    workspaceId: ws.id, name: "Venda Direta", kind: "sales", isDefault: true, sortOrder: 1,
  }).returning();
  const [partnerPipe] = await db.insert(s.pipelines).values({
    workspaceId: ws.id, name: "Captação de Parceiros", kind: "sales", color: "#0ea5e9", sortOrder: 2,
  }).returning();
  const [instPipe] = await db.insert(s.pipelines).values({
    workspaceId: ws.id, name: "Projeto / Instalação", kind: "installation",
  }).returning();

  const salesStages = await db.insert(s.pipelineStages).values([
    { pipelineId: salesPipe.id, name: "Negociação", order: 1, probability: 40, slaDays: 5 },
    { pipelineId: salesPipe.id, name: "Cobrança enviada", order: 2, probability: 70, slaDays: 5 },
    { pipelineId: salesPipe.id, name: "Ganho", order: 3, probability: 100, isWon: true },
    { pipelineId: salesPipe.id, name: "Perdido", order: 4, probability: 0, isLost: true },
  ]).returning();
  const [stNegoc, stCobranca, stGanho, stPerdido] = salesStages;

  await db.insert(s.pipelineStages).values([
    { pipelineId: partnerPipe.id, name: "Prospecção", order: 1, probability: 10, slaDays: 5 },
    { pipelineId: partnerPipe.id, name: "Contato / apresentação", order: 2, probability: 25, slaDays: 5 },
    { pipelineId: partnerPipe.id, name: "Proposta de parceria", order: 3, probability: 50, slaDays: 7 },
    { pipelineId: partnerPipe.id, name: "Credenciamento / documentação", order: 4, probability: 75, slaDays: 10 },
    { pipelineId: partnerPipe.id, name: "Parceiro ativado", order: 5, probability: 100, isWon: true },
    { pipelineId: partnerPipe.id, name: "Não avançou", order: 6, probability: 0, isLost: true },
  ]);

  const instStages = await db.insert(s.pipelineStages).values([
    { pipelineId: instPipe.id, name: "Projeto / Homologação", order: 1, slaDays: 15 },
    { pipelineId: instPipe.id, name: "Aguardando concessionária", order: 2, slaDays: 34 },
    { pipelineId: instPipe.id, name: "Instalação agendada", order: 3, slaDays: 10 },
    { pipelineId: instPipe.id, name: "Instalação concluída", order: 4, slaDays: 7 },
    { pipelineId: instPipe.id, name: "Sistema ligado", order: 5, isWon: true },
  ]).returning();
  const [iHomolog, iConcess, iAgendada, iConcluida, iLigado] = instStages;

  // Equipment catalog
  await db.insert(s.equipmentCatalog).values([
    { workspaceId: ws.id, type: "panel", manufacturer: "Canadian Solar", model: "HiKu7 665W", specs: { watts: 665, efficiency: 21.4, warranty_years: 25 }, unitCost: "620.00", unitPrice: "890.00" },
    { workspaceId: ws.id, type: "panel", manufacturer: "JA Solar", model: "DeepBlue 4.0 585W", specs: { watts: 585, efficiency: 21.1, warranty_years: 25 }, unitCost: "540.00", unitPrice: "790.00" },
    { workspaceId: ws.id, type: "inverter", manufacturer: "Growatt", model: "MIN 6000TL-X", specs: { kw: 6, phases: 1, warranty_years: 10 }, unitCost: "3200.00", unitPrice: "4500.00" },
    { workspaceId: ws.id, type: "inverter", manufacturer: "Fronius", model: "Primo 8.2-1", specs: { kw: 8.2, phases: 1, warranty_years: 7 }, unitCost: "8900.00", unitPrice: "12400.00" },
    { workspaceId: ws.id, type: "structure", manufacturer: "Romagnole", model: "Kit telhado cerâmico", specs: {}, unitCost: "45.00", unitPrice: "78.00" },
  ]);

  // Clientes B2C (pessoa física) + contatos + locais de instalação
  const companiesData = [
    { name: "Roberto Nunes", owner: carla },
    { name: "Fernanda Souza", owner: carla },
    { name: "Marcos Teixeira", owner: diego },
    { name: "Juliana Prado", owner: diego },
    { name: "Antônio Ferreira", owner: carla },
    { name: "Patrícia Ramos", owner: diego },
    { name: "Carlos Silva", owner: carla },
    { name: "João Camargo", owner: diego },
  ];
  const companies = await db.insert(s.companies).values(
    companiesData.map((c) => ({ workspaceId: ws.id, name: c.name, industry: "Pessoa Física", ownerId: c.owner.id }))
  ).returning();

  const contactsData = [
    { name: "Roberto Nunes", cpf: "052.318.447-90", birth: "1978-03-12", email: "roberto.nunes@gmail.com", phone: "(48) 99911-2233", company: 0 },
    { name: "Fernanda Souza", cpf: "081.226.905-14", birth: "1985-11-02", email: "fer.souza@hotmail.com", phone: "(48) 98822-3344", company: 1 },
    { name: "Marcos Teixeira", cpf: "033.914.782-61", birth: "1969-07-25", email: "marcos.teixeira@gmail.com", phone: "(47) 99733-4455", company: 2 },
    { name: "Juliana Prado", cpf: "094.557.213-08", birth: "1990-01-18", email: "ju.prado@gmail.com", phone: "(47) 98644-5566", company: 3 },
    { name: "Antônio Ferreira", cpf: "021.443.679-35", birth: "1958-09-30", email: "antonio.ferreira58@gmail.com", phone: "(48) 99555-6677", company: 4 },
    { name: "Patrícia Ramos", cpf: "067.882.140-52", birth: "1982-05-07", email: "patricia.ramos@outlook.com", phone: "(48) 98466-7788", company: 5 },
    { name: "Carlos Silva", cpf: "045.190.328-77", birth: "1975-12-14", email: "carlos.silva75@gmail.com", phone: "(49) 99377-8899", company: 6 },
    { name: "João Camargo", cpf: "029.664.851-03", birth: "1963-04-21", email: "joao.camargo@gmail.com", phone: "(49) 98288-9900", company: 7 },
  ];
  const contacts = await db.insert(s.contacts).values(
    contactsData.map((c) => ({
      workspaceId: ws.id, name: c.name, email: c.email, phone: c.phone,
      cpf: c.cpf, birthDate: new Date(`${c.birth}T00:00:00`),
      companyId: companies[c.company].id, ownerId: companies[c.company].ownerId,
    }))
  ).returning();

  const sitesData = [
    { company: 0, address: "Av. Central, 1200 — Centro", city: "São José", state: "SC", roofType: "Metálico", roofAreaM2: "850.0", utility: "CELESC", consumption: 8200 },
    { company: 1, address: "Rod. BR-101, km 210", city: "Palhoça", state: "SC", roofType: "Metálico", roofAreaM2: "2400.0", utility: "CELESC", consumption: 32000 },
    { company: 2, address: "Rua das Gaivotas, 88 — Praia", city: "Bombinhas", state: "SC", roofType: "Cerâmico", roofAreaM2: "620.0", utility: "CELESC", consumption: 5400 },
    { company: 3, address: "Av. Industrial, 455", city: "Itajaí", state: "SC", roofType: "Fibrocimento", roofAreaM2: "1100.0", utility: "CELESC", consumption: 4100 },
    { company: 4, address: "Rua XV de Novembro, 233", city: "Florianópolis", state: "SC", roofType: "Cerâmico", roofAreaM2: "180.0", utility: "CELESC", consumption: 1900 },
    { company: 5, address: "Av. Beira Mar, 900 — sala térrea", city: "Florianópolis", state: "SC", roofType: "Laje", roofAreaM2: "310.0", utility: "CELESC", consumption: 3600 },
    { company: 6, address: "Rua do Comércio, 45", city: "Chapecó", state: "SC", roofType: "Metálico", roofAreaM2: "420.0", utility: "CELESC", consumption: 2300 },
    { company: 7, address: "Estrada Geral, s/n — Interior", city: "Xanxerê", state: "SC", roofType: "Solo (usina)", roofAreaM2: "5000.0", utility: "CELESC", consumption: 12500 },
  ];
  const sites = await db.insert(s.sites).values(
    sitesData.map((x) => ({
      workspaceId: ws.id, companyId: companies[x.company].id, address: x.address, city: x.city, state: x.state,
      roofType: x.roofType, roofAreaM2: x.roofAreaM2, utilityCompany: x.utility, tariffClass: "B3",
      avgMonthlyConsumptionKwh: x.consumption,
    }))
  ).returning();

  // Opportunities across sales stages. Valores coerentes com o ticket real do
  const oppsData = [
    { name: "Nunes Contabilidade — 40 Produto A Variante A", company: 0, stage: stCobranca, amount: "8920.00", produto: "Produto A", midia: "Variante A", qtd: 40, owner: carla, source: "Indicação", days: 3, close: 40 },
    { name: "Frigorífico Souza — 12 Produto A Variante B", company: 1, stage: stNegoc, amount: "4814.00", produto: "Produto A", midia: "Variante B", qtd: 12, owner: carla, source: "Tráfego pago", days: 12, close: 20 },
    { name: "Teixeira Assessoria — 25 Produto B Variante A", company: 2, stage: stCobranca, amount: "3737.00", produto: "Produto B", midia: "Variante A", qtd: 25, owner: diego, source: "Loja física", days: 9, close: 30 },
    { name: "Prado Advogados — 8 Produto B Variante B", company: 3, stage: stNegoc, amount: "2625.00", produto: "Produto B", midia: "Variante B", qtd: 8, owner: diego, source: "Indicação", days: 1, close: 60 },
    { name: "Ferreira Transportes — 5 Produto A Variante A", company: 4, stage: stCobranca, amount: "1114.00", produto: "Produto A", midia: "Variante A", qtd: 5, owner: carla, source: "WhatsApp", days: 11, close: 25 },
    { name: "Ramos Consultoria — 18 un. Produto B", company: 5, stage: stGanho, amount: "2358.00", produto: "Produto B", midia: "Variante C", qtd: 18, owner: diego, source: "Site", days: 2, close: -5, won: true },
    { name: "Silva & Cia — 30 Produto A Variante A", company: 6, stage: stGanho, amount: "6685.00", produto: "Produto A", midia: "Variante A", qtd: 30, owner: carla, source: "Tráfego pago", days: 30, close: -30, won: true },
    { name: "Camargo Agro — 60 Produto A Variante A", company: 7, stage: stNegoc, amount: "13370.00", produto: "Produto A", midia: "Variante A", qtd: 60, owner: diego, source: "Instagram", days: 6, close: 15 },
    { name: "Teixeira Assessoria — recompra 10 Produto B Variante A", company: 2, stage: stPerdido, amount: "1495.00", produto: "Produto B", midia: "Variante A", qtd: 10, owner: diego, source: "Base / recompra", days: 20, close: -10, lost: true },
  ];
  const opps = await db.insert(s.opportunities).values(
    oppsData.map((o) => ({
      workspaceId: ws.id, pipelineId: salesPipe.id, stageId: o.stage.id,
      companyId: companies[o.company].id, primaryContactId: contacts[o.company].id,
      ownerId: o.owner.id, name: o.name, amount: o.amount,
      productLine: o.produto, productVariant: o.midia, productQty: o.qtd,
      leadSource: o.source,
      status: o.won ? ("won" as const) : o.lost ? ("lost" as const) : ("open" as const),
      lostReason: o.lost ? "Optou por concorrente com financiamento próprio" : null,
      expectedCloseDate: daysAhead(o.close),
      closedAt: o.won || o.lost ? daysAgo(Math.abs(o.close)) : null,
      stageEnteredAt: daysAgo(o.days),
      createdAt: daysAgo(o.days + 15),
    }))
  ).returning();

  // Stage history + activities for each opp
  for (let i = 0; i < opps.length; i++) {
    const o = opps[i];
    await db.insert(s.opportunityStageHistory).values({
      opportunityId: o.id, fromStageId: null, toStageId: stNegoc.id,
      changedBy: o.ownerId, changedAt: daysAgo(oppsData[i].days + 15),
    });
    if (o.stageId !== stNegoc.id) {
      await db.insert(s.opportunityStageHistory).values({
        opportunityId: o.id, fromStageId: stNegoc.id, toStageId: o.stageId,
        changedBy: o.ownerId, changedAt: daysAgo(oppsData[i].days),
        timeInStageSeconds: 15 * 86400,
      });
    }
    await db.insert(s.activities).values([
      { workspaceId: ws.id, actorId: o.ownerId, actorType: "user", relatedToType: "opportunity", relatedToId: o.id, type: "note", payload: { text: "Primeiro contato realizado, cliente confirmou necessidade de repor os itens da carteira." }, createdAt: daysAgo(oppsData[i].days + 14) },
      { workspaceId: ws.id, actorId: o.ownerId, actorType: "user", relatedToType: "opportunity", relatedToId: o.id, type: "call_logged", payload: { text: "Ligação de qualificação — quantidade e vencimentos confirmados, decisor identificado." }, createdAt: daysAgo(oppsData[i].days + 10) },
      { workspaceId: ws.id, actorId: o.ownerId, actorType: "user", relatedToType: "opportunity", relatedToId: o.id, type: "note", payload: { text: `Proposta montada com preço de referência: ${oppsData[i].qtd}× ${oppsData[i].produto} ${oppsData[i].midia}.` }, createdAt: daysAgo(oppsData[i].days + 9) },
    ]);
  }

  // Proposals for opps in proposta+ stages
  const propOpps = [1, 2, 4, 5, 6, 7];
  for (const i of propOpps) {
    const o = opps[i];
    await db.insert(s.proposals).values({
      workspaceId: ws.id, opportunityId: o.id, version: 1,
      productLine: oppsData[i].produto,
      productVariant: oppsData[i].midia,
      qty: oppsData[i].qtd,
      unitPrice: (parseFloat(oppsData[i].amount) / oppsData[i].qtd).toFixed(2),
      validityMonths: oppsData[i].midia === "Variante B" ? 36 : 12,
      totalPrice: oppsData[i].amount,
      financingType: i % 2 === 0 ? "financing" : "cash",
      installments: i % 2 === 0 ? 12 : null,
      status: oppsData[i].won ? "accepted" : "sent",
    });
  }

  // Surveys
  await db.insert(s.siteSurveys).values([
    { workspaceId: ws.id, siteId: sites[0].id, opportunityId: opps[0].id, surveyorId: edu.id, scheduledAt: daysAhead(2), technicalFeasibility: "pending" },
    { workspaceId: ws.id, siteId: sites[1].id, opportunityId: opps[1].id, surveyorId: edu.id, scheduledAt: daysAgo(8), completedAt: daysAgo(8), technicalFeasibility: "viable", structuralNotes: "Estrutura metálica em ótimo estado, sem sombreamento." },
    { workspaceId: ws.id, siteId: sites[5].id, opportunityId: opps[5].id, surveyorId: edu.id, scheduledAt: daysAgo(20), completedAt: daysAgo(20), technicalFeasibility: "viable", structuralNotes: "Laje impermeabilizada, instalar com estrutura inclinada 15°." },
    { workspaceId: ws.id, siteId: sites[7].id, opportunityId: opps[7].id, surveyorId: edu.id, scheduledAt: daysAhead(4), technicalFeasibility: "pending" },
  ]);

  // Installation projects for won opps
  const instProjects = await db.insert(s.installationProjects).values([
    {
      workspaceId: ws.id, opportunityId: opps[5].id, siteId: sites[5].id,
      projectManagerId: bruno.id, installerId: edu.id, stageId: iHomolog.id,
      permitStatus: "submitted", utilityApprovalStatus: "pending",
      stageEnteredAt: daysAgo(4),
    },
    {
      workspaceId: ws.id, opportunityId: opps[6].id, siteId: sites[6].id,
      projectManagerId: bruno.id, installerId: edu.id, stageId: iAgendada.id,
      permitStatus: "approved", utilityApprovalStatus: "approved",
      installationScheduledAt: daysAhead(5), stageEnteredAt: daysAgo(2),
    },
  ]).returning();

  // Tasks
  await db.insert(s.tasks).values([
    { workspaceId: ws.id, relatedToType: "opportunity", relatedToId: opps[0].id, assigneeId: edu.id, createdBy: carla.id, type: "visit", title: "Visita técnica — Roberto Nunes", dueAt: daysAhead(2) },
    { workspaceId: ws.id, relatedToType: "opportunity", relatedToId: opps[1].id, assigneeId: carla.id, createdBy: bruno.id, type: "meeting", title: "Reunião de negociação com Fernanda (Frigorífico)", dueAt: daysAhead(1) },
    { workspaceId: ws.id, relatedToType: "opportunity", relatedToId: opps[2].id, assigneeId: diego.id, createdBy: diego.id, type: "call", title: "Follow-up da proposta — Marcos Teixeira", dueAt: daysAgo(1) },
    { workspaceId: ws.id, relatedToType: "opportunity", relatedToId: opps[4].id, assigneeId: carla.id, createdByAgent: true, type: "call", title: "[IA] Proposta parada há 11 dias — retomar contato com Seu Antônio", dueAt: daysAhead(0) },
    { workspaceId: ws.id, relatedToType: "opportunity", relatedToId: opps[3].id, assigneeId: diego.id, createdBy: diego.id, type: "call", title: "Ligação de qualificação — Juliana Prado", dueAt: daysAhead(1) },
    { workspaceId: ws.id, relatedToType: "installation_project", relatedToId: opps[6].id, assigneeId: edu.id, createdBy: bruno.id, type: "visit", title: "Instalação — Carlos Silva (20 kWp)", dueAt: daysAhead(5) },
  ]);

  // WhatsApp: templates + conversas com histórico
  await db.insert(s.whatsappTemplates).values([
    { workspaceId: ws.id, title: "Saudação inicial", category: "saudacao", body: "Olá! Aqui é da Lovet Distribuidora Vi seu interesse em reduzir a conta de luz. Posso te fazer algumas perguntas rápidas para simular sua economia?" },
    { workspaceId: ws.id, title: "Envio de proposta", category: "proposta", body: "Prontinho! Sua proposta personalizada está anexada. Qualquer dúvida sobre o dimensionamento ou financiamento, me chama por aqui." },
    { workspaceId: ws.id, title: "Follow-up proposta parada", category: "proposta", body: "Oi! Passando para saber se conseguiu dar uma olhada na proposta que enviei. Fico à disposição para ajustar valores ou condições de pagamento." },
    { workspaceId: ws.id, title: "Atualização de instalação", category: "instalacao", body: "Boas notícias! Sua homologação foi aprovada pela concessionária. Vamos agendar a instalação — qual a melhor data para você?" },
    { workspaceId: ws.id, title: "Cobrança amigável", category: "cobranca", body: "Oi! Notei que a parcela ainda está em aberto. Consegue verificar? Qualquer imprevisto, me avisa que resolvemos juntos." },
  ]);

  const waConvData = [
    {
      contact: 0, opp: 0, owner: carla, status: "open" as const, lastAgo: 0.05, unread: 2,
      messages: [
        { dir: "in" as const, text: "Oi, vi o anúncio de vocês no Instagram. Quanto custa energia solar pra um mercado do meu tamanho?", ago: 3 },
        { dir: "out" as const, text: "Olá Roberto! Aqui é a Carla da Lovet Distribuidora Consigo te passar uma estimativa rápida — qual sua conta de luz média por mês?", by: carla, ago: 2.9 },
        { dir: "in" as const, text: "Fica em torno de 8 mil reais", ago: 2.8 },
        { dir: "out" as const, text: "Perfeito, dá pra reduzir bastante isso. Vou agendar uma visita técnica gratuita para dimensionar certinho, pode ser essa semana?", by: carla, ago: 2.7 },
        { dir: "in" as const, text: "Pode sim! Quinta de manhã funciona", ago: 0.2 },
        { dir: "in" as const, text: "Vocês fazem financiamento também?", ago: 0.05 },
      ],
    },
    {
      contact: 4, opp: 4, owner: carla, status: "pending" as const, lastAgo: 0.5, unread: 1,
      messages: [
        { dir: "out" as const, text: "Oi Seu Antônio! Passando para saber se conseguiu ver a proposta da padaria que te mandei.", by: carla, ago: 11 },
        { dir: "in" as const, text: "Oi Carla, vi sim! Achei o valor bom, só preciso conversar com minha esposa", ago: 10 },
        { dir: "out" as const, text: "Sem pressa! Fico à disposição se tiverem dúvidas sobre o financiamento ou a instalação.", by: carla, ago: 9.5 },
        { dir: "in" as const, text: "Ela gostou também! Só uma dúvida: em quanto tempo a instalação fica pronta depois que assinamos?", ago: 0.5 },
      ],
    },
    {
      contact: 5, opp: 5, owner: diego, status: "closed" as const, lastAgo: 2, unread: 0,
      messages: [
        { dir: "out" as const, text: "Dra. Patrícia, boas notícias! Sua homologação foi aprovada pela CELESC 🎉", by: diego, ago: 4 },
        { dir: "in" as const, text: "Que ótimo! Quando fica a instalação?", ago: 3.8 },
        { dir: "out" as const, text: "Já está agendada, nosso técnico Eduardo vai até a clínica. Ele vai confirmar o horário exato.", by: diego, ago: 3.7 },
        { dir: "in" as const, text: "Perfeito, muito obrigada pela atenção durante todo o processo!", ago: 2 },
      ],
    },
    {
      contact: 2, opp: 2, owner: diego, status: "open" as const, lastAgo: 1, unread: 0,
      messages: [
        { dir: "in" as const, text: "Diego, recebi a proposta do hotel. O valor do inversor Growatt pode ser trocado por um Fronius?", ago: 5 },
        { dir: "out" as const, text: "Consigo sim, o Fronius tem uma garantia menor (7 anos vs 10) mas é mais robusto. Quer que eu refaça a proposta com ele?", by: diego, ago: 4.8 },
        { dir: "in" as const, text: "Pode refazer, quero comparar os dois", ago: 1 },
      ],
    },
    {
      contact: 3, opp: null, owner: diego, status: "open" as const, lastAgo: 0.9, unread: 0,
      messages: [
        { dir: "out" as const, text: "Oi Juliana! Aqui é da Lovet Distribuidora. Vi que preencheu nosso formulário do site sobre energia solar para a transportadora.", by: diego, ago: 1 },
        { dir: "in" as const, text: "Oi! Sim, temos um pátio grande e queria entender se compensa colocar placas no telhado do galpão", ago: 0.9 },
      ],
    },
  ];

  for (const wc of waConvData) {
    const contact = contacts[wc.contact];
    if (!contact.phone) continue;
    const [conv] = await db.insert(s.whatsappConversations).values({
      workspaceId: ws.id,
      contactId: contact.id,
      companyId: contact.companyId,
      opportunityId: wc.opp !== null ? opps[wc.opp].id : null,
      phone: contact.phone,
      contactName: contact.name,
      assignedTo: wc.owner.id,
      status: wc.status,
      unreadCount: wc.unread,
      lastMessageAt: daysAgo(wc.lastAgo),
      lastMessagePreview: wc.messages[wc.messages.length - 1].text,
    }).returning();

    await db.insert(s.whatsappMessages).values(
      wc.messages.map((m) => ({
        workspaceId: ws.id,
        conversationId: conv.id,
        direction: m.dir,
        body: m.text,
        sentBy: m.dir === "out" ? m.by?.id : undefined,
        status: m.dir === "out" ? ("read" as const) : ("sent" as const),
        createdAt: daysAgo(m.ago),
      }))
    );
  }

  // ─── VENDAS: comissões & contratos ─────────────────────────────────────────
  const wonOpps = opps.filter((o) => o.status === "won");
  await db.insert(s.commissions).values(
    wonOpps.map((o, i) => {
      const base = parseFloat(o.amount ?? "0");
      const rate = 3;
      return {
        workspaceId: ws.id, opportunityId: o.id, userId: o.ownerId!,
        baseAmount: o.amount!, ratePct: rate.toFixed(2), amount: (base * rate / 100).toFixed(2),
        status: i === 0 ? ("approved" as const) : ("paid" as const),
        approvedAt: daysAgo(3), paidAt: i === 0 ? null : daysAgo(1),
      };
    })
  );
  await db.insert(s.contracts).values(
    wonOpps.map((o, i) => ({
      workspaceId: ws.id, opportunityId: o.id,
      number: `CT-2026-${String(i + 1).padStart(4, "0")}`,
      value: o.amount!, paymentTerms: i % 2 === 0 ? "Financiamento 60x" : "À vista (5% desconto)",
      status: "signed" as const, sentAt: daysAgo(10), signedAt: daysAgo(6),
    }))
  );
  // Contrato em negociação (oportunidade aberta na etapa de negociação)
  const negocOpp = opps[1];
  await db.insert(s.contracts).values({
    workspaceId: ws.id, opportunityId: negocOpp.id, number: "CT-2026-0003",
    value: negocOpp.amount!, paymentTerms: "Financiamento 72x", status: "sent", sentAt: daysAgo(2),
  });

  const invItems = await db.insert(s.inventoryItems).values([
    { workspaceId: ws.id, sku: "PN-CS-665", name: "Painel Canadian Solar HiKu7 665W", quantity: 148, minStock: 60, location: "Galpão A · Prateleira 1", unitCost: "620.00" },
    { workspaceId: ws.id, sku: "PN-JA-585", name: "Painel JA Solar DeepBlue 585W", quantity: 42, minStock: 60, location: "Galpão A · Prateleira 2", unitCost: "540.00" },
    { workspaceId: ws.id, sku: "INV-GW-6K", name: "Inversor Growatt MIN 6000TL-X", quantity: 11, minStock: 6, location: "Galpão B · Rack 3", unitCost: "3200.00" },
    { workspaceId: ws.id, sku: "INV-FR-82", name: "Inversor Fronius Primo 8.2-1", quantity: 3, minStock: 4, location: "Galpão B · Rack 3", unitCost: "8900.00" },
    { workspaceId: ws.id, sku: "EST-RM-CER", name: "Kit estrutura telhado cerâmico", quantity: 380, minStock: 200, location: "Galpão A · Piso", unitCost: "45.00" },
    { workspaceId: ws.id, sku: "CBO-6MM", name: "Cabo solar 6mm² (metro)", quantity: 1200, minStock: 800, location: "Galpão B · Bobinas", unitCost: "4.20" },
  ]).returning();
  await db.insert(s.stockMovements).values([
    { workspaceId: ws.id, itemId: invItems[0].id, kind: "in", quantity: 240, reason: "Compra Aldo Solar NF 45231", createdBy: bruno.id, createdAt: daysAgo(12) },
    { workspaceId: ws.id, itemId: invItems[0].id, kind: "out", quantity: 92, reason: "Instalação Carlos Silva", relatedOpportunityId: opps[6].id, createdBy: edu.id, createdAt: daysAgo(2) },
    { workspaceId: ws.id, itemId: invItems[2].id, kind: "out", quantity: 1, reason: "Instalação Patrícia Ramos", relatedOpportunityId: opps[5].id, createdBy: edu.id, createdAt: daysAgo(4) },
  ]);

  await db.insert(s.invoices).values([
    { workspaceId: ws.id, companyId: companies[5].id, opportunityId: opps[5].id, kind: "nfe", number: "1042", series: "1", amount: "134000.00", taxAmount: "8040.00", status: "issued", accessKey: "4226 0712 3456 7890 1234 5500 1000 1042 1000 1042 55", issuedAt: daysAgo(5) },
    { workspaceId: ws.id, companyId: companies[6].id, opportunityId: opps[6].id, kind: "nfe", number: "1043", series: "1", amount: "84000.00", taxAmount: "5040.00", status: "issued", accessKey: "4226 0712 3456 7890 1234 5500 1000 1043 1000 1043 55", issuedAt: daysAgo(2) },
    { workspaceId: ws.id, companyId: companies[1].id, kind: "nfse", number: "88", series: "1", amount: "12000.00", taxAmount: "600.00", status: "draft" },
  ]);

  const monthRef = new Date().toISOString().slice(0, 7);
  await db.insert(s.payrollEntries).values([
    { workspaceId: ws.id, userId: ana.id, referenceMonth: monthRef, baseSalary: "12000.00", benefits: "1500.00", deductions: "3200.00", netPay: "10300.00", status: "approved" },
    { workspaceId: ws.id, userId: bruno.id, referenceMonth: monthRef, baseSalary: "8500.00", benefits: "1200.00", deductions: "2100.00", netPay: "7600.00", status: "approved" },
    { workspaceId: ws.id, userId: carla.id, referenceMonth: monthRef, baseSalary: "3000.00", commissionTotal: "6540.00", benefits: "800.00", deductions: "1400.00", netPay: "8940.00", status: "draft" },
    { workspaceId: ws.id, userId: diego.id, referenceMonth: monthRef, baseSalary: "3000.00", commissionTotal: "2520.00", benefits: "800.00", deductions: "980.00", netPay: "5340.00", status: "draft" },
    { workspaceId: ws.id, userId: edu.id, referenceMonth: monthRef, baseSalary: "4200.00", benefits: "900.00", deductions: "1100.00", netPay: "4000.00", status: "draft" },
  ]);

  // ─── ENGENHARIA ────────────────────────────────────────────────────────────
  await db.insert(s.engineeringDesigns).values([
    { workspaceId: ws.id, opportunityId: opps[5].id, siteId: sites[5].id, engineerId: bruno.id, avgConsumptionKwh: 3600, targetOffsetPct: 100, irradiationKwhM2Day: "4.75", systemSizeKwp: "32.00", panelModel: "Canadian Solar HiKu7 665W", panelWatts: 665, panelQty: 48, inverterModel: "Growatt MID 30KTL3-X", inverterKw: "30.00", estimatedGenerationKwhMonth: 3776, performanceRatio: "0.80", requiredAreaM2: "162.0", status: "approved", unifilar: { modules: 48, strings: 4, breakerA: 50, cableMm2: 6 } },
    { workspaceId: ws.id, opportunityId: opps[6].id, siteId: sites[6].id, engineerId: bruno.id, avgConsumptionKwh: 2300, targetOffsetPct: 100, irradiationKwhM2Day: "4.90", systemSizeKwp: "20.00", panelModel: "Canadian Solar HiKu7 665W", panelWatts: 665, panelQty: 30, inverterModel: "Growatt MIN 20000TL-X", inverterKw: "20.00", estimatedGenerationKwhMonth: 2450, performanceRatio: "0.81", requiredAreaM2: "101.0", status: "issued", unifilar: { modules: 30, strings: 3, breakerA: 40, cableMm2: 6 } },
    { workspaceId: ws.id, opportunityId: opps[0].id, siteId: sites[0].id, engineerId: bruno.id, avgConsumptionKwh: 8200, targetOffsetPct: 95, irradiationKwhM2Day: "4.80", systemSizeKwp: "75.00", panelModel: "Canadian Solar HiKu7 665W", panelWatts: 665, panelQty: 113, inverterModel: "Growatt MAX 75KTL3-X", inverterKw: "75.00", estimatedGenerationKwhMonth: 8850, performanceRatio: "0.80", requiredAreaM2: "381.0", status: "draft", unifilar: { modules: 113, strings: 8, breakerA: 125, cableMm2: 10 } },
  ]);

  const [plantFazenda] = await db.insert(s.creditPlants).values([
    { workspaceId: ws.id, siteId: sites[7].id, name: "Usina João Camargo", generatingUc: "8801234567", capacityKwp: "110.00", avgGenerationKwhMonth: 13200, modality: "shared" },
  ]).returning();
  await db.insert(s.creditBeneficiaries).values([
    { plantId: plantFazenda.id, name: "Sede — João Camargo", uc: "8801234567", sharePct: "40.00", avgConsumptionKwh: 5280 },
    { plantId: plantFazenda.id, name: "Residência do produtor", uc: "8809988776", sharePct: "20.00", avgConsumptionKwh: 2640 },
    { plantId: plantFazenda.id, name: "Galpão de grãos", uc: "8807766554", sharePct: "25.00", avgConsumptionKwh: 3300 },
    { plantId: plantFazenda.id, name: "Poço de irrigação", uc: "8805544332", sharePct: "15.00", avgConsumptionKwh: 1980 },
  ]);

  // ─── OPERAÇÕES ─────────────────────────────────────────────────────────────
  await db.insert(s.serviceOrders).values([
    { workspaceId: ws.id, number: "OS-2026-0101", kind: "installation", companyId: companies[6].id, siteId: sites[6].id, installationProjectId: instProjects[1].id, technicianId: edu.id, priority: "high", status: "scheduled", description: "Instalação 20 kWp — 30 painéis + inversor Growatt 20k", scheduledAt: daysAhead(5), checklist: [{ item: "Conferir estrutura", done: false }, { item: "Montar painéis", done: false }, { item: "Instalar inversor", done: false }, { item: "Comissionar sistema", done: false }] },
    { workspaceId: ws.id, number: "OS-2026-0098", kind: "installation", companyId: companies[5].id, siteId: sites[5].id, installationProjectId: instProjects[0].id, technicianId: edu.id, priority: "normal", status: "in_progress", description: "Instalação 32 kWp — Patrícia Ramos", scheduledAt: daysAgo(1), startedAt: daysAgo(1), checklist: [{ item: "Conferir estrutura", done: true }, { item: "Montar painéis", done: true }, { item: "Instalar inversor", done: false }, { item: "Comissionar sistema", done: false }] },
    { workspaceId: ws.id, number: "OS-2026-0102", kind: "survey", companyId: companies[0].id, siteId: sites[0].id, technicianId: edu.id, priority: "normal", status: "scheduled", description: "Visita técnica — Roberto Nunes (dimensionamento 75 kWp)", scheduledAt: daysAhead(2), checklist: [{ item: "Medir área de telhado", done: false }, { item: "Fotografar quadro de energia", done: false }, { item: "Avaliar sombreamento", done: false }] },
    { workspaceId: ws.id, number: "OS-2026-0090", kind: "maintenance", companyId: companies[6].id, siteId: sites[6].id, technicianId: edu.id, priority: "low", status: "done", description: "Limpeza preventiva de módulos", scheduledAt: daysAgo(15), startedAt: daysAgo(15), completedAt: daysAgo(15), checklist: [{ item: "Limpeza dos módulos", done: true }, { item: "Verificar conexões", done: true }] },
    { workspaceId: ws.id, number: "OS-2026-0103", kind: "repair", companyId: companies[5].id, siteId: sites[5].id, technicianId: edu.id, priority: "urgent", status: "scheduled", description: "Inversor com alarme de isolamento — verificar strings", scheduledAt: daysAhead(1), checklist: [{ item: "Medir isolamento das strings", done: false }, { item: "Inspecionar conectores MC4", done: false }] },
  ]);

  await db.insert(s.deliveryRoutes).values([
    { workspaceId: ws.id, driverId: edu.id, date: daysAhead(1), vehicle: "Fiorino ABC-1D23", status: "planned", distanceKm: "84.0", stops: [
      { order: 1, company: "Carlos Silva", address: "Rua do Comércio, 45 — Chapecó", items: "30 painéis + inversor 20k", done: false },
      { order: 2, company: "Patrícia Ramos", address: "Av. Beira Mar, 900 — Florianópolis", items: "1 inversor reposição", done: false },
    ] },
    { workspaceId: ws.id, driverId: edu.id, date: daysAgo(2), vehicle: "HR Baú DEF-4G56", status: "done", distanceKm: "132.0", stops: [
      { order: 1, company: "Fernanda Souza", address: "Rod. BR-101 km 210 — Palhoça", items: "Cabo solar 6mm² (600m)", done: true },
    ] },
  ]);

  // ─── PÓS-VENDAS: usinas monitoradas + leituras + chamados ───────────────────
  const monitored = await db.insert(s.plants).values([
    { workspaceId: ws.id, companyId: companies[5].id, siteId: sites[5].id, installationProjectId: instProjects[0].id, name: "Patrícia Ramos", capacityKwp: "32.00", inverterBrand: "Growatt", monitoringProvider: "ShinePhone", monitoringId: "GW-VP-32", status: "online", lastReadingAt: daysAgo(0.02), todayKwh: "128.40", monthKwh: "3410.00", totalKwh: "3410.00", performanceRatio: "0.82", commissionedAt: daysAgo(4) },
    { workspaceId: ws.id, companyId: companies[6].id, siteId: sites[6].id, installationProjectId: instProjects[1].id, name: "Carlos Silva", capacityKwp: "20.00", inverterBrand: "Growatt", monitoringProvider: "ShinePhone", monitoringId: "GW-APS-20", status: "warning", lastReadingAt: daysAgo(0.05), todayKwh: "41.20", monthKwh: "1980.00", totalKwh: "24200.00", performanceRatio: "0.68", commissionedAt: daysAgo(30) },
    { workspaceId: ws.id, companyId: companies[7].id, siteId: sites[7].id, name: "Usina João Camargo", capacityKwp: "110.00", inverterBrand: "Fronius", monitoringProvider: "Solar.web", monitoringId: "FR-FZ-110", status: "offline", lastReadingAt: daysAgo(1.2), todayKwh: "0.00", monthKwh: "9800.00", totalKwh: "142000.00", performanceRatio: "0.79", commissionedAt: daysAgo(210) },
  ]).returning();

  // Leituras diárias dos últimos 30 dias (curva de geração realista)
  const readings: (typeof s.plantReadings.$inferInsert)[] = [];
  for (const p of monitored) {
    const cap = parseFloat(p.capacityKwp);
    const daily = cap * 4.1; // kWh/dia médio
    for (let d = 29; d >= 0; d--) {
      const seasonal = 0.85 + 0.3 * Math.sin((d / 30) * Math.PI);
      const noise = 0.75 + Math.random() * 0.4;
      const expected = daily;
      const gen = p.status === "offline" && d === 0 ? 0 : Math.round(daily * seasonal * noise * (p.status === "warning" ? 0.8 : 1));
      readings.push({
        plantId: p.id, date: daysAgo(d), generationKwh: gen.toFixed(2),
        expectedKwh: expected.toFixed(2), performanceRatio: (gen / expected).toFixed(2),
      });
    }
  }
  await db.insert(s.plantReadings).values(readings);

  await db.insert(s.tickets).values([
    { workspaceId: ws.id, companyId: companies[6].id, plantId: monitored[1].id, contactId: contacts[6].id, subject: "Geração abaixo do esperado", description: "Cliente relata que a geração caiu nos últimos dias. PR em 0,68 — possível sombreamento ou string offline.", channel: "portal", priority: "high", status: "in_progress", assignedTo: edu.id },
    { workspaceId: ws.id, companyId: companies[7].id, plantId: monitored[2].id, contactId: contacts[7].id, subject: "Sistema offline desde ontem", description: "Inversor Fronius sem comunicação. Verificar conexão de internet/data logger no local.", channel: "phone", priority: "urgent", status: "open", assignedTo: edu.id },
    { workspaceId: ws.id, companyId: companies[5].id, plantId: monitored[0].id, contactId: contacts[5].id, subject: "Dúvida sobre fatura de energia", description: "Cliente quer entender os créditos compensados na conta da CELESC deste mês.", channel: "whatsapp", priority: "low", status: "resolved", assignedTo: diego.id, resolvedAt: daysAgo(1) },
  ]);

  // ─── Pré-vendas (esteira do SDR) ───────────────────────────────────────────
  // Cobre todas as etapas, com um SLA estourado em cada uma das duas
  // primeiras para a tela nascer com alertas visíveis.
  const presalesData = [
    {
      name: "Juliana Prado", phone: "48991110001", email: "juliana.prado@email.com",
      channel: "meta_ads" as const, classification: "quente" as const, status: "sem_contato" as const,
      city: "Florianópolis", state: "SC",
      productLine: "Produto B", productVariant: "Variante A", productQty: 1,
      ownerId: marina.id, stageEnteredAt: daysAgo(3), attemptCount: 0,
      notes: "Preencheu formulário do anúncio. Pediu contato pela manhã.",
    },
    {
      name: "Sérgio Almeida", phone: "48991110002",
      channel: "google_ads" as const, status: "sem_contato" as const,
      city: "São José", state: "SC",
      ownerId: rafael.id, stageEnteredAt: daysAgo(0), attemptCount: 0,
    },
    {
      name: "Padaria Pão Quente", phone: "48991110003", email: "contato@paoquente.com.br",
      channel: "indicacao" as const, classification: "morno" as const, status: "em_contato" as const,
      city: "Palhoça", state: "SC",
      productLine: "Produto A", productVariant: "Variante A", productQty: 1,
      ownerId: marina.id, stageEnteredAt: daysAgo(6), lastContactAt: daysAgo(5), attemptCount: 2,
      notes: "Indicação do cliente Silva & Cia. Dono pediu para retornar depois do almoço.",
    },
    {
      name: "Marcelo Tavares", phone: "48991110004",
      channel: "social_organic" as const, socialNetwork: "Instagram",
      status: "em_contato" as const,
      city: "Itajaí", state: "SC",
      ownerId: rafael.id, stageEnteredAt: daysAgo(1), lastContactAt: daysAgo(1), attemptCount: 1,
    },
    {
      name: "Mercado Bom Preço", phone: "48991110005", email: "financeiro@bompreco.com.br",
      channel: "prospeccao" as const, classification: "quente" as const, status: "qualificacao" as const,
      city: "Chapecó", state: "SC",
      productLine: "Produto A", productVariant: "Variante B", productQty: 3,
      prescriptionDate: daysAhead(25),
      ownerId: marina.id, stageEnteredAt: daysAgo(2), lastContactAt: daysAgo(2), attemptCount: 3,
      notes: "Recompra prevista em 25 dias. Sócio quer proposta parcelada.",
    },
    {
      name: "Clínica Vida Plena", phone: "48991110006",
      channel: "whatsapp" as const, status: "qualificacao" as const,
      city: "Blumenau", state: "SC",
      productLine: "Produto A", productVariant: "Variante A", productQty: 2,
      ownerId: rafael.id, stageEnteredAt: daysAgo(8), lastContactAt: daysAgo(7), attemptCount: 2,
      notes: "Falta a documentação do responsável legal — cobrar novamente.",
    },
    {
      name: "Auto Peças Zanin", phone: "48991110007", email: "zanin@autopecas.com.br",
      channel: "meta_ads" as const, classification: "quente" as const,
      status: "aguardando_vendedor" as const,
      city: "Criciúma", state: "SC",
      productLine: "Produto A", productVariant: "Variante A", productQty: 15,
      prescriptionDate: daysAhead(12),
      billReceivedAt: daysAgo(4),
      ownerId: marina.id, closerId: carla.id, handedOffAt: daysAgo(1),
      stageEnteredAt: daysAgo(1), lastContactAt: daysAgo(3), attemptCount: 4,
      notes: "Qualificado: decisor identificado, renovação da carteira de 15 CNPJs do grupo.",
    },
    {
      name: "Douglas Ferraz", phone: "48991110008",
      channel: "indicacao" as const, status: "incompativel" as const,
      city: "Lages", state: "SC",
      ownerId: rafael.id, stageEnteredAt: daysAgo(9), lastContactAt: daysAgo(9), attemptCount: 2,
      lostReason: "Já comprou com outro fornecedor no mês passado — sem janela nos próximos 12 meses.",
    },
  ];
  const presalesLeads = await db.insert(s.presalesLeads)
    .values(presalesData.map((p) => ({ workspaceId: ws.id, ...p })))
    .returning();

  // Passagem de bastão já registrada para o lead entregue à Carla.
  const zanin = presalesLeads.find((l) => l.name === "Auto Peças Zanin");
  if (zanin) {
    await db.insert(s.presalesHandoffs).values({
      workspaceId: ws.id, leadId: zanin.id, sdrId: marina.id, closerId: carla.id,
      commissionAmount: "50.00", estimatedQty: 15, estimatedValue: "3342.45",
      status: "pending", createdAt: daysAgo(1),
    });
  }

  // Timeline dos leads: registra a entrada e as transições já ocorridas.
  type PresalesAct = {
    workspaceId: string;
    actorId: string | null;
    actorType: "user";
    relatedToType: string;
    relatedToId: string;
    type: string;
    payload: Record<string, string>;
    createdAt: Date;
  };
  // Reconstrói o caminho completo que cada lead percorreu (sem_contato →
  // em_contato → …), para as taxas de conversão por etapa fazerem sentido.
  const funnelPath = ["sem_contato", "em_contato", "qualificacao", "aguardando_vendedor"];
  const presalesActs = presalesLeads.flatMap((lead) => {
    const acts: PresalesAct[] = [{
      workspaceId: ws.id, actorId: lead.ownerId, actorType: "user" as const,
      relatedToType: "presales_lead", relatedToId: lead.id,
      type: "note", payload: { text: "Lead de pré-venda criado." },
      createdAt: lead.createdAt,
    }];

    // Etapas intermediárias por onde o lead passou antes da atual.
    const targetIdx = lead.status === "incompativel"
      ? funnelPath.indexOf("em_contato")
      : funnelPath.indexOf(lead.status);
    const hops = targetIdx > 0 ? funnelPath.slice(0, targetIdx + 1) : [];

    for (let i = 1; i < hops.length; i++) {
      acts.push({
        workspaceId: ws.id, actorId: lead.ownerId, actorType: "user" as const,
        relatedToType: "presales_lead", relatedToId: lead.id,
        type: "presales_status_changed",
        payload: { from: hops[i - 1], to: hops[i], text: `Etapa alterada para “${stageLabel(hops[i])}”.` },
        // Espalha as transições entre a criação e a entrada na etapa atual.
        createdAt: new Date(lead.createdAt.getTime() + i * 3600_000),
      });
    }

    if (lead.status === "incompativel") {
      acts.push({
        workspaceId: ws.id, actorId: lead.ownerId, actorType: "user" as const,
        relatedToType: "presales_lead", relatedToId: lead.id,
        type: "presales_status_changed",
        payload: { from: "em_contato", to: "incompativel", text: `Lead incompatível: ${lead.lostReason ?? ""}` },
        createdAt: lead.stageEnteredAt,
      });
    }
    if (lead.status === "aguardando_vendedor") {
      acts.push({
        workspaceId: ws.id, actorId: lead.ownerId, actorType: "user" as const,
        relatedToType: "presales_lead", relatedToId: lead.id,
        type: "presales_handoff",
        payload: { text: "Passagem de bastão registrada — lead entregue para fechamento. Comissão do SDR: R$ 50." },
        createdAt: lead.handedOffAt ?? lead.stageEnteredAt,
      });
    }
    return acts;
  });
  await db.insert(s.activities).values(presalesActs);

  console.log("Seed concluído ✔");
  console.log(`Workspace: ${ws.name} | usuários: ${users.length} | oportunidades: ${opps.length} | leads de pré-venda: ${presalesLeads.length}`);
  await client.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
