-- Auditoria pós-carga do lote LOVET_DEMO_2025_11_2026_10_V1.
-- Uso: docker exec -i lovet-postgres psql -U admin -d lovet -At -F '|' < apps/crm/scripts/auditar-demo-lovet.sql
-- Cada linha: [grupo]|verificação|valor   (nas verificações de problema, esperado = 0)

\set L '''LOVET_DEMO_2025_11_2026_10_V1'''
\set S '''2025-11-01'''
\set E '''2026-11-01'''

-- ── Integridade: quantidades ──────────────────────────────────────────────
select 'INTEGRIDADE','empresas', count(*) from crm.companies where custom_fields->>'lote' = :L;
select 'INTEGRIDADE','contatos', count(*) from crm.contacts where custom_fields->>'lote' = :L;
select 'INTEGRIDADE','produtos', count(*) from crm.catalog_products where batch = :L;
select 'INTEGRIDADE','usuarios_simulados', count(*) from crm.users where email like '%@lovet.invalid';
select 'INTEGRIDADE','oportunidades', count(*) from crm.opportunities where custom_fields->>'lote' = :L;
select 'INTEGRIDADE','cotacoes', count(*) from crm.sales_quotes where batch = :L;
select 'INTEGRIDADE','itens_cotacao', count(*) from crm.sales_quote_items where batch = :L;
select 'INTEGRIDADE','pedidos', count(*) from crm.sales_orders where batch = :L;
select 'INTEGRIDADE','itens_pedido', count(*) from crm.sales_order_items where batch = :L;
select 'INTEGRIDADE','atividades', count(*) from crm.activities where payload->>'lote' = :L;
select 'INTEGRIDADE','tarefas', count(*) from crm.tasks where title like '[SIMULADO]%';
select 'INTEGRIDADE','ocorrencias', count(*) from crm.tickets where subject like '[SIMULADO]%';
select 'INTEGRIDADE','campanhas', count(*) from crm.campaigns where name like '[SIMULADO]%';
select 'INTEGRIDADE','metas', count(*) from crm.sales_targets where batch = :L;
select 'INTEGRIDADE','contratos_sim', count(*) from crm.contracts where number like 'SIM-CT-%';

-- ── Marcação de simulação (esperado 0) ────────────────────────────────────
select 'MARCACAO','empresas_sem_marca', count(*) from crm.companies where custom_fields->>'lote' = :L and (custom_fields->>'origem') is distinct from 'SIMULACAO_IA';
select 'MARCACAO','pedidos_sem_flag', count(*) from crm.sales_orders where batch = :L and not is_synthetic;
select 'MARCACAO','produtos_sem_flag', count(*) from crm.catalog_products where batch = :L and not is_synthetic;
select 'MARCACAO','linhas_sem_id_externo', (select count(*) from crm.sales_orders where batch = :L and external_id is null) + (select count(*) from crm.sales_quotes where batch = :L and external_id is null);

-- ── Relacionamentos (esperado 0) ──────────────────────────────────────────
select 'RELACIONAMENTO','contatos_sem_empresa', count(*) from crm.contacts c where c.custom_fields->>'lote' = :L and (c.company_id is null or not exists (select 1 from crm.companies x where x.id = c.company_id));
select 'RELACIONAMENTO','pedidos_sem_cliente', count(*) from crm.sales_orders o where o.batch = :L and not exists (select 1 from crm.companies x where x.id = o.company_id);
select 'RELACIONAMENTO','pedidos_sem_itens', count(*) from crm.sales_orders o where o.batch = :L and not exists (select 1 from crm.sales_order_items i where i.order_id = o.id);
select 'RELACIONAMENTO','cotacoes_sem_itens', count(*) from crm.sales_quotes q where q.batch = :L and not exists (select 1 from crm.sales_quote_items i where i.quote_id = q.id);
select 'RELACIONAMENTO','oportunidades_sem_responsavel', count(*) from crm.opportunities where custom_fields->>'lote' = :L and owner_id is null;
select 'RELACIONAMENTO','oportunidades_sem_cliente', count(*) from crm.opportunities where custom_fields->>'lote' = :L and company_id is null;
select 'RELACIONAMENTO','atividades_sem_vinculo', count(*) from crm.activities a where a.payload->>'lote' = :L and not ((a.related_to_type = 'opportunity' and exists (select 1 from crm.opportunities o where o.id = a.related_to_id)) or (a.related_to_type = 'company' and exists (select 1 from crm.companies c where c.id = a.related_to_id)));
select 'RELACIONAMENTO','produtos_sem_categoria', count(*) from crm.catalog_products where batch = :L and (category is null or category = '');
select 'RELACIONAMENTO','clientes_sem_responsavel', count(*) from crm.companies where custom_fields->>'lote' = :L and owner_id is null;
select 'RELACIONAMENTO','clientes_duplicados_por_nome', count(*) from (select name from crm.companies where custom_fields->>'lote' = :L group by name having count(*) > 1) t;
select 'RELACIONAMENTO','contato_de_outra_empresa_no_pedido', count(*) from crm.sales_orders o join crm.contacts c on c.id = o.contact_id where o.batch = :L and c.company_id <> o.company_id;
select 'RELACIONAMENTO','contato_de_outra_empresa_na_opp', count(*) from crm.opportunities o join crm.contacts c on c.id = o.primary_contact_id where o.custom_fields->>'lote' = :L and c.company_id <> o.company_id;
select 'RELACIONAMENTO','pedido_cotacao_de_outro_cliente', count(*) from crm.sales_orders o join crm.sales_quotes q on q.id = o.quote_id where o.batch = :L and q.company_id <> o.company_id;
select 'RELACIONAMENTO','itens_de_produto_inexistente', (select count(*) from crm.sales_order_items i where i.batch = :L and not exists (select 1 from crm.catalog_products p where p.id = i.product_id));

-- ── Coerência (esperado 0) ────────────────────────────────────────────────
select 'COERENCIA','atividades_fora_do_periodo', count(*) from crm.activities where payload->>'lote' = :L and (created_at < :S::timestamp or created_at >= :E::timestamp);
select 'COERENCIA','pedidos_fora_do_periodo', count(*) from crm.sales_orders where batch = :L and (ordered_at < :S::timestamp or ordered_at >= :E::timestamp);
select 'COERENCIA','cotacoes_fora_do_periodo', count(*) from crm.sales_quotes where batch = :L and (issued_at < :S::timestamp or issued_at >= :E::timestamp);
select 'COERENCIA','oportunidades_criadas_fora_do_periodo', count(*) from crm.opportunities where custom_fields->>'lote' = :L and (created_at < :S::timestamp or created_at >= :E::timestamp);
select 'COERENCIA','pedido_antes_da_aprovacao_da_cotacao', count(*) from crm.sales_orders o join crm.sales_quotes q on q.id = o.quote_id where o.batch = :L and o.ordered_at < q.decided_at;
select 'COERENCIA','pedido_antes_da_abertura_da_opp', count(*) from crm.sales_orders o join crm.opportunities p on p.id = o.opportunity_id where o.batch = :L and o.ordered_at < p.created_at;
select 'COERENCIA','venda_ganha_sem_pedido', count(*) from crm.opportunities p where p.custom_fields->>'lote' = :L and p.status = 'won' and not exists (select 1 from crm.sales_orders o where o.opportunity_id = p.id);
select 'COERENCIA','cotacao_decidida_antes_da_emissao', count(*) from crm.sales_quotes where batch = :L and decided_at < issued_at;
select 'COERENCIA','ganha_fechada_antes_de_criada', count(*) from crm.opportunities where custom_fields->>'lote' = :L and closed_at < created_at;
select 'COERENCIA','aberta_com_data_de_fechamento', count(*) from crm.opportunities where custom_fields->>'lote' = :L and status = 'open' and closed_at is not null;
select 'COERENCIA','ganha_sem_cotacao_aprovada', count(*) from crm.opportunities p where p.custom_fields->>'lote' = :L and p.status = 'won' and not exists (select 1 from crm.sales_quotes q where q.opportunity_id = p.id and q.status = 'aprovada');
select 'COERENCIA','perdida_sem_motivo', count(*) from crm.opportunities where custom_fields->>'lote' = :L and status = 'lost' and lost_reason is null;
select 'COERENCIA','total_pedido_diverge_dos_itens', count(*) from crm.sales_orders o where o.batch = :L and abs(o.total - (select coalesce(sum(total),0) from crm.sales_order_items i where i.order_id = o.id)) > 0.05;
select 'COERENCIA','total_cotacao_diverge_dos_itens', count(*) from crm.sales_quotes q where q.batch = :L and abs(q.total - (select coalesce(sum(total),0) from crm.sales_quote_items i where i.quote_id = q.id)) > 0.05;
select 'COERENCIA','subtotal_menos_desconto_diverge_total', (select count(*) from crm.sales_orders where batch = :L and abs(subtotal - discount_total - total) > 0.05);
select 'COERENCIA','item_pedido_conta_errada', count(*) from crm.sales_order_items where batch = :L and abs(qty * unit_price * (1 - discount_pct/100) - total) > 0.02;
select 'COERENCIA','entregue_sem_data_de_entrega_antiga', count(*) from crm.sales_orders where batch = :L and status = 'entregue' and delivered_at is null and ordered_at < '2026-10-20';
select 'COERENCIA','entrega_antes_do_pedido', count(*) from crm.sales_orders where batch = :L and delivered_at < ordered_at;
select 'COERENCIA','cliente_comprando_antes_do_cadastro', count(*) from crm.sales_orders o join crm.companies c on c.id = o.company_id where o.batch = :L and o.ordered_at < c.created_at;
select 'COERENCIA','atividade_antes_do_cadastro_do_cliente', count(*) from crm.activities a join crm.companies c on c.id = (a.payload->>'companyId')::uuid where a.payload->>'lote' = :L and a.created_at < c.created_at;
select 'COERENCIA','contato_criado_antes_da_empresa', count(*) from crm.contacts t join crm.companies c on c.id = t.company_id where t.custom_fields->>'lote' = :L and t.created_at < c.created_at;
select 'COERENCIA','prospect_com_pedido', count(*) from crm.companies c where c.custom_fields->>'lote' = :L and c.custom_fields->>'status' = 'Prospect' and exists (select 1 from crm.sales_orders o where o.company_id = c.id);
select 'COERENCIA','ativo_sem_pedido', count(*) from crm.companies c where c.custom_fields->>'lote' = :L and c.custom_fields->>'status' = 'Ativo' and not exists (select 1 from crm.sales_orders o where o.company_id = c.id);
select 'COERENCIA','inativo_sem_historico_anterior', count(*) from crm.companies c where c.custom_fields->>'lote' = :L and c.custom_fields->>'status' = 'Inativo/em risco' and (select count(*) from crm.sales_orders o where o.company_id = c.id) < 2;
select 'COERENCIA','reativado_sem_tentativas', count(*) from crm.companies c where c.custom_fields->>'lote' = :L and c.custom_fields->>'subtipo' = 'reativado' and not exists (select 1 from crm.activities a where a.related_to_id = c.id and a.type = 'recovery');
select 'COERENCIA','pedido_cancelado_com_contrato', count(*) from crm.sales_orders o join crm.contracts k on k.opportunity_id = o.opportunity_id where o.batch = :L and o.status = 'cancelado';
select 'COERENCIA','vendedor_incompativel_com_regiao', count(*) from crm.companies c join crm.workspace_members m on m.user_id = c.owner_id where c.custom_fields->>'lote' = :L and m.equipe <> c.custom_fields->>'regiaoComercial';
select 'COERENCIA','contratos_sem_oportunidade', count(*) from crm.contracts k where k.number like 'SIM-CT-%' and not exists (select 1 from crm.opportunities o where o.id = k.opportunity_id);
select 'COERENCIA','campanha_nao_concluida_ou_com_envio_pendente', count(*) from crm.campaigns c where c.name like '[SIMULADO]%' and (c.status <> 'done' or exists (select 1 from crm.campaign_recipients r where r.campaign_id = c.id and r.status <> 'skipped'));

-- ── Distribuições para conferência ────────────────────────────────────────
select 'DIST','empresas_por_status', custom_fields->>'status', count(*) from crm.companies where custom_fields->>'lote' = :L group by 3 order by 4 desc;
select 'DIST','empresas_por_segmento', industry, count(*) from crm.companies where custom_fields->>'lote' = :L group by 3 order by 4 desc;
select 'DIST','empresas_por_uf', custom_fields->>'uf', count(*) from crm.companies where custom_fields->>'lote' = :L group by 3 order by 4 desc;
select 'DIST','opps_por_status', status, count(*) from crm.opportunities where custom_fields->>'lote' = :L group by 3 order by 4 desc;
select 'DIST','cotacoes_por_status', status, count(*) from crm.sales_quotes where batch = :L group by 3 order by 4 desc;
select 'DIST','pedidos_por_status', status, count(*) from crm.sales_orders where batch = :L group by 3 order by 4 desc;
select 'DIST','pedidos_por_canal', channel, count(*) from crm.sales_orders where batch = :L group by 3 order by 4 desc;
