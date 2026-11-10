import * as THREE from 'three';
import { createMax, createSean, createAnna, createZombie } from '../characters/humanoid.js';
import { PlayerController, ThirdPersonCamera, Follower, nearestWalkable } from './controller.js';
import { saveProgress } from './progress.js';
import { installLevels } from './levels.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const HANG = new Promise(() => {});

const L1_TASKS = [
  { id: 'door', text: 'Secure the storage door — silently' },
  { id: 'weapons', text: 'Find something to fight with' },
  { id: 'food', text: 'Find food and water' },
  { id: 'protection', text: 'Find protection' },
  { id: 'medical', text: 'Find medical supplies' },
  { id: 'plan', text: 'Regroup and plan the next move' },
];

/**
 * PROLOGUE — OUTBREAK
 * Beats: intro → wake → door → search → vent → duct → storage → ending
 * Checkpoints: door, search, storage
 */
export class Story {
  constructor(game) {
    this.g = game;
    const { renderer, station, input, audio, hud } = game;
    this.station = station; this.input = input; this.audio = audio; this.hud = hud;
    this.scene = renderer.scene;
    this.time = 0;
    this.token = 0;
    this.timers = [];
    this.interactables = [];
    this.trail = [];
    this.zombies = [];
    this.checkpoint = 'intro';

    this.max = createMax(); this.sean = createSean(); this.anna = createAnna();
    [this.max, this.sean, this.anna].forEach((c) => this.scene.add(c.root));
    this.player = new PlayerController(this.max, input, audio);
    this.cam = new ThirdPersonCamera(renderer.camera, station.camColliders);
    this.fSean = new Follower(this.sean, this.player, 0);
    this.fAnna = new Follower(this.anna, this.player, 1);
    const fstep = (c) => this.audio.footstep(c.position, c.state === 'crouchWalk' ? 0.08 : 0.3);
    this.sean.onStep = fstep; this.anna.onStep = fstep;

    // suit lamp follows Max's chest
    const L = station.lights.suit;
    this.suitLamp = L;
    // infected: 6 in the hab corridor, 5 in the logistics hallway
    for (let i = 0; i < 11; i++) {
      const z = createZombie(i);
      this.scene.add(z.root);
      this.zombies.push({ c: z, group: i < 6 ? 'corridor' : 'hall', mode: 'idle', target: null, speed: 0, groanT: 2 + Math.random() * 8, poundT: 0 });
    }
    // dead crewman in corridor (Dr. Okafor's victim)
    this.corpse = createZombie(3);
    this.corpse.mats.skin.color.set(0xb88a6a);
    this.corpse.setState('dead'); this.corpse.weights = { dead: 1 }; this.corpse.snap();
    this.scene.add(this.corpse.root);
    this.corpse.root.position.set(2.0, 0, 6.6); this.corpse.yaw = 1.2;
  }

  // ---------------------------------------------------------------- scripting primitives
  /** Guard a promise so stale beat scripts (after a retry) silently stop. */
  _guardBeat(p) { const tk = this.token; return p.then((v) => (tk === this.token ? v : HANG)); }
  wait(sec) { return this._guardBeat(new Promise((res) => this.timers.push({ t: this.time + sec, res }))); }
  say(name, text, hold) { return this._guardBeat(this.hud.say(name, text, hold)); }
  shot(pos, look, dur, ease) { return this._guardBeat(this.cam.shot(pos, look, dur, ease)); }
  walk(f, pos, speed, state) { return this._guardBeat(f.walkTo(pos, speed, state)); }
  tween(dur, fn, ease = (x) => x * x * (3 - 2 * x)) {
    return this._guardBeat(new Promise((res) => {
      const start = this.time;
      const step = { t: 0, tick: () => { const k = Math.min(1, (this.time - start) / dur); fn(ease(k)); if (k >= 1) { res(); return true; } return false; } };
      this._tweens = this._tweens || []; this._tweens.push(step);
    }));
  }

  _faceEachOther() {
    const cs = [this.max, this.sean, this.anna];
    const cx = cs.reduce((a, c) => a + c.position.x, 0) / 3, cz = cs.reduce((a, c) => a + c.position.z, 0) / 3;
    cs.forEach((c) => (c.yaw = Math.atan2(cx - c.position.x, cz - c.position.z)));
  }

  /** Fast-forward the current cutscene (6x time, subtitles auto-advance) until control returns. */
  skipCinematic() { if (document.body.classList.contains('cinematic')) this.ff = true; }

  toggleLight() { this.lightOn = !this.lightOn; this._applyLight(); return this.lightOn; }

  _applyLight() {
    const base = { Q: 6, D: 12, S: 8, C: 10 }[this.area] ?? 8;
    this.suitLamp.intensity = this.lightOn ? base : 0;
  }

  /** Level checklist (also mirrored in the TASKS panel). */
  setTasks(level, items) { this.levelName = level; this.taskList = items.map((t) => ({ ...t, done: !!t.done })); this.hud.tasks(level, this.taskList); }
  completeTask(id) {
    const t = this.taskList?.find((x) => x.id === id); if (!t || t.done) return;
    t.done = true; this.hud.tasks(this.levelName, this.taskList); this.hud.toast(`✓ ${t.text.toUpperCase()}`, 2.2); this.audio.uiSound('on');
  }

  cinematic(on) {
    if (!on) this.ff = false;
    this.hud.cinematic(on);
    this.player.enabled = !on;
    if (!on) { this.cam.release(); this.hud.clearSub(); }
  }

  addInteract(o) { this.interactables.push(Object.assign({ r: 1.2, enabled: true }, o)); return o; }
  removeInteract(id) { this.interactables = this.interactables.filter((i) => i.id !== id); }

  setArea(a) {
    this.area = a; this.player.area = a; this.station.setArea(a);
    const S = this.station;
    S.corridor.visible = a === 'Q';
    S.quarters.visible = a === 'Q' || a === 'D';
    S.storage.visible = S.hallway.visible = a === 'D' || a === 'S' || a === 'C';
    S.deck.visible = a === 'C';
    S.duct.visible = a === 'D' || a === 'Q';
    S.sparks.visible = a === 'Q';
    this.zombies.forEach((z) => (z.c.root.visible = z.group === 'deck' ? a === 'C' : (z.group === 'corridor' && a === 'Q') || (z.group === 'hall' && a !== 'Q' && a !== 'C')));
    this.corpse.root.visible = a === 'Q';
    this.lightOn = a !== 'Q' || !!this.darkness;
    this._applyLight();
    document.querySelector('[data-tb="light"]')?.classList.toggle('on', this.lightOn);
  }

  resetZombies(group) {
    const corridor = [[2.35, 6.45, 0.9, 'zFeed'], [-5.5, 7.4, 2.4, 'zIdle'], [-2.6, 5.7, -0.6, 'zIdle'], [5.4, 7.8, 3.6, 'zIdle'], [7.6, 5.6, -1.4, 'zIdle'], [-8.4, 6.0, 1.6, 'zIdle']];
    const hall = [[6.95, 0.85, Math.PI / 2 + 0.3, 'zIdle'], [8.1, -1.3, -0.4, 'zIdle'], [9.3, 1.6, 2.6, 'zIdle'], [10.8, -0.2, 1.4, 'zIdle'], [8.7, 3.0, -2.4, 'zIdle']];
    this.zombies.forEach((z, i) => {
      if (z.group === 'deck') z.group = i < 6 ? 'corridor' : 'hall'; // back from Levels 2–3
      if (z.group !== group) return;
      const d = group === 'corridor' ? corridor[i] : hall[i - 6];
      const y = group === 'corridor' ? 0 : -4.6;
      z.c.root.position.set(d[0], y, d[1]); z.c.yaw = d[2];
      z.c.setState(d[3]); z.c.weights = { [d[3]]: 1 }; z.c.snap(); z.mode = 'idle'; z.target = null; z.speed = 0; z.c.speed = 0;
      z.home = z.c.root.position.clone();
    });
  }

  // ---------------------------------------------------------------- beats
  async start(beat = 'intro') {
    this.token++;
    this.timers = []; this._tweens = []; this.interactables = [];
    this.hud.clearSub(); this.hud.prompt(null); this.hud.qte(0, false); this.hud.noise(0, false); this.hud.timer(0, false);
    this.audio.setHeartbeat(0);
    this.glassTimer = null; this.stealth = null; this.qte = null; this.doorHold = null;
    this.deckAI = null; this.zones = []; this.doorTimer = null; this.bayHold = null;
    document.getElementById('align')?.remove(); document.body.classList.remove('minigame');
    if (!['l2intro', 'l2ctrl', 'l3'].includes(beat)) { this.darkness = false; if (this.station.blackout) this.station.setBlackout(false); }
    [this.max, this.sean, this.anna].forEach((c) => (c.root.visible = true));
    this.g.tabletEnabled = beat !== 'intro' && beat !== 'door' && beat !== 'search' ? true : this.g.tabletEnabled;
    this.max.reachTarget = 0; this.sean.custom = this.anna.custom = this.max.custom = null;
    this.fSean.scripted = this.fAnna.scripted = null;
    this.beat = beat;
    if (['door', 'search', 'storage'].includes(beat)) this.checkpoint = beat;
    return this['beat_' + beat]();
  }

  _placeCrew(area, max, sean, anna) {
    this.setArea(area);
    const set = (c, [x, z, yaw, st]) => { c.root.position.set(x, this.g.areas[area].floorY, z); c.yaw = yaw; c.setState(st || 'idle'); c.weights = { [st || 'idle']: 1 }; c.snap(); c.speed = 0; };
    set(this.max, max); set(this.sean, sean); set(this.anna, anna);
    this.player.camYaw = max[2]; this.player.camPitch = 0.12; this.player.vel.set(0, 0, 0);
    this.trail = [];
    this.cam.dist = 2.5;
  }

  async beat_intro() {
    const S = this.station;
    S.redAlert = false; S._qKeyBase = 3.5;
    this.setArea('Q');
    S.lights.qKey.intensity = 3.5;
    S.ceilPanels.forEach((p) => (p.material.emissiveIntensity = 0.25));
    S.setGlassDoor(0.55, true); S.setCrack(0); S.doorPanelLight.material.emissive.set(0xffa526);
    S.ventGrate.position.copy(S.ventGrateHome); S.ventGrate.rotation.set(0, 0, 0);
    S.tablet.visible = true; S.tabletGlow.intensity = 0.6;
    S.setStorageDoor(0.45, true); S.storagePanelLight.material.emissive.set(0xff3b3b);
    this.resetZombies('corridor'); this.resetZombies('hall');
    // crew asleep in their pods (head toward the wall, -Z)
    const lie = (c, x) => { c.root.position.set(x, 0.47, -1.82); c.yaw = 0; c.setState('sleep'); c.weights = { sleep: 1 }; c.snap(); };
    lie(this.max, 0); lie(this.sean, -3); lie(this.anna, 3);
    this.fSean.active = this.fAnna.active = false;
    this.cinematic(true);
    this.hud.objective(null);
    this.audio.startAmbience();
    this.audio.startMusic('calm');
    this.g.renderer.fx.uDesat.value = 0;

    this.cam.camera.position.set(-4.2, 1.6, 2.6);
    this.cam.shot(V(-4.2, 1.6, 2.6), V(-6, 1.3, -0.5), 0);
    this.hud.fade(0, 0.7);
    this.hud.chapter('HELIOS-7 ORBITAL RESEARCH STATION\n408 KM ABOVE EARTH · 03:12 STATION TIME', 3);
    await this.shot(V(-3.2, 1.5, 1.8), V(-6, 1.0, -1.2), 3.5, 'inOut');
    await this.shot(V(1.6, 1.35, -0.6), V(0, 0.75, -2.6), 3, 'inOut');
    // muffled chaos
    this.audio.impact(V(0, 1, 6), 0.35); await this.wait(0.8);
    this.audio.groan(V(-3, 1, 7), 0.5); await this.wait(1.2);
    this.audio.scream(V(5, 1, 8)); this.audio.impact(V(2, 1, 6), 0.6);
    this.cam.shake(0.02);
    await this.wait(0.6);
    // alarm
    S.redAlert = true; this.audio.startAlarm(); this.audio.setAlarmLevel(0.55, 1);
    this.audio.stopMusic(3);
    S.lights.qKey.intensity = 2; S._qKeyBase = 2;
    await this.say('HELIOS', 'Warning. Containment breach — Laboratory Deck B. All personnel shelter in place.', 3.8);
    // Max wakes
    this.max.lookPitch = 0;
    await this.shot(V(0.9, 1.25, -0.4), V(0, 0.75, -2.4), 1.2);
    this.max.setState('sitBed', 2.2);
    const from = this.max.root.position.clone(), to = V(0, 0, -1.95);
    this.cam.shot(V(1.5, 1.25, -0.1), V(0, 0.9, -1.8), 2.2);
    await this.tween(2.0, (k) => this.max.root.position.lerpVectors(from, to, k));
    this.max.lookYaw = 0.6; await this.wait(0.5); this.max.lookYaw = -0.5;
    await this.say('Max', '...What the hell is that?', 2.0);
    this.max.lookYaw = 0;
    this.max.setState('idle', 3);
    await this.tween(1.0, (k) => (this.max.root.position.z = -1.95 + k * 0.45));
    await this.shot(V(0.6, 1.7, 0.8), V(0, 1.3, -1.3), 1.0);
    this.cinematic(false);
    this.player.camYaw = Math.PI; this.player.camPitch = 0.22;
    this.max.yaw = Math.PI * 0.15;
    this.hud.objective('Wake Sean and Anna');
    this.hud.toast('WASD MOVE · MOUSE LOOK · E INTERACT', 4);
    this.beat = 'wake';
    this._setupWake();
  }

  _setupWake() {
    const S = this.station;
    let awake = 0;
    const done = async () => {
      awake++;
      if (awake < 2) { this.hud.objective(awake === 1 ? 'Wake the other one' : 'Wake Sean and Anna'); return; }
      this.hud.objective('Check the door');
      this.fSean.active = this.fAnna.active = true;
      this.addInteract({ id: 'doorTrigger', pos: V(0, 0, 2.9), r: 1.6, auto: true, onUse: () => this.start('door') });
    };
    const wake = async (c, f, x, lines) => {
      this.removeInteract(c.opts.name);
      this.player.enabled = false;
      const m = this.max;
      m.yaw = Math.atan2(x - m.position.x, -2.4 - m.position.z);
      m.reachTarget = 1; this.audio.rustle();
      await this.say('Max', lines[0], 1.6);
      m.reachTarget = 0;
      this.player.enabled = true;
      c.setState('sitBed', 2.2);
      const from = c.root.position.clone(), to = V(x, 0, -1.95);
      await this.tween(1.8, (k) => c.root.position.lerpVectors(from, to, k));
      c.lookYaw = 0.5;
      await this.say(c.opts.name, lines[1]);
      c.lookYaw = 0;
      c.setState('idle', 3);
      await this.tween(0.8, (k) => (c.root.position.z = -1.95 + k * 0.5));
      if (lines[2]) await this.say(c.opts.name, lines[2]);
      f.active = true; f.scripted = null;
      done();
    };
    this.addInteract({ id: 'Sean', pos: V(-3, 0, -1.4), r: 1.3, text: 'Wake Sean', onUse: () => wake(this.sean, this.fSean, -3, ['Sean. Sean! Get up.', "Mm... Max? What time is it—", 'Is that... the containment alarm?']) });
    this.addInteract({ id: 'Anna', pos: V(3, 0, -1.4), r: 1.3, text: 'Wake Anna', onUse: () => wake(this.anna, this.fAnna, 3, ['Anna, wake up. Something\'s wrong.', 'I hear it. Screaming... it\'s coming from the corridor.']) });
    void S;
  }

  async beat_door() {
    const S = this.station;
    S.redAlert = true; S._qKeyBase = 2;
    this._placeCrew('Q', [-0.25, 2.75, 0], [-1.15, 2.25, 0.15], [0.85, 2.2, -0.2]);
    S.setGlassDoor(0.55, true); S.setCrack(0); S.doorPanelLight.material.emissive.set(0xffa526);
    S.tablet.visible = true;
    this.resetZombies('corridor');
    this.audio.startAmbience(); this.audio.startAlarm(); this.audio.setAlarmLevel(0.45, 0.5);
    this.fSean.active = this.fAnna.active = false;
    this.cinematic(true);
    this.hud.objective(null);
    this.hud.fade(0, 0.6);
    const feeder = this.zombies[0];
    await this.shot(V(1.75, 1.85, 1.45), V(0.8, 0.8, 6.4), 1.6);
    this.anna.lookYaw = 0.3;
    await this.say('Anna', 'Oh god... is that — is that Dr. Okafor?');
    await this.shot(V(0.35, 1.3, 3.45), V(2.3, 0.6, 6.4), 2.2);
    await this.say('Sean', "He's... Max, he's eating him.");
    this.audio.setAlarmLevel(0.2, 1);
    this.audio.startMusic('tension');
    // the feeder stops… lifts its head toward the glass
    feeder.c.setState('zIdle', 2.5);
    feeder.c.custom = (P) => { P.neck[0] = -0.3; P.neck[1] = 0.7; P.head[0] = -0.2; };
    this.audio.groan(feeder.c.position, 0.8);
    await this.shot(V(0.15, 1.4, 3.6), V(2.3, 1.0, 6.4), 1.6);
    await this.wait(0.6);
    feeder.c.setState('zScream', 8);
    feeder.c.custom = null;
    this.audio.scream(feeder.c.position);
    this.audio.stinger(1);
    this.cam.shake(0.05);
    this.g.renderer.fx.uDanger.value = 0.6;
    await this.wait(1.0);
    this.zombies.filter((z) => z.group === 'corridor').forEach((z, i) => {
      z.c.custom = null;
      setTimeout(() => this.audio.groan(z.c.position, 1), i * 150);
    });
    // everyone rushes for the gap
    const gap = V(-0.4, 0, 4.45);
    this.zombies.filter((z) => z.group === 'corridor').forEach((z, i) => {
      z.mode = 'rush'; z.speed = 3.4 + Math.random() * 0.8; z.target = gap.clone().add(V((i % 3 - 1) * 0.35, 0, 0.3 + Math.floor(i / 3) * 0.6));
      z.delay = i === 0 ? 0.2 : 0.3 + Math.random() * 0.6;
    });
    this.shot(V(-2.3, 1.35, 3.1), V(0.2, 1.15, 4.7), 0.6, 'out');
    await this.say('Max', 'DOOR! SEAL THE DOOR!', 1.0);
    // QTE
    this.qte = { t: 0, dur: 2.8, done: false };
    this.hud.qte(1, true);
    const ok = await this._guardBeat(new Promise((res) => (this.qte.res = res)));
    this.hud.qte(0, false);
    if (!ok) {
      this.audio.scream(V(0, 1, 4.5));
      this.g.die('They got through the door.');
      return;
    }
    // slam
    this.max.reachTarget = 1;
    S.glassDoor.fast = true; S.setGlassDoor(0);
    this.audio.doorSlide(V(0, 1, 4.1), true);
    await this.wait(0.35);
    S.glassDoor.fast = false;
    this.audio.lock(V(-1.3, 1.3, 4));
    S.doorPanelLight.material.emissive.set(0xff2020);
    this.cam.shake(0.06);
    this.max.reachTarget = 0;
    this.zombies.filter((z) => z.group === 'corridor').forEach((z, i) => {
      z.target = V(-0.9 + (i % 3) * 0.85, 0, 4.55 + Math.floor(i / 3) * 0.55);
    });
    this.g.renderer.fx.uDanger.value = 0.25;
    await this.wait(0.8);
    this.audio.glassCrack(V(0, 1.2, 4.1)); S.setCrack(0.08);
    await this.shot(V(1.7, 1.5, 2.5), V(-0.3, 1.3, 4.3), 1.2);
    this.anna.lookYaw = 0;
    await this.say('Anna', "Their eyes... they're milky white. I don't think they can see us.");
    await this.say('Sean', "They don't need to. Listen to that glass — it won't hold for long.");
    this._faceEachOther();
    await this.shot(V(0.35, 1.55, 1.05), V(-0.35, 1.45, 2.6), 1.4);
    await this.say('Max', "Then we don't stay. Search the room — anything we can use, anything that gets us out of here. Move!");
    this.g.renderer.fx.uDanger.value = 0;
    this.start('search');
  }

  async beat_search() {
    const S = this.station;
    S.redAlert = true; S._qKeyBase = 2;
    if (this.checkpoint === 'search' && this.beat === 'search' && this.area !== 'Q') this.setArea('Q');
    this._placeCrew('Q', [-0.1, 1.5, Math.PI], [-1.15, 2.25, Math.PI], [0.85, 2.2, Math.PI]);
    S.setGlassDoor(0, true); S.doorPanelLight.material.emissive.set(0xff2020);
    S.tablet.visible = true; S.tabletGlow.intensity = 0.6;
    S.ventGrate.position.copy(S.ventGrateHome); S.ventGrate.rotation.set(0, 0, 0);
    this.resetZombies('corridor');
    this.zombies.filter((z) => z.group === 'corridor').forEach((z, i) => {
      z.c.root.position.set(-0.9 + (i % 3) * 0.85, 0, 4.55 + Math.floor(i / 3) * 0.55); z.c.yaw = Math.PI;
      z.mode = 'rush'; z.target = z.c.root.position.clone(); z.speed = 3;
    });
    this.audio.startAmbience(); this.audio.startAlarm(); this.audio.setAlarmLevel(0.3, 0.5);
    this.audio.startMusic('tension');
    this.cinematic(false);
    this.hud.fade(0, 0.5);
    this.hud.objective('Search the quarters for anything useful');
    this.glassTimer = { v: 1, rate: 1 / 150, cracks: 0 };
    this.fSean.active = this.fAnna.active = false;
    // companions search on their own
    (async () => {
      await this.walk(this.fSean, V(-3.2, 0, -1.35), 2.2);
      this.sean.yaw = Math.PI; this.sean.setState('kneel', 4);
      await this.wait(2.5);
      await this.say('Sean', 'Nothing in the pods but blankets!');
      this.sean.setState('idle', 4);
      await this.walk(this.fSean, V(-4.2, 0, 0.4), 2.2);
      this.sean.yaw = -Math.PI / 2; this.sean.setState('alarmed');
    })();
    (async () => {
      await this.wait(0.6);
      await this.walk(this.fAnna, V(-2.0, 0, 1.25), 2.0);
      this.anna.yaw = -0.8; this.anna.setState('kneel', 4);
      await this.wait(3.5);
      await this.say('Anna', "Med-kit's gone. Somebody already cleaned it out.");
      this.anna.setState('idle', 4);
    })();
    let found = 0;
    const search = (id, pos, text, line) => this.addInteract({ id, pos, r: 1.1, text, onUse: async () => {
      this.removeInteract(id);
      this.max.yaw = Math.atan2(pos.x + 0.6 - this.max.position.x, pos.z - this.max.position.z) ;
      this.max.reachTarget = 1; this.audio.rustle();
      await this.wait(0.6); this.max.reachTarget = 0;
      found++;
      await this.say('Max', line);
    } });
    search('locker', V(4.1, 0, -0.42), 'Search lockers', 'Spare uniforms... nothing we can use.');
    search('desk', V(3.95, 0, 2.1), 'Search desk', 'Ration bars and a dead datapad. Not now.');
    this.addInteract({ id: 'bench', pos: V(3.75, 0, 3.15), r: 1.15, text: 'Search under the bench', onUse: () => this._foundTablet() });
    void found;
  }

  async _foundTablet() {
    const S = this.station;
    this.removeInteract('bench');
    this.player.enabled = false;
    const m = this.max;
    m.yaw = Math.atan2(4.45 - m.position.x, 3.6 - m.position.z);
    m.setState('kneel', 5);
    this.audio.rustle();
    await this.wait(0.9);
    S.tablet.visible = false; S.tabletGlow.intensity = 0;
    this.audio.ui('tablet');
    m.setState('idle', 4);
    await this.say('Max', 'Wait — a nav-pad. Someone dropped it under the bench.');
    this.g.tabletEnabled = true;
    this.glassTimer && (this.glassTimer.paused = true);
    this.hud.objective('Study the station map — then PROCEED');
    const tab = this.g.tablet;
    tab.setProceed('PROCEED TO LEVEL 1');
    tab.onProceed = () => {
      tab.onProceed = null; tab.setProceed(null);
      this.g._tabletClose = null; tab.toggle(false);
      this.start('l1intro');
    };
    let briefed = false;
    this.g.openTablet(async () => {
      // closed without proceeding: the glass keeps cracking, the map stays one tap away
      this.glassTimer && (this.glassTimer.paused = false);
      this.player.enabled = true;
      this.fSean.scripted = this.fAnna.scripted = null;
      this.fSean.active = this.fAnna.active = true;
      this.hud.objective('Open the MAP and proceed to Level 1');
      if (briefed) return; briefed = true;
      await this.say('Anna', "Storage C-7... it's directly below us.");
      await this.say('Sean', 'And the vent trunk runs straight into it. Open the map, Max — let\'s go.');
    });
  }

  /** Level 1 opener: Sean pries the vent and slides in, Anna follows, Max goes last. */
  async beat_l1intro() {
    const S = this.station;
    this.glassTimer = null; this.hud.timer(0, false); this.g.renderer.fx.uDanger.value = 0;
    this.cinematic(true);
    this.hud.objective(null);
    this.setArea('Q');
    this._placeCrew('Q', [1.3, 2.1, Math.PI], [2.2, 2.5, Math.PI], [3.4, 2.2, Math.PI]);
    S.ventGrate.position.copy(S.ventGrateHome); S.ventGrate.rotation.set(0, 0, 0);
    this.fSean.active = this.fAnna.active = false;
    this.audio.setAlarmLevel(0.2, 1);
    this.cam.camera.position.set(4.3, 2.3, 3.3);
    this.cam.shot(V(4.3, 2.3, 3.3), V(2.4, 0.3, 0.7), 0);
    this.hud.fade(0, 0.5);
    await this.walk(this.fSean, V(2.5, 0, 1.4), 2.0);
    this.sean.yaw = Math.PI; this.sean.setState('kneel', 5);
    await this.say('Sean', "I've got the grate.", 1.4);
    this.audio.impact(S.ventGrate.position, 0.4);
    await this.tween(0.8, (k) => { S.ventGrate.position.set(S.ventGrateHome.x + 1.0 * k, 0.01 + Math.sin(k * Math.PI) * 0.45, S.ventGrateHome.z + 0.6 * k); S.ventGrate.rotation.z = -k * 0.25; });
    this.audio.impact(S.ventGrate.position, 0.6);
    await this.say('Sean', "I'll go first. Stay on me.", 1.6);
    await this._slideIntoVent(this.sean);
    await this.walk(this.fAnna, V(2.5, 0, 1.4), 2.0);
    this.anna.yaw = Math.PI;
    await this.say('Anna', 'Right behind you.', 1.2);
    this.cam.shot(V(3.6, 1.6, 2.6), V(2.5, -0.4, 0.4), 1.2);
    await this._slideIntoVent(this.anna);
    this.max.setState('walk'); await this.tween(0.8, (k) => this.max.root.position.lerpVectors(V(1.3, 0, 2.1), V(2.5, 0, 1.45), k));
    this.max.yaw = Math.PI; this.max.setState('kneel', 5);
    await this.wait(0.4);
    this.audio.ductClank(this.max.position);
    await this._guardBeat(this.hud.fade(1, 0.45));
    this._fromDuct = true;
    this.start('storage');
  }

  async _slideIntoVent(c) {
    c.setState('crawl', 6); c.speed = 1;
    const a = V(2.5, 0, 1.2), b = V(2.5, -1.4, 0.3), d = V(2.5, -1.4, -1.6);
    this.audio.ductClank(a);
    await this.tween(0.75, (k) => c.root.position.lerpVectors(a, b, k));
    await this.tween(0.9, (k) => c.root.position.lerpVectors(b, d, k), (x) => x);
    c.root.visible = false; c.speed = 0;
  }

  /** Storage arrival: Sean, then Anna, then Max drop out of the ceiling vent. */
  async _ductExit() {
    const S = this.station, g = S.storageGrates[1];
    const home = g.position.clone(), rot = g.rotation.clone();
    g.position.set(home.x + 0.55, home.y - 0.35, home.z); g.rotation.set(Math.PI / 2 - 1.1, 0, 0.3);
    this.cam.camera.position.set(-0.4, -3.4, 3.5);
    this.cam.shot(V(-0.4, -3.4, 3.5), V(-3.0, -3.1, 1.9), 0);
    this.hud.fade(0, 0.5);
    const drop = async (c, land, faceYaw) => {
      c.root.visible = true; c.yaw = faceYaw; c.setState('crouch', 9); c.snap();
      const top = V(-3.0, -2.15, 2.0), floor = V(-3.0, -4.6, 2.0);
      c.root.position.copy(top);
      this.audio.ductClank(top);
      await this.tween(0.42, (k) => c.root.position.lerpVectors(top, floor, k), (x) => x * x);
      this.audio.impact(floor, 0.35, true); this.cam.shake(0.012);
      await this.wait(0.25);
      c.setState('crouchWalk', 6); c.speed = 1.1;
      await this.tween(0.7, (k) => c.root.position.lerpVectors(floor, land, k));
      c.speed = 0; c.setState('crouch', 6);
    };
    [this.max, this.sean, this.anna].forEach((c) => (c.root.visible = false));
    await this.wait(0.4);
    await drop(this.sean, V(-2.3, -4.6, 2.6), Math.PI / 2);
    await drop(this.anna, V(-3.6, -4.6, 2.9), Math.PI / 2);
    this.cam.shot(V(-1.0, -3.6, 3.4), V(-3.0, -3.6, 1.8), 1.0);
    await drop(this.max, V(-3.0, -4.6, 1.6), Math.PI / 2);
    g.position.copy(home); g.rotation.copy(rot);
  }

  async _openVent() {
    const S = this.station;
    this.removeInteract('vent');
    this.player.enabled = false;
    const m = this.max;
    m.yaw = Math.PI; m.setState('kneel', 5);
    await this.wait(0.5);
    this.audio.impact(S.ventGrate.position, 0.4);
    await this.tween(0.9, (k) => {
      S.ventGrate.position.set(S.ventGrateHome.x + 1.0 * k, 0.01 + Math.sin(k * Math.PI) * 0.5, S.ventGrateHome.z + 0.6 * k);
      S.ventGrate.rotation.z = -k * 0.25;
    });
    this.audio.impact(S.ventGrate.position, 0.6);
    m.setState('idle', 4);
    this.player.enabled = true;
    this.hud.objective('Enter the air duct');
    await this.say('Max', 'Stay close. Stay quiet.');
    this.addInteract({ id: 'enterDuct', pos: V(2.5, 0, 0.5), r: 0.9, text: 'Climb into the vent', onUse: () => this.start('duct') });
  }

  async beat_duct() {
    this.glassTimer = null; this.hud.timer(0, false);
    this.player.enabled = false;
    await this._guardBeat(this.hud.fade(1, 0.6));
    this.audio.ductClank(this.max.position);
    this._placeCrew('D', [2.5, -0.35, Math.PI], [2.5, 0.55, Math.PI], [2.55, 0.85, Math.PI]);
    ['max', 'sean', 'anna'].forEach((k) => { this[k].setState('crawl'); this[k].weights = { crawl: 1 }; this[k].snap(); });
    this.trail = [V(2.5, -1.4, 0.85), V(2.5, -1.4, 0.6), V(2.5, -1.4, 0.4)];
    this.fSean.active = this.fAnna.active = true;
    this.station.setGlassDoor(0, true);
    this.audio.setAlarmLevel(0.12, 2);
    this.audio.setAmbienceLevel(0.3, 2);
    this.audio.stopMusic(3);
    this.player.camYaw = Math.PI; this.player.camPitch = 0.08; this.cam.dist = 1.5;
    this.cinematic(false);
    this.hud.fade(0, 0.8);
    this.hud.objective('Crawl through the duct to Storage C-7');
    this.g.renderer.fx.uDesat.value = 0.15;
    // keep the pounding audible but distant for a while
    this._poundEcho = 14;
    let saidGrate = false;
    this.addInteract({ id: 'grateView', pos: V(0.4, -1.4, -3.0), r: 1.0, auto: true, onUse: async () => {
      if (saidGrate) return; saidGrate = true;
      this.removeInteract('grateView');
      await this.say('Anna', "Look — through the grate. That's the storage room.");
      await this.say('Sean', "The door's open down there. Something's moving outside it.");
      await this.say('Max', 'Then we go in quiet.');
    } });
    this.addInteract({ id: 'drop', pos: V(-3.0, -1.4, 1.5), r: 0.75, text: 'Drop into Storage C-7', onUse: () => this.start('storage') });
    await this.say('Max', 'Keep it slow. Sound carries in these ducts.');
  }

  async beat_storage() {
    const S = this.station;
    this.player.enabled = false;
    this.hud.timer(0, false);
    if (this.area === 'D') {
      await this._guardBeat(this.hud.fade(1, 0.45));
      this.audio.impact(V(-3, -4.6, 2), 0.5, true);
    } else this.hud.fade(1, 0);
    this._placeCrew('S', [-3.0, 1.7, Math.PI / 2], [-2.3, 2.5, Math.PI / 2], [-3.4, 2.75, Math.PI / 2]);
    S.setStorageDoor(0.45, true); S.storageDoor.locked = false; S.storagePanelLight.material.emissive.set(0xff3b3b);
    S.setGlassDoor(0, true);
    this.resetZombies('hall');
    this.fSean.active = this.fAnna.active = false;
    this.audio.startAmbience(); this.audio.setAmbienceLevel(0.25, 1);
    this.audio.startAlarm(); this.audio.setAlarmLevel(0.05, 1);
    this.audio.stopMusic(1);
    this.g.renderer.fx.uDesat.value = 0.1;
    this.cinematic(true);
    this.hud.objective(null);
    this.cam.camera.position.set(-3.4, -3.0, 2.6);
    this.cam.shot(V(-3.4, -3.0, 2.6), V(-2, -3.6, 1.6), 0);
    await this.wait(0.2);
    this.hud.fade(0, 1.2);
    this.max.setState('crouch', 6); this.sean.setState('crouch', 6); this.anna.setState('crouch', 6);
    if (this._fromDuct) { this._fromDuct = false; await this._ductExit(); }
    this.setTasks('LEVEL 1 · SALVAGE', L1_TASKS);
    this.sean.lookYaw = 0.4;
    await this.say('Sean', '(whispering) Max... the door. It isn\'t secure.', 2.4);
    this.sean.lookYaw = 0;
    // reveal: the door is ajar, they stand outside... silent
    await this.shot(V(3.8, -3.3, 2.3), V(7.6, -3.7, 0.6), 3.0);
    this.audio.setHeartbeat(1.0);
    await this.shot(V(4.6, -3.4, 1.9), V(7.8, -3.5, 0.4), 3.0, 'linear');
    await this.say('Anna', "They're just... standing there.", 2.2);
    await this.say('Sean', 'Like they\'re asleep. Or praying.', 2.2);
    await this.shot(V(-4.1, -3.1, 3.2), V(-2.6, -3.9, 1.6), 1.6);
    await this.say('Max', "Nobody make a sound. I'll lock it — then we strip this room for everything we can use.", 3.2);
    this.hud.chapter('LEVEL 1\nSALVAGE', 2.2);
    this.cinematic(false);
    this.player.camYaw = Math.PI / 2; this.player.camPitch = 0.18;
    this.hud.objective('Sneak to the door controls — hold C to crouch');
    this.hud.toast('THE INFECTED ARE BLIND · THEY HUNT BY SOUND', 4.5);
    this.fSean.active = this.fAnna.active = true;
    this.stealth = { alerted: false, value: 0, closed: false, locked: false };
    this.player.maxSpeedScale = 1;
    this.addInteract({ id: 'closeDoor', pos: S.storagePanelPos, r: 0.95, hold: true, text: 'Hold to close the door slowly', onUse: () => {} });
  }

  async _doorClosed() {
    const S = this.station;
    this.removeInteract('closeDoor');
    this.hud.objective('Engage the mag-lock');
    this.addInteract({ id: 'lockDoor', pos: S.storagePanelPos, r: 0.95, text: 'Engage mag-lock', onUse: () => this._lockDoor() });
  }

  async _lockDoor() {
    const S = this.station;
    this.removeInteract('lockDoor');
    this.stealth.locked = true; S.storageDoor.locked = true;
    this.max.reachTarget = 1;
    this.audio.lock(V(6, -3.3, 1.5));
    S.storagePanelLight.material.emissive.set(0x3dff8a);
    this.player.enabled = false;
    await this.wait(0.5);
    this.max.reachTarget = 0;
    if (this.stealth.alerted) return; // handled by the rush logic
    this.stealth.done = true;
    this.hud.noise(0, false);
    // the clunk carries — one of them stirs
    const z = this.zombies[6];
    this.cinematic(true);
    await this.shot(V(4.5, -3.25, -1.1), V(6.1, -3.7, 0.4), 1.2);
    z.c.setState('zWalk'); z.mode = 'rush'; z.speed = 0.8; z.target = V(6.55, -4.6, 0.2);
    this.audio.groan(z.c.position, 0.9);
    await this.wait(2.2);
    this.audio.impact(V(6.1, -3.6, 0), 0.9); this.cam.shake(0.03);
    await this.wait(1.4);
    this.audio.impact(V(6.1, -3.6, 0), 0.5);
    await this.wait(1.6);
    z.mode = 'idle'; z.c.setState('zIdle', 2);
    this.audio.setHeartbeat(0.7);
    await this.say('Anna', '(whispering) ...It stopped.', 2.0);
    await this.wait(0.6);
    this.audio.setHeartbeat(0);
    this._startSearch();
  }

  /** Level 1, part 2: the door is locked — gather weapons, food, protection, medicine, then plan. */
  async _startSearch() {
    const S = this.station;
    this.completeTask('door');
    this.cinematic(false);
    this.player.enabled = true;
    this.stealth = null; this.hud.noise(0, false);
    this.g.renderer.fx.uDanger.value = 0;
    this.fSean.active = this.fAnna.active = true;
    this.hud.objective('Search the storage room for supplies');
    this.audio.startMusic('calm');
    const items = [
      { id: 'weapons', pos: V(1.0, -4.6, 2.85), text: 'Search the workbench', loot: ['Plasma cutter', 'Crowbar'], line: ['Max', 'A plasma cutter. And a crowbar. That works.'] },
      { id: 'food', pos: V(0.0, -4.6, -4.75), text: 'Search the supply racks', loot: ['Ration packs', 'Water ×6'], line: ['Max', 'Rations and water — a week, if we\'re careful.'] },
      { id: 'protection', pos: V(-4.75, -4.6, -0.1), text: 'Open the EVA locker', loot: ['Armoured EVA vests', 'Helmets'], line: ['Max', 'EVA vests. They won\'t stop much — but they\'ll stop teeth.'] },
      { id: 'medical', pos: V(4.3, -4.6, -5.0), text: 'Open the med cabinet', loot: ['Med-kit', 'Adrenaline stims'], line: ['Max', 'Med-kit, stims. Anna — catch.'] },
    ];
    let left = items.length;
    items.forEach((it) => this.addInteract({ id: it.id, pos: it.pos, r: 1.15, text: it.text, onUse: async () => {
      this.removeInteract(it.id);
      this.player.enabled = false;
      this.max.reachTarget = 1; this.audio.rustle();
      await this.wait(0.7); this.max.reachTarget = 0;
      it.loot.forEach((l) => this.addItem(l));
      this.completeTask(it.id);
      this.player.enabled = true;
      await this.say(...it.line);
      left--;
      if (left === 2) this.say('Anna', 'Fuel cells in this crate too. We\'ll need light where we\'re going.');
      if (left === 0) {
        await this.say('Sean', "That's everything worth carrying. Max — we need a plan.");
        this.hud.objective('Regroup with the crew at the crates');
        this.addInteract({ id: 'plan', pos: V(-0.6, -4.6, -0.35), r: 1.3, text: 'Sit down and plan', onUse: () => { this.removeInteract('plan'); this.completeTask('plan'); this.start('ending'); } });
      }
    } }));
    // the crew don't stand idle
    (async () => {
      await this.wait(1.5);
      await this.say('Anna', "I'll check the shelves. Sean, take the lockers.", 2.4);
    })();
    // something tests the door while they search
    (async () => {
      await this.wait(14);
      if (this.beat !== 'storage') return;
      this.audio.impact(V(6.1, -3.6, 0), 0.7); this.cam.shake(0.02);
      await this.say('Sean', '(whispering) ...It\'s holding. Keep going.', 2.2);
    })();
  }

  addItem(name) {
    this.inventory = this.inventory || [];
    if (!this.inventory.includes(name)) this.inventory.push(name);
    this.hud.inventory(this.inventory);
  }

  async beat_ending() {
    const S = this.station;
    this.cinematic(true);
    this.hud.objective(null);
    this.hud.noise(0, false);
    await this._guardBeat(this.hud.fade(1, 1.2));
    this.setArea('S');
    S.setStorageDoor(0, true); S.storagePanelLight.material.emissive.set(0x3dff8a);
    this.resetZombies('hall');
    this.fSean.active = this.fAnna.active = false;
    const sit = (c, seat, faceTo) => {
      c.root.position.copy(seat);
      c.yaw = Math.atan2(faceTo.x - seat.x, faceTo.z - seat.z);
      c.setState('sit'); c.weights = { sit: 1 }; c.snap();
      // shift so hips sit on the crate centre (hips are ~0.0 forward of root)
      c.root.position.y = -4.6 + 0.0;
    };
    const centre = V(-0.6, -4.6, -1.2);
    sit(this.sean, V(-1.9, -4.6, -0.6), centre);
    sit(this.anna, V(0.6, -4.6, -0.3), centre);
    sit(this.max, V(-0.9, -4.6, -2.55), centre);
    // lift to crate seat height (crate top 0.47, sitting hip height 0.5)
    [this.sean, this.anna, this.max].forEach((c) => (c.root.position.y = -4.6 + 0.0));
    const lamp = S.lights.dFan; lamp.position.copy(S.lanternPos).add(V(0, 0.35, 0)); lamp.color.set(0xffb070); lamp.distance = 7; lamp.intensity = 6;
    this.suitLamp.intensity = 0;
    this.audio.startMusic('calm');
    this.audio.setAlarmLevel(0, 2);
    this.g.renderer.fx.uDesat.value = 0;
    const orbit = { a: 0 };
    this.cam.track(() => {
      orbit.a += 0.0012;
      const a = 2.3 + orbit.a;
      return { pos: V(centre.x + Math.cos(a) * 3.3, -3.2, centre.z + Math.sin(a) * 3.3), look: V(centre.x, -3.95, centre.z) };
    });
    this.cam.camera.position.set(centre.x + Math.cos(2.3) * 3.3, -3.2, centre.z + Math.sin(2.3) * 3.3);
    await this.wait(0.4);
    this.hud.fade(0, 2);
    await this.wait(1.5);
    await this.say('Sean', "...We're alive.");
    await this.say('Anna', "For now. The whole lab deck is gone. Maybe half the station.");
    this.max.lookPitch = 0.2;
    await this.say('Max', "Then we work with what's here. This is Storage C-7 — tools, med supplies, EVA gear. Everything this station runs on comes through this room.");
    await this.say('Sean', 'Weapons?');
    await this.say('Max', 'Whatever we can turn into one. Cutters. Flares. Anything heavy.');
    await this.say('Anna', 'And the nav-pad still works. The control room is two corridors east. If we reach the comms array, we can call home.');
    await this.say('Sean', 'Through a spine full of those things? They\'ll hear every step.');
    await this.say('Anna', 'Then we take away their edge. I cut the deck power at the breaker — no hum, no light, no warmth. Total dark. They lose us. We don\'t lose them.');
    await this.say('Max', 'Lights off, crouch, and we move as one. Control room. Then we tell Earth what\'s up here.');
    this.max.lookPitch = 0;
    await this.say('Max', "Let's get to work.", 2.2);
    await this._guardBeat(this.hud.fade(1, 2.5));
    this.cam.release();
    this.audio.stopMusic(4);
    await this._guardBeat(this.hud.chapter('LEVEL 1 COMPLETE\n\nNEXT — LEVEL 2: BLACKOUT', 3.5));
    this.cam.release();
    saveProgress(2);
    this.start('l2intro');
  }

  // ---------------------------------------------------------------- per-frame
  update(dt) {
    this.time += dt;
    // timers & tweens
    for (let i = this.timers.length - 1; i >= 0; i--) if (this.timers[i].t <= this.time) { const r = this.timers[i].res; this.timers.splice(i, 1); r(); }
    if (this._tweens) this._tweens = this._tweens.filter((tw) => !tw.tick());

    const S = this.station;
    const obstacles = S.obstacles[this.area] || [];
    this.player.update(dt, obstacles);

    // breadcrumb trail
    const p = this.max.position;
    const last = this.trail[this.trail.length - 1];
    if (!last || Math.hypot(last.x - p.x, last.z - p.z) > 0.2) { this.trail.push(p.clone()); if (this.trail.length > 80) this.trail.shift(); }
    const crew = [this.max, this.sean, this.anna];
    this.fSean.update(dt, this.trail, obstacles, this.area, crew);
    this.fAnna.update(dt, this.trail, obstacles, this.area, crew);
    [this.sean, this.anna].forEach((c) => { if (this.area && this.g.areas[this.area] && (this.fSean.active || this.fAnna.active)) c.root.position.y = this.g.areas[this.area].floorY; });
    crew.forEach((c) => c.update(dt));
    this.corpse.update(dt);

    // suit lamp
    if (this.suitLamp.intensity > 0) {
      const chest = this.max.j.chest.getWorldPosition(new THREE.Vector3());
      const fwd = V(Math.sin(this.max.yaw), 0, Math.cos(this.max.yaw));
      this.suitLamp.position.copy(chest).addScaledVector(fwd, 0.25).add(V(0, 0.15, 0));
      this.suitLamp.target.position.copy(this.suitLamp.position).addScaledVector(fwd, 4).add(V(0, this.area === 'D' ? -0.4 : -1.2, 0));
    }

    // safety net: control disabled outside a cutscene for >8 s (a hung script) → give it back
    const blocked = !this.player.enabled && !document.body.classList.contains('cinematic') && !this.qte && !this.g.tablet.open && this.g.mode === 'play';
    this._blockedT = blocked ? (this._blockedT || 0) + dt : 0;
    if (this._blockedT > 8) { this._blockedT = 0; this.player.enabled = true; this.max.reachTarget = 0; console.warn('Control restored by watchdog'); }
    this._updateZombies(dt);
    this._updateInteract(dt);
    this._updateQTE(dt);
    this._updateGlass(dt);
    this._updateStealth(dt);

    // pounding echo while in the duct
    if (this._poundEcho > 0 && this.area === 'D') {
      this._poundEcho -= dt;
      if (Math.random() < dt * 2) this.audio.impact(V(this.max.position.x, 0, this.max.position.z + 4), 0.12 * (this._poundEcho / 14));
    }
    // audio listener
    const l = this.audio.listener; l.x = this.cam.camera.position.x; l.z = this.cam.camera.position.z; l.yaw = this.player.camYaw;
  }

  _updateZombies(dt) {
    for (const z of this.zombies) {
      if (!z.c.root.visible) continue;
      if (z.group === 'deck') { this._deckZombie(z, dt); continue; }
      if (z.delay > 0) { z.delay -= dt; z.c.update(dt); continue; }
      if (z.mode === 'rush' && z.target) {
        const pos = z.c.root.position;
        const dx = z.target.x - pos.x, dz = z.target.z - pos.z, d = Math.hypot(dx, dz);
        if (d > 0.08) {
          const step = Math.min(d, z.speed * dt);
          pos.x += (dx / d) * step; pos.z += (dz / d) * step;
          z.c.speed = step / dt;
          let dy = Math.atan2(dx, dz) - z.c.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
          z.c.yaw += dy * (1 - Math.exp(-10 * dt));
          if (z.c.state !== 'zWalk' || z.speed > 1.5) z.c.setState(z.speed > 1.5 ? 'zRun' : 'zWalk', 8);
          z.arrived = false;
        } else {
          z.c.speed = 0;
          if (!z.arrived) { z.arrived = true; z.onArrive?.(); }
          if (z.group === 'corridor' && this.station.glassDoor.openAmt < 0.1) {
            let dy = Math.PI - z.c.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); z.c.yaw += dy * (1 - Math.exp(-6 * dt));
            z.c.setState('zPound', 6);
            z.poundT -= dt;
            if (z.poundT <= 0) {
              z.poundT = 0.35 + Math.random() * 0.9;
              if (this.area === 'Q') { this.audio.impact(V(z.c.position.x, 1.3, 4.1), 0.35, false); this.cam.shake(0.004); }
            }
          } else if (z.speed > 1.5 && z.group === 'hall') {
            z.c.setState('zPound', 6);
            z.poundT -= dt;
            if (z.poundT <= 0) { z.poundT = 0.4 + Math.random() * 0.6; this.audio.impact(V(6.1, -3.5, 0), 0.5, true); }
          } else if (z.c.state !== 'zPound') z.c.setState('zIdle', 3);
        }
      } else z.c.speed = 0;
      // ambient groans
      z.groanT -= dt;
      if (z.groanT <= 0) { z.groanT = (z.group === 'hall' && !this.stealth?.alerted ? 9 : 4) + Math.random() * 8; this.audio.groan(z.c.position, z.group === 'hall' && !this.stealth?.alerted ? 0.25 : 0.6); }
      z.c.update(dt);
    }
  }

  _updateInteract(dt) {
    if (!this.player.enabled) { this.hud.prompt(null); return; }
    const p = this.max.position;
    let best = null, bd = 1e9;
    for (const it of this.interactables) {
      if (!it.enabled) continue;
      const d = Math.hypot(it.pos.x - p.x, it.pos.z - p.z);
      if (Math.abs(it.pos.y - p.y) > 1.5) continue;
      if (d < it.r && d < bd) { best = it; bd = d; }
    }
    if (best?.auto) { this.removeInteract(best.id); best.onUse(); return; }
    if (!best) { this.hud.prompt(null); this.doorHold && (this.doorHold.active = false); return; }
    if (best.hold) {
      this.hud.prompt(best.text, 'HOLD E');
      const holding = this.input.isDown('KeyE');
      this.doorHold = this.doorHold || { active: false };
      this.doorHold.active = holding;
    } else {
      this.hud.prompt(best.text, 'E');
      if (this.input.wasPressed('KeyE')) { this.hud.prompt(null); best.onUse(); }
    }
  }

  _updateQTE(dt) {
    const q = this.qte; if (!q || q.done) return;
    q.t += dt;
    this.hud.qte(1 - q.t / q.dur, true);
    if (this.input.wasPressed('KeyE') || this.input.wasPressed('Space')) { q.done = true; q.res(true); }
    else if (q.t >= q.dur) { q.done = true; q.res(false); }
  }

  _updateGlass(dt) {
    const g = this.glassTimer; if (!g) return;
    if (!g.paused) g.v -= g.rate * dt;
    this.hud.timer(g.v, true, 'GLASS INTEGRITY');
    const level = 1 - g.v;
    this.station.setCrack(0.08 + level * 0.92);
    const step = Math.floor(level * 8);
    if (step > g.cracks) { g.cracks = step; this.audio.glassCrack(V(0, 1.2, 4.1)); this.cam.shake(0.01 + step * 0.004); }
    this.g.renderer.fx.uDanger.value = Math.max(0, (0.35 - g.v) * 1.5);
    if (g.v <= 0) {
      this.glassTimer = null;
      this.audio.glassCrack(V(0, 1.2, 4.1)); this.audio.impact(V(0, 1.2, 4.1), 1); this.audio.scream(V(0, 1, 4.6));
      this.g.die('The glass gave way.');
    }
  }

  _updateStealth(dt) {
    const st = this.stealth; if (!st || st.done) { if (this.area === 'S' && st?.done) this.hud.noise(0, false); return; }
    const S = this.station, p = this.max.position;
    // perceived loudness at the nearest dormant infected (sound leaks through the gap)
    const gapOpen = S.storageDoor.openAmt / 0.45;
    let perceived = 0;
    for (const z of this.zombies) {
      if (z.group !== 'hall') continue;
      const d = Math.hypot(z.c.position.x - p.x, z.c.position.z - p.z);
      perceived = Math.max(perceived, this.player.noise * 2.0 * Math.exp(-d / 5) * (0.35 + 0.65 * gapOpen));
    }
    // door slide noise
    const hold = this.doorHold?.active && !st.closed;
    if (hold) {
      S.storageDoor.rate = 0.6; S.setStorageDoor(0);
      perceived = Math.max(perceived, 0.12 + Math.random() * 0.04);
      if (Math.random() < dt * 3) this.audio.footstep(V(6, -4, 0.5), 0.05);
      this.max.reachTarget = 1;
    } else if (!st.closed) {
      S.storageDoor.target = S.storageDoor.openAmt; // stop where released
      this.max.reachTarget = 0;
    }
    if (!st.closed && S.storageDoor.openAmt <= 0.001) { st.closed = true; this.max.reachTarget = 0; this.audio.impact(V(6, -3.5, 0), 0.15); this._doorClosed(); }
    st.value += (perceived - st.value) * (1 - Math.exp(-10 * dt));
    this.hud.noise(st.value / 0.55 * 0.55, true);
    this.audio.setHeartbeat(st.alerted ? 2.2 : 1.0 + Math.min(1, st.value * 1.5));
    if (!st.alerted && perceived > 0.55) this._alert();
    if (st.alerted) {
      // anyone reaching the door before it's locked = death
      for (const z of this.zombies) {
        if (z.group !== 'hall') continue;
        const d = Math.hypot(z.c.position.x - 6.3, z.c.position.z - 0.6);
        if (d < 0.5 && !st.locked) { st.done = true; this.g.die('They heard you.'); return; }
      }
      if (st.locked && !st.survived) {
        st.survived = true;
        (async () => {
          this.cinematic(true);
          await this.wait(3.5);
          this.zombies.forEach((z) => { if (z.group === 'hall') { z.mode = 'idle'; z.speed = 0; z.c.setState('zIdle', 1.5); } });
          await this.say('Sean', '(whispering) ...Too close. Way too close.');
          st.done = true;
          this._startSearch();
        })();
      }
    }
  }

  _alert() {
    const st = this.stealth;
    st.alerted = true;
    this.g.renderer.fx.uDanger.value = 0.7;
    this.audio.stinger(0.8);
    const lead = this.zombies[6];
    lead.c.setState('zScream', 8);
    this.audio.scream(lead.c.position);
    this.hud.toast('THEY HEARD YOU — LOCK THE DOOR!', 3);
    this.zombies.forEach((z, i) => {
      if (z.group !== 'hall') return;
      z.mode = 'rush'; z.speed = 3.0 + Math.random() * 0.6; z.delay = 0.9 + (i - 6) * 0.15;
      z.target = V(6.35 + (i - 6) * 0.25, -4.6, 0.6 + ((i % 2) - 0.5) * 0.4);
    });
  }
}

installLevels(Story, { V, nearestWalkable, saveProgress });
