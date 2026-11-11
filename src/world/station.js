import * as THREE from 'three';
import { getMaterials, tiled } from './materials.js';
import { createEarth, createStars, createSun } from './space.js';
import { buildDeck } from './deck.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * HELIOS-7 interior. One continuous, physically consistent space:
 *   Crew Quarters 3-C (floor y=0)  ── glass door ──  Hab Corridor (infected)
 *        │ floor vent
 *   Ventilation trunk (floor y=-1.4, crawl-only, runs under the quarters)
 *        │ ceiling grate
 *   Storage C-7 (floor y=-4.6) ── jammed door ── Logistics hallway (infected, dormant)
 */

export const AREAS = {
  Q: { floorY: 0, ceilY: 3.0, walk: [[-4.72, 4.72, -3.72, 3.72]] },
  D: { floorY: -1.4, ceilY: -0.56, walk: [[2.18, 2.82, -3.22, 0.85], [-3.32, 2.82, -3.32, -2.68], [-3.32, -2.68, -3.32, 2.3]] },
  S: { floorY: -4.6, ceilY: -1.72, walk: [[-5.7, 5.7, -5.7, 3.7]] },
};

let M;
const _matCache = new Map();
function wallMat(base, w, h, key) {
  const k = `${key}:${w.toFixed(1)}:${h.toFixed(1)}`;
  if (!_matCache.has(k)) _matCache.set(k, tiled(base, Math.max(1, w / 2.4), Math.max(1, h / 2.4)));
  return _matCache.get(k);
}

export class Station {
  constructor(scene) {
    M = getMaterials();
    this.scene = scene;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.camColliders = [];
    this.obstacles = { Q: [], D: [], S: [] };
    this.updaters = [];
    this.lights = {};
    this.zones = {};
    this._buildSpace();
    this._buildQuarters();
    this._buildCorridor();
    this._buildDuct();
    this._buildStorage();
    this._buildHallway();
    buildDeck(this);
    this._buildLights();
    this._buildParticles();
    this._batchStatic();
  }

  /**
   * Draw-call batching for the static set dressing. Each area is hundreds of small boxes; merging
   * those that share a material into one mesh cuts the draws (and the per-light shadow draws) by
   * hundreds. Only plain, opaque meshes sitting directly in an area group are merged, and never
   * anything the game holds a reference to (doors, panels, lights, screens...) or anything inside
   * a moving sub-group (fans, pods, doors). The originals stay in place, hidden, as camera-collision
   * proxies, so nothing else changes.
   */
  _batchStatic() {
    const keep = new Set();
    const scan = (v, depth) => {
      if (!v || depth > 3) return;
      if (v.isObject3D) { keep.add(v); return; }
      if (Array.isArray(v)) { v.forEach((x) => scan(x, depth + 1)); return; }
      if (typeof v === 'object' && v.constructor === Object) Object.values(v).forEach((x) => scan(x, depth + 1));
    };
    for (const [k, v] of Object.entries(this)) if (!['root', 'scene', 'camColliders', 'quarters', 'corridor', 'duct', 'storage', 'hallway', 'deck'].includes(k)) scan(v, 0);
    let before = 0, after = 0;
    for (const area of [this.quarters, this.corridor, this.duct, this.storage, this.hallway, this.deck]) {
      if (!area) continue;
      area.updateMatrixWorld(true);
      const groups = new Map();
      for (const m of area.children) {
        if (!m.isMesh || m.isInstancedMesh || m.isSkinnedMesh || keep.has(m) || m.children.length || !m.visible) continue;
        const mat = m.material;
        if (!mat || Array.isArray(mat) || mat.transparent || mat.isShaderMaterial || !m.geometry?.attributes?.position) continue;
        const key = `${mat.uuid}|${m.castShadow ? 1 : 0}${m.receiveShadow ? 1 : 0}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(m);
      }
      for (const list of groups.values()) {
        if (list.length < 2) continue;
        const geos = list.map((m) => {
          const g = m.geometry.clone();
          for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
          const n = g.attributes.position.count;
          if (!g.attributes.normal) g.computeVertexNormals();
          if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
          if (!g.index) g.setIndex([...Array(n).keys()]);
          g.morphAttributes = {};
          m.updateMatrix(); g.applyMatrix4(m.matrix);
          return g;
        });
        let geo = null;
        try { geo = mergeGeometries(geos, false); }
        catch (e) { console.warn('Static batching skipped for one material:', e?.message || e); }
        geos.forEach((g) => g.dispose());
        if (!geo) continue;
        const merged = new THREE.Mesh(geo, list[0].material);
        merged.castShadow = list[0].castShadow; merged.receiveShadow = list[0].receiveShadow;
        merged.name = 'batched';
        area.add(merged);
        list.forEach((m) => { m.visible = false; m.castShadow = false; }); // stay as invisible camera-collision proxies
        before += list.length; after += 1;
      }
    }
    this.batchStats = { before, after };
  }

  // ---------------------------------------------------------------- helpers
  box(w, h, d, mat, x, y, z, parent = this.root, opts = {}) {
    const g = new THREE.BoxGeometry(w, h, d);
    const m = new THREE.Mesh(g, mat);
    m.position.set(x, y, z);
    m.castShadow = opts.cast ?? true; m.receiveShadow = true;
    if (opts.cam !== false) this.camColliders.push(m);
    if (opts.area) this.obstacles[opts.area].push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, minY: y - h / 2, maxY: y + h / 2 });
    parent.add(m);
    return m;
  }

  wall(w, h, d, x, y, z, base = M.wall, parent = this.root, key = 'w') {
    const big = Math.max(w, d);
    return this.box(w, h, d, wallMat(base, big, h, key), x, y, z, parent);
  }

  strip(w, h, d, mat, x, y, z, parent = this.root) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); parent.add(m); return m;
  }

  decal(mat, x, y, z, size, rotX = -Math.PI / 2, rotZ = Math.random() * 6, parent = this.root) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    m.position.set(x, y, z); m.rotation.set(rotX, 0, rotZ); m.receiveShadow = true; m.renderOrder = 1;
    parent.add(m); return m;
  }

  screen(tex, w, h, x, y, z, ry = 0, parent = this.root) {
    const g = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, h + 0.08, 0.06), M.trim); g.add(frame);
    const mat = new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 1.6, roughness: 0.2 });
    const s = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); s.position.z = 0.032; g.add(s);
    g.position.set(x, y, z); g.rotation.y = ry; parent.add(g);
    return { group: g, mat };
  }

  // ---------------------------------------------------------------- space
  _buildSpace() {
    this.earth = createEarth(600);
    this.earth.position.set(-880, -330, 120);
    this.earth.rotation.z = 0.35;
    this.root.add(this.earth);
    this.stars = createStars(5000, 1900);
    this.root.add(this.stars);
    this.sun = createSun(new THREE.Vector3(-0.55, 0.45, -0.7).normalize(), 1700);
    this.root.add(this.sun);
    this.updaters.push((t, dt, cam) => { this.earth.userData.update(t, cam); this.stars.userData.update(t); });
  }

  // ---------------------------------------------------------------- crew quarters 3-C
  _buildQuarters() {
    const Q = (this.quarters = new THREE.Group()); this.root.add(Q);
    const H = 3.0;
    // floor with vent opening at x∈[2,3], z∈[0,1]
    const fm = wallMat(M.floor, 4, 4, 'f');
    this.box(10, 0.2, 4, fm, 0, -0.1, -2, Q);
    this.box(10, 0.2, 3, fm, 0, -0.1, 2.5, Q);
    this.box(7, 0.2, 1, fm, -1.5, -0.1, 0.5, Q);
    this.box(2, 0.2, 1, fm, 4, -0.1, 0.5, Q);
    // ceiling
    this.box(10.4, 0.2, 8.4, wallMat(M.ceiling, 10, 8, 'c'), 0, H + 0.1, 0, Q);
    // back wall z=-4
    this.wall(10.4, H, 0.2, 0, H / 2, -4.1, M.wall, Q);
    // right wall x=5
    this.wall(0.2, H, 8.4, 5.1, H / 2, 0, M.wall, Q);
    // left wall x=-5 with window z∈[-2.2,2.2], y∈[0.9,2.5]
    this.wall(0.2, 0.9, 8.4, -5.1, 0.45, 0, M.wallB, Q, 'wb');
    this.wall(0.2, H - 2.5, 8.4, -5.1, 2.5 + (H - 2.5) / 2, 0, M.wallB, Q, 'wb');
    this.wall(0.2, 1.6, 1.9, -5.1, 1.7, -3.15, M.wallB, Q, 'wb');
    this.wall(0.2, 1.6, 1.9, -5.1, 1.7, 3.15, M.wallB, Q, 'wb');
    // window frame + glass
    const fr = M.trim;
    this.box(0.35, 0.12, 4.6, fr, -5.0, 0.9, 0, Q, { cam: false });
    this.box(0.35, 0.12, 4.6, fr, -5.0, 2.5, 0, Q, { cam: false });
    for (const z of [-2.25, -0.75, 0.75, 2.25]) this.box(0.35, 1.7, 0.1, fr, -5.0, 1.7, z, Q, { cam: false });
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.6), M.window);
    glass.position.set(-5.05, 1.7, 0); glass.rotation.y = Math.PI / 2; Q.add(glass);
    this.strip(0.04, 0.03, 4.4, M.stripCyan, -4.86, 0.97, 0, Q);
    // front wall z=4 with door x∈[-0.9,0.9], y∈[0,2.4]
    this.wall(4.1, H, 0.2, -2.95 - 0.05, H / 2, 4.1, M.wall, Q);
    this.wall(4.1, H, 0.2, 2.95 + 0.05, H / 2, 4.1, M.wall, Q);
    this.wall(1.8, H - 2.4, 0.2, 0, 2.4 + (H - 2.4) / 2, 4.1, M.wall, Q);
    // door frame
    this.box(0.12, 2.45, 0.34, M.trim, -0.96, 1.22, 4.1, Q, { cam: false });
    this.box(0.12, 2.45, 0.34, M.trim, 0.96, 1.22, 4.1, Q, { cam: false });
    this.box(2.04, 0.12, 0.34, M.trim, 0, 2.43, 4.1, Q, { cam: false });
    this.doorLight = this.strip(1.8, 0.04, 0.05, M.stripAmber.clone(), 0, 2.36, 3.92, Q);
    // glass door (slides into right wall pocket)
    const door = new THREE.Group();
    const pane = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.36, 0.05), M.glass);
    pane.renderOrder = 2; door.add(pane);
    const dframe = M.darkMetal;
    [[-0.88, 0, 0.06, 2.36], [0.88, 0, 0.06, 2.36]].forEach(([x, y, w, h]) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.08), dframe); b.position.set(x, y, 0); door.add(b); });
    [1.15, -1.15].forEach((y) => { const b = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.06, 0.08), dframe); b.position.set(0, y, 0); door.add(b); });
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.5, 0.06), M.chrome); handle.position.set(-0.75, 0, 0.06); door.add(handle);
    const stencil = this._stencilPlane('3-C  CREW', 1.2, 0.16); stencil.position.set(0, 0.85, 0.03); door.add(stencil);
    // crack overlay
    this.crack = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7), M.crack);
    this.crack.position.set(-0.05, 0.15, -0.035); this.crack.rotation.y = Math.PI; door.add(this.crack);
    this.crack2 = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7), M.crack); this.crack2.position.set(0, 0.15, 0.035); door.add(this.crack2);
    // bloody handprints and smears on the corridor side of the glass
    [[-0.45, 0.35, 0.36, 0, 0.2], [0.35, 0.55, 0.32, 1, -0.3], [0.15, -0.2, 0.3, 2, 0.1], [-0.6, -0.45, 0.28, 3, -0.5], [0.6, 0.0, 0.3, 0, 0.6]].forEach(([x, y, sz, k, rz]) => {
      const h = new THREE.Mesh(new THREE.PlaneGeometry(sz, sz), M.hands[k]); h.position.set(x, y, 0.03); h.rotation.set(0, 0, rz); h.renderOrder = 3; door.add(h);
    });
    [[0.0, 0.7, 0.7, 0], [-0.3, -0.6, 0.6, 2]].forEach(([x, y, sz, k]) => { const b = new THREE.Mesh(new THREE.PlaneGeometry(sz, sz), M.blood[k]); b.position.set(x, y, 0.031); b.renderOrder = 3; door.add(b); });
    door.position.set(0, 1.2, 4.1);
    Q.add(door);
    this.camColliders.push(pane);
    this.glassDoor = { group: door, openAmt: 0, target: 0, pane };
    this.setGlassDoor(0.55, true);
    // control panel
    const panel = new THREE.Group();
    const pb = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.4, 0.06), M.trim); panel.add(pb);
    this.doorPanelLight = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.28), new THREE.MeshStandardMaterial({ color: 0, emissive: 0xffa526, emissiveIntensity: 1.1 }));
    this.doorPanelLight.position.z = 0.032; panel.add(this.doorPanelLight);
    panel.position.set(-1.35, 1.3, 3.97); panel.rotation.y = Math.PI; Q.add(panel);
    this.doorPanelPos = new THREE.Vector3(-1.35, 0, 3.4);

    // baseboard + ceiling cove light strips
    [[-4.98, 0.04, 0, 0.03, 0.03, 8], [4.98, 0.04, 0, 0.03, 0.03, 8], [0, 0.04, -3.98, 10, 0.03, 0.03]].forEach(([x, y, z, w, h, d]) => this.strip(w, h, d, M.stripCyan, x, y, z, Q));
    [[0, 2.96, -3.95, 9.8, 0.03, 0.05], [4.95, 2.96, 0, 0.05, 0.03, 7.8], [-4.95, 2.96, 0, 0.05, 0.03, 7.8]].forEach(([x, y, z, w, h, d]) => this.strip(w, h, d, M.stripWhite, x, y, z, Q));
    // ceiling light panels
    this.ceilPanels = [];
    for (const [x, z] of [[-2.5, -1.2], [2.5, -1.2], [-2.5, 2], [2.5, 2]]) {
      const p = this.strip(1.6, 0.04, 0.5, new THREE.MeshStandardMaterial({ color: 0, emissive: 0xdff2ff, emissiveIntensity: 0.6 }), x, 2.98, z, Q);
      this.ceilPanels.push(p);
    }
    // pipes along ceiling
    for (const x of [-4.6, -4.4]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 8, 12), M.chrome); p.rotation.x = Math.PI / 2; p.position.set(x, 2.82, 0); p.castShadow = true; Q.add(p);
    }

    // sleep pods — Sean (x=-3), Max (x=0), Anna (x=3)
    this.pods = [];
    for (const [i, x] of [-3, 0, 3].entries()) this.pods.push(this._pod(Q, x, i));

    // lockers on right wall
    for (const [i, z] of [-1.2, -0.42, 0.36].entries()) this._locker(Q, 4.72, z, i);
    // desk + status screen
    this.box(0.7, 0.06, 1.4, M.plastic, 4.6, 0.78, 2.15, Q, { area: 'Q' });
    this.box(0.6, 0.72, 0.06, M.trim, 4.6, 0.38, 1.5, Q, { cam: false });
    this.box(0.6, 0.72, 0.06, M.trim, 4.6, 0.38, 2.8, Q, { cam: false });
    this.screen(M.screens.status, 0.9, 0.56, 4.98, 1.55, 2.15, -Math.PI / 2, Q);
    const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.1, 16), new THREE.MeshStandardMaterial({ color: 0xc23b2a, roughness: 0.4 })); mug.position.set(4.5, 0.86, 1.8); mug.castShadow = true; Q.add(mug);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.012, 0.3), M.darkMetal); pad.position.set(4.6, 0.817, 2.45); pad.rotation.y = 0.3; Q.add(pad);
    // corner bench (tablet is hidden beneath it)
    this.box(1.4, 0.08, 0.7, M.plastic, 4.3, 0.46, 3.55, Q, { area: 'Q' });
    this.box(0.08, 0.42, 0.7, M.trim, 3.65, 0.21, 3.55, Q, { cam: false });
    this.tablet = new THREE.Group();
    const tb = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.018, 0.21), M.darkMetal); this.tablet.add(tb);
    const ts = new THREE.Mesh(new THREE.PlaneGeometry(0.27, 0.18), M.tabletScreen); ts.rotation.x = -Math.PI / 2; ts.position.y = 0.0095; this.tablet.add(ts);
    this.tablet.position.set(4.45, 0.012, 3.6); this.tablet.rotation.y = 0.5; Q.add(this.tablet);
    this.tabletGlow = new THREE.PointLight(0x5ff3ff, 0.6, 1.6, 2); this.tabletGlow.position.set(4.45, 0.15, 3.6); Q.add(this.tabletGlow);
    // round table + stools
    const tableTop = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.05, 32), M.plastic); tableTop.position.set(-2.6, 0.74, 1.9); tableTop.castShadow = tableTop.receiveShadow = true; Q.add(tableTop);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.2, 0.72, 16), M.trim); leg.position.set(-2.6, 0.36, 1.9); leg.castShadow = true; Q.add(leg);
    this.obstacles.Q.push({ minX: -3.15, maxX: -2.05, minZ: 1.35, maxZ: 2.45, minY: 0, maxY: 0.8 });
    const cards = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.015, 0.13), new THREE.MeshStandardMaterial({ color: 0xeeeeee })); cards.position.set(-2.5, 0.775, 1.8); cards.rotation.y = 0.4; Q.add(cards);
    // wall screens
    this.screen(M.screens.alert, 0.7, 0.44, -2.2, 1.65, 3.98, Math.PI, Q);
    this.screen(M.screens.status, 0.9, 0.56, -1.5, 1.7, -3.98, 0, Q);
    this._stencilWall(Q, 'CREW QUARTERS 3-C', 1.5, 2.55, -3.99, 0);

    // floor vent grate (x∈[2,3], z∈[0,1])
    this.ventGrate = new THREE.Group();
    const gm = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), M.grate.clone()); gm.material.alphaMap = gm.material.alphaMap.clone(); gm.material.alphaMap.repeat.set(4, 4); gm.rotation.x = -Math.PI / 2; this.ventGrate.add(gm);
    const gf = new THREE.Mesh(new THREE.BoxGeometry(1.04, 0.03, 1.04), M.trim); gf.position.y = -0.016; gf.scale.set(1, 1, 1); this.ventGrate.add(gf);
    gf.material = M.trim; gf.visible = false;
    for (const [x, z, w, d] of [[0, -0.5, 1.06, 0.06], [0, 0.5, 1.06, 0.06], [-0.5, 0, 0.06, 1.06], [0.5, 0, 0.06, 1.06]]) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, d), M.trim); b.position.set(x, 0.01, z); this.ventGrate.add(b); }
    this.ventGrate.position.set(2.5, 0.01, 0.5);
    Q.add(this.ventGrate);
    this.ventGrateHome = this.ventGrate.position.clone();
    // hazard ring around vent
    this.strip(1.2, 0.006, 0.04, M.stripAmber, 2.5, 0.003, -0.08, Q);
    this.strip(1.2, 0.006, 0.04, M.stripAmber, 2.5, 0.003, 1.08, Q);

    // obstacles for walls/door (keep the player inside)
    this.obstacles.Q.push({ minX: -1.0, maxX: 1.0, minZ: 3.55, maxZ: 4.3, minY: 0, maxY: 2.4 });
  }

  _pod(Q, x, i) {
    const g = new THREE.Group(); g.position.set(x, 0, -2.9); Q.add(g);
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.45, 2.2), M.trim); base.position.y = 0.225; base.castShadow = base.receiveShadow = true; g.add(base);
    const side = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.12, 2.24), M.plastic); side.position.y = 0.46; side.castShadow = side.receiveShadow = true; g.add(side);
    const mat = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.12, 2.0), M.mattress); mat.position.y = 0.54; mat.castShadow = mat.receiveShadow = true; g.add(mat);
    const pillow = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.5, 6, 12), M.pillow); pillow.rotation.z = Math.PI / 2; pillow.scale.set(1, 1, 0.55); pillow.position.set(0, 0.65, -0.78); pillow.castShadow = true; g.add(pillow);
    // rumpled blanket (displaced box)
    const bg = new THREE.BoxGeometry(1.04, 0.08, 1.2, 12, 1, 12);
    const p = bg.attributes.position;
    for (let k = 0; k < p.count; k++) { const bx = p.getX(k), bz = p.getZ(k); if (p.getY(k) > 0) p.setY(k, p.getY(k) + Math.sin(bx * 9 + i) * 0.025 + Math.cos(bz * 7 + i * 2) * 0.03 + 0.08 * Math.exp(-bx * bx * 12)); }
    bg.computeVertexNormals();
    const blanket = new THREE.Mesh(bg, M.blanket); blanket.position.set(0, 0.62, 0.35); blanket.castShadow = blanket.receiveShadow = true; g.add(blanket);
    this.camColliders.push(base);
    // arched canopy over the head end (open toward the foot of the pod)
    const hoodG = new THREE.CylinderGeometry(0.66, 0.66, 0.95, 32, 1, true, -Math.PI / 2, Math.PI);
    hoodG.rotateX(-Math.PI / 2); // axis along Z, arch over +Y
    const hood = new THREE.Mesh(hoodG, M.plastic); hood.position.set(0, 0.48, -0.62); hood.castShadow = true;
    const hoodIn = new THREE.Mesh(hoodG, new THREE.MeshStandardMaterial({ color: 0x141a21, roughness: 0.6, side: THREE.BackSide }));
    hoodIn.position.copy(hood.position); hoodIn.scale.setScalar(0.97);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.025, 8, 32, Math.PI), M.trim); rim.position.set(0, 0.48, -0.145);
    g.add(hood, hoodIn, rim);
    this.camColliders.push(hood);
    const lamp = this.strip(0.5, 0.015, 0.6, i === 1 ? M.stripCyan : M.stripWhite, 0, 1.12, -0.62, g); void lamp;
    const accent = [0xffa040, 0x5ff3ff, 0xff5fd2][i];
    const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.05), new THREE.MeshStandardMaterial({ color: 0, emissive: accent, emissiveIntensity: 2.2 }));
    tag.position.set(0, 0.35, 1.106); g.add(tag);
    const name = this._stencilPlane(['SEAN O.', 'MAX R.', 'ANNA K.'][i], 0.5, 0.08); name.position.set(0, 0.22, 1.107); g.add(name);
    this.obstacles.Q.push({ minX: x - 0.62, maxX: x + 0.62, minZ: -4, maxZ: -1.78, minY: 0, maxY: 1.2 });
    return { group: g, x, footZ: -1.85, bedY: 0.6 };
  }

  _locker(Q, x, z, i) {
    const g = new THREE.Group(); g.position.set(x, 0, z); Q.add(g);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 2.1, 0.74), wallMat(M.wallB, 1, 2, 'lk')); body.position.y = 1.05; body.castShadow = body.receiveShadow = true; g.add(body);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.95, 0.68), M.trim); door.position.set(-0.28, 1.05, 0); g.add(door);
    for (let k = 0; k < 5; k++) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.02, 0.4), M.darkMetal); s.position.set(-0.3, 1.75 - k * 0.05, 0); g.add(s); }
    const led = this.strip(0.01, 0.04, 0.04, [M.stripGreen, M.stripCyan, M.stripAmber][i], -0.3, 1.2, 0.25, g);
    this.camColliders.push(body);
    this.obstacles.Q.push({ minX: x - 0.3, maxX: x + 0.3, minZ: z - 0.37, maxZ: z + 0.37, minY: 0, maxY: 2.1 });
    return g;
  }

  _stencilPlane(text, w, h, color = 'rgba(230,240,250,0.85)') {
    const c = document.createElement('canvas'); c.width = 512; c.height = Math.round(512 * h / w);
    const x = c.getContext('2d'); x.fillStyle = color; x.font = `bold ${Math.round(c.height * 0.72)}px monospace`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(text, c.width / 2, c.height / 2);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.6, depthWrite: false }));
  }

  _stencilWall(parent, text, x, y, z, ry, w = 2.6) {
    const m = this._stencilPlane(text, w, 0.22, 'rgba(40,50,60,0.75)');
    m.position.set(x, y, z + (ry === 0 ? 0.02 : -0.02)); m.rotation.y = ry; parent.add(m); return m;
  }

  setGlassDoor(amount, instant = false) {
    this.glassDoor.target = amount;
    if (instant) { this.glassDoor.openAmt = amount; this.glassDoor.group.position.x = amount * 1.85; }
  }

  // ---------------------------------------------------------------- corridor (infected)
  _buildCorridor() {
    const C = (this.corridor = new THREE.Group()); this.root.add(C);
    const H = 3.2;
    this.box(30, 0.2, 5.2, wallMat(M.floor, 12, 2, 'fc'), 0, -0.1, 6.7, C, { cam: false });
    this.box(30, 0.2, 5.2, wallMat(M.ceiling, 12, 2, 'cc'), 0, H + 0.1, 6.7, C, { cam: false });
    this.wall(30, H, 0.2, 0, H / 2, 9.4, M.wallB, C, 'cw');
    // outer side of the quarters wall
    this.wall(13, H, 0.1, -7.5, H / 2, 4.25, M.wallB, C, 'cw2');
    this.wall(13, H, 0.1, 7.5, H / 2, 4.25, M.wallB, C, 'cw2');
    this.wall(15, H, 0.2, -15, H / 2, 6.7, M.wallDark, C, 'cd'); // end caps hidden by fog
    // ribs
    for (let x = -14; x <= 14; x += 3.5) {
      this.box(0.25, H, 0.3, M.trim, x, H / 2, 9.2, C, { cam: false });
      this.box(0.25, 0.3, 5, M.trim, x, H - 0.15, 6.7, C, { cam: false });
    }
    // lab observation windows on far wall (red-lit beyond)
    for (const x of [-7, 0, 7]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.0), new THREE.MeshStandardMaterial({ color: 0, emissive: 0xff2a1a, emissiveIntensity: 1.4 }));
      w.position.set(x, 1.8, 9.28); w.rotation.y = Math.PI; C.add(w);
      this.box(2.6, 0.1, 0.2, M.trim, x, 2.32, 9.25, C, { cam: false });
      this.box(2.6, 0.1, 0.2, M.trim, x, 1.28, 9.25, C, { cam: false });
    }
    this._stencilWall(C, '◄ LAB DECK B        HAB RING ►', 3.6, 2.75, 9.28, Math.PI, 4.5);
    this.strip(30, 0.03, 0.03, M.stripRed, 0, 0.05, 9.28, C);
    for (const z of [5.0, 8.6]) this.strip(30, 0.05, 0.06, M.stripRed, 0, 3.05, z, C);
    for (const z of [4.5, 9.2]) this.strip(30, 0.04, 0.04, M.stripRed, 0, 2.2, z, C);
    // drifting smoke, lit red by the emergency beacons
    {
      const n = 60, g = new THREE.BufferGeometry(), p = new Float32Array(n * 3), sd = new Float32Array(n);
      for (let i = 0; i < n; i++) { p[i * 3] = (Math.random() - 0.5) * 26; p[i * 3 + 1] = 0.4 + Math.random() * 2.6; p[i * 3 + 2] = 4.8 + Math.random() * 4.2; sd[i] = Math.random(); }
      g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('seed', new THREE.BufferAttribute(sd, 1));
      const m = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uMap: { value: M.softDot } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        vertexShader: `attribute float seed; uniform float uTime; varying float vA; varying float vS;
          void main() { vec3 q = position; q.x += sin(uTime * 0.05 + seed * 20.0) * 1.5 + uTime * 0.06 * (seed - 0.5); q.y += sin(uTime * 0.11 + seed * 9.0) * 0.25;
            vec4 mv = modelViewMatrix * vec4(q, 1.0); gl_PointSize = (900.0 + seed * 900.0) / -mv.z; vA = 0.05 + 0.05 * seed; vS = seed; gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `uniform sampler2D uMap; varying float vA; varying float vS;
          void main() { float a = texture2D(uMap, gl_PointCoord).a * vA; vec3 c = mix(vec3(0.9, 0.18, 0.12), vec3(0.6, 0.6, 0.65), vS * 0.5); gl_FragColor = vec4(c * a, a); }`,
      });
      const haze = new THREE.Points(g, m); haze.frustumCulled = false; C.add(haze);
      this.updaters.push((t) => (m.uniforms.uTime.value = t));
    }
    this.strip(30, 0.03, 0.03, M.stripRed, 0, 0.05, 4.32, C);
    // blood everywhere
    const bloodSpots = [[2.4, 6.2, 1.8, 1], [-3, 5.5, 1.3, 0], [5.5, 7.6, 1.6, 2], [-7, 7.2, 1.4, 1], [0.3, 5, 1.0, 0], [8.5, 5.4, 1.2, 2], [-1.5, 8.2, 1.1, 1]];
    bloodSpots.forEach(([x, z, s, k]) => this.decal(M.blood[k], x, 0.004 + Math.random() * 0.002, z, s, -Math.PI / 2, Math.random() * 6, C));
    this.decal(M.blood[0], -1.0, 1.4, 9.28, 1.4, 0, 0, C).rotation.y = Math.PI;
    this.decal(M.blood[2], 4.0, 1.1, 4.31, 1.0, 0, 0, C);
    // overturned medical cart + debris
    const cart = new THREE.Group();
    const cb = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.55), M.plastic); cart.add(cb);
    const ct = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.04, 0.6), M.chrome); ct.position.y = 0.27; cart.add(ct);
    cart.position.set(-4.2, 0.28, 7.3); cart.rotation.set(0, 0.6, Math.PI / 2.1); cart.traverse((o) => (o.castShadow = true)); C.add(cart);
    for (let i = 0; i < 14; i++) {
      const d = new THREE.Mesh(new THREE.BoxGeometry(0.1 + Math.random() * 0.2, 0.02, 0.08 + Math.random() * 0.2), Math.random() < 0.5 ? M.plastic : M.darkMetal);
      d.position.set(-6 + Math.random() * 12, 0.01, 5 + Math.random() * 4); d.rotation.y = Math.random() * 6; C.add(d);
    }
    // sparking ceiling panel
    const hang = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.04, 0.6), M.wallDark); hang.position.set(5.2, 2.75, 6.5); hang.rotation.set(0.6, 0, 0.3); hang.castShadow = true; C.add(hang);
    this.sparkOrigin = new THREE.Vector3(5.5, 2.95, 6.2);
  }

  // ---------------------------------------------------------------- ventilation trunk
  _buildDuct() {
    const D = (this.duct = new THREE.Group()); this.root.add(D);
    const y0 = -1.4, h = 0.86, t = 0.06;
    const mat = (w, l) => wallMat(M.duct, w, l, 'd');
    const segs = [
      // [x0,x1,z0,z1]
      [2, 3, -3.5, 1.0],
      [-3.5, 3, -3.5, -2.5],
      [-3.5, -2.5, -3.5, 2.6],
    ];
    // floors & ceilings (with grates cut out handled by separate meshes)
    const floorGrates = [[0.0, -3.0], [-3.0, 2.0]]; // see-through into storage; last one is the exit
    segs.forEach(([x0, x1, z0, z1], i) => {
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, l = z1 - z0;
      // ceiling (under quarters floor slab) – skip the vent opening on seg 0
      if (i === 0) {
        this.box(w, t, l - 1.0, mat(w, l), cx, y0 + h + t / 2, cz - 0.5, D);
      } else this.box(w, t, l, mat(w, l), cx, y0 + h + t / 2, cz, D);
    });
    // floors split around grates
    const floorRects = [
      [2, 3, -3.5, 1.0],
      [-0.5, 2, -3.5, -2.5], [-2.5, -0.5, -3.5, -2.5], [0.5, 2, -3.5, -2.5],
      [-3.5, -2.5, -3.5, 1.5], [-3.5, -2.5, 2.5, 2.6],
    ];
    // rebuild seg2 floor precisely: [-2.5,-0.5] and [0.5,2] with grate at [-0.5,0.5]
    const fr = [[2, 3, -3.5, 1.0], [-2.5, -0.5, -3.5, -2.5], [0.5, 2, -3.5, -2.5], [-3.5, -2.5, -3.5, 1.5], [-3.5, -2.5, 2.5, 2.6]];
    void floorRects;
    fr.forEach(([x0, x1, z0, z1]) => this.box(x1 - x0, t, z1 - z0, mat(x1 - x0, z1 - z0), (x0 + x1) / 2, y0 - t / 2, (z0 + z1) / 2, D));
    this.ductGrates = floorGrates.map(([x, z]) => {
      const g = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), M.grate.clone());
      g.material.alphaMap = g.material.alphaMap.clone(); g.material.alphaMap.repeat.set(5, 5);
      g.rotation.x = -Math.PI / 2; g.position.set(x, y0 - 0.01, z); D.add(g);
      return g;
    });
    // walls
    const W = (x0, x1, z0, z1) => this.box(x1 - x0, h + 0.12, z1 - z0, mat(Math.max(x1 - x0, z1 - z0), h), (x0 + x1) / 2, y0 + h / 2, (z0 + z1) / 2, D);
    W(3.0, 3.06, -3.56, 1.0);            // seg0 east
    W(1.94, 2.0, -2.5, 1.0);             // seg0 west (north of seg1)
    W(1.94, 3.06, 1.0, 1.06);            // seg0 south end cap (under vent)
    W(-3.56, 3.06, -3.56, -3.5);         // seg1 north (long)
    W(-2.5, 2.0, -2.5, -2.44);           // seg1 south
    W(-3.56, -3.5, -3.5, 2.6);           // seg2 west
    W(-2.5, -2.44, -2.5, 2.6);           // seg2 east
    W(-3.56, -2.44, 2.6, 2.66);          // seg2 end cap
    // ribs + rivets
    const rib = (x, z, alongX) => {
      const r1 = new THREE.Mesh(new THREE.BoxGeometry(alongX ? 0.05 : 1.04, 0.05, alongX ? 1.04 : 0.05), M.trim); r1.position.set(x, y0 + h - 0.02, z); D.add(r1);
      const r2 = r1.clone(); r2.position.y = y0 + 0.02; D.add(r2);
    };
    for (let z = 0.6; z > -3.2; z -= 0.8) rib(2.5, z, false);
    for (let x = 2.0; x > -3.2; x -= 0.8) rib(x, -3.0, true);
    for (let z = -2.4; z < 2.6; z += 0.8) rib(-3.0, z, false);
    // guide light strips (dim, broken)
    this.ductStrips = [];
    [[2.96, y0 + 0.06, -1.2, 0.02, 0.02, 4], [0, y0 + 0.06, -3.46, 5.5, 0.02, 0.02], [-3.46, y0 + 0.06, -0.5, 0.02, 0.02, 5.5]].forEach(([x, y, z, w, hh, d]) => {
      this.ductStrips.push(this.strip(w, hh, d, M.stripCyan, x, y, z, D));
    });
    // fan in the north wall of seg1
    const fan = new THREE.Group(); fan.position.set(-1.5, y0 + 0.44, -3.47); D.add(fan);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.04, 8, 32), M.trim); fan.add(ring);
    const blades = new THREE.Group(); fan.add(blades);
    for (let i = 0; i < 6; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.33, 0.01), M.darkMetal); b.position.y = 0.17; const p = new THREE.Group(); p.rotation.z = (i / 6) * Math.PI * 2; b.rotation.y = 0.5; p.add(b); blades.add(p); }
    const glow = new THREE.Mesh(new THREE.CircleGeometry(0.36, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.1, 0.5, 0.18) })); glow.position.z = -0.03; fan.add(glow);
    this.updaters.push((t2, dt) => (blades.rotation.z += dt * 9));
    // condensation drip + hanging cable
    const cable = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-3.3, y0 + h, 0.5), new THREE.Vector3(-3.0, y0 + 0.45, 0.9), new THREE.Vector3(-2.7, y0 + h, 1.3)]), 20, 0.015, 6), M.rubber);
    D.add(cable);
  }

  // ---------------------------------------------------------------- storage C-7
  _buildStorage() {
    const S = (this.storage = new THREE.Group()); this.root.add(S);
    const y0 = -4.6, H = 2.9;
    this.box(12, 0.2, 10, wallMat(M.floor, 5, 4, 'fs'), 0, y0 - 0.1, -1, S);
    // ceiling with openings under the duct grates at (0,-3) and (-3,2)
    const cy = y0 + H + 0.1;
    const cm = wallMat(M.ceiling, 6, 4, 'cs');
    this.box(12, 0.2, 2.5, cm, 0, cy, -4.75, S);           // z∈[-6,-3.5]
    this.box(5.5, 0.2, 1, cm, -3.25, cy, -3, S);           // x∈[-6,-0.5], z∈[-3.5,-2.5]
    this.box(5.5, 0.2, 1, cm, 3.25, cy, -3, S);            // x∈[0.5,6]
    this.box(12, 0.2, 4, cm, 0, cy, -0.5, S);              // z∈[-2.5,1.5]
    this.box(2.5, 0.2, 1, cm, -4.75, cy, 2, S);            // x∈[-6,-3.5], z∈[1.5,2.5]
    this.box(8.5, 0.2, 1, cm, 1.75, cy, 2, S);             // x∈[-2.5,6]
    this.box(12, 0.2, 1.5, cm, 0, cy, 3.25, S);            // z∈[2.5,4]
    this.storageGrates = [[0, -3], [-3, 2]].map(([x, z]) => {
      const g = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), M.grate.clone()); g.material.alphaMap = g.material.alphaMap.clone(); g.material.alphaMap.repeat.set(5, 5);
      g.rotation.x = Math.PI / 2; g.position.set(x, y0 + H - 0.01, z); S.add(g); return g;
    });
    // walls; east wall has door gap z∈[-1,1]
    this.wall(12.4, H, 0.2, 0, y0 + H / 2, -6.1, M.wallDark, S, 'sd');
    this.wall(12.4, H, 0.2, 0, y0 + H / 2, 4.1, M.wallDark, S, 'sd');
    this.wall(0.2, H, 10.4, -6.1, y0 + H / 2, -1, M.wallDark, S, 'sd');
    this.wall(0.2, H, 5.1, 6.1, y0 + H / 2, -3.55, M.wallDark, S, 'sd');
    this.wall(0.2, H, 3.1, 6.1, y0 + H / 2, 2.55, M.wallDark, S, 'sd');
    this.wall(0.2, H - 2.3, 2, 6.1, y0 + 2.3 + (H - 2.3) / 2, 0, M.wallDark, S, 'sd');
    // door frame + heavy sliding door (slides toward -z into the wall pocket)
    this.box(0.4, 2.35, 0.1, M.trim, 6.1, y0 + 1.17, -1.05, S, { cam: false });
    this.box(0.4, 2.35, 0.1, M.trim, 6.1, y0 + 1.17, 1.05, S, { cam: false });
    this.box(0.4, 0.1, 2.2, M.trim, 6.1, y0 + 2.33, 0, S, { cam: false });
    const sd = new THREE.Group();
    const slab = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.28, 2.0), wallMat(M.wallB, 2, 2.3, 'sdoor')); slab.castShadow = slab.receiveShadow = true; sd.add(slab);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 2.0), M.crateOrange); stripe.position.y = 0.3; sd.add(stripe);
    const lbl = this._stencilPlane('C-7', 0.6, 0.25, 'rgba(20,20,20,0.85)'); lbl.position.set(-0.075, 0.75, 0); lbl.rotation.y = -Math.PI / 2; sd.add(lbl);
    sd.position.set(6.1, y0 + 1.14, 0); S.add(sd);
    this.camColliders.push(slab);
    this.storageDoor = { group: sd, openAmt: 0.45, target: 0.45, locked: false };
    this.setStorageDoor(0.45, true);
    // door control panel (inside, north of door)
    const panel = new THREE.Group();
    panel.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.42, 0.3), M.trim));
    this.storagePanelLight = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.2), new THREE.MeshStandardMaterial({ color: 0, emissive: 0xff3b3b, emissiveIntensity: 0.9 }));
    this.storagePanelLight.rotation.y = -Math.PI / 2; this.storagePanelLight.position.x = -0.035; panel.add(this.storagePanelLight);
    panel.position.set(5.97, y0 + 1.3, 1.55); S.add(panel);
    this.storagePanelPos = new THREE.Vector3(5.45, y0, 1.55);
    this.screen(M.screens.storage, 0.8, 0.5, 5.98, y0 + 1.9, 2.6, -Math.PI / 2, S);
    // hazard floor marking at door
    this.strip(0.06, 0.006, 2.2, M.stripAmber, 5.6, y0 + 0.004, 0, S);

    // shelving racks (north wall + west wall)
    const rackAt = (x, z, rotY, len = 3) => {
      const g = new THREE.Group(); g.position.set(x, y0, z); g.rotation.y = rotY; S.add(g);
      for (const sx of [-len / 2, len / 2]) for (const sz of [-0.35, 0.35]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.4, 0.06), M.trim); p.position.set(sx, 1.2, sz); p.castShadow = true; g.add(p); }
      for (const sy of [0.15, 0.85, 1.55, 2.25]) {
        const sh = new THREE.Mesh(new THREE.BoxGeometry(len, 0.04, 0.76), M.darkMetal); sh.position.y = sy; sh.castShadow = sh.receiveShadow = true; g.add(sh);
        for (let k = 0; k < 4; k++) {
          if (Math.random() < 0.25) continue;
          const bw = 0.35 + Math.random() * 0.3, bh = 0.25 + Math.random() * 0.3;
          const b = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.5), Math.random() < 0.3 ? M.crateOrange : M.crate);
          b.position.set(-len / 2 + 0.4 + k * (len - 0.8) / 3, sy + bh / 2 + 0.02, (Math.random() - 0.5) * 0.15); b.rotation.y = (Math.random() - 0.5) * 0.2; b.castShadow = b.receiveShadow = true; g.add(b);
        }
      }
      const half = len / 2 + 0.05;
      const c = Math.abs(Math.sin(rotY)) > 0.5;
      this.obstacles.S.push(c ? { minX: x - 0.42, maxX: x + 0.42, minZ: z - half, maxZ: z + half, minY: y0, maxY: y0 + 2.4 } : { minX: x - half, maxX: x + half, minZ: z - 0.42, maxZ: z + 0.42, minY: y0, maxY: y0 + 2.4 });
      return g;
    };
    rackAt(-3.6, -5.5, 0); rackAt(0.0, -5.5, 0); rackAt(3.6, -5.5, 0);
    rackAt(-5.5, -2.2, Math.PI / 2, 3.2);
    // EVA suit lockers (glass fronted, lit)
    for (const [i, z] of [-0.6, 0.4].entries()) {
      const g = new THREE.Group(); g.position.set(-5.6, y0, z); S.add(g);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.3, 0.9), M.trim); cab.position.y = 1.15; cab.castShadow = true; g.add(cab);
      const inner = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 2.0), new THREE.MeshStandardMaterial({ color: 0x0a1218, emissive: 0x0b2a35, emissiveIntensity: 0.6 })); inner.position.set(0.36, 1.15, 0); inner.rotation.y = Math.PI / 2; g.add(inner);
      const suit = new THREE.Group(); suit.position.set(0.2, 1.15, 0); g.add(suit);
      const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.4, 8, 16), new THREE.MeshPhysicalMaterial({ color: 0xe8e8e2, roughness: 0.6, sheen: 0.5 })); suit.add(torso);
      const helm = new THREE.Mesh(new THREE.SphereGeometry(0.15, 20, 14), new THREE.MeshPhysicalMaterial({ color: 0xcc8a2a, metalness: 1, roughness: 0.1, clearcoat: 1 })); helm.position.y = 0.48; suit.add(helm);
      const glassF = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 2.1), M.glass); glassF.position.set(0.37, 1.15, 0); glassF.rotation.y = Math.PI / 2; g.add(glassF);
      this.strip(0.02, 2.1, 0.02, M.stripCyan, 0.36, 1.15, 0.43, g);
      void i;
    }
    this.obstacles.S.push({ minX: -6, maxX: -5.2, minZ: -1.1, maxZ: 0.9, minY: y0, maxY: y0 + 2.3 });
    // workbench along south wall with tools
    const bench = new THREE.Group(); bench.position.set(1.4, y0, 3.55); S.add(bench);
    const top = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.08, 0.8), wallMat(M.wallB, 3, 1, 'bench')); top.position.y = 0.9; top.castShadow = top.receiveShadow = true; bench.add(top);
    for (const sx of [-1.5, 1.5]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.7), M.trim); l.position.set(sx, 0.45, 0); bench.add(l); }
    const pegboard = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 1.0), new THREE.MeshStandardMaterial({ color: 0x2b3036, roughness: 0.8 })); pegboard.position.set(0, 1.75, 0.43); pegboard.rotation.y = Math.PI; bench.add(pegboard);
    // tools silhouettes
    for (let k = 0; k < 9; k++) {
      const tool = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.25 + Math.random() * 0.35, 0.03), k % 3 ? M.chrome : M.crateOrange);
      tool.position.set(-1.3 + k * 0.32, 1.75 + (Math.random() - 0.5) * 0.2, 0.41); tool.rotation.z = (Math.random() - 0.5) * 0.4; tool.castShadow = true; bench.add(tool);
    }
    const cutter = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 12), M.crateOrange); cutter.rotation.z = Math.PI / 2; cutter.position.set(-0.6, 0.99, 0.0); bench.add(cutter);
    const flare = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.25, 10), M.stripRed); flare.rotation.z = Math.PI / 2; flare.position.set(0.3, 0.97, -0.1); bench.add(flare);
    this.obstacles.S.push({ minX: -0.25, maxX: 3.05, minZ: 3.1, maxZ: 4, minY: y0, maxY: y0 + 1 });
    // medical cabinet (wall)
    const med = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.7, 0.25), M.plastic); med.position.set(4.3, y0 + 1.6, -5.85); med.castShadow = true; S.add(med);
    const cross = new THREE.Group(); cross.position.set(4.3, y0 + 1.6, -5.72); S.add(cross);
    cross.add(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 0.01), M.stripRed), new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.28, 0.01), M.stripRed));
    // central crates (seating for the ending)
    this.seats = [];
    const crate = (x, z, w, h, d, mat, ry = 0) => {
      const c = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); c.position.set(x, y0 + h / 2, z); c.rotation.y = ry; c.castShadow = c.receiveShadow = true; S.add(c);
      const band = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, 0.05, d + 0.02), M.trim); band.position.copy(c.position); band.position.y = y0 + h * 0.75; band.rotation.y = ry; S.add(band);
      this.camColliders.push(c);
      const rx = Math.abs(Math.cos(ry)) * w / 2 + Math.abs(Math.sin(ry)) * d / 2, rz = Math.abs(Math.sin(ry)) * w / 2 + Math.abs(Math.cos(ry)) * d / 2;
      this.obstacles.S.push({ minX: x - rx, maxX: x + rx, minZ: z - rz, maxZ: z + rz, minY: y0, maxY: y0 + h });
      return c;
    };
    crate(-0.6, -1.2, 0.9, 0.5, 0.9, M.crate, 0.2);           // central "table" crate
    crate(-1.9, -0.6, 0.6, 0.47, 0.6, M.crateOrange, 0.4);   // seat Sean
    crate(0.6, -0.3, 0.6, 0.47, 0.6, M.crate, -0.3);         // seat Anna
    crate(-0.9, -2.55, 0.6, 0.47, 0.6, M.crate, 0.1);        // seat Max
    crate(3.2, -2.6, 1.2, 0.9, 1.0, M.crateOrange, 0.1);
    crate(3.5, -1.4, 0.8, 0.6, 0.8, M.crate, -0.2);
    crate(-3.8, 0.6, 1.0, 0.8, 0.9, M.crate, 0.3);
    this.seats = [
      { name: 'Sean', pos: new THREE.Vector3(-1.9, y0, -0.6), face: Math.atan2(-0.6 - -0.6, -0.6 - -1.9) },
      { name: 'Anna', pos: new THREE.Vector3(0.6, y0, -0.3), face: 0 },
      { name: 'Max', pos: new THREE.Vector3(-0.9, y0, -2.55), face: 0 },
    ];
    const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.22, 16), new THREE.MeshStandardMaterial({ color: 0, emissive: 0xffb86a, emissiveIntensity: 4 }));
    lantern.position.set(-0.55, y0 + 0.62, -1.15); S.add(lantern);
    this.lanternPos = lantern.position.clone();
    // pipes & conduits on walls
    for (const y of [y0 + 2.5, y0 + 2.62]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 12, 12), M.chrome); p.rotation.z = Math.PI / 2; p.position.set(0, y, 3.9); S.add(p); }
    this._stencilWall(S, 'STORAGE C-7 · LOGISTICS', -2, y0 + 2.4, -5.99, 0, 3.4);
    this.decal(M.blood[1], 4.6, y0 + 0.005, 0.3, 1.0, -Math.PI / 2, 1.5, S);
    this.strip(0.03, 0.03, 9.8, M.stripAmber, -5.98, y0 + 0.05, -1, S);
    this.strip(0.03, 0.03, 9.8, M.stripAmber, 5.98, y0 + 0.05, -1, S).visible = false;
  }

  setStorageDoor(amount, instant = false) {
    this.storageDoor.target = amount;
    if (instant) { this.storageDoor.openAmt = amount; this.storageDoor.group.position.z = -amount * 2.0; }
  }

  // ---------------------------------------------------------------- logistics hallway (dormant infected)
  _buildHallway() {
    const Hh = (this.hallway = new THREE.Group()); this.root.add(Hh);
    const y0 = -4.6, H = 2.9;
    this.box(8, 0.2, 10, wallMat(M.floor, 3, 4, 'fh'), 10.2, y0 - 0.1, 0, Hh, { cam: false });
    this.box(8, 0.2, 10, wallMat(M.ceiling, 3, 4, 'ch'), 10.2, y0 + H + 0.1, 0, Hh, { cam: false });
    this.wall(0.2, H, 3.5, 14.2, y0 + H / 2, -3.25, M.wallDark, Hh, 'hd');
    this.wall(0.2, H, 3.5, 14.2, y0 + H / 2, 3.25, M.wallDark, Hh, 'hd');
    this.wall(0.2, H - 2.4, 3, 14.2, y0 + 2.4 + (H - 2.4) / 2, 0, M.wallDark, Hh, 'hd');
    this.wall(8, H, 0.2, 10.2, y0 + H / 2, -5, M.wallDark, Hh, 'hd');
    this.wall(8, H, 0.2, 10.2, y0 + H / 2, 5, M.wallDark, Hh, 'hd');
    for (const z of [-4, -2, 2, 4]) this.box(0.3, H, 0.25, M.trim, 14.0, y0 + H / 2, z, Hh, { cam: false });
    this.decal(M.blood[0], 8.2, y0 + 0.004, 0.8, 1.6, -Math.PI / 2, 0.4, Hh);
    this.decal(M.blood[1], 10.5, y0 + 0.004, -1.6, 1.4, -Math.PI / 2, 2.2, Hh);
    this._stencilWall(Hh, 'LOGISTICS SPINE  L-2 ►', 14.08, y0 + 2.62, -3.2, -Math.PI / 2, 2.6);
  }

  // ---------------------------------------------------------------- lighting
  _buildLights() {
    const S = this.scene;
    const L = this.lights;
    L.hemi = new THREE.HemisphereLight(0x8fb8e8, 0x0b0e12, 0.18); S.add(L.hemi);
    // earth/sun light through the window (casts window-frame shadows)
    L.sun = new THREE.DirectionalLight(0xbfd8ff, 1.1);
    L.sun.position.set(-14, 6, 3); L.sun.target.position.set(0, 0, 0);
    L.sun.castShadow = true; L.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(L.sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 40 });
    L.sun.shadow.bias = -0.0004; L.sun.shadow.normalBias = 0.02;
    S.add(L.sun, L.sun.target);
    // quarters key light
    L.qKey = new THREE.SpotLight(0xdff0ff, 18, 12, 1.15, 0.85, 1.6);
    L.qKey.position.set(0.5, 2.9, -0.5); L.qKey.target.position.set(0, 0, -0.5);
    L.qKey.castShadow = true; L.qKey.shadow.mapSize.set(1024, 1024); L.qKey.shadow.bias = -0.0005; L.qKey.shadow.normalBias = 0.02;
    S.add(L.qKey, L.qKey.target);
    // emergency red
    L.qRed = new THREE.PointLight(0xff1a1a, 0, 14, 1.6); L.qRed.position.set(0, 2.7, 2.6); S.add(L.qRed);
    // corridor beacons
    L.cBeaconA = new THREE.SpotLight(0xff2010, 60, 18, 0.5, 0.6, 1.5); L.cBeaconA.position.set(-4, 3.0, 6.7); S.add(L.cBeaconA, L.cBeaconA.target);
    L.cBeaconB = new THREE.SpotLight(0xff2010, 60, 18, 0.5, 0.6, 1.5); L.cBeaconB.position.set(5, 3.0, 6.7); S.add(L.cBeaconB, L.cBeaconB.target);
    L.cFlicker = new THREE.PointLight(0xcfe4ff, 6, 10, 1.7); L.cFlicker.position.set(1.5, 2.8, 6.4); S.add(L.cFlicker);
    // duct: warm fan glow
    L.dFan = new THREE.PointLight(0xff9a40, 0, 4, 1.8); L.dFan.position.set(-1.5, -1.0, -3.2); S.add(L.dFan);
    // storage
    L.sKey = new THREE.SpotLight(0xffc890, 0, 10, 0.9, 0.9, 1.6);
    L.sKey.position.set(-0.6, -1.85, -1.2); L.sKey.target.position.set(-0.6, -4.6, -1.2);
    L.sKey.castShadow = true; L.sKey.shadow.mapSize.set(1024, 1024); L.sKey.shadow.bias = -0.0005; L.sKey.shadow.normalBias = 0.02;
    S.add(L.sKey, L.sKey.target);
    L.sHall = new THREE.PointLight(0xa8ff86, 0, 6.5, 1.6); L.sHall.position.set(10.6, -2.4, 0.3); S.add(L.sHall);
    // Max's suit lamp (attached later)
    L.suit = new THREE.SpotLight(0xd8f4ff, 0, 9, 0.7, 0.6, 1.6);
    L.suit.castShadow = false;
    S.add(L.suit, L.suit.target);
    this.area = 'Q';
  }

  /** Re-balance light intensities for the active area (constant light count = no shader recompiles). */
  setArea(area) {
    this.area = area;
    const L = this.lights;
    const q = area === 'Q', d = area === 'D', s = area === 'S' || (area === 'C' && !this.blackout);
    L.sun.intensity = q ? 1.1 : 0;
    L.hemi.intensity = q ? 0.18 : d ? 0.04 : 0.08;
    L.qKey.intensity = q ? this._qKeyBase ?? 6 : 0;
    L.cBeaconA.intensity = L.cBeaconB.intensity = q ? 60 : 0;
    L.cFlicker.intensity = q ? 6 : 0;
    L.dFan.intensity = d ? 2 : 0;
    L.dFan.position.set(-1.5, -1.0, -3.2); L.dFan.color.set(0xff9a40); L.dFan.distance = 4;
    L.sKey.intensity = s || d ? 38 : 0;
    L.sHall.intensity = s || d ? 7 : 0;
    this.scene.environmentIntensity = q ? 0.1 : 0.06;
    // a shadow-casting light re-renders the whole scene every frame even at intensity 0 —
    // freeze the shadow maps of lights that are off here (biggest single frame-time saving)
    for (const [l, on] of [[L.sun, q], [L.qKey, q], [L.sKey, s || d]]) {
      if (!l?.shadow) continue;
      if (on && !l.shadow.autoUpdate) l.shadow.needsUpdate = true;
      l.shadow.autoUpdate = !!on;
    }
    if (area === 'C') {
      // deck lights follow the blackout / aux-power state; the control-room lamp reuses dFan
      L.hemi.intensity = this.blackout ? 0.012 : 0.08;
      L.dFan.position.set(33, -2.2, 0); L.dFan.distance = 12; L.dFan.color.set(this.alarmPower ? 0xff3020 : 0x6ad8ff);
      L.dFan.intensity = this.ctrlPower ? 9 : 0;
      this.scene.environmentIntensity = this.blackout ? 0.015 : 0.06;
    }
  }

  /** Kill (or restore) deck power: lights, emissive strips and screens dim to almost nothing. */
  setBlackout(on) {
    this.blackout = on;
    if (!this._emis) {
      this._emis = [];
      this.root.traverse((o) => {
        const m = o.material; if (!m || Array.isArray(m) || !m.emissive || m.emissiveIntensity === undefined) return;
        if (m.emissiveIntensity > 0.2 && !this._emis.some((e) => e.m === m)) this._emis.push({ m, v: m.emissiveIntensity });
      });
    }
    this._emis.forEach(({ m, v }) => (m.emissiveIntensity = on ? v * 0.06 : v));
    this.setArea(this.area);
  }

  _buildParticles() {
    // floating dust motes (shared volume that follows the area)
    const n = 900;
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(n * 3), seed = new Float32Array(n);
    for (let i = 0; i < n; i++) { p[i * 3] = (Math.random() - 0.5) * 12; p[i * 3 + 1] = Math.random() * 3; p[i * 3 + 2] = (Math.random() - 0.5) * 10; seed[i] = Math.random(); }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uMap: { value: M.softDot }, uOffset: { value: new THREE.Vector3() }, uColor: { value: new THREE.Color(0.75, 0.85, 1.0) } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`
        attribute float seed; uniform float uTime; uniform vec3 uOffset; varying float vA;
        void main() {
          vec3 p = position + uOffset;
          p.x += sin(uTime * 0.13 + seed * 40.0) * 0.4; p.y += sin(uTime * 0.09 + seed * 17.0) * 0.3; p.z += cos(uTime * 0.11 + seed * 23.0) * 0.4;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = (6.0 + seed * 10.0) / -mv.z;
          vA = (0.15 + 0.35 * seed) * smoothstep(9.0, 1.0, -mv.z) * smoothstep(0.2, 0.8, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D uMap; uniform vec3 uColor; varying float vA;
        void main() { float a = texture2D(uMap, gl_PointCoord).a * vA; gl_FragColor = vec4(uColor * a, a); }`,
    });
    this.dust = new THREE.Points(g, m); this.dust.frustumCulled = false; this.root.add(this.dust);

    // sparks in the corridor
    const sn = 80;
    const sg = new THREE.BufferGeometry();
    const sp = new Float32Array(sn * 3); this.sparkVel = new Float32Array(sn * 3); this.sparkLife = new Float32Array(sn);
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.sparks = new THREE.Points(sg, new THREE.PointsMaterial({ color: new THREE.Color(3, 1.8, 0.6), size: 0.04, map: M.softDot, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.sparks.frustumCulled = false;
    this.root.add(this.sparks);
    this._sparkTimer = 0;
  }

  update(t, dt, camera) {
    this.updaters.forEach((u) => u(t, dt, camera));
    // doors
    const gd = this.glassDoor;
    gd.openAmt += (gd.target - gd.openAmt) * (1 - Math.exp(-dt * (gd.fast ? 14 : 3)));
    gd.group.position.x = gd.openAmt * 1.85;
    const sd = this.storageDoor;
    const rate = sd.rate ?? 3;
    sd.openAmt += Math.sign(sd.target - sd.openAmt) * Math.min(Math.abs(sd.target - sd.openAmt), dt * rate * 0.25);
    sd.group.position.z = -sd.openAmt * 2.0;
    // lights animation
    const L = this.lights;
    if (this.area === 'Q') {
      const ang = t * 2.4;
      L.cBeaconA.target.position.set(-4 + Math.cos(ang) * 4, 0, 6.7 + Math.sin(ang) * 3);
      L.cBeaconB.target.position.set(5 + Math.cos(-ang + 1) * 4, 0, 6.7 + Math.sin(-ang + 1) * 3);
      const fl = Math.random() < 0.08 ? Math.random() * 0.2 : 1;
      L.cFlicker.intensity = 6 * fl * (0.8 + 0.2 * Math.sin(t * 40));
      if (this.redAlert) L.qRed.intensity = 3 + 7 * Math.pow(Math.max(0, Math.sin(t * 2.5)), 2);
      else L.qRed.intensity = 0;
    }
    if (this.area === 'S' || this.area === 'D') {
      L.sHall.intensity = 7 * (0.85 + 0.15 * Math.sin(t * 1.3)) * (Math.random() < 0.03 ? 0.4 : 1);
    }
    // dust follows area
    const off = this.area === 'Q' ? [0, 0, 0] : this.area === 'D' ? [0, -1.5, -1] : [0, -4.6, -1];
    this.dust.material.uniforms.uOffset.value.set(...off);
    this.dust.material.uniforms.uTime.value = t;
    this.dust.material.uniforms.uColor.value.set(...(this.area === 'S' ? [1, 0.85, 0.6] : [0.75, 0.85, 1.0]));
    // sparks
    if (this.area === 'Q') this._updateSparks(dt);
  }

  _updateSparks(dt) {
    const pos = this.sparks.geometry.attributes.position.array;
    this._sparkTimer -= dt;
    const burst = this._sparkTimer < 0;
    if (burst) this._sparkTimer = 0.6 + Math.random() * 2.2;
    for (let i = 0; i < this.sparkLife.length; i++) {
      if (this.sparkLife[i] <= 0) {
        if (burst && Math.random() < 0.35) {
          this.sparkLife[i] = 0.5 + Math.random() * 0.7;
          pos[i * 3] = this.sparkOrigin.x; pos[i * 3 + 1] = this.sparkOrigin.y; pos[i * 3 + 2] = this.sparkOrigin.z;
          this.sparkVel[i * 3] = (Math.random() - 0.5) * 2; this.sparkVel[i * 3 + 1] = Math.random() * 1.5; this.sparkVel[i * 3 + 2] = (Math.random() - 0.5) * 2;
        } else { pos[i * 3 + 1] = -100; continue; }
      }
      this.sparkLife[i] -= dt;
      this.sparkVel[i * 3 + 1] -= 9.8 * dt;
      pos[i * 3] += this.sparkVel[i * 3] * dt; pos[i * 3 + 1] += this.sparkVel[i * 3 + 1] * dt; pos[i * 3 + 2] += this.sparkVel[i * 3 + 2] * dt;
      if (pos[i * 3 + 1] < 0.01) { pos[i * 3 + 1] = 0.01; this.sparkVel[i * 3 + 1] *= -0.3; this.sparkVel[i * 3] *= 0.6; this.sparkVel[i * 3 + 2] *= 0.6; }
    }
    this.sparks.geometry.attributes.position.needsUpdate = true;
  }

  setCrack(level) {
    const v = Math.max(0, Math.min(1, level));
    this.crack.material.opacity = v * 0.85;
    this.crack.scale.setScalar(0.3 + v * 0.9);
    this.crack2.scale.setScalar(0.3 + v * 0.9);
  }
}
