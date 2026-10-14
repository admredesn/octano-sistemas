-- ============================================================
-- CLIENTE NOVO ENTRA SOZINHO NA TABELA A PRAZO (14/10/2026, pedido do Ronan)
-- ------------------------------------------------------------
-- Antes: o vinculo cliente x tabela de preco era feito a mao (ou por script). Cliente cadastrado depois
-- de 14/10 ficava sem a tabela "CLIENTE A PRAZO" (bomba + R$ 0,50 na Nota a Prazo) e sem 'aceita nota a prazo'
-- (o padrao da coluna e' false).
--
-- Agora: cada empresa pode ter UMA tabela marcada como "padrao dos clientes novos". Cadastrou um cliente
-- (tipo cliente/ambos ou classificacao 'cliente'), em QUALQUER tela (PDV, retaguarda, importacao, app):
--   1) BEFORE INSERT: aceita_nota_prazo vira true (so' se a empresa tem tabela padrao);
--   2) AFTER INSERT/UPDATE: o vinculo com a tabela padrao e' criado na hora, se o cliente ainda nao tem tabela.
-- Quem tem OUTRA tabela (ex.: Bread Life) nao e' tocado. Cliente com credito_bloqueado segue bloqueado
-- (o bloqueio e' outro campo). Empresa SEM tabela padrao: nada muda (AC, Tijuco, Seven, Gloria).
--
-- Rodar UMA vez no SQL Editor do Supabase. Idempotente. Reversao no fim.
-- ============================================================

-- 1) a marca "tabela padrao dos clientes novos" (no maximo uma por empresa)
alter table oct_tabelas_preco add column if not exists padrao_cliente_novo boolean not null default false;
create unique index if not exists oct_tabelas_preco_padrao_uq
  on oct_tabelas_preco (empresa_id) where padrao_cliente_novo;

-- Florestal: a "CLIENTE A PRAZO" (bomba + R$ 0,50 so' na forma Nota a Prazo)
update oct_tabelas_preco
   set padrao_cliente_novo = true
 where empresa_id = '3f37007b-421d-40fa-b95f-74c8654a38f4'
   and nome = 'CLIENTE A PRAZO'
   and ativo;

-- 2) antes de gravar o cliente novo: liberar a prazo
create or replace function public.oct_pessoa_prazo_padrao_antes() returns trigger
language plpgsql as $$
begin
  if (new.tipo in ('cliente', 'ambos') or 'cliente' = any (coalesce(new.classificacoes, '{}'::text[])))
     and coalesce(new.aceita_nota_prazo, false) = false
     and exists (select 1 from public.oct_tabelas_preco t
                  where t.empresa_id = new.empresa_id and t.padrao_cliente_novo and t.ativo)
  then
    new.aceita_nota_prazo := true;
  end if;
  return new;
end $$;

drop trigger if exists oct_pessoa_prazo_padrao_antes on public.oct_pessoas;
create trigger oct_pessoa_prazo_padrao_antes
  before insert on public.oct_pessoas
  for each row execute function public.oct_pessoa_prazo_padrao_antes();

-- 3) depois de gravar (ou quando a pessoa VIRA cliente): vincular a tabela padrao
create or replace function public.oct_pessoa_tabela_padrao() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_tab uuid;
begin
  if not (new.tipo in ('cliente', 'ambos') or 'cliente' = any (coalesce(new.classificacoes, '{}'::text[]))) then
    return new;
  end if;
  if new.ativo is false then
    return new;
  end if;
  select t.id into v_tab
    from oct_tabelas_preco t
   where t.empresa_id = new.empresa_id and t.padrao_cliente_novo and t.ativo
   limit 1;
  if v_tab is null then
    return new;
  end if;
  if exists (select 1 from oct_tabela_preco_clientes v
              where v.empresa_id = new.empresa_id and v.cliente_id = new.id) then
    return new;                       -- ja' tem tabela (a padrao ou outra): nao mexe
  end if;
  insert into oct_tabela_preco_clientes (empresa_id, tabela_id, cliente_id)
  values (new.empresa_id, v_tab, new.id);
  return new;
end $$;

drop trigger if exists oct_pessoa_tabela_padrao on public.oct_pessoas;
create trigger oct_pessoa_tabela_padrao
  after insert or update of tipo, classificacoes, ativo on public.oct_pessoas
  for each row execute function public.oct_pessoa_tabela_padrao();

-- 4) quem ja' esta' cadastrado e ainda ficou sem tabela (idempotente; hoje deve inserir 0 linhas no Florestal)
insert into oct_tabela_preco_clientes (empresa_id, tabela_id, cliente_id)
select p.empresa_id, t.id, p.id
  from oct_pessoas p
  join oct_tabelas_preco t on t.empresa_id = p.empresa_id and t.padrao_cliente_novo and t.ativo
 where (p.tipo in ('cliente', 'ambos') or 'cliente' = any (coalesce(p.classificacoes, '{}'::text[])))
   and p.ativo is not false
   and not exists (select 1 from oct_tabela_preco_clientes v where v.empresa_id = p.empresa_id and v.cliente_id = p.id);

-- 5) conferencia (rode e olhe)
select e.nome as empresa, t.nome as tabela_padrao,
       (select count(*) from oct_tabela_preco_clientes v where v.tabela_id = t.id) as clientes_na_tabela
  from oct_tabelas_preco t join oct_empresas e on e.id = t.empresa_id
 where t.padrao_cliente_novo;

-- ---------------- REVERSAO (so' se precisar) ----------------
-- drop trigger if exists oct_pessoa_prazo_padrao_antes on public.oct_pessoas;
-- drop trigger if exists oct_pessoa_tabela_padrao on public.oct_pessoas;
-- drop function if exists public.oct_pessoa_prazo_padrao_antes();
-- drop function if exists public.oct_pessoa_tabela_padrao();
-- update oct_tabelas_preco set padrao_cliente_novo = false where padrao_cliente_novo;
