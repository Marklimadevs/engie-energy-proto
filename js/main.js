/* Bootstrap + level manager + dynamic UI (palette, indicators, phases, progression). */
window.addEventListener('DOMContentLoaded', function () {
  const EEP = window.EEP;
  const PIECES = EEP.PIECES;
  const el = id => document.getElementById(id);
  const canvas = el('board');

  const app = { game: null, renderer: null, level: null, phaseView: 'dia' };
  const progress = { unlocked: 99 }; // protótipo: todas as fases liberadas para teste

  const IND_LABEL = {
    energia: 'Energia', custo: 'Custo', sust: 'Sustentabilidade',
    estab: 'Estabilidade', inov: 'Inovacao', emis: 'Emissoes (limpo)',
    lucro: 'Lucro', sat: 'Satisfacao'
  };
  const SWATCH = {
    solar: 'linear-gradient(135deg,#ffe08a,#f4a81d)', hydro: 'linear-gradient(135deg,#7fd0ff,#0f7fd4)',
    wind: 'linear-gradient(135deg,#bfe4ff,#3fb6ff)', biomass: 'linear-gradient(135deg,#8fe0a0,#3f9b57)',
    battery: 'linear-gradient(135deg,#7fe6cf,#22b99a)', ia: 'linear-gradient(135deg,#8fc4f0,#0f7fd4)',
    sensor: 'linear-gradient(135deg,#cfd8e0,#8b9aa8)', drone: 'linear-gradient(135deg,#aeb9c4,#5d7185)',
    pnd: 'linear-gradient(135deg,#ffd98a,#f4a81d)', wire: 'linear-gradient(135deg,#c8d3de,#8b9aa8)',
    erase: 'linear-gradient(135deg,#f3b6ac,#e5533d)'
  };

  const indEls = {}; // key -> { v, bar }

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
    el('obj-teaches').textContent = app.level.teaches;
    const multi = (app.level.phases || []).indexOf('noite') >= 0;
    const pt = el('phasetoggle');
    pt.hidden = !multi;
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
      btn.innerHTML = '<span class="ti" style="background:' + SWATCH[key] + '"></span>' +
        '<span class="tl">' + def.name + '</span><span class="tc">' + cost + '</span>';
      btn.addEventListener('click', () => {
        app.game.setTool(key);
        pal.querySelectorAll('.tool').forEach(b => b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'));
        el('tradeoff').textContent = def.desc || '';
      });
      btn.addEventListener('mouseenter', () => { el('tradeoff').textContent = def.desc || ''; });
      pal.appendChild(btn);
    });
    // default select solar
    const first = pal.querySelector('.tool[data-tool="solar"]') || pal.querySelector('.tool');
    if (first) first.click();
  }

  function buildIndicators() {
    const box = el('indicators'); box.innerHTML = '';
    for (const key in indEls) delete indEls[key];
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
      return { text: Math.round(d) + ' / ' + s.totalDemand, width: Math.min(100, d / s.totalDemand * 100), cls: s.meetsEnergy ? 'green' : '' };
    }
    if (key === 'custo') {
      return { text: 'R$ ' + Math.round(s.cost) + ' / ' + app.level.budget, width: Math.min(100, s.cost / app.level.budget * 100), cls: s.cost > app.level.budget ? 'low' : 'amber' };
    }
    const v = s[key], tgt = (app.level.targets || {})[key];
    return { text: Math.round(v) + (tgt ? ' / ' + tgt : ''), width: v, cls: (tgt && v < tgt) ? 'low' : 'green' };
  }

  function refresh() {
    const s = app.game.simulate();
    app.level.indicators.forEach(key => {
      const d = indDisplay(key, s), e = indEls[key];
      if (!e) return;
      e.v.textContent = d.text;
      e.bar.style.width = Math.max(0, Math.min(100, d.width)) + '%';
      e.bar.className = d.cls;
    });
  }

  function onHint(msg) {
    if (msg) { el('hint').textContent = msg; return; }
    const multi = (app.level.phases || []).indexOf('noite') >= 0;
    if (multi) {
      const s = app.game.simulate();
      el('hint').textContent = 'Dia: ' + Math.round(s.phaseRes.dia.delivered) + ' MW  ·  Noite: ' +
        Math.round(s.phaseRes.noite.delivered) + ' MW  (a fase mais fraca vale para vencer)';
    } else {
      el('hint').textContent = 'Selecione uma peca e clique numa celula. Ligue as fontes as demandas com linhas.';
    }
  }

  function showModal(s) {
    const win = s.win;
    el('modal-tag').textContent = win ? 'Vitoria' : 'Ainda nao';
    el('modal-title').textContent = win ? 'Fase concluida' : 'Faltou equilibrio';

    const reasons = [];
    if (!s.meetsEnergy) reasons.push('energia/demanda nao atendida (veja dia e noite)');
    if (!s.meetsBudget) reasons.push('orcamento estourado');
    for (const key in (app.level.targets || {})) if (s[key] < app.level.targets[key]) reasons.push(IND_LABEL[key].toLowerCase() + ' baixa');

    el('modal-msg').textContent = win
      ? 'Voce equilibrou os indicadores e atendeu a demanda.'
      : 'Ajuste: ' + reasons.join(', ') + '.';

    const lines = [
      'Energia (pior fase)  ' + Math.round(s.delivered) + ' / ' + s.totalDemand,
      'Custo                R$ ' + Math.round(s.cost) + ' / ' + app.level.budget,
      'Perdas na rede       ' + Math.round(s.loss) + ' MW'
    ];
    app.level.indicators.forEach(key => {
      if (key === 'energia' || key === 'custo') return;
      lines.push((IND_LABEL[key] + '                 ').slice(0, 20) + Math.round(s[key]));
    });
    lines.push('PONTUACAO            ' + s.score);
    el('modal-score').textContent = lines.join('\n');

    if (win && app.level.id < EEP.LEVEL_COUNT) {
      progress.unlocked = Math.max(progress.unlocked, app.level.id + 1);
      el('modal-next').hidden = false;
      buildLevelBar();
    } else {
      el('modal-next').hidden = true;
    }
    el('modal').hidden = false;
  }

  function loadLevel(n) {
    app.level = EEP.buildLevel(n);
    app.game = EEP.Game(app.level);
    app.renderer = EEP.Renderer(canvas, app.game);
    app.phaseView = 'dia';
    buildLevelBar(); buildObjective(); buildPalette(); buildIndicators();
    onHint(''); app.renderer.draw(null); refresh();
  }

  // wire up static controls (once)
  el('finish').addEventListener('click', () => showModal(app.game.simulate()));
  el('reset').addEventListener('click', () => { app.game.reset(); onHint(''); app.renderer.draw(null); refresh(); });
  el('modal-again').addEventListener('click', () => { el('modal').hidden = true; });
  el('modal-next').addEventListener('click', () => { el('modal').hidden = true; loadLevel(app.level.id); });
  el('modal').addEventListener('click', (e) => { if (e.target === el('modal')) el('modal').hidden = true; });

  EEP.attachCanvas(app, { canvas, onChange: refresh, onHint });

  let start = 0;
  try { const q = parseInt(new URLSearchParams(location.search).get('fase'), 10); if (q >= 1 && q <= EEP.LEVEL_COUNT) start = q - 1; } catch (e) { }
  loadLevel(start);
});
