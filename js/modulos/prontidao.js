// ============================================================
// PRONTIDÃO PARA O CORTE DO TECNOX
// ------------------------------------------------------------
// Enquanto o TecnoX roda em paralelo, ele é o GABARITO. O vigia
// (_ferramentas/vigia_tecnox.py, diário 04:30) compara Octano × TecnoX e
// grava o veredito em oct_vigia_tecnox. Esta tela é a RÉGUA: mostra a
// matriz posto × dia × fonte e responde "já posso desligar o TecnoX?".
//
// Regra combinada com o Ronan (20/08): virada prevista em ~1 mês, e só com
// comprovação. Verde = provado naquele dia; N/A = ainda não comparável
// (posto que só VENDE no TecnoX não tem pagamento no Octano).
// ============================================================
const PRT_FONTES = [
  { id: "pista", nome: "Venda de combustível", peso: 1, desc: "litros e R$ da pista — a fonte imutável do faturamento" },
  { id: "bicos", nome: "Litros por bico", peso: 1, desc: "prova física da bomba: nenhum litro a mais nem a menos" },
  { id: "turnos", nome: "Turnos do dia", peso: 1, desc: "quantidade e janelas de cada caixa" },
  { id: "formas", nome: "Formas de pagamento", peso: 1, desc: "dinheiro/cartão/pix/prazo/frota — só vale onde o PDV Octano é a fonte" },
  { id: "produtos", nome: "Produtos de loja", peso: 0, desc: "venda de itens que não são combustível" },
  { id: "edi_sem_par", nome: "Cobranças × EDI", peso: 0, desc: "cartão/Pix do caixa sem confirmação da PagBank" },
];

async function moduloProntidao() {
  const conteudo = document.getElementById("conteudo");
  conteudo.innerHTML = '<p style="color:#888;padding:20px">Lendo o histórico do vigia…</p>';
  const dias = Number(localStorage.getItem("prt_dias") || 14);
  const desde = new Date(Date.now() - dias * 86400e3).toISOString().slice(0, 10);
  const [rLin, rEmp] = await Promise.all([
    sb.from("oct_vigia_tecnox").select("*").gte("dia", desde).order("dia", { ascending: false }),
    sb.from("oct_empresas").select("id,nome,nome_fantasia").eq("ativo", true),
  ]);
  const nomeEmp = {};
  (rEmp.data || []).forEach(e => { nomeEmp[e.id] = e.nome_fantasia || e.nome; });
  const rows = rLin.data || [];
  window._prtRows = rows;

  if (!rows.length) {
    conteudo.innerHTML = '<div class="prod-card" style="margin:16px">'
      + '<h3 style="color:#38bdf8">🎯 Prontidão para o corte do TecnoX</h3>'
      + '<p style="color:#888;margin-top:8px">Sem histórico ainda. O vigia roda todo dia às 04:30 '
      + '(tarefa <code>OctanoVigiaTecnox</code>) e grava aqui o veredito de cada comparação.</p></div>';
    return;
  }

  // matriz: empresa -> dia -> fonte -> linha
  const postos = [...new Set(rows.map(r => r.empresa_id))];
  const listaDias = [...new Set(rows.map(r => r.dia))].sort().reverse();
  const M = {};
  rows.forEach(r => {
    M[r.empresa_id] = M[r.empresa_id] || {};
    M[r.empresa_id][r.dia] = M[r.empresa_id][r.dia] || {};
    M[r.empresa_id][r.dia][r.fonte] = r;
  });

  // dias verdes consecutivos (só fontes de PESO 1) e % de dias limpos
  const criticas = PRT_FONTES.filter(f => f.peso === 1).map(f => f.id);
  const seq = {}, pct = {};
  postos.forEach(p => {
    let consec = 0, parou = false, ok = 0, tot = 0;
    listaDias.forEach(d => {
      const cel = (M[p] || {})[d] || {};
      const avaliadas = criticas.filter(f => cel[f] && cel[f].status !== "N/A");
      if (!avaliadas.length) return;
      const verde = avaliadas.every(f => cel[f].status === "OK");
      tot++; if (verde) ok++;
      if (verde && !parou) consec++; else parou = true;
    });
    seq[p] = consec; pct[p] = tot ? Math.round(ok * 100 / tot) : 0;
  });

  const cor = (st) => st === "OK" ? "#22c55e" : st === "DIVERGE" ? "#ef4444" : st === "ERRO" ? "#f59e0b" : "#3f4657";
  const ic = (st) => st === "OK" ? "✓" : st === "DIVERGE" ? "✗" : st === "ERRO" ? "⚠" : "·";
  const META = 30;

  const cards = postos.map(p => {
    const s = seq[p];
    const cs = s >= META ? "#22c55e" : s >= 7 ? "#f59e0b" : "#ef4444";
    return '<div class="prod-card" style="flex:1;min-width:230px">'
      + '<div style="color:#888;font-size:0.78rem">' + escHtml(nomeEmp[p] || p.slice(0, 8)) + "</div>"
      + '<div style="font-size:1.6rem;font-weight:700;color:' + cs + '">' + s
      + ' <span style="font-size:0.8rem;color:#888">dia(s) verdes seguidos</span></div>'
      + '<div style="color:#9aa;font-size:0.78rem;margin-top:2px">' + pct[p] + "% dos dias com tudo conferindo</div>"
      + '<div style="height:6px;background:#1a1d2e;border-radius:3px;margin-top:8px;overflow:hidden">'
      + '<div style="height:100%;width:' + Math.min(100, s * 100 / META) + "%;background:" + cs + '"></div></div>'
      + '<div style="color:#667;font-size:0.7rem;margin-top:4px">meta: ' + META + " dias seguidos</div></div>";
  }).join("");

  const tabelas = postos.map(p => {
    const cab = PRT_FONTES.map(f => '<th title="' + escHtml(f.desc) + '" style="font-size:0.7rem;padding:4px 6px">'
      + escHtml(f.nome) + (f.peso ? "" : ' <span style="color:#667">(info)</span>') + "</th>").join("");
    const corpo = listaDias.map(d => {
      const cel = (M[p] || {})[d] || {};
      const tds = PRT_FONTES.map(f => {
        const r = cel[f.id];
        if (!r) return '<td style="text-align:center;color:#333">—</td>';
        const t = f.nome + "\nOctano: " + r.octano_valor + "\nTecnoX: " + r.tecnox_valor + "\nDif: " + r.diferenca;
        return '<td style="text-align:center;color:' + cor(r.status) + ';font-weight:700;cursor:pointer" title="'
          + escHtml(t) + '" onclick="prtDetalhe(\'' + p + "','" + d + "','" + f.id + "')\">" + ic(r.status) + "</td>";
      }).join("");
      return '<tr style="border-bottom:1px solid #1a1d2e"><td style="padding:4px 8px;color:#9aa;font-family:monospace">'
        + d.split("-").reverse().join("/") + "</td>" + tds + "</tr>";
    }).join("");
    return '<div style="margin-top:18px"><h4 style="color:#f97316;margin-bottom:6px">'
      + escHtml(nomeEmp[p] || p.slice(0, 8)) + "</h4>"
      + '<table style="width:100%;border-collapse:collapse;font-size:0.8rem">'
      + '<tr style="color:#888;text-align:left;border-bottom:1px solid #2a2d3e"><th style="padding:4px 8px">Dia</th>'
      + cab + "</tr>" + corpo + "</table></div>";
  }).join("");

  conteudo.innerHTML = '<div style="margin:16px">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">'
    + '<div><h3 style="color:#38bdf8;margin-bottom:4px">🎯 Prontidão para o corte do TecnoX</h3>'
    + '<p style="color:#888;font-size:0.82rem">Todo dia às 04:30 o vigia compara o Octano com o TecnoX. '
    + "Verde = provado naquele dia. Clique num quadrinho para ver o detalhe da comparação.</p></div>"
    + '<select onchange="localStorage.setItem(\'prt_dias\',this.value);moduloProntidao()" '
    + 'style="padding:8px;border-radius:6px;border:1px solid #2a2d3e;background:#13151f;color:#e0e0e0">'
    + [7, 14, 30, 60].map(n => '<option value="' + n + '"' + (n === dias ? " selected" : "") + ">últimos " + n + " dias</option>").join("")
    + "</select></div>"
    + '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:14px">' + cards + "</div>"
    + tabelas
    + '<div class="prod-card" style="margin-top:20px">'
    + '<h4 style="color:#38bdf8;margin-bottom:8px">O que ainda NÃO é comparável automaticamente</h4>'
    + '<ul style="color:#9aa;font-size:0.82rem;line-height:1.9;margin-left:18px">'
    + "<li><b>Emissão fiscal em produção</b> — hoje o Octano emite em HOMOLOGAÇÃO. Sem isso não há virada.</li>"
    + "<li><b>Validação do contador</b> — plano de contas, classificação fiscal e os SPEDs gerados.</li>"
    + "<li><b>Cartão frota</b> (TicketLog/FitCard/Prime) — vendas que hoje só existem no TecnoX.</li>"
    + "<li><b>Data de corte por posto</b> — enquanto os dois rodam, a dupla digitação gera divergência.</li>"
    + "</ul></div></div>";
}

function prtDetalhe(empresaId, dia, fonte) {
  const r = (window._prtRows || []).find(x => x.empresa_id === empresaId && x.dia === dia && x.fonte === fonte);
  if (!r) return;
  const f = PRT_FONTES.find(x => x.id === fonte) || { nome: fonte, desc: "" };
  const cx = document.createElement("div");
  cx.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center";
  cx.onclick = (e) => { if (e.target === cx) cx.remove(); };
  cx.innerHTML = '<div style="background:#13151f;border:1px solid #2a2d3e;border-radius:10px;max-width:760px;width:92%;max-height:80vh;overflow:auto">'
    + '<div style="padding:12px 16px;border-bottom:1px solid #2a2d3e;display:flex;justify-content:space-between;align-items:center">'
    + '<b style="color:#f97316">' + escHtml(f.nome) + " — " + dia.split("-").reverse().join("/") + "</b>"
    + '<button onclick="this.closest(\'div[style*=fixed]\').remove()" style="background:none;border:none;color:#888;font-size:1.2rem;cursor:pointer">✕</button></div>'
    + '<div style="padding:16px;color:#cdd6e0;font-size:0.85rem">'
    + '<p style="color:#888;font-size:0.78rem;margin-bottom:10px">' + escHtml(f.desc) + "</p>"
    + '<div style="display:flex;gap:18px;margin-bottom:12px;flex-wrap:wrap">'
    + '<div><div style="color:#888;font-size:0.72rem">OCTANO</div><b style="font-size:1.1rem">' + r.octano_valor + "</b></div>"
    + '<div><div style="color:#888;font-size:0.72rem">TECNOX</div><b style="font-size:1.1rem">' + r.tecnox_valor + "</b></div>"
    + '<div><div style="color:#888;font-size:0.72rem">DIFERENÇA</div><b style="font-size:1.1rem;color:'
    + (r.status === "OK" ? "#22c55e" : "#ef4444") + '">' + r.diferenca + "</b></div>"
    + '<div><div style="color:#888;font-size:0.72rem">STATUS</div><b style="font-size:1.1rem">' + r.status + "</b></div></div>"
    + '<pre style="background:#0f1117;border:1px solid #2a2d3e;border-radius:6px;padding:10px;font-size:0.74rem;color:#8a8;overflow:auto;max-height:42vh">'
    + escHtml(JSON.stringify(r.detalhes, null, 2)) + "</pre></div></div>";
  document.body.appendChild(cx);
}
