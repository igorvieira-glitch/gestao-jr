// ==UserScript==
// @name         Monitor Ponto JR
// @namespace    jrtelecom-camacari
// @version      1.0.0
// @description  Liga sozinho o Leitor Ponto JR quando o Ahgora abre (lê o TOTVS a cada minuto e envia ao Gestão JR)
// @match        https://app.ahgora.com.br/*
// @run-at       document-idle
// @noframes
// @grant        none
// @icon         https://igorvieira-glitch.github.io/gestao-jr/icons/favicon.png
// @updateURL    https://igorvieira-glitch.github.io/gestao-jr/monitor-ponto-jr.user.js
// @downloadURL  https://igorvieira-glitch.github.io/gestao-jr/monitor-ponto-jr.user.js
// ==/UserScript==

/* O leitor abaixo é o mesmo do favorito "Leitor Ponto JR" do sistema, sem alterações.
   Este script só cuida de: guardar a configuração do favorito, ligar o leitor sozinho,
   evitar dois leitores em abas diferentes e recarregar a página se a sessão cair. */
(function () {
  'use strict';
  var K_CFG = 'pontojr_cfg', K_HB = 'pontojr_hb', K_REC = 'pontojr_recarga';
  var ID = Math.random().toString(36).slice(2);
  var ls = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
  };

  function LEITOR(CFG) {
  if (location.hostname !== 'app.ahgora.com.br') {
    if (confirm('O Leitor Ponto JR funciona dentro do Ahgora. Abrir o Ahgora agora? Depois de entrar, clique de novo no favorito.')) location.href = 'https://app.ahgora.com.br/justificativa';
    return;
  }
  if (window.__pjr) { window.__pjr.agora(); return; }
  var ALVO = 'pontojr_sync';
  var CEL = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent), pop = CEL ? null : window.open('', ALVO, 'width=480,height=360'), wl = null;
  async function acordado() { try { if (navigator.wakeLock && !wl && document.visibilityState === 'visible') { wl = await navigator.wakeLock.request('screen'); wl.addEventListener('release', function () { wl = null; }); } } catch (e) {} }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') { acordado(); if (window.__pjr) window.__pjr.agora(); } });
  var S = { cache: {}, ultima: '', erro: '', rodando: false, prox: 0, timer: null };
  var pad = function (n) { return ('0' + n).slice(-2); };
  function agoraSP() {
    var p = {}; new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, weekday: 'short' }).formatToParts(new Date()).forEach(function (x) { p[x.type] = x.value; });
    var h = p.hour === '24' ? '00' : p.hour;
    return { iso: p.year + '-' + p.month + '-' + p.day, y: +p.year, m: +p.month, d: +p.day, hm: h + ':' + p.minute, txt: p.day + '/' + p.month + '/' + p.year + ' ' + h + ':' + p.minute + ':' + p.second, wd: p.weekday };
  }
  function periodo(a) {
    var y = a.y, m = a.m;
    if (a.d < 26) { m--; if (m < 1) { m = 12; y--; } }
    var ini = y + '-' + pad(m) + '-26';
    var meses = [{ ano: y, mes: m }]; if (a.y !== y || a.m !== m) meses.push({ ano: a.y, mes: a.m });
    return { ini: ini, fim: a.iso, meses: meses };
  }
  var brd = function (iso) { var p = iso.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; };
  async function json(url, opt) {
    var r = await fetch(url, Object.assign({ credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest' } }, opt || {}));
    var t = await r.text();
    if (/login\.ahgora|<html/i.test(r.url + t.slice(0, 200))) throw new Error('sessao');
    try { return JSON.parse(t); } catch (e) { throw new Error('sessao'); }
  }
  async function mes(mat, ano, m, atual) {
    var k = mat + '|' + ano + '|' + m, c = S.cache[k];
    if (!atual && c && Date.now() - c.t < 15 * 60000) return c.j;
    var j = await json('/batidas/adaptar_apuracao/?matric=' + mat + '&mes=' + pad(m) + '&ano=' + ano);
    if (j === null) j = { BATIDAS: {} };
    S.cache[k] = { t: Date.now(), j: j }; return j;
  }
  async function ler() {
    var a = agoraSP(), per = periodo(a), cols = [];
    for (var i = 0; i < CFG.tecnicos.length; i++) {
      var c = CFG.tecnicos[i], dias = {};
      status('Lendo ' + (i + 1) + ' de ' + CFG.tecnicos.length + '…');
      for (var q = 0; q < per.meses.length; q++) {
        var mm = per.meses[q], j = await mes(c.m, mm.ano, mm.mes, mm.ano === a.y && mm.mes === a.m);
        var B = j.BATIDAS || {};
        Object.keys(B).forEach(function (d) {
          if (d < per.ini || d > per.fim) return;
          var x = B[d] || {}, ev = x.events || {}, lv = ev.leave || {};
          dias[d] = {
            b: (x.BATIDAS || []).map(function (p) { return { h: p.RAW_HOUR, t: p.TIPO, m: String(p.MOTIVO || '').trim().slice(0, 80) }; }),
            odd: !!ev.hasOddPunches, lv: !!lv.isEntireDay, lvp: !!(lv.range > 0 && !lv.isEntireDay),
            lvn: (function () { var a = (x.APURACAO && x.APURACAO['0']) || {}; var k = Object.keys(a).filter(function (z) { return /_af#$/.test(z); })[0]; return k ? String(a[k].nome || k.replace('_af#', '')) : ''; })(),
            st: ev.shiftType || '', esc: (x.ESCALA_JORNADA && (x.ESCALA_JORNADA.DESC_JORNADA || x.ESCALA_JORNADA.DESC_ESCALA)) || ''
          };
        });
      }
      cols.push({ m: c.m, n: c.n, dias: dias });
    }
    var pj = await json('/justificativa/getTableMigrado', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' }, body: 'data_inicial=' + brd(per.ini) + '&data_final=' + brd(per.fim) + '&limit=500' });
    var pend = (pj.aaData || []).filter(function (p) { return p.status === 'Pendente'; }).map(function (p) {
      return { nome: p.nome, data: p.data_batida, hora: p.details, just: String(p.informacao || '').trim().slice(0, 300), em: p.horario_da_justificativa, tipo: p.tipo_solicitacao, id: p.justifyId };
    });
    return { v: 1, lidoEm: new Date().toISOString(), lidoEmTxt: a.txt, hoje: a.iso, agora: a.hm, periodo: { ini: per.ini, fim: per.fim }, colaboradores: cols, pendentes: pend };
  }
  function enviarJanela(obj) {
    if (!pop || pop.closed) pop = window.open('', ALVO, 'width=480,height=360');
    if (!pop) throw new Error('popup');
    var f = document.createElement('form'); f.method = 'POST'; f.action = CFG.url; f.target = ALVO; f.acceptCharset = 'UTF-8'; f.style.display = 'none';
    [['chave', CFG.chave], ['payload', JSON.stringify(obj)]].forEach(function (kv) { var i = document.createElement('input'); i.type = 'hidden'; i.name = kv[0]; i.value = kv[1]; f.appendChild(i); });
    document.body.appendChild(f); f.submit(); f.remove();
  }
  /* envio direto, sem janela (funciona no celular); se o Ahgora bloquear, usa a janelinha */
  async function enviar(obj) {
    if (S.via !== 'janela') {
      try {
        var corpo = new URLSearchParams(); corpo.append('chave', CFG.chave); corpo.append('payload', JSON.stringify(obj));
        var antes = new Date(Date.now() - 5000).toISOString();
        await fetch(CFG.url, { method: 'POST', mode: 'no-cors', body: corpo, credentials: 'include' });
        var cf = await fetch(CFG.url + '?leitor_ok=' + encodeURIComponent(CFG.chave), { credentials: 'omit' }).then(function (r) { return r.json(); });
        if (cf && cf.ok && cf.em >= antes) { S.via = 'direto'; try { if (pop && !pop.closed) pop.close(); } catch (x) {} pop = null; return 'direto'; }
      } catch (e) {}
    }
    S.via = 'janela'; enviarJanela(obj); return 'janela';
  }
  /* painel flutuante */
  var box = document.createElement('div');
  box.style.cssText = 'position:fixed;right:12px;left:' + (CEL ? '12px' : 'auto') + ';bottom:16px;z-index:2147483647;background:#0b1a33;color:#eef3fb;font:13px/1.4 system-ui,sans-serif;border-radius:12px;padding:12px 14px;box-shadow:0 8px 28px rgba(0,0,0,.35);border-left:5px solid #f28c1e;max-width:300px';
  box.innerHTML = '<b style="font-size:14px">Leitor Ponto JR</b><div data-s style="margin:6px 0 8px;color:#a9b8d3">Iniciando…</div><button data-a style="font:600 13px system-ui;background:#f28c1e;color:#0b1a33;border:0;border-radius:8px;padding:7px 10px;cursor:pointer;margin-right:6px">Ler agora</button><button data-p style="font:600 13px system-ui;background:transparent;color:#eef3fb;border:1px solid #24406e;border-radius:8px;padding:7px 10px;cursor:pointer">Parar</button>';
  document.body.appendChild(box);
  var elS = box.querySelector('[data-s]');
  function status(t, cor) { elS.textContent = t; elS.style.color = cor || '#a9b8d3'; }
  async function ciclo() {
    if (S.rodando) return; S.rodando = true;
    try {
      var r = await ler(); var via = await enviar(r); S.ultima = r.lidoEmTxt.slice(11); S.erro = '';
      status('Enviado às ' + S.ultima + ' · ' + r.pendentes.length + ' pedido(s) pendente(s). Próxima leitura em 1 min. ' + (CEL ? 'Deixe esta aba aberta e a tela ligada.' : 'Deixe esta aba aberta.'), '#3ccf8e');
    } catch (e) {
      S.erro = e.message;
      if (e.message === 'sessao') status('A sessão do Ahgora expirou. Entre de novo e clique no favorito.', '#ff7a6e');
      else if (e.message === 'popup') status(CEL ? 'O envio direto não passou e o celular bloqueou a aba de envio. Permita pop-ups do app.ahgora.com.br (Configurações do site) e toque em Ler agora.' : 'O Chrome bloqueou a janela de envio. Permita pop-ups do app.ahgora.com.br e clique em Ler agora.', '#ff7a6e');
      else status('Erro na leitura: ' + e.message + '. Tento de novo em 1 min.', '#ff7a6e');
    } finally { S.rodando = false; }
  }
  box.querySelector('[data-a]').onclick = ciclo;
  box.querySelector('[data-p]').onclick = function () { clearInterval(S.timer); try { wl && wl.release(); } catch (e) {} box.remove(); window.__pjr = null; };
  window.__pjr = { agora: ciclo };
  S.timer = setInterval(ciclo, 60000);
  acordado();
  ciclo();

  }

  function lerCfg() { try { var c = JSON.parse(ls.get(K_CFG) || 'null'); return c && c.url && c.chave && c.tecnicos ? c : null; } catch (e) { return null; } }

  /* extrai a configuração do código do favorito (javascript:...) sem executar nada */
  function cfgDoFavorito(txt) {
    txt = String(txt || '').trim();
    try { if (/^javascript:/i.test(txt)) txt = decodeURIComponent(txt.replace(/^javascript:/i, '')); } catch (e) {}
    var i = txt.indexOf('var CFG = '); if (i < 0) return null;
    var s = txt.slice(i + 10), prof = 0, fim = -1, str = false, esc = false;
    for (var j = 0; j < s.length; j++) {
      var ch = s[j];
      if (str) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') str = false; continue; }
      if (ch === '"') str = true; else if (ch === '{') prof++; else if (ch === '}') { prof--; if (!prof) { fim = j; break; } }
    }
    if (fim < 0) return null;
    try { var c = JSON.parse(s.slice(0, fim + 1)); return c && c.url && c.chave && Array.isArray(c.tecnicos) ? c : null; } catch (e) { return null; }
  }

  function telaLogin() { return /login/i.test(location.pathname + location.hostname) || !!document.querySelector('input[type=password]'); }

  function painelConfig(msg) {
    if (document.getElementById('pjr-cfg')) return;
    var b = document.createElement('div'); b.id = 'pjr-cfg';
    b.style.cssText = 'position:fixed;right:12px;bottom:16px;left:auto;z-index:2147483647;background:#0b1a33;color:#eef3fb;font:13px/1.45 system-ui,sans-serif;border-radius:12px;padding:14px;box-shadow:0 8px 28px rgba(0,0,0,.35);border-left:5px solid #f28c1e;width:340px;max-width:calc(100vw - 24px)';
    b.innerHTML = '<b style="font-size:14px">Monitor Ponto JR · configurar</b>'
      + '<p style="margin:6px 0;color:#a9b8d3">' + (msg || 'No Gestão JR: Atualizar sistema → Gerar o favorito → botão direito no botão laranja → Copiar endereço do link. Cole aqui:') + '</p>'
      + '<textarea style="width:100%;height:70px;box-sizing:border-box;background:#12264a;color:#eef3fb;border:1px solid #24406e;border-radius:8px;font:11px monospace"></textarea>'
      + '<div style="margin-top:8px;display:flex;gap:6px"><button data-s style="font:600 13px system-ui;background:#f28c1e;color:#0b1a33;border:0;border-radius:8px;padding:7px 10px;cursor:pointer">Salvar e ligar</button>'
      + '<button data-x style="font:600 13px system-ui;background:transparent;color:#eef3fb;border:1px solid #24406e;border-radius:8px;padding:7px 10px;cursor:pointer">Agora não</button></div>';
    document.body.appendChild(b);
    b.querySelector('[data-x]').onclick = function () { b.remove(); };
    b.querySelector('[data-s]').onclick = function () {
      var c = cfgDoFavorito(b.querySelector('textarea').value);
      if (!c) { b.querySelector('p').textContent = 'Esse código não é o do favorito Leitor Ponto JR. Copie o endereço do botão laranja de novo e cole aqui.'; b.querySelector('p').style.color = '#ff7a6e'; return; }
      ls.set(K_CFG, JSON.stringify(c)); b.remove(); tentar();
    };
  }

  /* um leitor por vez: a aba que já está lendo avisa a cada 20 s */
  var ligado = false;
  function outraAbaLendo() { try { var h = JSON.parse(ls.get(K_HB) || 'null'); return h && h.id !== ID && Date.now() - h.t < 75000; } catch (e) { return false; } }
  function batimento() { if (ligado && window.__pjr) ls.set(K_HB, JSON.stringify({ id: ID, t: Date.now() })); }
  window.addEventListener('pagehide', function () { try { var h = JSON.parse(ls.get(K_HB) || 'null'); if (h && h.id === ID) ls.del(K_HB); } catch (e) {} });

  function tentar() {
    if (ligado || !document.body) return;
    if (location.hash === '#pontojr-config') { history.replaceState(null, '', location.pathname + location.search); ls.del(K_CFG); }
    var cfg = lerCfg();
    if (!cfg) { if (!telaLogin()) painelConfig(); return; }
    if (telaLogin() || outraAbaLendo()) return;
    if (window.__pjr) { ligado = true; batimento(); return; }      /* favorito já rodando nesta aba */
    ligado = true; batimento();
    try { LEITOR(cfg); } catch (e) { ligado = false; console.error('Monitor Ponto JR', e); }
  }

  /* sessão do Ahgora caiu: recarrega (no máximo a cada 10 min) para voltar a ler depois do login */
  function vigia() {
    batimento();
    if (!ligado) { tentar(); return; }
    var txt = (document.body && document.body.innerText) || '';
    if (/sess[aã]o do Ahgora expirou/i.test(txt)) {
      var ult = +(ls.get(K_REC) || 0);
      if (Date.now() - ult > 600000) { ls.set(K_REC, String(Date.now())); location.reload(); }
    }
  }

  setInterval(vigia, 20000);
  setTimeout(tentar, 2500);
})();
