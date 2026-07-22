/* 3D isometric renderer (Three.js). Keeps interface: Renderer(canvas, game) -> { draw, hitTest }. */
window.EEP = window.EEP || {};
window.EEP.Renderer = function (canvas, game) {
  const THREE = window.THREE;
  const Hex = window.EEP.Hex;
  const level = game.level;
  const grid = level.grid || window.EEP.Grid.hex;

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

  scene.add(new THREE.HemisphereLight(0xffffff, 0x7a8a9a, 0.68));
  const dir = new THREE.DirectionalLight(0xffffff, 1.0); dir.position.set(7, 13, 5); scene.add(dir);
  scene.add(new THREE.AmbientLight(0xffffff, 0.2));

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
    const a = new THREE.Color(0x86B24E), b = new THREE.Color(0xB2C773);
    return a.lerp(b, cell.irr * 0.55).getHex();
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
  for (const [k, c] of level.cells) {
    c._x = c._wx - ccx; c._z = c._wz - ccz; c._y = topY(c);
    const mat = new THREE.MeshLambertMaterial({ color: terrainColor(c) });
    if (c.terrain === 'water') { mat.transparent = true; mat.opacity = 0.92; }
    const m = new THREE.Mesh(tileGeo, mat);
    m.position.set(c._x, c._y, c._z);
    m.userData.key = k;
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
  function box(w, h, d, color, gh) { return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, gh)); }
  function cyl(rt, rb, h, color, gh, seg) { return new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 12), mat(color, gh)); }
  function cone(r, h, color, gh, seg) { return new THREE.Mesh(new THREE.ConeGeometry(r, h, seg || 8), mat(color, gh)); }
  function sph(r, color, gh) { return new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), mat(color, gh)); }

  function buildPiece(type, gh) {
    const g = new THREE.Group();
    const C = COL.piece;
    if (type === 'solar') {
      const post = box(0.06, 0.28, 0.06, 0x555555, gh); post.position.y = 0.14; g.add(post);
      const panel = box(0.75, 0.05, 0.5, C.solar, gh); panel.position.y = 0.32; panel.rotation.x = -0.5; g.add(panel);
    } else if (type === 'wind') {
      const pole = cyl(0.04, 0.05, 0.85, C.wind, gh); pole.position.y = 0.42; g.add(pole);
      const hub = sph(0.07, 0x333333, gh); hub.position.set(0, 0.85, 0.06); g.add(hub);
      for (let i = 0; i < 3; i++) { const bl = box(0.06, 0.5, 0.02, C.wind, gh); bl.position.set(0, 0.85, 0.06); bl.geometry.translate(0, 0.25, 0); bl.rotation.z = i * 2 * Math.PI / 3; g.add(bl); }
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

  // ---- camera / sizing ----
  let fitH = Math.max(bw, bd) * 0.5 + 0.7;
  function updateCamera(w, h) {
    const aspect = w / h;
    const halfH = fitH, halfW = fitH * aspect;
    camera.left = -halfW; camera.right = halfW; camera.top = halfH; camera.bottom = -halfH;
    camera.updateProjectionMatrix();
  }
  function resize() {
    const w = canvas.clientWidth || (canvas.parentElement && canvas.parentElement.clientWidth) || 820;
    const h = Math.round(w * 0.66);
    gl.setSize(w, h, false);
    canvas.style.height = h + 'px';
    updateCamera(w, h);
    applyCamera();
    render();
  }
  function render() { syncDynamic(); gl.render(scene, camera); }
  function rotate(dAz) { az += dAz; applyCamera(); render(); }

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

  resize();
  return { draw, hitTest, resize, rotate };
};
