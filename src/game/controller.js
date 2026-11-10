import * as THREE from 'three';
import { AREAS } from '../world/station.js';

const RADIUS = 0.28;

/** Circle-vs-AABB push out + walkable-region constraint (union of rectangles, already shrunk by radius). */
export function resolveMove(area, obstacles, from, to, radius = RADIUS, height = 1.8) {
  const A = AREAS[area];
  const inside = (x, z) => A.walk.some(([x0, x1, z0, z1]) => x >= x0 && x <= x1 && z >= z0 && z <= z1);
  let x = to.x, z = to.z;
  // obstacles
  for (let iter = 0; iter < 2; iter++) {
    for (const b of obstacles) {
      if (b.maxY < A.floorY + 0.05 || b.minY > A.floorY + height) continue;
      const cx = Math.max(b.minX, Math.min(x, b.maxX)), cz = Math.max(b.minZ, Math.min(z, b.maxZ));
      const dx = x - cx, dz = z - cz, d2 = dx * dx + dz * dz;
      if (d2 < radius * radius) {
        if (d2 > 1e-8) { const d = Math.sqrt(d2), push = radius - d; x += (dx / d) * push; z += (dz / d) * push; }
        else { // centre inside box: push out along smallest axis
          const pl = [x - b.minX, b.maxX - x, z - b.minZ, b.maxZ - z]; const m = Math.min(...pl);
          if (m === pl[0]) x = b.minX - radius; else if (m === pl[1]) x = b.maxX + radius; else if (m === pl[2]) z = b.minZ - radius; else z = b.maxZ + radius;
        }
      }
    }
  }
  if (inside(x, z)) return { x, z };
  if (inside(x, from.z)) return { x, z: from.z };
  if (inside(from.x, z)) return { x: from.x, z };
  // never trap anyone: if the starting point itself is outside the walkable space
  // (teleport, cutscene, physics push), pull them back to the nearest walkable point
  if (!inside(from.x, from.z)) return nearestWalkable(area, from.x, from.z);
  return { x: from.x, z: from.z };
}

/** Closest point inside the area's walkable rectangles. */
export function nearestWalkable(area, x, z) {
  let best = { x, z }, bd = Infinity;
  for (const [x0, x1, z0, z1] of AREAS[area].walk) {
    const px = Math.min(x1, Math.max(x0, x)), pz = Math.min(z1, Math.max(z0, z));
    const d = (px - x) ** 2 + (pz - z) ** 2;
    if (d < bd) { bd = d; best = { x: px, z: pz }; }
  }
  return best;
}

/** Player locomotion for Max: camera-relative WASD, sprint, crouch, crawl (in ducts). */
export class PlayerController {
  constructor(char, input, audio) {
    this.char = char; this.input = input; this.audio = audio;
    this.area = 'Q';
    this.mode = 'stand';     // stand | crouch | crawl
    this.vel = new THREE.Vector3();
    this.enabled = false;
    this.noise = 0;          // instantaneous noise emitted (0..1)
    this.camYaw = Math.PI; this.camPitch = 0.15;
    this.forceCrouch = false;
    this.maxSpeedScale = 1;
    char.onStep = () => this._step();
  }

  _step() {
    const s = this.char.speed;
    const loud = this.mode === 'crawl' ? 0.12 : this.mode === 'crouch' ? 0.06 : s > 3 ? 1.0 : 0.42;
    this.noise = Math.max(this.noise, loud);
    const p = this.char.position;
    if (this.mode === 'crawl') { if (Math.random() < 0.5) this.audio.ductClank(p); }
    else this.audio.footstep(p, this.mode === 'crouch' ? 0.12 : s > 3 ? 1.0 : 0.5, true);
  }

  get height() { return this.mode === 'crawl' ? 0.7 : this.mode === 'crouch' ? 1.2 : 1.8; }

  update(dt, obstacles) {
    const c = this.char, I = this.input;
    this.noise = Math.max(0, this.noise - dt * 1.6);
    let mx = 0, mz = 0;
    if (this.enabled) {
      if (I.isDown('KeyW', 'ArrowUp')) mz += 1;
      if (I.isDown('KeyS', 'ArrowDown')) mz -= 1;
      if (I.isDown('KeyA', 'ArrowLeft')) mx += 1;
      if (I.isDown('KeyD', 'ArrowRight')) mx -= 1;
      if (I.analog) { mx -= I.analog.x; mz -= I.analog.y; }
      if (this.area !== 'D') {
        const crouchHeld = I.isDown('KeyC', 'ControlLeft', 'ControlRight');
        this.mode = crouchHeld || this.forceCrouch ? 'crouch' : 'stand';
      } else this.mode = 'crawl';
    }
    const len = Math.min(1, Math.hypot(mx, mz));
    const analogScale = this.input.analog ? Math.max(0.35, len) : 1;
    const sprint = this.enabled && I.isDown('ShiftLeft', 'ShiftRight') && this.mode === 'stand';
    let target = 0;
    if (len > 0) {
      const l2 = Math.hypot(mx, mz); mx /= l2; mz /= l2;
      target = (this.mode === 'crawl' ? 1.1 : this.mode === 'crouch' ? 1.35 : sprint ? 4.6 : 2.1) * this.maxSpeedScale * analogScale;
    }
    // camera-relative direction: forward = (sin yaw, cos yaw)
    const fy = this.camYaw;
    const fwd = new THREE.Vector3(Math.sin(fy), 0, Math.cos(fy));
    const right = new THREE.Vector3(Math.cos(fy), 0, -Math.sin(fy)); // +X when yaw=0 → character's left; we use mx>0 for A (left)
    const dir = new THREE.Vector3().addScaledVector(fwd, mz).addScaledVector(right, mx);
    const desired = dir.multiplyScalar(target);
    const accel = len > 0 ? 10 : 12;
    this.vel.x += (desired.x - this.vel.x) * (1 - Math.exp(-accel * dt));
    this.vel.z += (desired.z - this.vel.z) * (1 - Math.exp(-accel * dt));
    const from = { x: c.position.x, z: c.position.z };
    const to = { x: from.x + this.vel.x * dt, z: from.z + this.vel.z * dt };
    const r = resolveMove(this.area, obstacles, from, to, RADIUS, this.height);
    c.position.x = r.x; c.position.z = r.z;
    c.position.y = AREAS[this.area].floorY;
    const actual = Math.hypot(r.x - from.x, r.z - from.z) / Math.max(dt, 1e-4);
    c.speed = actual;
    // face movement direction
    if (actual > 0.2) {
      const want = Math.atan2(this.vel.x, this.vel.z);
      let d = want - c.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      c.yaw += d * (1 - Math.exp(-(this.mode === 'crawl' ? 6 : 12) * dt));
    }
    // animation state
    if (this.mode === 'crawl') c.setState('crawl', 5);
    else if (this.mode === 'crouch') c.setState(actual > 0.2 ? 'crouchWalk' : 'crouch', 7);
    else c.setState(actual > 3.2 ? 'run' : actual > 0.25 ? 'walk' : 'idle', 7);
  }
}

/** Over-the-shoulder third-person camera with collision. Also drives scripted cinematic shots. */
export class ThirdPersonCamera {
  constructor(camera, colliders) {
    this.camera = camera;
    this.colliders = colliders;
    this.ray = new THREE.Raycaster();
    this.pos = new THREE.Vector3(0, 1.6, -3);
    this.look = new THREE.Vector3();
    this.dist = 2.6;
    this.cinematic = null;   // { from, to, lookFrom, lookTo, t, dur, ease }
    this.shakeAmt = 0;
    this.fov = 62;
  }

  shake(a) { this.shakeAmt = Math.max(this.shakeAmt, a); }

  /** Scripted shot. Returns a promise resolved after `dur`. */
  shot(pos, look, dur = 0, ease = 'inOut') {
    const c = this.cinematic;
    const fromPos = c ? this.camera.position.clone() : this.camera.position.clone();
    const fromLook = c ? c.lookCur.clone() : this.look.clone();
    return new Promise((res) => {
      this.cinematic = { from: fromPos, to: pos.clone(), lookFrom: fromLook, lookTo: look.clone(), lookCur: fromLook.clone(), t: dur > 0 ? 0 : 1, dur: Math.max(dur, 1e-4), ease, res, follow: null };
    });
  }

  /** Cinematic that tracks a moving target (function returning {pos, look}). */
  track(fn) { this.cinematic = { track: fn, lookCur: this.look.clone(), t: 1, dur: 1 }; }

  release() { this.cinematic = null; }

  update(dt, ctrl) {
    const cam = this.camera;
    if (this.cinematic) {
      const c = this.cinematic;
      if (c.track) {
        const { pos, look } = c.track();
        cam.position.lerp(pos, 1 - Math.exp(-4 * dt));
        c.lookCur.lerp(look, 1 - Math.exp(-5 * dt));
      } else {
        c.t = Math.min(1, c.t + dt / c.dur);
        const e = c.ease === 'linear' ? c.t : c.ease === 'out' ? 1 - Math.pow(1 - c.t, 3) : c.t < 0.5 ? 4 * c.t * c.t * c.t : 1 - Math.pow(-2 * c.t + 2, 3) / 2;
        cam.position.lerpVectors(c.from, c.to, e);
        c.lookCur.lerpVectors(c.lookFrom, c.lookTo, e);
        if (c.t >= 1 && c.res) { const r = c.res; c.res = null; r(); }
      }
      this.look.copy(c.lookCur);
      cam.lookAt(c.lookCur);
      this.pos.copy(cam.position);
    } else if (ctrl) {
      const ch = ctrl.char;
      const crawl = ctrl.mode === 'crawl', crouch = ctrl.mode === 'crouch';
      const pivotH = crawl ? 0.55 : crouch ? 1.15 : 1.62;
      const targetDist = crawl ? 1.55 : crouch ? 2.1 : 2.55;
      this.dist += (targetDist - this.dist) * (1 - Math.exp(-4 * dt));
      const yaw = ctrl.camYaw, pitch = ctrl.camPitch;
      const pivot = new THREE.Vector3(ch.position.x, ch.position.y + pivotH, ch.position.z);
      // shoulder offset to the right
      const right = new THREE.Vector3(-Math.cos(yaw), 0, Math.sin(yaw));
      pivot.addScaledVector(right, crawl ? 0.12 : 0.38);
      const back = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
      let d = this.dist;
      this.ray.set(pivot, back); this.ray.far = d + 0.2;
      const hit = this.ray.intersectObjects(this.colliders, false)[0];
      if (hit) d = Math.max(0.25, hit.distance - 0.18);
      const want = pivot.clone().addScaledVector(back, d);
      // keep camera inside duct/ceiling bounds
      this.pos.lerp(want, 1 - Math.exp(-18 * dt));
      if (hit) this.pos.copy(want);
      const A = AREAS[ctrl.area];
      if (A) this.pos.y = Math.min(A.ceilY - 0.12, Math.max(A.floorY + 0.32, this.pos.y));
      cam.position.copy(this.pos);
      this.look.copy(pivot).addScaledVector(back, -4);
      cam.lookAt(this.look);
    }
    if (this.shakeAmt > 0.0005) {
      cam.position.x += (Math.random() - 0.5) * this.shakeAmt;
      cam.position.y += (Math.random() - 0.5) * this.shakeAmt;
      cam.rotation.z += (Math.random() - 0.5) * this.shakeAmt * 0.3;
      this.shakeAmt *= Math.exp(-5 * dt);
    }
    if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov += (this.fov - cam.fov) * (1 - Math.exp(-3 * dt)); cam.updateProjectionMatrix(); }
  }
}

/** Companion that follows Max along his breadcrumb trail (works through ducts and doorways). */
export class Follower {
  constructor(char, leaderCtrl, slot) {
    this.char = char; this.leader = leaderCtrl; this.slot = slot;
    this.active = false;
    this.scripted = null;   // {target: Vector3, speed, state, res}
  }

  walkTo(target, speed = 1.6, state = null) {
    return new Promise((res) => { this.scripted = { target: target.clone(), speed, state, res }; });
  }

  update(dt, trail, obstacles, area, others) {
    const c = this.char;
    let target = null, speed = 0;
    const mode = this.leader.mode;
    if (this.scripted) {
      target = this.scripted.target; speed = this.scripted.speed;
    } else if (this.active && trail.length) {
      // walk back along the trail to the slot distance
      const want = 1.0 + this.slot * 0.95 + (mode === 'crawl' ? this.slot * 0.6 + 0.3 : 0);
      let acc = 0; let pt = trail[trail.length - 1];
      const lp = this.leader.char.position;
      let prev = lp;
      for (let i = trail.length - 1; i >= 0; i--) {
        acc += Math.hypot(trail[i].x - prev.x, trail[i].z - prev.z);
        prev = trail[i]; pt = trail[i];
        if (acc >= want) break;
      }
      if (acc >= want - 0.2) target = pt;
      speed = Math.max(0.6, this.leader.char.speed * 1.08);
    }
    let moved = 0;
    if (target) {
      const dx = target.x - c.position.x, dz = target.z - c.position.z, d = Math.hypot(dx, dz);
      const arrive = this.scripted ? 0.08 : 0.35;
      if (d > arrive) {
        const step = Math.min(d, speed * dt * (d > 2.5 && !this.scripted ? 1.6 : 1));
        const to = { x: c.position.x + (dx / d) * step, z: c.position.z + (dz / d) * step };
        // separation from others
        for (const o of others) {
          if (o === c) continue;
          const ox = to.x - o.position.x, oz = to.z - o.position.z, od = Math.hypot(ox, oz);
          if (od < 0.55 && od > 1e-4) { to.x += (ox / od) * (0.55 - od) * 0.5; to.z += (oz / od) * (0.55 - od) * 0.5; }
        }
        const r = this.scripted ? to : resolveMove(area, obstacles, { x: c.position.x, z: c.position.z }, to, 0.26, 1.7);
        const progressed = Math.hypot(r.x - c.position.x, r.z - c.position.z) > step * 0.25;
        this._stuckT = progressed ? 0 : (this._stuckT || 0) + dt;
        moved = Math.hypot(r.x - c.position.x, r.z - c.position.z);
        c.position.x = r.x; c.position.z = r.z;
        const want = Math.atan2(dx, dz);
        let dy = want - c.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        c.yaw += dy * (1 - Math.exp(-8 * dt));
      } else if (this.scripted) {
        this._stuckT = 0;
        const r = this.scripted.res; this.scripted = null; r();
      }
    }
    c.speed = moved / Math.max(dt, 1e-4);
    // anti-stuck: blocked for >1.6 s (scripted or following) → hop to the target / a trail point
    if (this._stuckT > 1.6 && target) {
      this._stuckT = 0;
      const dest = this.scripted ? this.scripted.target : trail[Math.max(0, trail.length - 6 - this.slot * 4)] || target;
      const p = this.scripted ? dest : nearestWalkable(area, dest.x, dest.z);
      c.position.x = p.x; c.position.z = p.z; c.snap?.();
      if (this.scripted && Math.hypot(dest.x - c.position.x, dest.z - c.position.z) < 0.1) { const res = this.scripted.res; this.scripted = null; res(); }
    }
    // far behind the leader (lost in geometry) → catch up instantly behind them
    if (this.active && !this.scripted && trail.length) {
      const L = this.leader.char.position;
      if (Math.hypot(L.x - c.position.x, L.z - c.position.z) > 7) {
        const p = trail[Math.max(0, trail.length - 8 - this.slot * 4)];
        const q = nearestWalkable(area, p.x, p.z); c.position.x = q.x; c.position.z = q.z; c.snap?.();
      }
    }
    if (!this.active && !this.scripted) return;
    const st = this.scripted?.state;
    if (st) c.setState(st);
    else if (mode === 'crawl') c.setState('crawl', 5);
    else if (mode === 'crouch') c.setState(c.speed > 0.2 ? 'crouchWalk' : 'crouch', 7);
    else c.setState(c.speed > 3.0 ? 'run' : c.speed > 0.2 ? 'walk' : 'idle', 7);
  }
}
