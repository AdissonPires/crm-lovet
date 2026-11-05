"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, MessageCircle, MessageSquareHeart, BellOff, HeadphonesIcon } from "lucide-react";

export type NotificationItem = {
  id: string;
  kind: "whatsapp" | "feedback" | "handoff";
  title: string;
  preview: string;
  time: string;
  href: string;
  /** Pedido de atendente humano: destacado, porque exige ação agora. */
  urgent?: boolean;
};

const kindIcon: Record<NotificationItem["kind"], { Icon: typeof MessageCircle; className: string }> = {
  whatsapp: { Icon: MessageCircle, className: "bg-emerald-50 text-emerald-600" },
  feedback: { Icon: MessageSquareHeart, className: "bg-brand-50 text-brand-600" },
  handoff: { Icon: HeadphonesIcon, className: "bg-amber-100 text-amber-700" },
};

export function NotificationsBell({ items }: { items: NotificationItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, []);

  const count = items.length;

  return (
    <div className="relative" ref={ref}>
      <button
        aria-label="Notificações"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="relative h-10 w-10 rounded-xl bg-white border border-slate-200/60 shadow-sm flex items-center justify-center text-zinc-500 hover:text-brand-700 hover:border-brand-200 transition-colors"
      >
        <Bell className="h-4 w-4" strokeWidth={2} />
        {count > 0 && (
          <span className="absolute -top-1.5 -right-1.5 h-5 min-w-[20px] px-1 rounded-full bg-brand-600 text-white text-[10px] font-bold flex items-center justify-center border-2 border-slate-50">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[340px] rounded-2xl bg-white border border-slate-200/60 shadow-lg z-20 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 text-sm font-semibold text-zinc-800">
            Notificações {count > 0 && <span className="text-zinc-400 font-normal">({count})</span>}
          </div>
          <div className="max-h-[360px] overflow-y-auto divide-y divide-slate-50">
            {items.map((item) => {
              const { Icon, className } = kindIcon[item.kind];
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`flex items-start gap-3 px-4 py-3 transition-colors ${
                    item.urgent ? "bg-amber-50/70 hover:bg-amber-100/70" : "hover:bg-slate-50"
                  }`}
                >
                  <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${className}`}>
                    <Icon className="h-4 w-4" strokeWidth={2} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] font-semibold text-zinc-800 truncate">{item.title}</div>
                    <div className="text-[11.5px] text-zinc-500 truncate mt-0.5">{item.preview}</div>
                  </div>
                  <div className="text-[10.5px] text-zinc-400 shrink-0 tabular-nums pt-0.5">{item.time}</div>
                </Link>
              );
            })}
            {items.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-zinc-400 flex flex-col items-center gap-2">
                <BellOff className="h-5 w-5 text-zinc-300" />
                Nenhuma notificação nova.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
