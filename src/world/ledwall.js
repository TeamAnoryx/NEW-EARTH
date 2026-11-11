import * as THREE from 'three';

/**
 * Control-room dressing for Deck 3: wall-sized LED monitors with live canvas content
 * (station schematic + infection spread, Earth feed, section status board, telemetry, camera
 * grid), a holo-table with a rotating station hologram, and the Level 2 floor guide line.
 *
 * Screens repaint at ~8 fps on small canvases to stay cheap on phones.
 */
const W = 512, H = 256;
const CYAN = '#5ff3ff', RED = '#ff4b4b', AMBER = '#ffb547', GREEN = '#3dff8a', DIM = 'rgba(95,243,255,.35)';

function makeCanvas(w = W, h = H) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  if (!g) console.warn('LED wall: 2D canvas unavailable (low memory?) — screen stays blank.');
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return { c, g, tex };
}

function frame(g, title, col = CYAN) {
  g.fillStyle = '#020910'; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(95,243,255,.08)'; g.lineWidth = 1;
  for (let x = 0; x < W; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  for (let y = 0; y < H; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  g.fillStyle = col; g.font = 'bold 15px monospace'; g.fillText(title, 14, 22);
  g.fillRect(14, 28, 120, 2);
}

const scanlines = (g, t) => {
  g.fillStyle = 'rgba(0,0,0,.18)';
  for (let y = (t * 40) % 4; y < H; y += 4) g.fillRect(0, y, W, 1);
};

/** Screen painters. `s` is the shared status object (station.ledState). */
const PAINT = {
  map(g, t, s) {
    frame(g, 'HELIOS-7 · STATION SCHEMATIC', CYAN);
    const cx = 256, cy = 140;
    g.strokeStyle = CYAN; g.lineWidth = 3;
    g.beginPath(); g.ellipse(cx, cy, 190, 80, 0, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 2; g.strokeStyle = DIM;
    for (let a = 0; a < 6; a++) { g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * 190, cy + Math.sin(a) * 80); g.stroke(); }
    g.fillStyle = '#0c2232'; g.beginPath(); g.arc(cx, cy, 26, 0, Math.PI * 2); g.fill(); g.strokeStyle = CYAN; g.stroke();
    const sections = [['HAB RING', 0.4, 'ring'], ['LAB WING', 2.2, 'lab'], ['CARGO', 3.6, 'cargo'], ['SPINE', 5.0, 'passage']];
    g.font = '11px monospace';
    for (const [name, a, key] of sections) {
      const x = cx + Math.cos(a) * 190, y = cy + Math.sin(a) * 80;
      const sealed = s.sealed[key], vented = s.o2 < 0.05;
      const pulse = 0.5 + 0.5 * Math.sin(t * 4 + a * 3);
      g.fillStyle = vented ? 'rgba(120,140,160,.5)' : sealed ? GREEN : `rgba(255,75,75,${0.35 + pulse * 0.5})`;
      g.beginPath(); g.arc(x, y, sealed ? 9 : 10 + pulse * 8, 0, Math.PI * 2); g.fill();
      g.fillStyle = sealed ? GREEN : '#ffd0d0'; g.fillText(`${name}${sealed ? ' ■ SEALED' : ''}`, x + 14, y + 4);
    }
    g.fillStyle = s.o2 < 0.05 ? GREEN : RED; g.font = 'bold 13px monospace';
    g.fillText(s.o2 < 0.05 ? 'BIOHAZARD CONTAINED · VACUUM' : `INFECTED SIGNATURES: ${s.infected}`, 14, H - 14);
    scanlines(g, t);
  },
  earth(g, t) {
    frame(g, 'EARTH · LIVE ORBITAL FEED', AMBER);
    const cx = 256, cy = 150, r = 92;
    const grd = g.createRadialGradient(cx - 30, cy - 30, 10, cx, cy, r);
    grd.addColorStop(0, '#2e6fa8'); grd.addColorStop(1, '#06182a');
    g.fillStyle = grd; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    g.save(); g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.clip();
    for (let i = 0; i < 14; i++) {
      const a = i * 2.39 + t * 0.15, rr = (i % 5) * 16 + 10;
      const x = cx + Math.cos(a) * rr * 1.2, y = cy + Math.sin(a * 1.3) * rr * 0.8;
      g.fillStyle = `rgba(255,60,60,${0.25 + 0.2 * Math.sin(t * 2 + i)})`;
      g.beginPath(); g.arc(x, y, 10 + (i % 4) * 6, 0, Math.PI * 2); g.fill();
    }
    g.restore();
    g.strokeStyle = 'rgba(140,200,255,.6)'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, r + 3, 0, Math.PI * 2); g.stroke();
    g.fillStyle = RED; g.font = 'bold 12px monospace';
    g.fillText('CONTAGION: GLOBAL', 330, 60); g.fillText('GROUND STATIONS: 0/41', 330, 78);
    g.fillStyle = AMBER; g.fillText('ARES COLONY · MARS', 330, 210); g.fillStyle = GREEN; g.fillText('STATUS: CLEAN', 330, 228);
    scanlines(g, t);
  },
  status(g, t, s) {
    frame(g, 'SECTION CONTROL · BULKHEADS / LIFE SUPPORT', GREEN);
    const rows = [['HABITAT RING', 'ring'], ['RESEARCH WING', 'lab'], ['CARGO / LOGISTICS', 'cargo'], ['SPINE PASSAGE', 'passage']];
    g.font = '14px monospace';
    rows.forEach(([n, k], i) => {
      const y = 62 + i * 34, on = s.sealed[k];
      g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(14, y - 18, W - 28, 26);
      g.fillStyle = '#d8eef8'; g.fillText(n, 24, y);
      g.fillStyle = on ? GREEN : (Math.sin(t * 6) > 0 ? RED : '#7a2020');
      g.fillText(on ? '■ SEALED' : '□ OPEN', 330, y);
    });
    g.fillStyle = '#d8eef8'; g.fillText('O2 · ALL SECTIONS', 24, 214);
    g.fillStyle = '#0d2230'; g.fillRect(200, 202, 280, 16);
    g.fillStyle = s.o2 > 0.5 ? CYAN : s.o2 > 0.05 ? AMBER : RED; g.fillRect(200, 202, 280 * s.o2, 16);
    g.fillStyle = '#fff'; g.font = 'bold 12px monospace'; g.fillText(`${Math.round(s.o2 * 21)}% O2`, 420, 240);
    scanlines(g, t);
  },
  telemetry(g, t) {
    frame(g, 'REACTOR · TELEMETRY', CYAN);
    const lines = [[CYAN, 1.3, 40], [AMBER, 2.1, 25], [GREEN, 0.7, 30]];
    lines.forEach(([c, f, amp], k) => {
      g.strokeStyle = c; g.lineWidth = 2; g.beginPath();
      for (let x = 0; x <= W; x += 6) {
        const y = 80 + k * 55 + Math.sin(x * 0.025 * f + t * 2 * f) * amp * 0.5 + Math.sin(x * 0.07 + t * 5) * 6;
        x ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.stroke();
    });
    g.fillStyle = CYAN; g.font = '12px monospace';
    g.fillText(`CORE TEMP ${(612 + Math.sin(t) * 4).toFixed(1)} K`, 14, H - 30);
    g.fillText(`ORBIT 408.${(Math.floor(t * 10) % 10)} KM · INCL 51.6°`, 14, H - 12);
    scanlines(g, t);
  },
  cams(g, t) {
    frame(g, 'SECURITY · CAMERA GRID', RED);
    const names = ['LAB B-2', 'HAB 3-C', 'MED BAY', 'SPINE L-2', 'DOCK A', 'CARGO 4'];
    names.forEach((n, i) => {
      const x = 14 + (i % 3) * 164, y = 40 + Math.floor(i / 3) * 104;
      g.fillStyle = '#071019'; g.fillRect(x, y, 152, 92);
      for (let k = 0; k < 60; k++) { g.fillStyle = `rgba(200,220,230,${Math.random() * 0.12})`; g.fillRect(x + Math.random() * 152, y + Math.random() * 92, 3, 2); }
      // silhouettes shuffling
      g.fillStyle = 'rgba(255,90,90,.55)';
      for (let k = 0; k < 2 + (i % 3); k++) { const sx = x + 20 + ((t * 8 * (k + 1) + i * 37) % 112); g.fillRect(sx, y + 40, 8, 34); g.beginPath(); g.arc(sx + 4, y + 36, 6, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = Math.sin(t * 3 + i) > 0 ? RED : '#7a2020'; g.beginPath(); g.arc(x + 140, y + 10, 4, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#cfe'; g.font = '10px monospace'; g.fillText(n, x + 6, y + 14);
    });
    scanlines(g, t);
  },
};

/**
 * Adds LED walls + holo-table to the control room. Returns { update(dt), setPower(on) }.
 * `place` = [painterName, x, y, z, rotY, width, height].
 */
export function buildControlRoom(st, D, Y0) {
  st.ledState ||= { sealed: { ring: false, lab: false, cargo: false, passage: false }, o2: 1, infected: 214 };
  const screens = [];
  const place = [
    ['map', 35.8, Y0 + 1.55, 5.97, Math.PI, 3.8, 1.8],
    ['status', 36.25, Y0 + 1.62, -5.97, 0, 2.9, 1.45],
    ['earth', 28.12, Y0 + 1.62, -4.0, Math.PI / 2, 3.1, 1.55],
    ['cams', 28.12, Y0 + 1.62, 3.8, Math.PI / 2, 3.6, 1.8],
    ['telemetry', 29.6, Y0 + 2.36, -5.97, 0, 1.9, 0.95],
  ];
  const bezelMat = new THREE.MeshStandardMaterial({ color: 0x0a0f15, metalness: 0.8, roughness: 0.35 });
  for (const [kind, x, y, z, ry, w, h] of place) {
    const { c, g, tex } = makeCanvas();
    const mat = new THREE.MeshBasicMaterial({ map: tex, color: 0x000000 });
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    scr.position.set(x, y, z); scr.rotation.y = ry; D.add(scr);
    const n = new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry));
    const bezel = new THREE.Mesh(new THREE.BoxGeometry(w + 0.14, h + 0.14, 0.06), bezelMat);
    bezel.position.set(x - n.x * 0.035, y, z - n.z * 0.035); bezel.rotation.y = ry; D.add(bezel);
    // thin glowing underline per screen
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.025), new THREE.MeshBasicMaterial({ color: 0x5ff3ff, transparent: true, opacity: 0 }));
    glow.position.set(x + n.x * 0.01, y - h / 2 - 0.09, z + n.z * 0.01); glow.rotation.y = ry; D.add(glow);
    screens.push({ kind, c, g, tex, mat, glow, on: 0 });
  }

  // holo-table with a rotating station hologram
  const holo = new THREE.Group(); holo.position.set(31.3, Y0, 0); D.add(holo);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.9, 0.85, 32), new THREE.MeshStandardMaterial({ color: 0x1a2430, metalness: 0.9, roughness: 0.3 }));
  base.position.y = 0.425; base.castShadow = base.receiveShadow = true; holo.add(base);
  const top = new THREE.Mesh(new THREE.CircleGeometry(0.72, 48), new THREE.MeshBasicMaterial({ color: 0x5ff3ff, transparent: true, opacity: 0.25 }));
  top.rotation.x = -Math.PI / 2; top.position.y = 0.86; holo.add(top);
  const hMat = new THREE.MeshBasicMaterial({ color: 0x5ff3ff, wireframe: true, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false });
  const station = new THREE.Group(); station.position.y = 1.35; holo.add(station);
  const ringH = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.06, 8, 32), hMat); ringH.rotation.x = Math.PI / 2; station.add(ringH);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.5, 10), hMat); station.add(hub);
  for (let i = 0; i < 4; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.02, 0.02), hMat); s.rotation.y = (i * Math.PI) / 4; station.add(s); }
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 0.9, 32, 1, true), new THREE.MeshBasicMaterial({ color: 0x5ff3ff, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
  beam.position.y = 1.32; holo.add(beam);
  st.obstacles.C.push({ minX: 30.5, maxX: 32.1, minZ: -0.8, maxZ: 0.8, minY: Y0, maxY: Y0 + 0.9 });

  let acc = 0, t = 0, power = 0, target = 0;
  const api = {
    setPower(on, instant = false) { target = on ? 1 : 0; if (instant) power = target; },
    update(dt, near = true) {
      t += dt; acc += dt;
      power += (target - power) * (1 - Math.exp(-dt * 3));
      const flick = power > 0.02 && power < 0.97 ? (Math.random() > 0.3 ? 1 : 0.3) : 1;
      const lvl = power * flick;
      station.rotation.y += dt * 0.5;
      hMat.opacity = 0.6 * lvl; beam.material.opacity = 0.08 * lvl; top.material.opacity = 0.12 * lvl;
      for (const s of screens) {
        s.mat.color.setScalar(lvl); s.glow.material.opacity = 0.8 * lvl;
      }
      if (acc < 0.2 || power < 0.02 || !near) return; // ~5 fps repaint, only when you can see them
      acc = 0;
      for (const s of screens) {
        if (!s.g || !PAINT[s.kind]) continue;
        try { PAINT[s.kind](s.g, t, st.ledState); s.tex.needsUpdate = true; }
        catch (e) { console.warn(`LED wall "${s.kind}" paint failed; disabling it:`, e?.message || e); s.g = null; }
      }
    },
  };
  return api;
}

/**
 * Glowing floor guide line along a polyline (x,z pairs) — pulses flow towards the end point.
 * Returns a Group with userData.update(dt).
 */
export function buildGuideLine(points, y, color = 0x3fb8ff) {
  const g = new THREE.Group();
  const uniforms = { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uFade: { value: 0 } };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    vertexShader: 'varying vec2 vUv; varying float vD; attribute float aDist; void main(){ vUv = uv; vD = aDist; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float uTime; uniform vec3 uColor; uniform float uFade; varying vec2 vUv; varying float vD;
      void main(){
        float across = 1.0 - abs(vUv.y * 2.0 - 1.0);
        float core = smoothstep(0.55, 0.95, across);
        float halo = pow(across, 2.0) * 0.45;
        float flow = 0.55 + 0.45 * smoothstep(0.75, 1.0, fract(vD * 0.45 - uTime * 0.9));
        vec3 c = uColor * (core * 2.2 + halo) * flow;
        gl_FragColor = vec4(c, (core + halo) * flow * uFade);
      }`,
  });
  let dist = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, az] = points[i], [bx, bz] = points[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const geo = new THREE.PlaneGeometry(len + 0.3, 0.55, 1, 1);
    const d = new Float32Array(4); // vertex order: (-x,+y),(+x,+y),(-x,-y),(+x,-y) in plane space
    d[0] = d[2] = dist; d[1] = d[3] = dist + len;
    geo.setAttribute('aDist', new THREE.BufferAttribute(d, 1));
    const m = new THREE.Mesh(geo, mat);
    m.rotation.order = 'YXZ';
    m.rotation.y = -Math.atan2(bz - az, bx - ax); m.rotation.x = -Math.PI / 2;
    m.position.set((ax + bx) / 2, y, (az + bz) / 2);
    m.renderOrder = 2;
    g.add(m);
    dist += len;
  }
  g.visible = false;
  g.userData.update = (dt) => { uniforms.uTime.value += dt; uniforms.uFade.value += ((g.userData.on ? 1 : 0) - uniforms.uFade.value) * (1 - Math.exp(-dt * 2)); g.visible = uniforms.uFade.value > 0.01; };
  g.userData.show = (on) => { g.userData.on = on; if (on) g.visible = true; };
  return g;
}
