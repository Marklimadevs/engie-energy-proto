/* Input — palette selection + canvas interaction. window.EEP.attachInput */
window.EEP = window.EEP || {};
window.EEP.attachInput = function (opts) {
  const { game, renderer, canvas, palette, onChange, onHint } = opts;
  let hoverKey = null;

  function selectTool(btn) {
    game.setTool(btn.dataset.tool);
    palette.querySelectorAll('.tool').forEach(b => b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'));
  }

  palette.querySelectorAll('.tool').forEach(btn => {
    btn.addEventListener('click', () => selectTool(btn));
  });

  canvas.addEventListener('click', (e) => {
    const k = renderer.hitTest(e.clientX, e.clientY);
    if (!k) return;
    game.apply(k);
    if (onHint) onHint(game.state.message);
    renderer.draw(hoverKey);
    if (onChange) onChange();
  });

  canvas.addEventListener('mousemove', (e) => {
    const k = renderer.hitTest(e.clientX, e.clientY);
    if (k !== hoverKey) { hoverKey = k; renderer.draw(hoverKey); }
  });

  canvas.addEventListener('mouseleave', () => { hoverKey = null; renderer.draw(null); });

  // default selection
  const first = palette.querySelector('.tool[data-tool="solar"]');
  if (first) selectTool(first);
};
