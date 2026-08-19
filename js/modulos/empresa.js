async function moduloEmpresa() {
  const conteudo = document.getElementById('conteudo');

  // dados do usuario logado (usados nos campos "Seu nome" e "perfil")
  const session = await getSession();
  const { data: perfil } = await sb.from('oct_perfis')
    .select('nome, perfil, master').eq('id', session.user.id).single();

  // modo de criacao: quando true, o formulario abre vazio para cadastrar
  // uma empresa NOVA (sem sobrescrever a atual). Controlado por _empNova.
  const criando = window._empNova === true;

  let emp = {};
  if (!criando) {
    // carrega a empresa ATIVA (a selecionada no seletor do topo), nao mais
    // a empresa fixa do perfil — assim a tela acompanha o multi-empresa.
    const empId = (typeof empresaAtiva === 'function') ? empresaAtiva() : null;
    if (empId) {
      const { data } = await sb.from('oct_empresas').select('*').eq('id', empId).single();
      emp = data || {};
    }
  }

  const UFS = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'];

  // Calcula badge do certificado
  let certBadge = '';
  if (emp.cert_nome && emp.cert_validade) {
    const val = new Date(emp.cert_validade);
    const hoje = new Date();
    const dias = Math.floor((val - hoje) / (1000 * 60 * 60 * 24));
    if (dias < 0) {
      certBadge = `<span class="cert-badge vencido">❌ Vencido há ${Math.abs(dias)} dias</span>`;
    } else if (dias <= 30) {
      certBadge = `<span class="cert-badge alerta">⚠️ Vence em ${dias} dias</span>`;
    } else {
      certBadge = `<span class="cert-badge ok">✅ Válido por ${dias} dias</span>`;
    }
  }

  // botao "Nova empresa" so aparece para usuario master (que gerencia varias)
  const podeNova = (typeof EMPRESA !== 'undefined' && EMPRESA.ehMaster);
  const cabecalho = criando
    ? `<h2>➕ Nova Empresa</h2><button onclick="empCancelarNova()" style="padding:6px 14px;border-radius:6px;border:1px solid #888;background:transparent;color:#aaa;cursor:pointer">← Cancelar</button>`
    : `<h2>⚙️ Cadastro da Empresa</h2>` + (podeNova
        ? `<button onclick="empAbrirNova()" style="padding:6px 14px;border-radius:6px;border:none;background:#22c55e;color:#fff;cursor:pointer;font-weight:600">➕ Nova empresa</button>`
        : '');

  // painel master: TODAS as empresas (inclui ocultas) com toggle ativar/ocultar
  let painelEmpresasHtml = '';
  if (perfil?.master === true || (typeof EMPRESA !== 'undefined' && EMPRESA.ehMaster)) {
    const { data: _todas } = await sb.from('oct_empresas').select('id,nome,ativo').order('nome', { ascending: true });
    const _ativaId = (typeof empresaAtiva === 'function') ? empresaAtiva() : null;
    const _linhas = (_todas || []).map(e => {
      const oc = e.ativo === false;
      const at = e.id === _ativaId;
      return '<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-bottom:1px solid #1c1f2e">'
        + '<span style="flex:1;color:' + (oc ? '#6b7280' : '#dbe2ea') + '">' + (e.nome || '—')
        + (at ? ' <small style="color:#f97316">(ativa)</small>' : '') + '</span>'
        + '<span style="font-size:0.72rem;padding:2px 8px;border-radius:10px;border:1px solid ' + (oc ? '#5a2a2a' : '#245a35')
        + ';color:' + (oc ? '#f87171' : '#4ade80') + ';background:' + (oc ? '#241012' : '#0f2417') + '">'
        + (oc ? 'Oculta' : 'Visível') + '</span>'
        + '<button onclick="empToggleAtivo(\'' + e.id + '\', ' + (oc ? 'true' : 'false') + ')" '
        + 'style="padding:5px 12px;border-radius:6px;border:1px solid #2a2d3e;background:' + (oc ? '#123322' : '#1b2130')
        + ';color:' + (oc ? '#4ade80' : '#cdd6e4') + ';cursor:pointer;font-size:0.76rem">'
        + (oc ? '↑ Reativar' : '⨯ Ocultar') + '</button></div>';
    }).join('');
    painelEmpresasHtml = '<div class="modulo-header" style="margin-top:6px"><h2>🏢 Empresas da rede</h2></div>'
      + '<div style="background:#0f111a;border:1px solid #21232f;border-radius:10px;margin-bottom:6px">'
      + (_linhas || '<div style="padding:12px;color:#6b7280">Nenhuma empresa.</div>') + '</div>'
      + '<p style="color:#6b7688;font-size:0.74rem;margin:-2px 0 22px">Ocultar tira a empresa do seletor e do monitor (não apaga nada). Reativar traz de volta.</p>';
  }

  conteudo.innerHTML = `
    <div class="modulo-container">

      <div class="modulo-header" style="display:flex;justify-content:space-between;align-items:center">${cabecalho}</div>
      ${painelEmpresasHtml}
      <div class="form-grid">

        <div class="form-group">
          <label>CNPJ</label>
          <div style="display:flex;gap:8px">
            <input id="emp-cnpj" type="text" value="${emp.cnpj || ''}" placeholder="00.000.000/0000-00" maxlength="18" style="flex:1" />
            <button onclick="consultarCNPJ()" style="padding:8px 12px;border-radius:6px;border:none;background:#f97316;color:#fff;cursor:pointer;white-space:nowrap">🔍 Consultar</button>
          </div>
          <span id="cnpj-status" style="font-size:0.75rem;color:#888;margin-top:2px;display:block"></span>
        </div>

        <div class="form-group">
          <label>Inscrição Estadual</label>
          <div style="display:flex;gap:8px;align-items:center">
            <input id="emp-ie" type="text" value="${emp.ie || ''}" placeholder="Preencha manualmente" style="flex:1" />
            <span title="A IE não possui consulta automática disponível" style="color:#888;cursor:help">ℹ️</span>
          </div>
          <span style="font-size:0.72rem;color:#555;margin-top:2px;display:block">Consulte no Sintegra do seu estado</span>
        </div>

        <div class="form-group">
          <label>Inscrição Municipal</label>
          <input id="emp-im" type="text" value="${emp.inscricao_municipal || ''}" placeholder="Nº na prefeitura (NFS-e)" />
          <span style="font-size:0.72rem;color:#555;margin-top:2px;display:block">Necessária para emitir Nota de Serviço (NFS-e)</span>
        </div>

        <div class="form-group span2">
          <label>Razão Social *</label>
          <input id="emp-nome" type="text" value="${emp.nome || ''}" placeholder="Razão Social completa" />
        </div>
        <div class="form-group span2">
          <label>Nome Fantasia</label>
          <input id="emp-fantasia" type="text" value="${emp.nome_fantasia || ''}" placeholder="Nome Fantasia" />
        </div>
        <div class="form-group">
          <label>Telefone</label>
          <input id="emp-telefone" type="text" value="${emp.telefone || ''}" placeholder="(00) 00000-0000" />
        </div>
        <div class="form-group">
          <label>E-mail</label>
          <input id="emp-email" type="text" value="${emp.email || ''}" placeholder="email@posto.com.br" />
        </div>
        <div class="form-group span2">
          <label>Endereço</label>
          <input id="emp-endereco" type="text" value="${emp.endereco || ''}" placeholder="Rua, número, bairro" />
        </div>
        <div class="form-group">
          <label>Cidade</label>
          <input id="emp-cidade" type="text" value="${emp.cidade || ''}" placeholder="Cidade" />
        </div>
        <div class="form-group">
          <label>UF</label>
          <select id="emp-uf">
            ${UFS.map(uf => `<option value="${uf}" ${emp.uf === uf ? 'selected' : ''}>${uf}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>CEP</label>
          <input id="emp-cep" type="text" value="${emp.cep || ''}" placeholder="00000-000" maxlength="9" />
        </div>
        <div class="form-group">
          <label>Regime Tributário</label>
          <select id="emp-regime">
            <option value="simples" ${emp.regime_tributario === 'simples' ? 'selected' : ''}>Simples Nacional</option>
            <option value="presumido" ${emp.regime_tributario === 'presumido' ? 'selected' : ''}>Lucro Presumido</option>
            <option value="real" ${emp.regime_tributario === 'real' ? 'selected' : ''}>Lucro Real</option>
          </select>
        </div>
      </div>

      <!-- CERTIFICADO DIGITAL -->
      <div class="modulo-header" style="margin-top:28px"><h2>🔐 Certificado Digital (NF-e)</h2></div>
      <div class="cert-box">

        ${emp.cert_nome ? `
          <div class="cert-atual">
            <span style="font-size:2rem">🔒</span>
            <div style="flex:1">
              <div class="cert-nome">${emp.cert_nome}</div>
              <div class="cert-detalhe">Titular: ${emp.cert_titular || '-'}</div>
              <div class="cert-detalhe">Validade: ${emp.cert_validade ? new Date(emp.cert_validade).toLocaleDateString('pt-BR') : '-'}</div>
              ${certBadge}
            </div>
            <button onclick="trocarCertificado()" style="padding:6px 12px;border-radius:6px;border:1px solid #f97316;background:transparent;color:#f97316;cursor:pointer;font-size:0.8rem">🔄 Trocar</button>
            <button onclick="removerCertificado()" style="padding:6px 12px;border-radius:6px;border:1px solid #f44;background:transparent;color:#f44;cursor:pointer;font-size:0.8rem">✕</button>
          </div>
        ` : ''}

        <div class="cert-upload-area" id="cert-upload-area" style="${emp.cert_nome ? 'display:none' : ''}">
          <div class="cert-drop" onclick="document.getElementById('cert-file').click()">
            <span style="font-size:2rem">📂</span>
            <p>Clique para selecionar o certificado <strong>.pfx</strong> ou <strong>.p12</strong></p>
            <p style="font-size:0.75rem;color:#555">O certificado é lido localmente e validado antes do envio</p>
          </div>
          <input type="file" id="cert-file" accept=".pfx,.p12" style="display:none" onchange="selecionouCertificado(this)" />
        </div>

        <div id="cert-senha-area" style="display:none;margin-top:14px">
          <div class="form-grid" style="max-width:500px">
            <div class="form-group span2">
              <label>Arquivo selecionado</label>
              <input id="cert-arquivo-nome" type="text" disabled style="opacity:0.6" />
            </div>
            <div class="form-group span2">
              <label>Senha do certificado *</label>
              <input id="cert-senha" type="password" placeholder="Digite a senha do certificado" />
            </div>
          </div>
          <div id="cert-preview" style="display:none;background:#13151f;border:1px solid #2a2d3e;border-radius:8px;padding:14px;margin:12px 0;max-width:500px">
            <div style="font-size:0.8rem;color:#888;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px">Informações do certificado</div>
            <div id="cert-preview-content"></div>
          </div>
          <div style="display:flex;gap:10px;align-items:center;margin-top:8px">
            <button onclick="validarCertificado()" style="padding:8px 20px;border-radius:6px;border:none;background:#2a4a2a;color:#4caf50;cursor:pointer;font-weight:bold">🔍 Validar</button>
            <button id="btn-upload-cert" onclick="uploadCertificado()" class="btn-salvar" style="display:none">📤 Confirmar e salvar</button>
            <button onclick="cancelarCert()" style="padding:8px 16px;border-radius:6px;border:1px solid #444;background:transparent;color:#aaa;cursor:pointer">Cancelar</button>
            <span id="cert-msg" style="font-size:0.85rem"></span>
          </div>
        </div>
      </div>

      <!-- CSC (NFC-e) -->
      <div class="modulo-header" style="margin-top:28px"><h2>🔑 CSC — Código de Segurança (NFC-e)</h2></div>
      <p style="color:#888;font-size:0.85rem;margin:-6px 0 12px">
        Necessário para emitir NFC-e (gera o QR Code). Obtenha no portal da SEFAZ do seu estado
        (em MG: SIARE → Credenciamento NFC-e). O CSC é um código; o ID do CSC é o número de identificação dele (ex: 000001).
      </p>
      <div class="form-grid">
        <div class="form-group span2">
          <label>CSC (Código de Segurança do Contribuinte)</label>
          <input id="emp-csc" type="text" value="${emp.csc || ''}" placeholder="Cole aqui o código CSC" autocomplete="off" />
        </div>
        <div class="form-group">
          <label>ID do CSC (cIdToken)</label>
          <input id="emp-csc-id" type="text" value="${emp.csc_id || ''}" placeholder="Ex: 000001" autocomplete="off" />
        </div>
      </div>

      <!-- NUMERACAO DA NFC-e -->
      <div class="modulo-header" style="margin-top:28px"><h2>🔢 Numeração da NFC-e</h2></div>
      <p style="color:#888;font-size:0.85rem;margin:-6px 0 12px">
        Série e próximo número do cupom (NFC-e modelo 65). Na maioria dos casos a série é <strong>1</strong>.
        Se a empresa já emitia em outro sistema, informe o <strong>próximo número</strong> a usar
        (último número emitido + 1) para não duplicar e ser rejeitada pela SEFAZ.
      </p>
      <div class="form-grid">
        <div class="form-group">
          <label>Série da NFC-e</label>
          <input id="emp-nfce-serie" type="number" min="1" value="${emp.nfce_serie != null ? emp.nfce_serie : 1}" placeholder="1" />
        </div>
        <div class="form-group">
          <label>Próximo número a emitir</label>
          <input id="emp-nfce-num" type="number" min="1" value="${emp.nfce_proximo_numero != null ? emp.nfce_proximo_numero : 1}" placeholder="1" />
        </div>
      </div>

      <!-- INTEGRAÇÕES -->
      <div class="modulo-header" style="margin-top:28px"><h2>🔌 Integrações do Posto</h2></div>
      <p style="color:#888;font-size:0.85rem;margin:-6px 0 12px">
        Ligue conforme o que o posto usa. O PDV oculta as formas de pagamento correspondentes
        (com EDI ligado o cartão entra automático e some do PDV; com Cofre, o dinheiro some).
      </p>
      <div style="display:flex;flex-direction:column;gap:10px;max-width:560px">
        <label style="display:flex;align-items:center;gap:10px;color:#ddd;font-size:0.88rem;background:#13151f;border:1px solid #2a2d3e;border-radius:8px;padding:10px 14px;cursor:pointer">
          <input type="checkbox" id="emp-usa-edi" ${emp.usa_edi ? 'checked' : ''}>
          <span><strong>EDI (PagBank)</strong> — recebimentos de cartão automáticos. <span style="color:#888">O PDV oculta as formas classificadas como <em>Cartão</em>.</span></span>
        </label>
        <label style="display:flex;align-items:center;gap:10px;color:#ddd;font-size:0.88rem;background:#13151f;border:1px solid #2a2d3e;border-radius:8px;padding:10px 14px;cursor:pointer">
          <input type="checkbox" id="emp-usa-cofre" ${emp.usa_cofre ? 'checked' : ''}>
          <span><strong>Cofre inteligente</strong> — o dinheiro vai pro cofre. <span style="color:#888">O PDV oculta as formas classificadas como <em>Dinheiro</em>.</span></span>
        </label>

        <!-- LIMITE DA SANGRIA: só faz sentido SEM cofre (com cofre o dinheiro
             vai pelo depósito e a sangria nem aparece no PDV). -->
        <div style="background:#13151f;border:1px solid #2a2d3e;border-radius:8px;padding:12px 14px">
          <label style="color:#ddd;font-size:0.88rem;display:block;margin-bottom:4px">
            💰 <strong>Limite para sangria obrigatória (R$)</strong>
          </label>
          <p style="color:#888;font-size:0.8rem;line-height:1.5;margin-bottom:8px">
            Quando o dinheiro pendente no PDV passar deste valor e continuar acima por
            10 minutos, o caixa trava e exige a sangria. Os 10 minutos existem para dar
            tempo de o cartão cair e a nota a prazo ser emitida — o que sobra é dinheiro
            de verdade. <span style="color:#666"><b>Vazio ou 0 = trava DESLIGADA</b> (a
            sangria manual continua no PDV). Preencha um valor para ligar a trava.
            Não se aplica a posto com cofre.</span>
          </p>
          <input id="emp-sangria-limite" type="number" step="10" min="0"
            value="${emp.sangria_limite != null ? emp.sangria_limite : ''}" placeholder="500"
            style="width:180px;padding:9px;border-radius:6px;border:1px solid #2a2d3e;background:#0d1017;color:#ddd" />
        </div>
      </div>

      <!-- BANCO SICOOB (extrato -> conciliação de contas a pagar) -->
      <div class="modulo-header" style="margin-top:28px"><h2>🏦 Banco Sicoob — extrato e conciliação</h2></div>
      <p style="color:#888;font-size:0.85rem;margin:-6px 0 12px">
        O gateway lê o extrato desta conta e o sistema baixa sozinho as contas a pagar
        (juros/multa e desconto separados nas contas certas). O <strong>client_id</strong> sai do
        portal <em>developers.sicoob.com.br</em> (aplicativo com a API <em>Conta Corrente</em> assinada).
        O certificado é o mesmo e-CNPJ A1 da NF-e (fica no Railway, não aqui).
      </p>
      <div class="form-grid" style="max-width:760px">
        <div class="form-group">
          <label>Nº da conta corrente</label>
          <input id="sic-conta" type="text" placeholder="101789-6" />
        </div>
        <div class="form-group span2">
          <label>client_id (aplicativo do portal)</label>
          <input id="sic-client" type="text" placeholder="xxxxxxxx-xxxx-..." />
        </div>
        <div class="form-group">
          <label>Ambiente</label>
          <select id="sic-amb"><option value="producao">Produção</option><option value="sandbox">Sandbox (teste)</option></select>
        </div>
        <div class="form-group">
          <label>Integração ativa</label>
          <select id="sic-ativo"><option value="true">Sim</option><option value="false">Não</option></select>
        </div>
        <div class="form-group span2" style="align-self:end">
          <button class="btn-salvar" style="background:#0a6e4f" onclick="salvarSicoob()">💾 Salvar integração Sicoob</button>
          <span id="sic-msg" class="form-msg"></span>
        </div>
      </div>
      <p id="sic-status" style="color:#667;font-size:0.8rem;margin-top:6px">carregando situação…</p>

      <!-- PERFIL -->
      <div class="modulo-header" style="margin-top:28px"><h2>👤 Meu Perfil</h2></div>
      <div class="form-grid">
        <div class="form-group span2">
          <label>Nome completo *</label>
          <input id="perf-nome" type="text" value="${perfil?.nome || ''}" placeholder="Seu nome" />
        </div>
        <div class="form-group">
          <label>Perfil de acesso</label>
          <input type="text" value="${perfil?.perfil || 'master'}" disabled style="opacity:0.5" />
        </div>
        <div class="form-group">
          <label>Usuário</label>
          <input type="text" value="${session.user.email.split('@')[0]}" disabled style="opacity:0.5" />
        </div>
      </div>

      <div class="form-acoes">
        <button class="btn-salvar" onclick="salvarEmpresa()">💾 Salvar empresa</button>
        <span id="emp-msg" class="form-msg"></span>
      </div>
    </div>
  `;

  // Mascaras
  document.getElementById('emp-cnpj').addEventListener('input', function() {
    let v = this.value.replace(/\D/g, '');
    v = v.replace(/(\d{2})(\d)/, '$1.$2');
    v = v.replace(/(\d{3})(\d)/, '$1.$2');
    v = v.replace(/(\d{3})(\d)/, '$1/$2');
    v = v.replace(/(\d{4})(\d)/, '$1-$2');
    this.value = v;
  });
  document.getElementById('emp-cnpj').addEventListener('blur', function() {
    if (this.value.replace(/\D/g, '').length === 14) consultarCNPJ();
  });
  document.getElementById('emp-cep').addEventListener('input', function() {
    let v = this.value.replace(/\D/g, '');
    v = v.replace(/(\d{5})(\d)/, '$1-$2');
    this.value = v;
  });
  empSicoobCarregar();
}

// ─── Integração Sicoob (extrato → conciliação) ─────────────────────────────
// prefixo das envs do certificado no Railway, derivado do nome do posto
function _sicPrefix(nome) {
  const n = String(nome || '').toUpperCase();
  if (n.includes('TIJUCO')) return 'TIJ';
  if (n.includes('FLORESTAL')) return 'FLO';
  if (n.includes('ANTONIO CARLOS')) return 'AC';
  if (n.includes('GLORIA')) return 'GLO';
  return 'POSTO';
}

async function empSicoobCarregar() {
  const eid = (typeof empresaAtiva === 'function') ? empresaAtiva() : null;
  const st = document.getElementById('sic-status');
  if (!eid || !document.getElementById('sic-conta')) return;
  try {
    const { data, error } = await sb.from('oct_sicoob_contas').select('*').eq('empresa_id', eid).maybeSingle();
    if (error) { if (st) st.textContent = '⚠ ' + error.message + ' — rode o SQL-SICOOB-EXTRATO.sql.'; return; }
    if (data) {
      document.getElementById('sic-conta').value = data.numero_conta || '';
      document.getElementById('sic-client').value = data.client_id || '';
      document.getElementById('sic-amb').value = data.ambiente || 'producao';
      document.getElementById('sic-ativo').value = String(data.ativo !== false);
    }
    // situação: último movimento importado do extrato
    const { data: mov } = await sb.from('oct_banco_movimentos').select('data,criado_em')
      .eq('empresa_id', eid).order('criado_em', { ascending: false }).limit(1);
    if (st) st.textContent = (mov && mov.length)
      ? `✅ Extrato chegando — último movimento importado: ${mov[0].data} (às ${new Date(mov[0].criado_em).toLocaleString('pt-BR')}).`
      : (data ? '⏳ Cadastro salvo — nenhum movimento importado ainda (worker roda a cada 15 min; confira as variáveis do certificado no Railway).'
              : 'Sem cadastro ainda — preencha e salve.');
  } catch (e) { if (st) st.textContent = '⚠ ' + (e.message || e); }
}

async function salvarSicoob() {
  const msg = document.getElementById('sic-msg');
  const eid = (typeof empresaAtiva === 'function') ? empresaAtiva() : null;
  if (!eid) { msg.textContent = 'Selecione a empresa.'; msg.style.color = '#f44'; return; }
  const conta = document.getElementById('sic-conta').value.trim();
  if (!conta) { msg.textContent = 'Informe o número da conta.'; msg.style.color = '#f44'; return; }
  msg.textContent = 'Salvando…'; msg.style.color = '#aaa';
  let nomeEmp = '';
  try { const { data: e } = await sb.from('oct_empresas').select('nome').eq('id', eid).single(); nomeEmp = e?.nome || ''; } catch (er) {}
  const { error } = await sb.from('oct_sicoob_contas').upsert({
    empresa_id: eid, numero_conta: conta,
    client_id: document.getElementById('sic-client').value.trim() || null,
    ambiente: document.getElementById('sic-amb').value,
    ativo: document.getElementById('sic-ativo').value === 'true',
    env_prefix: _sicPrefix(nomeEmp),
  }, { onConflict: 'empresa_id' });
  if (error) { msg.textContent = 'Erro: ' + error.message; msg.style.color = '#f44'; return; }
  msg.textContent = 'Salvo! O gateway pega no próximo ciclo (15 min).'; msg.style.color = '#4caf50';
  empSicoobCarregar();
}

// ─── Ativar / Ocultar empresa (master) ──────────────────────────────────────
async function empToggleAtivo(id, novoAtivo) {
  const acao = novoAtivo ? 'reativar' : 'ocultar';
  if (!confirm('Deseja ' + acao + ' esta empresa?\n\n' + (novoAtivo
      ? 'Ela volta a aparecer no seletor e no monitor.'
      : 'Ela some do seletor e do monitor. Nada é apagado — dá pra reativar depois.'))) return;
  const { error } = await sb.from('oct_empresas').update({ ativo: novoAtivo }).eq('id', id);
  if (error) { alert('Erro ao ' + acao + ': ' + (error.message || error)); return; }
  // recarrega a lista de empresas (seletor) e a tela
  try {
    const s = (typeof getSession === 'function') ? await getSession() : null;
    if (s && typeof empresaCarregarContexto === 'function') await empresaCarregarContexto(s);
    if (typeof empresaRenderSeletor === 'function') empresaRenderSeletor();
  } catch (e) { /* segue: a tela recarrega mesmo assim */ }
  moduloEmpresa();
}

// ─── CNPJ ────────────────────────────────────────────────────────────────────
async function consultarCNPJ() {
  const cnpj = document.getElementById('emp-cnpj').value.replace(/\D/g, '');
  const status = document.getElementById('cnpj-status');
  if (cnpj.length !== 14) { status.textContent = 'CNPJ inválido.'; status.style.color = '#f44'; return; }
  status.textContent = '🔄 Consultando Receita Federal...'; status.style.color = '#888';
  try {
    const resp = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
    if (!resp.ok) throw new Error();
    const d = await resp.json();
    document.getElementById('emp-nome').value = d.razao_social || '';
    document.getElementById('emp-fantasia').value = d.nome_fantasia || d.razao_social || '';
    const end = [d.logradouro, d.numero, d.complemento, d.bairro].filter(Boolean).join(', ');
    document.getElementById('emp-endereco').value = end;
    document.getElementById('emp-cidade').value = d.municipio || '';
    document.getElementById('emp-cep').value = (d.cep || '').replace(/(\d{5})(\d{3})/, '$1-$2');
    if (d.ddd_telefone_1) document.getElementById('emp-telefone').value = d.ddd_telefone_1;
    if (d.uf) {
      const sel = document.getElementById('emp-uf');
      for (let i = 0; i < sel.options.length; i++) {
        if (sel.options[i].value === d.uf) { sel.selectedIndex = i; break; }
      }
    }
    if (d.opcao_pelo_simples) document.getElementById('emp-regime').value = 'simples';
    status.textContent = '✅ Dados preenchidos! Confira a IE manualmente e salve.';
    status.style.color = '#4caf50';
    document.getElementById('emp-ie').style.borderColor = '#f97316';
    document.getElementById('emp-ie').focus();
  } catch(e) {
    status.textContent = '❌ CNPJ não encontrado. Preencha manualmente.';
    status.style.color = '#f44';
  }
}

// ─── CERTIFICADO ─────────────────────────────────────────────────────────────
let certFile = null;
let certDados = null;

function selecionouCertificado(input) {
  if (!input.files.length) return;
  certFile = input.files[0];
  certDados = null;
  document.getElementById('cert-arquivo-nome').value = certFile.name;
  document.getElementById('cert-senha-area').style.display = 'block';
  document.getElementById('cert-upload-area').style.display = 'none';
  document.getElementById('cert-preview').style.display = 'none';
  document.getElementById('btn-upload-cert').style.display = 'none';
  document.getElementById('cert-msg').textContent = '';
}

function trocarCertificado() {
  document.getElementById('cert-upload-area').style.display = 'block';
}

function cancelarCert() {
  certFile = null; certDados = null;
  document.getElementById('cert-senha-area').style.display = 'none';
  document.getElementById('cert-upload-area').style.display = 'block';
  document.getElementById('cert-file').value = '';
  document.getElementById('cert-preview').style.display = 'none';
  document.getElementById('btn-upload-cert').style.display = 'none';
}

async function validarCertificado() {
  const senha = document.getElementById('cert-senha').value;
  const msg = document.getElementById('cert-msg');
  if (!certFile) return;
  if (!senha) { msg.textContent = 'Informe a senha.'; msg.style.color = '#f44'; return; }

  msg.textContent = '🔄 Lendo certificado...'; msg.style.color = '#888';

  try {
    const buffer = await certFile.arrayBuffer();
    const p12Der = forge.util.createBuffer(buffer);
    const p12Asn1 = forge.asn1.fromDer(p12Der);
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, senha);

    // Extrai certificado
    let cert = null;
    for (const safeContents of p12.safeContents) {
      for (const safeBag of safeContents.safeBags) {
        if (safeBag.type === forge.pki.oids.certBag) {
          cert = safeBag.cert;
          break;
        }
      }
      if (cert) break;
    }

    if (!cert) throw new Error('Certificado não encontrado no arquivo.');

    const validade = new Date(cert.validity.notAfter);
    const emissao = new Date(cert.validity.notBefore);
    const hoje = new Date();
    const dias = Math.floor((validade - hoje) / (1000 * 60 * 60 * 24));

    // Extrai CN (razão social) e serialNumber (CNPJ)
    const cn = cert.subject.getField('CN')?.value || '';
    const serial = cert.subject.getField('serialNumber')?.value || '';

    certDados = {
      cert_nome: certFile.name,
      cert_titular: cn,
      cert_validade: validade.toISOString().split('T')[0],
      cert_emissao: emissao.toISOString().split('T')[0],
    };

    let statusHtml = '';
    if (dias < 0) {
      statusHtml = `<span class="cert-badge vencido">❌ VENCIDO há ${Math.abs(dias)} dias</span>`;
    } else if (dias <= 30) {
      statusHtml = `<span class="cert-badge alerta">⚠️ Vence em ${dias} dias — renove em breve!</span>`;
    } else {
      statusHtml = `<span class="cert-badge ok">✅ Válido por ${dias} dias</span>`;
    }

    document.getElementById('cert-preview-content').innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div><span style="color:#888;font-size:0.78rem">TITULAR</span><br><strong>${cn}</strong></div>
        <div><span style="color:#888;font-size:0.78rem">CPF/CNPJ</span><br><strong>${serial}</strong></div>
        <div><span style="color:#888;font-size:0.78rem">EMISSÃO</span><br><strong>${emissao.toLocaleDateString('pt-BR')}</strong></div>
        <div><span style="color:#888;font-size:0.78rem">VALIDADE</span><br><strong>${validade.toLocaleDateString('pt-BR')}</strong></div>
      </div>
      <div style="margin-top:10px">${statusHtml}</div>
    `;
    document.getElementById('cert-preview').style.display = 'block';
    document.getElementById('btn-upload-cert').style.display = dias >= 0 ? 'inline-block' : 'none';
    msg.textContent = dias < 0 ? '⚠️ Certificado vencido. Não é possível salvar.' : '';
    msg.style.color = '#f44';

  } catch(e) {
    msg.textContent = '❌ Erro: ' + (e.message.includes('Invalid') ? 'Senha incorreta.' : e.message);
    msg.style.color = '#f44';
    document.getElementById('cert-preview').style.display = 'none';
  }
}

async function uploadCertificado() {
  if (!certFile || !certDados) return;
  const senha = document.getElementById('cert-senha').value;
  const msg = document.getElementById('cert-msg');
  msg.textContent = '📤 Enviando...'; msg.style.color = '#888';

  const session = await getSession();
  const empresaId = (typeof empresaAtiva==='function') ? empresaAtiva() : null;
  if (!empresaId) { msg.textContent = 'Salve os dados da empresa primeiro.'; msg.style.color = '#f44'; return; }

  const path = `certificados/${empresaId}/${certFile.name}`;
  const { error: upErr } = await sb.storage.from('octano-certs').upload(path, certFile, { upsert: true });
  if (upErr) { msg.textContent = 'Erro no upload: ' + upErr.message; msg.style.color = '#f44'; return; }

  await sb.from('oct_empresas').update({
    ...certDados,
    cert_path: path,
  }).eq('id', empresaId);

  // cifra e grava a SENHA do certificado no banco (cert_senha_cifrada).
  // A cifragem usa a CHAVE_MESTRA, que só existe no servidor SEFAZ — por isso
  // mandamos a senha para a rota /cadastrar-cert (única que recebe a senha em texto).
  try {
    const resp = await fetch(`${SEFAZ_URL}/cadastrar-cert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ empresa_id: empresaId, senha }),
    });
    const r = await resp.json().catch(() => ({}));
    if (!resp.ok || r.ok === false) {
      msg.textContent = 'Arquivo enviado, mas falhou ao salvar a senha: ' + (r.erro || resp.status);
      msg.style.color = '#f44';
      return;
    }
  } catch (e) {
    msg.textContent = 'Arquivo enviado, mas erro ao salvar a senha: ' + e.message;
    msg.style.color = '#f44';
    return;
  }

  // guarda a senha do certificado para reaproveitar na manifestacao de NF-e
  if (typeof setCertSenha === 'function') setCertSenha(senha);

  msg.textContent = '✅ Certificado e senha salvos com sucesso!';
  msg.style.color = '#4caf50';
  setTimeout(() => location.reload(), 1200);
}

async function removerCertificado() {
  if (!confirm('Remover certificado digital?')) return;
  const session = await getSession();
  const _eid = (typeof empresaAtiva==='function') ? empresaAtiva() : null;
  await sb.from('oct_empresas').update({
    cert_nome: null, cert_path: null, cert_validade: null, cert_titular: null, cert_emissao: null
  }).eq('id', _eid);
  // limpa a senha guardada ao remover o certificado
  if (typeof setCertSenha === 'function') setCertSenha(null);
  location.reload();
}

// ─── SALVAR EMPRESA ───────────────────────────────────────────────────────────
async function salvarEmpresa() {
  const msg = document.getElementById('emp-msg');
  msg.textContent = 'Salvando...'; msg.style.color = '#aaa';
  const session = await getSession();

  const dadosEmpresa = {
    nome: document.getElementById('emp-nome').value.trim(),
    nome_fantasia: document.getElementById('emp-fantasia').value.trim(),
    cnpj: document.getElementById('emp-cnpj').value.trim(),
    ie: document.getElementById('emp-ie').value.trim(),
    inscricao_municipal: (document.getElementById('emp-im')?.value || '').trim(),
    telefone: document.getElementById('emp-telefone').value.trim(),
    email: document.getElementById('emp-email').value.trim(),
    endereco: document.getElementById('emp-endereco').value.trim(),
    cidade: document.getElementById('emp-cidade').value.trim(),
    uf: document.getElementById('emp-uf').value,
    cep: document.getElementById('emp-cep').value.trim(),
    regime_tributario: document.getElementById('emp-regime').value,
    csc: (document.getElementById('emp-csc')?.value || '').trim(),
    csc_id: (document.getElementById('emp-csc-id')?.value || '').trim(),
    nfce_serie: parseInt(document.getElementById('emp-nfce-serie')?.value, 10) || 1,
    nfce_proximo_numero: parseInt(document.getElementById('emp-nfce-num')?.value, 10) || 1,
    usa_edi: !!document.getElementById('emp-usa-edi')?.checked,
    usa_cofre: !!document.getElementById('emp-usa-cofre')?.checked,
    // limite da sangria obrigatória: vazio/0 => null, e o PDV usa o padrão dele
    sangria_limite: (parseFloat(document.getElementById('emp-sangria-limite')?.value) || 0) || null,
  };

  if (!dadosEmpresa.nome) { msg.textContent = 'Razão Social é obrigatória.'; msg.style.color = '#f44'; return; }

  const criando = window._empNova === true;

  if (criando) {
    // CRIA empresa nova. NAO mexe no perfil (o master nao fica preso a ela).
    const { data: nova, error } = await sb.from('oct_empresas').insert(dadosEmpresa).select().single();
    if (error) { msg.textContent = 'Erro: ' + error.message; msg.style.color = '#f44'; return; }
    window._empNova = false;
    // recarrega a lista de empresas e ja deixa a nova como ativa
    msg.textContent = '✅ Empresa criada! Atualizando lista...'; msg.style.color = '#4caf50';
    const sess = await getSession();
    if (typeof empresaCarregarContexto === 'function') await empresaCarregarContexto(sess);
    if (typeof EMPRESA !== 'undefined') { EMPRESA.ativaId = nova.id; sessionStorage.setItem('octano_empresa_ativa', nova.id); }
    if (typeof empresaRenderSeletor === 'function') empresaRenderSeletor();
    setTimeout(() => navegarPara('empresa'), 800);
    return;
  }

  // EDITA a empresa ATIVA (a selecionada no seletor)
  const empresaId = (typeof empresaAtiva === 'function') ? empresaAtiva() : null;
  if (!empresaId) { msg.textContent = 'Nenhuma empresa ativa para editar.'; msg.style.color = '#f44'; return; }
  const { error } = await sb.from('oct_empresas').update(dadosEmpresa).eq('id', empresaId);
  if (error) { msg.textContent = 'Erro: ' + error.message; msg.style.color = '#f44'; return; }

  // atualiza so o nome do perfil (NAO muda mais a empresa do perfil)
  const nomePerfil = (document.getElementById('perf-nome') || {}).value;
  if (nomePerfil != null) {
    await sb.from('oct_perfis').update({ nome: nomePerfil.trim() }).eq('id', session.user.id);
  }
  // atualiza o rotulo do seletor (nome/fantasia podem ter mudado)
  if (typeof empresaCarregarContexto === 'function') { await empresaCarregarContexto(session); empresaRenderSeletor(); }

  msg.textContent = '✅ Salvo com sucesso!'; msg.style.color = '#4caf50';
}

// abre o formulario em modo "nova empresa" (vazio)
function empAbrirNova() {
  window._empNova = true;
  navegarPara('empresa');
}
// cancela a criacao e volta para a empresa ativa
function empCancelarNova() {
  window._empNova = false;
  navegarPara('empresa');
}
