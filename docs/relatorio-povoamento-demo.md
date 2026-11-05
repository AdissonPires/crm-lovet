# Relatório de execução — Povoamento histórico SINTÉTICO (Lovet Distribuidora)

Lote: `LOVET_DEMO_2025_11_2026_10_V1` · Período simulado: 01/11/2025 a 31/10/2026 · Origem: `SIMULACAO_IA`

> **Tudo neste lote é dado sintético.** Nenhum cliente, contato, pedido, preço, meta ou campanha
> representa a operação real da Lovet. Os valores em R$ são fictícios e **não** são faturamento contábil.
> Nada foi enviado a clientes (WhatsApp, e-mail, cobrança) e nada integra ERP, nota fiscal ou estoque.

**Resultado da validação: população TOTALMENTE CONCLUÍDA e gravada no banco local** (PostgreSQL
`lovet-postgres`, porta 5480), dentro de uma única transação. Foram inseridos e conferidos por consulta
SQL os registros da seção C. Auditoria pós-carga: **47 verificações de integridade/relacionamento/coerência, 0 falhas**.

---

## A. Diagnóstico do CRM

| Item | Achado |
|---|---|
| Tecnologia | Next.js 16 (App Router, React 19), Drizzle ORM, Postgres 16 |
| Banco | Postgres local; schemas `crm` (app) e `shared` (identidade/licença) |
| Perfis | owner, admin, admin2, manager, rep, sdr, viewer (permissões em `src/lib/policy.ts`) |
| Módulos existentes | Pré-vendas (SDR), Pipeline, Clientes, Contatos, Contratos, Comissões, Tarefas, Atividades, Atendimento (tickets), Campanhas WhatsApp, WhatsApp, FeedMeet (atas), Equipes, Relatórios de atividade, Estoque/Folha/NF (ocultos) |
| Etapas do funil | Só 4: Negociação, Cobrança enviada, Ganho, Perdido |
| API / importação | Rotas internas `/api/*` para WhatsApp e leads; **sem API pública nem importador de CSV** |
| Auditoria/histórico | `opportunity_stage_history` e `activities` |
| Segurança da carga | Ambiente local confirmado (host `127.0.0.1`; o script aborta em qualquer outro host); backup `backups/lovet_pre_carga_*.dump` (ignorado pelo git); nada preexistente foi apagado ou alterado |

**Módulos que NÃO existiam** (criados com autorização, em migração aditiva — nenhuma tabela existente foi alterada):
catálogo de produtos, cotações e itens, pedidos e itens, metas, regiões comerciais, resultados de campanha.
Novas tabelas: `catalog_products`, `sales_quotes`, `sales_quote_items`, `sales_orders`, `sales_order_items`,
`sales_targets`, `sales_regions`, `campaign_results`; todas com `is_synthetic`, `origin`, `batch`, `external_id`.

**Restrições**
- Telas criadas depois da carga: **Indicadores** (`/indicadores`), **Pedidos**, **Cotações**, **Produtos** e a **ficha 360 do cliente** (`/empresas/<id>`),
  todas no menu Vendas. Metas aparecem no gráfico de faturamento; ABC/RFM no painel e na ficha do cliente.
- Os dashboards atuais usam oportunidades, contratos, atividades, tarefas e tickets.
- O dashboard mede "Vendas (Mês)" pela data de hoje; como o histórico termina em 31/10/2026, o mês corrente mostra R$ 0.
- O Pipeline mostra no máximo os últimos 3 meses de oportunidades criadas.
- Não existe módulo de visitas (representadas como atividades do tipo `visit`), nem de regiões/metas na interface.

## B. Fontes de informação

| Dado | Situação | Fonte |
|---|---|---|
| Lovet atua no Pará e Amapá, sede em Ananindeua | Confirmado | [site da Lovet](https://www.lovetdistribuidora.com.br/) |
| Parceiros: Panelaço Pet, MegaNux, Elanco, Labovet, Vansil, Labyes | Confirmado (logos no site; o site não traz texto) | [site da Lovet](https://www.lovetdistribuidora.com.br/) |
| Lovet listada como distribuidora (linhas Pet e Grandes) | Confirmado | [Labovet — representantes](https://labovet.com.br/representantes) |
| "Referência em parasitários" | Confirmado (autodeclarado) | [Instagram da Lovet](https://www.instagram.com/lovetdistribuidora_/) |
| "Mais de 300 produtos" | Autodeclarado no site; **nenhum SKU listado** | [site da Lovet](https://www.lovetdistribuidora.com.br/) |
| Marcas Green Paws, Seven Pets, Mandala (Panelaço Pet) | Informado no briefing; não reverificado | briefing |
| Panelaço Pet, MegaNux, Elanco, Vansil, Labyes em páginas de terceiros | **Não encontrado** na busca | — |
| CNPJ | Divergência a conferir: site cita `/0001-28`; consulta pública lista filial `/0002-09` ([cnpjcheck](https://cnpjcheck.com.br/empresa/lovet-comercio-de-produtos-veterinarios-e-agropecuarios-ltda-lovet-distribuidora-30836204000209)) | — (nenhum CNPJ foi usado nos dados) |

**Pendente de validação:** todo o portfólio real. Nenhum produto foi confirmado.

**Premissas simuladas:** clientes, contatos, nomes, endereços, telefones (`550000…`, inválidos), e-mails
(`@cliente-sim.invalid`, `@lovet.invalid`), preços, descontos, volumes, frequências, metas, concorrentes
("hipotético"), motivos de perda, campanhas e resultados.

## C. Base populada

| Entidade | Faixa pedida | Criado | Rejeitado | Pendente |
|---|---:|---:|---:|---:|
| Empresas | ~500 | **500** | 0 | 0 |
| Contatos | 650–900 | **862** (1,72/empresa) | 0 | 0 |
| Produtos (catálogo) | — (ref. 355 SKUs) | **68 demonstrativos** | 0 | catálogo real inteiro |
| Usuários simulados (sem login) | — | **13** | 0 | 0 |
| Oportunidades | 800–1.200 | **1.016** (446 ganhas · 309 perdidas · 261 abertas) | 0 | 0 |
| Cotações / itens | 1.500–2.500 | **1.581** / 7.690 | 0 | 0 |
| Pedidos / itens | 1.800–3.000 | **2.361** / 11.448 | 0 | 0 |
| Contratos (pedidos originados de cotação) | — | **421** | 0 | 0 |
| Atividades | 8.000–12.000 | **11.218** | 0 | 0 |
| Tarefas | — | **629** | 0 | 0 |
| Ocorrências de atendimento | 150–300 | **245** | 0 | 0 |
| Campanhas / resultados | — | **8** / 8 | 0 | 0 |
| Metas demonstrativas | — | **156** (rep/mês e região/mês) | 0 | 0 |
| Leads de pré-venda, comissões, notas fiscais | — | 0 | — | não solicitado de forma específica |

Distribuição de clientes: **300 ativos · 100 prospects · 60 inativos/em risco · 40 perdidos/desqualificados**;
Pet shop 300 · Clínica 100 · Agropecuária 50 · Hospital 25 · Outros 25; PA 440 · AP 60.

**Catálogo:** os 68 SKUs são `SIM-001…SIM-068`, nomeados "SIMULADO — PRODUTO DE TESTE — NÃO COMERCIALIZAR",
sem princípio ativo, registro, dosagem, lote ou estoque; o fabricante/marca é associação **hipotética**
(sinalizada no campo `source`).

**Identificação em cada tabela:** empresas/contatos/oportunidades em `custom_fields` (`sintetico`, `origem`, `lote`,
`externalId`); atividades em `payload`; tarefas, ocorrências e campanhas pelo prefixo `[SIMULADO]`; contratos
`SIM-CT-*`; usuários `@lovet.invalid`; tabelas novas com colunas próprias.
**Idempotência:** rodar o script de novo não duplica nada (`--refazer` reverte só o lote e regrava; `--reverter` só remove).

## D. Histórico operacional (simulado)

| Mês | Pedidos | Faturamento simulado (R$) | Ticket médio (R$) | Clientes que compraram |
|---|---:|---:|---:|---:|
| 2025-11 | 216 | 615.273 | 2.848 | 199 |
| 2025-12 | 174 | 504.896 | 2.902 | 159 |
| 2026-01 | 217 | 644.814 | 2.971 | 189 |
| 2026-02 | 214 | 594.817 | 2.780 | 202 |
| 2026-03 | 179 | 482.241 | 2.694 | 167 |
| 2026-04 | 165 | 515.519 | 3.124 | 150 |
| 2026-05 | 172 | 508.810 | 2.958 | 160 |
| 2026-06 | 166 | 524.547 | 3.160 | 153 |
| 2026-07 | 191 | 530.920 | 2.780 | 174 |
| 2026-08 | 195 | 570.267 | 2.924 | 179 |
| 2026-09 | 174 | 472.762 | 2.717 | 161 |
| 2026-10 | 224 | 667.515 | 2.980 | 198 |
| **Total** | **2.287 (sem cancelados)** | **≈ 6,63 mi** | — | — |

- **Funil:** conversão das decididas **59,1%**; tempo médio até fechar (ganhas) **13,9 dias**. Cotações: 446 aprovadas,
  306 recusadas, 38 expiradas, 77 enviadas, 714 substituídas por revisão.
- **Perdas:** preço elevado (81), concorrência (44 + 8), sem retorno (40), falta de disponibilidade simulada (33),
  concentração em outro fornecedor (30), prazo (25), atendimento (23).
- **Pedidos:** 1.870 recompras diretas (clientes recorrentes) e 468 originados de cotação; 2.067 entregues,
  152 com ocorrência, 66 cancelados.
- **Clientes:** novos com compra concentrados de nov/25 a ago/26 (a janela de 1ª compra vai até fim de setembro);
  20 reativados após tentativas de recuperação; 60 inativos com 2–5 tentativas; 15 ex-clientes perdidos.
- **Atividades (11.218):** WhatsApp simulado 1.745, ligações 1.494, visitas 1.251, cotações enviadas 1.168,
  desfechos de etapa 755, e-mails 676, pós-venda 656, follow-up 603, negociações de preço 593, acompanhamento de pedidos 510,
  apresentações 490, recuperação 331, reuniões 305, pesquisa de satisfação 304, prospecção 175, trade 162.

## E. Análise gerencial (simulada)

**Por região** — Metropolitana 48,1% (R$ 3,19 mi, 179 clientes) · Nordeste 17,0% · Amapá 15,1% · Sudeste 10,5% · Oeste 9,4%.

**Por representante** (vendas R$ · clientes): Anderson Pinheiro 1,16 mi · 62; Marcos Vasconcelos 1,12 mi · 41 (maior ticket, 3.787);
Juliana Pantoja 1,09 mi · 60; Larissa Nascimento 1,00 mi · 51; Ricardo Tavares 0,95 mi · 57; Paulo Brasil 0,62 mi · 40;
Edson Lobato 0,37 mi · 34; Cláudia Furtado 0,32 mi · 29. (Telemarketing e Trade Marketing atuam em atividades, sem carteira de vendas.)

**Por segmento** — Pet shop R$ 4,77 mi (ticket 3.068) · Agropecuária 0,79 mi (3.972) · Hospital 0,58 mi (4.869) · Clínica 0,44 mi (1.310) · Outros 0,05 mi.

**Categorias** — Alimentação cães 29,9% · Antiparasitários 23,2% · Alimentação gatos 14,8% · Medicamentos 10,8% · Higiene 8,9% ·
Grande porte 6,5% · Clínicas/hospitais 5,8%. (Marcas são fictícias: "Linha simulada" 55,2%; Green Paws 20,6%; Seven Pets 12,1%; Mandala 12,1%.)

**Curva ABC** (374 clientes com compra): A 121 clientes = R$ 5,30 mi (80%); B 138 = 1,00 mi; C 115 = 0,33 mi.
**RFM:** Fiel 86 · Em desenvolvimento 79 · Estratégico 67 · Inativo 66 · Em risco 52 · Promissor 24.
**Oportunidades de expansão:** 68 clientes com potencial de venda cruzada (poucas categorias compradas); 19 ativos sem contato desde 01/09/2026.
A "propensão de recompra" é uma regra simples sobre dados sintéticos (campo `propensaoRecompraSimulada`) — **não** é comportamento observado.

**Meta x realizado (representantes de campo):** atingimento mensal entre 89,2% e 100,2% (metas derivadas do realizado com variação).

**Campanhas** (resultado atribuído hipoteticamente, sem envio real): maior alcance — Antiparasitários (260), Lançamento de linha de teste (260),
Incentivo à recompra (260); maior venda simulada atribuída — Lançamento de linha de teste (R$ 277 mil). Destinatários gravados como `skipped`.

**Atendimento:** 245 ocorrências (154 resolvidas, 90 encerradas, 1 em andamento); atraso de entrega (56), troca/devolução (39),
pedido incompleto (28), divergência na cotação (27), dúvida comercial (27).

## F. Problemas identificados

1. **Auditoria revelou e corrigimos 4 incoerências do gerador** (pedido antes da aprovação da cotação; cotação decidida antes de emitida;
   atividade antes do cadastro; inativo sem histórico) e 1 bug de permissão do banco (`crm_app` sem `SELECT` em `shared`). Todas corrigidas e reauditadas.
2. **Pipeline com 4 etapas:** o funil de 13 etapas pedido foi registrado em `custom_fields.etapaDetalhada` e no histórico de atividades;
   no quadro, "Cobrança enviada" abriga propostas/negociação.
3. **Dados preexistentes misturados:** 8 empresas, 9 oportunidades e 47 atividades do `db:seed` original permanecem (preservados por regra) e aparecem junto no pipeline.
4. **Motivos de perda:** para clientes inativos, o motivo do cliente (ex.: "Queda de frequência") foi reutilizado como motivo de perda de oportunidades.
5. **Lacunas de campo:** não há campos próprios para ABC/RFM/propensão (ficam em `custom_fields`); nenhum campo de região comercial nativo em empresas.
6. **Desempenho:** em modo de desenvolvimento, a 1ª abertura de Dashboard/Tarefas/Contratos levou 17–40 s (compilação + volume); depois, ~3 s.
7. **Horários:** timestamps são gravados em UTC pelo Drizzle (como o resto do app).
8. **Catálogo:** nenhum SKU real confirmado; "mais de 300 produtos" do site não é verificável.

## G. Validação

**Totalmente concluída** (inserida no CRM e conferida por SQL; não há registros só "em memória").
Nenhum registro foi rejeitado. Navegação testada como gerente comercial: login, Dashboard, Clientes (508 na base), Pipeline (207 abertas na janela),
e 24 rotas respondendo 200 antes da carga; filtros por vendedor/origem/situação no Pipeline disponíveis. **Não** foram testados fluxos de escrita na interface nem
relatórios em PDF/Excel.

## H. Recomendações

- **Modelo de dados:** promover região comercial, status do cliente, ABC/RFM e etapa detalhada a colunas; criar telas para catálogo, cotações, pedidos e metas;
  alinhar as etapas do pipeline às do negócio (13 etapas) em vez de usar texto livre.
- **Fluxo de vendas:** gerar pedido a partir de cotação aprovada no próprio CRM; registrar visitas como módulo (agenda de rota).
- **Carteira:** painel de clientes em risco (RFM) e fila de recuperação; alerta de recompra por intervalo médio por cliente.
- **Representantes:** metas por rep/mês com acompanhamento realizado x meta; balancear carteiras (hoje a Região Metropolitana concentra 48%).
- **Indicadores:** dashboard por período arbitrário (hoje ancorado em "hoje") e fatiamento por região/segmento/categoria.
- **Automação/inteligência:** previsão de recompra com modelo validado em dados reais, cross-sell por afinidade de categoria.
- **Dados reais:** importar o catálogo oficial com fonte e data de validação; só então substituir os produtos `SIM-*`.

---

### Como reproduzir / auditar

```bash
# a partir de apps/crm, com DATABASE_URL de um banco LOCAL
npx tsx scripts/povoar-demo-lovet.ts --dry        # gera e imprime estatísticas, sem gravar
npx tsx scripts/povoar-demo-lovet.ts              # grava (aborta se o lote já existe)
npx tsx scripts/povoar-demo-lovet.ts --refazer    # reverte só o lote e regrava
npx tsx scripts/povoar-demo-lovet.ts --reverter   # remove somente o lote

docker exec -i lovet-postgres psql -U admin -d lovet -At -F '|' < apps/crm/scripts/auditar-demo-lovet.sql
docker exec -i lovet-postgres psql -U admin -d lovet -P pager=off < apps/crm/scripts/indicadores-demo-lovet.sql
```
