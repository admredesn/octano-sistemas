-- ============================================================
-- ÁREA DO CLIENTE (app Postos SN e versão web /app/): faturas, extrato, boleto e foto do cupom assinado
-- 13/10/2026 — rodar UMA vez no SQL Editor do Supabase. Idempotente.
--
-- Marca no cadastro do COLABORADOR de uma empresa: pode ver, no app/PC do cliente, as faturas e os
-- comprovantes da EMPRESA. Sem a marca, o colaborador só enxerga o que for do próprio cadastro (que, numa
-- empresa, normalmente é nada). Marcada na retaguarda: Pessoas > empresa > Colaboradores autorizados.
-- Pessoa física (cliente que compra a prazo no próprio CPF) não precisa de marca: vê as próprias faturas.
-- ============================================================
alter table oct_pessoas add column if not exists app_ve_faturas boolean not null default false;
comment on column oct_pessoas.app_ve_faturas is
  'Colaborador pode ver as faturas e os comprovantes da empresa vinculada (frota_empresa_id) no app do cliente.';
