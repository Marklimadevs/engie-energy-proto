/* Canvas interaction — bound once, reads current app.game / app.renderer. window.EEP.attachCanvas */
window.EEP = window.EEP || {};
window.EEP.attachCanvas = function (app, opts) {
  const { canvas, onChange, onHint } = opts;
  let hover = null;

  canvas.addEventListener('click', (e) => {
    if (!app.renderer || !app.game) return;
    const k = app.renderer.hitTest(e.clientX, e.clientY);
    if (!k) return;
    app.game.apply(k);
    if (onHint) onHint(app.game.state.message);
    app.renderer.draw(hover);
    if (onChange) onChange();
  });

  canvas.addEventListener('mousemove', (e) => {
    if (!app.renderer) return;
    const k = app.renderer.hitTest(e.clientX, e.clientY);
    if (k !== hover) { hover = k; app.renderer.draw(hover); }
  });

  canvas.addEventListener('mouseleave', () => { hover = null; if (app.renderer) app.renderer.draw(null); });
};
