import { Clock, ListChecks, Lightbulb, CheckCircle2, AlertCircle, HelpCircle, Users, FileText, UserCheck, UserX } from "lucide-react";
import type { MeetingAnalysis } from "@/lib/ai";
import { ReprocessarReuniao } from "@/components/reunioes/ReprocessarReuniao";

/** Transcrevendo/analisando há mais de 15 min = a função caiu no meio; dá pra reprocessar. */
const PARADA_MS = 15 * 60 * 1000;
export function podeReprocessar(ata: { status: string; createdAt: Date }, agora: number): boolean {
  if (ata.status === "erro" || ata.status === "pendente") return true;
  return ata.status !== "pronto" && agora - new Date(ata.createdAt).getTime() > PARADA_MS;
}

export type AtaItem = {
  id: string;
  titulo: string;
  status: string;
  errorMessage: string | null;
  durationSec: number | null;
  createdAt: Date;
  analysis: MeetingAnalysis | null;
  transcript: string | null;
  /** Falhou, na fila ou parada há mais de 15 min — mostra "Processar de novo". */
  podeReprocessar?: boolean;
  encaminhamentos: {
    id: string;
    description: string;
    ownerName: string | null;
    ownerNome: string | null;
    dueHint: string | null;
    virouTarefa: boolean;
  }[];
};

function duracao(seg: number | null): string {
  if (!seg) return "";
  const m = Math.floor(seg / 60);
  return m >= 1 ? `${m} min` : `${seg}s`;
}

/** Bloco de lista simples, escondido quando a IA não achou nada do tipo. */
function Lista({
  titulo, itens, Icon, cor,
}: { titulo: string; itens: string[]; Icon: typeof ListChecks; cor: string }) {
  if (!itens?.length) return null;
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className={`h-3.5 w-3.5 ${cor}`} />
        <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">{titulo}</span>
      </div>
      <ul className="space-y-1.5">
        {itens.map((it, i) => (
          <li key={i} className="text-[13px] text-zinc-700 leading-relaxed pl-3 border-l-2 border-zinc-100">{it}</li>
        ))}
      </ul>
    </div>
  );
}

export function AtaReuniao({ ata }: { ata: AtaItem }) {
  const a = ata.analysis;

  return (
    <div className="rounded-2xl bg-white border border-zinc-100 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-14px_rgba(0,0,0,0.12)]">
      <div className="px-5 py-4 border-b border-zinc-100 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-[14px] text-zinc-900">{ata.titulo}</h3>
          <div className="flex items-center gap-2 text-[11px] text-zinc-400 mt-0.5">
            <Clock className="h-3 w-3" />
            {new Date(ata.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
            {ata.durationSec ? ` · ${duracao(ata.durationSec)}` : ""}
          </div>
        </div>
        {ata.status !== "pronto" && (
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-semibold ${
            ata.status === "erro" ? "bg-red-50 text-red-600"
            : "bg-amber-50 text-amber-700"
          }`}>
            {ata.status === "erro" ? "Falhou"
              : ata.status === "transcrevendo" ? "Transcrevendo"
              : ata.status === "analisando" ? "Analisando"
              : "Na fila"}
          </span>
        )}
      </div>

      {ata.status === "erro" && (
        <div className="px-5 py-4 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
          <div className="text-[13px] text-red-800">
            {ata.errorMessage ?? "Não foi possível processar a gravação."}
          </div>
        </div>
      )}

      {ata.podeReprocessar && <ReprocessarReuniao id={ata.id} />}

      {a && (
        <div className="px-5 py-4 space-y-5">
          <p className="text-[13px] text-zinc-700 leading-relaxed">{a.resumo}</p>

          {a.participantes?.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <Users className="h-3.5 w-3.5 text-zinc-400" />
              {a.participantes.map((p, i) => (
                <span key={i} className="rounded-full bg-zinc-100 text-zinc-600 text-[11px] font-medium px-2 py-0.5">{p}</span>
              ))}
            </div>
          )}

          {a.topicos?.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2.5">
                <ListChecks className="h-3.5 w-3.5 text-brand-600" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Resumo em tópicos</span>
              </div>
              <div className="space-y-3">
                {a.topicos.map((t, i) => (
                  <div key={i} className="rounded-xl bg-slate-50 px-3.5 py-3">
                    <div className="text-[13px] font-semibold text-zinc-800">{t.titulo}</div>
                    <p className="text-[12.5px] text-zinc-600 mt-1 leading-relaxed">{t.detalhe}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Encaminhamentos vêm da tabela, não do JSON: é lá que se sabe se o
              responsável casou com alguém do time e virou tarefa. */}
          {ata.encaminhamentos.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                  Quem ficou com o quê
                </span>
              </div>
              <div className="space-y-2">
                {ata.encaminhamentos.map((e) => (
                  <div key={e.id} className="flex items-start gap-3 rounded-xl border border-zinc-100 px-3.5 py-2.5">
                    {e.virouTarefa
                      ? <UserCheck className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                      : <UserX className="h-4 w-4 text-zinc-300 shrink-0 mt-0.5" />}
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] text-zinc-800">{e.description}</div>
                      <div className="text-[11px] text-zinc-400 mt-0.5">
                        {e.ownerNome
                          ? <>Tarefa criada para <span className="font-semibold text-zinc-600">{e.ownerNome}</span></>
                          : e.ownerName
                            ? <>Dito como responsável: <span className="font-medium">{e.ownerName}</span> — não é do time, sem tarefa</>
                            : "Ninguém assumiu na reunião"}
                        {e.dueHint ? ` · prazo: ${e.dueHint}` : ""}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Lista titulo="Decisões" itens={a.decisoes} Icon={CheckCircle2} cor="text-brand-600" />
          <Lista titulo="Insights" itens={a.insights} Icon={Lightbulb} cor="text-amber-500" />
          <Lista titulo="Ficou em aberto" itens={a.pendencias} Icon={HelpCircle} cor="text-zinc-400" />

          {ata.transcript && (
            <details className="rounded-xl border border-zinc-100">
              <summary className="cursor-pointer px-3.5 py-2.5 text-[11.5px] font-semibold text-zinc-500 hover:bg-zinc-50 rounded-xl flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5" /> Ver transcrição completa
              </summary>
              <p className="px-3.5 pb-3.5 text-[12px] text-zinc-500 leading-relaxed whitespace-pre-wrap">
                {ata.transcript}
              </p>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
