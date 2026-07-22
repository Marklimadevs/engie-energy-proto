/* Bootstrap + HUD + modal. window.EEP entrypoint */
window.addEventListener('DOMContentLoaded', function () {
  const EEP = window.EEP;
  const level = EEP.buildLevel1();
  const game = EEP.Game(level);
  const canvas = document.getElementById('board');
  const renderer = EEP.Renderer(canvas, game);

  const el = id => document.getElementById(id);
  const P = level.params;

  function setBar(bar, width, cls) {
    bar.style.width = Math.max(0, Math.min(100, width)) + '%';
    bar.className = cls;
  }

  function refresh() {
    const s = game.simulate();

    el('v-energia').textContent = Math.round(s.delivered) + ' / ' + level.demand;
    setBar(el('b-energia'), s.coverage * 100, s.meetsEnergy ? 'green' : '');

    el('v-custo').textContent = 'R$ ' + Math.round(s.cost) + ' / ' + level.budget;
    setBar(el('b-custo'), (s.cost / level.budget) * 100, s.cost > level.budget ? 'low' : 'amber');

    el('v-sust').textContent = Math.round(s.sust);
    setBar(el('b-sust'), s.sust, s.sust < P.minSust ? 'low' : 'green');

    el('v-sat').textContent = Math.round(s.sat);
    setBar(el('b-sat'), s.sat, s.sat < P.minSat ? 'low' : 'green');
  }

  function onHint(msg) {
    el('hint').textContent = msg || 'Selecione uma peca e clique numa celula. Ligue as fontes a cidade com linhas.';
  }

  function showModal(s) {
    const win = s.win;
    el('modal-tag').textContent = win ? 'Vitoria' : 'Ainda nao';
    el('modal-title').textContent = win ? 'Cidade iluminada' : 'Faltou equilibrio';

    const reasons = [];
    if (!s.meetsEnergy) reasons.push('energia abaixo da demanda');
    if (!s.meetsBudget) reasons.push('orcamento estourado');
    if (s.sust < P.minSust) reasons.push('sustentabilidade baixa');
    if (s.sat < P.minSat) reasons.push('satisfacao baixa');

    el('modal-msg').textContent = win
      ? 'Voce equilibrou energia, custo e sustentabilidade.'
      : 'Ajuste: ' + reasons.join(', ') + '.';

    el('modal-score').textContent =
      'Energia entregue   ' + Math.round(s.delivered) + ' / ' + level.demand + '\n' +
      'Custo              R$ ' + Math.round(s.cost) + ' / ' + level.budget + '\n' +
      'Perdas na rede     ' + Math.round(s.lossMW) + ' MW\n' +
      'Sustentabilidade   ' + Math.round(s.sust) + '\n' +
      'Satisfacao         ' + Math.round(s.sat) + '\n' +
      'PONTUACAO          ' + s.score;

    el('modal').hidden = false;
  }

  el('finish').addEventListener('click', () => showModal(game.simulate()));
  el('reset').addEventListener('click', () => {
    game.reset(); onHint(''); refresh(); renderer.draw(null);
  });
  el('modal-again').addEventListener('click', () => { el('modal').hidden = true; });
  el('modal').addEventListener('click', (e) => { if (e.target === el('modal')) el('modal').hidden = true; });

  EEP.attachInput({ game, renderer, canvas, palette: el('palette'), onChange: refresh, onHint });

  renderer.draw(null);
  refresh();
});
