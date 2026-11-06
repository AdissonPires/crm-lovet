import { Users, Percent, Banknote } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { brl } from "@/lib/format";

export function FooterBar({
  collaborators, conversionRate, avgTicket,
}: {
  collaborators: number;
  conversionRate: number | null;
  avgTicket: number | null;
}) {
  return (
    <div className="rounded-2xl bg-white border border-slate-200/60 shadow-sm px-6 py-4 flex flex-wrap items-center justify-between gap-4">
      {/* Wordmark no lugar de ícone + texto: o nome já está na logo. */}
      <BrandLogo marca placa={false} alturaPx={22} />

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[12.5px] text-zinc-500">
        <span className="flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5 text-brand-600" strokeWidth={2} />
          <span className="font-semibold text-zinc-700">{collaborators}</span> colaboradores
        </span>
        {conversionRate !== null && (
          <span className="flex items-center gap-1.5">
            <Percent className="h-3.5 w-3.5 text-brand-600" strokeWidth={2} />
            Conversão do mês: <span className="font-semibold text-zinc-700">{conversionRate.toFixed(0)}%</span>
          </span>
        )}
        {avgTicket !== null && (
          <span className="flex items-center gap-1.5">
            <Banknote className="h-3.5 w-3.5 text-brand-600" strokeWidth={2} />
            Ticket médio: <span className="font-semibold text-zinc-700">{brl(avgTicket)}</span>
          </span>
        )}
      </div>
    </div>
  );
}
