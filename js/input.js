/* Canvas interaction: left-drag rotates the view, click places, hover highlights. window.EEP.attachCanvas */
window.EEP = window.EEP || {};
window.EEP.attachCanvas = function (app, opts) {
  const { canvas, onChange, onHint } = opts;
  let hover = null, down = false, dragged = false, lastX = 0, sx = 0, sy = 0;
  const DRAG_TH = 5;

  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    down = true; dragged = false; sx = e.clientX; sy = e.clientY; lastX = e.clientX;
  });

  // hover only when not dragging (pointer over the board)
  canvas.addEventListener('mousemove', (e) => {
    if (down || !app.renderer) return;
    const k = app.renderer.hitTest(e.clientX, e.clientY);
    if (k !== hover) { hover = k; app.renderer.draw(hover); }
  });

  // rotation drag continues even if the cursor leaves the canvas
  window.addEventListener('mousemove', (e) => {
    if (!down || !app.renderer) return;
    const dx = e.clientX - lastX; lastX = e.clientX;
    if (Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) > DRAG_TH) dragged = true;
    if (dragged && app.renderer.rotate) app.renderer.rotate(-dx * 0.01);
  });

  window.addEventListener('mouseup', (e) => {
    if (!down) return; down = false;
    if (!app.renderer) return;
    if (dragged) { if (app.renderer.snap) app.renderer.snap(); return; } // settle to a 90deg view
    const k = app.renderer.hitTest(e.clientX, e.clientY);
    if (!k) return;
    app.game.apply(k);
    if (onHint) onHint(app.game.state.message);
    app.renderer.draw(hover);
    if (onChange) onChange();
  });

  canvas.addEventListener('mouseleave', () => { if (!down) { hover = null; if (app.renderer) app.renderer.draw(null); } });

  // keyboard rotation
  window.addEventListener('keydown', (e) => {
    if (!app.renderer || !app.renderer.rotate) return;
    if (e.key === 'q' || e.key === 'Q') app.renderer.rotate(-Math.PI / 2);
    else if (e.key === 'e' || e.key === 'E') app.renderer.rotate(Math.PI / 2);
  });
};
