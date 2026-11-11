import * as THREE from 'three';
import { logoBlock } from '../intro/brand.js';

/**
 * Ending: (1) a 3D ARES-1 transport leaves Helios-7 and Earth, (2) the owner-supplied story
 * images play as a "film" — slow camera moves across each still (pan + zoom, ease in/out) with
 * speech bubbles pinned to the characters — then the ANORYX sign-off.
 */

// ------------------------------------------------------------------ 3D ship (title scene)
/** Long industrial transport: boxy hull, fuel tanks, three blue main engines, belly thrusters. */
export function buildShip() {
  const g = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({ color: 0x8d8a82, metalness: 0.75, roughness: 0.45 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x3b3d40, metalness: 0.8, roughness: 0.5 });
  const pale = new THREE.MeshStandardMaterial({ color: 0xb9b4a8, metalness: 0.6, roughness: 0.5 });
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); g.add(m); return m; };
  // main hull along +x (nose) ... -x (engines)
  add(new THREE.BoxGeometry(9, 1.6, 2.0), hull, 0, 0, 0);
  add(new THREE.BoxGeometry(2.2, 1.2, 1.6), pale, 5.4, 0.1, 0);                 // nose block
  add(new THREE.BoxGeometry(1.2, 0.8, 1.2), dark, 6.9, 0.15, 0);                // cockpit
  add(new THREE.BoxGeometry(7, 0.5, 2.6), dark, -0.6, -0.95, 0);                // belly keel
  for (const z of [-1.25, 1.25]) add(new THREE.BoxGeometry(6, 1.0, 0.6), pale, -0.4, 0.1, z); // side pods
  // tanks on top
  for (const [x, h] of [[-1.6, 1.9], [0.0, 2.2], [1.6, 1.7]]) {
    add(new THREE.CylinderGeometry(0.55, 0.55, h, 16), pale, x, 0.8 + h / 2, -0.35);
    add(new THREE.CylinderGeometry(0.42, 0.42, h * 0.8, 16), hull, x + 0.6, 0.8 + h * 0.4, 0.55);
  }
  // panel greebles
  for (let i = 0; i < 18; i++) add(new THREE.BoxGeometry(0.3 + Math.random() * 0.8, 0.12, 0.3 + Math.random() * 0.6), i % 2 ? dark : pale, -4 + Math.random() * 8.5, 0.82, -0.9 + Math.random() * 1.8);
  // engine block + three main engines
  add(new THREE.BoxGeometry(1.4, 2.4, 2.8), dark, -5.0, 0.2, 0);
  const flames = [];
  const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.32, 0.72, 1.7), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 1.6, 2.6), toneMapped: false });
  for (const [y, z] of [[0.95, 0], [0.2, -0.85], [0.2, 0.85], [-0.6, 0]]) {
    add(new THREE.CylinderGeometry(0.42, 0.55, 0.7, 20), hull, -5.9, y, z, 0, 0, Math.PI / 2);
    add(new THREE.CircleGeometry(0.38, 20), glowMat, -6.26, y, z, 0, -Math.PI / 2, 0);
    const f = add(new THREE.ConeGeometry(0.4, 3.4, 18, 1, true), flameMat, -7.95, y, z, 0, 0, Math.PI / 2);
    flames.push(f);
  }
  // belly thrusters (like the landing jets)
  for (const x of [-2.5, 1.5]) {
    add(new THREE.CylinderGeometry(0.28, 0.34, 0.4, 14), dark, x, -1.35, 0);
    const f = add(new THREE.ConeGeometry(0.24, 1.6, 14, 1, true), flameMat, x, -2.3, 0, Math.PI, 0, 0);
    f.userData.belly = true; flames.push(f);
  }
  g.traverse((o) => { if (o.isMesh && o.material !== flameMat && o.material !== glowMat) o.castShadow = o.receiveShadow = true; });
  g.userData.update = (t, thrust = 1) => {
    flames.forEach((f, i) => {
      const k = f.userData.belly ? thrust * 0.35 : thrust;
      const s = (0.85 + Math.sin(t * 40 + i * 1.7) * 0.08 + Math.random() * 0.1) * k;
      f.scale.set(Math.max(0.01, s), Math.max(0.01, s), Math.max(0.01, s));
      f.visible = k > 0.02;
    });
  };
  g.userData.dispose = () => g.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
  return g;
}

// ------------------------------------------------------------------ image film
const BASE = import.meta.env?.BASE_URL ?? './';
const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2); // ease-in-out cubic
const wait = (ms, skip) => new Promise((r) => { const id = setTimeout(r, ms); skip.list.push(() => { clearTimeout(id); r(); }); });

/**
 * A still image filling the screen (cover), with a virtual camera:
 *   cam = { x, y } focus point in image units (0..1), z = zoom (1 = whole image covers the screen).
 */
class Still {
  constructor(stage, src, aspect) {
    this.stage = stage;
    this.aspect = aspect;
    this.el = document.createElement('div'); this.el.className = 'ff-still';
    this.img = new Image(); this.img.src = src; this.img.alt = ''; this.img.decoding = 'async'; this.img.draggable = false;
    this.el.appendChild(this.img);
    stage.appendChild(this.el);
    this.cam = { x: 0.5, y: 0.5, z: 1 };
    this.bubbles = [];
    this.layout();
  }

  ready() { return this.img.decode ? this.img.decode().catch((e) => console.warn('Ending image failed to decode:', this.img.src, e?.message || e)) : Promise.resolve(); }

  layout() {
    const sw = innerWidth, sh = innerHeight;
    // cover: the image is at least as wide and as tall as the screen
    const w = Math.max(sw, sh * this.aspect), h = w / this.aspect;
    this.W = w; this.H = h; this.sw = sw; this.sh = sh;
    this.img.style.width = `${w}px`; this.img.style.height = `${h}px`;
    this.apply();
  }

  apply() {
    const { W, H, sw, sh } = this, c = this.cam;
    const z = Math.max(1, c.z);
    // keep the image covering the screen at every zoom
    const hx = sw / (2 * z * W), hy = sh / (2 * z * H);
    const x = Math.min(1 - hx, Math.max(hx, c.x)), y = Math.min(1 - hy, Math.max(hy, c.y));
    this.tx = sw / 2 - z * x * W; this.ty = sh / 2 - z * y * H; this.z = z;
    this.img.style.transform = `translate3d(${this.tx}px, ${this.ty}px, 0) scale(${z})`;
    for (const b of this.bubbles) this._placeBubble(b);
  }

  /** Smoothly move the virtual camera to `to` over `ms`. */
  move(to, ms, skip) {
    const from = { ...this.cam };
    return new Promise((res) => {
      const t0 = performance.now();
      let done = false;
      const finish = () => { if (done) return; done = true; Object.assign(this.cam, to); this.apply(); res(); };
      skip.list.push(finish);
      const tick = (now) => {
        if (done) return;
        const k = Math.min(1, (now - t0) / ms), e = ease(k);
        // zoom interpolates geometrically so the zoom-out reads as constant speed
        this.cam.z = from.z * Math.pow(to.z / from.z, e);
        this.cam.x = from.x + (to.x - from.x) * e;
        this.cam.y = from.y + (to.y - from.y) * e;
        this.apply();
        if (k < 1) requestAnimationFrame(tick); else finish();
      };
      requestAnimationFrame(tick);
    });
  }

  /** Speech bubble anchored above a point in the image (head position). */
  say(who, text, ix, iy, color) {
    const el = document.createElement('div');
    el.className = 'ff-bubble';
    el.style.setProperty('--c', color);
    el.innerHTML = `<b></b><span></span>`;
    el.querySelector('b').textContent = who;
    this.stage.appendChild(el);
    const b = { el, ix, iy };
    this.bubbles.push(b);
    this._placeBubble(b);
    requestAnimationFrame(() => el.classList.add('show'));
    const span = el.querySelector('span');
    let i = 0;
    const iv = setInterval(() => { i += 1; span.textContent = text.slice(0, i); if (i >= text.length) clearInterval(iv); }, 32);
    b.close = () => { clearInterval(iv); el.classList.remove('show'); el.classList.add('hide'); this.bubbles = this.bubbles.filter((x) => x !== b); setTimeout(() => el.remove(), 450); };
    return b;
  }

  _placeBubble(b) {
    const sx = this.tx + this.z * b.ix * this.W, sy = this.ty + this.z * b.iy * this.H;
    b.el.style.left = `${Math.min(this.sw - 20, Math.max(20, sx))}px`;
    b.el.style.top = `${Math.max(10, sy)}px`;
  }

  remove() { this.bubbles.forEach((b) => b.close()); this.el.remove(); }
}

/**
 * Plays the image film. `audio` is the game's Audio. Resolves when the sign-off is done (or skipped).
 */
export async function playEndingFilm({ audio }) {
  const skip = { list: [], on: false, all: false };
  const root = document.createElement('div');
  root.id = 'finale-film';
  root.innerHTML = `<div class="ff-stage"></div><div class="ff-black"></div><div class="ff-sign"><div class="ff-logo">${logoBlock('ff-ax')}</div><div class="ff-line">An AI creation from Anoryx Tech Solutions</div></div>
    <button class="ff-skip" type="button">SKIP <svg viewBox="0 0 24 24"><path d="M5 5l8 7-8 7zM13 5l8 7-8 7z"/></svg></button>`;
  document.body.appendChild(root);
  const stage = root.querySelector('.ff-stage'), black = root.querySelector('.ff-black');
  const skipNow = () => { skip.all = true; const l = skip.list; skip.list = []; l.forEach((f) => f()); };
  root.querySelector('.ff-skip').addEventListener('click', (e) => { e.stopPropagation(); audio.uiSound?.('press'); skipNow(); });
  const onResize = () => stills.forEach((s) => s.layout());
  const stills = [];
  window.addEventListener('resize', onResize);
  const W = (ms) => (skip.all ? Promise.resolve() : wait(ms, skip));
  const M = (s, to, ms) => (skip.all ? (Object.assign(s.cam, to), s.apply(), Promise.resolve()) : s.move(to, ms, skip));
  const fadeBlack = (on, ms = 1200) => { black.style.transition = `opacity ${ms}ms ease`; black.style.opacity = on ? '1' : '0'; return W(ms); };
  const ASPECT = 1407 / 768;
  const scene = async (src, start) => {
    const s = new Still(stage, src, ASPECT); stills.push(s);
    Object.assign(s.cam, start); s.apply();
    await s.ready();
    return s;
  };
  const end = (s) => { s.remove(); stills.splice(stills.indexOf(s), 1); };
  const COL = { Anna: '#ff7fe0', Max: '#5ff3ff', Sean: '#ffa040', Colonist: '#ffb547' };

  try {
    black.style.opacity = '1';
    // 1 · ARES-1 heading for Mars: from the glare of the thrusters, out to the whole ship
    let s = await scene(BASE + 'finale/1-to-mars.webp', { x: 0.885, y: 0.47, z: 4.2 });
    await fadeBlack(false, 1400);
    audio.whoosh?.(3, false, 0.25);
    await M(s, { x: 0.68, y: 0.48, z: 2.0 }, 3800);
    await M(s, { x: 0.5, y: 0.5, z: 1 }, 4200);
    await W(1400);
    await fadeBlack(true, 900); end(s);

    // 2 · The cockpit: deep into Mars, pull back to the three of them
    s = await scene(BASE + 'finale/2-cockpit.webp', { x: 0.633, y: 0.3, z: 6.5 });
    await fadeBlack(false, 1000);
    await M(s, { x: 0.6, y: 0.36, z: 2.6 }, 4200);
    await M(s, { x: 0.5, y: 0.5, z: 1 }, 4200);
    await W(500);
    let b = s.say('ANNA', "Look — we've reached Mars. Finally, after six months.", 0.474, 0.43, COL.Anna);
    await W(3600); b.close(); await W(500);
    b = s.say('MAX', 'Yeah. Finally — no more zombies.', 0.77, 0.47, COL.Max);
    await W(3000); b.close(); await W(600);
    await fadeBlack(true, 900); end(s);

    // 3 · Landing: a colonist's upturned face, then the others, then the whole landing
    s = await scene(BASE + 'finale/3-landing.webp', { x: 0.41, y: 0.64, z: 6 });
    await fadeBlack(false, 1000);
    audio.whoosh?.(2.5, true, 0.25);
    await M(s, { x: 0.26, y: 0.66, z: 2.4 }, 4000);
    await M(s, { x: 0.5, y: 0.5, z: 1 }, 4200);
    await W(1200);
    await fadeBlack(true, 900); end(s);

    // 4 · New Earth: top-right of the ship, out to the two coming down the ramp, then the handshake
    s = await scene(BASE + 'finale/4-new-earth.webp', { x: 0.93, y: 0.2, z: 4.5 });
    await fadeBlack(false, 1000);
    await M(s, { x: 0.79, y: 0.5, z: 2.1 }, 4200);
    const anna = s.say('ANNA', 'Do you think they know what happened to Earth?', 0.765, 0.5, COL.Anna);
    await W(3300);
    const sean = s.say('SEAN', "I don't think so.", 0.835, 0.57, COL.Sean);
    await W(2400);
    anna.close(); sean.close(); await W(400);
    await M(s, { x: 0.55, y: 0.5, z: 1.55 }, 3600);
    b = s.say('COLONIST', 'Welcome to New Earth, survivor.', 0.575, 0.42, COL.Colonist);
    await W(2800);
    await M(s, { x: 0.5, y: 0.5, z: 1 }, 3000);
    b.close();
    await W(400);
    // sign-off: picture softens, ANORYX lockup + line
    root.classList.add('blur');
    await W(900);
    root.classList.add('sign');
    audio.logoSting?.();
    await W(1600);
    root.classList.add('line');
    await W(3600);
    await fadeBlack(true, 1200);
  } catch (e) {
    console.error('Ending film failed:', e);
  } finally {
    window.removeEventListener('resize', onResize);
    stills.forEach((x) => x.remove());
    root.classList.add('out');
    setTimeout(() => root.remove(), 900);
  }
}
