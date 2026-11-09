import * as THREE from 'three';

/** Procedurally painted canvas textures — no external image files, so the game runs fully offline. */

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function rand(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

function tex(c, repeat = [1, 1], color = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 8;
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Sci-fi wall panel: albedo + roughness + bump in matching layouts. */
function panelSet(seed, base = '#c9d0d6', w = 512) {
  const r = rand(seed);
  const a = canvas(w, w), ra = canvas(w, w), b = canvas(w, w);
  const ac = a.getContext('2d'), rc = ra.getContext('2d'), bc = b.getContext('2d');
  ac.fillStyle = base; ac.fillRect(0, 0, w, w);
  rc.fillStyle = '#8a8a8a'; rc.fillRect(0, 0, w, w);
  bc.fillStyle = '#808080'; bc.fillRect(0, 0, w, w);
  // grime noise
  for (let i = 0; i < 2600; i++) {
    const x = r() * w, y = r() * w, s = r() * 3 + 0.5;
    ac.fillStyle = `rgba(${r() < 0.5 ? '40,45,50' : '255,255,255'},${r() * 0.05})`;
    ac.fillRect(x, y, s, s);
    rc.fillStyle = `rgba(${r() < 0.5 ? 0 : 255},${r() < 0.5 ? 0 : 255},${r() < 0.5 ? 0 : 255},0.06)`;
    rc.fillRect(x, y, s * 2, s * 2);
  }
  // panels
  const cells = [[0, 0, w, w * 0.5], [0, w * 0.5, w * 0.5, w * 0.5], [w * 0.5, w * 0.5, w * 0.5, w * 0.5]];
  cells.forEach(([x, y, cw, ch], i) => {
    const inset = 6;
    // seam
    bc.strokeStyle = '#303030'; bc.lineWidth = 6; bc.strokeRect(x + 3, y + 3, cw - 6, ch - 6);
    bc.strokeStyle = '#b0b0b0'; bc.lineWidth = 2; bc.strokeRect(x + 7, y + 7, cw - 14, ch - 14);
    ac.strokeStyle = 'rgba(20,25,30,0.55)'; ac.lineWidth = 3; ac.strokeRect(x + 3, y + 3, cw - 6, ch - 6);
    rc.strokeStyle = '#d0d0d0'; rc.lineWidth = 4; rc.strokeRect(x + 3, y + 3, cw - 6, ch - 6);
    // subtle panel tint variation
    ac.fillStyle = `rgba(${i % 2 ? '0,0,0' : '255,255,255'},0.035)`; ac.fillRect(x + inset, y + inset, cw - inset * 2, ch - inset * 2);
    // bolts
    [[x + 16, y + 16], [x + cw - 16, y + 16], [x + 16, y + ch - 16], [x + cw - 16, y + ch - 16]].forEach(([bx, by]) => {
      bc.fillStyle = '#e0e0e0'; bc.beginPath(); bc.arc(bx, by, 4, 0, 7); bc.fill();
      ac.fillStyle = 'rgba(60,65,70,0.8)'; ac.beginPath(); ac.arc(bx, by, 3.5, 0, 7); ac.fill();
      rc.fillStyle = '#404040'; rc.beginPath(); rc.arc(bx, by, 4, 0, 7); rc.fill();
    });
  });
  // vent slots on the top panel
  for (let i = 0; i < 9; i++) {
    const vx = w * 0.62 + i * 14, vy = w * 0.12;
    bc.fillStyle = '#202020'; bc.fillRect(vx, vy, 7, w * 0.18);
    ac.fillStyle = 'rgba(15,18,22,0.85)'; ac.fillRect(vx, vy, 7, w * 0.18);
  }
  // label
  ac.fillStyle = 'rgba(30,40,50,0.55)'; ac.font = 'bold 18px monospace';
  ac.fillText(`H7-${(seed * 37) % 900 + 100}`, 28, w * 0.5 - 22);
  // hazard stripe on lower-left panel
  ac.save(); ac.beginPath(); ac.rect(18, w - 46, w * 0.5 - 36, 22); ac.clip();
  for (let i = -2; i < 20; i++) { ac.fillStyle = i % 2 ? '#e8b020' : '#1a1a1a'; ac.beginPath(); ac.moveTo(18 + i * 20, w - 24); ac.lineTo(38 + i * 20, w - 46); ac.lineTo(58 + i * 20, w - 46); ac.lineTo(38 + i * 20, w - 24); ac.fill(); }
  ac.restore();
  return { map: tex(a), roughnessMap: tex(ra, [1, 1], false), bumpMap: tex(b, [1, 1], false) };
}

function floorSet(seed) {
  const w = 512, r = rand(seed);
  const a = canvas(w, w), b = canvas(w, w), ro = canvas(w, w);
  const ac = a.getContext('2d'), bc = b.getContext('2d'), rc = ro.getContext('2d');
  ac.fillStyle = '#3a4048'; ac.fillRect(0, 0, w, w);
  bc.fillStyle = '#808080'; bc.fillRect(0, 0, w, w);
  rc.fillStyle = '#707070'; rc.fillRect(0, 0, w, w);
  // diamond plate
  for (let y = 0; y < w; y += 32) for (let x = (y / 32) % 2 ? 16 : 0; x < w; x += 32) {
    bc.save(); bc.translate(x + 8, y + 8); bc.rotate((y / 32) % 2 ? 0.8 : -0.8);
    bc.fillStyle = '#c8c8c8'; bc.fillRect(-9, -2.5, 18, 5); bc.restore();
    ac.save(); ac.translate(x + 8, y + 8); ac.rotate((y / 32) % 2 ? 0.8 : -0.8);
    ac.fillStyle = 'rgba(200,210,220,0.13)'; ac.fillRect(-9, -2.5, 18, 5); ac.restore();
    rc.save(); rc.translate(x + 8, y + 8); rc.rotate((y / 32) % 2 ? 0.8 : -0.8);
    rc.fillStyle = '#404040'; rc.fillRect(-9, -2.5, 18, 5); rc.restore();
  }
  // seams
  [[0, 0, w, 6], [0, 0, 6, w]].forEach(([x, y, ww, hh]) => { bc.fillStyle = '#202020'; bc.fillRect(x, y, ww, hh); ac.fillStyle = '#15181c'; ac.fillRect(x, y, ww, hh); });
  // scuffs
  for (let i = 0; i < 60; i++) {
    ac.strokeStyle = `rgba(255,255,255,${r() * 0.05})`; ac.lineWidth = r() * 2;
    ac.beginPath(); const x = r() * w, y = r() * w; ac.moveTo(x, y); ac.lineTo(x + (r() - 0.5) * 80, y + (r() - 0.5) * 20); ac.stroke();
    rc.fillStyle = `rgba(0,0,0,${r() * 0.25})`; rc.fillRect(r() * w, r() * w, r() * 60, r() * 60);
  }
  return { map: tex(a), bumpMap: tex(b, [1, 1], false), roughnessMap: tex(ro, [1, 1], false) };
}

function gratingTex() {
  const w = 256, a = canvas(w, w), c = a.getContext('2d');
  c.fillStyle = '#000'; c.fillRect(0, 0, w, w);
  c.fillStyle = '#fff';
  for (let i = 0; i < w; i += 32) { c.fillRect(i, 0, 8, w); c.fillRect(0, i, w, 8); }
  const t = tex(a, [1, 1], false);
  return t;
}

function bloodTex(seed, drag = false) {
  const w = 512, r = rand(seed), a = canvas(w, w), c = a.getContext('2d');
  c.clearRect(0, 0, w, w);
  const blob = (x, y, rad, alpha) => {
    const g = c.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, `rgba(70,0,0,${alpha})`); g.addColorStop(0.6, `rgba(95,4,4,${alpha * 0.9})`); g.addColorStop(1, 'rgba(60,0,0,0)');
    c.fillStyle = g; c.beginPath(); c.arc(x, y, rad, 0, 7); c.fill();
  };
  blob(w / 2, w / 2, w * 0.22, 0.95);
  for (let i = 0; i < 40; i++) {
    const ang = r() * 6.28, d = r() * w * 0.4;
    blob(w / 2 + Math.cos(ang) * d, w / 2 + Math.sin(ang) * d, r() * 26 + 3, 0.9);
  }
  if (drag) {
    for (let i = 0; i < 30; i++) { c.fillStyle = `rgba(80,0,0,${0.5 * (1 - i / 30)})`; c.fillRect(w / 2 - 30 + r() * 10, w / 2 + i * 8, 60 - i, 10); }
  }
  // drips (for walls)
  for (let i = 0; i < 9; i++) {
    const x = w / 2 + (r() - 0.5) * w * 0.4, len = r() * w * 0.4;
    c.fillStyle = 'rgba(80,0,0,0.85)'; c.fillRect(x, w / 2, 3 + r() * 4, len);
    c.beginPath(); c.arc(x + 3, w / 2 + len, 5, 0, 7); c.fill();
  }
  const t = new THREE.CanvasTexture(a); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function handTex(seed) {
  const w = 256, r = rand(seed), a = canvas(w, w), c = a.getContext('2d');
  c.clearRect(0, 0, w, w);
  c.fillStyle = 'rgba(110,4,4,0.92)';
  c.save(); c.translate(128, 150); c.rotate((r() - 0.5) * 0.6);
  c.beginPath(); c.ellipse(0, 0, 38, 46, 0, 0, 7); c.fill();
  const fingers = [[-30, -50, 9, 40, -0.35], [-12, -66, 9, 48, -0.1], [6, -68, 9, 50, 0.05], [24, -58, 8, 42, 0.25], [44, -10, 9, 34, 1.0]];
  fingers.forEach(([x, y, fw, fl, rot]) => { c.save(); c.translate(x, y); c.rotate(rot); c.beginPath(); c.ellipse(0, 0, fw, fl / 2, 0, 0, 7); c.fill(); c.restore(); });
  // smear dragging downward
  for (let i = 0; i < 14; i++) { c.fillStyle = `rgba(100,0,0,${0.5 * (1 - i / 14)})`; c.fillRect(-30 + r() * 8, 40 + i * 6, 56 - i * 2, 7); }
  for (let i = 0; i < 4; i++) { const x = -25 + r() * 50, len = 30 + r() * 70; c.fillStyle = 'rgba(105,0,0,0.85)'; c.fillRect(x, 40, 3, len); c.beginPath(); c.arc(x + 1.5, 40 + len, 3.5, 0, 7); c.fill(); }
  c.restore();
  const t = new THREE.CanvasTexture(a); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function crackTex() {
  const w = 1024, a = canvas(w, w), c = a.getContext('2d');
  c.clearRect(0, 0, w, w);
  c.strokeStyle = 'rgba(230,245,255,0.9)'; c.lineCap = 'round';
  const r = rand(7);
  const branch = (x, y, ang, len, width, depth) => {
    if (depth > 5 || len < 8) return;
    let cx = x, cy = y;
    const steps = 6;
    c.lineWidth = width; c.beginPath(); c.moveTo(cx, cy);
    for (let i = 0; i < steps; i++) { ang += (r() - 0.5) * 0.5; cx += Math.cos(ang) * len / steps; cy += Math.sin(ang) * len / steps; c.lineTo(cx, cy); }
    c.stroke();
    const n = 1 + Math.floor(r() * 2.5);
    for (let i = 0; i < n; i++) branch(cx, cy, ang + (r() - 0.5) * 1.6, len * 0.62, width * 0.7, depth + 1);
  };
  for (let i = 0; i < 14; i++) branch(w / 2, w / 2, (i / 14) * 6.28 + r() * 0.3, 260 + r() * 120, 3, 0);
  // concentric rings
  for (let k = 1; k < 4; k++) {
    c.lineWidth = 1.2; c.beginPath();
    for (let i = 0; i <= 40; i++) { const an = (i / 40) * 6.28, rr = k * 70 + (r() - 0.5) * 22; const px = w / 2 + Math.cos(an) * rr, py = w / 2 + Math.sin(an) * rr; i ? c.lineTo(px, py) : c.moveTo(px, py); }
    c.stroke();
  }
  const t = new THREE.CanvasTexture(a); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function screenTex(lines, accent = '#5ff3ff', title = 'HELIOS-7') {
  const w = 512, h = 320, a = canvas(w, h), c = a.getContext('2d');
  const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#04131d'); g.addColorStop(1, '#020a10');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  c.strokeStyle = accent; c.globalAlpha = 0.5; c.strokeRect(10, 10, w - 20, h - 20); c.globalAlpha = 1;
  c.fillStyle = accent; c.font = 'bold 26px monospace'; c.fillText(title, 26, 50);
  c.font = '18px monospace';
  lines.forEach((l, i) => { c.fillStyle = l.startsWith('!') ? '#ff4040' : accent; c.globalAlpha = l.startsWith('!') ? 1 : 0.8; c.fillText(l.replace(/^!/, ''), 26, 90 + i * 30); });
  c.globalAlpha = 0.07; c.fillStyle = '#fff';
  for (let y = 0; y < h; y += 3) c.fillRect(0, y, w, 1);
  const t = new THREE.CanvasTexture(a); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function softDot() {
  const w = 64, a = canvas(w, w), c = a.getContext('2d');
  const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillRect(0, 0, w, w);
  const t = new THREE.CanvasTexture(a); return t;
}

function fabricTex() {
  const w = 256, a = canvas(w, w), c = a.getContext('2d');
  c.fillStyle = '#808080'; c.fillRect(0, 0, w, w);
  for (let y = 0; y < w; y += 4) { c.fillStyle = y % 8 ? '#8c8c8c' : '#747474'; c.fillRect(0, y, w, 2); }
  for (let x = 0; x < w; x += 4) { c.fillStyle = 'rgba(0,0,0,0.08)'; c.fillRect(x, 0, 2, w); }
  return tex(a, [6, 6], false);
}

let _cache = null;
export function getMaterials() {
  if (_cache) return _cache;
  const wallA = panelSet(3, '#8d969f');
  const wallB = panelSet(11, '#6f7881');
  const wallDark = panelSet(5, '#4a535c');
  const floor = floorSet(2);
  const grate = gratingTex();
  const fabric = fabricTex();

  const M = {
    wall: new THREE.MeshStandardMaterial({ ...wallA, color: 0xffffff, metalness: 0.35, roughness: 0.6, bumpScale: 1.4 }),
    wallB: new THREE.MeshStandardMaterial({ ...wallB, color: 0xffffff, metalness: 0.4, roughness: 0.55, bumpScale: 1.4 }),
    wallDark: new THREE.MeshStandardMaterial({ ...wallDark, color: 0xffffff, metalness: 0.6, roughness: 0.55, bumpScale: 1.6 }),
    floor: new THREE.MeshStandardMaterial({ ...floor, color: 0xffffff, metalness: 0.75, roughness: 0.5, bumpScale: 1.2 }),
    ceiling: new THREE.MeshStandardMaterial({ ...wallDark, color: 0x9aa4ad, metalness: 0.5, roughness: 0.7 }),
    trim: new THREE.MeshStandardMaterial({ color: 0x2b3138, metalness: 0.85, roughness: 0.32 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xd9e2ea, metalness: 1.0, roughness: 0.18 }),
    darkMetal: new THREE.MeshStandardMaterial({ color: 0x15191e, metalness: 0.8, roughness: 0.42 }),
    duct: new THREE.MeshStandardMaterial({ ...wallDark, color: 0x8a939c, metalness: 0.9, roughness: 0.38, bumpScale: 1.2 }),
    grate: new THREE.MeshStandardMaterial({ color: 0x3a434c, metalness: 0.9, roughness: 0.4, alphaMap: grate, transparent: false, alphaTest: 0.5, side: THREE.DoubleSide }),
    mattress: new THREE.MeshPhysicalMaterial({ color: 0xaab4bf, roughness: 0.9, sheen: 1, sheenColor: new THREE.Color(0x9fb3c8), sheenRoughness: 0.6, bumpMap: fabric, bumpScale: 0.6 }),
    blanket: new THREE.MeshPhysicalMaterial({ color: 0x24384f, roughness: 0.95, sheen: 1, sheenColor: new THREE.Color(0x5f86b0), sheenRoughness: 0.5, bumpMap: fabric, bumpScale: 0.8 }),
    pillow: new THREE.MeshPhysicalMaterial({ color: 0xf2f4f7, roughness: 0.95, sheen: 0.6, sheenColor: new THREE.Color(0xffffff) }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xbfe6ff, metalness: 0, roughness: 0.04, transmission: 0.0, transparent: true, opacity: 0.16, envMapIntensity: 2.0, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false }),
    window: new THREE.MeshPhysicalMaterial({ color: 0xaad8ff, roughness: 0.02, transparent: true, opacity: 0.06, clearcoat: 1, envMapIntensity: 1.5, depthWrite: false }),
    stripCyan: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x5ff3ff, emissiveIntensity: 1.5 }),
    stripWhite: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xeaf6ff, emissiveIntensity: 1.2 }),
    stripRed: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff1a1a, emissiveIntensity: 3 }),
    stripAmber: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffa526, emissiveIntensity: 1.8 }),
    stripGreen: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x3dff8a, emissiveIntensity: 1.8 }),
    crate: new THREE.MeshStandardMaterial({ ...wallB, color: 0x7d8a72, metalness: 0.5, roughness: 0.6 }),
    crateOrange: new THREE.MeshStandardMaterial({ ...wallB, color: 0xd2742a, metalness: 0.45, roughness: 0.55 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x111316, roughness: 0.9 }),
    plastic: new THREE.MeshStandardMaterial({ color: 0xb9c0c7, roughness: 0.35, metalness: 0.05 }),
    tabletScreen: new THREE.MeshStandardMaterial({ map: screenTex(['DECK MAP', 'SIGNAL: LOCAL', '!LAB B: BREACH', 'TOUCH TO WAKE'], '#5ff3ff', 'NAV-PAD'), emissive: 0xffffff, emissiveMap: null, emissiveIntensity: 0.0 }),
  };
  M.tabletScreen.emissiveMap = M.tabletScreen.map; M.tabletScreen.emissiveIntensity = 1.3;

  M.screens = {
    status: screenTex(['CREW QUARTERS 3-C', 'O2  21.0%   ✓', 'TEMP 21.4 C ✓', '!LOCKDOWN ACTIVE', '!LAB B CONTAINMENT FAIL'], '#5ff3ff', 'HAB STATUS'),
    alert: screenTex(['!BIOHAZARD', '!QUARANTINE PROTOCOL 9', '!DO NOT OPEN', 'AWAITING COMMAND...'], '#ff4040', '⚠ ALERT'),
    storage: screenTex(['STORAGE C-7', 'INVENTORY: 412 ITEMS', 'TOOLS / MED / EVA', 'DOOR: !OBSTRUCTED'], '#ffb547', 'LOGISTICS'),
  };
  M.blood = [bloodTex(1), bloodTex(2, true), bloodTex(3)].map((t) => new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.15, metalness: 0.1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
  M.hands = [11, 23, 37, 41].map((sd) => new THREE.MeshStandardMaterial({ map: handTex(sd), transparent: true, roughness: 0.25, depthWrite: false, side: THREE.DoubleSide }));
  M.crack = new THREE.MeshBasicMaterial({ map: crackTex(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  M.softDot = softDot();
  M.fabricBump = fabric;

  // tile sensible repeats
  [M.wall, M.wallB, M.wallDark].forEach((m) => [m.map, m.roughnessMap, m.bumpMap].forEach((t) => t && t.repeat.set(1, 1)));
  _cache = M;
  return M;
}

/** Clone a textured material with a world-scale repeat. */
export function tiled(mat, rx, ry) {
  const m = mat.clone();
  ['map', 'roughnessMap', 'bumpMap', 'normalMap'].forEach((k) => {
    if (m[k]) { m[k] = m[k].clone(); m[k].repeat.set(rx, ry); m[k].needsUpdate = true; }
  });
  return m;
}

export { screenTex };
