import * as THREE from 'three';
import { getMaterials, tiled, screenTex } from './materials.js';
import { AREAS } from './station.js';
import { buildControlRoom, buildGuideLine } from './ledwall.js';

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
      [32.25, 33.75, -6.6, -5.4],      // docking section door
      [29.3, 36.7, -12.3, -6.3],       // docking bay
      [32.45, 33.55, -13.2, -12.0],    // airlock door
      [29.3, 36.7, -15.7, -12.95],     // decompression chamber
      [28.0, 29.6, -10.75, -9.75],     // cargo annex door
      [24.9, 28.6, -11.9, -8.6],       // cargo annex
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
  st._stencilWall(D, 'DOCKING SECTION ▲', 33, Y0 + 2.62, -5.99, 0, 2.4);
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
  // LED video walls, holo-table, light bars
  st.ctrlRoom = buildControlRoom(st, D, Y0);
  // Level 2 guide: blue line from the storage door to the control room, amber spur to the fuse alcove
  st.guideLine = buildGuideLine([[6.6, 0], [14.2, 0], [28.4, 0], [29.6, 0]], Y0 + 0.015, 0x3fb8ff); D.add(st.guideLine);
  st.guideFuse = buildGuideLine([[20, 0.25], [20, 1.75]], Y0 + 0.016, 0xffb547); D.add(st.guideFuse);
  // ---------- docking section (Level 4): bay, decompression chamber + ARES-1 hatch, cargo annex
  st.box(8.2, 0.2, 10.2, wm(M.floor, 4, 5), 33, Y0 - 0.1, -11, D, { cam: false });
  st.box(8.2, 0.2, 10.2, wm(M.ceiling, 4, 5), 33, Y0 + H + 0.1, -11, D, { cam: false });
  st.box(0.2, H, 5.2, wall, 28.9, Y0 + H / 2, -13.5, D); st.box(0.2, H, 3.7, wall, 28.9, Y0 + H / 2, -7.75, D);
  st.box(0.2, H - 2.4, 1.3, wall, 28.9, Y0 + 2.4 + (H - 2.4) / 2, -10.25, D);
  st.box(0.2, H, 10.2, wall, 37.1, Y0 + H / 2, -11, D);
  st.box(8.2, H, 0.2, wall, 33, Y0 + H / 2, -16.1, D);
  // glass wall + sliding glass door between the bay and the chamber
  const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.18, roughness: 0.05, metalness: 0, transmission: 0, depthWrite: false });
  solid(3.4, 2.4, 0.08, glassMat, 30.6, Y0 + 1.2, -12.6); solid(3.4, 2.4, 0.08, glassMat, 35.4, Y0 + 1.2, -12.6);
  st.box(8.2, H - 2.4, 0.2, M.trim, 33, Y0 + 2.4 + (H - 2.4) / 2, -12.6, D, { cam: false });
  for (const x of [28.95, 32.3, 33.7, 37.05]) st.box(0.12, 2.4, 0.16, M.trim, x, Y0 + 1.2, -12.6, D, { cam: false });
  st.airlockDoor = st.box(1.4, 2.4, 0.06, glassMat, 33, Y0 + 1.2, -12.6, D, { cam: false });
  st.airlockObst = { minX: 32.3, maxX: 33.7, minZ: -12.75, maxZ: -12.45, minY: Y0, maxY: Y0 + 2.4 };
  st.setAirlock = (open) => { st.airlockDoor.position.x = 33 + (open ? 1.45 : 0); const i = obst.indexOf(st.airlockObst); if (!open && i < 0) obst.push(st.airlockObst); if (open && i >= 0) obst.splice(i, 1); };
  st.airlockLight = st.strip(1.2, 0.05, 0.03, M.stripRed.clone(), 33, Y0 + 2.5, -12.5, D);
  st._stencilWall(D, 'DECOMPRESSION CHAMBER', 33, Y0 + 2.62, -12.48, 0, 2.6);
  // ARES-1 hatch on the far wall
  const hatch = new THREE.Group(); hatch.position.set(33, Y0 + 1.3, -15.95); D.add(hatch);
  const ringM = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.12, 12, 48), M.chrome); hatch.add(ringM);
  st.shipHatch = new THREE.Mesh(new THREE.CircleGeometry(0.88, 48), new THREE.MeshStandardMaterial({ color: 0x0b1622, emissive: 0x1a4a5a, emissiveIntensity: 0.7, metalness: 0.6, roughness: 0.4 }));
  st.shipHatch.position.z = 0.02; hatch.add(st.shipHatch);
  st._stencilWall(D, 'ARES-1 · TRANSPORT', 33, Y0 + 2.62, -15.99, 0, 2.4);
  for (const x of [30, 36]) st.strip(0.04, 2.6, 0.04, M.stripAmber, x, Y0 + 1.3, -15.95, D);
  // space-suit rack in the chamber
  const rack = solid(1.6, 2.0, 0.5, M.darkMetal, 30.2, Y0 + 1.0, -15.6);
  void rack;
  for (const x of [29.7, 30.2, 30.7]) { const suit = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.75, 6, 12), new THREE.MeshStandardMaterial({ color: 0xe8e8e2, roughness: 0.6 })); suit.position.set(x, Y0 + 1.15, -15.25); D.add(suit); }
  st.suitSpot = new THREE.Vector3(30.2, Y0, -14.6);
  // the chamber's own work light (cold) and a dim amber emergency light in the bay
  const chL = new THREE.PointLight(0xbfe6ff, 6, 7, 1.6); chL.position.set(33, Y0 + 2.5, -14.3); D.add(chL);
  const bayL = new THREE.PointLight(0xffa54a, 3, 7, 1.8); bayL.position.set(33, Y0 + 2.6, -9.6); D.add(bayL);
  st.dockLights = [[chL, 6], [bayL, 3]];
  st.setDockLights = (on) => st.dockLights.forEach(([l, v]) => (l.intensity = on ? v : 0));
  st.setDockLights(false);
  st.chamberSpot = new THREE.Vector3(33, Y0, -13.7);
  // airlock control (bay side, far from the glass) + fuel umbilical console
  solid(0.4, 1.3, 0.6, M.trim, 36.75, Y0 + 0.65, -11.6);
  st.airlockPanelLight = st.strip(0.04, 0.3, 0.3, M.stripRed.clone(), 36.53, Y0 + 1.1, -11.6, D);
  st.airlockPanelSpot = new THREE.Vector3(36.0, Y0, -11.6);
  // cargo annex (west of the bay)
  st.box(4.4, 0.2, 3.9, floor, 26.75, Y0 - 0.1, -10.25, D, { cam: false });
  st.box(4.4, 0.2, 3.9, ceil, 26.75, Y0 + H + 0.1, -10.25, D, { cam: false });
  st.box(4.4, H, 0.2, wall, 26.75, Y0 + H / 2, -8.3, D); st.box(4.4, H, 0.2, wall, 26.75, Y0 + H / 2, -12.2, D);
  st.box(0.2, H, 3.9, wall, 24.6, Y0 + H / 2, -10.25, D);
  solid(0.9, 0.9, 0.9, M.crate, 25.3, Y0 + 0.45, -11.6); solid(0.8, 0.6, 0.8, M.crateOrange, 25.2, Y0 + 0.3, -8.9);
  st.annexDoor = st.box(0.14, 2.4, 1.3, wm(M.wallB, 1.3, 2.4), 28.9, Y0 + 1.2, -10.25, D);
  st.annexObst = { minX: 28.75, maxX: 29.05, minZ: -10.9, maxZ: -9.6, minY: Y0, maxY: Y0 + 2.4 };
  st.setAnnex = (closed) => { st.annexDoor.position.z = closed ? -10.25 : -11.5; const i = obst.indexOf(st.annexObst); if (closed && i < 0) obst.push(st.annexObst); if (!closed && i >= 0) obst.splice(i, 1); };
  st.annexLight = st.strip(0.04, 0.3, 0.3, M.stripAmber.clone(), 29.03, Y0 + 1.3, -11.3, D);
  st.annexPanelSpot = new THREE.Vector3(29.7, Y0, -11.3);
  st.beaconSpot = new THREE.Vector3(25.6, Y0, -10.25);
  st.beacon = new THREE.Group(); st.beacon.position.set(25.25, Y0, -10.25); D.add(st.beacon);
  st.beacon.add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.35, 12), M.crateOrange));
  st.beaconLamp = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff3b3b }));
  st.beaconLamp.position.y = 0.24; st.beacon.add(st.beaconLamp); st.beacon.position.y = Y0 + 0.17; st.beacon.visible = false;
  st._stencilWall(D, 'CARGO ANNEX 4', 26.75, Y0 + 2.5, -8.42, Math.PI, 1.8);
  st.setAirlock(false); st.setAnnex(false);
  st.zBarriers = [st.airlockObst, st.annexObst, st.bayDoorObst];
  // supplies (control room, north-west corner)
  solid(1.0, 1.1, 0.6, M.crateOrange, 29.0, Y0 + 0.55, 5.6); solid(0.8, 0.7, 0.6, M.crate, 30.0, Y0 + 0.35, 5.6);
  st.suppliesSpot = new THREE.Vector3(29.5, Y0, 4.7);
  // Level 3 bulkhead panels + the spine blast door
  const panel = (x, z, ry) => {
    const g = new THREE.Group(); g.position.set(x, Y0 + 1.3, z); g.rotation.y = ry; D.add(g);
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.08), M.trim));
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.02), new THREE.MeshStandardMaterial({ color: 0x220808, emissive: 0xff3b3b, emissiveIntensity: 1.2 }));
    l.position.set(0, 0.3, 0.05); g.add(l); return l.material;
  };
  st.l3Panels = {
    cargo: panel(34.3, -5.98, 0),
    passage: panel(28.12, -1.95, Math.PI / 2),
  };
  st.l3Spots = {
    ring: new THREE.Vector3(33.75, Y0, -2.25), lab: new THREE.Vector3(33.75, Y0, 3.45), cargo: new THREE.Vector3(34.3, Y0, -5.25),
    passage: new THREE.Vector3(28.75, Y0, -2.0), vent: new THREE.Vector3(31.3, Y0, -1.3),
  };
  st.fuelSpot = st.l3Spots.cargo;
  st.blastDoor = st.box(0.3, 2.4, 3.2, M.darkMetal, 28.3, Y0 + 1.2 + 2.4, 0, D, { cam: false });
  st.setBlast = (k) => { st.blastDoor.position.y = Y0 + 1.2 + 2.4 * (1 - k); };
  // breaker in storage (west wall)
  const brk = new THREE.Group(); brk.position.set(-5.93, Y0 + 1.25, 2.6); D.add(brk);
  brk.add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.8, 0.6), M.trim));
  st.breakerLever = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.32, 0.08), M.crateOrange); st.breakerLever.position.set(0.1, 0.12, 0); brk.add(st.breakerLever);
  st.breakerSpot = new THREE.Vector3(-5.2, Y0, 2.6);
  st._stencilWall(D, 'DECK 3 MAIN', -5.98, Y0 + 1.85, 2.6, Math.PI / 2, 1.0);
  D.visible = false;
  return D;
}
