/* 3D isometric renderer (Three.js). Keeps interface: Renderer(canvas, game) -> { draw, hitTest }. */
window.EEP = window.EEP || {};
window.EEP.Renderer = function (canvas, game) {
  const THREE = window.THREE;
  const Hex = window.EEP.Hex;
  const level = game.level;
  const grid = level.grid || window.EEP.Grid.hex;
  let waterMat = null, grassU = null, shoreMat = null, lightsOn = false;

  const HS = 1;          // hex size in world units
  const TH = 0.34;       // tile thickness
  const SEA_Y = -1.15;   // nivel do mar (oceano ao redor da ilha flutuante)
  const COL = {
    land: 0xDCE7C8, hill: 0x8FA653, water: 0x4F9BE0, node: 0xF3E2BE,
    piece: { solar: 0x123049, wind: 0xEDEDED, hydro: 0x0F7FD4, biomass: 0x3f9b57, battery: 0x16a98c, ia: 0x0F7FD4, sensor: 0x8b9aa8, drone: 0x5D7185, pnd: 0xF4A81D },
    hover: 0xFFC400, bad: 0xE5533D, wire: 0x2b3a49
  };

  // reuse one WebGL renderer per canvas (avoid context leaks across level reloads)
  let gl = canvas.__gl;
  if (!gl) {
    gl = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    gl.shadowMap.enabled = true; gl.shadowMap.type = THREE.PCFSoftShadowMap;
    canvas.__gl = gl;
  }

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 2000);
  const EL = Math.atan(1 / Math.SQRT2); // ~35.26deg -> isometrico verdadeiro
  let az = Math.PI / 4, camR = 60;
  function applyCamera() {
    const ce = Math.cos(EL), se = Math.sin(EL);
    camera.position.set(Math.cos(az) * ce * camR, se * camR, Math.sin(az) * ce * camR);
    camera.lookAt(0, 0, 0);
  }

  const hemi = new THREE.HemisphereLight(0xffffff, 0x93b0c4, 0.62); scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff, 0.82);
  dir.castShadow = true; dir.shadow.mapSize.set(2048, 2048); dir.shadow.bias = -0.0006; dir.shadow.normalBias = 0.02;
  scene.add(dir); scene.add(dir.target);
  const ambient = new THREE.AmbientLight(0xffffff, 0.34); scene.add(ambient);

  // ---- hex tile geometry (shared) ----
  const shape = new THREE.Shape();
  const cs = grid.tile(HS);
  shape.moveTo(cs[0][0], cs[0][1]);
  for (let i = 1; i < cs.length; i++) shape.lineTo(cs[i][0], cs[i][1]);
  shape.closePath();
  const tileGeo = new THREE.ExtrudeGeometry(shape, { depth: TH, bevelEnabled: false });
  tileGeo.rotateX(-Math.PI / 2);
  tileGeo.translate(0, -TH, 0); // top face at y = 0

  // hex outline for hover
  const ringPts = [];
  for (let i = 0; i <= cs.length; i++) { const c = cs[i % cs.length]; ringPts.push(new THREE.Vector3(c[0], 0, c[1])); }
  const ringGeo = new THREE.BufferGeometry().setFromPoints(ringPts);

  function terrainColor(cell) {
    if (cell.terrain === 'water') return COL.water;
    if (cell.terrain === 'hill') return 0x6f9a3f;
    if (cell.terrain === 'dirt') return 0xBE9060;
    if (cell.terrain === 'field') return 0xCBC172;
    if (cell.terrain === 'sand') return 0xE6D291;
    if (cell.terrain === 'node') return COL.node;
    const a = new THREE.Color(0x74AC48), b = new THREE.Color(0xA6C766);
    return a.lerp(b, cell.irr * 0.5).getHex();
  }
  function topY(cell) {
    if (cell.terrain === 'hill') return 0.32;
    if (cell.terrain === 'water') return -0.05; // poca rasa, acima da tampa da ilha
    return 0;
  }

  // ---- animated grass + water-tile materials (patch built-in Lambert to keep shadows) ----
  grassU = { value: 0 };
  // grama animada (vento) — patched Lambert p/ manter sombras; paleta de varios verdes ("pintada a mao")
  function makeGrass(color) {
    const m = new THREE.MeshLambertMaterial({ color: color });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = grassU;
      sh.vertexShader = 'varying vec2 vGXZ;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vGXZ = (modelMatrix * vec4(position,1.0)).xz;');
      sh.fragmentShader = 'varying vec2 vGXZ;\nuniform float uTime;\n' + sh.fragmentShader.replace('#include <color_fragment>',
        '#include <color_fragment>\n { float n = sin(vGXZ.x*2.3)*sin(vGXZ.y*2.1); float wind = sin((vGXZ.x+vGXZ.y)*1.1 + uTime*1.6);' +
        ' diffuseColor.rgb *= (1.0 + n*0.06 + wind*0.05); diffuseColor.g *= (1.0 + max(0.0,n)*0.05); }');
    };
    return m;
  }
  const grassMats = [makeGrass(0x86B854), makeGrass(0x77AE49), makeGrass(0x69A340), makeGrass(0x8FBC5A), makeGrass(0x7BB04C)];
  function grassFor(c) { const h = Math.sin(c.q * 127.1 + c.r * 311.7) * 43758.5453, f = h - Math.floor(h); return grassMats[Math.floor(f * grassMats.length) % grassMats.length]; }
  const waterTileMat = new THREE.MeshLambertMaterial({ color: 0x4f9be0, transparent: true, opacity: 0.96 });
  waterTileMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = grassU;
    sh.vertexShader = 'varying vec2 vWXZ;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vWXZ = (modelMatrix * vec4(position,1.0)).xz;');
    sh.fragmentShader = 'varying vec2 vWXZ;\nuniform float uTime;\n' + sh.fragmentShader.replace('#include <color_fragment>',
      '#include <color_fragment>\n { float s = sin(vWXZ.x*3.0 + uTime*2.0)*sin(vWXZ.y*2.6 - uTime*1.6); diffuseColor.rgb *= (1.0 + s*0.10); }');
  };

  // ---- board ----
  const boardGroup = new THREE.Group(); scene.add(boardGroup);
  const tileMeshes = [];
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const c of level.cells.values()) {
    const p = grid.toPixel(c.q, c.r, HS);
    c._wx = p.x; c._wz = p.y;
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.y); maxZ = Math.max(maxZ, p.y);
  }
  const ccx = (minX + maxX) / 2, ccz = (minZ + maxZ) / 2;
  const bw = maxX - minX, bd = maxZ - minZ;
  camR = Math.max(bw, bd) * 1.8 + 8;
  (function () {
    const S = Math.max(bw, bd) * 0.72 + 5;
    dir.position.set(S * 0.7, S * 1.7, S * 0.5); dir.target.position.set(0, 0, 0);
    const sc = dir.shadow.camera; sc.left = -S; sc.right = S; sc.top = S; sc.bottom = -S; sc.near = 1; sc.far = S * 5.5; sc.updateProjectionMatrix();
  })();
  for (const [k, c] of level.cells) {
    c._x = c._wx - ccx; c._z = c._wz - ccz; c._y = topY(c);
    let tm;
    if (c.terrain === 'land') tm = grassFor(c);
    else if (c.terrain === 'water') tm = waterTileMat;
    else tm = new THREE.MeshLambertMaterial({ color: terrainColor(c) });
    const m = new THREE.Mesh(tileGeo, tm);
    m.position.set(c._x, c._y, c._z);
    m.userData.key = k; m.receiveShadow = true; m.castShadow = false;
    boardGroup.add(m); tileMeshes.push(m);
  }

  // demand nodes (buildings) on top of node tiles
  for (const nd of level.nodes) {
    const c = level.cells.get(nd.key);
    const g = nd.type === 'industria' ? buildIndustry() : buildCity();
    g.position.set(c._x, c._y, c._z);
    boardGroup.add(g);
    // colored ring around node
    const ring = new THREE.LineLoop(ringGeo, new THREE.LineBasicMaterial({ color: nd.type === 'industria' ? 0x0F7FD4 : 0xF4A81D }));
    ring.position.set(c._x, c._y + 0.02, c._z); ring.scale.set(1.0, 1, 1.0);
    boardGroup.add(ring);
  }

  // ---- surrounding water + floating island base ----
  (function () {
    const W2 = bw + 4, D2 = bd + 4;
    waterMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uNight: { value: 0 }, uA: { value: new THREE.Color(0x6fc0ea) }, uB: { value: new THREE.Color(0xa9e2f6) } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader:
        'precision mediump float; varying vec2 vUv; uniform float uTime; uniform float uNight; uniform vec3 uA; uniform vec3 uB;' +
        'void main(){ vec2 p = vUv * 48.0;' +
        'float w1 = sin(p.x*0.5 + uTime*0.7);' +
        'float w2 = sin(p.y*0.42 - uTime*0.55);' +
        'float w3 = sin((p.x*0.7 + p.y*0.6) + uTime*0.4);' +
        'float m = (w1*w2 + w3) * 0.25 + 0.5;' +
        'vec3 col = mix(uA, uB, smoothstep(0.32, 0.78, m));' +
        'col = mix(col, col*vec3(0.26,0.38,0.62), uNight);' +
        'gl_FragColor = vec4(col,1.0); }'
    });
    const water = new THREE.Mesh(new THREE.PlaneGeometry(W2 + 60, D2 + 60), waterMat);
    water.rotation.x = -Math.PI / 2; water.position.y = SEA_Y - 0.05; scene.add(water);
    shoreMat = new THREE.MeshBasicMaterial({ color: 0xc4ecf8, transparent: true, opacity: 0.9 });
    const shore = new THREE.Mesh(new THREE.PlaneGeometry(W2 + 2.4, D2 + 2.4), shoreMat);
    shore.rotation.x = -Math.PI / 2; shore.position.y = SEA_Y + 0.02; scene.add(shore);

    // ---- ilha flutuante: bloco de solo em camadas (corte de terreno, cantos levemente chanfrados) ----
    const island = new THREE.Group(); scene.add(island);
    const soil = [
      { c: 0x84B24A, h: 0.34, k: 0.00 },  // grama (topo)
      { c: 0xCEA36C, h: 0.30, k: 0.10 },  // terra clara
      { c: 0xB9884F, h: 0.30, k: 0.22 },  // terra media
      { c: 0x96683D, h: 0.34, k: 0.36 },  // terra escura
      { c: 0x6F4A2B, h: 0.70, k: 0.54 }   // terra profunda (base)
    ];
    let ty = -0.10;
    for (const L of soil) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(W2 - L.k * 2, L.h, D2 - L.k * 2), new THREE.MeshLambertMaterial({ color: L.c }));
      m.position.y = ty - L.h / 2; m.receiveShadow = true; island.add(m); ty -= L.h;
    }
    // pedras low-poly encravadas nas laterais do solo
    const rockMat = new THREE.MeshLambertMaterial({ color: 0x9a938a });
    const hW = W2 / 2, hD = D2 / 2, depths = [-0.5, -0.72, -0.96];
    let rk = 0;
    function embed(x, z, y, s) { const r = new THREE.Mesh(new THREE.DodecahedronGeometry(s), rockMat); r.position.set(x, y, z); r.rotation.set(rk * 1.1, rk * 0.7, rk * 0.5); rk++; island.add(r); }
    for (let i = 1; i <= 4; i++) {
      const t = i / 5;
      embed(-hW + t * W2, -hD + 0.04, depths[i % 3], 0.15 + (i % 2) * 0.05);
      embed(-hW + t * W2, hD - 0.04, depths[(i + 1) % 3], 0.14 + (i % 2) * 0.06);
      embed(-hW + 0.04, -hD + t * D2, depths[(i + 2) % 3], 0.16);
      embed(hW - 0.04, -hD + t * D2, depths[i % 3], 0.13 + (i % 2) * 0.05);
    }
  })();
  buildDecor();

  // ---- dynamic group (pieces + wires), rebuilt when state changes ----
  const dynGroup = new THREE.Group(); scene.add(dynGroup);
  let lastSig = null;

  function clearGroup(gp) { for (let i = gp.children.length - 1; i >= 0; i--) { const o = gp.children[i]; gp.remove(o); if (o.geometry && o.geometry !== tileGeo && o.geometry !== ringGeo) o.geometry.dispose && o.geometry.dispose(); } }

  function stateSig() {
    let s = '';
    for (const [k, p] of game.state.pieces) s += k + p.type + ';';
    s += '|'; for (const k of game.state.wires) s += k + ';';
    return s;
  }

  function syncDynamic() {
    const sig = stateSig();
    if (sig === lastSig) return; lastSig = sig;
    clearGroup(dynGroup);

    // wires: links between adjacent connectable cells
    const drawn = new Set();
    const wireMat = new THREE.LineBasicMaterial({ color: COL.wire });
    for (const [k, c] of level.cells) {
      if (!game.connectable(k)) continue;
      for (const n of grid.neighbors(c.q, c.r)) {
        const nk = Hex.key(n.q, n.r);
        if (!game.connectable(nk)) continue;
        const pair = k < nk ? k + '|' + nk : nk + '|' + k;
        if (drawn.has(pair)) continue; drawn.add(pair);
        const nc = level.cells.get(nk);
        const geo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(c._x, c._y + 0.06, c._z), new THREE.Vector3(nc._x, nc._y + 0.06, nc._z)
        ]);
        dynGroup.add(new THREE.Line(geo, wireMat));
      }
    }
    for (const k of game.state.wires) {
      const c = level.cells.get(k);
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshLambertMaterial({ color: COL.wire }));
      dot.position.set(c._x, c._y + 0.08, c._z); dynGroup.add(dot);
    }
    // pieces
    for (const [k, p] of game.state.pieces) {
      const c = level.cells.get(k);
      const g = buildPiece(p.type, false);
      g.position.set(c._x, c._y, c._z);
      dynGroup.add(g);
    }
  }

  // ---- hover highlight + ghost ----
  const hover = new THREE.LineLoop(ringGeo, new THREE.LineBasicMaterial({ color: COL.hover }));
  hover.scale.set(1.06, 1, 1.06); hover.visible = false; scene.add(hover);
  let ghost = null, ghostSig = '';

  function updateHover(hoverKey) {
    if (!hoverKey || !level.cells.has(hoverKey)) { hover.visible = false; if (ghost) ghost.visible = false; return; }
    const c = level.cells.get(hoverKey);
    const tool = game.state.tool;
    const ok = game.canPlace ? game.canPlace(hoverKey) : true;
    hover.visible = true;
    hover.position.set(c._x, c._y + 0.03, c._z);
    hover.material.color.setHex((tool && !ok) ? COL.bad : COL.hover);

    const sig = (tool || '') + '|' + (ok ? '1' : '0');
    if (sig !== ghostSig) {
      ghostSig = sig;
      if (ghost) { scene.remove(ghost); ghost = null; }
      if (tool && tool !== 'erase' && ok) { ghost = buildPiece(tool, true); scene.add(ghost); }
    }
    if (ghost) { ghost.visible = true; ghost.position.set(c._x, c._y, c._z); }
  }

  // ---- low-poly piece builders ----
  function mat(color, ghostly) { const m = new THREE.MeshLambertMaterial({ color: color }); if (ghostly) { m.transparent = true; m.opacity = 0.5; } return m; }
  function M(geo, color, gh) { const m = new THREE.Mesh(geo, mat(color, gh)); if (!gh) { m.castShadow = true; m.receiveShadow = true; } return m; }
  function box(w, h, d, color, gh) { return M(new THREE.BoxGeometry(w, h, d), color, gh); }
  function cyl(rt, rb, h, color, gh, seg) { return M(new THREE.CylinderGeometry(rt, rb, h, seg || 12), color, gh); }
  function cone(r, h, color, gh, seg) { return M(new THREE.ConeGeometry(r, h, seg || 8), color, gh); }
  function sph(r, color, gh) { return M(new THREE.SphereGeometry(r, 10, 8), color, gh); }
  function makeSmoke(n, spread, size, color) {
    const s = new THREE.Group(); s.userData.smoke = { range: 1.7, spread: spread };
    for (let i = 0; i < n; i++) {
      const p = new THREE.Mesh(new THREE.SphereGeometry(size, 7, 6), new THREE.MeshLambertMaterial({ color: color, transparent: true, opacity: 0.85 }));
      p.userData = { speed: 0.3 + i * 0.04, phase: i * (1.7 / n) };
      s.add(p);
    }
    return s;
  }

  function buildPiece(type, gh) {
    const g = new THREE.Group();
    const C = COL.piece;
    if (type === 'solar') {
      const post = box(0.06, 0.28, 0.06, 0x555555, gh); post.position.y = 0.14; g.add(post);
      const panel = box(0.75, 0.05, 0.5, C.solar, gh); panel.position.y = 0.32; panel.rotation.x = -0.5; g.add(panel);
    } else if (type === 'wind') {
      const pole = cyl(0.04, 0.05, 0.85, C.wind, gh); pole.position.y = 0.42; g.add(pole);
      const rotor = new THREE.Group(); rotor.position.set(0, 0.85, 0.08);
      const hub = sph(0.07, 0x333333, gh); rotor.add(hub);
      for (let i = 0; i < 3; i++) { const bl = box(0.055, 0.5, 0.02, C.wind, gh); bl.geometry.translate(0, 0.25, 0); bl.rotation.z = i * 2 * Math.PI / 3; rotor.add(bl); }
      if (!gh) rotor.userData.spin = 2.4;
      g.add(rotor);
    } else if (type === 'hydro') {
      const dam = box(0.85, 0.4, 0.32, C.hydro, gh); dam.position.y = 0.2; g.add(dam);
      const water = box(0.85, 0.04, 0.3, 0x7fc0ee, gh); water.position.set(0, 0.06, 0.28); g.add(water);
    } else if (type === 'biomass') {
      const trunk = cyl(0.09, 0.11, 0.3, 0x7a5230, gh); trunk.position.y = 0.15; g.add(trunk);
      const leaf = cone(0.34, 0.55, C.biomass, gh); leaf.position.y = 0.55; g.add(leaf);
    } else if (type === 'battery') {
      const b = box(0.5, 0.42, 0.36, C.battery, gh); b.position.y = 0.24; g.add(b);
      const t = box(0.12, 0.08, 0.12, 0x0e6f5c, gh); t.position.set(0, 0.49, 0); g.add(t);
    } else if (type === 'ia') {
      const b = box(0.42, 0.42, 0.42, C.ia, gh); b.position.y = 0.36; b.rotation.y = Math.PI / 4; g.add(b);
    } else if (type === 'sensor') {
      const p = cyl(0.03, 0.03, 0.5, C.sensor, gh); p.position.y = 0.25; g.add(p);
      const s = sph(0.1, 0x0f7fd4, gh); s.position.y = 0.55; g.add(s);
    } else if (type === 'drone') {
      const b = box(0.28, 0.08, 0.28, C.drone, gh); b.position.y = 0.6; g.add(b);
      for (let i = 0; i < 4; i++) { const r = sph(0.07, 0x333333, gh); const a = i * Math.PI / 2 + Math.PI / 4; r.position.set(Math.cos(a) * 0.22, 0.6, Math.sin(a) * 0.22); g.add(r); }
    } else if (type === 'pnd') {
      const d = new THREE.Mesh(new THREE.OctahedronGeometry(0.26), mat(C.pnd, gh)); d.position.y = 0.55; g.add(d);
    }
    g.scale.setScalar(1.2);
    return g;
  }
  function buildCity() {
    const g = new THREE.Group();
    const a = box(0.28, 0.5, 0.28, 0x24425c); a.position.set(-0.22, 0.25, 0); g.add(a);
    const b = box(0.3, 0.78, 0.3, 0x2c516f); b.position.set(0.04, 0.39, 0.02); g.add(b);
    const c = box(0.26, 0.4, 0.26, 0x24425c); c.position.set(0.28, 0.2, -0.12); g.add(c);
    return g;
  }
  function buildIndustry() {
    const g = new THREE.Group();
    const base = box(0.7, 0.34, 0.44, 0x223141); base.position.y = 0.17; g.add(base);
    const ch1 = cyl(0.08, 0.09, 0.5, 0x33475b); ch1.position.set(0.16, 0.45, 0); g.add(ch1);
    const ch2 = cyl(0.07, 0.08, 0.38, 0x33475b); ch2.position.set(-0.05, 0.39, 0.06); g.add(ch2);
    return g;
  }

  // ---- decorative low-poly props (scenery) ----
  function pyramid(r, h, color, seg) { const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg || 4), mat(color)); m.rotation.y = Math.PI / 4; return m; }
  function buildProp(type, it) {
    const g = new THREE.Group();
    if (type === 'tree' || type === 'pine') {
      const hgt = 0.5 + (it.v || 0) * 0.2;
      const tr = cyl(0.05, 0.07, 0.2, 0x6b4a2f); tr.position.y = 0.1; g.add(tr);
      const c1 = cone(0.26, 0.55 + hgt, 0x2f7d3f); c1.position.y = 0.42 + hgt * 0.5; g.add(c1);
      const c2 = cone(0.2, 0.4, 0x256b34); c2.position.y = 0.72 + hgt; g.add(c2);
    } else if (type === 'forest') {
      const n = it.n || 6;
      for (let i = 0; i < n; i++) {
        const a = i * 2.399, rr = 0.32 + (i % 3) * 0.26;
        const t = (i % 5 === 4) ? buildProp('bush', {}) : buildProp('tree', { v: i % 3 });
        t.position.set(Math.cos(a) * rr, 0, Math.sin(a) * rr); t.scale.setScalar(0.78 + (i % 3) * 0.18); g.add(t);
      }
      const lg = buildProp('log', {}); lg.position.set(0.3, 0, -0.42); lg.rotation.y = 0.6; g.add(lg);
    } else if (type === 'volcano') {
      const mt = new THREE.Mesh(new THREE.ConeGeometry(1.7, 2.3, 7), mat(0x7a5a3c)); mt.position.y = 1.15; g.add(mt);
      const crater = cyl(0.5, 0.7, 0.25, 0x3a2a20); crater.position.y = 2.25; g.add(crater);
      const lava = cyl(0.42, 0.5, 0.2, 0xff7a1a); lava.position.y = 2.32; g.add(lava);
      const sm = makeSmoke(5, 0.28, 0.3, 0xe6e9ec); sm.position.y = 2.45; g.add(sm);
      // lava streak
      const st = box(0.16, 0.05, 1.1, 0xff8a2a); st.position.set(0.2, 1.2, 0.55); st.rotation.x = 0.7; g.add(st);
    } else if (type === 'cooling') {
      const lower = cyl(0.34, 0.5, 0.7, 0xcfd3d6); lower.position.y = 0.35; g.add(lower);
      const upper = cyl(0.44, 0.34, 0.35, 0xcfd3d6); upper.position.y = 0.87; g.add(upper);
      const sm = makeSmoke(4, 0.14, 0.17, 0xeef2f4); sm.position.y = 1.0; g.add(sm);
    } else if (type === 'silo') {
      const body = cyl(0.22, 0.22, 0.9, 0xd7dbdf); body.position.y = 0.45; g.add(body);
      const dome = sph(0.22, 0xc2c7cc); dome.scale.y = 0.5; dome.position.y = 0.9; g.add(dome);
    } else if (type === 'plant') {
      const b = box(1.1, 0.4, 0.6, 0xeaf1f6); b.position.y = 0.2; g.add(b);
      const s = box(1.1, 0.12, 0.6, 0x2f7bbf); s.position.y = 0.42; g.add(s);
    } else if (type === 'barn') {
      const b = box(0.85, 0.5, 0.6, 0x8a5a3c); b.position.y = 0.25; g.add(b);
      const roof = pyramid(0.72, 0.4, 0x5a3a2a); roof.position.y = 0.68; g.add(roof);
    } else if (type === 'house') {
      const b = box(0.55, 0.4, 0.55, 0xf2efe6); b.position.y = 0.2; g.add(b);
      const roof = pyramid(0.5, 0.35, 0xc0472f); roof.position.y = 0.56; g.add(roof);
    } else if (type === 'cow') {
      const body = box(0.28, 0.16, 0.16, 0xf3f3f0); body.position.y = 0.16; g.add(body);
      const patch = box(0.12, 0.14, 0.14, 0x2b2b2b); patch.position.set(0.05, 0.17, 0); g.add(patch);
      const head = box(0.1, 0.1, 0.1, 0xf3f3f0); head.position.set(-0.18, 0.18, 0); g.add(head);
      for (let i = 0; i < 4; i++) { const l = box(0.04, 0.1, 0.04, 0x33302c); l.position.set((i < 2 ? 0.1 : -0.1), 0.05, (i % 2 ? 0.05 : -0.05)); g.add(l); }
    } else if (type === 'hay') {
      const h = cyl(0.12, 0.12, 0.22, 0xdcc060); h.rotation.z = Math.PI / 2; h.position.y = 0.12; g.add(h);
    } else if (type === 'treatment') {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.06, 8, 20), mat(0xd8dde1)); ring.rotation.x = Math.PI / 2; ring.position.y = 0.12; g.add(ring);
      const wtr = cyl(0.4, 0.4, 0.1, 0x5fb0e0); wtr.position.y = 0.1; g.add(wtr);
      const arm = box(0.8, 0.04, 0.05, 0xbfc6cc); arm.position.y = 0.2; g.add(arm);
      const basin = box(0.9, 0.14, 0.5, 0xd8dde1); basin.position.set(0.95, 0.09, 0); g.add(basin);
      const bw2 = box(0.78, 0.08, 0.4, 0x5fb0e0); bw2.position.set(0.95, 0.13, 0); g.add(bw2);
    } else if (type === 'boat') {
      const hull = box(0.96, 0.24, 0.42, 0xf2f2ef); hull.position.y = 0.15; g.add(hull);
      const stripe = box(0.96, 0.08, 0.42, 0x2a6fb0); stripe.position.y = 0.06; g.add(stripe);
      const deck = box(0.8, 0.05, 0.34, 0xdfe3e6); deck.position.y = 0.29; g.add(deck);
      const cabin = box(0.24, 0.22, 0.32, 0xf6f6f4); cabin.position.set(-0.3, 0.41, 0); g.add(cabin);
      const c1 = box(0.34, 0.16, 0.14, 0x2a7bbf); c1.position.set(0.14, 0.41, 0.11); g.add(c1);
      const c2 = box(0.34, 0.16, 0.14, 0xd9a233); c2.position.set(0.14, 0.41, -0.11); g.add(c2);
      const c3 = box(0.3, 0.15, 0.24, 0x3f9b57); c3.position.set(0.22, 0.57, 0); g.add(c3);
      const wake = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.5), new THREE.MeshBasicMaterial({ color: 0xdff2fb, transparent: true, opacity: 0.5 }));
      wake.rotation.x = -Math.PI / 2; wake.position.set(-0.95, 0.006, 0); g.add(wake);
    } else if (type === 'road') {
      const len = it.len || 1;
      const r = box(len, 0.06, 0.36, 0x41464c); r.position.y = 0.03; g.add(r);
      const nd = Math.max(1, Math.round(len / 0.55));
      for (let i = 0; i < nd; i++) { const d = box(0.2, 0.015, 0.05, 0xeae7d8); d.position.set(-len / 2 + (i + 0.5) * (len / nd), 0.066, 0); g.add(d); }
    } else if (type === 'windturbine') {
      const pole = cyl(0.05, 0.07, 1.3, 0xededed); pole.position.y = 0.65; g.add(pole);
      const rotor = new THREE.Group(); rotor.position.set(0, 1.3, 0.1);
      const hub = sph(0.09, 0x333333); rotor.add(hub);
      for (let i = 0; i < 3; i++) { const bl = box(0.07, 0.7, 0.025, 0xf4f4f4); bl.geometry.translate(0, 0.35, 0); bl.rotation.z = i * 2 * Math.PI / 3; rotor.add(bl); }
      rotor.userData.spin = 1.8; g.add(rotor);
    } else if (type === 'rock') {
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.18), mat(0x9aa0a6)); r.position.y = 0.12; g.add(r);
    } else if (type === 'pier') {
      const planks = box(1.3, 0.06, 0.42, 0x9a6b3f); planks.position.set(0.55, 0.12, 0); g.add(planks);
      for (let i = 0; i < 4; i++) { const p = cyl(0.03, 0.03, 0.34, 0x7a5230); p.position.set(0.12 + i * 0.34, -0.02, i % 2 ? 0.15 : -0.15); g.add(p); }
    } else if (type === 'rowboat') {
      const hull = box(0.52, 0.14, 0.22, 0x8a5a34); hull.position.y = 0.07; g.add(hull);
      const inner = box(0.4, 0.06, 0.13, 0x6b4527); inner.position.y = 0.12; g.add(inner);
    } else if (type === 'fence') {
      const n = it.n || 4, len = it.len || 1.4, seg = len / n;
      const rail = box(len, 0.03, 0.03, 0x8a6b45); rail.position.set(len / 2 - seg / 2, 0.17, 0); g.add(rail);
      for (let i = 0; i < n; i++) { const p = box(0.04, 0.24, 0.04, 0x7a5230); p.position.set(i * seg, 0.12, 0); g.add(p); }
    } else if (type === 'crate') {
      const b = box(0.22, 0.22, 0.22, 0xb98a4e); b.position.y = 0.11; g.add(b);
      const b2 = box(0.2, 0.2, 0.2, 0xa87a42); b2.position.set(0.17, 0.1, 0.06); g.add(b2);
    } else if (type === 'tractor') {
      const body = box(0.34, 0.18, 0.2, 0xd84f3a); body.position.y = 0.19; g.add(body);
      const cab = box(0.16, 0.16, 0.18, 0xf0c04a); cab.position.set(-0.08, 0.35, 0); g.add(cab);
      const wf1 = cyl(0.08, 0.08, 0.08, 0x2b2b2b); wf1.rotation.x = Math.PI / 2; wf1.position.set(0.14, 0.09, 0.11); g.add(wf1);
      const wf2 = cyl(0.08, 0.08, 0.08, 0x2b2b2b); wf2.rotation.x = Math.PI / 2; wf2.position.set(0.14, 0.09, -0.11); g.add(wf2);
      const wb1 = cyl(0.13, 0.13, 0.09, 0x2b2b2b); wb1.rotation.x = Math.PI / 2; wb1.position.set(-0.12, 0.13, 0.12); g.add(wb1);
      const wb2 = cyl(0.13, 0.13, 0.09, 0x2b2b2b); wb2.rotation.x = Math.PI / 2; wb2.position.set(-0.12, 0.13, -0.12); g.add(wb2);
    } else if (type === 'tank') {
      const body = cyl(0.3, 0.3, 0.5, 0xc7ccd0); body.position.y = 0.25; g.add(body);
      const cap = sph(0.3, 0xd6dadd); cap.scale.y = 0.4; cap.position.y = 0.5; g.add(cap);
      const band = cyl(0.31, 0.31, 0.06, 0x9aa2a8); band.position.y = 0.3; g.add(band);
    } else if (type === 'pipe') {
      const len = it.len || 1.0;
      const p = cyl(0.06, 0.06, len, 0xb6bcc2); p.rotation.z = Math.PI / 2; p.position.y = 0.22; g.add(p);
      const s1 = box(0.06, 0.22, 0.06, 0x9aa2a8); s1.position.set(-len / 2 + 0.1, 0.11, 0); g.add(s1);
      const s2 = box(0.06, 0.22, 0.06, 0x9aa2a8); s2.position.set(len / 2 - 0.1, 0.11, 0); g.add(s2);
    } else if (type === 'transformer') {
      const b = box(0.3, 0.3, 0.24, 0x6f7a86); b.position.y = 0.15; g.add(b);
      const f1 = cyl(0.03, 0.03, 0.3, 0xced3d7); f1.position.set(-0.08, 0.42, 0); g.add(f1);
      const f2 = cyl(0.03, 0.03, 0.3, 0xced3d7); f2.position.set(0.08, 0.42, 0); g.add(f2);
    } else if (type === 'bush') {
      const b1 = sph(0.2, 0x3f8a45); b1.scale.y = 0.7; b1.position.y = 0.12; g.add(b1);
      const b2 = sph(0.15, 0x4f9a52); b2.scale.y = 0.7; b2.position.set(0.16, 0.1, 0.06); g.add(b2);
    } else if (type === 'log') {
      const l = cyl(0.08, 0.08, 0.5, 0x7a5230); l.rotation.z = Math.PI / 2; l.position.y = 0.08; g.add(l);
    } else if (type === 'deadtree') {
      const tr = cyl(0.05, 0.07, 0.6, 0x4a3a2c); tr.position.y = 0.3; g.add(tr);
      const b1 = box(0.24, 0.04, 0.04, 0x4a3a2c); b1.position.set(0.08, 0.5, 0); b1.rotation.z = 0.5; g.add(b1);
      const b2 = box(0.2, 0.04, 0.04, 0x4a3a2c); b2.position.set(-0.06, 0.42, 0); b2.rotation.z = -0.6; g.add(b2);
    } else if (type === 'volrock') {
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(it.s2 || 0.2), mat(0x3a3330)); r.position.y = 0.1; r.rotation.set(0.5, 0.7, 0.2); g.add(r);
    } else if (type === 'lamp') {
      const pole = cyl(0.035, 0.05, 0.72, 0x39414a); pole.position.y = 0.36; g.add(pole);
      const arm = box(0.22, 0.04, 0.05, 0x39414a); arm.position.set(0.09, 0.7, 0); g.add(arm);
      const head = box(0.17, 0.08, 0.12, 0x2b3138); head.position.set(0.19, 0.66, 0); g.add(head);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshLambertMaterial({ color: 0xfff1c2, emissive: 0x000000 }));
      bulb.position.set(0.19, 0.6, 0); bulb.userData.bulb = 0xffd27a; g.add(bulb);
      const halo = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffdd99, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      halo.position.set(0.19, 0.58, 0); halo.userData.halo = 0.5; g.add(halo);
      const pool = new THREE.Mesh(new THREE.CircleGeometry(0.34, 18), new THREE.MeshBasicMaterial({ color: 0xffdd99, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      pool.rotation.x = -Math.PI / 2; pool.position.set(0.19, 0.02, 0); pool.userData.halo = 0.3; g.add(pool);
    } else if (type === 'trafficlight') {
      const pole = cyl(0.035, 0.05, 0.6, 0x33393f); pole.position.y = 0.3; g.add(pole);
      const casing = box(0.12, 0.34, 0.1, 0x23282d); casing.position.set(0, 0.64, 0); g.add(casing);
      const mk = (y, col) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.037, 8, 6), new THREE.MeshLambertMaterial({ color: col, emissive: 0x000000 })); m.position.set(0, y, 0.056); g.add(m); return m; };
      const rL = mk(0.74, 0xe5533d), yL = mk(0.64, 0xf4c020), gL = mk(0.54, 0x33cc55);
      g.userData.traffic = [rL, yL, gL];
    }
    return g;
  }

  function decorPos(it) {
    if (it.wx != null) return { x: it.wx, z: it.wz };
    const pc = grid.place(it.col, it.row), p = grid.toPixel(pc.q, pc.r, HS);
    return { x: p.x - ccx, z: p.y - ccz };
  }
  function buildDecor() {
    const list = level.decor || [];
    const dg = new THREE.Group(); scene.add(dg);
    for (const it of list) {
      const pos = decorPos(it), m = buildProp(it.type, it);
      m.position.set(pos.x, it.y != null ? it.y : 0, pos.z);
      if (it.rot) m.rotation.y = it.rot;
      if (it.s) m.scale.multiplyScalar(it.s);
      if (it.type === 'boat') m.userData.boat = { speed: it.speed || 1.6, phase: it.phase || 0 };
      dg.add(m);
    }
  }

  // ---- camera / sizing ----
  let fitH = Math.max(bw, bd) * 0.5 + 0.7;
  function updateCamera(w, h) {
    const showcase = document.body.classList.contains('showcase');
    const f = fitH * (showcase ? 1.12 : 1);
    const aspect = w / h;
    const halfH = f, halfW = f * aspect;
    camera.left = -halfW; camera.right = halfW; camera.top = halfH; camera.bottom = -halfH;
    camera.updateProjectionMatrix();
  }
  function resize() {
    const showcase = document.body.classList.contains('showcase');
    const w = canvas.clientWidth || (canvas.parentElement && canvas.parentElement.clientWidth) || 820;
    let h;
    if (showcase) h = window.innerHeight;
    else {
      const top = canvas.getBoundingClientRect().top; // preenche da posicao do canvas ate o fim da tela
      h = Math.max(380, Math.round(window.innerHeight - top - 24));
    }
    gl.setSize(w, h, false);
    canvas.style.height = h + 'px';
    updateCamera(w, h);
    applyCamera();
    render();
  }
  function render() { syncDynamic(); gl.render(scene, camera); }
  function rotate(dAz) { az += dAz; applyCamera(); render(); }
  function snap() { const s = Math.PI / 2, off = Math.PI / 4; az = Math.round((az - off) / s) * s + off; applyCamera(); render(); }
  function zoomBy(f) { camera.zoom = Math.min(3.2, Math.max(0.55, camera.zoom * f)); camera.updateProjectionMatrix(); render(); }
  function setNight(on) {
    if (on) {
      hemi.color.setHex(0x5b6c8f); hemi.groundColor.setHex(0x0a1530); hemi.intensity = 0.45;
      dir.color.setHex(0x9fb0dd); dir.intensity = 0.30;
      ambient.color.setHex(0x2b3c62); ambient.intensity = 0.55;
      scene.background = new THREE.Color(0x0c1c36);
      if (shoreMat) shoreMat.color.setHex(0x2a4a78);
    } else {
      hemi.color.setHex(0xffffff); hemi.groundColor.setHex(0x93b0c4); hemi.intensity = 0.62;
      dir.color.setHex(0xffffff); dir.intensity = 0.82;
      ambient.color.setHex(0xffffff); ambient.intensity = 0.34;
      scene.background = null;
      if (shoreMat) shoreMat.color.setHex(0xc4ecf8);
    }
    if (waterMat) waterMat.uniforms.uNight.value = on ? 1 : 0;
    render();
  }
  function setLightsOn(on) {
    lightsOn = on;
    scene.traverse(o => {
      if (o.userData.bulb !== undefined) o.material.emissive.setHex(on ? o.userData.bulb : 0x000000);
      if (o.userData.halo !== undefined) o.material.opacity = on ? o.userData.halo : 0;
    });
    render();
  }

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  function hitTest(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(tileMeshes, false);
    return hits.length ? hits[0].object.userData.key : null;
  }

  function draw(hoverKey) { updateHover(hoverKey); render(); }

  // single resize/zoom binding shared across level reloads
  canvas.__eep = { onResize: resize, onZoom: zoomBy };
  if (!canvas.__resizeBound) { window.addEventListener('resize', () => { if (canvas.__eep) canvas.__eep.onResize(); }); canvas.__resizeBound = true; }
  if (!canvas.__wheelBound) { canvas.addEventListener('wheel', (e) => { if (!canvas.__eep) return; e.preventDefault(); canvas.__eep.onZoom(e.deltaY < 0 ? 1.12 : 1 / 1.12); }, { passive: false }); canvas.__wheelBound = true; }

  function updateAnimations(t) {
    if (waterMat) waterMat.uniforms.uTime.value = t;
    if (grassU) grassU.value = t;
    scene.traverse(o => {
      if (o.userData.spin) o.rotation.z = t * o.userData.spin;
      else if (o.userData.smoke) {
        const rng = o.userData.smoke.range, spr = o.userData.smoke.spread;
        for (const c of o.children) {
          const y = (t * c.userData.speed + c.userData.phase) % rng, f = y / rng;
          c.position.y = y;
          c.position.x = Math.sin((y + c.userData.phase) * 3.0) * spr * 0.5;
          c.material.opacity = Math.max(0, 0.85 * (1 - f));
          c.scale.setScalar(0.5 + f * 1.1);
        }
      } else if (o.userData.boat) {
        // caminho retangular ao redor da ilha (margem constante -> sempre na agua)
        const Rx = bw / 2 + 4.2, Rz = bd / 2 + 4.2, w = 2 * Rx, h = 2 * Rz, P = 2 * (w + h);
        let d = (t * o.userData.boat.speed + o.userData.boat.phase) % P; if (d < 0) d += P;
        let x, z, dx, dz;
        if (d < w) { x = -Rx + d; z = -Rz; dx = 1; dz = 0; }
        else if (d < w + h) { const e = d - w; x = Rx; z = -Rz + e; dx = 0; dz = 1; }
        else if (d < 2 * w + h) { const e = d - w - h; x = Rx - e; z = Rz; dx = -1; dz = 0; }
        else { const e = d - 2 * w - h; x = -Rx; z = Rz - e; dx = 0; dz = -1; }
        o.position.set(x, SEA_Y + Math.sin(t * 1.4 + o.userData.boat.phase) * 0.03, z);
        o.rotation.y = Math.atan2(-dz, dx);
      } else if (o.userData.traffic) {
        const arr = o.userData.traffic;
        if (!lightsOn) { for (let i = 0; i < 3; i++) arr[i].material.emissive.setHex(0x000000); }
        else { const ph = Math.floor(t / 1.4) % 3, act = ph === 0 ? 2 : (ph === 1 ? 1 : 0), C = [0xe5533d, 0xf4c020, 0x33cc55]; for (let i = 0; i < 3; i++) arr[i].material.emissive.setHex(i === act ? C[i] : 0x000000); }
      }
    });
  }

  if (canvas.__raf) cancelAnimationFrame(canvas.__raf);
  function loop(ts) { updateAnimations((ts || 0) * 0.001); gl.render(scene, camera); canvas.__raf = requestAnimationFrame(loop); }

  resize();
  canvas.__raf = requestAnimationFrame(loop);
  return { draw, hitTest, resize, rotate, snap, zoom: zoomBy, setNight, setLightsOn };
};
