import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

// Raiz do monorepo, resolvida a partir da localização deste arquivo.
const monorepoRoot = fileURLToPath(new URL("../../", import.meta.url));

const nextConfig: NextConfig = {
  // node-postgres carrega binding nativo opcional (pg-native); manter externo
  // evita o bundler tentar resolvê-lo.
  // pdfkit carrega arquivos .afm de fonte em runtime via fs.readFile — o
  // bundler não enxerga essa dependência (não é um import), então sem isso
  // o standalone build fica sem os dados de fonte e quebra ao gerar PDF.
  serverExternalPackages: ["pg", "pdfkit"],
  output: "standalone",
  // Monorepo: sem isso o build standalone traça apenas apps/crm e deixa de
  // fora os pacotes compartilhados hospedados na raiz — o container sobe
  // mas quebra em runtime por dependência ausente.
  outputFileTracingRoot: monorepoRoot,
  // pdfkit lê os .afm de fonte com um caminho montado em runtime (não é um
  // require/import estático), então o file tracer não os enxerga sozinho —
  // sem isso o standalone build sobe sem os dados de fonte e quebra ao gerar
  // o primeiro PDF.
  //
  // O pdfkit é instalado na RAIZ do monorepo (workspaces), não em
  // apps/crm/node_modules — o caminho antigo ("./node_modules/...") não
  // existia e as fontes podiam não ir pro deploy. Vale pra toda rota de PDF.
  outputFileTracingIncludes: {
    "/api/reports/**/*": ["../../node_modules/pdfkit/js/data/**"],
  },
};

export default nextConfig;
