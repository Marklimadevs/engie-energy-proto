/* Canvas renderer — terrain, wind, wires, pieces (sources + supports), demand nodes. window.EEP.Renderer */
window.EEP = window.EEP || {};
window.EEP.Renderer = function (canvas, game) {
  const Hex = window.EEP.Hex;
  const ctx = canvas.getContext('2d');
  const level = game.level;
  const SIZE = 30, MARGIN = 24;

  const COLORS = {
    land: '#E3EDE0', water: '#5FA8DE', hill: '#C7D8AE', node: '#FBE5C4',
    stroke: '#B7C6D4', hover: '#0F7FD4'
  };

  let originX = 0, originY = 0, logicalW = 0, logicalH = 0, dpr = 1;

  function layout() {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const c of level.cells.values()) {
      const p = Hex.axialToPixel(c.q, c.r, SIZE);
      c._x = p.x; c._y = p.y;
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
    originX = MARGIN - minX + SIZE; originY = MARGIN - minY + SIZE;
    for (const c of level.cells.values()) { c.cx = c._x + originX; c.cy = c._y + originY; }
    logicalW = (maxX - minX) + 2 * (MARGIN + SIZE);
    logicalH = (maxY - minY) + 2 * (MARGIN + SIZE);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(logicalW * dpr);
    canvas.height = Math.round(logicalH * dpr);
    canvas.style.aspectRatio = logicalW + ' / ' + logicalH;
  }

  function hexPath(cx, cy, size) {
    const pts = Hex.corners(cx, cy, size);
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < 6; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  }
  function roundRect(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function mixWhite(hex, t) {
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return 'rgb(' + Math.round(r + (255 - r) * t) + ',' + Math.round(g + (255 - g) * t) + ',' + Math.round(b + (255 - b) * t) + ')';
  }

  // ---- piece glyphs ----
  function drawSolar(x, y) {
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = '#0E2A44'; roundRect(-12, -8, 24, 16, 3); ctx.fill();
    ctx.strokeStyle = '#7fb4e0'; ctx.lineWidth = 1.3;
    for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * 7, -8); ctx.lineTo(i * 7, 8); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(12, 0); ctx.stroke();
    ctx.fillStyle = '#F4A81D'; ctx.beginPath(); ctx.arc(8, -12, 3.4, 0, 7); ctx.fill();
    ctx.restore();
  }
  function drawHydro(x, y) {
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = '#0F7FD4'; roundRect(-12, -3, 24, 9, 2); ctx.fill();
    ctx.strokeStyle = '#0A5FA6'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-12, 7); ctx.quadraticCurveTo(-5, 11, 0, 7); ctx.quadraticCurveTo(5, 3, 12, 7); ctx.stroke();
    ctx.fillStyle = '#EAF3FB'; for (let i = -1; i <= 1; i++) { roundRect(i * 7 - 1.5, -1, 3, 5, 1); ctx.fill(); }
    ctx.restore();
  }
  function drawWind(x, y) {
    ctx.save(); ctx.translate(x, y);
    ctx.strokeStyle = '#0B1F33'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 12); ctx.lineTo(0, -2); ctx.stroke();
    ctx.fillStyle = '#0F7FD4';
    for (let i = 0; i < 3; i++) {
      ctx.save(); ctx.rotate(i * 2 * Math.PI / 3);
      ctx.beginPath(); ctx.moveTo(0, -2); ctx.lineTo(2.5, -12); ctx.lineTo(-2.5, -12); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = '#0B1F33'; ctx.beginPath(); ctx.arc(0, -2, 2, 0, 7); ctx.fill();
    ctx.restore();
  }
  function drawBiomass(x, y) {
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = '#3f9b57';
    ctx.beginPath(); ctx.moveTo(0, 10); ctx.quadraticCurveTo(-12, 2, -2, -10); ctx.quadraticCurveTo(10, -2, 0, 10); ctx.fill();
    ctx.strokeStyle = '#1f6b39'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-1, 8); ctx.lineTo(-1, -6); ctx.stroke();
    ctx.restore();
  }
  function drawSupport(x, y, color, label) {
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = color; roundRect(-13, -10, 26, 20, 6); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = '700 9px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, 0, 1);
    ctx.restore();
  }
  function drawPiece(type, x, y) {
    if (type === 'solar') return drawSolar(x, y);
    if (type === 'hydro') return drawHydro(x, y);
    if (type === 'wind') return drawWind(x, y);
    if (type === 'biomass') return drawBiomass(x, y);
    if (type === 'battery') return drawSupport(x, y, '#22B99A', 'BAT');
    if (type === 'ia') return drawSupport(x, y, '#0F7FD4', 'IA');
    if (type === 'sensor') return drawSupport(x, y, '#8b9aa8', 'SEN');
    if (type === 'drone') return drawSupport(x, y, '#5D7185', 'DRN');
    if (type === 'pnd') return drawSupport(x, y, '#F4A81D', 'P&D');
  }
  function drawNode(c) {
    ctx.save(); ctx.translate(c.cx, c.cy);
    if (c.nodeType === 'industria') {
      ctx.fillStyle = '#0B1F33';
      roundRect(-13, -2, 26, 12, 1); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-13, -2); ctx.lineTo(-13, -9); ctx.lineTo(-7, -5); ctx.lineTo(-7, -2); ctx.fill();
      roundRect(6, -12, 5, 10, 1); ctx.fill();
      ctx.fillStyle = '#5FA8DE'; for (let i = 0; i < 3; i++) ctx.fillRect(-10 + i * 6, 2, 3, 4);
    } else {
      ctx.fillStyle = '#0B1F33';
      roundRect(-13, -3, 7, 13, 1); ctx.fill(); roundRect(-3, -11, 7, 21, 1); ctx.fill(); roundRect(7, 0, 7, 10, 1); ctx.fill();
      ctx.fillStyle = '#F4A81D'; for (let i = 0; i < 3; i++) { ctx.fillRect(-1, -8 + i * 5, 3, 3); }
    }
    ctx.restore();
  }

  function draw(hoverKey) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, logicalW, logicalH);

    for (const [k, c] of level.cells) {
      let fill = COLORS[c.terrain] || COLORS.land;
      if (c.terrain === 'land') fill = mixWhite('#CFE0C2', c.irr * 0.7);
      hexPath(c.cx, c.cy, SIZE - 1.5); ctx.fillStyle = fill; ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = COLORS.stroke; ctx.stroke();

      if (c.terrain === 'land' && c.irr > 0.82) {
        ctx.fillStyle = 'rgba(244,168,29,.5)'; ctx.beginPath(); ctx.arc(c.cx + SIZE * 0.4, c.cy - SIZE * 0.48, 2.2, 0, 7); ctx.fill();
      }
      if (c.terrain === 'hill' && c.wind > 0.7) { // wind hint
        ctx.strokeStyle = 'rgba(11,31,51,.35)'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(c.cx - 7, c.cy - 6); ctx.lineTo(c.cx + 6, c.cy - 6); ctx.lineTo(c.cx + 2, c.cy - 9); ctx.moveTo(c.cx + 6, c.cy - 6); ctx.lineTo(c.cx + 2, c.cy - 3); ctx.stroke();
      }
    }

    // wires between adjacent connectable cells
    ctx.strokeStyle = '#3a4e62'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    const drawn = new Set();
    for (const [k, c] of level.cells) {
      if (!game.connectable(k)) continue;
      for (const n of Hex.neighbors(c.q, c.r)) {
        const nk = Hex.key(n.q, n.r);
        if (!game.connectable(nk)) continue;
        const pair = k < nk ? k + '|' + nk : nk + '|' + k;
        if (drawn.has(pair)) continue; drawn.add(pair);
        const nc = level.cells.get(nk);
        ctx.beginPath(); ctx.moveTo(c.cx, c.cy); ctx.lineTo(nc.cx, nc.cy); ctx.stroke();
      }
    }
    for (const k of game.state.wires) { const c = level.cells.get(k); ctx.fillStyle = '#3a4e62'; ctx.beginPath(); ctx.arc(c.cx, c.cy, 3.5, 0, 7); ctx.fill(); }

    for (const [k, p] of game.state.pieces) { const c = level.cells.get(k); drawPiece(p.type, c.cx, c.cy); }

    for (const nd of level.nodes) {
      const c = level.cells.get(nd.key);
      hexPath(c.cx, c.cy, SIZE - 1.5);
      ctx.lineWidth = 2.5; ctx.strokeStyle = nd.type === 'industria' ? '#0F7FD4' : '#F4A81D'; ctx.stroke();
      drawNode(c);
    }

    if (hoverKey && level.cells.has(hoverKey)) {
      const c = level.cells.get(hoverKey);
      hexPath(c.cx, c.cy, SIZE - 1.5); ctx.lineWidth = 2.5; ctx.strokeStyle = COLORS.hover; ctx.stroke();
    }
  }

  function hitTest(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) * (logicalW / rect.width) - originX;
    const y = (clientY - rect.top) * (logicalH / rect.height) - originY;
    const a = Hex.pixelToAxial(x, y, SIZE);
    const k = Hex.key(a.q, a.r);
    return level.cells.has(k) ? k : null;
  }

  layout();
  return { draw, layout, hitTest };
};
