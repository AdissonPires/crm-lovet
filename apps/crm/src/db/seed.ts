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
    "tickets", "payroll_entries", "invoices", "stock_movements", "inventory_items",
    "contracts", "commissions",
    "presales_handoffs", "presales_leads",
    "whatsapp_messages", "whatsapp_conversations", "whatsapp_templates",
    "proposals",
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
    { email: "edu@lovet.local", name: "Eduardo Lima", role: "rep" as const },
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

  // Clientes B2C (pessoa física) + contatos + endereços
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

  // Tasks
  await db.insert(s.tasks).values([
    { workspaceId: ws.id, relatedToType: "opportunity", relatedToId: opps[0].id, assigneeId: edu.id, createdBy: carla.id, type: "visit", title: "Visita técnica — Roberto Nunes", dueAt: daysAhead(2) },
    { workspaceId: ws.id, relatedToType: "opportunity", relatedToId: opps[1].id, assigneeId: carla.id, createdBy: bruno.id, type: "meeting", title: "Reunião de negociação com Fernanda (Frigorífico)", dueAt: daysAhead(1) },
    { workspaceId: ws.id, relatedToType: "opportunity", relatedToId: opps[2].id, assigneeId: diego.id, createdBy: diego.id, type: "call", title: "Follow-up da proposta — Marcos Teixeira", dueAt: daysAgo(1) },
    { workspaceId: ws.id, relatedToType: "opportunity", relatedToId: opps[4].id, assigneeId: carla.id, createdByAgent: true, type: "call", title: "[IA] Proposta parada há 11 dias — retomar contato com Seu Antônio", dueAt: daysAhead(0) },
    { workspaceId: ws.id, relatedToType: "opportunity", relatedToId: opps[3].id, assigneeId: diego.id, createdBy: diego.id, type: "call", title: "Ligação de qualificação — Juliana Prado", dueAt: daysAhead(1) },
  ]);

  // WhatsApp: templates + conversas com histórico
  await db.insert(s.whatsappTemplates).values([
    { workspaceId: ws.id, title: "Saudação inicial", category: "saudacao", body: "Olá! Aqui é da Lovet Distribuidora Vi seu interesse em reduzir a conta de luz. Posso te fazer algumas perguntas rápidas para simular sua economia?" },
    { workspaceId: ws.id, title: "Envio de proposta", category: "proposta", body: "Prontinho! Sua proposta personalizada está anexada. Qualquer dúvida sobre o dimensionamento ou financiamento, me chama por aqui." },
    { workspaceId: ws.id, title: "Follow-up proposta parada", category: "proposta", body: "Oi! Passando para saber se conseguiu dar uma olhada na proposta que enviei. Fico à disposição para ajustar valores ou condições de pagamento." },
    { workspaceId: ws.id, title: "Atualização de entrega", category: "entrega", body: "Boas notícias! Seu pedido foi aprovado e já está em separação. Vamos agendar a entrega — qual a melhor data para você?" },
    { workspaceId: ws.id, title: "Cobrança amigável", category: "cobranca", body: "Oi! Notei que a parcela ainda está em aberto. Consegue verificar? Qualquer imprevisto, me avisa que resolvemos juntos." },
  ]);

  const waConvData = [
    {
      contact: 0, opp: 0, owner: carla, status: "open" as const, lastAgo: 0.05, unread: 2,
      messages: [
        { dir: "in" as const, text: "Oi, vi o anúncio de vocês no Instagram. Quanto custa fornecimento mensal pra um mercado do meu tamanho?", ago: 3 },
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
        { dir: "out" as const, text: "Sem pressa! Fico à disposição se tiverem dúvidas sobre as condições de pagamento ou a entrega.", by: carla, ago: 9.5 },
        { dir: "in" as const, text: "Ela gostou também! Só uma dúvida: em quanto tempo a entrega fica pronta depois que assinamos?", ago: 0.5 },
      ],
    },
    {
      contact: 5, opp: 5, owner: diego, status: "closed" as const, lastAgo: 2, unread: 0,
      messages: [
        { dir: "out" as const, text: "Dra. Patrícia, boas notícias! Seu pedido foi aprovado e já está em separação 🎉", by: diego, ago: 4 },
        { dir: "in" as const, text: "Que ótimo! Quando fica a entrega?", ago: 3.8 },
        { dir: "out" as const, text: "Já está agendada, nosso técnico Eduardo vai até a clínica. Ele vai confirmar o horário exato.", by: diego, ago: 3.7 },
        { dir: "in" as const, text: "Perfeito, muito obrigada pela atenção durante todo o processo!", ago: 2 },
      ],
    },
    {
      contact: 2, opp: 2, owner: diego, status: "open" as const, lastAgo: 1, unread: 0,
      messages: [
        { dir: "in" as const, text: "Diego, recebi a proposta do hotel. O produto da proposta pode ser trocado por outra marca?", ago: 5 },
        { dir: "out" as const, text: "Consigo sim, o Fronius tem uma garantia menor (7 anos vs 10) mas é mais robusto. Quer que eu refaça a proposta com ele?", by: diego, ago: 4.8 },
        { dir: "in" as const, text: "Pode refazer, quero comparar os dois", ago: 1 },
      ],
    },
    {
      contact: 3, opp: null, owner: diego, status: "open" as const, lastAgo: 0.9, unread: 0,
      messages: [
        { dir: "out" as const, text: "Oi Juliana! Aqui é da Lovet Distribuidora. Vi que preencheu nosso formulário do site sobre fornecimento para a transportadora.", by: diego, ago: 1 },
        { dir: "in" as const, text: "Oi! Sim, temos um pátio grande e queria entender as condições para fornecimento ao nosso galpão", ago: 0.9 },
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
    { workspaceId: ws.id, sku: "PRD-A", name: "Produto A — caixa", quantity: 148, minStock: 60, location: "Galpão A · Prateleira 1", unitCost: "620.00" },
    { workspaceId: ws.id, sku: "PRD-B", name: "Produto B — caixa", quantity: 42, minStock: 60, location: "Galpão A · Prateleira 2", unitCost: "540.00" },
    { workspaceId: ws.id, sku: "PRD-C", name: "Produto C — unidade", quantity: 11, minStock: 6, location: "Galpão B · Rack 3", unitCost: "3200.00" },
    { workspaceId: ws.id, sku: "PRD-D", name: "Produto D — unidade", quantity: 3, minStock: 4, location: "Galpão B · Rack 3", unitCost: "8900.00" },
    { workspaceId: ws.id, sku: "EMB-01", name: "Kit embalagem", quantity: 380, minStock: 200, location: "Galpão A · Piso", unitCost: "45.00" },
    { workspaceId: ws.id, sku: "EMB-02", name: "Fita adesiva (rolo)", quantity: 1200, minStock: 800, location: "Galpão B · Bobinas", unitCost: "4.20" },
  ]).returning();
  await db.insert(s.stockMovements).values([
    { workspaceId: ws.id, itemId: invItems[0].id, kind: "in", quantity: 240, reason: "Compra de fornecedor NF 45231", createdBy: bruno.id, createdAt: daysAgo(12) },
    { workspaceId: ws.id, itemId: invItems[0].id, kind: "out", quantity: 92, reason: "Pedido Carlos Silva", relatedOpportunityId: opps[6].id, createdBy: edu.id, createdAt: daysAgo(2) },
    { workspaceId: ws.id, itemId: invItems[2].id, kind: "out", quantity: 1, reason: "Pedido Patrícia Ramos", relatedOpportunityId: opps[5].id, createdBy: edu.id, createdAt: daysAgo(4) },
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

  await db.insert(s.tickets).values([
    { workspaceId: ws.id, companyId: companies[6].id, contactId: contacts[6].id, subject: "Atraso na entrega do pedido", description: "Cliente relata que o pedido não chegou no prazo combinado. Verificar com a transportadora.", channel: "portal", priority: "high", status: "in_progress", assignedTo: edu.id },
    { workspaceId: ws.id, companyId: companies[7].id, contactId: contacts[7].id, subject: "Produto chegou com avaria", description: "Cliente recebeu o pedido com embalagem danificada. Solicitar fotos e abrir troca.", channel: "phone", priority: "urgent", status: "open", assignedTo: edu.id },
    { workspaceId: ws.id, companyId: companies[5].id, contactId: contacts[5].id, subject: "Dúvida sobre nota fiscal", description: "Cliente quer entender os valores e impostos descritos na nota fiscal do último pedido.", channel: "whatsapp", priority: "low", status: "resolved", assignedTo: diego.id, resolvedAt: daysAgo(1) },
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
