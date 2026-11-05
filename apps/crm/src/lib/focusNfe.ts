/**
 * Integração com a Focus NFe pra emissão de nota fiscal — cada empresa que
 * contrata o sistema usa o próprio CNPJ e o próprio token (gerado na conta
 * dela na Focus NFe), guardado em workspace.settings.focusNfe. Sem token
 * configurado, a emissão falha com uma mensagem clara em vez de fingir que
 * emitiu — mesmo padrão do envio de email em lib/mailer.ts.
 *
 * Fluxo da Focus NFe é assíncrono: você manda os dados com uma referência
 * seu (ref), ela responde "processando_autorizacao", e só depois de alguns
 * segundos a nota fica "autorizado" (ou "erro_autorizacao"). Por isso
 * consultarInvoice() existe separado de emitirInvoice() — a emissão dispara
 * e o status real só se sabe consultando de novo.
 */

export type FocusNfeConfig = {
  token: string;
  ambiente: "homologacao" | "producao";
};

function baseUrl(config: FocusNfeConfig) {
  return config.ambiente === "producao"
    ? "https://api.focusnfe.com.br"
    : "https://homologacao.focusnfe.com.br";
}

function authHeader(config: FocusNfeConfig) {
  return "Basic " + Buffer.from(`${config.token}:`).toString("base64");
}

export type EmitirNfsePayload = {
  ref: string;
  prestadorCnpj: string;
  tomadorCnpj?: string | null;
  tomadorNome: string;
  tomadorEmail?: string | null;
  valorServicos: number;
  discriminacao: string;
  codigoServico: string;
  aliquotaIss: number;
};

export async function emitirNfse(config: FocusNfeConfig, p: EmitirNfsePayload) {
  const res = await fetch(`${baseUrl(config)}/v2/nfse?ref=${encodeURIComponent(p.ref)}`, {
    method: "POST",
    headers: { Authorization: authHeader(config), "Content-Type": "application/json" },
    body: JSON.stringify({
      data_emissao: new Date().toISOString(),
      prestador: { cnpj: p.prestadorCnpj },
      tomador: {
        cnpj: p.tomadorCnpj || undefined,
        razao_social: p.tomadorNome,
        email: p.tomadorEmail || undefined,
      },
      servico: {
        aliquota: p.aliquotaIss,
        discriminacao: p.discriminacao,
        iss_retido: false,
        item_lista_servico: p.codigoServico,
        valor_servicos: p.valorServicos,
      },
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok && res.status !== 422) {
    throw new Error(`Focus NFe respondeu ${res.status}: ${JSON.stringify(body)}`);
  }
  return body as { status?: string; numero?: string; erros?: unknown; mensagem?: string };
}

export async function consultarNfse(config: FocusNfeConfig, ref: string) {
  const res = await fetch(`${baseUrl(config)}/v2/nfse/${encodeURIComponent(ref)}`, {
    headers: { Authorization: authHeader(config) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Focus NFe respondeu ${res.status}: ${JSON.stringify(body)}`);
  return body as {
    status: "autorizado" | "processando_autorizacao" | "erro_autorizacao" | "cancelado";
    numero?: string;
    serie?: string;
    url?: string;
    caminho_download_pdf?: string;
    mensagem_sefaz?: string;
    erros?: { mensagem: string }[];
  };
}

export function getFocusNfeConfig(workspaceSettings: unknown): FocusNfeConfig | null {
  const settings = workspaceSettings as { focusNfe?: { token?: string; ambiente?: string } } | null;
  const token = settings?.focusNfe?.token;
  if (!token) return null;
  return { token, ambiente: settings?.focusNfe?.ambiente === "producao" ? "producao" : "homologacao" };
}
