/* Game state + generalized simulation (phases, multi-node, indicators). window.EEP.Game */
window.EEP = window.EEP || {};
window.EEP.Game = function (level) {
  const Hex = window.EEP.Hex;
  const PIECES = window.EEP.PIECES;
  const K = window.EEP.CONST;
  const LOSS_BASE = 0.03;

  const state = {
    level,
    pieces: new Map(), // key -> { type }
    wires: new Set(),
    tool: null,
    message: ''
  };

  const nodeKeys = new Set(level.nodes.map(n => n.key));
  const totalDemand = level.nodes.reduce((a, n) => a + n.demand, 0);

  function cell(k) { return level.cells.get(k); }
  function isNode(k) { return nodeKeys.has(k); }
  function connectable(k) { return state.pieces.has(k) || state.wires.has(k) || isNode(k); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function adjacentToWater(k) {
    const c = cell(k); if (!c) return false;
    return Hex.neighbors(c.q, c.r).some(n => { const nc = cell(Hex.key(n.q, n.r)); return nc && nc.terrain === 'water'; });
  }

  function isBuildableLand(c) { return c.terrain === 'land' || c.terrain === 'hill'; }

  function apply(k) {
    const c = cell(k); if (!c) return '';
    const t = state.tool;
    if (!t) { state.message = 'Selecione uma peca ao lado.'; return state.message; }

    if (t === 'erase') {
      if (state.pieces.has(k)) state.pieces.delete(k);
      else if (state.wires.has(k)) state.wires.delete(k);
      state.message = ''; return '';
    }
    if (isNode(k)) { state.message = 'Aqui e uma demanda (cidade/industria).'; return state.message; }

    const def = PIECES[t];
    if (!def) return '';

    if (t === 'wire') {
      if (!isBuildableLand(c)) { state.message = 'Linha vai em terra/colina.'; return state.message; }
      if (state.pieces.has(k)) { state.message = 'Ja ha uma peca aqui.'; return state.message; }
      if (state.wires.has(k)) state.wires.delete(k); else state.wires.add(k);
      state.message = ''; return '';
    }

    // sources + supports occupy a cell
    if (state.pieces.has(k)) { state.message = 'Celula ja ocupada.'; return state.message; }
    if (def.place === 'water_adj') {
      if (!(c.terrain === 'water' || adjacentToWater(k))) { state.message = 'Hidreletrica so na agua (ou ao lado).'; return state.message; }
    } else {
      if (!isBuildableLand(c)) { state.message = def.name + ' vai em terra/colina.'; return state.message; }
    }
    state.wires.delete(k);
    state.pieces.set(k, { type: t });
    state.message = '';
    return '';
  }

  // Multi-source BFS from all demand nodes over connectable cells -> distance to nearest node.
  function distFromNodes() {
    const dist = new Map(); const visited = new Set();
    let frontier = [];
    for (const nk of nodeKeys) { if (cell(nk)) { dist.set(nk, 0); visited.add(nk); frontier.push(nk); } }
    let d = 0;
    while (frontier.length) {
      const next = [];
      for (const k of frontier) {
        const c = cell(k);
        for (const n of Hex.neighbors(c.q, c.r)) {
          const nk = Hex.key(n.q, n.r);
          if (!visited.has(nk) && connectable(nk)) { visited.add(nk); dist.set(nk, d + 1); next.push(nk); }
        }
      }
      frontier = next; d++;
    }
    return { dist, visited };
  }

  // Does the component containing node `nodeKey` include at least one source?
  function nodePowered(nodeKey) {
    const seen = new Set([nodeKey]); let frontier = [nodeKey];
    while (frontier.length) {
      const next = [];
      for (const k of frontier) {
        if (state.pieces.has(k) && PIECES[state.pieces.get(k).type].kind === 'source') return true;
        const c = cell(k);
        for (const n of Hex.neighbors(c.q, c.r)) {
          const nk = Hex.key(n.q, n.r);
          if (!seen.has(nk) && connectable(nk)) { seen.add(nk); next.push(nk); }
        }
      }
      frontier = next;
    }
    return false;
  }

  function gather() {
    const { dist, visited } = distFromNodes();
    const g = {
      dist, visited,
      sources: [], firm: 0, variable: 0,
      battery: 0, ia: 0, sensor: 0, drone: 0, pnd: 0,
      innov: 0, emis: 0, sustDelta: 0
    };
    for (const [k, p] of state.pieces) {
      const def = PIECES[p.type];
      if (!visited.has(k)) continue; // only connected pieces operate
      if (def.kind === 'source') {
        g.sources.push({ k, def, cell: cell(k) });
        if (def.firm) g.firm++; if (def.variable) g.variable++;
        g.emis += def.emis || 0; g.sustDelta += def.sust || 0;
      } else if (def.kind === 'support') {
        if (def.effect === 'storage') g.battery++;
        else if (def.effect === 'efficiency') g.ia++;
        else if (def.effect === 'stability') g.sensor++;
        else if (def.effect === 'ops') g.drone++;
        else if (def.effect === 'innovation') g.pnd++;
        g.innov += def.innov || 0; g.sustDelta += def.sust || 0;
      }
    }
    return g;
  }

  function deliveredForPhase(phase, g) {
    const lossPerHop = LOSS_BASE * (g.ia > 0 ? 0.55 : 1);
    let delivered = 0, loss = 0;
    for (const s of g.sources) {
      const out = s.def.output(s.cell, { phase });
      const hops = g.dist.get(s.k) || 0;
      const eff = Math.max(0, 1 - lossPerHop * hops);
      delivered += out * eff; loss += out * (1 - eff);
    }
    if (phase === 'noite') delivered += g.battery * K.BATTERY_NIGHT; // discharge stored
    return { delivered, loss };
  }

  function pieceCost() {
    let cost = 0;
    for (const [, p] of state.pieces) cost += PIECES[p.type].cost || 0;
    cost += state.wires.size * PIECES.wire.cost;
    return cost;
  }

  function simulate() {
    const g = gather();
    const phases = level.phases || ['dia'];
    const phaseRes = {};
    let worst = Infinity, worstLoss = 0;
    for (const ph of phases) {
      const r = deliveredForPhase(ph, g);
      phaseRes[ph] = r;
      if (r.delivered < worst) { worst = r.delivered; worstLoss = r.loss; }
    }
    if (!isFinite(worst)) worst = 0;

    const cost = pieceCost();
    const coverage = totalDemand > 0 ? worst / totalDemand : 0;
    const poweredNodes = level.nodes.filter(n => nodePowered(n.key)).length;
    const allPowered = poweredNodes === level.nodes.length;

    // indicators (0..100)
    const sust = clamp(70 + g.sustDelta, 0, 100);
    const estab = clamp(55 + g.firm * 8 + g.battery * 10 + g.ia * 8 + g.sensor * 7 + g.drone * 3 - g.variable * 7, 0, 100);
    const inov = clamp(g.innov, 0, 100);
    const emis = clamp(100 - g.emis * 6, 0, 100);           // higher = cleaner
    const lucro = clamp(40 + (coverage >= 1 ? 18 : 0) + (level.budget - cost) / level.budget * 42 - g.emis * 2, 0, 100);
    let sat = 40 + 55 * Math.min(1, coverage);
    if (cost > level.budget) sat -= 15;
    if (worst < totalDemand || !allPowered) sat -= 10;
    sat += (estab - 55) * 0.15;
    sat = clamp(sat, 0, 100);

    const ind = { energia: coverage * 100, custo: cost, sust, estab, inov, emis, lucro, sat };

    // win: cover demand (worst phase), all nodes powered, budget ok, targets met
    const meetsEnergy = worst >= totalDemand && allPowered;
    const meetsBudget = cost <= level.budget;
    let meetsTargets = true;
    for (const key in (level.targets || {})) if (ind[key] < level.targets[key]) meetsTargets = false;
    const win = meetsEnergy && meetsBudget && meetsTargets;

    const score = Math.max(0, Math.round(
      Math.min(1, coverage) * 400 + sust * 2 + estab * 1.5 + inov * 1.2 + emis * 1 +
      Math.max(0, level.budget - cost) * 0.25 - worstLoss * 3
    ));

    // stars: 1 = venceu, 2 = custo <= metade do orcamento, 3 = custo <= par (quase-minimo)
    let stars = 0;
    if (win) { stars = 1; if (cost <= level.budget / 2) stars++; if (cost <= (level.parCost || level.budget / 2)) stars++; }

    return {
      delivered: worst, totalDemand, cost, coverage, loss: worstLoss,
      sust, estab, inov, emis, lucro, sat,
      poweredNodes, allPowered, meetsEnergy, meetsBudget, meetsTargets, win, stars, score,
      phaseRes, counts: g
    };
  }

  function reset() { state.pieces.clear(); state.wires.clear(); state.message = ''; }

  return {
    state, level, totalDemand, nodeKeys,
    setTool(t) { state.tool = t; },
    apply, simulate, reset, connectable, isNode, cell
  };
};
