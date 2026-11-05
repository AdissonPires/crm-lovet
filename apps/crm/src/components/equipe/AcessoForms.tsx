"use client";

import { useActionState } from "react";
import { KeyRound, UserCheck } from "lucide-react";
import { darAcessoCrm, resetarSenhaCrm, trocarMinhaSenha, type EstadoAcao } from "@/app/actions-equipe";

const PAPEL_LABEL: Record<string, string> = { owner: "Admin — dono da conta", sdr: "SDR", viewer: "Leitura" };

const PAPEIS = [
  { valor: "rep", label: "Consultor(a)" },
  { valor: "manager", label: "Gestor(a)" },
  { valor: "admin", label: "Admin" },
  { valor: "admin2", label: "Admin 2 (sem exportar)" },
];

const campo = "rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-[13px] focus:outline-none focus:border-brand-400";

function Retorno({ estado }: { estado: EstadoAcao }) {
  if (!estado) return null;
  return (
    <div className={`mt-2 rounded-lg px-3 py-2 text-[12.5px] ${estado.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>
      {estado.mensagem}
      {estado.senha && <code className="ml-1.5 rounded bg-white px-2 py-0.5 font-mono font-bold text-zinc-900 select-all">{estado.senha}</code>}
    </div>
  );
}

/** Dar ou atualizar o acesso de um colaborador ao CRM (e-mail real + papel). */
export function DarAcessoForm({ userId, email, papel, sugerido }: { userId: string; email: string | null; papel: string | null; sugerido?: string }) {
  const [estado, acao, pendente] = useActionState(darAcessoCrm, null);
  return (
    <div>
      <form action={acao} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="userId" value={userId} />
        <input name="email" type="email" required defaultValue={email ?? ""} placeholder="e-mail real" className={`${campo} w-56`} />
        <select name="papel" defaultValue={papel ?? sugerido ?? "rep"} className={campo}>
          {papel && !PAPEIS.some((p) => p.valor === papel) && <option value={papel}>{PAPEL_LABEL[papel] ?? papel} (atual)</option>}
          {PAPEIS.map((p) => <option key={p.valor} value={p.valor}>{p.label}</option>)}
        </select>
        <button disabled={pendente} className="inline-flex items-center gap-1 rounded-lg bg-zinc-900 text-white text-[12px] font-semibold px-3 py-1.5 hover:bg-zinc-700 disabled:opacity-50">
          <UserCheck className="h-3.5 w-3.5" /> {papel ? "Atualizar" : "Dar acesso"}
        </button>
      </form>
      <Retorno estado={estado} />
    </div>
  );
}

export function ResetarSenhaForm({ userId }: { userId: string }) {
  const [estado, acao, pendente] = useActionState(resetarSenhaCrm, null);
  return (
    <div>
      <form action={acao}>
        <input type="hidden" name="userId" value={userId} />
        <button disabled={pendente} className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 text-zinc-600 text-[12px] font-semibold px-3 py-1.5 hover:bg-zinc-50 disabled:opacity-50">
          <KeyRound className="h-3.5 w-3.5" /> Nova senha
        </button>
      </form>
      <Retorno estado={estado} />
    </div>
  );
}

export function TrocarSenhaForm() {
  const [estado, acao, pendente] = useActionState(trocarMinhaSenha, null);
  return (
    <form action={acao} className="space-y-3 max-w-sm">
      {[
        { nome: "atual", label: "Senha atual" },
        { nome: "nova", label: "Nova senha (mín. 8 caracteres)" },
        { nome: "confirmacao", label: "Confirme a nova senha" },
      ].map((c) => (
        <label key={c.nome} className="block">
          <span className="block text-[13px] font-semibold text-zinc-700 mb-1">{c.label}</span>
          <input name={c.nome} type="password" required className={`${campo} w-full`} />
        </label>
      ))}
      <button disabled={pendente} className="rounded-xl bg-zinc-900 text-white text-[13px] font-semibold px-5 py-2 hover:bg-zinc-700 disabled:opacity-50">Alterar senha</button>
      <Retorno estado={estado} />
    </form>
  );
}
