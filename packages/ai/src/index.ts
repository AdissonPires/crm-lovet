import Anthropic from "@anthropic-ai/sdk";

/**
 * Camada de IA do CRM Lovet Distribuidora — dois provedores:
 *
 *  - Anthropic, quando ANTHROPIC_API_KEY esta definida
 *  - Ollama local, como padrao (nao custa token e roda sem internet)
 *
 * Aqui fica so o provedor; os agentes
 * (prompts) vivem em cada modulo, porque sao especificos do dominio.
 */
const ANTHROPIC_MODEL = "claude-opus-4-8";
const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "llama3.1:8b";

export type JsonSchema = Record<string, unknown>;

export function aiProviderLabel(): string {
  return process.env.ANTHROPIC_API_KEY
    ? `Claude (${ANTHROPIC_MODEL})`
    : `Ollama (${OLLAMA_MODEL})`;
}

/**
 * Gera uma resposta em JSON validado contra o schema.
 *
 * REGRA DO DOMINIO FINANCEIRO: nunca peca calculo ao modelo. Os numeros vem
 * calculados no `user` e o modelo apenas interpreta e recomenda. Aritmetica de
 * dinheiro feita por LLM e como aceitar saldo aproximado — inaceitavel.
 */
export async function generateJson<T>(
  system: string,
  user: string,
  schema: JsonSchema,
): Promise<T> {
  if (process.env.ANTHROPIC_API_KEY) {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 8000,
      system,
      messages: [{ role: "user", content: user }],
      output_config: { format: { type: "json_schema", schema } },
    });
    if (response.stop_reason === "refusal") {
      throw new Error("O agente de IA recusou a solicitação.");
    }
    const text = response.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") throw new Error("Resposta vazia do agente de IA.");
    return JSON.parse(text.text) as T;
  }

  let res: Response;
  try {
    res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        format: schema,
        // Temperatura baixa: analise financeira precisa ser consistente, nao criativa.
        options: { temperature: 0.2 },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
  } catch {
    throw new Error(`Ollama não respondeu em ${OLLAMA_URL}. Ele está rodando? (ollama serve)`);
  }

  if (!res.ok) {
    throw new Error(`Ollama retornou ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }

  const data = (await res.json()) as { message?: { content?: string } };
  const content = data.message?.content;
  if (!content) throw new Error("Resposta vazia do Ollama.");
  return JSON.parse(content) as T;
}
