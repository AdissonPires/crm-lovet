"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

/** Campo de senha com botão de mostrar/ocultar. Mantém o `name` do form original. */
export function PasswordField({
  className,
  autoComplete = "current-password",
}: {
  className?: string;
  autoComplete?: "current-password" | "new-password";
}) {
  const [visivel, setVisivel] = useState(false);

  return (
    <div className="relative">
      <input
        name="password"
        type={visivel ? "text" : "password"}
        required
        autoComplete={autoComplete}
        placeholder="••••••••"
        className={`${className ?? ""} pr-11`}
      />
      <button
        type="button"
        onClick={() => setVisivel((v) => !v)}
        aria-label={visivel ? "Ocultar senha" : "Mostrar senha"}
        aria-pressed={visivel}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-white/50 transition-colors hover:text-white focus-visible:outline-none focus-visible:text-white"
      >
        {visivel ? <EyeOff className="h-4 w-4" strokeWidth={1.75} /> : <Eye className="h-4 w-4" strokeWidth={1.75} />}
      </button>
    </div>
  );
}
