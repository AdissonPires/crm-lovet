import { redirect } from "next/navigation";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { ClipboardList, Wrench, Search, Hammer, ShieldCheck, Plus } from "lucide-react";
import { db, schema as s } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/policy";
import { dateBR, relTime } from "@/lib/format";
import { PageHeader, Kpi, Badge, EmptyState, card } from "@/components/ui";
import { advanceServiceOrder } from "@/app/actions-ops";

const kindMeta: Record<string, { label: string; Icon: React.ComponentType<{ className?: string }> }> = {
  installation: { label: "Instalação", Icon: Hammer },
  maintenance: { label: "Manutenção", Icon: Wrench },
  inspection: { label: "Inspeção", Icon: ShieldCheck },
  repair: { label: "Reparo", Icon: Wrench },
  survey: { label: "Visita técnica", Icon: Search },
};
const statusTone: Record<string, "green" | "amber" | "blue" | "zinc"> = { done: "green", in_progress: "blue", scheduled: "amber", canceled: "zinc" };
const statusLabel: Record<string, string> = { done: "Concluída", in_progress: "Em andamento", scheduled: "Agendada", canceled: "Cancelada" };
const prioTone: Record<string, "red" | "amber" | "blue" | "zinc"> = { urgent: "red", high: "amber", normal: "blue", low: "zinc" };
const prioLabel: Record<string, string> = { urgent: "Urgente", high: "Alta", normal: "Normal", low: "Baixa" };

export default async function OperacoesPage() {
  const user = await requireUser();
  if (!can(user.role, "view_ops") && !can(user.role, "view_installs")) redirect("/");

  const rows = await db.select({ o: s.serviceOrders, companyName: s.companies.name, city: s.sites.city, techName: s.users.name })
    .from(s.serviceOrders)
    .leftJoin(s.companies, eq(s.companies.id, s.serviceOrders.companyId))
    .leftJoin(s.sites, eq(s.sites.id, s.serviceOrders.siteId))
    .leftJoin(s.users, eq(s.users.id, s.serviceOrders.technicianId))
    .where(eq(s.serviceOrders.workspaceId, user.workspaceId))
    .orderBy(asc(s.serviceOrders.scheduledAt));

  const open = rows.filter((r) => r.o.status === "scheduled" || r.o.status === "in_progress");
  const urgent = rows.filter((r) => r.o.priority === "urgent" && r.o.status !== "done");
  const done = rows.filter((r) => r.o.status === "done");

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-[1400px]">
      <PageHeader module="Operações" title="Ordens de Serviço"
        subtitle="Agenda de instalações, manutenções e visitas. Avance o status conforme a execução em campo."
        action={
          <Link href="/operacoes/nova" className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 text-white text-[13px] font-semibold px-4 py-2.5 hover:bg-zinc-700 shadow-sm transition-colors shrink-0">
            <Plus className="h-4 w-4" /> Nova OS
          </Link>
        } />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <Kpi label="OS em aberto" value={String(open.length)} Icon={ClipboardList} tint="bg-sky-50 text-sky-600" />
        <Kpi label="Urgentes" value={String(urgent.length)} tint="bg-red-50 text-red-600" />
        <Kpi label="Concluídas" value={String(done.length)} tint="bg-emerald-50 text-emerald-600" />
      </div>

      <div className="space-y-3">
        {rows.map(({ o, companyName, city, techName }) => {
          const meta = kindMeta[o.kind];
          const checklist = (o.checklist ?? []) as { item: string; done: boolean }[];
          const doneCount = checklist.filter((c) => c.done).length;
          return (
            <div key={o.id} className={`${card} p-5 flex flex-col md:flex-row md:items-center gap-4`}>
              <div className="h-10 w-10 rounded-xl bg-zinc-100 text-zinc-600 flex items-center justify-center shrink-0">
                <meta.Icon className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs text-zinc-400">{o.number}</span>
                  <Badge tone="zinc">{meta.label}</Badge>
                  <Badge tone={prioTone[o.priority]}>{prioLabel[o.priority]}</Badge>
                  <Badge tone={statusTone[o.status]}>{statusLabel[o.status]}</Badge>
                </div>
                <div className="text-[14px] font-semibold text-zinc-800 mt-1">{companyName ?? "—"} {city ? <span className="text-zinc-400 font-normal">· {city}</span> : null}</div>
                <div className="text-[13px] text-zinc-500 mt-0.5">{o.description}</div>
                <div className="text-xs text-zinc-400 mt-1.5">
                  Téc: {techName?.split(" ")[0] ?? "—"} · {o.scheduledAt ? `agendada ${dateBR(o.scheduledAt)} (${relTime(o.scheduledAt)})` : "sem data"}
                  {checklist.length > 0 && ` · checklist ${doneCount}/${checklist.length}`}
                </div>
              </div>
              {o.status !== "done" && o.status !== "canceled" && (
                <form action={advanceServiceOrder.bind(null, o.id)} className="shrink-0">
                  <button className="rounded-lg bg-zinc-900 text-white text-xs font-semibold px-4 py-2 hover:bg-zinc-700 transition-colors whitespace-nowrap">
                    {o.status === "scheduled" ? "Iniciar" : "Concluir"}
                  </button>
                </form>
              )}
            </div>
          );
        })}
        {rows.length === 0 && <div className={card}><EmptyState title="Nenhuma ordem de serviço." /></div>}
      </div>
    </div>
  );
}
