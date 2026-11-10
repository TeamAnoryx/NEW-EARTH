import * as THREE from 'three';
import { getMaterials, tiled, screenTex } from './materials.js';
import { AREAS } from './station.js';

/**
 * Levels 2–3 world: the Logistics Spine beyond Storage C-7, the fuse alcove, the Control Room
 * (comms array + Earth window) and the Escape Pod Bay. Area 'C' (floor y = -4.6).
 *   storage [-6,6]×[-6,4] → door x=6 → hallway [6.2,14.2]×[-5,5] → spine [14.2,28]×[-1.5,1.5]
 *   → control room [28,38]×[-6,6] → pod bay [29,37]×[-16,-6]
 */
const Y0 = -4.6, H = 2.9;
const SCREEN_TEXT = {
  NAV: ['ORBIT 408.2 KM', 'INCL 51.6°', 'ESCAPE PODS: 1 READY', '!EP-1/2/4 OFFLINE'],
  COMMS: ['ARRAY: DISH 2', 'UPLINK: SEARCHING', 'GROUND: KESTREL?', '!ENCRYPTION OFF'],
  POWER: ['AUX BUS: ONLINE', 'MAIN BUS: !OFFLINE', 'DECK 3: BLACKOUT', 'LIFE SUPPORT: OK'],
};


export function buildDeck(st) {
  // registered here (not at module load) to avoid the station.js ⇄ deck.js import cycle
  AREAS.C = {
    floorY: Y0, ceilY: -1.72,
    walk: [
      [-5.7, 5.7, -5.7, 3.7],          // storage
      [5.4, 6.8, -0.72, 0.72],         // storage door
      [6.5, 13.9, -4.7, 4.7],          // hallway
      [13.6, 28.6, -1.22, 1.22],       // spine
      [19.3, 20.7, 0.9, 2.65],         // fuse alcove
      [28.3, 37.7, -5.7, 5.7],         // control room
      [32.25, 33.75, -6.6, -5.4],      // bay door
      [29.3, 36.7, -15.7, -6.3],       // pod bay
    ],
  };
  const M = getMaterials();
  const D = (st.deck = new THREE.Group()); st.root.add(D);
  const wm = (base, w, h) => tiled(base, Math.max(1, w / 2.4), Math.max(1, h / 2.4));
  const obst = (st.obstacles.C = []);
  const solid = (w, h, d, mat, x, y, z, collide = true) => {
    const m = st.box(w, h, d, mat, x, y, z, D);
    if (collide) obst.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, minY: y - h / 2, maxY: y + h / 2 });
    return m;
  };
  const floor = wm(M.floor, 6, 2), ceil = wm(M.ceiling, 6, 2), wall = wm(M.wallDark, 6, 2.4);

  // ---------- spine corridor
  st.box(14, 0.2, 3.2, floor, 21.1, Y0 - 0.1, 0, D, { cam: false });
  st.box(14, 0.2, 3.2, ceil, 21.1, Y0 + H + 0.1, 0, D, { cam: false });
  st.box(5.6, H, 0.2, wall, 16.9, Y0 + H / 2, 1.6, D);
  st.box(7.3, H, 0.2, wall, 24.45, Y0 + H / 2, 1.6, D);
  st.box(14, H, 0.2, wall, 21.1, Y0 + H / 2, -1.6, D);
  for (let x = 15; x <= 27; x += 2.4) { st.box(0.18, H, 0.2, M.trim, x, Y0 + H / 2, 1.45, D, { cam: false }); st.box(0.18, H, 0.2, M.trim, x, Y0 + H / 2, -1.45, D, { cam: false }); }
  st.strip(14, 0.03, 0.03, M.stripRed, 21.1, Y0 + 0.05, -1.48, D);
  st.strip(14, 0.03, 0.03, M.stripRed, 21.1, Y0 + 0.05, 1.48, D);
  // debris and a toppled cart (cover)
  solid(1.0, 0.6, 0.6, M.crateOrange, 17.4, Y0 + 0.3, -0.9);
  solid(0.8, 0.5, 0.5, M.crate, 23.6, Y0 + 0.25, 0.95);
  st.decal(M.blood[1], 21.5, Y0 + 0.004, 0.2, 1.6, -Math.PI / 2, 1.1, D);
  st.decal(M.blood[0], 26.0, Y0 + 0.004, -0.4, 1.3, -Math.PI / 2, 2.4, D);
  // fuse alcove + locker
  st.box(1.6, 0.2, 1.4, floor, 20, Y0 - 0.1, 2.3, D, { cam: false });
  st.box(1.6, 0.2, 1.4, ceil, 20, Y0 + H + 0.1, 2.3, D, { cam: false });
  st.box(0.2, H, 1.4, wall, 19.1, Y0 + H / 2, 2.3, D); st.box(0.2, H, 1.4, wall, 20.9, Y0 + H / 2, 2.3, D);
  st.box(1.6, H, 0.2, wall, 20, Y0 + H / 2, 3.05, D);
  const fuseLocker = solid(0.9, 1.6, 0.4, M.crateOrange, 20, Y0 + 0.8, 2.75);
  st.fuseLight = st.strip(0.5, 0.04, 0.02, M.stripAmber.clone(), 20, Y0 + 1.4, 2.54, D);
  st.fuseSpot = new THREE.Vector3(20, Y0, 1.9);
  void fuseLocker;
  st._stencilWall(D, 'FUSE · AUX', 20, Y0 + 2.2, 2.94, Math.PI, 1.2);

  // ---------- control room
  st.box(10.2, 0.2, 12.2, wm(M.floor, 5, 6), 33, Y0 - 0.1, 0, D, { cam: false });
  st.box(10.2, 0.2, 12.2, wm(M.ceiling, 5, 6), 33, Y0 + H + 0.1, 0, D, { cam: false });
  st.box(0.2, H, 4.6, wall, 28, Y0 + H / 2, -3.8, D); st.box(0.2, H, 4.6, wall, 28, Y0 + H / 2, 3.8, D);
  st.box(0.2, H - 2.4, 3, wall, 28, Y0 + 2.4 + (H - 2.4) / 2, 0, D);
  st.box(10.2, H, 0.2, wall, 33, Y0 + H / 2, 6.1, D);
  st.box(4.2, H, 0.2, wall, 30.1, Y0 + H / 2, -6.1, D); st.box(4.2, H, 0.2, wall, 35.9, Y0 + H / 2, -6.1, D);
  st.box(1.6, H - 2.4, 0.2, wall, 33, Y0 + 2.4 + (H - 2.4) / 2, -6.1, D);
  // east wall: panoramic window onto Earth
  st.box(0.3, 0.9, 12.2, wall, 38.1, Y0 + 0.45, 0, D); st.box(0.3, 0.6, 12.2, wall, 38.1, Y0 + H - 0.3, 0, D);
  for (const z of [-6, -3, 0, 3, 6]) st.box(0.3, 1.5, 0.25, M.trim, 38.05, Y0 + 1.65, z, D, { cam: false });
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(12, 1.5), M.window); glass.position.set(38.0, Y0 + 1.65, 0); glass.rotation.y = -Math.PI / 2; D.add(glass);
  // control-room doors (spine side + bay side) — the spine door can be sealed
  st.ctrlDoor = st.box(0.16, 2.4, 3.0, wm(M.wallB, 2, 2.4), 28, Y0 + 1.2, 0, D);
  st.ctrlDoorObst = { minX: 27.8, maxX: 28.2, minZ: -1.5, maxZ: 1.5, minY: Y0, maxY: Y0 + 2.4 };
  st.setCtrlDoor = (closed) => { st.ctrlDoor.position.z = closed ? 0 : 2.9; const i = obst.indexOf(st.ctrlDoorObst); if (closed && i < 0) obst.push(st.ctrlDoorObst); if (!closed && i >= 0) obst.splice(i, 1); };
  st.bayDoor = st.box(1.6, 2.4, 0.16, wm(M.wallB, 1.6, 2.4), 33, Y0 + 1.2, -6.1, D);
  st.bayDoorObst = { minX: 32.2, maxX: 33.8, minZ: -6.3, maxZ: -5.9, minY: Y0, maxY: Y0 + 2.4 };
  st.setBayDoor = (open) => { st.bayDoor.position.x = 33 + (open ? 1.7 : 0); const i = obst.indexOf(st.bayDoorObst); if (!open && i < 0) obst.push(st.bayDoorObst); if (open && i >= 0) obst.splice(i, 1); };
  st.setCtrlDoor(false); st.setBayDoor(false);
  st._stencilWall(D, 'CONTROL · DECK 3', 33, Y0 + 2.55, 6.0, Math.PI, 2.6);
  st._stencilWall(D, 'ESCAPE POD BAY ▲', 33, Y0 + 2.62, -5.99, 0, 2.4);
  // consoles in an arc facing the window, comms array, genesis vault
  st.consoleScreens = [];
  const consoleAt = (x, z, ry, label, k) => {
    const g = new THREE.Group(); g.position.set(x, Y0, z); g.rotation.y = ry; D.add(g);
    const desk = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.9, 0.8), M.trim); desk.position.y = 0.45; desk.castShadow = desk.receiveShadow = true; g.add(desk);
    const tex = screenTex(SCREEN_TEXT[label] || ['STANDBY'], '#5ff3ff', label);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.62), new THREE.MeshStandardMaterial({ color: 0x050a10, map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0, roughness: 0.3 }));
    scr.position.set(0, 1.35, -0.18); scr.rotation.x = -0.2; g.add(scr);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.72, 0.05), M.darkMetal); frame.position.set(0, 1.35, -0.21); frame.rotation.x = -0.2; g.add(frame);
    st.consoleScreens.push(scr.material);
    const c = Math.cos(ry), sn = Math.sin(ry), hx = Math.abs(c) * 0.8 + Math.abs(sn) * 0.4, hz = Math.abs(sn) * 0.8 + Math.abs(c) * 0.4;
    obst.push({ minX: x - hx, maxX: x + hx, minZ: z - hz, maxZ: z + hz, minY: Y0, maxY: Y0 + 0.9 });
    st.camColliders.push(desk);
    void label; void k;
    return g;
  };
  consoleAt(34.6, -2.4, -Math.PI / 2 + 0.3, 'NAV');
  consoleAt(35.0, 0.6, -Math.PI / 2, 'COMMS');
  consoleAt(34.6, 3.6, -Math.PI / 2 - 0.3, 'POWER');
  st.commsSpot = new THREE.Vector3(33.9, Y0, 0.6);
  st.fuseSocketSpot = new THREE.Vector3(30.2, Y0, -4.6);
  solid(0.7, 1.8, 0.5, M.darkMetal, 29.0, Y0 + 0.9, -5.6);       // aux power cabinet
  st.auxLight = st.strip(0.4, 0.04, 0.02, M.stripRed.clone(), 29.0, Y0 + 1.5, -5.33, D);
  // Genesis vault
  const vault = solid(1.2, 1.4, 0.6, M.chrome, 31.5, Y0 + 0.7, 5.6);
  st.vaultGlow = st.strip(0.9, 0.06, 0.02, M.stripGreen.clone(), 31.5, Y0 + 1.2, 5.29, D);
  st.vaultSpot = new THREE.Vector3(31.5, Y0, 4.7);
  void vault;
  // ---------- escape pod bay
  st.box(8.2, 0.2, 10.2, wm(M.floor, 4, 5), 33, Y0 - 0.1, -11, D, { cam: false });
  st.box(8.2, 0.2, 10.2, wm(M.ceiling, 4, 5), 33, Y0 + H + 0.1, -11, D, { cam: false });
  st.box(0.2, H, 10.2, wall, 28.9, Y0 + H / 2, -11, D); st.box(0.2, H, 10.2, wall, 37.1, Y0 + H / 2, -11, D);
  st.box(8.2, H, 0.2, wall, 33, Y0 + H / 2, -16.1, D);
  const pod = new THREE.Group(); pod.position.set(33, Y0 + 1.3, -14.4); D.add(pod);
  const shell = new THREE.Mesh(new THREE.CapsuleGeometry(1.1, 1.6, 10, 24), M.chrome); shell.rotation.z = Math.PI / 2; shell.castShadow = true; pod.add(shell);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(1.12, 1.12, 0.25, 32, 1, true), M.stripCyan); band.rotation.z = Math.PI / 2; pod.add(band);
  st.podHatch = new THREE.Mesh(new THREE.CircleGeometry(0.6, 32), new THREE.MeshStandardMaterial({ color: 0x0b1622, emissive: 0x1a4a5a, emissiveIntensity: 0.6 }));
  st.podHatch.position.set(0, 0, 1.12); pod.add(st.podHatch);
  st.pod = pod;
  obst.push({ minX: 30.9, maxX: 35.1, minZ: -15.6, maxZ: -13.3, minY: Y0, maxY: Y0 + 2.4 });
  st.podSpot = new THREE.Vector3(33, Y0, -12.6);
  st._stencilWall(D, 'EP-3', 33, Y0 + 2.6, -15.99, 0, 1.2);
  for (const x of [30, 36]) { const l = st.strip(0.04, 2.6, 0.04, M.stripAmber, x, Y0 + 1.3, -15.95, D); void l; }
  // breaker in storage (west wall)
  const brk = new THREE.Group(); brk.position.set(-5.93, Y0 + 1.25, 2.6); D.add(brk);
  brk.add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.8, 0.6), M.trim));
  st.breakerLever = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.32, 0.08), M.crateOrange); st.breakerLever.position.set(0.1, 0.12, 0); brk.add(st.breakerLever);
  st.breakerSpot = new THREE.Vector3(-5.2, Y0, 2.6);
  st._stencilWall(D, 'DECK 3 MAIN', -5.98, Y0 + 1.85, 2.6, Math.PI / 2, 1.0);
  D.visible = false;
  return D;
}
