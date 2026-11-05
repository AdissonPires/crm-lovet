"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Mic, Square, Loader2, AlertCircle, Upload } from "lucide-react";

type Fase = "parado" | "gravando" | "pausado" | "enviando" | "transcrevendo" | "analisando" | "erro";

/**
 * Gravação da reunião pelo navegador, via MediaRecorder.
 *
 * O áudio é acumulado em memória em pedaços de 1s e só sai daqui quando a
 * pessoa para a gravação: streaming para o servidor exigiria WebSocket e não
 * traria nada, porque o Whisper transcreve o arquivo inteiro de uma vez.
 *
 * O tipo do arquivo não é escolhido, é perguntado ao navegador
 * (isTypeSupported): Chrome grava webm/opus, Safari só mp4/aac, e fixar um
 * formato faz a gravação falhar silenciosamente em metade dos navegadores.
 */
export function Gravador({ opportunityId }: { opportunityId?: string }) {
  const router = useRouter();
  const [fase, setFase] = useState<Fase>("parado");
  const [segundos, setSegundos] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [titulo, setTitulo] = useState("");
  const [nivel, setNivel] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const pedacosRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Cronômetro só enquanto grava de fato.
  useEffect(() => {
    if (fase !== "gravando") return;
    const t = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [fase]);

  // Libera microfone e contexto de áudio ao desmontar: sem isto, a luz do
  // microfone fica acesa depois de sair da página.
  useEffect(() => () => { pararTudo(); }, []);

  function pararTudo() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    audioCtxRef.current?.close().catch(() => {});
    streamRef.current = null;
    analyserRef.current = null;
    audioCtxRef.current = null;
  }

  function escolherMime(): string {
    const candidatos = [
      "audio/webm;codecs=opus", "audio/webm",
      "audio/ogg;codecs=opus", "audio/mp4",
    ];
    for (const c of candidatos) {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) return c;
    }
    return "";
  }

  /** Medidor de voz. Serve para a pessoa ver que o microfone está captando
   *  ANTES de gravar 40 minutos de silêncio. */
  function ligarMedidor(stream: MediaStream) {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    audioCtxRef.current = ctx;
    const fonte = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    fonte.connect(analyser);
    analyserRef.current = analyser;

    const dados = new Uint8Array(analyser.frequencyBinCount);
    const medir = () => {
      analyser.getByteFrequencyData(dados);
      const media = dados.reduce((a, b) => a + b, 0) / dados.length;
      setNivel(Math.min(100, Math.round((media / 90) * 100)));
      rafRef.current = requestAnimationFrame(medir);
    };
    medir();
  }

  async function comecar() {
    setErro(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      ligarMedidor(stream);

      const mime = escolherMime();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      pedacosRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) pedacosRef.current.push(e.data); };
      rec.start(1000);
      recorderRef.current = rec;
      setSegundos(0);
      setFase("gravando");
    } catch (e) {
      setFase("erro");
      setErro(
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "O navegador bloqueou o microfone. Autorize o acesso e tente de novo."
          : "Não foi possível acessar o microfone.",
      );
    }
  }

  function alternarPausa() {
    const rec = recorderRef.current;
    if (!rec) return;
    if (rec.state === "recording") { rec.pause(); setFase("pausado"); }
    else if (rec.state === "paused") { rec.resume(); setFase("gravando"); }
  }

  async function parar() {
    const rec = recorderRef.current;
    if (!rec) return;

    const blob: Blob = await new Promise((resolve) => {
      rec.onstop = () => resolve(new Blob(pedacosRef.current, { type: rec.mimeType || "audio/webm" }));
      rec.stop();
    });
    pararTudo();
    setNivel(0);

    if (blob.size < 2000) {
      setFase("erro");
      setErro("A gravação ficou vazia. Verifique o microfone e grave de novo.");
      return;
    }

    try {
      setFase("enviando");
      const id = await enviarGravacao(blob, { titulo, duracaoSeg: segundos, opportunityId });
      // A tela diz em qual etapa está, porque transcrever leva minutos e
      // analisar leva segundos.
      await processarReuniao(id, (f) => setFase(f));

      setFase("parado");
      setSegundos(0);
      setTitulo("");
      router.refresh();
    } catch (e) {
      setFase("erro");
      setErro(e instanceof Error ? e.message : "erro desconhecido");
    }
  }

  const mmss = `${String(Math.floor(segundos / 60)).padStart(2, "0")}:${String(segundos % 60).padStart(2, "0")}`;
  const ocupado = fase === "enviando" || fase === "transcrevendo" || fase === "analisando";
  const rotuloOcupado = fase === "enviando" ? "Enviando a gravação…"
    : fase === "transcrevendo" ? "Transcrevendo o áudio… (pode levar alguns minutos)"
    : "Montando a ata com a IA…";

  return (
    <div className="rounded-2xl bg-white border border-zinc-100 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-14px_rgba(0,0,0,0.12)] p-6">
      <div className="flex items-center gap-2 mb-1">
        <Mic className="h-4 w-4 text-brand-600" />
        <h2 className="font-semibold text-sm text-zinc-800">Gravar reunião</h2>
      </div>
      <p className="text-xs text-zinc-500 mb-5">
        A IA ouve a gravação e devolve o resumo em tópicos, os insights e quem ficou com cada tarefa.
      </p>

      {fase === "parado" && (
        <input
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder="Assunto da reunião (opcional — a IA sugere um)"
          className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-[13px] mb-4 focus:outline-none focus:border-brand-400"
        />
      )}

      {(fase === "gravando" || fase === "pausado") && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${fase === "gravando" ? "bg-red-500 animate-pulse" : "bg-amber-500"}`} />
              <span className="text-[13px] font-semibold text-zinc-700">
                {fase === "gravando" ? "Gravando" : "Pausado"}
              </span>
            </div>
            <span className="text-lg font-bold text-zinc-900 tabular-nums">{mmss}</span>
          </div>
          {/* Mostra que o microfone está captando de verdade — a falha mais
              comum é descobrir depois de 40 min que o áudio saiu mudo. */}
          <div className="h-1.5 rounded-full bg-zinc-100 overflow-hidden">
            <div className="h-full bg-emerald-500 transition-[width] duration-100" style={{ width: `${nivel}%` }} />
          </div>
          <p className="text-[11px] text-zinc-400 mt-1.5">
            {nivel < 4 ? "Não estou captando áudio — fale mais perto do microfone." : "Áudio sendo captado."}
          </p>
        </div>
      )}

      {ocupado && (
        <div className="flex items-center gap-2.5 rounded-xl bg-brand-50 border border-brand-100 px-4 py-3 mb-4">
          <Loader2 className="h-4 w-4 text-brand-600 animate-spin shrink-0" />
          <span className="text-[13px] text-brand-800">{rotuloOcupado}</span>
        </div>
      )}

      {erro && (
        <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3 mb-4">
          <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
          <span className="text-[13px] text-red-800">{erro}</span>
        </div>
      )}

      <div className="flex gap-2">
        {(fase === "parado" || fase === "erro") && (
          <button onClick={comecar}
            className="inline-flex items-center gap-2 rounded-xl bg-red-600 text-white text-[13px] font-semibold px-5 py-3 hover:bg-red-700 transition-colors shadow-sm">
            <Mic className="h-4 w-4" /> Começar a gravar
          </button>
        )}
        {(fase === "gravando" || fase === "pausado") && (
          <>
            <button onClick={parar}
              className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 text-white text-[13px] font-semibold px-5 py-3 hover:bg-zinc-800 transition-colors">
              <Square className="h-3.5 w-3.5" /> Parar e gerar a ata
            </button>
            <button onClick={alternarPausa}
              className="rounded-xl border border-zinc-200 text-zinc-600 text-[13px] font-medium px-4 py-3 hover:bg-zinc-50 transition-colors">
              {fase === "gravando" ? "Pausar" : "Retomar"}
            </button>
          </>
        )}
        {fase === "parado" && <EnviarArquivo opportunityId={opportunityId} />}
      </div>
    </div>
  );
}

/**
 * Alternativa ao microfone: subir um arquivo já gravado.
 *
 * Reunião presencial costuma ser gravada no celular, e reunião de Meet/Zoom já
 * sai com áudio próprio — obrigar a regravar pelo navegador inviabilizaria os
 * dois casos mais comuns.
 */
function EnviarArquivo({ opportunityId }: { opportunityId?: string }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(file: File) {
    setErro(null);
    setOcupado(true);
    try {
      const id = await enviarGravacao(file, { titulo: file.name.replace(/\.[^.]+$/, ""), opportunityId });
      await processarReuniao(id);
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "erro desconhecido");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div>
      <label className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 text-zinc-600 text-[13px] font-medium px-4 py-3 hover:bg-zinc-50 transition-colors cursor-pointer">
        {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        {ocupado ? "Processando…" : "Enviar gravação"}
        <input type="file" accept="audio/*,video/mp4" className="hidden" disabled={ocupado}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) enviar(f); e.target.value = ""; }} />
      </label>
      {erro && <p className="text-[11px] text-red-600 mt-1.5">{erro}</p>}
    </div>
  );
}

type DadosGravacao = { titulo?: string; duracaoSeg?: number; opportunityId?: string };

/**
 * Sobe a gravação e devolve o id da reunião.
 *
 * Em produção (Supabase Storage) o arquivo vai do navegador DIRETO pro
 * Storage por URL assinada — a Vercel recusa corpo acima de 4,5 MB, e uma
 * reunião de 10 minutos já passa disso. No stack local (`modo: "direto"`)
 * continua o POST multipart de sempre.
 */
async function enviarGravacao(audio: Blob, dados: DadosGravacao): Promise<string> {
  const prep = await fetch("/api/reunioes/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...dados, tipo: audio.type, tamanho: audio.size }),
  });
  const prepJson = await prep.json();
  if (!prep.ok || !prepJson.ok) throw new Error(prepJson.error ?? "falha ao preparar o envio");

  if (prepJson.modo === "assinado") {
    const put = await fetch(prepJson.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": audio.type || "audio/webm", "x-upsert": "true" },
      body: audio,
    });
    if (!put.ok) throw new Error(`falha ao enviar a gravação (HTTP ${put.status})`);
    return prepJson.id as string;
  }

  const form = new FormData();
  form.append("audio", audio, audio instanceof File ? audio.name : "reuniao.webm");
  if (dados.titulo) form.append("titulo", dados.titulo);
  if (dados.duracaoSeg) form.append("duracaoSeg", String(dados.duracaoSeg));
  if (dados.opportunityId) form.append("opportunityId", dados.opportunityId);
  const up = await fetch("/api/reunioes", { method: "POST", body: form });
  const upJson = await up.json();
  if (!up.ok || !upJson.ok) throw new Error(upJson.error ?? "falha ao enviar a gravação");
  return upJson.id as string;
}

/** Transcreve e depois analisa — duas chamadas pra tela dizer em qual etapa está. */
async function processarReuniao(id: string, aoMudarFase?: (f: "transcrevendo" | "analisando") => void): Promise<void> {
  aoMudarFase?.("transcrevendo");
  const tr = await fetch(`/api/reunioes/${id}/processar?etapa=transcrever`, { method: "POST" });
  const trJson = await tr.json();
  if (!tr.ok || !trJson.ok) throw new Error(trJson.error ?? "falha ao transcrever");

  aoMudarFase?.("analisando");
  const an = await fetch(`/api/reunioes/${id}/processar?etapa=analisar`, { method: "POST" });
  const anJson = await an.json();
  if (!an.ok || !anJson.ok) throw new Error(anJson.error ?? "falha ao analisar");
}
