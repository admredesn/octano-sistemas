-- MULTA E JUROS POR ATRASO DA FATURA (02/11/2026)
-- Ronan: "a partir desse mês vamos cobrar multa e juros para quem atrasar os pagamentos, pode colocar no cadastro de
-- todos calculando multa e juros, como é praticado no mercado".
-- Regra (mercado / banco): multa % do saldo UMA vez + juros de mora % ao mês proporcional aos dias (mês = 30), do dia
-- seguinte ao vencimento; vencimento em fim de semana/feriado pago no dia útil seguinte = sem encargo.
-- Taxa do cliente (vazio = padrão do posto em Parâmetros › Cobrança; 0 = não cobra). Rodado em 02/11/2026.
alter table oct_pessoas add column if not exists multa_atraso_pct numeric;
alter table oct_pessoas add column if not exists juros_atraso_mes_pct numeric;
comment on column oct_pessoas.multa_atraso_pct is 'Multa por atraso da fatura (%) deste cliente; NULL = padrão do posto (Parâmetros › Cobrança). 02/11/2026';
comment on column oct_pessoas.juros_atraso_mes_pct is 'Juros de mora (% ao mês, pro rata die) deste cliente; NULL = padrão do posto. 02/11/2026';
notify pgrst, 'reload schema';

-- Padrão de TODOS os postos (2% + 1% ao mês, só fatura que vence a partir de 01/11/2026) — gravado na publicação da
-- noite de 02/11/2026, depois do gateway e do servidor saberem o "desde":
-- insert into oct_parametros (empresa_id, chave, valor, atualizado_por)
-- select e.id, k.chave, to_jsonb(k.valor), 'Ronan (chat 02/11/2026)'
--   from oct_empresas e cross join (values ('cobranca_multa_pct', '2'), ('cobranca_juros_mes_pct', '1'),
--                                          ('cobranca_encargos_desde', '2026-11-01')) k(chave, valor)
--  where e.nome not ilike '%BANCADA%'
-- on conflict (empresa_id, chave) do update set valor = excluded.valor, atualizado_em = now(), atualizado_por = excluded.atualizado_por;
