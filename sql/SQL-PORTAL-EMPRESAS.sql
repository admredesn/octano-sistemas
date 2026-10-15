-- ============================================================
-- PORTAL EMPRESAS (web) — empresas com frota acompanham placas, consumo, faturas, Pix e boleto
-- ------------------------------------------------------------
-- 14/10/2026 (pedido do Ronan). Acesso: só o FINANCEIRO da empresa (colaborador marcado "vê as faturas")
-- e só quando a empresa está com o portal ligado na ficha do cliente (retaguarda).
--   oct_pessoas.portal_empresas      liga o portal para a empresa; liga também a regra "placa que não está na lista
--                                    não abastece a prazo para esta empresa" (PDV)
--   oct_frota_veiculos               ganha quem cadastrou e quem desativou
--   oct_placas_bloqueadas            ganha origem (posto | empresa): a empresa só reativa o que ela mesma desativou
--   oct_boletos                      pedido de NOVO boleto pelo portal: valor (com multa e juros), vencimento (hoje),
--                                    o boleto que ele substitui e a taxa usada
--   oct_portal_empresas_log          trilha: quem fez o quê no portal
-- Multa e juros por atraso: parâmetros do posto em Parâmetros › Cobrança (cobranca_multa_pct, cobranca_juros_mes_pct).
-- Rodar no SQL Editor do Supabase. Pode rodar de novo.
-- ============================================================

alter table oct_pessoas add column if not exists portal_empresas boolean not null default false;
alter table oct_pessoas add column if not exists portal_empresas_em timestamptz;
comment on column oct_pessoas.portal_empresas is 'Empresa com acesso ao Portal Empresas (web) e com a regra de placa cadastrada no caixa';

alter table oct_frota_veiculos add column if not exists criado_por text;
alter table oct_frota_veiculos add column if not exists desativado_em timestamptz;
alter table oct_frota_veiculos add column if not exists desativado_por text;
create index if not exists ix_frota_pessoa_ativo on oct_frota_veiculos (pessoa_id) where ativo;

alter table oct_placas_bloqueadas add column if not exists origem text not null default 'posto';
alter table oct_placas_bloqueadas add column if not exists pessoa_id uuid;
create index if not exists ix_placas_bloq_pessoa on oct_placas_bloqueadas (pessoa_id) where pessoa_id is not null;
comment on column oct_placas_bloqueadas.origem is 'posto = bloqueio do posto (a empresa não libera) | empresa = a empresa desativou pelo portal';

alter table oct_boletos add column if not exists valor_emitir numeric(12,2);
alter table oct_boletos add column if not exists vencimento_emitir date;
alter table oct_boletos add column if not exists multa_pct numeric(6,3);
alter table oct_boletos add column if not exists juros_mes_pct numeric(6,3);
alter table oct_boletos add column if not exists substitui_nosso_numero text;
alter table oct_boletos add column if not exists origem text;
comment on column oct_boletos.valor_emitir is 'Valor a registrar quando diferente do líquido da fatura (novo boleto com multa e juros pelo portal)';

create table if not exists oct_portal_empresas_log (
  id           bigserial primary key,
  pessoa_id    uuid not null,            -- a empresa
  cpf_mascara  text,
  acao         text not null,            -- placa_nova | placa_ativa | placa_desativa | placas_importar | pix | boleto | exporta
  detalhe      jsonb,
  criado_em    timestamptz not null default now()
);
create index if not exists ix_portal_log_pessoa on oct_portal_empresas_log (pessoa_id, criado_em desc);
alter table oct_portal_empresas_log enable row level security;   -- só o servidor (chave de serviço) grava e lê

-- ---------- boleto com multa e juros: a baixa separa principal de encargo ----------
-- O boleto novo do portal vem com o valor da fatura + multa e juros do atraso. Na baixa, o PRINCIPAL é limitado ao que
-- falta da fatura e o que passou disso vira juros do recebimento (antes, tudo ia como principal e o encargo parecia
-- "valor a mais" ou "desconto"). Pagou a menos que o principal = abatimento dado no banco. Nada muda para boleto sem encargo.
create or replace function oct_boleto_lancar_baixa(p_boleto bigint)
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  b       oct_boletos%rowtype;
  f       oct_faturas%rowtype;
  v_liq   numeric;
  v_rec   numeric;
  v_falta numeric;
  v_princ numeric;
  v_pago  numeric;
  v_dia   date;
begin
  select * into b from oct_boletos where id = p_boleto;
  if not found or b.fatura_id is null or b.status <> 'liquidado' then
    return 'ignorado';
  end if;
  if exists (select 1 from oct_recebimentos_titulo where boleto_id = b.id) then
    return 'ja lancado';
  end if;

  select * into f from oct_faturas where id = b.fatura_id for update;
  if not found then return 'sem fatura'; end if;

  v_liq := coalesce(f.valor_liquido, f.valor - coalesce(f.desconto, 0) + coalesce(f.acrescimo, 0));
  select coalesce(sum(valor), 0) into v_rec from oct_recebimentos_titulo where fatura_id = f.id;
  if f.status = 'liquidada' or v_rec + 0.005 >= v_liq then
    return 'fatura ja quitada';
  end if;

  v_falta := round(v_liq - v_rec, 2);
  v_princ := least(b.valor, v_falta);                 -- o que do boleto e' PRINCIPAL da fatura
  v_pago  := coalesce(b.valor_pago, b.valor);
  v_dia   := coalesce(b.pago_em, b.credito_em, current_date);

  insert into oct_recebimentos_titulo
    (empresa_id, fatura_id, boleto_id, valor, juros, desconto, forma, data_recebimento,
     autor, cliente_id, cliente_nome, origem)
  values
    (b.empresa_id, b.fatura_id, b.id, least(v_pago, v_princ),
     greatest(round(v_pago - v_princ, 2), 0), greatest(round(v_princ - v_pago, 2), 0),
     'Boleto', v_dia,
     'Sicoob (automático) - boleto ' || coalesce(b.nosso_numero, b.id::text),
     b.cliente_id, b.cliente_nome, 'boleto');

  -- quita se o principal do boleto cobria o que faltava (o banco aceitou o título como pago)
  if v_rec + v_princ + 0.005 >= v_liq then
    update oct_faturas
       set status = 'liquidada',
           liquidado_em = (v_dia::text || 'T12:00:00-03:00')::timestamptz,
           forma_liquidacao = 'Boleto'
     where id = f.id;
    return 'fatura liquidada';
  end if;
  return 'recebimento parcial';
end;
$$;
revoke all on function oct_boleto_lancar_baixa(bigint) from public, anon, authenticated;

select (select count(*) from information_schema.columns where table_name = 'oct_pessoas' and column_name = 'portal_empresas') as pessoas,
       (select count(*) from information_schema.columns where table_name = 'oct_boletos' and column_name in ('valor_emitir','vencimento_emitir','multa_pct','juros_mes_pct','substitui_nosso_numero','origem')) as boletos_6,
       (select count(*) from information_schema.tables where table_name = 'oct_portal_empresas_log') as log;
