"use client";

import { useState, useTransition } from "react";
import { Loader2, Sparkles } from "lucide-react";
import type { AiResult } from "@/app/actions-ai";

export function AiButton({
  action,
  label,
  busyLabel,
}: {
  action: () => Promise<AiResult>;
  label: string;
  busyLabel: string;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<AiResult | null>(null);

  return (
    <div>
      <button
        disabled={pending}
        onClick={() => startTransition(async () => setResult(await action()))}
        className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-[13px] font-semibold px-4 py-2.5 shadow-lg shadow-violet-500/20 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-60 transition-all"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {pending ? busyLabel : label}
      </button>
      {result && (
        <p className={`mt-2 text-xs font-medium ${result.ok ? "text-emerald-700" : "text-red-600"}`}>
          {result.message}
        </p>
      )}
    </div>
  );
}
