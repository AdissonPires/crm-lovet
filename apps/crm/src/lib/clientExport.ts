"use client";

/** Utilitários de exportação client-side — CSV de tabela, SVG/PNG de gráfico. Sem dependência externa. */

function baixarBlob(blob: Blob, nomeArquivo: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function escapeCsv(valor: unknown): string {
  const texto = String(valor ?? "");
  return /[",\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

export function exportarCsv(colunas: { chave: string; label: string }[], linhas: Record<string, unknown>[], nomeArquivo: string) {
  const cabecalho = colunas.map((c) => escapeCsv(c.label)).join(",");
  const corpo = linhas.map((linha) => colunas.map((c) => escapeCsv(linha[c.chave])).join(",")).join("\n");
  const csv = `${cabecalho}\n${corpo}`;
  // BOM pra Excel abrir acentuação em UTF-8 corretamente.
  baixarBlob(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }), nomeArquivo);
}

export function exportarSvg(svgEl: SVGSVGElement, nomeArquivo: string) {
  const serializer = new XMLSerializer();
  const fonte = serializer.serializeToString(svgEl);
  baixarBlob(new Blob([fonte], { type: "image/svg+xml" }), nomeArquivo);
}

export function exportarPng(svgEl: SVGSVGElement, nomeArquivo: string, escala = 2) {
  const serializer = new XMLSerializer();
  const fonte = serializer.serializeToString(svgEl);
  const svgBlob = new Blob([fonte], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  const img = new Image();
  img.onload = () => {
    const largura = svgEl.viewBox.baseVal.width || svgEl.clientWidth || 400;
    const altura = svgEl.viewBox.baseVal.height || svgEl.clientHeight || 300;
    const canvas = document.createElement("canvas");
    canvas.width = largura * escala;
    canvas.height = altura * escala;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    canvas.toBlob((blob) => {
      if (blob) baixarBlob(blob, nomeArquivo);
    }, "image/png");
  };
  img.src = url;
}
