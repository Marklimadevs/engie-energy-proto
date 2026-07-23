/* 3D isometric renderer (Three.js). Keeps interface: Renderer(canvas, game) -> { draw, hitTest }. */
window.EEP = window.EEP || {};
window.EEP.Renderer = function (canvas, game) {
  const THREE = window.THREE;
  const Hex = window.EEP.Hex;
  const level = game.level;
  const grid = level.grid || window.EEP.Grid.hex;
  let waterMat = null;

  const HS = 1;          // hex size in world units
  const TH = 0.34;       // tile thickness
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

  scene.add(new THREE.HemisphereLight(0xffffff, 0x88a0b4, 0.55));
  const dir = new THREE.DirectionalLight(0xffffff, 0.95);
  dir.castShadow = true; dir.shadow.mapSize.set(2048, 2048); dir.shadow.bias = -0.0006; dir.shadow.normalBias = 0.02;
  scene.add(dir); scene.add(dir.target);
  scene.add(new THREE.AmbientLight(0xffffff, 0.28));

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
    if (cell.terrain === 'hill') return COL.hill;
    if (cell.terrain === 'node') return COL.node;
    // land: tint by irradiance (sunnier = a touch warmer)
    const a = new THREE.Color(0x74AC48), b = new THREE.Color(0xA6C766);
    return a.lerp(b, cell.irr * 0.5).getHex();
  }
  function topY(cell) {
    if (cell.terrain === 'hill') return 0.32;
    if (cell.terrain === 'water') return -0.14;
    return 0;
  }

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
    const mat = new THREE.MeshLambertMaterial({ color: terrainColor(c) });
    if (c.terrain === 'water') { mat.transparent = true; mat.opacity = 0.92; }
    const m = new THREE.Mesh(tileGeo, mat);
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
      uniforms: { uTime: { value: 0 }, uA: { value: new THREE.Color(0x6fc0ea) }, uB: { value: new THREE.Color(0xa9e2f6) } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader:
        'precision mediump float; varying vec2 vUv; uniform float uTime; uniform vec3 uA; uniform vec3 uB;' +
        'void main(){ vec2 p = vUv * 48.0;' +
        'float w1 = sin(p.x*0.5 + uTime*0.7);' +
        'float w2 = sin(p.y*0.42 - uTime*0.55);' +
        'float w3 = sin((p.x*0.7 + p.y*0.6) + uTime*0.4);' +
        'float m = (w1*w2 + w3) * 0.25 + 0.5;' +
        'vec3 col = mix(uA, uB, smoothstep(0.32, 0.78, m));' +
        'gl_FragColor = vec4(col,1.0); }'
    });
    const water = new THREE.Mesh(new THREE.PlaneGeometry(W2 + 44, D2 + 44), waterMat);
    water.rotation.x = -Math.PI / 2; water.position.y = -0.58; scene.add(water);
    const shore = new THREE.Mesh(new THREE.PlaneGeometry(W2 + 2.6, D2 + 2.6), new THREE.MeshBasicMaterial({ color: 0xb2e2f6 }));
    shore.rotation.x = -Math.PI / 2; shore.position.y = -0.5; scene.add(shore);
    const base = new THREE.Mesh(new THREE.BoxGeometry(W2, 2.0, D2), new THREE.MeshLambertMaterial({ color: 0x6b4a2f }));
    base.position.y = -1.2; base.receiveShadow = true; scene.add(base);
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(W2 + 0.2, 0.4, D2 + 0.2), new THREE.MeshLambertMaterial({ color: 0x86B24E }));
    skirt.position.y = -0.3; skirt.receiveShadow = true; scene.add(skirt);
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
      for (let i = 0; i < n; i++) { const a = i * 2.399, rr = 0.35 + (i % 3) * 0.25; const t = buildProp('tree', { v: i % 3 }); t.position.set(Math.cos(a) * rr, 0, Math.sin(a) * rr); t.scale.setScalar(0.8 + (i % 2) * 0.25); g.add(t); }
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
      const hull = box(0.9, 0.28, 0.4, 0xb23b34); hull.position.y = 0.14; g.add(hull);
      const deck = box(0.9, 0.06, 0.4, 0xf0f0f0); deck.position.y = 0.3; g.add(deck);
      const cabin = box(0.22, 0.22, 0.34, 0xf0f0f0); cabin.position.set(-0.28, 0.4, 0); g.add(cabin);
      const c1 = box(0.4, 0.16, 0.14, 0x2a7bbf); c1.position.set(0.12, 0.4, 0.1); g.add(c1);
      const c2 = box(0.4, 0.16, 0.14, 0xd9a233); c2.position.set(0.12, 0.4, -0.1); g.add(c2);
    } else if (type === 'road') {
      const r = box(it.len || 1, 0.05, 0.34, 0x3a3f45); r.position.y = 0.03; g.add(r);
    } else if (type === 'windturbine') {
      const pole = cyl(0.05, 0.07, 1.3, 0xededed); pole.position.y = 0.65; g.add(pole);
      const rotor = new THREE.Group(); rotor.position.set(0, 1.3, 0.1);
      const hub = sph(0.09, 0x333333); rotor.add(hub);
      for (let i = 0; i < 3; i++) { const bl = box(0.07, 0.7, 0.025, 0xf4f4f4); bl.geometry.translate(0, 0.35, 0); bl.rotation.z = i * 2 * Math.PI / 3; rotor.add(bl); }
      rotor.userData.spin = 1.8; g.add(rotor);
    } else if (type === 'rock') {
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.18), mat(0x9aa0a6)); r.position.y = 0.12; g.add(r);
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
    const h = showcase ? window.innerHeight : Math.round(w * 0.66);
    gl.setSize(w, h, false);
    canvas.style.height = h + 'px';
    updateCamera(w, h);
    applyCamera();
    render();
  }
  function render() { syncDynamic(); gl.render(scene, camera); }
  function rotate(dAz) { az += dAz; applyCamera(); render(); }
  function snap() { const s = Math.PI / 2, off = Math.PI / 4; az = Math.round((az - off) / s) * s + off; applyCamera(); render(); }

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

  // single resize binding shared across level reloads
  canvas.__eep = { onResize: resize };
  if (!canvas.__resizeBound) { window.addEventListener('resize', () => { if (canvas.__eep) canvas.__eep.onResize(); }); canvas.__resizeBound = true; }

  function updateAnimations(t) {
    if (waterMat) waterMat.uniforms.uTime.value = t;
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
      }
    });
  }

  if (canvas.__raf) cancelAnimationFrame(canvas.__raf);
  function loop(ts) { updateAnimations((ts || 0) * 0.001); gl.render(scene, camera); canvas.__raf = requestAnimationFrame(loop); }

  resize();
  canvas.__raf = requestAnimationFrame(loop);
  return { draw, hitTest, resize, rotate, snap };
};
