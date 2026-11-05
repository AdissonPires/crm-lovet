-- Indicadores gerenciais SIMULADOS do lote LOVET_DEMO_2025_11_2026_10_V1.
-- Todos os valores são fictícios e NÃO representam faturamento contábil da Lovet.
-- Uso: docker exec -i lovet-postgres psql -U admin -d lovet -P pager=off < apps/crm/scripts/indicadores-demo-lovet.sql
\set L '''LOVET_DEMO_2025_11_2026_10_V1'''

\echo '== 1. Evolução mensal (pedidos não cancelados) =='
select to_char(ordered_at,'YYYY-MM') mes, count(*) pedidos, round(sum(total)) faturamento_simulado, round(avg(total)) ticket_medio,
       count(distinct company_id) clientes_que_compraram
from crm.sales_orders where batch = :L and status <> 'cancelado' group by 1 order by 1;

\echo '== 2. Clientes novos / reativados / perdidos por mês (cadastro, 1ª compra) =='
select to_char(created_at,'YYYY-MM') mes, count(*) filter (where custom_fields->>'carteiraInicial'='false' and custom_fields->>'primeiraCompra' is not null) novos_clientes_com_compra,
       count(*) filter (where custom_fields->>'status'='Prospect') prospects_cadastrados
from crm.companies where custom_fields->>'lote' = :L group by 1 order by 1;

\echo '== 3. Vendas por representante (simulado) =='
select u.name representante, m.equipe, count(*) pedidos, round(sum(o.total)) vendas, round(avg(o.total)) ticket_medio, count(distinct o.company_id) clientes
from crm.sales_orders o join crm.users u on u.id = o.owner_id join crm.workspace_members m on m.user_id = u.id
where o.batch = :L and o.status <> 'cancelado' group by 1,2 order by 4 desc;

\echo '== 4. Vendas por região =='
select c.custom_fields->>'regiaoComercial' regiao, count(*) pedidos, round(sum(o.total)) vendas, count(distinct o.company_id) clientes, round(sum(o.total)*100.0/sum(sum(o.total)) over (),1) pct
from crm.sales_orders o join crm.companies c on c.id = o.company_id where o.batch = :L and o.status <> 'cancelado' group by 1 order by 3 desc;

\echo '== 5. Vendas por segmento =='
select c.industry segmento, count(*) pedidos, round(sum(o.total)) vendas, round(avg(o.total)) ticket_medio
from crm.sales_orders o join crm.companies c on c.id = o.company_id where o.batch = :L and o.status <> 'cancelado' group by 1 order by 3 desc;

\echo '== 6. Categorias e marcas (participação em valor) =='
select p.category categoria, round(sum(i.total)) vendas, round(sum(i.total)*100.0/sum(sum(i.total)) over (),1) pct
from crm.sales_order_items i join crm.catalog_products p on p.id = i.product_id join crm.sales_orders o on o.id = i.order_id
where o.batch = :L and o.status <> 'cancelado' group by 1 order by 2 desc;
select p.brand marca, round(sum(i.total)) vendas, round(sum(i.total)*100.0/sum(sum(i.total)) over (),1) pct
from crm.sales_order_items i join crm.catalog_products p on p.id = i.product_id join crm.sales_orders o on o.id = i.order_id
where o.batch = :L and o.status <> 'cancelado' group by 1 order by 2 desc;

\echo '== 7. Produtos mais cotados x mais vendidos (top 5) =='
select 'cotado' tipo, p.sku, p.category, count(*) qtd from crm.sales_quote_items i join crm.catalog_products p on p.id = i.product_id where i.batch = :L group by 2,3 order by 4 desc limit 5;
select 'vendido' tipo, p.sku, p.category, round(sum(i.total)) valor from crm.sales_order_items i join crm.catalog_products p on p.id = i.product_id where i.batch = :L group by 2,3 order by 4 desc limit 5;

\echo '== 8. Funil e conversão =='
select status, count(*) opps, round(sum(amount)) valor from crm.opportunities where custom_fields->>'lote' = :L group by 1 order by 1;
select round(100.0 * count(*) filter (where status='won') / nullif(count(*) filter (where status in ('won','lost')),0),1) taxa_conversao_decididas_pct,
       round(avg(extract(epoch from closed_at - created_at)/86400) filter (where status='won'),1) dias_medios_ate_fechar_ganhas
from crm.opportunities where custom_fields->>'lote' = :L;
select status, count(*) cotacoes from crm.sales_quotes where batch = :L group by 1 order by 2 desc;
select lost_reason motivo, count(*) from crm.opportunities where custom_fields->>'lote' = :L and status='lost' group by 1 order by 2 desc;

\echo '== 9. ABC e RFM =='
select custom_fields->>'classificacaoABC' abc, count(*) clientes, round(sum((custom_fields->>'totalComprasSimulado')::numeric)) valor from crm.companies where custom_fields->>'lote' = :L and custom_fields->>'classificacaoABC' is not null group by 1 order by 1;
select custom_fields->'rfm'->>'segmento' segmento_rfm, count(*) from crm.companies where custom_fields->>'lote' = :L and custom_fields->'rfm' is not null and custom_fields->>'rfm' <> 'null' group by 1 order by 2 desc;
select custom_fields->>'perfilCompra' perfil, count(*) from crm.companies where custom_fields->>'lote' = :L group by 1 order by 2 desc;

\echo '== 10. Top 10 clientes (valor simulado) e expansão =='
select name, custom_fields->>'uf' uf, custom_fields->>'classificacaoABC' abc, (custom_fields->>'totalComprasSimulado')::numeric total, custom_fields->>'pedidos' pedidos
from crm.companies where custom_fields->>'lote' = :L order by (custom_fields->>'totalComprasSimulado')::numeric desc nulls last limit 10;
select count(*) clientes_com_potencial_de_cross_selling from crm.companies where custom_fields->>'lote' = :L and custom_fields->>'potencialCrescimento' like 'Ampliar%';

\echo '== 11. Realizado x meta demonstrativa (total por mês) =='
select t.month, round(sum(t.target_amount)) meta, round(coalesce(sum(r.v),0)) realizado, round(100.0*coalesce(sum(r.v),0)/nullif(sum(t.target_amount),0),1) atingimento_pct
from crm.sales_targets t left join lateral (select sum(o.total) v from crm.sales_orders o where o.batch = :L and o.status <> 'cancelado' and o.owner_id = t.user_id and to_char(o.ordered_at,'YYYY-MM') = t.month) r on true
where t.batch = :L and t.user_id is not null group by 1 order by 1;

\echo '== 12. Campanhas =='
select c.name, r.clients_reached alcancados, r.opportunities_generated opps, r.quotes_generated cotacoes, round(r.simulated_sales) vendas_simuladas, r.rating
from crm.campaign_results r join crm.campaigns c on c.id = r.campaign_id where r.batch = :L order by r.period_start;

\echo '== 13. Atendimento =='
select status, count(*) from crm.tickets where subject like '[SIMULADO]%' group by 1 order by 2 desc;
select replace(subject,'[SIMULADO] ','') categoria, count(*) from crm.tickets where subject like '[SIMULADO]%' group by 1 order by 2 desc;

\echo '== 14. Atividades por tipo e por responsável (top) =='
select type, count(*) from crm.activities where payload->>'lote' = :L group by 1 order by 2 desc;
select u.name, count(*) atividades from crm.activities a join crm.users u on u.id = a.actor_id where a.payload->>'lote' = :L group by 1 order by 2 desc limit 8;

\echo '== 15. Clientes sem contato recente (>60 dias) entre ativos =='
select count(*) from crm.companies c where c.custom_fields->>'lote' = :L and c.custom_fields->>'status' = 'Ativo'
 and not exists (select 1 from crm.activities a where a.payload->>'companyId' = c.id::text and a.created_at > '2026-09-01');
