import * as THREE from 'three';
import { getMaterials } from '../world/materials.js';

/**
 * Procedural, fully-rigged humanoid with a blended procedural animation system.
 * Joint hierarchy (character faces +Z, +X is the character's LEFT):
 *   root(yaw) > body(lie/crouch offsets) > hips > spine > chest > neck > head
 *                                              chest > l/rShoulder > l/rElbow > l/rHand
 *                                              hips  > l/rHip > l/rKnee > l/rFoot
 * Rotation sign cheat-sheet (X axis): +X on a hanging limb swings it BACKWARD, -X FORWARD.
 * +X on the spine pitches the torso FORWARD. Knees bend with +X, elbows with -X.
 */

const JOINTS = ['hips', 'spine', 'chest', 'neck', 'head', 'lShoulder', 'lElbow', 'lHand', 'rShoulder', 'rElbow', 'rHand', 'lHip', 'lKnee', 'lFoot', 'rHip', 'rKnee', 'rFoot'];
const TAU = Math.PI * 2;
// spring stiffness (rad/s) per joint — lower = more follow-through
const SPRING = { hips: 24, spine: 18, chest: 15, neck: 11, head: 9, lShoulder: 13, rShoulder: 13, lElbow: 11, rElbow: 11, lHand: 9, rHand: 9, lHip: 26, rHip: 26, lKnee: 26, rKnee: 26, lFoot: 24, rFoot: 24 };

function taper(len, r1, r2, radial = 14) {
  const pts = [];
  const n = 6;
  for (let i = 0; i <= n; i++) { const a = (i / n) * (Math.PI / 2); pts.push(new THREE.Vector2(Math.sin(a) * r1, r1 - (1 - Math.cos(a)) * r1 + 0)); }
  pts.reverse();
  // top cap from tip down to r1 at y=0, then body to r2 at y=-len, then bottom cap
  const prof = [];
  for (let i = 0; i <= n; i++) { const a = (i / n) * (Math.PI / 2); prof.push(new THREE.Vector2(Math.sin(a) * r1, Math.cos(a) * r1 * 0.9)); }
  for (let i = 1; i <= 4; i++) { const k = i / 5; prof.push(new THREE.Vector2(r1 + (r2 - r1) * k + Math.sin(k * Math.PI) * 0.006, -len * k)); }
  for (let i = 0; i <= n; i++) { const a = (i / n) * (Math.PI / 2); prof.push(new THREE.Vector2(Math.cos(a) * r2, -len - Math.sin(a) * r2 * 0.9)); }
  const g = new THREE.LatheGeometry(prof, radial);
  g.computeVertexNormals();
  return g;
}

function mesh(geo, mat, parent, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...pos); m.rotation.set(...rot); m.scale.set(...scale);
  m.castShadow = true; m.receiveShadow = true;
  parent.add(m);
  return m;
}

function pivot(parent, pos) { const o = new THREE.Object3D(); o.position.set(...pos); parent.add(o); return o; }

const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));

export class Humanoid {
  constructor(opts = {}) {
    const M = getMaterials();
    this.opts = Object.assign({
      name: 'crew', female: false, suit: 0x26313d, suit2: 0x3c4a59, accent: 0x5ff3ff, skin: 0xc68e6a, hair: 0x2a1c12,
      hairStyle: 'short', beard: false, height: 1.0, zombie: false, labCoat: false,
    }, opts);
    const o = this.opts;
    const s = o.female ? 0.94 : 1.0;
    this.scale = s * o.height;

    const fabric = M.fabricBump;
    this.mats = {
      suit: new THREE.MeshPhysicalMaterial({ color: o.suit, roughness: 0.78, metalness: 0.05, sheen: 0.7, sheenColor: new THREE.Color(o.suit2).multiplyScalar(1.4), sheenRoughness: 0.5, bumpMap: fabric, bumpScale: 0.35 }),
      suit2: new THREE.MeshPhysicalMaterial({ color: o.suit2, roughness: 0.55, metalness: 0.25, clearcoat: 0.3 }),
      armor: new THREE.MeshPhysicalMaterial({ color: new THREE.Color(o.suit2).lerp(new THREE.Color(0x9aa4ad), 0.45), roughness: 0.38, metalness: 0.55, clearcoat: 0.6, clearcoatRoughness: 0.25 }),
      accent: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: o.accent, emissiveIntensity: o.zombie ? 0.0 : 1.1 }),
      skin: new THREE.MeshPhysicalMaterial({ color: o.skin, roughness: 0.52, sheen: 0.4, sheenColor: new THREE.Color(0xff9a80), sheenRoughness: 0.6, clearcoat: o.zombie ? 0.6 : 0.08, clearcoatRoughness: 0.5 }),
      hair: new THREE.MeshPhysicalMaterial({ color: o.hair, roughness: 0.62, sheen: 1, sheenColor: new THREE.Color(o.hair).multiplyScalar(2.5).addScalar(0.08), sheenRoughness: 0.35 }),
      pants: o.casual || o.zombie ? new THREE.MeshPhysicalMaterial({ color: o.pants ?? new THREE.Color(o.suit).multiplyScalar(0.7), roughness: 0.9, sheen: 0.8, sheenColor: new THREE.Color(0x9aa0a8), sheenRoughness: 0.6, bumpMap: fabric, bumpScale: 0.5 }) : null,
      sole: new THREE.MeshStandardMaterial({ color: o.outfit?.sole ?? 0x2a2a2a, roughness: 0.8 }),
      jacket: o.outfit?.jacket ? new THREE.MeshPhysicalMaterial({ color: o.outfit.jacket, roughness: 0.72, sheen: 0.6, sheenColor: new THREE.Color(o.outfit.jacket).lerp(new THREE.Color(0xffffff), 0.4), sheenRoughness: 0.5, bumpMap: fabric, bumpScale: 0.3, side: THREE.DoubleSide }) : null,
      lining: new THREE.MeshPhysicalMaterial({ color: o.outfit?.lining ?? 0x333333, roughness: 0.6, sheen: 0.5, side: THREE.DoubleSide }),
      wrap: new THREE.MeshPhysicalMaterial({ color: 0x6f6b68, roughness: 0.95, bumpMap: fabric, bumpScale: 0.8 }),
      cap: new THREE.MeshPhysicalMaterial({ color: o.outfit?.cap ?? 0xd0d0cc, roughness: 0.85, sheen: 0.6, sheenColor: new THREE.Color(0xffffff), bumpMap: fabric, bumpScale: 0.4 }),
      boot: new THREE.MeshStandardMaterial({ color: o.outfit?.shoes ?? 0x15181c, roughness: 0.55, metalness: 0.3 }),
      eye: new THREE.MeshPhysicalMaterial({ color: o.zombie ? 0xdfe6dc : 0xf4f4f0, roughness: 0.08, clearcoat: 1, emissive: o.zombie ? 0x223322 : 0x000000 }),
      iris: new THREE.MeshPhysicalMaterial({ color: o.zombie ? 0xcfd8cc : 0x2a3a48, roughness: 0.1, clearcoat: 1 }),
      lip: new THREE.MeshStandardMaterial({ color: o.zombie ? 0x3b1515 : new THREE.Color(o.skin).multiplyScalar(0.72), roughness: 0.4 }),
      blood: new THREE.MeshPhysicalMaterial({ color: 0x4a0303, roughness: 0.18, clearcoat: 1 }),
      coat: new THREE.MeshPhysicalMaterial({ color: 0xc9cec9, roughness: 0.85, sheen: 0.5, sheenColor: new THREE.Color(0xffffff), bumpMap: fabric, bumpScale: 0.3, side: THREE.DoubleSide }),
    };

    this.root = new THREE.Group();
    this.root.name = o.name;
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.rig = new THREE.Group();
    this.rig.scale.setScalar(this.scale);
    this.body.add(this.rig);
    this._build();

    // animation state
    this.time = Math.random() * 100;
    this.phase = 0;
    this.speed = 0;            // m/s horizontal, set by controller
    this.state = 'idle';
    this.weights = { idle: 1 };
    this.blendRate = 6;
    this.lookYaw = 0; this.lookPitch = 0;
    this.reach = 0; this.reachTarget = 0;
    this.blinkT = 2 + Math.random() * 3;
    this.twitch = 0;
    this.pose = {};
    this.bodyPose = { y: 0, rx: 0, z: 0, x: 0 };
    this.onStep = null;
    this._lastStepSign = 0;
    this._hairVel = 0; this._hairAng = 0;
    this.custom = null;       // optional function(pose, t) for scripted overrides
    this.seed = Math.random() * 10;
  }

  _build() {
    const m = this.mats, o = this.opts, f = o.female;
    const J = (this.j = {});
    const R = this.rig;
    const casual = o.casual || o.zombie;
    const G = casual ? () => ({ rotation: new THREE.Euler(), geometry: new THREE.BufferGeometry() }) : mesh;
    const pants = m.pants || m.suit, bare = casual ? m.skin : null;
    // ---------- hips & legs
    J.hips = pivot(R, [0, 0.97, 0]);
    mesh(new THREE.SphereGeometry(0.17, 20, 14), pants, J.hips, [0, -0.02, 0], [0, 0, 0], [f ? 1.08 : 1.0, 0.75, 0.78]);
    // belt
    G(new THREE.TorusGeometry(0.155, 0.025, 8, 28), m.suit2, J.hips, [0, 0.06, 0], [Math.PI / 2, 0, 0], [f ? 1.02 : 1.04, 0.78, 1]);
    G(new THREE.BoxGeometry(0.07, 0.05, 0.03), m.armor, J.hips, [0, 0.06, 0.13]);
    for (const side of [1, -1]) {
      const key = side > 0 ? 'l' : 'r';
      const hip = (J[key + 'Hip'] = pivot(J.hips, [side * (f ? 0.095 : 0.09), -0.05, 0]));
      mesh(taper(0.43, 0.085, 0.06), pants, hip, [0, -0.02, 0]);
      // thigh pocket
      G(new THREE.BoxGeometry(0.05, 0.11, 0.08), m.suit2, hip, [side * 0.075, -0.22, 0.0], [0, 0, side * 0.08]);
      const knee = (J[key + 'Knee'] = pivot(hip, [0, -0.45, 0]));
      G(new THREE.SphereGeometry(0.05, 14, 10), m.armor, knee, [0, -0.01, 0.035], [0, 0, 0], [1, 1.15, 0.55]);
      mesh(taper(0.36, casual ? 0.066 : 0.062, casual ? 0.05 : 0.045), pants, knee, [0, -0.02, 0]);
      // boot shaft
      G(taper(0.14, 0.058, 0.055), m.boot, knee, [0, -0.29, 0]);
      const foot = (J[key + 'Foot'] = pivot(knee, [0, -0.43, 0]));
      const footG = new THREE.CapsuleGeometry(0.048, 0.15, 6, 12); footG.rotateX(Math.PI / 2);
      mesh(footG, o.outfit ? m.boot : bare || m.boot, foot, [0, -0.04, 0.05], [0, 0, 0], o.outfit ? [1.3, 1.05, 1.08] : [1.15, 0.85, 1]);
      if (o.outfit) mesh(new THREE.BoxGeometry(0.115, 0.025, 0.27), m.sole, foot, [0, -0.085, 0.05]);
      G(new THREE.BoxGeometry(0.1, 0.02, 0.26), m.rubber || m.boot, foot, [0, -0.083, 0.05]);
      // accent strip down leg
      G(new THREE.BoxGeometry(0.008, 0.3, 0.008), m.accent, hip, [side * 0.085, -0.2, 0.0]);
    }
    // ---------- spine / chest
    J.spine = pivot(J.hips, [0, 0.05, 0]);
    mesh(new THREE.SphereGeometry(0.15, 20, 14), m.suit, J.spine, [0, 0.1, 0], [0, 0, 0], [1.0, 1.15, 0.72]);
    J.chest = pivot(J.spine, [0, 0.2, 0]);
    if (f) {
      mesh(new THREE.SphereGeometry(0.17, 24, 18), m.suit, J.chest, [0, 0.12, 0], [0, 0, 0], [1.02, 1.08, 0.72]);
      mesh(new THREE.SphereGeometry(0.068, 14, 10), m.suit, J.chest, [0.062, 0.1, 0.085], [0, 0, 0], [1, 0.9, 0.8]);
      mesh(new THREE.SphereGeometry(0.068, 14, 10), m.suit, J.chest, [-0.062, 0.1, 0.085], [0, 0, 0], [1, 0.9, 0.8]);
    } else {
      mesh(new THREE.SphereGeometry(0.19, 24, 18), m.suit, J.chest, [0, 0.12, 0], [0, 0, 0], [1.12, 1.05, 0.72]);
    }
    // chest armour plate + harness
    const plate = G(new THREE.SphereGeometry(0.2, 24, 12, 0, Math.PI, 0, Math.PI * 0.6), m.armor, J.chest, [0, 0.03, 0.005], [-Math.PI / 2 + 0.1, 0, 0], [f ? 0.82 : 0.95, 0.6, 0.62]);
    plate.rotation.set(-0.15, 0, 0);
    G(new THREE.BoxGeometry(0.045, 0.012, 0.01), m.accent, J.chest, [f ? 0.07 : 0.085, 0.2, f ? 0.125 : 0.132], [-0.25, 0, 0]);
    G(new THREE.TorusGeometry(0.068, 0.014, 10, 26), m.suit2, J.chest, [0, 0.29, -0.005], [Math.PI / 2 - 0.15, 0, 0], [1.05, 0.95, 1]);
    // backpack life-support unit
    const pack = G(new THREE.BoxGeometry(0.26, 0.3, 0.09), m.suit2, J.chest, [0, 0.1, -0.15]);
    pack.geometry.translate(0, 0, 0);
    G(new THREE.BoxGeometry(0.2, 0.012, 0.012), m.accent, J.chest, [0, 0.02, -0.197]);
    G(new THREE.CylinderGeometry(0.025, 0.025, 0.24, 10), m.armor, J.chest, [0.1, 0.1, -0.2]);
    if (o.labCoat) this._labCoat();

    // ---------- arms
    for (const side of [1, -1]) {
      const key = side > 0 ? 'l' : 'r';
      const sh = (J[key + 'Shoulder'] = pivot(J.chest, [side * (f ? 0.19 : 0.215), 0.22, 0]));
      G(new THREE.SphereGeometry(0.062, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), m.armor, sh, [side * 0.01, 0.0, 0], [0, 0, side * -0.25], [1.15, 0.8, 1.05]);
      mesh(taper(0.27, f ? 0.054 : 0.062, f ? 0.045 : 0.05), casual ? m.skin : m.suit, sh, [0, -0.02, 0]);
      if (casual && !o.outfit) mesh(taper(0.1, f ? 0.066 : 0.074, f ? 0.06 : 0.068), m.suit, sh, [0, -0.0, 0]); // t-shirt sleeve
      G(new THREE.BoxGeometry(0.008, 0.2, 0.008), m.accent, sh, [side * (f ? 0.052 : 0.06), -0.14, 0]);
      const el = (J[key + 'Elbow'] = pivot(sh, [0, -0.3, 0]));
      mesh(taper(0.24, f ? 0.045 : 0.05, f ? 0.036 : 0.04), casual ? m.skin : m.suit, el, [0, -0.01, 0]);
      // wrist computer on left arm
      if (side > 0) {
        G(new THREE.BoxGeometry(0.075, 0.08, 0.06), m.suit2, el, [0, -0.17, 0.0]);
        G(new THREE.BoxGeometry(0.05, 0.055, 0.005), m.accent, el, [0, -0.17, 0.032]);
      } else G(new THREE.TorusGeometry(0.043, 0.012, 8, 18), m.suit2, el, [0, -0.2, 0], [Math.PI / 2, 0, 0]);
      const hand = (J[key + 'Hand'] = pivot(el, [0, -0.27, 0]));
      mesh(new THREE.SphereGeometry(0.045, 12, 10), casual ? m.skin : m.suit2, hand, [0, -0.04, 0.0], [0, 0, 0], [0.85, 1.25, 0.55]);
      // fingers (merged mitten + thumb)
      const fing = new THREE.CapsuleGeometry(0.026, 0.05, 4, 8);
      mesh(fing, casual ? m.skin : m.suit2, hand, [0, -0.1, 0.008], [0.25, 0, 0], [1.4, 1, 0.75]);
      mesh(new THREE.CapsuleGeometry(0.014, 0.04, 4, 8), casual ? m.skin : m.suit2, hand, [side * -0.035, -0.05, 0.03], [0.4, 0, side * -0.6]);
    }

    // ---------- neck & head
    J.neck = pivot(J.chest, [0, 0.3, 0]);
    mesh(taper(0.08, 0.05, 0.055), m.skin, J.neck, [0, 0.085, 0]);
    J.head = pivot(J.neck, [0, 0.08, 0]);
    const H = J.head;
    // skull + face
    mesh(new THREE.SphereGeometry(0.11, 32, 24), m.skin, H, [0, 0.11, 0], [0, 0, 0], [f ? 0.88 : 0.92, 1.08, 1.0]);
    // jaw
    mesh(new THREE.SphereGeometry(0.085, 24, 16), m.skin, H, [0, 0.055, 0.03], [0, 0, 0], [f ? 0.9 : 1.02, 0.8, 0.95]);
    // nose
    const nose = new THREE.ConeGeometry(0.016, 0.045, 10); nose.rotateX(Math.PI / 2 + 0.6);
    mesh(nose, m.skin, H, [0, 0.105, 0.112]);
    // brow ridge
    mesh(new THREE.CapsuleGeometry(0.012, 0.09, 4, 10), m.skin, H, [0, 0.142, 0.092], [0, 0, Math.PI / 2], [1, 1, 0.8]);
    // ears
    for (const sx of [1, -1]) mesh(new THREE.SphereGeometry(0.022, 10, 8), m.skin, H, [sx * 0.098, 0.11, -0.005], [0, 0, 0], [0.45, 1.1, 0.8]);
    // eyes
    this.eyes = [];
    for (const sx of [1, -1]) {
      const eg = new THREE.Group(); eg.position.set(sx * 0.037, 0.125, 0.092); H.add(eg);
      mesh(new THREE.SphereGeometry(0.016, 14, 10), m.eye, eg);
      mesh(new THREE.SphereGeometry(0.0085, 10, 8), m.iris, eg, [0, 0, 0.011]);
      if (!o.zombie) mesh(new THREE.SphereGeometry(0.0042, 8, 6), new THREE.MeshBasicMaterial({ color: 0x050505 }), eg, [0, 0, 0.0175]);
      // eyelid
      const lid = mesh(new THREE.SphereGeometry(0.0175, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), m.skin, eg, [0, 0.0, 0], [-0.2, 0, 0]);
      lid.scale.set(1.05, 0.4, 1.05);
      this.eyes.push({ g: eg, lid });
    }
    // mouth
    this.mouth = mesh(new THREE.CapsuleGeometry(0.008, 0.035, 4, 8), m.lip, H, [0, 0.06, 0.103], [0, 0, Math.PI / 2], [1, 1, 0.6]);
    // hair
    this.hairPivot = null;
    if (o.hairStyle === 'short') {
      mesh(new THREE.SphereGeometry(0.117, 28, 18, 0, TAU, 0, Math.PI * 0.52), m.hair, H, [0, 0.122, -0.008], [-0.25, 0, 0], [f ? 0.9 : 0.95, 1.06, 1.06]);
      mesh(new THREE.SphereGeometry(0.06, 14, 10), m.hair, H, [0, 0.2, 0.05], [0.5, 0, 0], [1.4, 0.55, 1]);
    } else if (o.hairStyle === 'buzz') {
      mesh(new THREE.SphereGeometry(0.113, 28, 18, 0, TAU, 0, Math.PI * 0.5), m.hair, H, [0, 0.118, -0.006], [-0.3, 0, 0], [0.94, 1.04, 1.04]);
    } else if (o.hairStyle === 'ponytail') {
      mesh(new THREE.SphereGeometry(0.119, 28, 18, 0, TAU, 0, Math.PI * 0.56), m.hair, H, [0, 0.12, -0.01], [-0.3, 0, 0], [0.92, 1.06, 1.08]);
      // side bangs
      for (const sx of [1, -1]) mesh(new THREE.CapsuleGeometry(0.02, 0.07, 4, 8), m.hair, H, [sx * 0.085, 0.12, 0.05], [0.2, 0, sx * 0.15]);
      this.hairPivot = pivot(H, [0, 0.17, -0.1]);
      mesh(new THREE.SphereGeometry(0.035, 12, 10), m.hair, this.hairPivot, [0, 0, 0]);
      const tail = taper(0.22, 0.032, 0.012, 10);
      mesh(tail, m.hair, this.hairPivot, [0, -0.02, -0.01]);
    } else if (o.hairStyle === 'bob') {
      // black bob with side-swept bangs falling past the jaw
      mesh(new THREE.SphereGeometry(0.122, 32, 20, 0, TAU, 0, Math.PI * 0.62), m.hair, H, [0, 0.118, -0.012], [-0.22, 0, 0], [0.96, 1.08, 1.1]);
      const bobG = new THREE.CylinderGeometry(0.112, 0.13, 0.17, 32, 1, true, Math.PI * 0.32, Math.PI * 1.36);
      mesh(bobG, m.hair, H, [0, 0.06, -0.012], [0, 0, 0], [1.0, 1, 1.02]);
      for (const sx of [1, -1]) mesh(new THREE.CapsuleGeometry(0.03, 0.12, 4, 10), m.hair, H, [sx * 0.098, 0.07, 0.035], [0.15, 0, sx * 0.08], [0.8, 1, 0.9]);
      mesh(new THREE.CapsuleGeometry(0.02, 0.11, 4, 10), m.hair, H, [0.03, 0.182, 0.092], [0.35, 0, 1.25], [1, 1, 0.6]); // fringe
      mesh(new THREE.CapsuleGeometry(0.016, 0.07, 4, 10), m.hair, H, [-0.05, 0.185, 0.09], [0.35, 0, -1.3], [1, 1, 0.6]);
    } else if (o.hairStyle === 'quiff') {
      mesh(new THREE.SphereGeometry(0.114, 28, 18, 0, TAU, 0, Math.PI * 0.5), m.hair, H, [0, 0.118, -0.008], [-0.25, 0, 0], [0.95, 1.0, 1.05]);
      for (let i = 0; i < 11; i++) {
        const x = (i % 4 - 1.5) * 0.03, z = 0.07 - Math.floor(i / 4) * 0.05;
        mesh(new THREE.ConeGeometry(0.03, 0.1 + (i % 3) * 0.02, 7), m.hair, H, [x, 0.22 + (z > 0 ? 0.02 : 0), z], [-0.55 + Math.floor(i / 4) * 0.35, 0, x * 3]);
      }
    } else if (o.hairStyle === 'cap') {
      mesh(new THREE.SphereGeometry(0.114, 28, 18, 0, TAU, Math.PI * 0.25, Math.PI * 0.3), m.hair, H, [0, 0.112, -0.008], [-0.2, 0, 0], [0.97, 1.04, 1.06]); // sides
      mesh(new THREE.SphereGeometry(0.124, 28, 16, 0, TAU, 0, Math.PI * 0.5), m.cap, H, [0, 0.14, -0.005], [-0.12, 0, 0], [0.98, 0.95, 1.04]);
      const brim = new THREE.CylinderGeometry(0.11, 0.11, 0.012, 24, 1, false, -Math.PI / 2, Math.PI); 
      mesh(brim, m.cap, H, [0, 0.165, 0.075], [-0.12, 0, 0], [0.95, 1, 1.0]);
      mesh(new THREE.SphereGeometry(0.012, 8, 6), m.cap, H, [0, 0.262, 0.0]);
    } else if (o.hairStyle === 'messy') {
      mesh(new THREE.SphereGeometry(0.118, 22, 14, 0, TAU, 0, Math.PI * 0.55), m.hair, H, [0, 0.12, -0.01], [-0.2, 0.3, 0.1], [0.98, 1.05, 1.08]);
      for (let i = 0; i < 16; i++) {
        const a = i * 2.39, r = 0.03 + (i % 4) * 0.022;
        mesh(new THREE.ConeGeometry(0.024, 0.09, 6), m.hair, H, [Math.cos(a) * r, 0.2 - r * 0.35, Math.sin(a) * r * 1.1 - 0.005], [Math.sin(a) * 0.9 + 0.2, 0, -Math.cos(a) * 0.9]);
      }
    }
    if (o.beard === 'stubble') {
      const sm = new THREE.MeshStandardMaterial({ color: o.hair, roughness: 0.9, transparent: true, opacity: 0.4 });
      mesh(new THREE.SphereGeometry(0.084, 20, 12, -Math.PI * 0.55, Math.PI * 1.1, Math.PI * 0.5, Math.PI * 0.42), sm, H, [0, 0.062, 0.03], [0, 0, 0], [1.02, 0.97, 1.0]);
    } else if (o.beard) {
      mesh(new THREE.SphereGeometry(0.082, 20, 12, -Math.PI * 0.55, Math.PI * 1.1, Math.PI * 0.55, Math.PI * 0.4), m.hair, H, [0, 0.062, 0.03], [0, 0, 0], [1.0, 0.95, 0.98]);
    }
    if (o.outfit) this._outfit();
    // zombie wounds
    if (o.zombie) {
      mesh(new THREE.SphereGeometry(0.035, 10, 8), m.blood, H, [0.05, 0.05, 0.09], [0, 0, 0], [1.4, 0.6, 0.3]);
      mesh(new THREE.SphereGeometry(0.08, 10, 8), m.blood, J.chest, [0.04, 0.12, 0.13], [0, 0, 0], [1.2, 1.5, 0.35]);
      mesh(new THREE.SphereGeometry(0.05, 10, 8), m.blood, J.lElbow, [0, -0.12, 0.04], [0, 0, 0], [0.8, 1.5, 0.4]);
      mesh(new THREE.SphereGeometry(0.045, 10, 8), m.blood, H, [-0.02, 0.04, 0.095], [0, 0, 0], [1.6, 1.0, 0.25]); // mouth gore
      mesh(new THREE.SphereGeometry(0.07, 10, 8), m.blood, J.lHip, [0.02, -0.2, 0.07], [0, 0, 0], [1, 1.8, 0.3]);
      mesh(new THREE.SphereGeometry(0.06, 10, 8), m.blood, J.spine, [-0.06, 0.1, 0.1], [0, 0, 0], [1.2, 1.4, 0.3]);
    }
  }

  /** Character outfits: jackets (open, hooded, rolled sleeves), sleeveless turtleneck, arm wraps, cargo pants. */
  _outfit() {
    const m = this.mats, J = this.j, o = this.opts, f = o.female, O = o.outfit;
    if (O.jacket) {
      const jm = m.jacket;
      // open jacket shell over the tee
      mesh(new THREE.CylinderGeometry(0.2, 0.185, 0.4, 28, 1, true, 0.5, TAU - 1.0), jm, J.chest, [0, 0.1, -0.008], [0, 0, 0], [1.1, 1, 0.84]);
      mesh(new THREE.CylinderGeometry(0.19, 0.2, 0.2, 28, 1, true, 0.55, TAU - 1.1), jm, J.spine, [0, 0.06, 0], [0, 0, 0], [1.05, 1, 0.82]);
      // lapels / placket in lining colour
      for (const sx of [1, -1]) {
        mesh(new THREE.BoxGeometry(0.045, 0.34, 0.012), O.hood ? m.lining : jm, J.chest, [sx * 0.078, 0.12, 0.13], [-0.1, sx * -0.42, 0]);
        if (O.pockets) mesh(new THREE.BoxGeometry(0.07, 0.06, 0.012), jm, J.chest, [sx * 0.11, 0.17, 0.125], [-0.15, sx * -0.3, 0]);
      }
      // collar / hood
      if (O.hood) {
        mesh(new THREE.TorusGeometry(0.11, 0.045, 10, 28, Math.PI * 1.5), jm, J.chest, [0, 0.29, -0.03], [Math.PI / 2 - 0.25, 0, Math.PI * 0.25], [1.1, 1.0, 1.0]);
        mesh(new THREE.SphereGeometry(0.11, 18, 12, 0, TAU, 0, Math.PI * 0.5), m.lining, J.chest, [0, 0.27, -0.1], [-1.2, 0, 0], [1.1, 0.8, 0.9]);
        for (const sx of [1, -1]) mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.16, 6), m.lining, J.chest, [sx * 0.04, 0.15, 0.135], [-0.1, 0, 0]);
      } else {
        for (const sx of [1, -1]) mesh(new THREE.BoxGeometry(0.06, 0.08, 0.014), jm, J.chest, [sx * 0.07, 0.29, 0.06], [-0.6, sx * -0.6, sx * 0.3]);
      }
    } else if (O.turtleneck) {
      mesh(taper(0.07, 0.055, 0.06), m.suit, J.neck, [0, 0.06, 0]);
    }
    for (const side of [1, -1]) {
      const k = side > 0 ? 'l' : 'r';
      const sh = J[k + 'Shoulder'], el = J[k + 'Elbow'];
      if (O.sleeves === 'long' || O.sleeves === 'rolled') {
        mesh(taper(0.28, f ? 0.068 : 0.078, f ? 0.06 : 0.066), m.jacket, sh, [0, -0.0, 0]);
        if (O.sleeves === 'long') {
          mesh(taper(0.22, 0.062, 0.052), m.jacket, el, [0, -0.0, 0]);
          mesh(new THREE.TorusGeometry(0.047, 0.014, 8, 18), m.lining, el, [0, -0.22, 0], [Math.PI / 2, 0, 0]);
        } else {
          mesh(taper(0.07, 0.064, 0.06), m.jacket, el, [0, -0.0, 0]);
          mesh(new THREE.TorusGeometry(0.06, 0.02, 8, 18), m.jacket, el, [0, -0.085, 0], [Math.PI / 2, 0, 0]);
        }
      } else if (O.sleeves === 'none') {
        mesh(new THREE.SphereGeometry(0.06, 14, 10, 0, TAU, 0, Math.PI * 0.4), m.suit, sh, [0, 0.01, 0], [0, 0, side * -0.5], [1.1, 0.9, 1.05]);
      }
      if (O.wraps) for (let i = 0; i < 4; i++) mesh(new THREE.TorusGeometry(0.043 - i * 0.002, 0.012, 6, 16), m.wrap, el, [0, -0.11 - i * 0.035, 0], [Math.PI / 2 + (i % 2 ? 0.15 : -0.15), 0, 0]);
      // trouser details
      const hip = J[k + 'Hip'], knee = J[k + 'Knee'];
      if (O.cargo) mesh(new THREE.BoxGeometry(0.035, 0.12, 0.1), m.pants, hip, [side * 0.088, -0.28, 0], [0, 0, side * 0.06]);
      if (O.cuffs) mesh(new THREE.TorusGeometry(0.06, 0.022, 8, 18), m.pants, knee, [0, -0.36, 0], [Math.PI / 2, 0, 0], [1, 1, 1.4]);
      if (O.bunched) for (const y of [-0.08, -0.3]) mesh(new THREE.TorusGeometry(0.07, 0.02, 8, 18), m.pants, knee, [0, y, 0], [Math.PI / 2 + 0.2, 0, 0], [1.05, 1, 1]);
      if (O.watch && side < 0) mesh(new THREE.TorusGeometry(0.045, 0.013, 8, 18), new THREE.MeshStandardMaterial({ color: 0xd08030, metalness: 0.4, roughness: 0.4 }), el, [0, -0.23, 0], [Math.PI / 2, 0, 0]);
    }
  }

  _labCoat() {
    const m = this.mats, J = this.j;
    // coat torso shell
    mesh(new THREE.CylinderGeometry(0.175, 0.16, 0.36, 24, 1, true, 0.42, TAU - 0.84), m.coat, J.chest, [0, 0.1, -0.005], [0, 0, 0], [1.08, 1, 0.82]);
    for (const sx of [1, -1]) mesh(new THREE.BoxGeometry(0.05, 0.3, 0.012), m.coat, J.chest, [sx * 0.075, 0.12, 0.122], [-0.12, sx * -0.35, 0]);
    // coat skirt hanging from hips
    const skirt = new THREE.CylinderGeometry(0.175, 0.22, 0.5, 24, 3, true, 0.38, TAU - 0.76);
    this.coatSkirt = mesh(skirt, m.coat, J.hips, [0, -0.2, 0], [0, 0, 0], [1.05, 1, 0.82]);
    // blood smear on coat
    mesh(new THREE.SphereGeometry(0.06, 10, 8), m.blood, J.chest, [-0.08, 0.0, 0.16], [0, 0, 0], [1.3, 2.0, 0.25]);
  }

  /** Drop spring history so a teleported/re-posed character doesn't ease from its old pose. */
  snap() { this._sm = null; this._sv = null; this._bs = null; this._prevYaw = undefined; this._prevSpeed = undefined; }

  setState(name, blendRate = 6) { if (this.state !== name) { this.state = name; this.blendRate = blendRate; if (!(name in this.weights)) this.weights[name] = 0; } }

  // ---------------------------------------------------------------- poses
  _pose(name, t) {
    const P = {}; const B = { y: 0, rx: 0, z: 0, x: 0 };
    const s = Math.sin, c = Math.cos, ph = this.phase;
    const set = (k, x = 0, y = 0, z = 0) => (P[k] = [x, y, z]);
    const breathe = s(t * 1.5) * 0.025;
    switch (name) {
      case 'idle': {
        // slow weight shift from leg to leg, as people do when standing
        const ws = Math.sin(t * 0.33 + this.seed) * 0.8 + Math.sin(t * 0.71 + this.seed * 2) * 0.2;
        set('hips', 0, s(t * 0.4) * 0.03, ws * 0.045);
        set('spine', 0.02 + breathe * 0.5, 0, -ws * 0.03); set('chest', -0.02 - breathe, 0, -ws * 0.015);
        set('neck', 0.05 + s(t * 0.3) * 0.03, s(t * 0.21 + this.seed) * 0.15 + (s(t * 0.13) > 0.93 ? 0.35 : 0), ws * 0.02); set('head', 0.0, 0, s(t * 0.27) * 0.04);
        set('lShoulder', 0.05 + breathe, 0, 0.1 + ws * 0.02); set('rShoulder', 0.05 + breathe, 0, -0.1 + ws * 0.02);
        set('lElbow', -0.18 - breathe); set('rElbow', -0.2 - breathe); set('lHand', 0, 0, -0.1); set('rHand', 0, 0, 0.1);
        set('lHip', -0.02, 0.05, 0.03 - ws * 0.045); set('rHip', 0.02, -0.05, -0.03 - ws * 0.045);
        set('lKnee', 0.05 + Math.max(0, -ws) * 0.16); set('rKnee', 0.03 + Math.max(0, ws) * 0.16);
        set('lFoot', -0.03 - Math.max(0, -ws) * 0.08); set('rFoot', -0.03 - Math.max(0, ws) * 0.08);
        B.x = ws * 0.03;
        break;
      }
      case 'alarmed': {
        set('hips', 0, s(t * 1.1) * 0.1, 0);
        set('spine', 0.08 + breathe * 2); set('chest', -0.05);
        set('neck', 0.0, s(t * 0.9) * 0.5); set('head', -0.05);
        set('lShoulder', -0.3, 0, 0.25); set('rShoulder', -0.3, 0, -0.25);
        set('lElbow', -0.9); set('rElbow', -0.9);
        set('lHip', -0.1, 0.1, 0.08); set('rHip', 0.05, -0.1, -0.08); set('lKnee', 0.2); set('rKnee', 0.12); set('lFoot', -0.1); set('rFoot', -0.08);
        B.y = -0.02;
        break;
      }
      case 'walk': case 'run': case 'crouchWalk': case 'crouch': {
        const run = name === 'run', cr = name === 'crouchWalk' || name === 'crouch';
        const moving = name !== 'crouch';
        const A = moving ? (run ? 1.0 : cr ? 0.45 : 0.55) : 0;
        const sp = s(ph), cp = c(ph);
        const baseHip = cr ? -1.0 : 0, baseKnee = cr ? 1.9 : 0;
        set('hips', 0, sp * 0.09 * A, -sp * 0.05 * A);
        set('spine', (run ? 0.18 : 0.05) + (cr ? 0.35 : 0) + breathe * 0.4, 0, 0);
        set('chest', cr ? 0.15 : 0.0, -sp * 0.18 * A, 0);
        set('neck', cr ? -0.35 : run ? -0.12 : 0.0, sp * 0.06 * A); set('head', cr ? -0.15 : 0);
        const kneeSwingL = Math.max(0, cp) * (run ? 1.5 : cr ? 0.7 : 0.9);
        const kneeSwingR = Math.max(0, -cp) * (run ? 1.5 : cr ? 0.7 : 0.9);
        set('lHip', baseHip - sp * 0.55 * A, 0, 0.02); set('rHip', baseHip + sp * 0.55 * A, 0, -0.02);
        set('lKnee', baseKnee + 0.1 + kneeSwingL); set('rKnee', baseKnee + 0.1 + kneeSwingR);
        // foot roll: heel strike (toe up) at contact, toe push-off as the leg trails
        const rollL = Math.max(0, -sp) * 0.35 - Math.max(0, cp) * 0.25, rollR = Math.max(0, sp) * 0.35 - Math.max(0, -cp) * 0.25;
        set('lFoot', (cr ? -0.95 : 0) - 0.05 + rollL * A * 1.4); set('rFoot', (cr ? -0.95 : 0) - 0.05 + rollR * A * 1.4);
        B.x = sp * 0.028 * A;
        const armA = run ? 0.95 : cr ? 0.25 : 0.45;
        set('lShoulder', sp * armA * (moving ? 1 : 0) + (cr ? -0.35 : 0), 0, 0.08); set('rShoulder', -sp * armA * (moving ? 1 : 0) + (cr ? -0.35 : 0), 0, -0.08);
        set('lElbow', run ? -1.35 : cr ? -1.1 : -0.3 - Math.max(0, -sp) * 0.3); set('rElbow', run ? -1.35 : cr ? -1.1 : -0.3 - Math.max(0, sp) * 0.3);
        set('lHand'); set('rHand');
        B.y = (cr ? -0.42 : 0) + c(ph * 2) * (run ? 0.045 : 0.022) * A - (run ? 0.04 : 0);
        break;
      }
      case 'crawl': {
        const sp = s(ph);
        set('hips', 1.42, 0, sp * 0.05);
        set('spine', 0.02, sp * 0.06); set('chest', 0.02, -sp * 0.08);
        set('neck', -0.95); set('head', -0.35);
        set('lShoulder', -1.45 + sp * 0.32, 0, 0.12); set('rShoulder', -1.45 - sp * 0.32, 0, -0.12);
        set('lElbow', -0.25 - Math.max(0, -c(ph)) * 0.5); set('rElbow', -0.25 - Math.max(0, c(ph)) * 0.5);
        set('lHand', 0.6); set('rHand', 0.6);
        set('lHip', -1.45 - sp * 0.28, 0, 0.06); set('rHip', -1.45 + sp * 0.28, 0, -0.06);
        set('lKnee', 1.55 + Math.max(0, c(ph)) * 0.35); set('rKnee', 1.55 + Math.max(0, -c(ph)) * 0.35);
        set('lFoot', 0.5); set('rFoot', 0.5);
        B.y = -0.5 + Math.abs(c(ph)) * 0.02;
        break;
      }
      case 'sleep': {
        set('hips'); set('spine', 0.0 + breathe * 0.6); set('chest', -breathe);
        set('neck', 0.25, s(t * 0.1) * 0.08 + 0.25); set('head', 0.05, 0, 0.1);
        set('lShoulder', 0.05, 0, 0.12); set('rShoulder', -0.2, 0, -0.35);
        set('lElbow', -0.3); set('rElbow', -1.6); set('lHand'); set('rHand');
        set('lHip', -0.05, 0, 0.06); set('rHip', -0.25, 0, -0.03); set('lKnee', 0.1); set('rKnee', 0.45); set('lFoot', 0.5); set('rFoot', 0.4);
        B.rx = -Math.PI / 2; B.y = 0.14; B.z = 0;
        break;
      }
      case 'sitBed': {
        set('hips', -0.05); set('spine', 0.25 + breathe); set('chest', 0.1);
        set('neck', 0.2, s(t * 0.7) * 0.4); set('head', 0.1);
        set('lShoulder', -0.35, 0, 0.15); set('rShoulder', -0.35, 0, -0.15);
        set('lElbow', -0.9); set('rElbow', -0.9); set('lHand', 0.4); set('rHand', 0.4);
        set('lHip', -1.5, 0.08, 0.05); set('rHip', -1.5, -0.08, -0.05); set('lKnee', 1.45); set('rKnee', 1.5); set('lFoot', 0.0); set('rFoot', 0.0);
        B.y = -0.42;
        break;
      }
      case 'sit': {
        set('hips', -0.08); set('spine', 0.28 + breathe); set('chest', 0.08);
        set('neck', 0.05, s(t * 0.4) * 0.15); set('head', 0.0);
        set('lShoulder', -0.55, 0, 0.12); set('rShoulder', -0.55, 0, -0.12);
        set('lElbow', -0.75); set('rElbow', -0.75); set('lHand', 0.3); set('rHand', 0.3);
        set('lHip', -1.5, 0.15, 0.1); set('rHip', -1.5, -0.15, -0.1); set('lKnee', 1.4); set('rKnee', 1.45); set('lFoot', 0.05); set('rFoot', 0.05);
        B.y = -0.47;
        break;
      }
      case 'kneel': {
        set('hips', 0.0); set('spine', 0.35); set('chest', 0.12);
        set('neck', 0.25); set('head', 0.1);
        set('lShoulder', -0.9, 0, 0.1); set('rShoulder', -1.0, 0, -0.1); set('lElbow', -0.6); set('rElbow', -0.5);
        set('lHip', -1.5, 0, 0.05); set('rHip', -0.1, 0, -0.05); set('lKnee', 1.5); set('rKnee', 1.6); set('lFoot', 0.0); set('rFoot', 0.9);
        B.y = -0.47;
        break;
      }
      // ------------------------------------------------ infected
      case 'zIdle': { // "meditating": still, head hung, slow sway, occasional twitch
        const tw = this.twitch;
        set('hips', 0.0, s(t * 0.23) * 0.06, s(t * 0.31) * 0.04);
        set('spine', 0.25 + s(t * 0.4) * 0.02, 0, s(t * 0.29) * 0.05); set('chest', 0.12 + breathe * 0.3);
        set('neck', 0.55 + tw * -0.6, s(t * 0.17) * 0.2 + tw * 0.5, 0.35 + s(t * 0.13) * 0.1); set('head', 0.2, 0, 0.15);
        set('lShoulder', -0.05, 0, 0.05); set('rShoulder', 0.1, 0, -0.04); set('lElbow', -0.15); set('rElbow', -0.35); set('lHand', 0.3, 0, -0.3); set('rHand', 0.4, 0, 0.4);
        set('lHip', -0.04, 0.12, 0.04); set('rHip', 0.06, -0.15, -0.05); set('lKnee', 0.18); set('rKnee', 0.08); set('lFoot', -0.12); set('rFoot', -0.04);
        B.y = -0.03;
        break;
      }
      case 'zWalk': { // shamble, right leg drags
        const sp = s(ph), cp = c(ph);
        set('hips', 0, sp * 0.18, sp * 0.1);
        set('spine', 0.35, 0, sp * 0.08); set('chest', 0.15, -sp * 0.15, 0);
        set('neck', 0.45 + s(t * 2.3) * 0.1, s(t * 0.9) * 0.3, 0.3); set('head', 0.1);
        set('lShoulder', -0.9 + sp * 0.15, 0, 0.12); set('rShoulder', -0.4 - sp * 0.1, 0, -0.1);
        set('lElbow', -0.25); set('rElbow', -0.6); set('lHand', 0.5); set('rHand', 0.6);
        set('lHip', -sp * 0.5, 0, 0.04); set('rHip', sp * 0.25, 0.25, -0.04);
        set('lKnee', 0.15 + Math.max(0, cp) * 0.8); set('rKnee', 0.1 + Math.max(0, -cp) * 0.25); set('lFoot', -0.1); set('rFoot', 0.3);
        B.y = c(ph * 2) * 0.03 - 0.04;
        break;
      }
      case 'zRun': {
        const sp = s(ph), cp = c(ph);
        set('hips', 0.0, sp * 0.15, sp * 0.08);
        set('spine', 0.5, 0, sp * 0.1); set('chest', 0.2, -sp * 0.25);
        set('neck', -0.35 + s(t * 7) * 0.08, s(t * 3) * 0.15, 0.1); set('head', -0.15);
        set('lShoulder', -1.35 + sp * 0.4, 0, 0.25); set('rShoulder', -1.35 - sp * 0.4, 0, -0.25);
        set('lElbow', -0.3 - s(t * 9) * 0.2); set('rElbow', -0.3 + s(t * 9) * 0.2); set('lHand', -0.5); set('rHand', -0.5);
        set('lHip', -sp * 0.85, 0, 0.05); set('rHip', sp * 0.85, 0, -0.05);
        set('lKnee', 0.2 + Math.max(0, cp) * 1.4); set('rKnee', 0.2 + Math.max(0, -cp) * 1.4); set('lFoot', -0.2); set('rFoot', -0.2);
        B.y = c(ph * 2) * 0.05 - 0.07;
        break;
      }
      case 'zScream': {
        const k = Math.min(1, Math.max(0, (t % 100)));
        set('hips', -0.1); set('spine', -0.15 + s(t * 20) * 0.02); set('chest', -0.25);
        set('neck', -0.55 + s(t * 25) * 0.03, s(t * 13) * 0.05); set('head', -0.4);
        set('lShoulder', -0.2, 0, 0.9); set('rShoulder', -0.2, 0, -0.9); set('lElbow', -0.6); set('rElbow', -0.6); set('lHand', 0, 0, -0.6); set('rHand', 0, 0, 0.6);
        set('lHip', -0.15, 0, 0.12); set('rHip', 0.1, 0, -0.12); set('lKnee', 0.25); set('rKnee', 0.15); set('lFoot', -0.1); set('rFoot', 0);
        B.y = -0.03 * k;
        break;
      }
      case 'zPound': {
        const a = s(t * 7.5), b = s(t * 7.5 + Math.PI);
        set('hips', -0.05, s(t * 3.75) * 0.1); set('spine', 0.2 + Math.max(a, b) * 0.1); set('chest', 0.1, s(t * 7.5) * 0.15);
        set('neck', 0.1 + s(t * 11) * 0.05, s(t * 5) * 0.25); set('head', 0.0);
        set('lShoulder', -2.3 + a * 0.6, 0, 0.2); set('rShoulder', -2.3 + b * 0.6, 0, -0.2);
        set('lElbow', -0.5 - Math.max(0, a) * 0.6); set('rElbow', -0.5 - Math.max(0, b) * 0.6); set('lHand', 0.3); set('rHand', 0.3);
        set('lHip', -0.25, 0, 0.05); set('rHip', 0.15, 0, -0.05); set('lKnee', 0.35); set('rKnee', 0.2); set('lFoot', -0.1); set('rFoot', -0.1);
        B.y = -0.05;
        break;
      }
      case 'zFeed': { // crouched over a body
        set('hips', 0.3); set('spine', 0.6); set('chest', 0.3);
        set('neck', 0.3 + s(t * 6) * 0.15, s(t * 2) * 0.2); set('head', 0.2 + s(t * 8) * 0.1);
        set('lShoulder', -1.2 + s(t * 4) * 0.2, 0, 0.2); set('rShoulder', -1.0 + s(t * 4.5) * 0.2, 0, -0.2); set('lElbow', -1.0); set('rElbow', -1.2);
        set('lHip', -1.6, 0, 0.15); set('rHip', -0.5, 0, -0.2); set('lKnee', 2.3); set('rKnee', 1.9); set('lFoot', -0.6); set('rFoot', 0.5);
        B.y = -0.58;
        break;
      }
      case 'dead': {
        set('hips'); set('spine', -0.1, 0.2); set('chest', 0, 0.1); set('neck', -0.2, 0.9); set('head', 0, 0.2);
        set('lShoulder', -0.2, 0, 1.4); set('rShoulder', -2.6, 0, -0.4); set('lElbow', -0.6); set('rElbow', -0.3);
        set('lHip', -0.1, 0, 0.25); set('rHip', -0.5, 0, -0.1); set('lKnee', 0.2); set('rKnee', 1.1); set('lFoot', 0.6); set('rFoot', 0.3);
        B.rx = -Math.PI / 2; B.y = 0.12;
        break;
      }
      default: return this._pose('idle', t);
    }
    return { P, B };
  }

  /**
   * Advance animation. `dt` seconds.
   * Speed-driven gait phase keeps feet planted (stride ≈ 1.4 m walk, 2.2 m run).
   */
  update(dt) {
    this.time += dt;
    if (!this.root.visible) return; // off-screen area / hidden: skip ~60 joint updates per character
    const t = this.time;
    // gait phase
    const st = this.state;
    const [base, ref] = st === 'run' || st === 'zRun' ? [2.4, 4.6] : st === 'crawl' ? [0.9, 1.1] : st === 'crouchWalk' ? [1.0, 1.35] : st === 'zWalk' ? [1.1, 0.8] : [1.45, 2.1];
    // above the reference speed the stride lengthens (cadence ∝ √speed) — fast but natural, never a leg blur
    const stride = base * Math.max(1, Math.sqrt(this.speed / ref));
    this.phase += (this.speed / stride) * TAU * dt;
    // footstep callbacks
    const sgn = Math.sign(Math.sin(this.phase));
    if (this.speed > 0.15 && sgn !== this._lastStepSign) { this._lastStepSign = sgn; this.onStep?.(this); }
    // twitch (zombie)
    this.twitch = damp(this.twitch, Math.random() < 0.004 ? 1 : 0, 9, dt);

    // weights toward current state
    let total = 0;
    for (const k of Object.keys(this.weights)) {
      this.weights[k] = damp(this.weights[k], k === this.state ? 1 : 0, this.blendRate, dt);
      if (this.weights[k] < 0.001 && k !== this.state) delete this.weights[k];
      else total += this.weights[k];
    }
    const out = {}; const B = { y: 0, rx: 0, z: 0, x: 0 };
    for (const name of JOINTS) out[name] = [0, 0, 0];
    for (const [k, w0] of Object.entries(this.weights)) {
      const w = w0 / total;
      const { P, B: bp } = this._pose(k, t);
      for (const name of JOINTS) { const v = P[name]; if (v) { out[name][0] += v[0] * w; out[name][1] += v[1] * w; out[name][2] += v[2] * w; } }
      B.y += bp.y * w; B.rx += bp.rx * w; B.z += bp.z * w; B.x += bp.x * w;
    }
    // additive look-at on neck/head
    out.neck[1] += this.lookYaw * 0.5; out.head[1] += this.lookYaw * 0.5;
    out.neck[0] += this.lookPitch * 0.5; out.head[0] += this.lookPitch * 0.5;
    // additive reach (right arm forward, e.g. press a panel / shake a shoulder)
    this.reach = damp(this.reach, this.reachTarget, 8, dt);
    if (this.reach > 0.001) {
      const r = this.reach;
      out.rShoulder[0] = lerp(out.rShoulder[0], -1.35, r); out.rShoulder[2] = lerp(out.rShoulder[2], -0.1, r);
      out.rElbow[0] = lerp(out.rElbow[0], -0.25 + Math.sin(t * 9) * 0.08 * r, r);
      out.rHand[0] = lerp(out.rHand[0], -0.3, r);
    }
    // --- whole-body dynamics: lean into acceleration, bank into turns, keep the gaze level
    const yaw = this.root.rotation.y;
    let dyaw = yaw - (this._prevYaw ?? yaw); dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
    this._prevYaw = yaw;
    const yawRate = dt > 0 ? dyaw / dt : 0;
    const accel = dt > 0 ? (this.speed - (this._prevSpeed ?? this.speed)) / dt : 0;
    this._prevSpeed = this.speed;
    const upright = Math.abs(B.rx) < 0.3 && this.state !== 'crawl';
    this._lean = damp(this._lean ?? 0, upright ? THREE.MathUtils.clamp(accel * 0.035 + this.speed * 0.025, -0.15, 0.3) : 0, 6, dt);
    this._bank = damp(this._bank ?? 0, upright ? THREE.MathUtils.clamp(-yawRate * this.speed * 0.045, -0.22, 0.22) : 0, 6, dt);
    out.spine[0] += this._lean; out.neck[0] -= this._lean * 0.7;
    out.hips[2] += this._bank; out.neck[2] -= this._bank * 0.6;
    if (upright && this.speed > 0.3) out.neck[0] -= Math.cos(this.phase * 2) * 0.03 * Math.min(1, this.speed / 3);
    this.custom?.(out, B, t);
    // --- per-joint critically-damped springs: removes pops between poses and gives
    // arms/head natural follow-through while legs stay crisp
    if (!this._sm) { this._sm = {}; this._sv = {}; for (const n of JOINTS) { this._sm[n] = out[n].slice(); this._sv[n] = [0, 0, 0]; } }
    const h = Math.min(dt, 1 / 30);
    for (const name of JOINTS) {
      const w = SPRING[name] ?? 18, cur = this._sm[name], vel = this._sv[name], tgt = out[name];
      for (let k = 0; k < 3; k++) {
        const a = w * w * (tgt[k] - cur[k]) - 2 * w * vel[k];
        vel[k] += a * h; cur[k] += vel[k] * h;
      }
      this.j[name].rotation.set(cur[0], cur[1], cur[2]);
    }
    const bs = this._bs || (this._bs = { y: B.y, rx: B.rx, x: B.x, z: B.z });
    const kb = 1 - Math.exp(-14 * dt);
    bs.y += (B.y - bs.y) * kb; bs.rx += (B.rx - bs.rx) * (1 - Math.exp(-8 * dt)); bs.x += (B.x - bs.x) * kb; bs.z += (B.z - bs.z) * kb;
    this.body.position.set(bs.x, bs.y * this.scale, bs.z);
    this.body.rotation.x = bs.rx;
    this.body.rotation.z = this._bank * 0.5;

    // blink
    this.blinkT -= dt;
    let lid = 0.4;
    if (this.opts.zombie) lid = 0.25; else if (this.state === 'sleep') lid = 1.0; else if (this.blinkT < 0) { lid = 1.0; if (this.blinkT < -0.12) this.blinkT = 2 + Math.random() * 4; }
    this.eyes.forEach((e) => (e.lid.scale.y = lid * 1.05 + 0.0));
    // mouth: zombie scream opens jaw
    if (this.mouth) this.mouth.scale.set(1, 1, (this.state === 'zScream' ? 4 : 0.6) + (this.opts.zombie ? Math.max(0, Math.sin(t * 2)) : 0));
    // hair spring
    if (this.hairPivot) {
      const target = -this.speed * 0.25 + Math.sin(t * 2) * 0.03 + (out.neck[0] + out.head[0]) * -0.8;
      this._hairVel += (target - this._hairAng) * 60 * dt; this._hairVel *= Math.exp(-6 * dt);
      this._hairAng += this._hairVel * dt;
      this.hairPivot.rotation.x = 0.35 + this._hairAng;
      this.hairPivot.rotation.z = Math.sin(this.phase) * 0.15 * Math.min(1, this.speed);
    }
    if (this.coatSkirt) this.coatSkirt.rotation.x = -Math.min(0.4, this.speed * 0.12);
  }

  /** World position of the head (for cameras / look-at). */
  headWorld(v = new THREE.Vector3()) { return this.j.head.getWorldPosition(v).add(new THREE.Vector3(0, 0.1, 0)); }

  get position() { return this.root.position; }
  get yaw() { return this.root.rotation.y; }
  set yaw(v) { this.root.rotation.y = v; }
}

export function createMax() {
  // Lead: full beard, light-grey cap, rust-brown jacket with rolled sleeves, white tee, grey jeans, brown boots
  return new Humanoid({ name: 'Max', casual: true, suit: 0xb9b9b4, pants: 0x9b9fa4, suit2: 0x37506a, accent: 0x5ff3ff, skin: 0xb98163, hair: 0x3a2416, hairStyle: 'cap', beard: true,
    outfit: { jacket: 0x8a4a3e, sleeves: 'rolled', pockets: true, bunched: true, shoes: 0x6b4430, sole: 0xc0864a, cap: 0xcfcfca } });
}
export function createSean() {
  // Pink hooded jacket (orange/teal lining), white tee, lilac cargo pants, swept quiff
  return new Humanoid({ name: 'Sean', casual: true, suit: 0xbdbdb8, pants: 0x9a8a96, suit2: 0x5a4733, accent: 0xffa040, skin: 0xd8a27c, hair: 0x5a4030, hairStyle: 'quiff', height: 1.02,
    outfit: { jacket: 0xe0607e, lining: 0xf0a030, hood: true, sleeves: 'long', cargo: true, cuffs: true, watch: true, shoes: 0xeeeeee, sole: 0x999999 } });
}
export function createAnna() {
  // Black bob, sleeveless dark-grey turtleneck, forearm wraps, black leggings, grey loafers
  return new Humanoid({ name: 'Anna', female: true, casual: true, suit: 0x4a4b4e, pants: 0x16171a, suit2: 0x4e3d63, accent: 0xff5fd2, skin: 0xf0c7a8, hair: 0x0e0f12, hairStyle: 'bob',
    outfit: { turtleneck: true, sleeves: 'none', wraps: true, shoes: 0x55585c, sole: 0x2a2a2a } });
}

const ZOMBIE_SKINS = [0x8f9a86, 0x9aa294, 0x7c8577, 0xa3a89a, 0x6f776a];
export function createZombie(i = 0) {
  const lab = i % 3 !== 2;
  const z = new Humanoid({
    name: 'Infected', zombie: true, labCoat: lab,
    suit: [0x7c8086, 0x6a7078, 0x8c8a84, 0x5e646c][i % 4], pants: [0x55595e, 0x4a4f55, 0x62605a][i % 3], suit2: 0x3a3a3a, accent: 0x000000,
    skin: ZOMBIE_SKINS[i % ZOMBIE_SKINS.length], hair: [0x1a1410, 0x3a2a1a, 0x0a0a0a, 0x5a4a3a][i % 4],
    hairStyle: ['messy', 'buzz', 'ponytail', 'short'][i % 4], female: i % 4 === 2, height: 0.96 + (i % 5) * 0.025,
  });
  z.phase = Math.random() * 10;
  z.time = Math.random() * 100;
  z.setState('zIdle'); z.weights = { zIdle: 1 };
  return z;
}
