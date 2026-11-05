"use client";

import { useActionState } from "react";
import { aceitarConvite, type EstadoConvite } from "@/app/actions-convites";
import { PasswordField } from "@/components/PasswordField";

const campo =
  "w-full rounded-xl bg-white/[0.06] border border-white/15 px-3.5 py-3 text-sm text-white placeholder:text-white/35 focus:border-brand-400 focus:bg-white/[0.09] focus:outline-none focus:ring-2 focus:ring-brand/30 transition-colors";

/** Formulário público do convite: nome, e-mail e senha. Ao salvar, já entra no sistema. */
export function CadastroConviteForm({ token, nomeFixo }: { token: string; nomeFixo?: string | null }) {
  const [estado, acao, pendente] = useActionState<EstadoConvite, FormData>(aceitarConvite, null);

  return (
    <form action={acao} className="mt-8 space-y-4">
      <input type="hidden" name="token" value={token} />
      {/* Convite nominal: o nome já vem do cadastro — a pessoa só informa e-mail e senha. */}
      {!nomeFixo && (
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-white/70">Nome completo</span>
          <input name="nome" required minLength={3} autoComplete="name" placeholder="Seu nome" className={campo} />
        </label>
      )}
      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold text-white/70">E-mail corporativo</span>
        {/* Cadastro de outra pessoa: sem autopreenchimento, senão o navegador de quem gerou o link injeta o e-mail dele. */}
        <input name="email" type="email" required autoComplete="off" data-lpignore="true" data-1p-ignore placeholder="seu@email.com" className={campo} />
      </label>
      <div>
        <span className="mb-1.5 block text-xs font-semibold text-white/70">Senha (mínimo 8 caracteres)</span>
        <PasswordField className={campo} autoComplete="new-password" />
      </div>
      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold text-white/70">Confirme a senha</span>
        <input name="confirmacao" type="password" required autoComplete="new-password" placeholder="••••••••" className={campo} />
      </label>

      {estado && !estado.ok && (
        <div role="alert" className="rounded-xl border border-red-400/30 bg-red-500/10 px-3.5 py-2.5 text-[13px] text-red-200">
          {estado.mensagem}
        </div>
      )}

      <button
        disabled={pendente}
        className="w-full rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60 transition-colors"
      >
        {pendente ? "Criando acesso…" : "Criar acesso e entrar"}
      </button>
    </form>
  );
}
