import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { Truck, MapPin, CheckCircle2, Circle } from "lucide-react";
import { db, schema as s } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/policy";
import { dateBR, relTime } from "@/lib/format";
import { PageHeader, Kpi, Badge, EmptyState, card } from "@/components/ui";

const statusTone: Record<string, "green" | "amber" | "blue"> = { done: "green", in_progress: "blue", planned: "amber" };
const statusLabel: Record<string, string> = { done: "Concluída", in_progress: "Em rota", planned: "Planejada" };
type Stop = { order: number; company: string; address: string; items: string; done: boolean };

export default async function RotasPage() {
  const user = await requireUser();
  if (!can(user.role, "view_ops") && !can(user.role, "view_installs")) redirect("/");

  const rows = await db.select({ r: s.deliveryRoutes, driverName: s.users.name })
    .from(s.deliveryRoutes)
    .leftJoin(s.users, eq(s.users.id, s.deliveryRoutes.driverId))
    .where(eq(s.deliveryRoutes.workspaceId, user.workspaceId))
    .orderBy(desc(s.deliveryRoutes.date));

  const totalStops = rows.reduce((a, x) => a + ((x.r.stops ?? []) as Stop[]).length, 0);
  const totalKm = rows.reduce((a, x) => a + parseFloat(x.r.distanceKm ?? "0"), 0);

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-[1200px]">
      <PageHeader module="Operações · Logística" title="Rotas de Entrega"
        subtitle="Planejamento de entregas de equipamentos por veículo, com paradas sequenciadas." />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <Kpi label="Rotas" value={String(rows.length)} Icon={Truck} tint="bg-sky-50 text-sky-600" />
        <Kpi label="Paradas" value={String(totalStops)} Icon={MapPin} />
        <Kpi label="Distância total" value={`${totalKm.toLocaleString("pt-BR")} km`} />
      </div>

      <div className="space-y-4">
        {rows.map(({ r, driverName }) => {
          const stops = (r.stops ?? []) as Stop[];
          return (
            <div key={r.id} className={card}>
              <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-zinc-100 text-zinc-600 flex items-center justify-center"><Truck className="h-4.5 w-4.5" /></div>
                  <div>
                    <div className="font-semibold text-zinc-800">{r.vehicle ?? "Veículo"} · {driverName?.split(" ")[0]}</div>
                    <div className="text-xs text-zinc-400">{dateBR(r.date)} ({relTime(r.date)}) · {r.distanceKm ?? "—"} km · {stops.length} paradas</div>
                  </div>
                </div>
                <Badge tone={statusTone[r.status]}>{statusLabel[r.status]}</Badge>
              </div>
              <div className="p-5">
                <div className="relative pl-6">
                  <div className="absolute left-[9px] top-2 bottom-2 w-px bg-zinc-200" />
                  {stops.map((stop) => (
                    <div key={stop.order} className="relative pb-4 last:pb-0">
                      <div className="absolute -left-6 top-0.5">
                        {stop.done ? <CheckCircle2 className="h-[18px] w-[18px] text-emerald-500" /> : <Circle className="h-[18px] w-[18px] text-zinc-300" />}
                      </div>
                      <div className="text-[13px] font-semibold text-zinc-800">{stop.order}. {stop.company}</div>
                      <div className="text-xs text-zinc-500">{stop.address}</div>
                      <div className="text-xs text-brand-600 mt-0.5">{stop.items}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
        {rows.length === 0 && <div className={card}><EmptyState title="Nenhuma rota planejada." /></div>}
      </div>
    </div>
  );
}
