import * as THREE from 'three';

const NOISE = /* glsl */`
  vec3 hash3(vec3 p) {
    p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
  }
  float noise(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(dot(hash3(i + vec3(0,0,0)), f - vec3(0,0,0)), dot(hash3(i + vec3(1,0,0)), f - vec3(1,0,0)), u.x),
                   mix(dot(hash3(i + vec3(0,1,0)), f - vec3(0,1,0)), dot(hash3(i + vec3(1,1,0)), f - vec3(1,1,0)), u.x), u.y),
               mix(mix(dot(hash3(i + vec3(0,0,1)), f - vec3(0,0,1)), dot(hash3(i + vec3(1,0,1)), f - vec3(1,0,1)), u.x),
                   mix(dot(hash3(i + vec3(0,1,1)), f - vec3(0,1,1)), dot(hash3(i + vec3(1,1,1)), f - vec3(1,1,1)), u.x), u.y), u.z);
  }
  float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 6; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
`;

/** Procedural Earth: continents, oceans with sun glint, ice caps, moving clouds, night-side city lights, atmosphere. */
export function createEarth(radius = 600, clouds = 1.0, detail = 1.0) {
  const group = new THREE.Group();
  const sunDir = new THREE.Vector3(1, 0.25, 0.35).normalize();
  const uniforms = { uTime: { value: 0 }, uSun: { value: sunDir }, uCamPos: { value: new THREE.Vector3() }, uClouds: { value: clouds }, uDetail: { value: detail } };

  const surface = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */`
      varying vec3 vN; varying vec3 vP; varying vec3 vW;
      void main() { vP = position; vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }
    `,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform vec3 uSun; uniform vec3 uCamPos; uniform float uClouds; uniform float uDetail;
      varying vec3 vN; varying vec3 vP; varying vec3 vW;
      ${NOISE}
      void main() {
        vec3 p0 = normalize(vP); vec3 p = p0 * uDetail;
        float h = fbm(p * 2.2) + 0.45 * fbm(p * 5.0 + 3.1);
        float land = smoothstep(0.08, 0.12, h);
        float lat = abs(p0.y);
        vec3 ocean = mix(vec3(0.005, 0.04, 0.14), vec3(0.02, 0.16, 0.36), smoothstep(-0.3, 0.1, h));
        vec3 green = vec3(0.07, 0.16, 0.05), desert = vec3(0.42, 0.33, 0.18), rock = vec3(0.22, 0.2, 0.17);
        float dry = smoothstep(0.1, 0.5, fbm(p * 3.0 + 7.0) + (0.35 - abs(lat - 0.3)));
        vec3 landC = mix(green, desert, dry);
        landC = mix(landC, rock, smoothstep(0.35, 0.6, h));
        vec3 col = mix(ocean, landC, land);
        float ice = smoothstep(0.78, 0.86, lat + fbm(p * 6.0) * 0.08);
        col = mix(col, vec3(0.85, 0.9, 0.95), ice);
        // clouds (animated)
        vec3 cp = p * 3.0 + vec3(uTime * 0.004, 0.0, uTime * 0.002);
        float cl = clamp(smoothstep(0.12 - 0.12 * (uClouds - 1.0), 0.62, fbm(cp) + 0.35 * fbm(cp * 3.0) + 0.2 * fbm(cp * 9.0)) * 0.85 * uClouds, 0.0, 1.0);
        vec3 N = normalize(vN);
        float d = dot(N, uSun);
        float day = smoothstep(-0.15, 0.25, d);
        vec3 V = normalize(uCamPos - vW);
        vec3 H = normalize(uSun + V);
        float spec = pow(max(dot(N, H), 0.0), 60.0) * (1.0 - land) * (1.0 - cl) * 1.4;
        vec3 lit = col * (0.03 + 1.1 * max(d, 0.0)) + vec3(1.0, 0.9, 0.7) * spec * day;
        lit = mix(lit, vec3(0.95, 0.97, 1.0) * (0.04 + 0.95 * max(d, 0.0)), cl * 0.9);
        // city lights on night side
        float city = smoothstep(0.55, 0.85, noise(p * 90.0) * 0.5 + 0.5) * land * (1.0 - ice) * smoothstep(0.2, 0.6, fbm(p * 8.0) + 0.4);
        lit += vec3(1.0, 0.62, 0.28) * city * (1.0 - day) * (1.0 - cl * 0.8) * 1.6;
        // terminator warm band
        lit += vec3(0.6, 0.25, 0.05) * smoothstep(0.2, 0.0, abs(d)) * 0.08;
        // rim atmosphere tint
        float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
        lit += vec3(0.25, 0.55, 1.0) * fres * (0.2 + day) * 0.8;
        gl_FragColor = vec4(lit, 1.0);
      }
    `,
  });
  const earth = new THREE.Mesh(new THREE.SphereGeometry(radius, 128, 96), surface);
  group.add(earth);

  const atmo = new THREE.ShaderMaterial({
    uniforms,
    transparent: true, blending: THREE.AdditiveBlending, side: THREE.BackSide, depthWrite: false,
    vertexShader: /* glsl */`
      varying vec3 vN; varying vec3 vW;
      void main() { vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }
    `,
    fragmentShader: /* glsl */`
      uniform vec3 uSun; uniform vec3 uCamPos; varying vec3 vN; varying vec3 vW;
      void main() {
        vec3 V = normalize(uCamPos - vW);
        float rim = pow(1.0 - abs(dot(normalize(vN), V)), 2.2);
        float day = smoothstep(-0.4, 0.5, dot(normalize(vN), uSun));
        vec3 c = mix(vec3(0.05, 0.15, 0.6), vec3(0.35, 0.65, 1.0), day);
        gl_FragColor = vec4(c * rim * (0.25 + day * 1.6), rim);
      }
    `,
  });
  const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.035, 96, 64), atmo);
  group.add(atmosphere);

  group.userData.update = (t, camera) => {
    uniforms.uTime.value = t;
    earth.rotation.y = t * 0.004;
    camera.getWorldPosition(uniforms.uCamPos.value);
  };
  group.userData.sunDir = sunDir;
  return group;
}

export function createStars(count = 6000, radius = 1800) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3), size = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    pos.set([Math.cos(th) * s * radius, u * radius, Math.sin(th) * s * radius], i * 3);
    const tint = Math.random();
    const c = tint < 0.15 ? [1, 0.8, 0.6] : tint < 0.35 ? [0.7, 0.85, 1] : [1, 1, 1];
    const b = 0.4 + Math.pow(Math.random(), 3) * 1.6;
    col.set(c.map((v) => v * b), i * 3);
    size[i] = 1 + Math.pow(Math.random(), 6) * 4;
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('size', new THREE.BufferAttribute(size, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute float size; attribute vec3 color; varying vec3 vC; uniform float uTime;
      void main() { vC = color * (0.75 + 0.25 * sin(uTime * 2.0 + position.x)); vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * 1.6; gl_Position = projectionMatrix * mv; }
    `,
    fragmentShader: /* glsl */`
      varying vec3 vC;
      void main() { vec2 c = gl_PointCoord - 0.5; float d = length(c); float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vC * a, a); }
    `,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  pts.userData.update = (t) => (m.uniforms.uTime.value = t);
  return pts;
}

/** Sun sprite with soft glare. */
export function createSun(dir, dist = 1500) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.08, 'rgba(255,250,235,1)'); g.addColorStop(0.2, 'rgba(255,220,170,0.35)'); g.addColorStop(1, 'rgba(255,200,150,0)');
  x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(6, 5.5, 5), blending: THREE.AdditiveBlending, depthWrite: false }));
  s.scale.setScalar(320);
  s.position.copy(dir).multiplyScalar(dist);
  return s;
}

function windowTex(cols = 256, warm = true) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#05070a'; x.fillRect(0, 0, 1024, 64);
  for (let i = 0; i < cols; i++) {
    for (let r = 0; r < 3; r++) {
      if (Math.random() < 0.18) continue;
      const b = 0.4 + Math.random() * 0.6;
      x.fillStyle = warm ? `rgba(255,${190 + Math.random() * 50 | 0},${120 + Math.random() * 60 | 0},${b})` : `rgba(170,220,255,${b})`;
      x.fillRect(i * 4 + 0.5, 10 + r * 16, 2.6, 9);
    }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

function hullTex(seed = 1) {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const x = c.getContext('2d');
  let s = seed; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  x.fillStyle = '#c4cad0'; x.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 60; i++) {
    const w = 40 + r() * 160, h = 20 + r() * 90, px = r() * 512, py = r() * 512, v = 170 + r() * 50 | 0;
    x.fillStyle = `rgb(${v},${v + 3},${v + 6})`; x.fillRect(px, py, w, h);
    x.strokeStyle = 'rgba(60,66,74,0.35)'; x.lineWidth = 1.5; x.strokeRect(px, py, w, h);
  }
  for (let i = 0; i < 25; i++) { x.fillStyle = 'rgba(50,56,64,0.55)'; x.fillRect(r() * 512, r() * 512, 6 + r() * 14, 3 + r() * 6); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
}

/** Exterior of HELIOS-7: a great habitat ring with a central deck and spire, spokes, window bands and docked craft. */
export function createStationExterior() {
  const g = new THREE.Group();
  const ht = hullTex(3);
  const hullCache = {}; const hullMat = (rx, ry) => { const k = rx + ':' + ry; if (hullCache[k]) return hullCache[k]; const t = ht.clone(); t.repeat.set(rx * 0.5, ry * 0.5); t.needsUpdate = true; return (hullCache[k] = new THREE.MeshStandardMaterial({ map: t, color: 0xe4e8ec, metalness: 0.4, roughness: 0.5, bumpMap: t, bumpScale: 0.3 })); };
  const dark = new THREE.MeshStandardMaterial({ color: 0x59626c, metalness: 0.6, roughness: 0.45 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x8a939c, metalness: 0.7, roughness: 0.35 });
  const winWarm = windowTex(256, true);
  const R = 40;
  const ring = new THREE.Group(); g.add(ring);
  // main torus (slightly flattened, rectangular-ish section)
  const torus = new THREE.Mesh(new THREE.TorusGeometry(R, 4.2, 18, 160), hullMat(40, 2));
  torus.rotation.x = Math.PI / 2; torus.scale.z = 0.62; ring.add(torus);
  // window bands outer + inner
  for (const [rad, h, inward] of [[R + 4.15, 2.0, false], [R - 4.1, 1.6, true]]) {
    const t = winWarm.clone(); t.repeat.set(inward ? 6 : 8, 1); t.needsUpdate = true;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, h, 160, 1, true), new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 3.5, map: t, side: inward ? THREE.BackSide : THREE.FrontSide }));
    band.position.y = inward ? 0.6 : -0.3; ring.add(band);
  }
  // modular blocks on top of the ring
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2, w = 2 + (i * 7 % 5), h = 0.8 + (i * 13 % 7) * 0.35;
    const b = new THREE.Mesh(new THREE.BoxGeometry(3.2, h, w), i % 3 ? hullMat(1, 1) : dark);
    b.position.set(Math.cos(a) * (R + (i % 2 ? 1.2 : -1.0)), 2.4 + h / 2, Math.sin(a) * (R + (i % 2 ? 1.2 : -1.0)));
    b.rotation.y = -a; ring.add(b);
  }
  // outer rim lip & under-truss
  const lip = new THREE.Mesh(new THREE.TorusGeometry(R + 4.6, 0.35, 6, 160), steel); lip.rotation.x = Math.PI / 2; lip.position.y = -1.2; ring.add(lip);
  const under = new THREE.Mesh(new THREE.TorusGeometry(R, 0.5, 6, 160), dark); under.rotation.x = Math.PI / 2; under.position.y = -3.4; ring.add(under);
  // spokes
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.26;
    const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, R - 6, 10), steel);
    sp.rotation.z = Math.PI / 2; sp.rotation.y = -a; sp.position.set(Math.cos(a) * (R / 2 + 2), -1.2, Math.sin(a) * (R / 2 + 2)); ring.add(sp);
  }
  // central deck across the diameter
  const deck = new THREE.Group(); g.add(deck);
  const plat = new THREE.Mesh(new THREE.BoxGeometry(2 * R - 4, 1.4, 9), hullMat(20, 2)); deck.add(plat);
  const platUnder = new THREE.Mesh(new THREE.BoxGeometry(2 * R - 8, 1.6, 5), dark); platUnder.position.y = -1.4; deck.add(platUnder);
  for (let i = 0; i < 26; i++) {
    const x = -R + 8 + i * ((2 * R - 16) / 25), h = 1 + ((i * 37) % 9) * 0.6, w = 2 + (i % 3);
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 3 + (i % 4)), i % 4 ? hullMat(1, 1) : dark);
    b.position.set(x, 0.7 + h / 2, (i % 2 ? 1.8 : -1.8)); deck.add(b);
    if (i % 3 === 0) { const l = new THREE.Mesh(new THREE.BoxGeometry(w * 0.8, 0.25, 0.1), new THREE.MeshStandardMaterial({ color: 0, emissive: 0xffd9a0, emissiveIntensity: 3 })); l.position.set(x, 0.9 + h * 0.6, (i % 2 ? 1.8 : -1.8) + (i % 2 ? 1.6 : -1.6) + (i % 4 ? 0 : 0)); deck.add(l); }
  }
  // hub + spire + antenna
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(6, 7.5, 5, 32), hullMat(6, 1)); hub.position.y = 1.2; deck.add(hub);
  const hubWin = new THREE.Mesh(new THREE.CylinderGeometry(6.05, 6.05, 0.8, 48, 1, true), new THREE.MeshStandardMaterial({ color: 0, emissive: 0xffffff, emissiveMap: winWarm, emissiveIntensity: 2.5 })); hubWin.position.y = 2.5; deck.add(hubWin);
  const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 2.8, 34, 16), hullMat(2, 6)); spire.position.y = 20; deck.add(spire);
  const spireTip = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.3, 14, 8), steel); spireTip.position.y = 44; deck.add(spireTip);
  const down = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 0.3, 30, 12), dark); down.position.y = -17; deck.add(down);
  for (const y of [8, 14, 22]) { const r2 = new THREE.Mesh(new THREE.TorusGeometry(3.2 - y * 0.06, 0.15, 6, 24), steel); r2.rotation.x = Math.PI / 2; r2.position.y = y; deck.add(r2); }
  // the breached lab module (red glow)
  const lab = new THREE.Mesh(new THREE.CapsuleGeometry(2.4, 8, 8, 20), hullMat(2, 2)); lab.rotation.z = Math.PI / 2; lab.position.set(R * 0.55, -3.6, 0); deck.add(lab);
  const labBand = new THREE.Mesh(new THREE.CylinderGeometry(2.45, 2.45, 6, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0, emissive: 0xff2a14, emissiveIntensity: 3.5 }));
  labBand.rotation.z = Math.PI / 2; labBand.position.copy(lab.position); labBand.scale.set(1, 1, 1); deck.add(labBand);
  // outer thin ring (rail) slightly tilted
  const rail = new THREE.Mesh(new THREE.TorusGeometry(R + 12, 0.45, 6, 200), steel); rail.rotation.x = Math.PI / 2 + 0.05; rail.position.y = -9; g.add(rail);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const st = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 9, 6), steel); st.position.set(Math.cos(a) * (R + 8), -5, Math.sin(a) * (R + 8)); st.rotation.z = Math.cos(a) * 0.6; st.rotation.x = -Math.sin(a) * 0.6; g.add(st); }
  // docking arm + tower on one side
  const tower = new THREE.Group(); tower.position.set(-R - 26, -10, 18); g.add(tower);
  const tw = new THREE.Mesh(new THREE.CylinderGeometry(3, 5, 90, 20), hullMat(3, 12)); tower.add(tw);
  const twWin = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.6, 40, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0, emissive: 0xffffff, emissiveMap: (() => { const t = winWarm.clone(); t.repeat.set(1, 1); t.rotation = Math.PI / 2; t.needsUpdate = true; return t; })(), emissiveIntensity: 1.6 })); twWin.position.y = 6; tower.add(twWin);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(30, 2, 3), hullMat(6, 1)); arm.position.set(14, 6, -8); arm.rotation.y = 0.5; tower.add(arm);
  // small craft
  const craft = [];
  for (let i = 0; i < 6; i++) {
    const c = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 2.2, 4, 10), hullMat(1, 1)); body.rotation.z = Math.PI / 2; c.add(body);
    const eng = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), new THREE.MeshStandardMaterial({ color: 0, emissive: 0x7fd4ff, emissiveIntensity: 6 })); eng.position.x = -1.7; c.add(eng);
    c.userData = { a: i * 1.1, r: R + 18 + i * 3, y: -4 + i * 3, sp: 0.02 + i * 0.006 };
    g.add(c); craft.push(c);
  }
  // nav lights
  const navs = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 8), new THREE.MeshStandardMaterial({ color: 0, emissive: i % 4 ? 0xff3020 : 0xffffff, emissiveIntensity: 10 }));
    l.position.set(Math.cos(a) * (R + 4.7), 1.8, Math.sin(a) * (R + 4.7)); g.add(l); navs.push(l);
  }
  const tipLight = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), new THREE.MeshStandardMaterial({ color: 0, emissive: 0xff2020, emissiveIntensity: 12 })); tipLight.position.y = 51; deck.add(tipLight); navs.push(tipLight);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.userData.update = (t) => {
    ring.rotation.y = t * 0.012;
    craft.forEach((c) => { const u = c.userData; const a = u.a + t * u.sp; c.position.set(Math.cos(a) * u.r, u.y, Math.sin(a) * u.r); c.rotation.y = -a - Math.PI / 2; });
    navs.forEach((n, i) => (n.material.emissiveIntensity = Math.sin(t * 2.5 + i * 0.9) > 0.7 ? 14 : 0.3));
  };
  return g;
}
