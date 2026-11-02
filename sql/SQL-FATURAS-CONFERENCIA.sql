-- CONFERÊNCIA DAS LIQUIDADAS (02/11/2026, Ronan: "aqui tem que ter um checkbox, em todos para irmos marcando ao longo
-- da conferência"). Faturar › Faturas Liquidadas: cada fatura e cada título recebido direto tem a caixinha de conferido,
-- gravada aqui com quem e quando. Rodado em 02/11/2026.
alter table oct_faturas add column if not exists conferido boolean not null default false;
alter table oct_faturas add column if not exists conferido_por text;
alter table oct_faturas add column if not exists conferido_em timestamptz;
alter table oct_pdv_notas_prazo add column if not exists conferido boolean not null default false;
alter table oct_pdv_notas_prazo add column if not exists conferido_por text;
alter table oct_pdv_notas_prazo add column if not exists conferido_em timestamptz;
notify pgrst, 'reload schema';
