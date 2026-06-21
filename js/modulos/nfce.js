// ============================================================
// MODULO NFC-e (modelo 65) — venda de balcao / PDV
// Fluxo enxuto: adiciona produto -> qtd -> pagamento -> CPF opcional -> emitir
// ============================================================

let _nfceEmpresaId = null;
let _nfceEmpresa = null;
let _nfceProdutos = [];
let _nfceItens = [];
let _nfceCacheEmpresa = null;

const NFCE_SERIE_PADRAO = 1; // serie propria da NFC-e (independente da NF-e 55)

const NFCE_PAGAMENTOS = [
  { cod: '01', nome: 'Dinheiro' },
  { cod: '17', nome: 'PIX' },
  { cod: '03', nome: 'Cartão Crédito' },
  { cod: '04', nome: 'Cartão Débito' },
  { cod: '05', nome: 'Crédito Loja' },
  { cod: '15', nome: 'Boleto' },
];

async function moduloNfce() {
  const conteudo = document.getElementById('conteudo');
  conteudo.innerHTML = '<p style="color:#888;padding:20px">Carregando...</p>';

  const session = await getSession();
  const { data: perfil } = await sb.from('oct_perfis')
    .select('empresa_id, oct_empresas(*)').eq('id', session.user.id).single();
  _nfceEmpresaId = ((typeof empresaAtiva==='function')?empresaAtiva():perfil?.empresa_id);
  _nfceEmpresa = perfil?.oct_empresas;
  if (typeof empresaAtiva==='function' && empresaAtiva()) { const {data:_ea}=await sb.from('oct_empresas').select('*').eq('id',empresaAtiva()).single(); if(_ea) _nfceEmpresa=_ea; }
  if (!_nfceEmpresaId) { conteudo.innerHTML = '<p style="color:#f44;padding:20px">Configure sua empresa primeiro.</p>'; return; }

  if (!_nfceProdutos.length || _nfceCacheEmpresa !== _nfceEmpresaId) {
    const { data: prods } = await sb.from('oct_produtos')
      .select('id,nome,codigo,ean,unidade,preco_venda_a,ncm,cest,cfop,cfop_ecf,cod_anp,desc_anp,ind_combustivel,ind_monofasico,origem,cst_icms,aliq_icms,aliq_icms_ad_rem,cst_pis,aliq_pis,cst_cofins,aliq_cofins,unidade_tributavel')
      .eq('empresa_id', _nfceEmpresaId).eq('ativo', true).order('nome');
    _nfceProdutos = prods || [];
    _nfceCacheEmpresa = _nfceEmpresaId;
  }

  _nfceItens = [];
  nfceRenderTela();
}

function nfceRenderTela() {
  const conteudo = document.getElementById('conteudo');
  const temCsc = !!(_nfceEmpresa && _nfceEmpresa.csc && _nfceEmpresa.csc_id);
  const avisoCsc = temCsc ? '' :
    `<div style="background:#1a1500;border:1px solid #5a4a00;border-radius:8px;padding:10px 14px;margin-bottom:14px;color:#fbbf24;font-size:0.82rem">⚠️ CSC não configurado na empresa — a emissão de NFC-e será recusada pela SEFAZ. Configure o CSC e o ID do CSC.</div>`;

  conteudo.innerHTML = `
    <div style="max-width:1100px;margin:0 auto">
      <h2 style="color:#f97316;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between">
        <span>🧾 NFC-e — Venda no balcão</span>
        <button onclick="nfceAbrirHistorico()" style="font-size:0.8rem;padding:6px 14px;border-radius:6px;border:1px solid #2a2d3e;background:#13151f;color:#60a5fa;cursor:pointer">📋 Histórico / Cancelar</button>
      </h2>
      ${avisoCsc}
      <div style="display:grid;grid-template-columns:1fr 360px;gap:16px">
        <!-- esquerda: produto + itens -->
        <div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;padding:16px">
          <div style="display:flex;gap:8px;align-items:flex-end;margin-bottom:14px">
            <div style="flex:1">
              <label style="font-size:0.75rem;color:#888;display:block;margin-bottom:4px">Produto (nome, código ou cód. barras)</label>
              <input id="nfce-busca" list="nfce-prod-list" type="text" placeholder="Digite ou bipe o código de barras..." style="width:100%;padding:9px 10px;border-radius:6px;border:1px solid #2a2d3e;background:#0f1117;color:#e0e0e0" onkeydown="if(event.key==='Enter'){event.preventDefault();nfceAddPorBusca();}" />
              <datalist id="nfce-prod-list">
                ${_nfceProdutos.map(p=>`<option value="${(p.nome||'').replace(/"/g,'')}">`).join('')}
              </datalist>
            </div>
            <div style="width:90px">
              <label style="font-size:0.75rem;color:#888;display:block;margin-bottom:4px">Qtd</label>
              <input id="nfce-qtd" type="number" step="0.001" value="1" style="width:100%;padding:9px 10px;border-radius:6px;border:1px solid #2a2d3e;background:#0f1117;color:#e0e0e0" onkeydown="if(event.key==='Enter'){event.preventDefault();nfceAddPorBusca();}" />
            </div>
            <button onclick="nfceAddPorBusca()" style="padding:9px 16px;border-radius:6px;border:none;background:#f97316;color:#fff;font-weight:600;cursor:pointer">+ Add</button>
          </div>
          <table style="width:100%;border-collapse:collapse;font-size:0.84rem">
            <thead><tr style="color:#888;text-align:left;border-bottom:1px solid #2a2d3e">
              <th style="padding:6px 4px">Produto</th><th style="padding:6px 4px;text-align:right">Qtd</th>
              <th style="padding:6px 4px;text-align:right">Unit.</th><th style="padding:6px 4px;text-align:right">Total</th><th></th>
            </tr></thead>
            <tbody id="nfce-itens-corpo"></tbody>
          </table>
        </div>
        <!-- direita: pagamento + total + emitir -->
        <div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;padding:16px;height:fit-content">
          <div style="text-align:right;margin-bottom:6px;color:#888;font-size:0.8rem">TOTAL</div>
          <div id="nfce-total" style="text-align:right;font-size:2rem;font-weight:700;color:#4caf50;margin-bottom:16px">R$ 0,00</div>
          <label style="font-size:0.75rem;color:#888;display:block;margin-bottom:4px">Forma de pagamento</label>
          <select id="nfce-pagamento" style="width:100%;padding:9px 10px;border-radius:6px;border:1px solid #2a2d3e;background:#0f1117;color:#e0e0e0;margin-bottom:12px">
            ${NFCE_PAGAMENTOS.map(p=>`<option value="${p.cod}">${p.nome}</option>`).join('')}
          </select>
          <label style="font-size:0.75rem;color:#888;display:block;margin-bottom:4px">CPF do consumidor (opcional)</label>
          <input id="nfce-cpf" type="text" placeholder="só números (opcional)" style="width:100%;padding:9px 10px;border-radius:6px;border:1px solid #2a2d3e;background:#0f1117;color:#e0e0e0;margin-bottom:12px" />
          <label style="font-size:0.75rem;color:#888;display:block;margin-bottom:4px">Ambiente</label>
          <select id="nfce-ambiente" style="width:100%;padding:9px 10px;border-radius:6px;border:1px solid #2a2d3e;background:#0f1117;color:#e0e0e0;margin-bottom:16px">
            <option value="homologacao" selected>Homologação (teste)</option>
            <option value="producao">Produção</option>
          </select>
          <button onclick="nfceEmitir()" style="width:100%;padding:12px;border-radius:8px;border:none;background:#f97316;color:#fff;font-weight:700;font-size:1rem;cursor:pointer">🧾 Emitir NFC-e</button>
          <div id="nfce-msg" style="margin-top:10px;font-size:0.84rem;text-align:center"></div>
        </div>
      </div>
      <div id="nfce-resultado" style="max-width:1100px;margin-top:16px"></div>
    </div>
  `;
  nfceRenderItens();
}

function nfceRenderItens() {
  const corpo = document.getElementById('nfce-itens-corpo');
  if (!corpo) return;
  if (!_nfceItens.length) {
    corpo.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:24px;color:#555">Nenhum item. Busque um produto acima.</td></tr>`;
  } else {
    corpo.innerHTML = _nfceItens.map((it,i)=>`
      <tr style="border-bottom:1px solid #1a1d2e">
        <td style="padding:6px 4px;color:#e0e0e0">${it.descricao}</td>
        <td style="padding:6px 4px;text-align:right">${Number(it.quantidade).toLocaleString('pt-BR',{minimumFractionDigits:3})}</td>
        <td style="padding:6px 4px;text-align:right">${Number(it.valor_unitario).toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
        <td style="padding:6px 4px;text-align:right;color:#4caf50">${Number(it.valor_total).toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
        <td style="padding:6px 4px;text-align:center"><button onclick="nfceRemoverItem(${i})" style="background:transparent;border:none;color:#f44;cursor:pointer">✕</button></td>
      </tr>`).join('');
  }
  const total = _nfceItens.reduce((s,it)=>s+Number(it.valor_total||0),0);
  const totEl = document.getElementById('nfce-total');
  if (totEl) totEl.textContent = 'R$ ' + total.toLocaleString('pt-BR',{minimumFractionDigits:2});
}

function nfceAddPorBusca() {
  const busca = (document.getElementById('nfce-busca')?.value || '').trim().toLowerCase();
  const qtd = Number(document.getElementById('nfce-qtd')?.value) || 1;
  if (!busca) return;
  // tenta achar por nome exato, código ou ean (código de barras)
  let prod = _nfceProdutos.find(p => (p.nome||'').toLowerCase() === busca)
          || _nfceProdutos.find(p => (p.ean||'') === busca)
          || _nfceProdutos.find(p => (p.codigo||'').toLowerCase() === busca)
          || _nfceProdutos.find(p => (p.nome||'').toLowerCase().includes(busca));
  if (!prod) { nfceMsg('Produto não encontrado: ' + busca, 'erro'); return; }
  nfceAdicionarProduto(prod, qtd);
  // limpa pra próxima leitura
  const b = document.getElementById('nfce-busca'); if (b) { b.value=''; b.focus(); }
  const q = document.getElementById('nfce-qtd'); if (q) q.value = '1';
}

function nfceAdicionarProduto(prod, qtd) {
  const preco = Number(prod.preco_venda_a) || 0;
  if (preco <= 0) { nfceMsg(`"${prod.nome}" está sem preço de venda. Defina o preço no cadastro.`, 'erro'); return; }
  _nfceItens.push({
    produto_id: prod.id,
    codigo: prod.codigo, descricao: prod.nome,
    ncm: prod.ncm, cest: prod.cest, cfop: prod.cfop || prod.cfop_ecf || '5102',
    unidade: prod.unidade || 'UN', unidade_tributavel: prod.unidade_tributavel || prod.unidade || 'UN',
    quantidade: qtd, valor_unitario: preco, valor_total: +(qtd * preco).toFixed(2),
    cod_anp: prod.cod_anp, desc_anp: prod.desc_anp,
    ind_combustivel: prod.ind_combustivel || 'N', ind_monofasico: prod.ind_monofasico || 'N',
    origem: prod.origem || '0',
    cst_icms: prod.cst_icms, aliq_icms: prod.aliq_icms, aliq_icms_ad_rem: prod.aliq_icms_ad_rem,
    cst_pis: prod.cst_pis, aliq_pis: prod.aliq_pis, cst_cofins: prod.cst_cofins, aliq_cofins: prod.aliq_cofins,
  });
  nfceRenderItens();
}

function nfceRemoverItem(i) { _nfceItens.splice(i,1); nfceRenderItens(); }

function nfceMsg(txt, tipo) {
  const m = document.getElementById('nfce-msg');
  if (!m) return;
  m.textContent = txt;
  m.style.color = tipo === 'erro' ? '#f44' : tipo === 'ok' ? '#4caf50' : '#888';
}

async function nfceProximoNumero() {
  try {
    const { data } = await sb.from('oct_nfce').select('numero')
      .eq('empresa_id', _nfceEmpresaId).eq('serie', NFCE_SERIE_PADRAO)
      .order('numero',{ascending:false}).limit(1);
    return ((data && data[0] && Number(data[0].numero)) || 0) + 1;
  } catch(e) { return 1; }
}

async function nfceEmitir() {
  if (!_nfceItens.length) { nfceMsg('Adicione ao menos um item.', 'erro'); return; }
  if (!_nfceEmpresa?.cert_path) { nfceMsg('Certificado não configurado (tela Empresa).', 'erro'); return; }
  if (!_nfceEmpresa?.csc || !_nfceEmpresa?.csc_id) { nfceMsg('CSC não configurado na empresa.', 'erro'); return; }
  const senha = (typeof getCertSenha === 'function') ? getCertSenha() : null;
  if (!senha) { nfceMsg('Senha do certificado não encontrada (tela Empresa).', 'erro'); return; }

  const ambiente = document.getElementById('nfce-ambiente')?.value || 'homologacao';
  const tpag = document.getElementById('nfce-pagamento')?.value || '01';
  const cpf = (document.getElementById('nfce-cpf')?.value || '').replace(/\D/g,'');
  const total = _nfceItens.reduce((s,it)=>s+Number(it.valor_total||0),0);

  if (!confirm(`Emitir NFC-e de R$ ${total.toLocaleString('pt-BR',{minimumFractionDigits:2})} em ${ambiente.toUpperCase()}?`)) return;
  nfceMsg('📡 Emitindo NFC-e...', 'info');

  try {
    const { data: cb } = await sb.storage.from('octano-certs').download(_nfceEmpresa.cert_path);
    const buf = await cb.arrayBuffer();
    const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));

    const numero = await nfceProximoNumero();
    const itens = _nfceItens.map((it,i)=>({
      nItem: i+1, cProd: it.codigo || ('ITEM'+(i+1)), xProd: it.descricao,
      cEAN: 'SEM GTIN', cEANTrib: 'SEM GTIN',
      ncm: it.ncm, cest: it.cest || null, cfop: it.cfop,
      uCom: it.unidade || 'UN', uTrib: it.unidade_tributavel || it.unidade || 'UN',
      qCom: Number(it.quantidade), vUnCom: Number(it.valor_unitario), vProd: Number(it.valor_total),
      ind_combustivel: it.ind_combustivel || 'N', ind_monofasico: it.ind_monofasico || 'N',
      cod_anp: it.cod_anp || null, desc_anp: it.desc_anp || null,
      perc_bio: 0, uf_cons: _nfceEmpresa.uf || 'MG',
      origem: it.origem || '0',
      cst_icms: it.cst_icms || null, aliq_icms: Number(it.aliq_icms)||0,
      aliq_icms_ad_rem: Number(it.aliq_icms_ad_rem)||0,
      cst_pis: it.cst_pis || '01', cst_cofins: it.cst_cofins || '01',
      aliq_pis: Number(it.aliq_pis)||0, aliq_cofins: Number(it.aliq_cofins)||0,
    }));

    const empresa = {
      cnpj: (_nfceEmpresa.cnpj||'').replace(/\D/g,''),
      nome: _nfceEmpresa.nome,
      ie: (_nfceEmpresa.ie||'').replace(/\D/g,''),
      logradouro: _nfceEmpresa.endereco || '', numero: 'S/N', bairro: 'CENTRO',
      municipio: _nfceEmpresa.cidade || '', c_mun: _nfceEmpresa.c_mun || '3123205',
      uf: _nfceEmpresa.uf || 'MG', cep: (_nfceEmpresa.cep||'').replace(/\D/g,''),
      crt: _nfceEmpresa.regime_tributario === 'simples' ? '1' : '3',
    };

    const nota = {
      numero, serie: NFCE_SERIE_PADRAO,
      natureza_op: 'VENDA AO CONSUMIDOR',
      forma_pagamento: tpag,
      cpf_consumidor: cpf || null,
      itens,
    };

    const resp = await fetch(`${SEFAZ_URL}/emitir-nfce`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cert_base64: b64, cert_senha: senha, ambiente,
        csc: _nfceEmpresa.csc, csc_id: _nfceEmpresa.csc_id,
        nota, empresa,
      }),
    });
    const r = await resp.json();

    if (r.ok) {
      nfceMsg(`✓ AUTORIZADA! Protocolo ${r.protocolo}`, 'ok');
      // grava no banco
      try {
        await sb.from('oct_nfce').insert({
          empresa_id: _nfceEmpresaId, numero, serie: NFCE_SERIE_PADRAO, modelo: '65',
          status: 'autorizada', ambiente, cpf_consumidor: cpf || null,
          valor_total: total, forma_pagamento: tpag,
          itens: _nfceItens, chave_nfe: r.chave, protocolo: r.protocolo,
          xml_autorizado: r.nfe_proc || r.xml_assinado || null,
          qrcode_url: r.qrcode || null,
        });
      } catch(e) { console.error('Erro ao gravar NFC-e:', e); }
      nfceMostrarResultado(r, total);
      _nfceItens = [];
      nfceRenderItens();
    } else {
      const motivo = r.xmotivo || r.erro || r.detalhes || 'sem detalhe';
      nfceMsg(`❌ [${r.etapa||'?'}] ${r.cstat_nfe || r.cstat_lote || ''} ${motivo}`, 'erro');
      console.error('Retorno /emitir-nfce:', r);
    }
  } catch (e) {
    nfceMsg('Erro ao emitir: ' + e.message, 'erro');
  }
}

function nfceMostrarResultado(r, total) {
  const div = document.getElementById('nfce-resultado');
  if (!div) return;
  // guarda a última NFC-e emitida (para imprimir/cancelar)
  window._nfceUltima = {
    chave: r.chave, protocolo: r.protocolo,
    xml: r.nfe_proc || r.xml_assinado || null,
    ambiente: document.getElementById('nfce-ambiente')?.value || 'homologacao',
    total: total,
  };
  div.innerHTML = `
    <div style="background:#0f1a14;border:1px solid #2a5a3a;border-radius:10px;padding:16px;display:flex;gap:20px;align-items:center;flex-wrap:wrap">
      <div style="flex:1;min-width:260px">
        <div style="color:#4caf50;font-weight:600;font-size:1rem;margin-bottom:8px">✓ NFC-e autorizada</div>
        <div style="font-size:0.82rem;color:#aaa;line-height:1.7">
          <div><strong>Chave:</strong> ${r.chave||'—'}</div>
          <div><strong>Protocolo:</strong> ${r.protocolo||'—'}</div>
          <div><strong>Total:</strong> R$ ${total.toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>
        </div>
        <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
          <button onclick="nfceImprimirCupom()" style="padding:8px 16px;border-radius:6px;border:none;background:#2563eb;color:#fff;font-weight:600;cursor:pointer">🖨️ Imprimir cupom</button>
          <button onclick="nfceCancelar('${r.chave}','${r.protocolo}')" style="padding:8px 16px;border-radius:6px;border:1px solid #5a2a2a;background:transparent;color:#f87171;font-weight:600;cursor:pointer">✕ Cancelar NFC-e</button>
        </div>
        <div id="nfce-acao-msg" style="margin-top:8px;font-size:0.8rem"></div>
        ${r.qrcode ? `<div style="margin-top:8px;font-size:0.7rem;color:#666;word-break:break-all">${r.qrcode}</div>` : ''}
      </div>
      ${r.qrcode ? `<div style="text-align:center">
        <img src="https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(r.qrcode)}" alt="QR Code NFC-e" style="background:#fff;padding:6px;border-radius:8px" />
        <div style="font-size:0.7rem;color:#888;margin-top:4px">QR Code da NFC-e</div>
      </div>` : ''}
    </div>
  `;
}

// Gera e baixa o cupom (DANFCE) em PDF
async function nfceImprimirCupom(xmlOverride, chaveOverride) {
  const msgEl = document.getElementById('nfce-acao-msg');
  const xml = xmlOverride || (window._nfceUltima && window._nfceUltima.xml);
  const chave = chaveOverride || (window._nfceUltima && window._nfceUltima.chave) || 'cupom';
  if (!xml) {
    if (msgEl) { msgEl.textContent = 'XML da nota não disponível para impressão.'; msgEl.style.color = '#f87171'; }
    else alert('XML da nota não disponível para impressão.');
    return;
  }
  if (msgEl) { msgEl.textContent = '🖨️ Gerando cupom...'; msgEl.style.color = '#888'; }
  try {
    const resp = await fetch(`${SEFAZ_URL}/danfce`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ xml }),
    });
    if (!resp.ok) {
      let det = ''; try { det = (await resp.json()).erro || ''; } catch(e){}
      throw new Error(det || ('HTTP ' + resp.status));
    }
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    // abre em nova aba para impressão e também disponibiliza download
    const w = window.open(url, '_blank');
    if (!w) {
      const a = document.createElement('a');
      a.href = url; a.download = `cupom_${chave}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
    }
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    if (msgEl) { msgEl.textContent = '✓ Cupom gerado.'; msgEl.style.color = '#4caf50'; }
  } catch (e) {
    if (msgEl) { msgEl.textContent = 'Erro ao gerar cupom: ' + e.message; msgEl.style.color = '#f87171'; }
    else alert('Erro ao gerar cupom: ' + e.message);
  }
}

// Cancela a NFC-e (evento 110111). Pede justificativa (15-255 chars).
async function nfceCancelar(chave, protocolo, ambienteOverride) {
  const msgEl = document.getElementById('nfce-acao-msg');
  const setMsg = (t, c) => { if (msgEl) { msgEl.textContent = t; msgEl.style.color = c; } };
  if (!chave || !protocolo) { setMsg('Chave/protocolo ausentes para cancelar.', '#f87171'); return; }
  if (!_nfceEmpresa?.cert_path) { setMsg('Certificado não configurado.', '#f87171'); return; }
  const senha = (typeof getCertSenha === 'function') ? getCertSenha() : null;
  if (!senha) { setMsg('Senha do certificado não encontrada.', '#f87171'); return; }

  const just = prompt('Justificativa do cancelamento (mínimo 15 caracteres):', '');
  if (just === null) return; // cancelou o prompt
  if (just.trim().length < 15) { setMsg('Justificativa deve ter ao menos 15 caracteres.', '#f87171'); return; }

  const ambiente = ambienteOverride || (window._nfceUltima && window._nfceUltima.ambiente) || 'homologacao';
  setMsg('📡 Cancelando NFC-e...', '#888');
  try {
    const { data: cb } = await sb.storage.from('octano-certs').download(_nfceEmpresa.cert_path);
    const b64 = btoa(String.fromCharCode(...new Uint8Array(await cb.arrayBuffer())));
    const resp = await fetch(`${SEFAZ_URL}/cancelar-nfce`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chave, protocolo, justificativa: just.trim(),
        cnpj: (_nfceEmpresa.cnpj || '').replace(/\D/g, ''),
        cert_base64: b64, cert_senha: senha, ambiente,
      }),
    });
    const r = await resp.json();
    if (r.ok) {
      setMsg(`✓ NFC-e cancelada! Protocolo ${r.protocolo_cancelamento || ''}`, '#4caf50');
      // atualiza status no banco
      try {
        await sb.from('oct_nfce').update({
          status: 'cancelada', motivo_rejeicao: just.trim(),
        }).eq('chave_nfe', chave).eq('empresa_id', _nfceEmpresaId);
      } catch(e) { console.error('Erro ao atualizar status:', e); }
    } else {
      setMsg(`❌ ${r.cstat_evento || r.cstat_lote || ''} ${r.xmotivo || r.erro || 'falha'}`, '#f87171');
      console.error('Retorno /cancelar-nfce:', r);
    }
  } catch (e) {
    setMsg('Erro ao cancelar: ' + e.message, '#f87171');
  }
}

// ---------- HISTÓRICO DE NFC-e (listar / imprimir / cancelar) ----------
async function nfceAbrirHistorico() {
  const conteudo = document.getElementById('conteudo');
  conteudo.innerHTML = '<p style="color:#888;padding:20px">Carregando histórico...</p>';
  const { data: notas } = await sb.from('oct_nfce')
    .select('id,numero,serie,chave_nfe,protocolo,valor_total,status,ambiente,cpf_consumidor,data_emissao,xml_autorizado')
    .eq('empresa_id', _nfceEmpresaId).order('data_emissao', { ascending: false }).limit(100);

  window._nfceHist = notas || [];
  const linhas = (notas || []).map((n, i) => {
    const dt = n.data_emissao ? new Date(n.data_emissao).toLocaleString('pt-BR') : '—';
    const statusCor = n.status === 'autorizada' ? '#4caf50' : n.status === 'cancelada' ? '#f87171' : '#888';
    const podeCancelar = n.status === 'autorizada' && n.chave_nfe && n.protocolo;
    return `<tr style="border-bottom:1px solid #1a1d2e">
      <td style="padding:7px 8px">${n.numero || '—'}</td>
      <td style="padding:7px 8px">${dt}</td>
      <td style="padding:7px 8px;text-align:right">R$ ${Number(n.valor_total||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
      <td style="padding:7px 8px"><span style="color:${statusCor};font-weight:600">${n.status||'—'}</span></td>
      <td style="padding:7px 8px;font-size:0.7rem;color:#888">${n.ambiente||''}</td>
      <td style="padding:7px 8px;font-size:0.68rem;color:#666;max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${n.chave_nfe||'—'}</td>
      <td style="padding:7px 8px;text-align:center;white-space:nowrap">
        <button onclick="nfceHistImprimir(${i})" title="Imprimir cupom" style="padding:4px 8px;border-radius:4px;border:none;background:#2563eb;color:#fff;cursor:pointer;font-size:0.72rem">🖨️</button>
        ${podeCancelar ? `<button onclick="nfceHistCancelar(${i})" title="Cancelar" style="padding:4px 8px;border-radius:4px;border:1px solid #5a2a2a;background:transparent;color:#f87171;cursor:pointer;font-size:0.72rem;margin-left:4px">✕</button>` : ''}
      </td>
    </tr>`;
  }).join('');

  conteudo.innerHTML = `
    <div style="max-width:1100px;margin:0 auto">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <h2 style="color:#f97316">📋 Histórico de NFC-e</h2>
        <button onclick="navegarPara('nfce')" style="font-size:0.8rem;padding:6px 14px;border-radius:6px;border:1px solid #2a2d3e;background:#13151f;color:#60a5fa;cursor:pointer">← Voltar à venda</button>
      </div>
      <div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;overflow:auto">
        <table style="width:100%;border-collapse:collapse;font-size:0.82rem">
          <thead><tr style="color:#888;text-align:left;background:#1a1d2e">
            <th style="padding:8px">Nº</th><th style="padding:8px">Emissão</th>
            <th style="padding:8px;text-align:right">Total</th><th style="padding:8px">Status</th>
            <th style="padding:8px">Amb.</th><th style="padding:8px">Chave</th><th style="padding:8px;text-align:center">Ações</th>
          </tr></thead>
          <tbody>${linhas || `<tr><td colspan="7" style="text-align:center;padding:30px;color:#555">Nenhuma NFC-e emitida ainda.</td></tr>`}</tbody>
        </table>
      </div>
      <div id="nfce-hist-msg" style="margin-top:10px;font-size:0.82rem;text-align:center"></div>
    </div>
  `;
}

function nfceHistImprimir(i) {
  const n = (window._nfceHist || [])[i];
  if (!n) return;
  const msg = document.getElementById('nfce-hist-msg');
  if (!n.xml_autorizado) {
    if (msg) { msg.textContent = 'Esta nota não tem XML salvo para impressão.'; msg.style.color = '#f87171'; }
    return;
  }
  // reusa a função de impressão, passando o xml e a chave desta nota
  const fakeMsg = document.getElementById('nfce-hist-msg');
  window._nfceUltima = { xml: n.xml_autorizado, chave: n.chave_nfe };
  nfceImprimirCupomHist(n.xml_autorizado, n.chave_nfe);
}

async function nfceImprimirCupomHist(xml, chave) {
  const msg = document.getElementById('nfce-hist-msg');
  if (msg) { msg.textContent = '🖨️ Gerando cupom...'; msg.style.color = '#888'; }
  try {
    const resp = await fetch(`${SEFAZ_URL}/danfce`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ xml }),
    });
    if (!resp.ok) { let d=''; try{d=(await resp.json()).erro||'';}catch(e){} throw new Error(d||('HTTP '+resp.status)); }
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const w = window.open(url, '_blank');
    if (!w) { const a=document.createElement('a'); a.href=url; a.download=`cupom_${chave}.pdf`; document.body.appendChild(a); a.click(); a.remove(); }
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    if (msg) { msg.textContent = '✓ Cupom gerado.'; msg.style.color = '#4caf50'; }
  } catch (e) {
    if (msg) { msg.textContent = 'Erro ao gerar cupom: ' + e.message; msg.style.color = '#f87171'; }
  }
}

async function nfceHistCancelar(i) {
  const n = (window._nfceHist || [])[i];
  if (!n) return;
  const msg = document.getElementById('nfce-hist-msg');
  const setMsg = (t,c)=>{ if(msg){ msg.textContent=t; msg.style.color=c; } };
  if (!_nfceEmpresa?.cert_path) { setMsg('Certificado não configurado.', '#f87171'); return; }
  const senha = (typeof getCertSenha === 'function') ? getCertSenha() : null;
  if (!senha) { setMsg('Senha do certificado não encontrada.', '#f87171'); return; }
  const just = prompt('Justificativa do cancelamento (mínimo 15 caracteres):', '');
  if (just === null) return;
  if (just.trim().length < 15) { setMsg('Justificativa deve ter ao menos 15 caracteres.', '#f87171'); return; }
  setMsg('📡 Cancelando...', '#888');
  try {
    const { data: cb } = await sb.storage.from('octano-certs').download(_nfceEmpresa.cert_path);
    const b64 = btoa(String.fromCharCode(...new Uint8Array(await cb.arrayBuffer())));
    const resp = await fetch(`${SEFAZ_URL}/cancelar-nfce`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chave: n.chave_nfe, protocolo: n.protocolo, justificativa: just.trim(),
        cnpj: (_nfceEmpresa.cnpj||'').replace(/\D/g,''),
        cert_base64: b64, cert_senha: senha, ambiente: n.ambiente || 'homologacao',
      }),
    });
    const r = await resp.json();
    if (r.ok) {
      setMsg(`✓ NFC-e cancelada! Protocolo ${r.protocolo_cancelamento||''}`, '#4caf50');
      await sb.from('oct_nfce').update({ status:'cancelada', motivo_rejeicao: just.trim() }).eq('id', n.id);
      setTimeout(() => nfceAbrirHistorico(), 1200);
    } else {
      setMsg(`❌ ${r.cstat_evento || r.cstat_lote || ''} ${r.xmotivo || r.erro || 'falha'}`, '#f87171');
    }
  } catch (e) {
    setMsg('Erro ao cancelar: ' + e.message, '#f87171');
  }
}
