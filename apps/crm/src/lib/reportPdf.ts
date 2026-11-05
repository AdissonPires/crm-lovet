import PDFDocument from "pdfkit";
import type { ActivityReportData, RelatorioEquipe } from "@/lib/activityReport";

const fmtDate = (d: Date) => d.toLocaleDateString("pt-BR");

export function buildActivityReportPdf(data: ActivityReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(18).text("Relatório de atividades", { align: "left" });
    doc.fontSize(11).fillColor("#555").text(`${data.userName} · ${fmtDate(data.from)} a ${fmtDate(data.to)}`);
    doc.moveDown(1.2);

    const section = (title: string) => {
      doc.moveDown(0.6).fontSize(13).fillColor("#000").text(title);
      doc.moveTo(doc.x, doc.y + 2).lineTo(545, doc.y + 2).strokeColor("#ddd").stroke();
      doc.moveDown(0.4).fontSize(10).fillColor("#333");
    };

    section("Vendas (oportunidades ganhas)");
    doc.text(`${data.vendas.quantidade} venda(s) · ${data.vendas.faturamento.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`);

    const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    section("Valores em aberto e perdidos");
    doc.text(`Em aberto: ${brl(data.valores.aberto)}`);
    doc.text(`Perdido: ${brl(data.valores.perdido)}`);

    section(`Tarefas concluídas (${data.tasksCompleted.length})`);
    if (data.tasksCompleted.length === 0) doc.text("Nenhuma no período.");
    for (const t of data.tasksCompleted) doc.text(`• ${t.title} — concluída em ${fmtDate(t.completedAt)}`);

    section(`Tarefas pendentes (${data.tasksPending.length})`);
    if (data.tasksPending.length === 0) doc.text("Nenhuma pendente.");
    for (const t of data.tasksPending) doc.text(`• ${t.title}${t.dueAt ? ` — prazo ${fmtDate(t.dueAt)}` : ""}`);

    section(`Ligações registradas (${data.callsLogged.length})`);
    if (data.callsLogged.length === 0) doc.text("Nenhuma no período.");
    for (const c of data.callsLogged) doc.text(`• ${fmtDate(c.createdAt)} — ${c.text}`);

    if (data.notes.trim()) {
      section("Observações");
      doc.text(data.notes.trim());
    }

    doc.end();
  });
}

const brlPdf = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** PDF do relatório de atividades de uma equipe (cadastro de Equipes; números e produção do CRM). */
export function buildTeamActivityReportPdf(data: RelatorioEquipe): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(18).text("Relatório de atividades da equipe");
    doc.fontSize(11).fillColor("#555").text(`${data.equipe.nome}${data.equipe.lider ? ` · líder ${data.equipe.lider.nome}` : ""} · ${fmtDate(data.from)} a ${fmtDate(data.to)}`);

    const section = (title: string) => {
      doc.moveDown(0.8).fontSize(13).fillColor("#000").text(title);
      doc.moveTo(doc.x, doc.y + 2).lineTo(545, doc.y + 2).strokeColor("#ddd").stroke();
      doc.moveDown(0.4).fontSize(10).fillColor("#333");
    };

    section("Totais da equipe");
    const t = data.totais;
    doc.text(
      `Tarefas concluídas: ${t.tarefasConcluidas}  ·  pendentes: ${t.tarefasPendentes}  ·  Ligações: ${t.ligacoes}`,
    );
    doc.text(`Vendas: ${t.vendas}  ·  Faturamento: ${brlPdf(t.faturamento)}`);
    doc.text(`Em aberto: ${brlPdf(t.emAberto)}  ·  Perdido: ${brlPdf(t.perdido)}`);

    section(`Por integrante (${data.membros.length})`);
    for (const m of data.membros) {
      doc.fontSize(10).fillColor("#000").text(m.nome + (m.userId ? "" : "  (sem usuário no CRM)"));
      doc.fontSize(9).fillColor("#555").text(
        `   tarefas ${m.tarefasConcluidas} concluídas / ${m.tarefasPendentes} pendentes · ligações ${m.ligacoes} · vendas ${m.vendas} (${brlPdf(m.faturamento)}) · em aberto ${brlPdf(m.emAberto)} · perdido ${brlPdf(m.perdido)}`,
      );
    }

    section("Tarefas concluídas por semana");
    doc.fontSize(10).fillColor("#333");
    if (data.producao.length === 0) doc.text("Sem semanas no período.");
    for (const p of data.producao) doc.text(`Semana de ${p.label}: ${p.concluidas} concluídas${p.meta !== null ? ` · meta ${p.meta}` : ""}`);

    doc.end();
  });
}
