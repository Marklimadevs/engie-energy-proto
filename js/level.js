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

  // Build a map from offset-coord authoring sets.
  function buildMap(W, H, opts) {
    const water = new Set(opts.water || []);
    const hills = new Set(opts.hills || []);
    const nodeByCO = new Map((opts.nodes || []).map(n => [n.col + ',' + n.row, n]));
    const cells = new Map();
    const nodes = [];

    for (let row = 0; row < H; row++) {
      for (let col = 0; col < W; col++) {
        const q = col - Math.floor(row / 2), r = row;
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
  function level1() {
    const W = 10, H = 9;
    const m = buildMap(W, H, {
      water: ['3,2', '4,3', '4,4', '5,5', '5,6', '6,7'],
      nodes: [{ col: 8, row: 6, type: 'cidade', demand: 120 }]
    });
    return {
      id: 1, name: 'Ilumine a Cidade',
      teaches: 'geracao · transmissao · consumo',
      W, H, cells: m.cells, nodes: m.nodes,
      budget: 500, parCost: 220, phases: ['dia'],
      pieces: ['solar', 'hydro', 'wire', 'erase'],
      indicators: ['energia', 'custo', 'sust', 'sat'],
      targets: { sust: 40, sat: 40 },
      objective: 'Abasteca a cidade pequena — 120 MW.',
      time: 120, event: null
    };
  }

  function level2() {
    const W = 11, H = 9;
    const m = buildMap(W, H, {
      water: ['4,3', '4,4', '5,5', '5,6', '6,7'],
      hills: ['0,0', '1,0', '0,1', '1,1', '2,0'],
      nodes: [{ col: 9, row: 6, type: 'cidade', demand: 150 }]
    });
    return {
      id: 2, name: 'Equilibrio Energetico',
      teaches: 'estabilidade · armazenamento · previsao · dia/noite',
      W, H, cells: m.cells, nodes: m.nodes,
      budget: 700, parCost: 320, phases: ['dia', 'noite'],
      pieces: ['solar', 'wind', 'hydro', 'battery', 'ia', 'wire', 'erase'],
      indicators: ['energia', 'custo', 'sust', 'estab', 'inov'],
      targets: { sust: 45, estab: 45 },
      objective: 'Acenda a cidade de dia e de noite — 150 MW.',
      time: 150, event: { at: 60, type: 'drought', label: 'Seca: hidreletricas a -40%' }
    };
  }

  function level3() {
    const W = 12, H = 10;
    const m = buildMap(W, H, {
      water: ['4,3', '4,4', '5,5', '5,6', '6,7'],
      hills: ['0,0', '1,0', '0,1', '1,1', '2,1'],
      nodes: [
        { col: 9, row: 3, type: 'cidade', demand: 130 },
        { col: 9, row: 8, type: 'industria', demand: 150 }
      ]
    });
    return {
      id: 3, name: 'Transicao Energetica',
      teaches: 'lucro · sustentabilidade · estabilidade · inovacao · multiplas demandas',
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
  window.EEP.buildLevel = function (n) { return BUILDERS[Math.max(0, Math.min(BUILDERS.length - 1, n))](); };
  // back-compat
  window.EEP.buildLevel1 = level1;
})();
