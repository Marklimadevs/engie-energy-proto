/* Hex math — pointy-top, axial coordinates (q, r). Classic script -> window.EEP.Hex */
window.EEP = window.EEP || {};
window.EEP.Hex = (function () {
  const SQRT3 = Math.sqrt(3);

  function axialToPixel(q, r, size) {
    return { x: size * SQRT3 * (q + r / 2), y: size * 1.5 * r };
  }

  function axialRound(qf, rf) {
    // cube round
    let x = qf, z = rf, y = -x - z;
    let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
    const dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
    if (dx > dy && dx > dz) rx = -ry - rz;
    else if (dy > dz) ry = -rx - rz;
    else rz = -rx - ry;
    return { q: rx, r: rz };
  }

  function pixelToAxial(x, y, size) {
    const qf = (SQRT3 / 3 * x - 1 / 3 * y) / size;
    const rf = (2 / 3 * y) / size;
    return axialRound(qf, rf);
  }

  const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

  function neighbors(q, r) {
    return DIRS.map(d => ({ q: q + d[0], r: r + d[1] }));
  }

  function key(q, r) { return q + ',' + r; }

  function corners(cx, cy, size) {
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const ang = Math.PI / 180 * (60 * i - 30);
      pts.push([cx + size * Math.cos(ang), cy + size * Math.sin(ang)]);
    }
    return pts;
  }

  return { axialToPixel, pixelToAxial, neighbors, key, corners, DIRS, SQRT3 };
})();

/* Grid abstraction: hex or square. Both expose neighbors/toPixel/tile/place. window.EEP.Grid */
window.EEP.Grid = (function () {
  const S3 = Math.sqrt(3);
  const hex = {
    type: 'hex',
    dirs: [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]],
    neighbors(q, r) { return this.dirs.map(d => ({ q: q + d[0], r: r + d[1] })); },
    toPixel(q, r, s) { return { x: s * S3 * (q + r / 2), y: s * 1.5 * r }; },
    tile(s) { const g = s * 0.965, p = []; for (let i = 0; i < 6; i++) { const a = Math.PI / 180 * (60 * i - 30); p.push([g * Math.cos(a), g * Math.sin(a)]); } return p; },
    place(col, row) { return { q: col - Math.floor(row / 2), r: row }; }
  };
  const square = {
    type: 'square',
    dirs: [[1, 0], [-1, 0], [0, 1], [0, -1]],
    neighbors(q, r) { return this.dirs.map(d => ({ q: q + d[0], r: r + d[1] })); },
    toPixel(q, r, s) { return { x: q * s * 1.8, y: r * s * 1.8 }; },
    tile(s) { const h = s * 0.85; return [[-h, -h], [h, -h], [h, h], [-h, h]]; },
    place(col, row) { return { q: col, r: row }; }
  };
  return { hex, square };
})();
