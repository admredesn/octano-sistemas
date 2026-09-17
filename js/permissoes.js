// ============================================================
// PERMISSÕES — catálogo, perfis e a pergunta "pode?"
// ------------------------------------------------------------
// 17/09/2026, pedido do Ronan: hierarquia de perfis com liga/desliga de TUDO
// o que o sistema faz (modelo do "Controle de Acessos" do TecnoX).
//
// FONTE ÚNICA: este catálogo alimenta a tela Perfis, o SQL de padrões
// (_ferramentas/gerar_sql_permissoes.py lê este arquivo) e o PDV.
// Chave nova: acrescente aqui, rode o gerador e o SQL gerado.
//
// p = quem tem por padrão: g gerente · f financeiro · c contabilidade · o operador/caixa
// Master tem tudo, sempre (não é editável).
// s = sensível (dinheiro, documento fiscal, apagar, configuração) — só destaque visual.
// ============================================================

const PERFIS_OCTANO = [
  { id: 'master',        rot: 'Master',           desc: 'Dono da rede: vê todos os postos e tem tudo liberado.' },
  { id: 'gerente',       rot: 'Gerente',          desc: 'Responsável pelo posto: vê só o próprio posto.' },
  { id: 'financeiro',    rot: 'Financeiro',       desc: 'Contas, faturamento e conciliação.' },
  { id: 'contabilidade', rot: 'Contabilidade',    desc: 'Notas, livros fiscais e SPED.' },
  { id: 'operador',      rot: 'Operador / caixa', desc: 'Frentista e caixa: opera o PDV.' },
];

const PERM_CATALOGO = [
  // ---------------- RETAGUARDA ----------------
  { n: 1, area: 'Retaguarda', grupo: 'Financeiro — Contas a pagar', itens: [
    { c: 'contas_pagar.ver', d: 'Acessar Contas a pagar', p: 'gfc' },
    { c: 'contas_pagar.incluir', d: 'Incluir conta a pagar', p: 'gf', s: 1 },
    { c: 'contas_pagar.alterar', d: 'Alterar conta a pagar', p: 'gf', s: 1 },
    { c: 'contas_pagar.baixar', d: 'Baixar (pagar) título', p: 'gf', s: 1 },
    { c: 'contas_pagar.excluir', d: 'Excluir conta a pagar', p: 'g', s: 1 },
    { c: 'contas_pagar.fixas', d: 'Gerenciar contas fixas (recorrentes)', p: 'gf', s: 1 },
    { c: 'contas_pagar.bancos', d: 'Gerenciar bancos', p: 'gf', s: 1 },
    { c: 'contas_pagar.plano', d: 'Incluir conta no plano de contas', p: 'gfc', s: 1 },
  ]},
  { n: 2, area: 'Retaguarda', grupo: 'Financeiro — Conciliação bancária', itens: [
    { c: 'conc_banco.ver', d: 'Acessar Conciliação', p: 'gfc' },
    { c: 'conc_banco.sincronizar', d: 'Atualizar o livro (contas pagas e vendas)', p: 'gf' },
    { c: 'conc_banco.incluir', d: 'Incluir lançamento', p: 'gf', s: 1 },
    { c: 'conc_banco.alterar', d: 'Alterar lançamento', p: 'gf', s: 1 },
    { c: 'conc_banco.excluir', d: 'Excluir lançamento', p: 'g', s: 1 },
    { c: 'conc_banco.conciliar', d: 'Conciliar (inclui a barra de espaço)', p: 'gf', s: 1 },
    { c: 'conc_banco.aprovar_sugestoes', d: 'Aprovar sugestões em lote', p: 'gf', s: 1 },
    { c: 'conc_banco.desconciliar', d: 'Desfazer conciliação', p: 'gf', s: 1 },
    { c: 'conc_banco.baixar_titulo', d: 'Baixar título pelo extrato', p: 'gf', s: 1 },
    { c: 'conc_banco.saldo_inicial', d: 'Alterar saldo inicial da conta', p: 'g', s: 1 },
  ]},
  { n: 3, area: 'Retaguarda', grupo: 'Financeiro — Faturar', itens: [
    { c: 'faturar.ver', d: 'Acessar Faturar', p: 'gf' },
    { c: 'faturar.receber_titulo', d: 'Receber título', p: 'gf', s: 1 },
    { c: 'faturar.parcelar', d: 'Parcelar título', p: 'gf', s: 1 },
    { c: 'faturar.gerar_fatura', d: 'Gerar fatura', p: 'gf', s: 1 },
    { c: 'faturar.alterar_fatura', d: 'Alterar fatura (vencimento, desconto, acréscimo)', p: 'gf', s: 1 },
    { c: 'faturar.receber_fatura', d: 'Receber fatura', p: 'gf', s: 1 },
    { c: 'faturar.emitir_nfe', d: 'Emitir NF-e da fatura', p: 'gfc', s: 1 },
    { c: 'faturar.imprimir', d: 'Imprimir DANFE, boleto e fatura', p: 'gf' },
    { c: 'faturar.boleto', d: 'Gerar boleto', p: 'gf', s: 1 },
    { c: 'faturar.anexar_nfe', d: 'Anexar NF-e à fatura', p: 'gfc', s: 1 },
    { c: 'faturar.enviar', d: 'Enviar fatura por e-mail/WhatsApp', p: 'gf', s: 1 },
    { c: 'faturar.cobrar', d: 'Cobrar cliente', p: 'gf', s: 1 },
  ]},
  { n: 4, area: 'Retaguarda', grupo: 'Financeiro — Caixa, B.I e outros', itens: [
    { c: 'fcaixa.ver', d: 'Acessar Fechamento de caixa', p: 'gf' },
    { c: 'fcaixa.conferir', d: 'Conferir lançamentos do caixa', p: 'gf' },
    { c: 'fcaixa.lanc_incluir', d: 'Incluir lançamento no caixa', p: 'gf', s: 1 },
    { c: 'fcaixa.lanc_alterar', d: 'Alterar lançamento do caixa', p: 'gf', s: 1 },
    { c: 'fcaixa.lanc_excluir', d: 'Excluir lançamento do caixa', p: 'g', s: 1 },
    { c: 'fcaixa.alterar_troco', d: 'Alterar troco inicial/final', p: 'g', s: 1 },
    { c: 'fcaixa.item_vendido', d: 'Lançar item vendido esquecido', p: 'gf', s: 1 },
    { c: 'fcaixa.baixar_titulo', d: 'Baixar título recebido no caixa', p: 'gf', s: 1 },
    { c: 'fcaixa.lancar_diferenca', d: 'Lançar diferença ao responsável', p: 'gf', s: 1 },
    { c: 'fcaixa.substituir_extrato', d: 'Substituir cartão/Pix pelo extrato (e desfazer)', p: 'gf', s: 1 },
    { c: 'fcaixa.fechar', d: 'Fechar caixa', p: 'gf', s: 1 },
    { c: 'fcaixa.reabrir', d: 'Reabrir caixa fechado', p: 'g', s: 1 },
    { c: 'bi.ver', d: 'Acessar B.I', p: 'gf' },
    { c: 'bi.disponivel', d: 'Ver saldos disponíveis', p: 'gf' },
    { c: 'bi.informar_saldo', d: 'Informar saldo real de conta', p: 'gf', s: 1 },
    { c: 'notas_prazo.ver', d: 'Acessar Notas a prazo', p: 'gf' },
    { c: 'comissoes.ver', d: 'Acessar Comissões', p: 'gf' },
    { c: 'comissoes.alterar', d: 'Alterar percentuais e categorias de comissão', p: 'g', s: 1 },
    { c: 'cashback.ver', d: 'Acessar Cashback', p: 'gf' },
    { c: 'cashback.incluir', d: 'Lançar cashback manual', p: 'g', s: 1 },
    { c: 'cashback.reprocessar', d: 'Reprocessar cashback', p: 'gf', s: 1 },
    { c: 'cashback.cancelar', d: 'Cancelar cashback', p: 'gf', s: 1 },
    { c: 'formas_pagamento.ver', d: 'Acessar Formas de pagamento', p: 'gf' },
    { c: 'formas_pagamento.alterar', d: 'Incluir/alterar forma de recebimento', p: 'g', s: 1 },
    { c: 'formas_pagamento.excluir', d: 'Excluir forma de recebimento', p: 'g', s: 1 },
    { c: 'formas_pagamento.negociacao', d: 'Criar/alterar/excluir preço negociado', p: 'gf', s: 1 },
  ]},
  { n: 5, area: 'Retaguarda', grupo: 'Fiscal — Notas', itens: [
    { c: 'nfe.ver', d: 'Acessar NF-e de entrada', p: 'gfc' },
    { c: 'nfe.importar', d: 'Importar XML de entrada', p: 'gc', s: 1 },
    { c: 'nfe.alterar', d: 'Alterar / confirmar nota de entrada', p: 'gc', s: 1 },
    { c: 'nfe.excluir', d: 'Excluir nota de entrada', p: 'g', s: 1 },
    { c: 'nfe.manifestar', d: 'Buscar, dar ciência e baixar XML na SEFAZ', p: 'gc', s: 1 },
    { c: 'nfe_saida.ver', d: 'Acessar NF-e de saída', p: 'gfc' },
    { c: 'nfe_saida.alterar', d: 'Incluir/alterar rascunho de NF-e', p: 'gc', s: 1 },
    { c: 'nfe_saida.excluir', d: 'Excluir rascunho de NF-e', p: 'gc', s: 1 },
    { c: 'nfe_saida.transmitir', d: 'Transmitir NF-e', p: 'gc', s: 1 },
    { c: 'nfe_saida.cancelar', d: 'Cancelar NF-e', p: 'g', s: 1 },
    { c: 'nfce.ver', d: 'Acessar NFC-e', p: 'gfc' },
    { c: 'nfce.emitir', d: 'Emitir NFC-e avulsa', p: 'gc', s: 1 },
    { c: 'nfce.cancelar', d: 'Cancelar NFC-e', p: 'g', s: 1 },
    { c: 'nfce.fila_alterar', d: 'Alterar desconto/acréscimo na fila', p: 'g', s: 1 },
    { c: 'nfce.dispensar_recebimento', d: 'Dispensar recebimento órfão', p: 'gf', s: 1 },
    { c: 'manifestacao.ver', d: 'Acessar Manifestação', p: 'gfc' },
    { c: 'manifestacao.consultar', d: 'Consultar notas na SEFAZ', p: 'gc', s: 1 },
    { c: 'manifestacao.ciencia', d: 'Enviar ciência (irreversível)', p: 'gc', s: 1 },
    { c: 'manifestacao.incluir_nota', d: 'Importar nota manifestada', p: 'gc', s: 1 },
    { c: 'manifestacao.excluir', d: 'Excluir importação / desfazer', p: 'g', s: 1 },
  ]},
  { n: 6, area: 'Retaguarda', grupo: 'Fiscal — Livros e contabilidade', itens: [
    { c: 'lmc.ver', d: 'Acessar LMC', p: 'gc' },
    { c: 'lmc.lancar_descarga', d: 'Lançar descarga', p: 'gc', s: 1 },
    { c: 'lmc.salvar_livro', d: 'Salvar livro do período', p: 'gc', s: 1 },
    { c: 'contabilidade.ver', d: 'Acessar Contabilidade', p: 'gc' },
    { c: 'contabilidade.plano', d: 'Incluir/alterar/excluir conta contábil', p: 'c', s: 1 },
    { c: 'contabilidade.sped_config', d: 'Configurar SPED (contador, município)', p: 'gc', s: 1 },
    { c: 'contabilidade.gerar_sped', d: 'Gerar e baixar SPED Fiscal / PIS-COFINS / ECD', p: 'gc', s: 1 },
    { c: 'contabilidade.contabilizar', d: 'Contabilizar o mês', p: 'c', s: 1 },
    { c: 'importar_sped.ver', d: 'Acessar Importar SPED', p: 'c' },
    { c: 'importar_sped.importar', d: 'Gravar importação do SPED', p: 'c', s: 1 },
    { c: 'config_fiscal.ver', d: 'Acessar Config. fiscal', p: 'gc' },
    { c: 'config_fiscal.alterar', d: 'Alterar bombas, bicos e lacres fiscais', p: 'gc', s: 1 },
  ]},
  { n: 7, area: 'Retaguarda', grupo: 'Cadastros — Pessoas', itens: [
    { c: 'pessoas.ver', d: 'Acessar Cadastro de pessoas', p: 'gfc' },
    { c: 'pessoas.incluir', d: 'Incluir pessoa', p: 'gf', s: 1 },
    { c: 'pessoas.alterar', d: 'Alterar pessoa', p: 'gf', s: 1 },
    { c: 'pessoas.alterar_limite', d: 'Alterar limite de crédito / bloqueio / prazo', p: 'g', s: 1 },
    { c: 'pessoas.alterar_tabela_preco', d: 'Vincular tabela de preço ao cliente', p: 'g', s: 1 },
    { c: 'pessoas.alterar_cashback', d: 'Ligar cashback e chave Pix do cliente', p: 'g', s: 1 },
    { c: 'pessoas.frota', d: 'Incluir/remover placas e colaboradores', p: 'gf' },
    { c: 'pessoas.ativar', d: 'Ativar/inativar pessoa', p: 'g', s: 1 },
    { c: 'pessoas.excluir', d: 'Excluir pessoa', p: 'g', s: 1 },
    { c: 'pessoas.lista_negra', d: 'Ver lista negra de placas', p: 'gf' },
    { c: 'pessoas.lista_negra_alterar', d: 'Bloquear/liberar placa', p: 'g', s: 1 },
  ]},
  { n: 8, area: 'Retaguarda', grupo: 'Cadastros — Produtos e serviços', itens: [
    { c: 'produtos.ver', d: 'Acessar Produtos', p: 'gfc' },
    { c: 'produtos.alterar', d: 'Incluir/alterar produto', p: 'gc' },
    { c: 'produtos.alterar_preco', d: 'Alterar preço, custo e margem', p: 'g', s: 1 },
    { c: 'produtos.alterar_lote', d: 'Alterar preços em lote', p: 'g', s: 1 },
    { c: 'produtos.excluir', d: 'Excluir produto', p: 'g', s: 1 },
    { c: 'servicos.ver', d: 'Acessar Serviços', p: 'gc' },
    { c: 'servicos.alterar', d: 'Incluir/alterar serviço', p: 'gc' },
    { c: 'servicos.excluir', d: 'Excluir serviço', p: 'g', s: 1 },
  ]},
  { n: 9, area: 'Retaguarda', grupo: 'Pista — Tanques, aferição e ponto', itens: [
    { c: 'tanques.ver', d: 'Acessar Tanques e bicos', p: 'gc' },
    { c: 'tanques.alterar', d: 'Incluir/alterar tanque (ajusta estoque)', p: 'g', s: 1 },
    { c: 'tanques.excluir', d: 'Excluir tanque', p: 'g', s: 1 },
    { c: 'tanques.bicos', d: 'Incluir/alterar/excluir bico', p: 'g', s: 1 },
    { c: 'tanques.gerar_qr', d: 'Gerar QR do cashback', p: 'g' },
    { c: 'monitor.ver', d: 'Acessar Monitor de tanques', p: 'gfc' },
    { c: 'prontidao.ver', d: 'Acessar Prontidão', p: 'g' },
    { c: 'afericoes.ver', d: 'Acessar Aferições', p: 'g' },
    { c: 'afericoes.autorizar', d: 'Autorizar aferição', p: 'g', s: 1 },
    { c: 'afericoes.recusar', d: 'Recusar aferição', p: 'g', s: 1 },
    { c: 'ponto.ver', d: 'Acessar Ponto', p: 'gf' },
    { c: 'ponto.ajustar', d: 'Incluir/ajustar marcação de ponto', p: 'g', s: 1 },
    { c: 'ponto.exportar', d: 'Exportar ponto', p: 'gf' },
  ]},
  { n: 10, area: 'Retaguarda', grupo: 'Relatórios', itens: [
    { c: 'relatorios.ver', d: 'Acessar Relatórios', p: 'gfc' },
    { c: 'relatorios.exportar', d: 'Exportar relatórios (Excel, CSV, impressão)', p: 'gfc' },
  ]},
  { n: 11, area: 'Retaguarda', grupo: 'Administração', itens: [
    { c: 'empresa.ver', d: 'Acessar Cadastro da empresa', p: 'gfc' },
    { c: 'empresa.alterar', d: 'Alterar dados da empresa', p: 'g', s: 1 },
    { c: 'empresa.certificado', d: 'Enviar/remover certificado digital', p: 'g', s: 1 },
    { c: 'empresa.integracoes', d: 'Configurar Sicoob e cashback do posto', p: 'g', s: 1 },
    { c: 'operadores.ver', d: 'Acessar Operadores', p: 'g' },
    { c: 'operadores.incluir', d: 'Incluir operador', p: 'g', s: 1 },
    { c: 'operadores.trocar_senha', d: 'Trocar senha de operador', p: 'g', s: 1 },
    { c: 'operadores.ativar', d: 'Bloquear/liberar operador', p: 'g', s: 1 },
    { c: 'operadores.perfil', d: 'Definir perfil e exceções de uma pessoa', p: '', s: 1 },
    { c: 'parametros.ver', d: 'Acessar Parâmetros', p: 'g' },
    { c: 'parametros.alterar', d: 'Alterar parâmetros e mensagens', p: 'g', s: 1 },
    { c: 'whatsapp.ver', d: 'Acessar WhatsApp', p: 'g' },
    { c: 'whatsapp.desconectar', d: 'Desconectar/trocar número do WhatsApp', p: '', s: 1 },
  ]},

  // ---------------- PDV ----------------
  { n: 12, area: 'PDV', grupo: 'Turno e caixa', itens: [
    { c: 'pdv.abrir_turno', d: 'Abrir turno', p: 'go' },
    { c: 'pdv.fechar_turno', d: 'Fechar turno', p: 'go', s: 1 },
    { c: 'pdv.suprimento', d: 'Suprimento', p: 'go', s: 1 },
    { c: 'pdv.sangria', d: 'Sangria', p: 'go', s: 1 },
    { c: 'pdv.despesa', d: 'Despesa', p: 'go', s: 1 },
    { c: 'pdv.receita', d: 'Receita', p: 'go', s: 1 },
    { c: 'pdv.leitura_x', d: 'Leitura X', p: 'go' },
    { c: 'pdv.resumo_caixa', d: 'Resumo do caixa (vendas, encerrantes, cartões)', p: 'go' },
    { c: 'pdv.paralisar_caixa', d: 'Paralisar caixa', p: 'go' },
  ]},
  { n: 13, area: 'PDV', grupo: 'Venda', itens: [
    { c: 'pdv.fechar_venda', d: 'Fechar venda / emitir cupom (F1)', p: 'go', s: 1 },
    { c: 'pdv.adicionar_produto', d: 'Vender produto da loja (F2)', p: 'go' },
    { c: 'pdv.cancelar_item', d: 'Cancelar item (F5)', p: 'go', s: 1 },
    { c: 'pdv.cancelar_cupom', d: 'Cancelar cupom', p: 'go', s: 1 },
    { c: 'pdv.consultar_cupons', d: 'Consultar cupons', p: 'go' },
    { c: 'pdv.reimprimir_cupom', d: 'Reimprimir cupom', p: 'go' },
    { c: 'pdv.selecionar_cliente', d: 'Consultar/selecionar cliente (F3)', p: 'go' },
    { c: 'pdv.cadastrar_cliente', d: 'Cadastrar cliente', p: 'go' },
    { c: 'pdv.dados_cliente', d: 'CPF/CNPJ no cupom e ficha do abastecimento (placa, KM)', p: 'go' },
    { c: 'pdv.venda_prazo', d: 'Venda a prazo', p: 'go', s: 1 },
    { c: 'pdv.liberar_credito', d: 'Liberar crédito de cliente bloqueado', p: 'g', s: 1 },
    { c: 'pdv.receber_dinheiro', d: 'Receber em dinheiro (tecla R)', p: 'go', s: 1 },
    { c: 'pdv.receber_titulo', d: 'Receber títulos', p: 'go', s: 1 },
    { c: 'pdv.contas_prazo', d: 'Marcar conta a prazo como paga', p: 'g', s: 1 },
    { c: 'pdv.afericao', d: 'Aferição', p: 'go' },
    { c: 'pdv.vale_haver', d: 'Vale / haver (crédito, troco, vale de funcionário)', p: 'go', s: 1 },
    { c: 'pdv.fidelidade', d: 'Consultar e resgatar pontos de fidelidade', p: 'go', s: 1 },
    { c: 'pdv.cashback', d: 'Aplicar cashback na venda', p: 'go' },
    { c: 'pdv.emitir_nfse', d: 'Emitir nota de serviço', p: 'go', s: 1 },
  ]},
  { n: 14, area: 'PDV', grupo: 'Recebimentos e fila', itens: [
    { c: 'pdv.conciliacao', d: 'Buscar extrato, EDI, cofre e frota', p: 'go' },
    { c: 'pdv.vincular_recebimento', d: 'Vincular recebimento ao abastecimento', p: 'go', s: 1 },
    { c: 'pdv.fila_alterar_forma', d: 'Trocar forma de pagamento na fila', p: 'go', s: 1 },
    { c: 'pdv.fila_transmitir', d: 'Transmitir a fila', p: 'go', s: 1 },
    { c: 'pdv.fila_desfazer', d: 'Desfazer baixa da fila', p: 'go', s: 1 },
  ]},
  { n: 15, area: 'PDV', grupo: 'Consultas e ponto', itens: [
    { c: 'pdv.consultar_abastecimentos', d: 'Consultar abastecimentos', p: 'go' },
    { c: 'pdv.consultar_recebimentos', d: 'Consultar recebimentos EDI/cofre', p: 'go' },
    { c: 'pdv.consultar_produtos', d: 'Consultar produtos', p: 'go' },
    { c: 'pdv.sincronizar', d: 'Sincronizar cadastros', p: 'go' },
    { c: 'pdv.registrar_ponto', d: 'Registrar ponto', p: 'go' },
    { c: 'pdv.adiar_ponto', d: 'Adiar trava do ponto', p: 'g' },
  ]},
  { n: 16, area: 'PDV', grupo: 'Menu gerente (F8)', itens: [
    { c: 'pdv.menu_gerente', d: 'Abrir o menu gerente', p: 'g' },
    { c: 'pdv.alterar_preco', d: 'Alterar preço de bomba', p: 'g', s: 1 },
    { c: 'pdv.ajuste_tanque', d: 'Ajustar estoque do tanque', p: 'g', s: 1 },
    { c: 'pdv.cadastrar_vendedor', d: 'Cadastrar/remover vendedor', p: 'g', s: 1 },
    { c: 'pdv.relatorio_dia', d: 'Relatório do dia', p: 'g' },
    { c: 'pdv.precos_prime', d: 'Enviar preços ao portal Prime', p: 'g', s: 1 },
    { c: 'pdv.nucleo_v2', d: 'Configurar núcleo v2 e dispensar recebimentos', p: 'g', s: 1 },
    { c: 'pdv.contingencia', d: 'Ligar/desligar contingência fiscal', p: 'g', s: 1 },
    { c: 'pdv.ambiente_fiscal', d: 'Escolher ambiente fiscal (homologação/produção)', p: '', s: 1 },
  ]},
];

// ---------------- código de cada permissão (1.1, 2.3...) ----------------
// O número do GRUPO é fixo no catálogo (n) e o da permissão é a posição dentro
// dele — por isso permissão nova entra no FIM do grupo: assim 2.2 continua
// sendo 2.2 no dia seguinte, que é o que a pessoa lê na mensagem de bloqueio.
const _PERM_COD = {};
const _PERM_ITEM = {};
PERM_CATALOGO.forEach(g => g.itens.forEach((i, j) => {
  i.cod = g.n + '.' + (j + 1);
  _PERM_COD[i.c] = i.cod;
  _PERM_ITEM[i.c] = i;
}));

function permCodigo(chave) { return _PERM_COD[chave] || ''; }
function permRotulo(chave) {
  const i = _PERM_ITEM[chave];
  return i ? (i.cod + ' — ' + i.d) : chave;
}

// ---------------- o usuário logado ----------------
// Preenchido por permCarregar() no login. Enquanto o SQL novo não rodou
// (rpc inexistente), fica em "legado" e a tela usa o controle antigo (PAPEIS).
const PERM = { carregado: false, legado: true, papel: null, master: false, set: new Set(), empresas: [] };

function permPadrao(perfil) {
  const letra = { gerente: 'g', financeiro: 'f', contabilidade: 'c', operador: 'o' }[perfil];
  const out = new Set();
  PERM_CATALOGO.forEach(g => g.itens.forEach(i => { if (perfil === 'master' || (letra && (i.p || '').includes(letra))) out.add(i.c); }));
  return out;
}

async function permCarregar() {
  try {
    const { data, error } = await sb.rpc('oct_minhas_permissoes');
    if (error) throw error;
    PERM.papel = data && data.papel || null;
    PERM.master = !!(data && data.master);
    PERM.set = new Set((data && data.liberadas) || []);
    PERM.empresas = (data && data.empresas) || [];   // empresas autorizadas (vazio = só a do cadastro)
    PERM.legado = false;
  } catch (e) {
    console.warn('permissões: usando o controle antigo —', e.message || e);
    PERM.legado = true;
  }
  PERM.carregado = true;
}

// pode('contas_pagar.baixar') — master sempre pode; sem o SQL novo, não bloqueia ações
function pode(chave) {
  if (!PERM.carregado || PERM.legado) return true;
  return PERM.master || PERM.set.has(chave);
}

// para ações: avisa e devolve false quando não pode
function podeOuAvisa(chave) {
  if (pode(chave)) return true;
  const perfil = (PERFIS_OCTANO.find(p => p.id === PERM.papel) || {}).rot || PERM.papel || 'seu perfil';
  alert('Sem permissão\n\n' + permRotulo(chave) +
        '\n\nPerfil: ' + perfil + '.\nPeça ao administrador para liberar esta permissão.');
  return false;
}
