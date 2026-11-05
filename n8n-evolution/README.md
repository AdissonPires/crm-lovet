# Atendimento WhatsApp — Lovet Distribuidora

Stack de atendimento por WhatsApp com IA, integrada ao CRM da Lovet Distribuidora.

## Arquitetura

```
WhatsApp → Evolution API → webhook → n8n (orquestrador) → Ollama (IA)
                                          ├─ Whisper (transcreve áudios)
                                          └─ CRM Lovet (API) ── Postgres
```

- **Evolution API** (`:8080`) — conecta o WhatsApp (Baileys).
- **n8n** (`:5678`) — orquestra: recebe mensagens, transcreve áudio, chama a IA, decide, envia,
  dispara follow-ups e campanhas.
- **Ollama** (no host, `:11434`) — cérebro do chatbot (`llama3.1:8b`).
- **Whisper** (interno `:9000`) — transcreve áudios recebidos.
- **CRM Lovet** (`:3000`) — fonte de verdade: contatos, conversas, mensagens, leads, estado do bot,
  campanhas. Expõe a API `/api/wa/*` e `/api/contacts` (protegida por `WA_API_TOKEN`).
- **Postgres/Redis** — bancos do CRM, do n8n e da Evolution.

## Subir tudo

Crie o arquivo `n8n-evolution/.env` a partir do `.env.example` da raiz (com valores seus) e rode:

```bash
cd n8n-evolution
docker compose up -d
```

Serviços: `lovet-crm`, `n8n`, `evolution-api`, `whisper`, `postgres`, `redis`.

## Recursos

| Recurso | Como funciona |
|---|---|
| **Chatbot IA** | Responde em linguagem humana (Ollama) e qualifica o lead (cidade e produto procurado). |
| **Salva no CRM** | Cada mensagem e contato/lead é gravado via API; aparece nas telas *WhatsApp* e *Contatos*. |
| **Atendimento humano** | Cliente pede atendente → bot **pausa** e a conversa vai pra fila *pending*. Volta com "atendimento automático". |
| **Follow-up 3 dias** | Sem resposta há 3 dias → mensagem de retomada (até 2x, espaçadas). Workflow *Follow-up 3 dias*. |
| **Campanhas** | Tela **Campanhas WhatsApp** no CRM → cria, escolhe público, dispara. Runner no n8n com intervalo anti-ban. |
| **Áudio** | Áudio recebido é transcrito (Whisper) e respondido normalmente. |
| **Segurança** | Whitelist de números + grupos/status/broadcast ignorados. |

## Workflows no n8n

Importe os arquivos `workflow-*.json` desta pasta no n8n e preencha a chave da Evolution API
(`SUBSTITUA_PELA_EVOLUTION_API_KEY`) em cada um.

- **Chatbot WhatsApp - Lovet Distribuidora** — recebe e responde (webhook `whatsapp-chatbot`).
- **Follow-up 3 dias - Lovet Distribuidora** — cron de 1h.
- **Follow-up 30 dias - Lovet Distribuidora** — mensagem 30 dias após a entrada do lead.
- **Aniversário - Lovet Distribuidora** — mensagem de aniversário.
- **Campanhas WhatsApp - Lovet Distribuidora** — cron de 2min (dispara campanhas *Em execução*).

## Whitelist (modo de teste → produção)

Durante os testes, restrinja o bot a números seus:

1. n8n → workflow **Chatbot WhatsApp** → nó **Chatbot (IA + CRM)**.
2. Na 1ª linha, ajuste `const WHITELIST = [];` com os números de teste (formato `55DDDNÚMERO`).
   Lista vazia (`[]`) responde a todos os contatos diretos (modo produção).
3. Salve. (Grupos, status e listas de transmissão continuam ignorados automaticamente.)

## Testar

- **Chatbot**: mande uma mensagem de texto do número de teste → resposta em segundos.
- **Áudio**: mande um áudio → é transcrito e respondido.
- **Humano**: "quero falar com um atendente" → bot para. "atendimento automático" → bot volta.
- **Campanha**: CRM → *Campanhas WhatsApp* → criar → **Iniciar** → o runner dispara (a cada ~2min/lote).

## Comandos úteis

```bash
docker compose ps                 # status
docker compose logs -f lovet-crm  # logs do CRM
docker compose logs -f whisper    # logs da transcrição
docker compose restart n8n        # reiniciar n8n
```

## Notas de manutenção

- Chaves e token em `.env` (não versionar).
- Rotas da API do CRM: `POST /api/wa/inbound`, `/api/wa/outbound`, `/api/wa/handoff`,
  `GET /api/wa/followups`, `POST /api/wa/followup-sent`, `POST /api/contacts`,
  `GET /api/wa/campaigns/pending`, `POST /api/wa/campaigns/recipient-sent`.
