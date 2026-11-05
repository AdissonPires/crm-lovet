"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Clock, Zap } from "lucide-react";

export type KanbanCard = {
  id: string;
  href?: string;
  title: string;
  subtitle?: string;
  amount?: string;
  badge?: string;
  daysInStage: number;
  slaDays?: number | null;
  ownerInitials?: string;
};

export type KanbanColumn = {
  id: string;
  name: string;
  probability?: number;
  isTerminal?: boolean;
  totalText?: string;
  cards: KanbanCard[];
};

const dotColors = [
  "bg-sky-400", "bg-violet-400", "bg-brand-400", "bg-brand-400", "bg-emerald-400", "bg-rose-400",
];

export function Kanban({
  columns,
  moveAction,
}: {
  columns: KanbanColumn[];
  moveAction: (cardId: string, toColumnId: string) => Promise<void>;
}) {
  const [cols, setCols] = useState(columns);
  const [dragging, setDragging] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function onDrop(toColId: string) {
    if (!dragging) return;
    const cardId = dragging;
    setDragging(null);
    setCols((prev) => {
      const fromCol = prev.find((c) => c.cards.some((k) => k.id === cardId));
      if (!fromCol || fromCol.id === toColId) return prev;
      const card = fromCol.cards.find((k) => k.id === cardId)!;
      return prev.map((c) => {
        if (c.id === fromCol.id) return { ...c, cards: c.cards.filter((k) => k.id !== cardId) };
        if (c.id === toColId) return { ...c, cards: [{ ...card, daysInStage: 0 }, ...c.cards] };
        return c;
      });
    });
    startTransition(() => moveAction(cardId, toColId));
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 items-start">
      {cols.map((col, i) => (
        <div
          key={col.id}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => onDrop(col.id)}
          className="w-[290px] shrink-0 rounded-2xl bg-zinc-50/80 border border-zinc-100"
        >
          <div className="px-4 pt-3.5 pb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${col.isTerminal ? "bg-zinc-300" : dotColors[i % dotColors.length]}`} />
              <span className="text-[13px] font-semibold text-zinc-700">{col.name}</span>
              <span className="text-[11px] rounded-full bg-white border border-zinc-200 px-1.5 py-0.5 text-zinc-500 font-medium">
                {col.cards.length}
              </span>
            </div>
            {col.probability !== undefined && !col.isTerminal && (
              <span className="text-[11px] text-zinc-400 font-medium">{col.probability}%</span>
            )}
          </div>
          {col.totalText && (
            <div className="px-4 pb-2 text-[11px] text-zinc-400 font-medium tabular-nums">{col.totalText}</div>
          )}
          <div className="p-2 pt-0 space-y-2 min-h-16">
            {col.cards.map((card) => {
              const overSla = card.slaDays != null && card.daysInStage > card.slaDays;
              const inner = (
                <div
                  draggable
                  onDragStart={() => setDragging(card.id)}
                  className={`rounded-xl bg-white border p-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_1px_1px_rgba(0,0,0,0.02)] cursor-grab active:cursor-grabbing hover:shadow-md hover:-translate-y-px transition-all ${
                    overSla ? "border-red-200 ring-1 ring-red-100" : "border-zinc-100"
                  }`}
                >
                  <div className="text-[13px] font-semibold text-zinc-900 leading-snug">{card.title}</div>
                  {card.subtitle && <div className="text-xs text-zinc-400 mt-0.5">{card.subtitle}</div>}
                  <div className="flex items-center justify-between mt-3">
                    <div className="flex items-center gap-1.5">
                      {card.amount && <span className="text-xs font-bold text-emerald-700 tabular-nums">{card.amount}</span>}
                      {card.badge && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold rounded-md bg-brand-50 text-brand-700 border border-brand-100 px-1.5 py-0.5">
                          <Zap className="h-2.5 w-2.5" />{card.badge}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={`inline-flex items-center gap-0.5 text-[10px] font-medium ${overSla ? "text-red-600" : "text-zinc-400"}`}>
                        <Clock className="h-2.5 w-2.5" />{card.daysInStage}d
                      </span>
                      {card.ownerInitials && (
                        <span className="h-5 w-5 rounded-full bg-gradient-to-br from-zinc-700 to-zinc-900 text-[9px] font-bold text-white flex items-center justify-center">
                          {card.ownerInitials}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
              return card.href ? (
                <Link key={card.id} href={card.href} draggable={false} className="block">{inner}</Link>
              ) : (
                <div key={card.id}>{inner}</div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
