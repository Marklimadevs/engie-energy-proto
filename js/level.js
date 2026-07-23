/* Pieces registry + Levels (data-driven), following Pablo's GDD. window.EEP.PIECES / LEVELS / buildLevel */
window.EEP = window.EEP || {};
(function () {
  const Hex = window.EEP.Hex;

  // ---- tuning constants ----
  const SOLAR_BASE = 65, WIND_BASE = 70, HYDRO_OUT = 90, BIO_OUT = 68;
  const BATTERY_NIGHT = 48; // firm MW a battery discharges at night

  // ---- pieces ----
  // kind: source | support | wire | node
  // place: land | water_adj | any
  // output(cell, ctx): MW (ctx = { phase })
  const PIECES = {
    solar: {
      key: 'solar', name: 'Solar', cost: 70, kind: 'source', place: 'land',
      renewable: true, variable: true, emis: 0, sust: 9,
      output: (c, ctx) => ctx.phase === 'noite' ? 0 : SOLAR_BASE * c.irr,
      desc: 'Barata e sustentavel; rende mais no sol. Nao gera a noite.'
    },
    hydro: {
      key: 'hydro', name: 'Hidreletrica', cost: 150, kind: 'source', place: 'water_adj',
      renewable: true, firm: true, emis: 1, sust: -7,
      output: () => HYDRO_OUT,
      desc: 'Muita energia e estavel; cara e com impacto ambiental.'
    },
    wind: {
      key: 'wind', name: 'Eolica', cost: 95, kind: 'source', place: 'land',
      renewable: true, variable: true, emis: 0, sust: 7,
      output: (c) => WIND_BASE * c.wind,
      desc: 'Sustentavel e gera de dia e de noite; producao variavel com o vento.'
    },
    biomass: {
      key: 'biomass', name: 'Biomassa', cost: 120, kind: 'source', place: 'land',
      renewable: true, firm: true, emis: 6, sust: 2,
      output: () => BIO_OUT,
      desc: 'Firme e despachavel; emite mais carbono.'
    },
    battery: {
      key: 'battery', name: 'Baterias', cost: 100, kind: 'support', place: 'land',
      effect: 'storage', sust: 1,
      desc: 'Armazena energia e entrega a noite; estabiliza a rede.'
    },
    ia: {
      key: 'ia', name: 'IA de Previsao', cost: 80, kind: 'support', place: 'any',
      effect: 'efficiency', innov: 22,
      desc: 'Reduz perdas na transmissao e melhora previsao. Aumenta inovacao.'
    },
    sensor: {
      key: 'sensor', name: 'Sensores', cost: 50, kind: 'support', place: 'any',
      effect: 'stability', innov: 8,
      desc: 'Acham falhas rapido; melhoram estabilidade e reduzem manutencao.'
    },
    drone: {
      key: 'drone', name: 'Drone', cost: 60, kind: 'support', place: 'any',
      effect: 'ops', innov: 10,
      desc: 'Reduz custo de inspecao e aumenta seguranca.'
    },
    pnd: {
      key: 'pnd', name: 'Projeto P&D', cost: 40, kind: 'support', place: 'any',
      effect: 'innovation', innov: 28,
      desc: 'Carta especial: ativa um projeto de inovacao da ENGIE. Aumenta muito a inovacao.'
    },
    wire: {
      key: 'wire', name: 'Linha', cost: 10, kind: 'wire',
      desc: 'Conecta fontes as demandas; custa por segmento e perde por distancia.'
    },
    erase: { key: 'erase', name: 'Remover', cost: 0, kind: 'tool', desc: 'Remove a peca ou linha da celula.' }
  };

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function hash01(q, r) { const h = Math.sin(q * 12.9898 + r * 78.233) * 43758.5453; return h - Math.floor(h); }

  // Build a map from offset-coord authoring sets, for the given grid (hex or square).
  function buildMap(W, H, opts, grid) {
    const water = new Set(opts.water || []);
    const hills = new Set(opts.hills || []);
    const nodeByCO = new Map((opts.nodes || []).map(n => [n.col + ',' + n.row, n]));
    const cells = new Map();
    const nodes = [];

    for (let row = 0; row < H; row++) {
      for (let col = 0; col < W; col++) {
        const pc = grid.place(col, row), q = pc.q, r = pc.r;
        const k = Hex.key(q, r);
        const co = col + ',' + row;
        let terrain = 'land';
        if (water.has(co)) terrain = 'water';
        if (hills.has(co)) terrain = 'hill';
        let nodeType = null, demand = 0;
        if (nodeByCO.has(co)) { const n = nodeByCO.get(co); terrain = 'node'; nodeType = n.type; demand = n.demand; }

        let irr = clamp(0.5 + 0.5 * ((col + row) / (W + H - 2)), 0.45, 1);
        if (terrain === 'water') irr = 0.3;
        let wind = clamp(0.4 + (terrain === 'hill' ? 0.42 : 0) + (row < H / 3 ? 0.16 : 0) + hash01(q, r) * 0.14, 0.3, 1);
        if (terrain === 'water') wind = 0.35;

        const cell = { q, r, col, row, terrain, nodeType, demand, irr, wind, cx: 0, cy: 0 };
        cells.set(k, cell);
        if (nodeType) nodes.push({ key: k, type: nodeType, demand });
      }
    }
    return { cells, nodes };
  }

  // ---- Level definitions ----
  function level1(gridType) {
    const grid = window.EEP.Grid[gridType] || window.EEP.Grid.hex;
    const W = 10, H = 9;
    const m = buildMap(W, H, {
      water: ['3,2', '4,3', '4,4', '5,5', '5,6', '6,7'],
      nodes: [{ col: 8, row: 6, type: 'cidade', demand: 120 }]
    }, grid);
    return {
      id: 1, name: 'Ilumine a Cidade',
      teaches: 'geracao · transmissao · consumo',
      grid, gridType: grid.type,
      W, H, cells: m.cells, nodes: m.nodes,
      budget: 500, parCost: 220, phases: ['dia'],
      pieces: ['solar', 'hydro', 'wire', 'erase'],
      indicators: ['energia', 'custo', 'sust', 'sat'],
      targets: { sust: 40, sat: 40 },
      objective: 'Abasteca a cidade pequena — 120 MW.',
      time: 120, event: null,
      decor: [
        { type: 'cooling', col: 4.2, row: 1.1 }, { type: 'cooling', col: 5.0, row: 0.8 },
        { type: 'cooling', col: 5.2, row: 1.6 }, { type: 'cooling', col: 6.0, row: 1.2 },
        { type: 'plant', col: 4.2, row: 2.1 },
        { type: 'volcano', col: 8.2, row: 1.4, s: 0.95 },
        { type: 'forest', col: 7.4, row: 3.0, n: 7 }, { type: 'forest', col: 8.3, row: 3.6, n: 6 },
        { type: 'forest', col: 7.0, row: 4.6, n: 6 }, { type: 'tree', col: 6.6, row: 2.4 },
        { type: 'silo', col: 0.6, row: 1.8 }, { type: 'silo', col: 1.1, row: 1.7 },
        { type: 'silo', col: 0.7, row: 2.4 }, { type: 'silo', col: 1.2, row: 2.3 },
        { type: 'barn', col: 1.7, row: 3.1 },
        { type: 'tree', col: 0.4, row: 0.8 }, { type: 'tree', col: 0.5, row: 4.2 }, { type: 'tree', col: 0.9, row: 5.0 },
        { type: 'house', col: 2.0, row: 6.0 },
        { type: 'cow', col: 3.0, row: 6.4 }, { type: 'cow', col: 3.5, row: 6.8 }, { type: 'cow', col: 2.8, row: 7.1 }, { type: 'cow', col: 3.7, row: 6.2 },
        { type: 'hay', col: 2.5, row: 6.6 }, { type: 'hay', col: 2.8, row: 6.6 },
        { type: 'treatment', col: 6.3, row: 6.4 },
        { type: 'rock', col: 5.6, row: 4.6 }, { type: 'rock', col: 6.2, row: 3.4 },
        { type: 'forest', col: 0.8, row: 6.2, n: 6 }, { type: 'forest', col: 1.5, row: 7.3, n: 5 },
        { type: 'forest', col: 8.7, row: 5.4, n: 6 }, { type: 'forest', col: 6.4, row: 8.0, n: 5 },
        { type: 'tree', col: 0.5, row: 3.4 }, { type: 'tree', col: 0.7, row: 5.4 }, { type: 'tree', col: 1.3, row: 4.7 },
        { type: 'tree', col: 4.3, row: 7.7 }, { type: 'tree', col: 5.1, row: 8.0 }, { type: 'tree', col: 3.6, row: 8.1 },
        { type: 'tree', col: 7.8, row: 6.2 }, { type: 'tree', col: 2.6, row: 1.0 }, { type: 'tree', col: 3.3, row: 0.7 },
        { type: 'rock', col: 2.2, row: 8.0 }, { type: 'rock', col: 8.4, row: 4.0 }, { type: 'rock', col: 4.7, row: 5.6 },
        { type: 'road', col: 4.0, row: 2.6, len: 7, rot: 0 },
        { type: 'road', col: 3.0, row: 4.4, len: 5, rot: Math.PI / 2 },
        { type: 'boat', wx: -10, wz: 5.2, y: -0.42, rot: 0.5, s: 1.1 }
      ]
    };
  }

  function level2(gridType) {
    const grid = window.EEP.Grid[gridType] || window.EEP.Grid.hex;
    const W = 11, H = 9;
    const m = buildMap(W, H, {
      water: ['4,3', '4,4', '5,5', '5,6', '6,7'],
      hills: ['0,0', '1,0', '0,1', '1,1', '2,0'],
      nodes: [{ col: 9, row: 6, type: 'cidade', demand: 150 }]
    }, grid);
    return {
      id: 2, name: 'Equilibrio Energetico',
      teaches: 'estabilidade · armazenamento · previsao · dia/noite',
      grid, gridType: grid.type,
      W, H, cells: m.cells, nodes: m.nodes,
      budget: 700, parCost: 320, phases: ['dia', 'noite'],
      pieces: ['solar', 'wind', 'hydro', 'battery', 'ia', 'wire', 'erase'],
      indicators: ['energia', 'custo', 'sust', 'estab', 'inov'],
      targets: { sust: 45, estab: 45 },
      objective: 'Acenda a cidade de dia e de noite — 150 MW.',
      time: 150, event: { at: 60, type: 'drought', label: 'Seca: hidreletricas a -40%' }
    };
  }

  function level3(gridType) {
    const grid = window.EEP.Grid[gridType] || window.EEP.Grid.hex;
    const W = 12, H = 10;
    const m = buildMap(W, H, {
      water: ['4,3', '4,4', '5,5', '5,6', '6,7'],
      hills: ['0,0', '1,0', '0,1', '1,1', '2,1'],
      nodes: [
        { col: 9, row: 3, type: 'cidade', demand: 130 },
        { col: 9, row: 8, type: 'industria', demand: 150 }
      ]
    }, grid);
    return {
      id: 3, name: 'Transicao Energetica',
      teaches: 'lucro · sustentabilidade · estabilidade · inovacao · multiplas demandas',
      grid, gridType: grid.type,
      W, H, cells: m.cells, nodes: m.nodes,
      budget: 1100, parCost: 520, phases: ['dia', 'noite'],
      pieces: ['solar', 'wind', 'hydro', 'biomass', 'battery', 'ia', 'sensor', 'drone', 'pnd', 'wire', 'erase'],
      indicators: ['energia', 'custo', 'sust', 'estab', 'emis', 'lucro', 'inov'],
      targets: { sust: 50, estab: 50, emis: 45, lucro: 45 },
      objective: 'Abasteca cidade e industria — 280 MW.',
      time: 180, event: { at: 80, type: 'spike', label: 'Pico de consumo: demanda +20%' }
    };
  }

  const BUILDERS = [level1, level2, level3];

  window.EEP.PIECES = PIECES;
  window.EEP.CONST = { SOLAR_BASE, WIND_BASE, HYDRO_OUT, BIO_OUT, BATTERY_NIGHT };
  window.EEP.LEVEL_COUNT = BUILDERS.length;
  window.EEP.buildLevel = function (n, gridType) { return BUILDERS[Math.max(0, Math.min(BUILDERS.length - 1, n))](gridType); };
  // back-compat
  window.EEP.buildLevel1 = level1;
})();
