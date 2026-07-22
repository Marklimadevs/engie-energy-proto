/* Game state + simulation (energy / cost / connectivity / indicators / score). window.EEP.Game */
window.EEP = window.EEP || {};
window.EEP.Game = function (level) {
  const Hex = window.EEP.Hex;
  const P = level.params;

  const state = {
    level,
    pieces: new Map(), // key -> { type: 'solar'|'hydro' }
    wires: new Set(),  // key
    tool: null,
    message: ''
  };

  function isCity(k) { return k === level.cityKey; }
  function cell(k) { return level.cells.get(k); }
  function connectable(k) { return state.pieces.has(k) || state.wires.has(k) || isCity(k); }

  function adjacentToWater(k) {
    const c = cell(k); if (!c) return false;
    return Hex.neighbors(c.q, c.r).some(n => {
      const nc = cell(Hex.key(n.q, n.r));
      return nc && nc.terrain === 'water';
    });
  }

  // Try to place the current tool on cell k. Returns feedback string.
  function apply(k) {
    const c = cell(k);
    if (!c) return '';
    const t = state.tool;
    if (!t) { state.message = 'Selecione uma peca ao lado.'; return state.message; }

    if (t === 'erase') {
      if (state.pieces.has(k)) state.pieces.delete(k);
      else if (state.wires.has(k)) state.wires.delete(k);
      state.message = '';
      return '';
    }

    if (isCity(k)) { state.message = 'A cidade ja esta no mapa.'; return state.message; }

    if (t === 'solar') {
      if (c.terrain === 'water') { state.message = 'Solar nao vai na agua.'; return state.message; }
      if (state.pieces.has(k)) { state.message = 'Celula ja ocupada.'; return state.message; }
      state.wires.delete(k);
      state.pieces.set(k, { type: 'solar' });
      state.message = '';
      return '';
    }

    if (t === 'hydro') {
      if (!(c.terrain === 'water' || adjacentToWater(k))) { state.message = 'Hidreletrica so na agua (ou ao lado dela).'; return state.message; }
      if (state.pieces.has(k)) { state.message = 'Celula ja ocupada.'; return state.message; }
      state.wires.delete(k);
      state.pieces.set(k, { type: 'hydro' });
      state.message = '';
      return '';
    }

    if (t === 'wire') {
      if (c.terrain === 'water') { state.message = 'Linha nao atravessa a agua neste protótipo.'; return state.message; }
      if (state.pieces.has(k)) { state.message = 'Ja ha uma fonte aqui.'; return state.message; }
      if (state.wires.has(k)) state.wires.delete(k); else state.wires.add(k);
      state.message = '';
      return '';
    }
    return '';
  }

  function sourceOutput(k, piece) {
    if (piece.type === 'hydro') return P.hydroOut;
    if (piece.type === 'solar') return P.solarBase * cell(k).irr;
    return 0;
  }

  // BFS over connectable cells from a source to the nearest city. Returns hop count or -1.
  function hopsToCity(startKey) {
    if (!connectable(startKey)) return -1;
    const seen = new Set([startKey]);
    let frontier = [startKey], depth = 0;
    while (frontier.length) {
      const next = [];
      for (const k of frontier) {
        if (isCity(k)) return depth;
        const c = cell(k);
        for (const n of Hex.neighbors(c.q, c.r)) {
          const nk = Hex.key(n.q, n.r);
          if (!seen.has(nk) && connectable(nk)) { seen.add(nk); next.push(nk); }
        }
      }
      frontier = next; depth++;
    }
    return -1;
  }

  function simulate() {
    let delivered = 0, lossMW = 0, connected = 0;
    let nSolar = 0, nHydro = 0;

    for (const [k, piece] of state.pieces) {
      if (piece.type === 'solar') nSolar++; else if (piece.type === 'hydro') nHydro++;
      const out = sourceOutput(k, piece);
      const hops = hopsToCity(k);
      if (hops >= 0) {
        connected++;
        const eff = Math.max(0, 1 - P.lossPerHop * hops);
        delivered += out * eff;
        lossMW += out * (1 - eff);
      }
    }

    const cost = nSolar * P.solarCost + nHydro * P.hydroCost + state.wires.size * P.wireCost;

    // Indicators (0..100)
    const coverage = level.demand > 0 ? delivered / level.demand : 0;
    let sust = P.sustBase + nSolar * P.sustPerSolar - nHydro * P.sustPerHydro;
    sust = Math.max(0, Math.min(100, sust));
    let sat = 40 + 55 * Math.min(1, coverage);
    if (cost > level.budget) sat -= 15;              // over budget frustrates
    if (delivered < level.demand) sat -= 10;         // blackout risk
    sat = Math.max(0, Math.min(100, sat));

    const meetsEnergy = delivered >= level.demand;
    const meetsBudget = cost <= level.budget;
    const balanced = sust >= P.minSust && sat >= P.minSat;
    const win = meetsEnergy && meetsBudget && balanced;

    // Score: reward coverage, sustainability, budget left, penalize losses
    const score = Math.max(0, Math.round(
      Math.min(1, coverage) * 400 + sust * 3 + Math.max(0, level.budget - cost) * 0.4 - lossMW * 3
    ));

    return {
      delivered, lossMW, cost, coverage, sust, sat, connected,
      nSolar, nHydro, meetsEnergy, meetsBudget, balanced, win, score
    };
  }

  function reset() {
    state.pieces.clear();
    state.wires.clear();
    state.message = '';
  }

  return {
    state, level,
    setTool(t) { state.tool = t; },
    apply, simulate, reset,
    connectable, isCity, cell
  };
};
