import { CalendarDays } from "lucide-react";
import { NotificationsBell, type NotificationItem } from "./NotificationsBell";
import { ThemeToggle } from "@/components/ThemeToggle";

export function Header({
  greeting, firstName, subtitle, notifications, dateLabel, weekdayLabel,
}: {
  greeting: string;
  firstName: string;
  subtitle: string;
  notifications: NotificationItem[];
  dateLabel: string;
  weekdayLabel: string;
}) {
  return (
    <div className="flex items-start justify-between gap-6 flex-wrap">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">{greeting}, {firstName}! 👋</h1>
        <p className="text-sm text-zinc-500 mt-1">{subtitle}</p>
      </div>

      <div className="flex items-center gap-3">
        <ThemeToggle />
        <NotificationsBell items={notifications} />

        <div className="h-10 flex items-center gap-2 rounded-xl bg-white border border-slate-200/60 shadow-sm px-3.5 text-zinc-600">
          <CalendarDays className="h-4 w-4 text-brand-600" strokeWidth={2} />
          <div className="text-[12.5px] leading-tight">
            <div className="font-semibold text-zinc-800">{dateLabel}</div>
            <div className="text-[10.5px] text-zinc-400">{weekdayLabel}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
