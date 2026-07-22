/* Canvas renderer — hexes, terrain, irradiance, wires, pieces, city. window.EEP.Renderer */
window.EEP = window.EEP || {};
window.EEP.Renderer = function (canvas, game) {
  const Hex = window.EEP.Hex;
  const ctx = canvas.getContext('2d');
  const level = game.level;
  const SIZE = 32, MARGIN = 26;

  const COLORS = {
    land: '#E3EDE0', water: '#5FA8DE', hill: '#CFE0C2', city: '#FBE5C4',
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
    originX = MARGIN - minX + SIZE;
    originY = MARGIN - minY + SIZE;
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
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < 6; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  }

  function mix(hex, white, t) {
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    const rr = Math.round(r + (255 - r) * t), gg = Math.round(g + (255 - g) * t), bb = Math.round(b + (255 - b) * t);
    void white;
    return 'rgb(' + rr + ',' + gg + ',' + bb + ')';
  }

  function drawSolar(cx, cy) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = '#0E2A44';
    roundRect(-13, -9, 26, 18, 3); ctx.fill();
    ctx.strokeStyle = '#7fb4e0'; ctx.lineWidth = 1.4;
    for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * 8, -9); ctx.lineTo(i * 8, 9); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(-13, 0); ctx.lineTo(13, 0); ctx.stroke();
    ctx.fillStyle = '#F4A81D'; ctx.beginPath(); ctx.arc(9, -13, 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawHydro(cx, cy) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = '#0F7FD4';
    roundRect(-13, -3, 26, 10, 2); ctx.fill();      // dam wall
    ctx.strokeStyle = '#0A5FA6'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-13, 7); ctx.quadraticCurveTo(-6, 12, 0, 7); ctx.quadraticCurveTo(6, 2, 13, 7); ctx.stroke();
    ctx.fillStyle = '#EAF3FB';
    for (let i = -1; i <= 1; i++) { roundRect(i * 8 - 2, -1, 4, 6, 1); ctx.fill(); }
    ctx.restore();
  }

  function drawCity(cx, cy) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = '#0B1F33';
    roundRect(-14, -4, 8, 14, 1); ctx.fill();
    roundRect(-3, -12, 8, 22, 1); ctx.fill();
    roundRect(8, -1, 8, 11, 1); ctx.fill();
    ctx.fillStyle = '#F4A81D';
    for (let i = 0; i < 3; i++) { ctx.fillRect(-1, -9 + i * 5, 3, 3); ctx.fillRect(10, 2 + (i % 2) * 4, 2, 2); }
    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function draw(hoverKey) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, logicalW, logicalH);

    // hexes
    for (const [k, c] of level.cells) {
      let fill = COLORS[c.terrain] || COLORS.land;
      if (c.terrain === 'land') fill = mix('#CFE0C2', '#fff', c.irr * 0.75); // sunnier = lighter/warmer
      hexPath(c.cx, c.cy, SIZE - 1.5);
      ctx.fillStyle = fill; ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = COLORS.stroke; ctx.stroke();

      // irradiance sun dot on strong land cells
      if (c.terrain === 'land' && c.irr > 0.8) {
        ctx.fillStyle = 'rgba(244,168,29,.55)';
        ctx.beginPath(); ctx.arc(c.cx + SIZE * 0.42, c.cy - SIZE * 0.5, 2.4, 0, Math.PI * 2); ctx.fill();
      }
    }

    // wires (links between adjacent connectable cells)
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
    // wire nodes
    for (const k of game.state.wires) {
      const c = level.cells.get(k);
      ctx.fillStyle = '#3a4e62'; ctx.beginPath(); ctx.arc(c.cx, c.cy, 4, 0, Math.PI * 2); ctx.fill();
    }

    // pieces
    for (const [k, piece] of game.state.pieces) {
      const c = level.cells.get(k);
      if (piece.type === 'solar') drawSolar(c.cx, c.cy);
      else if (piece.type === 'hydro') drawHydro(c.cx, c.cy);
    }

    // city
    const cc = level.cells.get(level.cityKey);
    if (cc) {
      hexPath(cc.cx, cc.cy, SIZE - 1.5);
      ctx.lineWidth = 2.5; ctx.strokeStyle = '#F4A81D'; ctx.stroke();
      drawCity(cc.cx, cc.cy);
    }

    // hover
    if (hoverKey && level.cells.has(hoverKey)) {
      const c = level.cells.get(hoverKey);
      hexPath(c.cx, c.cy, SIZE - 1.5);
      ctx.lineWidth = 2.5; ctx.strokeStyle = COLORS.hover; ctx.stroke();
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

  return { draw, layout, hitTest, get logicalW() { return logicalW; }, get logicalH() { return logicalH; } };
};
