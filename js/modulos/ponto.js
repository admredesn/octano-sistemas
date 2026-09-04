// ============================================================
// MODULO PONTO — registro de ponto dos funcionarios (retaguarda)
// ============================================================
// Lista os registros de ponto (oct_pdv_ponto) gravados pelo PDV,
// com foto, data/hora, nome e tipo (entrada/saida). Permite filtrar
// por funcionario e periodo, e exportar relatorio CSV.
// Os funcionarios saem de oct_pessoas (classificacao 'funcionario').

async function moduloPonto() {
  const conteudo = document.getElementById('conteudo');
  conteudo.innerHTML = '<p style="color:#888;padding:20px">Carregando...</p>';

  const session = await getSession();
  const { data: perfil } = await sb.from('oct_perfis')
    .select('empresa_id, oct_empresas(nome)').eq('id', session.user.id).single();
  const empresaId = (typeof empresaAtiva==='function') ? empresaAtiva() : (perfil?.empresa_id);
  if (!empresaId) { conteudo.innerHTML = '<p style="color:#f44;padding:20px">Configure sua empresa primeiro.</p>'; return; }
  window._pontoEmpresaId = empresaId;
  window._pontoEmpresaNome = perfil?.oct_empresas?.nome || '';
  if (typeof empresaAtiva==='function' && empresaAtiva()) { const {data:_ea}=await sb.from('oct_empresas').select('nome').eq('id',empresaAtiva()).single(); if(_ea) window._pontoEmpresaNome=_ea.nome; }

  // funcionarios (para o filtro e para listar o quadro)
  // ERRO ≠ VAZIO (14/08): com o Supabase instável a consulta falhava e a tela
  // dizia "nenhum funcionário" — mentira que já causou chamado. Erro agora
  // aparece como erro, com botão de tentar de novo.
  const { data: pessoas, error: erroPessoas } = await sb.from('oct_pessoas')
    .select('id,nome,classificacoes,tipo,ativo')
    .eq('empresa_id', empresaId).eq('ativo', true).order('nome');
  if (erroPessoas) {
    conteudo.innerHTML = `<div style="padding:26px;text-align:center">
      <p style="color:#f87171;font-size:0.95rem">⚠ Não consegui consultar os funcionários (banco fora do ar ou instável).</p>
      <p style="color:#888;font-size:0.8rem;margin:8px 0 16px">${pontoEsc(erroPessoas.message || '')}</p>
      <button onclick="moduloPonto()" style="padding:10px 22px;border-radius:6px;border:none;background:#2563eb;color:#fff;font-weight:600;cursor:pointer">↻ Tentar de novo</button>
    </div>`;
    return;
  }
  const funcionarios = (pessoas || []).filter(p => {
    const lista = Array.isArray(p.classificacoes) ? p.classificacoes : (p.tipo ? [p.tipo] : []);
    return lista.includes('funcionario');
  });
  window._pontoFuncionarios = funcionarios;

  // periodo padrao: mes corrente
  const hoje = new Date();
  const ini = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const fmtInput = (d) => d.toISOString().slice(0, 10);

  conteudo.innerHTML = `
    <div style="padding:18px 20px">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:16px">
        <h2 style="color:#f97316;font-size:1.05rem">🕐 Registro de Ponto</h2>
        <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">
          <div><label style="display:block;color:#888;font-size:0.72rem;margin-bottom:3px">Funcionário</label>
            <select id="pt-f-func" style="padding:8px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff">
              <option value="">Todos</option>
              ${funcionarios.map(f => `<option value="${f.id}">${pontoEsc(f.nome)}</option>`).join('')}
            </select></div>
          <div><label style="display:block;color:#888;font-size:0.72rem;margin-bottom:3px">De</label>
            <input id="pt-f-ini" type="date" value="${fmtInput(ini)}" style="padding:8px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff"></div>
          <div><label style="display:block;color:#888;font-size:0.72rem;margin-bottom:3px">Até</label>
            <input id="pt-f-fim" type="date" value="${fmtInput(hoje)}" style="padding:8px;border-radius:6px;border:1px solid #2a2d3e;background:#0b0d14;color:#fff"></div>
          <button onclick="pontoFiltrar()" style="padding:9px 16px;border-radius:6px;border:none;background:#2563eb;color:#fff;font-weight:600;cursor:pointer">Filtrar</button>
          <button onclick="pontoExportarXLSX()" title="Excel com uma aba por funcionário" style="padding:9px 16px;border-radius:6px;border:1px solid #16a34a;background:transparent;color:#16a34a;font-weight:600;cursor:pointer">⬇ Cartão de ponto (Excel)</button>
          <button onclick="pontoExportarCSV()" title="Tudo numa planilha só" style="padding:9px 16px;border-radius:6px;border:1px solid #2a2d3e;background:transparent;color:#8892a0;font-weight:600;cursor:pointer">⬇ Cartão em CSV</button>
          <button onclick="pontoExportarEventosCSV()" title="Uma linha por batida, com o link da foto — para auditoria" style="padding:9px 16px;border-radius:6px;border:1px solid #2a2d3e;background:transparent;color:#8892a0;font-weight:600;cursor:pointer">⬇ Log de batidas</button>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:220px 1fr;gap:16px">
        <div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;padding:14px;align-self:start">
          <h3 style="color:#aaa;font-size:0.8rem;margin-bottom:10px">Quadro de funcionários</h3>
          ${funcionarios.length
            ? funcionarios.map(f => `<div style="padding:7px 4px;border-bottom:1px solid #1c1f2e;color:#ddd;font-size:0.84rem">${pontoEsc(f.nome)}</div>`).join('')
            : '<p style="color:#666;font-size:0.8rem">Nenhum funcionário marcado em Pessoas.</p>'}
          <p style="color:#666;font-size:0.7rem;margin-top:10px">Marque a classificação “Funcionário” no cadastro de Pessoas para aparecer aqui.</p>
        </div>
        <div id="pt-registros"><p style="color:#888">Carregando registros...</p></div>
      </div>
    </div>`;

  pontoFiltrar();
}

function pontoEsc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }

async function pontoFiltrar() {
  const cont = document.getElementById('pt-registros');
  if (!cont) return;
  cont.innerHTML = '<p style="color:#888">Carregando registros...</p>';

  const empresaId = window._pontoEmpresaId;
  const funcId = document.getElementById('pt-f-func')?.value || '';
  const ini = document.getElementById('pt-f-ini')?.value;
  const fim = document.getElementById('pt-f-fim')?.value;

  let q = sb.from('oct_pdv_ponto').select('*')
    .eq('empresa_id', empresaId)
    .order('registrado_em', { ascending: false });
  if (funcId) q = q.eq('pessoa_id', funcId);
  if (ini) q = q.gte('registrado_em', ini + 'T00:00:00');
  if (fim) q = q.lte('registrado_em', fim + 'T23:59:59');

  const { data, error } = await q;
  if (error) { cont.innerHTML = '<p style="color:#f44">Erro: ' + pontoEsc(error.message) + '</p>'; return; }
  window._pontoRegistros = data || [];

  if (!data || !data.length) {
    cont.innerHTML = '<div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;padding:30px;text-align:center;color:#666">Nenhum registro de ponto no período.</div>';
    return;
  }

  const fmtDH = (iso) => {
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };
  const badgeTipo = (t) => {
    const cor = t === 'saida' ? '#dc2626' : '#16a34a';
    const txt = t === 'saida' ? '◀ Saída' : '▶ Entrada';
    return `<span style="background:#1e2235;color:${cor};padding:3px 9px;border-radius:5px;font-size:0.74rem;font-weight:600">${txt}</span>`;
  };

  cont.innerHTML = `
    <div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;overflow:hidden">
      <table style="width:100%;border-collapse:collapse;font-size:0.84rem">
        <thead><tr style="background:#0f1119;color:#888;text-align:left">
          <th style="padding:10px 12px">Foto</th>
          <th style="padding:10px 12px">Funcionário</th>
          <th style="padding:10px 12px">Tipo</th>
          <th style="padding:10px 12px">Data / Hora</th>
          <th style="padding:10px 12px">Observação</th>
        </tr></thead>
        <tbody>
          ${data.map(r => `
            <tr style="border-top:1px solid #1c1f2e;color:#ddd">
              <td style="padding:8px 12px">
                ${r.foto_url
                  ? `<img src="${pontoEsc(r.foto_url)}" onclick="window.open('${pontoEsc(r.foto_url)}','_blank')" style="width:46px;height:46px;object-fit:cover;border-radius:6px;cursor:pointer;border:1px solid #2a2d3e" title="Abrir foto">`
                  : '<span style="color:#555">—</span>'}
              </td>
              <td style="padding:8px 12px;font-weight:600">${pontoEsc(r.funcionario)}</td>
              <td style="padding:8px 12px">${badgeTipo(r.tipo)}</td>
              <td style="padding:8px 12px">${fmtDH(r.registrado_em)}</td>
              <td style="padding:8px 12px;color:#999">${pontoEsc(r.observacao) || '—'}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <p style="color:#666;font-size:0.76rem;margin-top:8px">${data.length} registro(s) no período.</p>`;
}

// ---------------------------------------------------------------------------
// EXPORTAR — cartao de ponto (uma linha por funcionario/dia)
// ---------------------------------------------------------------------------
// Antes saia uma linha por batida: para conferir a jornada de alguem era preciso
// garimpar a planilha inteira. Agora e' o formato que o RH usa.
function _pontoPares(regs) {
  // agrupa por funcionario e casa entrada->saida na ordem do relogio.
  // A JORNADA ATRAVESSA A MEIA-NOITE: posto trabalha de madrugada (entrou 23:00,
  // saiu 00:59). Fechar o dia a meia-noite deixaria um dia com entrada sem saida
  // e outro com saida sem entrada, e as horas sumiriam das duas pontas.
  const porFunc = {};
  regs.forEach(r => {
    const nome = r.funcionario || '—';
    (porFunc[nome] = porFunc[nome] || []).push(r);
  });

  const saida = {};
  Object.keys(porFunc).forEach(nome => {
    const lista = porFunc[nome]
      .slice()
      .sort((a, b) => new Date(a.registrado_em) - new Date(b.registrado_em));
    const dias = {};
    let aberta = null;                       // entrada esperando a saida
    let primeira = true;                     // ainda nao vimos batida nenhuma
    const alerta = (chave, txt) => {
      dias[chave] = dias[chave] || { pares: [], avisos: [] };
      if (dias[chave].avisos.indexOf(txt) < 0) dias[chave].avisos.push(txt);
    };
    lista.forEach((r, idx) => {
      const d = new Date(r.registrado_em);
      const chave = _pontoDiaChave(d);
      dias[chave] = dias[chave] || { pares: [], avisos: [] };
      if (r.tipo === 'saida') {
        if (!aberta) {
          // primeira batida do periodo sendo saida nao e' erro: a entrada ficou
          // no dia anterior, fora do filtro. Avisar como falha faria o RH cacar
          // problema que nao existe
          alerta(chave, primeira ? 'entrada antes do período' : 'saída sem entrada');
          primeira = false;
          return;
        }
        primeira = false;
        const cd = _pontoDiaChave(aberta);
        dias[cd] = dias[cd] || { pares: [], avisos: [] };
        // jornada de mais de 16h quase sempre e' saida esquecida e batida dias
        // depois. O par aparece marcado, mas NAO entra no total: somar 100h numa
        // folha de pagamento por engano do relogio e' pior que faltar a linha.
        const horas = (d - aberta) / 3600000;
        dias[cd].pares.push({ ent: aberta, sai: d, suspeito: horas > 16 });
        if (horas > 16) alerta(cd, 'jornada de ' + Math.round(horas) + 'h — confira, não somei');
        else if (cd !== chave) alerta(cd, 'saiu no dia seguinte');
        aberta = null;
      } else {
        // entrada com outra entrada aberta = alguem esqueceu de bater a saida
        if (aberta) alerta(_pontoDiaChave(aberta), 'entrada sem saída');
        aberta = d;
        primeira = false;
      }
    });
    if (aberta) {
      // ultima batida sendo entrada de HOJE = a pessoa esta' no turno agora,
      // nao esqueceu de bater
      const hoje = _pontoDiaChave(new Date());
      const cd = _pontoDiaChave(aberta);
      alerta(cd, cd === hoje ? 'ainda em serviço' : 'entrada sem saída');
    }
    saida[nome] = dias;
  });
  return saida;
}

function _pontoDiaChave(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
         String(d.getDate()).padStart(2, '0');
}
function _pontoDiaBr(chave) {
  const p = chave.split('-');
  return p[2] + '/' + p[1] + '/' + p[0];
}
function _pontoHora(d) {
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
// horas em h:mm — decimal (7,58) confunde quem confere folha de pagamento
function _pontoDur(min) {
  const m = Math.max(0, Math.round(min));
  return Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0');
}

// ---------------------------------------------------------------------------
// EXPORTAR — Excel com UMA ABA POR FUNCIONARIO
// ---------------------------------------------------------------------------
// CSV nao tem aba. Para separar por pessoa e' preciso xlsx de verdade, entao a
// biblioteca entra SOB DEMANDA (so' ao clicar): carregar 900 KB em toda abertura
// da tela para um botao que se usa uma vez por mes nao se paga.
function _pontoCarregarXLSX() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (window._pontoXlsxCarregando) return window._pontoXlsxCarregando;
  window._pontoXlsxCarregando = new Promise((ok, falha) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    s.onload = () => ok(window.XLSX);
    s.onerror = () => falha(new Error('não consegui baixar a biblioteca do Excel (sem internet?)'));
    document.head.appendChild(s);
  });
  return window._pontoXlsxCarregando;
}

// nome de aba do Excel: 31 caracteres, sem : \ / ? * [ ] -- e nao pode repetir
function _pontoNomeAba(nome, usados) {
  let n = String(nome || 'SEM NOME').replace(/[:\\\/?*\[\]]/g, ' ').trim().slice(0, 31) || 'SEM NOME';
  if (usados[n]) {
    const base = n.slice(0, 28);
    let i = 2;
    while (usados[base + ' ' + i]) i++;
    n = base + ' ' + i;
  }
  usados[n] = true;
  return n;
}

async function pontoExportarXLSX() {
  const regs = window._pontoRegistros || [];
  if (!regs.length) { alert('Nenhum registro para exportar.'); return; }

  let XLSX;
  try { XLSX = await _pontoCarregarXLSX(); }
  catch (e) { alert(e.message); return; }

  const porFunc = _pontoPares(regs);
  const SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  const wb = XLSX.utils.book_new();
  const usados = {};
  const resumo = [['Funcionário', 'Dias com marcação', 'Horas no período', 'Horas (decimal)', 'Dias com pendência']];

  const nomes = Object.keys(porFunc).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  nomes.forEach(nome => {
    const dias = porFunc[nome];
    const chaves = Object.keys(dias).sort();

    // colunas de marcacao pela maior jornada DESTA pessoa: cada aba fica no
    // tamanho dela, em vez de herdar as colunas vazias do colega que bate mais
    let maxPares = 1;
    chaves.forEach(c => { if (dias[c].pares.length > maxPares) maxPares = dias[c].pares.length; });

    const cab = ['Data', 'Dia'];
    for (let i = 1; i <= maxPares; i++) { cab.push('Entrada ' + i); cab.push('Saída ' + i); }
    cab.push('Horas do dia', 'Horas (decimal)', 'Observação');

    const linhas = [cab];
    let totalMin = 0, diasComMarca = 0, diasPendentes = 0;
    chaves.forEach(chave => {
      const dia = dias[chave];
      let min = 0;
      const cols = [];
      for (let i = 0; i < maxPares; i++) {
        const p = dia.pares[i];
        if (p) {
          cols.push(_pontoHora(new Date(p.ent)), _pontoHora(new Date(p.sai)));
          if (!p.suspeito) min += (new Date(p.sai) - new Date(p.ent)) / 60000;
        }
        else { cols.push('', ''); }
      }
      totalMin += min;
      if (dia.pares.length) diasComMarca++;
      const avisos = dia.avisos.slice();
      if (min > 16 * 60) avisos.push(_pontoDur(min) + ' no dia — confira');
      if (avisos.length) diasPendentes++;
      const dt = new Date(chave + 'T12:00:00');
      linhas.push([
        _pontoDiaBr(chave), SEMANA[dt.getDay()], ...cols,
        dia.pares.length ? _pontoDur(min) : '',
        dia.pares.length ? Math.round(min / 0.6) / 100 : '',
        avisos.join(' · '),
      ]);
    });
    linhas.push([]);
    linhas.push(['TOTAL', '', ...new Array(maxPares * 2).fill(''),
                 _pontoDur(totalMin), Math.round(totalMin / 0.6) / 100, '']);

    const ws = XLSX.utils.aoa_to_sheet(linhas);
    ws['!cols'] = [{ wch: 12 }, { wch: 9 }]
      .concat(new Array(maxPares * 2).fill({ wch: 10 }))
      .concat([{ wch: 12 }, { wch: 14 }, { wch: 34 }]);
    XLSX.utils.book_append_sheet(wb, ws, _pontoNomeAba(nome, usados));

    resumo.push([nome, diasComMarca, _pontoDur(totalMin), Math.round(totalMin / 0.6) / 100, diasPendentes]);
  });

  // Resumo na FRENTE: quem abre o arquivo quer primeiro o total de cada um, e
  // so' depois desce no detalhe de quem chamou a atencao
  const wsR = XLSX.utils.aoa_to_sheet(resumo);
  wsR['!cols'] = [{ wch: 34 }, { wch: 18 }, { wch: 17 }, { wch: 16 }, { wch: 19 }];
  XLSX.utils.book_append_sheet(wb, wsR, 'Resumo');
  wb.SheetNames.unshift(wb.SheetNames.pop());

  const nomeArq = 'cartao_ponto_' + (window._pontoEmpresaNome || 'empresa').replace(/\W+/g, '_') + '.xlsx';
  XLSX.writeFile(wb, nomeArq);
}

function pontoExportarCSV() {
  const regs = window._pontoRegistros || [];
  if (!regs.length) { alert('Nenhum registro para exportar.'); return; }

  const porFunc = _pontoPares(regs);
  // quantas colunas de marcacao? o maior numero de pares do periodo manda --
  // fixar em 2 cortaria a jornada de quem bateu mais vezes, e o cartao mentiria
  let maxPares = 1;
  Object.values(porFunc).forEach(dias => Object.values(dias)
    .forEach(d => { if (d.pares.length > maxPares) maxPares = d.pares.length; }));

  const sep = ';';
  const cel = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

  const cab = ['Funcionario', 'Data', 'Dia'];
  for (let i = 1; i <= maxPares; i++) { cab.push('Entrada ' + i); cab.push('Saida ' + i); }
  cab.push('Horas do dia', 'Marcacoes', 'Observacao');

  const linhas = [];
  Object.keys(porFunc).sort((a, b) => a.localeCompare(b, 'pt-BR')).forEach(nome => {
    const dias = porFunc[nome];
    let totalFunc = 0;
    Object.keys(dias).sort().forEach(chave => {
      const dia = dias[chave];
      let minutos = 0;
      const cols = [];
      for (let i = 0; i < maxPares; i++) {
        const p = dia.pares[i];
        if (p) {
          cols.push(_pontoHora(p.ent), _pontoHora(p.sai));
          if (!p.suspeito) minutos += (p.sai - p.ent) / 60000;
        } else {
          cols.push('', '');
        }
      }
      totalFunc += minutos;
      const avisos = dia.avisos.slice();
      if (minutos > 16 * 60) avisos.push(_pontoDur(minutos) + ' no dia — confira');
      const dt = new Date(chave + 'T12:00:00');
      linhas.push([
        cel(nome), cel(_pontoDiaBr(chave)), cel(SEMANA[dt.getDay()]),
        ...cols.map(cel),
        cel(dia.pares.length ? _pontoDur(minutos) : ''),
        cel(dia.pares.length * 2 + (avisos.length ? 1 : 0)),
        cel(avisos.join(' · ')),
      ].join(sep));
    });
    // total do funcionario logo abaixo dos dias dele: quem confere folha soma
    // por pessoa, e somar 30 linhas na mao e' onde nasce a divergencia
    const vazias = new Array(maxPares * 2).fill('').map(cel);
    linhas.push([cel(nome), cel('TOTAL'), cel(''), ...vazias,
                 cel(_pontoDur(totalFunc)), cel(''), cel('')].join(sep));
    linhas.push('');
  });

  const txt = '\uFEFF' + [cab.join(sep), ...linhas].join('\r\n');
  const blob = new Blob([txt], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'cartao_ponto_' + (window._pontoEmpresaNome || 'empresa').replace(/\W+/g, '_') + '.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// O log evento a evento continua exportavel: e' o que tem a FOTO de cada batida,
// que e' a prova. O cartao e' para conferir jornada; o log, para auditar.
function pontoExportarEventosCSV() {
  const regs = window._pontoRegistros || [];
  if (!regs.length) { alert('Nenhum registro para exportar.'); return; }
  const sep = ';';
  const cel = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const cab = ['Funcionario', 'Tipo', 'Data', 'Hora', 'Observacao', 'Foto (URL)'].join(sep);
  const linhas = regs.map(r => {
    const d = new Date(r.registrado_em);
    return [
      cel(r.funcionario),
      cel(r.tipo === 'saida' ? 'Saida' : 'Entrada'),
      cel(d.toLocaleDateString('pt-BR')),
      cel(d.toLocaleTimeString('pt-BR')),
      cel(r.observacao || ''),
      cel(r.foto_url || ''),
    ].join(sep);
  });
  const txt = '\uFEFF' + [cab, ...linhas].join('\r\n');
  const blob = new Blob([txt], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ponto_eventos_' + (window._pontoEmpresaNome || 'empresa').replace(/\W+/g, '_') + '.csv';
  a.click();
  URL.revokeObjectURL(url);
}
