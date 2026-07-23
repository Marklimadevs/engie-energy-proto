/* Bootstrap + level manager + dynamic UI + timer/events + login/ranking/medals. */
window.addEventListener('DOMContentLoaded', function () {
  const EEP = window.EEP;
  const PIECES = EEP.PIECES;
  const el = id => document.getElementById(id);
  const canvas = el('board');

  const app = { game: null, renderer: null, level: null, phaseView: 'dia', player: 'Visitante', gridType: 'square' };
  const progress = { unlocked: 99 };
  let timeLeft = 0, timerId = null, eventFired = false, wantDemo = false, wantRot = 0;

  const IND_LABEL = {
    energia: 'Energia', custo: 'Custo', sust: 'Sustentabilidade',
    estab: 'Estabilidade', inov: 'Inovacao', emis: 'Emissoes (limpo)',
    lucro: 'Lucro', sat: 'Satisfacao'
  };
  const MEDALS = [
    { id: '3estrelas', name: '3 Estrelas', cond: s => s.stars === 3 },
    { id: 'limpa', name: 'Rede Limpa', cond: s => s.win && s.emis >= 90 },
    { id: 'eficiente', name: 'Sem Desperdicio', cond: s => s.win && s.loss <= 6 },
    { id: 'inovador', name: 'Inovador', cond: s => s.win && s.inov >= 40 },
    { id: 'transicao', name: 'Mestre da Transicao', cond: (s, lid) => s.win && lid === 3 }
  ];

  // ---- storage ----
  function load(key, def) { try { return JSON.parse(localStorage.getItem(key)) || def; } catch (e) { return def; } }
  function save(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { } }

  // ---- piece icons ----
  const PC = {
    solar: '#F4A81D', wind: '#2E9BE0', hydro: '#0F7FD4', biomass: '#3f9b57', battery: '#16a98c',
    ia: '#0F7FD4', sensor: '#7b8a99', drone: '#5D7185', pnd: '#E8930B', wire: '#6b7a89', erase: '#E5533D'
  };
  const svg = inner => '<svg viewBox="0 0 24 24" fill="none">' + inner + '</svg>';
  const ICONS = {
    solar: c => svg('<circle cx="12" cy="12" r="4.4" fill="' + c + '"/><g stroke="' + c + '" stroke-width="2" stroke-linecap="round"><path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.2 5.2l1.9 1.9M16.9 16.9l1.9 1.9M18.8 5.2l-1.9 1.9M7.1 16.9l-1.9 1.9"/></g>'),
    wind: c => svg('<rect x="11.3" y="11.5" width="1.4" height="9.5" rx=".5" fill="' + c + '"/><path d="M12 12 L12.7 3.5 L11.3 3.5 Z" fill="' + c + '"/><path d="M12 12 L19.5 15.8 L18.7 14.2 Z" fill="' + c + '"/><path d="M12 12 L4.5 15.8 L5.3 14.2 Z" fill="' + c + '"/><circle cx="12" cy="12" r="1.7" fill="#0B1F33"/>'),
    hydro: c => svg('<rect x="4" y="4.5" width="16" height="5" rx="1.2" fill="' + c + '"/><path d="M4 13.5c2.6-2.6 4.6-2.6 8 0s5.4 2.6 8 0M4 17.8c2.6-2.6 4.6-2.6 8 0s5.4 2.6 8 0" stroke="' + c + '" stroke-width="2" stroke-linecap="round"/>'),
    biomass: c => svg('<path d="M20 4C9.5 4 4 9 4 18c0 .6 0 1.4 0 1.4C10 19.4 20 16 20 4z" fill="' + c + '"/><path d="M7 18C10.5 12.5 14.5 9.5 18 7.5" stroke="#0f4d28" stroke-width="1.4" stroke-linecap="round"/>'),
    battery: c => svg('<rect x="3" y="7" width="15.5" height="10" rx="2.2" stroke="' + c + '" stroke-width="2"/><rect x="19.5" y="10" width="2.5" height="4" rx="1" fill="' + c + '"/><path d="M11 9l-2.2 4H11l-1.6 3.5" stroke="' + c + '" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>'),
    ia: c => svg('<rect x="6" y="6" width="12" height="12" rx="2.5" stroke="' + c + '" stroke-width="2"/><g stroke="' + c + '" stroke-width="1.8" stroke-linecap="round"><path d="M9 3.5v2.5M15 3.5v2.5M9 18v2.5M15 18v2.5M3.5 9H6M3.5 15H6M18 9h2.5M18 15h2.5"/></g><circle cx="12" cy="12" r="2.2" fill="' + c + '"/>'),
    sensor: c => svg('<circle cx="12" cy="16.5" r="2.1" fill="' + c + '"/><path d="M8 13.2a5.6 5.6 0 0 1 8 0M5.4 10.4a9.3 9.3 0 0 1 13.2 0" stroke="' + c + '" stroke-width="2" stroke-linecap="round"/>'),
    drone: c => svg('<g stroke="' + c + '" stroke-width="1.8"><circle cx="5" cy="6" r="2.4"/><circle cx="19" cy="6" r="2.4"/><circle cx="5" cy="18" r="2.4"/><circle cx="19" cy="18" r="2.4"/><path d="M6.9 7.6 10 10.8M17.1 7.6 14 10.8M6.9 16.4 10 13.2M17.1 16.4 14 13.2" stroke-linecap="round"/></g><rect x="9.4" y="10" width="5.2" height="4" rx="1.2" fill="' + c + '"/>'),
    pnd: c => svg('<path d="M9.5 18.5h5M10.5 21h3" stroke="' + c + '" stroke-width="2" stroke-linecap="round"/><path d="M12 3a6 6 0 0 0-3.8 10.6c.7.6 1.1 1.3 1.2 2.4h5.2c.1-1.1.5-1.8 1.2-2.4A6 6 0 0 0 12 3z" fill="' + c + '"/>'),
    wire: c => svg('<path d="M13.2 2.5 4.5 13.5H10l-1.2 8 8.7-11H12l1.2-8z" fill="' + c + '"/>'),
    erase: c => svg('<path d="M4 7h16M9.5 7V4.2h5V7M6.5 7l1 13h9l1-13" stroke="' + c + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>')
  };
  const pieceIcon = key => (ICONS[key] ? ICONS[key](PC[key] || '#5D7185') : '');
  const STAR = on => '<svg class="pop" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6l2.9 5.9 6.5.95-4.7 4.6 1.1 6.45L12 18.9 6.2 20.5l1.1-6.45L2.6 9.45 9.1 8.5z" ' +
    (on ? 'fill="#F4A81D" stroke="#cf8c0c"' : 'fill="none" stroke="#c3cdd8"') + ' stroke-width="1.1" stroke-linejoin="round"/></svg>';

  const indEls = {};

  function buildLevelBar() {
    const bar = el('levelbar'); bar.innerHTML = '';
    for (let i = 1; i <= EEP.LEVEL_COUNT; i++) {
      const b = document.createElement('button');
      b.textContent = 'Fase ' + i;
      if (i === app.level.id) b.className = 'on';
      if (i > progress.unlocked) b.className = 'locked';
      b.addEventListener('click', () => { if (i <= progress.unlocked) loadLevel(i - 1); });
      bar.appendChild(b);
    }
  }

  function buildObjective() {
    el('obj-name').textContent = 'Fase ' + app.level.id + ' — ' + app.level.name;
    el('obj-name').title = app.level.teaches || '';
    el('obj-objective').textContent = app.level.objective || app.level.teaches || '';
    const multi = (app.level.phases || []).indexOf('noite') >= 0;
    const pt = el('phasetoggle'); pt.hidden = !multi;
    if (multi) {
      app.phaseView = 'dia';
      pt.querySelectorAll('.ph').forEach(btn => {
        btn.className = 'ph' + (btn.dataset.phase === app.phaseView ? ' on' : '');
        btn.onclick = () => {
          app.phaseView = btn.dataset.phase;
          pt.querySelectorAll('.ph').forEach(x => x.className = 'ph' + (x.dataset.phase === app.phaseView ? ' on' : ''));
          refresh();
        };
      });
    }
  }

  function buildPalette() {
    const pal = el('palette'); pal.innerHTML = '';
    app.level.pieces.forEach(key => {
      const def = PIECES[key];
      const btn = document.createElement('button');
      btn.className = 'tool'; btn.dataset.tool = key; btn.setAttribute('aria-pressed', 'false');
      const cost = key === 'erase' ? '—' : 'R$ ' + def.cost;
      btn.innerHTML = '<span class="ti">' + pieceIcon(key) + '</span><span class="tl">' + def.name + '</span><span class="tc">' + cost + '</span>';
      btn.addEventListener('click', () => {
        app.game.setTool(key);
        pal.querySelectorAll('.tool').forEach(b => b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'));
        el('tradeoff').textContent = def.desc || '';
      });
      btn.addEventListener('mouseenter', () => { el('tradeoff').textContent = def.desc || ''; });
      pal.appendChild(btn);
    });
    const first = pal.querySelector('.tool[data-tool="solar"]') || pal.querySelector('.tool');
    if (first) first.click();
  }

  function buildIndicators() {
    const box = el('indicators'); box.innerHTML = '';
    for (const k in indEls) delete indEls[k];
    app.level.indicators.forEach(key => {
      const wrap = document.createElement('div'); wrap.className = 'ind';
      wrap.innerHTML = '<div class="ind-row"><span>' + IND_LABEL[key] + '</span><b></b></div><div class="bar"><i></i></div>';
      box.appendChild(wrap);
      indEls[key] = { v: wrap.querySelector('b'), bar: wrap.querySelector('i') };
    });
  }

  function indDisplay(key, s) {
    if (key === 'energia') {
      const d = s.phaseRes[app.phaseView] ? s.phaseRes[app.phaseView].delivered : s.delivered;
      return { text: Math.round(d) + ' / ' + Math.round(s.totalDemand), width: Math.min(100, d / s.totalDemand * 100), cls: s.meetsEnergy ? 'green' : '' };
    }
    if (key === 'custo') return { text: 'R$ ' + Math.round(s.cost) + ' / ' + app.level.budget, width: Math.min(100, s.cost / app.level.budget * 100), cls: s.cost > app.level.budget ? 'low' : 'amber' };
    const v = s[key], tgt = (app.level.targets || {})[key];
    return { text: Math.round(v) + (tgt ? ' / ' + tgt : ''), width: v, cls: (tgt && v < tgt) ? 'low' : 'green' };
  }

  function refresh() {
    const s = app.game.simulate();
    app.level.indicators.forEach(key => {
      const d = indDisplay(key, s), e = indEls[key]; if (!e) return;
      e.v.textContent = d.text; e.bar.style.width = Math.max(0, Math.min(100, d.width)) + '%'; e.bar.className = d.cls;
    });
  }

  function onHint(msg) {
    if (msg) { el('hint').textContent = msg; return; }
    const multi = (app.level.phases || []).indexOf('noite') >= 0;
    if (multi) {
      const s = app.game.simulate();
      el('hint').textContent = 'Dia: ' + Math.round(s.phaseRes.dia.delivered) + ' MW  ·  Noite: ' + Math.round(s.phaseRes.noite.delivered) + ' MW  (a fase mais fraca vale para vencer)';
    } else el('hint').textContent = 'Selecione uma peca e clique numa celula. Ligue as fontes as demandas com linhas.';
  }

  // ---- timer + events ----
  function stopTimer() { if (timerId) { clearInterval(timerId); timerId = null; } }
  function startTimer(full) { stopTimer(); timeLeft = 0; eventFired = true; /* cronometro removido */ }
  function tick() {
    timeLeft--; updateTimer();
    const ev = app.level.event;
    if (ev && !eventFired && (app.level.time - timeLeft) >= ev.at) { eventFired = true; fireEvent(ev); }
    if (timeLeft <= 0) { stopTimer(); showModal(app.game.simulate(), true); }
  }
  function updateTimer() {
    const e = el('timer'); if (!e) return;
    const t = Math.max(0, timeLeft), m = Math.floor(t / 60), s = t % 60;
    e.textContent = m + ':' + (s < 10 ? '0' : '') + s;
    e.className = 'timer' + (t <= 15 ? ' low' : '');
  }
  function fireEvent(ev) {
    if (ev.type === 'drought') app.game.state.mods.drought = 0.6;
    else if (ev.type === 'spike') app.game.state.mods.demand = 1.2;
    toast(ev.label); refresh(); onHint('');
  }
  let toastTimer1 = null, toastTimer2 = null;
  function toast(msg) {
    const t = el('toast'); t.textContent = msg; t.hidden = false;
    if (toastTimer1) clearTimeout(toastTimer1); if (toastTimer2) clearTimeout(toastTimer2);
    requestAnimationFrame(() => t.classList.add('show'));
    toastTimer1 = setTimeout(() => { t.classList.remove('show'); toastTimer2 = setTimeout(() => { t.hidden = true; }, 320); }, 3600);
  }

  // ---- ranking + medals ----
  function saveScore(s) {
    const list = load('eep_rank', []);
    list.push({ name: app.player, levelId: app.level.id, levelName: app.level.name, score: s.score, stars: s.stars });
    list.sort((a, b) => b.score - a.score);
    save('eep_rank', list.slice(0, 100));
  }
  function playerMedals() { return load('eep_medals_' + app.player, []); }
  function grantMedals(s) {
    const have = playerMedals(); const earnedNow = [];
    MEDALS.forEach(m => {
      if (m.cond(s, app.level.id)) { if (have.indexOf(m.id) < 0) { have.push(m.id); earnedNow.push(m); } }
    });
    save('eep_medals_' + app.player, have);
    return earnedNow;
  }
  function medalChip(name, locked) {
    return '<span class="medal' + (locked ? ' locked' : '') + '"><span class="dot"></span>' + name + '</span>';
  }
  function openRank() {
    stopTimer();
    const list = load('eep_rank', []);
    const rl = el('ranklist');
    if (!list.length) rl.innerHTML = '<div class="rank-empty">Ainda sem pontuacoes. Vence uma fase para entrar no ranking.</div>';
    else rl.innerHTML = list.slice(0, 12).map((r, i) =>
      '<div class="rank-row' + (r.name === app.player ? ' me' : '') + '"><span class="pos">' + (i + 1) + '</span>' +
      '<span class="rname">' + escapeHtml(r.name) + '</span><span class="rlvl">F' + r.levelId + ' · ' + r.stars + '★</span>' +
      '<span class="rsc">' + r.score + '</span></div>').join('');
    const have = playerMedals();
    el('rankmedals').innerHTML = '<div style="width:100%;font-size:.78rem;color:var(--muted);text-align:left;margin-bottom:6px">Medalhas de ' + escapeHtml(app.player) + '</div>' +
      MEDALS.map(m => medalChip(m.name, have.indexOf(m.id) < 0)).join('');
    el('rankmodal').hidden = false;
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  // ---- result modal ----
  function showModal(s, byTimeout) {
    stopTimer();
    const win = s.win;
    el('modal-tag').textContent = byTimeout ? 'Tempo esgotado' : (win ? 'Vitoria' : 'Ainda nao');
    el('modal-title').textContent = win ? 'Fase concluida' : 'Faltou equilibrio';
    el('modal-stars').innerHTML = [0, 1, 2].map(i => STAR(i < s.stars)).join('');

    const reasons = [];
    if (!s.meetsEnergy) reasons.push('energia/demanda nao atendida (veja dia e noite)');
    if (!s.meetsBudget) reasons.push('orcamento estourado');
    for (const key in (app.level.targets || {})) if (s[key] < app.level.targets[key]) reasons.push(IND_LABEL[key].toLowerCase() + ' baixa');

    let extra = '';
    if (win && s.stars === 1) extra = ' Para 2 estrelas: custo ate R$ ' + Math.round(app.level.budget / 2) + '. Para 3: ate R$ ' + app.level.parCost + '.';
    else if (win && s.stars === 2) extra = ' Para 3 estrelas: custo ate R$ ' + app.level.parCost + ' (voce: R$ ' + Math.round(s.cost) + ').';
    el('modal-msg').textContent = (win ? 'Voce equilibrou os indicadores e atendeu a demanda.' : 'Ajuste: ' + reasons.join(', ') + '.') + extra;

    const lines = [
      'Energia (pior fase)  ' + Math.round(s.delivered) + ' / ' + Math.round(s.totalDemand),
      'Custo                R$ ' + Math.round(s.cost) + ' / ' + app.level.budget,
      'Perdas na rede       ' + Math.round(s.loss) + ' MW'
    ];
    app.level.indicators.forEach(key => { if (key === 'energia' || key === 'custo') return; lines.push((IND_LABEL[key] + '                 ').slice(0, 20) + Math.round(s[key])); });
    lines.push('PONTUACAO            ' + s.score);
    el('modal-score').textContent = lines.join('\n');

    // medals + ranking only on win
    let newMedals = [];
    if (win) { saveScore(s); newMedals = grantMedals(s); }
    el('modal-medals').innerHTML = newMedals.length
      ? '<div style="width:100%;font-size:.78rem;color:var(--muted);margin-bottom:2px">Novas medalhas</div>' + newMedals.map(m => medalChip(m.name, false)).join('')
      : '';

    if (win && app.level.id < EEP.LEVEL_COUNT) {
      progress.unlocked = Math.max(progress.unlocked, app.level.id + 1);
      el('modal-next').hidden = false; buildLevelBar();
    } else el('modal-next').hidden = true;
    el('modal').hidden = false;
  }

  function updateGridToggle() {
    document.querySelectorAll('#gridtoggle .gr').forEach(b => { b.className = 'gr' + (b.dataset.grid === app.gridType ? ' on' : ''); });
  }

  function loadLevel(n) {
    app.level = EEP.buildLevel(n, app.gridType);
    app.game = EEP.Game(app.level);
    app.renderer = EEP.Renderer(canvas, app.game);
    app.phaseView = 'dia';
    buildLevelBar(); buildObjective(); buildPalette(); buildIndicators(); updateGridToggle();
    onHint(''); app.renderer.draw(null); refresh();
    startTimer(true);
    if (wantDemo) seedDemo();
    if (wantRot) app.renderer.rotate(wantRot * Math.PI / 180);
  }

  function seedDemo() {
    const Hex = EEP.Hex, grid = app.level.grid;
    const node = app.level.nodes[0].key, c0 = app.game.cell(node);
    const nbrs = grid.neighbors(c0.q, c0.r).map(n => Hex.key(n.q, n.r)).filter(k => { const c = app.game.cell(k); return c && (c.terrain === 'land' || c.terrain === 'hill'); });
    const put = (t, k) => { if (!k) return; app.game.setTool(t); app.game.apply(k); };
    put('solar', nbrs[0]); put('wind', nbrs[1]);
    let wa = null;
    for (const [k, c] of app.level.cells) { if ((c.terrain === 'land' || c.terrain === 'hill') && grid.neighbors(c.q, c.r).some(n => { const nc = app.game.cell(Hex.key(n.q, n.r)); return nc && nc.terrain === 'water'; })) { wa = k; break; } }
    put('hydro', wa);
    if (app.level.pieces.indexOf('battery') >= 0) put('battery', nbrs[2]);
    if (app.level.pieces.indexOf('biomass') >= 0) put('biomass', nbrs[3]);
    const b = document.querySelector('.tool[data-tool="solar"]'); if (b) b.click();
    refresh(); app.renderer.draw(null);
  }

  // ---- controls ----
  el('finish').addEventListener('click', () => showModal(app.game.simulate(), false));
  el('reset').addEventListener('click', () => { app.game.reset(); onHint(''); app.renderer.draw(null); refresh(); startTimer(true); });
  el('modal-again').addEventListener('click', () => { el('modal').hidden = true; if (timeLeft > 0) startTimer(false); });
  el('modal-next').addEventListener('click', () => { el('modal').hidden = true; loadLevel(app.level.id); });
  el('modal').addEventListener('click', e => { if (e.target === el('modal')) { el('modal').hidden = true; if (timeLeft > 0) startTimer(false); } });
  el('rot-l').addEventListener('click', () => { if (app.renderer) app.renderer.rotate(-Math.PI / 2); });
  el('rot-r').addEventListener('click', () => { if (app.renderer) app.renderer.rotate(Math.PI / 2); });
  el('zoom-in').addEventListener('click', () => { if (app.renderer) app.renderer.zoom(1.2); });
  el('zoom-out').addEventListener('click', () => { if (app.renderer) app.renderer.zoom(1 / 1.2); });
  document.querySelectorAll('#gridtoggle .gr').forEach(btn => {
    btn.addEventListener('click', () => { if (app.gridType === btn.dataset.grid) return; app.gridType = btn.dataset.grid; loadLevel(app.level.id - 1); });
  });
  el('openrank').addEventListener('click', openRank);
  el('rank-close').addEventListener('click', () => { el('rankmodal').hidden = true; if (timeLeft > 0) startTimer(false); });
  el('rankmodal').addEventListener('click', e => { if (e.target === el('rankmodal')) { el('rankmodal').hidden = true; if (timeLeft > 0) startTimer(false); } });

  // ---- params ----
  let start = 0, skipLogin = false, showcase = false;
  try {
    const params = new URLSearchParams(location.search);
    const q = parseInt(params.get('fase'), 10); if (q >= 1 && q <= EEP.LEVEL_COUNT) { start = q - 1; skipLogin = true; }
    wantDemo = params.get('demo') === '1';
    const gt = params.get('grid'); if (gt === 'square' || gt === 'hex') app.gridType = gt;
    const rr = parseFloat(params.get('rot')); if (!isNaN(rr)) wantRot = rr;
    showcase = params.get('showcase') === '1';
  } catch (e) { }

  // ---- showcase (diorama de pitch): tela cheia, sem HUD, girando ----
  if (showcase) {
    document.body.classList.add('showcase');
    app.player = 'Showcase'; el('login').hidden = true;
    loadLevel(start); stopTimer();
    if (app.renderer && app.renderer.resize) app.renderer.resize();
    (function spin() { if (app.renderer) app.renderer.rotate(0.003); requestAnimationFrame(spin); })();
    return;
  }

  EEP.attachCanvas(app, { canvas, onChange: refresh, onHint });

  function doLogin() {
    const name = (el('login-name').value || '').trim() || 'Visitante';
    app.player = name; save('eep_player', name);
    el('login').hidden = true;
    loadLevel(start);
  }

  if (skipLogin) {
    app.player = load('eep_player', '') || 'Visitante';
    el('login').hidden = true;
    loadLevel(start);
  } else {
    el('login-name').value = load('eep_player', '') || '';
    el('login-go').addEventListener('click', doLogin);
    el('login-name').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
    el('login-name').focus();
  }
});
