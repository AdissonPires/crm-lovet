/**
 * Configuração do bot / follow-up automático do WhatsApp — editável pelo
 * GESTOR na tela de WhatsApp. Regra: somente um número do gestor tem bot e
 * faz follow-up; o resto é atendimento manual. Então:
 *  - `instanciaGestor`: a instância da Evolution (número) do gestor — o ÚNICO
 *    em que o chatbot responde e de onde saem os follow-ups. Mensagem que chega
 *    por outra instância (número de consultor) só é registrada no CRM.
 *  - as mensagens de follow-up ficam aqui, não mais fixas no código do n8n.
 *
 * Guardado em `workspaces.settings.followup` (jsonb) — sem tabela nova.
 */
export interface FollowupConfig {
  instanciaGestor: string;
  /** Cliente que parou de responder há 3+ dias (até 2 vezes). `{nome}` = primeiro nome. */
  mensagemRetomada: string;
  /** Lead que entrou há 30 dias. `{nome}` = primeiro nome. */
  mensagem30Dias: string;
  /** Se ligado, o n8n personaliza a retomada com IA usando `instrucaoIa`; `mensagemRetomada` vira o texto de reserva. */
  usarIaNaRetomada: boolean;
  instrucaoIa: string;
}

export const FOLLOWUP_PADRAO: FollowupConfig = {
  instanciaGestor: process.env.EVOLUTION_INSTANCE ?? "principal",
  mensagemRetomada:
    "Oi {nome}! Passando pra saber se ficou alguma dúvida sobre o seu pedido 😊 Posso te ajudar a finalizar?",
  mensagem30Dias:
    "Oi {nome}! Já faz um mês desde que você falou com a Lovet Distribuidora. Ficou tudo certo com o seu pedido, ou posso te ajudar com alguma coisa?",
  usarIaNaRetomada: false,
  instrucaoIa:
    "Você é da Lovet Distribuidora. " +
    "Escreva UMA mensagem curta pra retomar a conversa com um cliente que parou de responder há alguns dias, " +
    "sem pressão e sem soar como cobrança. Trate pelo primeiro nome. No máximo 2 frases, tom de WhatsApp, " +
    "pode usar 1 emoji. Responda só com a mensagem, sem aspas.",
};

/** Lê a config do workspace, completando com o padrão o que ainda não foi editado. */
export function lerFollowupConfig(settings: unknown): FollowupConfig {
  const salvo = (settings as { followup?: Partial<FollowupConfig> } | null)?.followup ?? {};
  const limpo = Object.fromEntries(Object.entries(salvo).filter(([, v]) => v !== undefined && v !== null && v !== ""));
  return { ...FOLLOWUP_PADRAO, ...limpo };
}

/** "Oi {nome}!" → "Oi Maria!" (primeiro nome, inicial maiúscula). Sem nome: "Oi!" — o marcador some junto com o espaço antes dele. */
export function renderizarMensagem(modelo: string, nomeCompleto: string | null | undefined, produto?: string | null): string {
  const comProduto = modelo.replaceAll("{produto}", produto?.trim() || "pedido");
  const primeiro = String(nomeCompleto ?? "").trim().split(/\s+/)[0] ?? "";
  if (!primeiro) return comProduto.replace(/\s*\{nome\}/g, "");
  return comProduto.replaceAll("{nome}", primeiro.charAt(0).toUpperCase() + primeiro.slice(1).toLowerCase());
}
