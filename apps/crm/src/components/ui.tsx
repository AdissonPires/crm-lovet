import Link from "next/link";

export const card =
  "rounded-2xl bg-white border border-zinc-100 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-14px_rgba(0,0,0,0.12)]";

export function PageHeader({
  title, subtitle, module, action,
}: {
  title: string;
  subtitle?: string;
  module?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        {module && (
          <div className="text-[11px] font-bold uppercase tracking-wider text-brand-500">{module}</div>
        )}
        <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-zinc-500 mt-0.5 max-w-2xl">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Kpi({
  label, value, sub, nota, tint = "bg-zinc-50 text-zinc-600", Icon, rodape,
}: {
  label: string;
  value: string;
  sub?: string;
  /** Segunda linha, mais discreta — composição do número (ex.: divisão por origem). */
  nota?: string;
  tint?: string;
  Icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  /** Ação no pé do card (ex.: botão "Detalhar"). */
  rodape?: React.ReactNode;
}) {
  return (
    <div className={`${card} p-5`}>
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-zinc-400 uppercase tracking-wide">{label}</div>
        {Icon && (
          <div className={`h-8 w-8 rounded-lg ${tint} flex items-center justify-center`}>
            <Icon className="h-4 w-4" strokeWidth={2.2} />
          </div>
        )}
      </div>
      <div className="text-[26px] font-bold text-zinc-900 mt-2 tracking-tight tabular-nums">{value}</div>
      {sub && <div className="text-xs text-zinc-500 mt-0.5">{sub}</div>}
      {nota && <div className="text-[11px] text-zinc-400 mt-1">{nota}</div>}
      {rodape}
    </div>
  );
}

const badgeTints: Record<string, string> = {
  green: "bg-emerald-50 text-emerald-700 border-emerald-100",
  red: "bg-red-50 text-red-700 border-red-100",
  amber: "bg-brand-50 text-brand-700 border-brand-100",
  blue: "bg-sky-50 text-sky-700 border-sky-100",
  violet: "bg-violet-50 text-violet-700 border-violet-100",
  zinc: "bg-zinc-100 text-zinc-600 border-zinc-200",
};

export function Badge({ children, tone = "zinc" }: { children: React.ReactNode; tone?: keyof typeof badgeTints }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${badgeTints[tone]}`}>
      {children}
    </span>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="px-5 py-12 text-center">
      <div className="text-sm font-medium text-zinc-500">{title}</div>
      {hint && <div className="text-xs text-zinc-400 mt-1">{hint}</div>}
    </div>
  );
}

export function SectionCard({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className={card}>
      <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between gap-2">
        <span className="font-semibold text-sm text-zinc-800">{title}</span>
        {right}
      </div>
      {children}
    </div>
  );
}

export function LinkCard({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="block hover:bg-zinc-50/80 transition-colors">
      {children}
    </Link>
  );
}
