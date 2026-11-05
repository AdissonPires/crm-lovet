import Link from "next/link";
import { Zap } from "lucide-react";

export type QuickAction = {
  label: string;
  href: string;
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
};

export function QuickActionsCard({ actions }: { actions: QuickAction[] }) {
  return (
    <div className="rounded-2xl bg-white border border-slate-200/60 shadow-sm p-5 flex flex-col">
      <div className="flex items-center gap-2 mb-4">
        <Zap className="h-4 w-4 text-brand-600" strokeWidth={2} />
        <h2 className="text-sm font-semibold text-zinc-800">Ações Rápidas</h2>
      </div>

      <div className="grid grid-cols-2 gap-3 flex-1">
        {actions.map((action) => (
          <Link
            key={action.label}
            href={action.href}
            className="flex flex-col items-center justify-center gap-2 rounded-xl border border-slate-200/70 bg-slate-50/60 py-4 px-2 text-center hover:bg-brand-50 hover:border-brand-200 transition-colors group"
          >
            <div className="h-9 w-9 rounded-lg bg-white border border-slate-200/70 flex items-center justify-center text-brand-700 group-hover:bg-brand-600 group-hover:text-white group-hover:border-brand-600 transition-colors">
              <action.Icon className="h-4 w-4" strokeWidth={2} />
            </div>
            <span className="text-[11.5px] font-semibold text-zinc-700">{action.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
