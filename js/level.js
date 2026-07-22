/* Level 1 — "Ilumine a Cidade". Builds the map (terrain + irradiance + city). window.EEP.buildLevel1 */
window.EEP = window.EEP || {};
window.EEP.buildLevel1 = function () {
  const Hex = window.EEP.Hex;
  const W = 10, H = 9;

  // Terrain authored in offset (col,row) coords for readability.
  const water = new Set(['3,2', '4,3', '4,4', '5,5', '5,6', '6,7']); // a river across the middle
  const cityCO = '8,6';

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  const cells = new Map();
  let cityKey = null;

  for (let row = 0; row < H; row++) {
    for (let col = 0; col < W; col++) {
      const q = col - Math.floor(row / 2);
      const r = row;
      const k = Hex.key(q, r);
      const co = col + ',' + row;

      let terrain = 'land';
      if (water.has(co)) terrain = 'water';
      if (co === cityCO) { terrain = 'city'; cityKey = k; }

      // Irradiance: sunnier toward the open lower-right; dimmer top-left.
      let irr = clamp(0.5 + 0.5 * ((col + row) / (W + H - 2)), 0.45, 1);
      if (terrain === 'water') irr = 0.3;

      cells.set(k, { q, r, col, row, terrain, irr, cx: 0, cy: 0 });
    }
  }

  return {
    name: 'Level 1 — Ilumine a Cidade',
    W, H, cells, cityKey,
    demand: 120,
    budget: 500,
    // piece + rule params
    params: {
      solarCost: 70, solarBase: 65,      // output = solarBase * irr
      hydroCost: 150, hydroOut: 90,
      wireCost: 10, lossPerHop: 0.03,
      sustBase: 70, sustPerSolar: 9, sustPerHydro: 7, // hydro lowers sustainability
      minSust: 40, minSat: 40
    }
  };
};
