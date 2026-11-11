import * as THREE from 'three';

/**
 * LEVEL 2 — BLACKOUT (Levels 3–4 live in endgame.js); shared deck AI.
 * Installed onto Story.prototype (keeps story.js focused on the prologue + Level 1).
 *
 * Infected AI on the deck: patrol → suspicious → hunt. They are blind: they track noise
 * (footsteps, rummaging, failed console beeps) and, in the dark, the warmth of a flashlight
 * pointed at them. Lose them by going quiet and dark.
 */
const L2_TASKS = [
  { id: 'breaker', text: 'Cut the deck power at the breaker' },
  { id: 'door2', text: 'Unlock the storage door' },
  { id: 'spine', text: 'Sneak through the Logistics Spine' },
  { id: 'fuse', text: 'Find an aux power fuse' },
  { id: 'control', text: 'Reach the control room' },
  { id: 'power', text: 'Install the fuse in the aux cabinet' },
  { id: 'align', text: 'Align the comms antenna' },
  { id: 'signal', text: 'Send a signal to Earth' },
];

// patrol routes on the deck (x, z); a single point = stands still, "meditating"
const PATROLS = [
  [[8, -3], [12.5, -3], [12.5, 3], [8, 3]],
  [[10.3, 0.2]],
  [[7.2, 2.2], [13, 2.2]],
  [[15, 0], [27, 0]],
  [[22, 0.3]],
  [[25.5, 0.4], [16.2, -0.5]],
  [[13.2, -4.2]],
  [[7.0, -4.1]],
  [[13.3, 4.1]],
  [[31.7, -14.3]],   // mechanic, decompression chamber (Level 4)
  [[34.3, -14.8]],   // mechanic, decompression chamber (Level 4)
];

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export function installLevels(Story, { V, nearestWalkable, saveProgress }) {
  const P = Story.prototype;

  P._deckSetup = function ({ blackout, ctrlPower, alarm, ctrlClosed, bayOpen, bayZombies, bright = false }) {
    const S = this.station;
    S.bright = bright;
    this.setArea('C');
    S.storagePanelLight.material.emissive.set(0x3dff8a);
    S.setBlackout(blackout); S.ctrlPower = ctrlPower; S.alarmPower = alarm;
    S.setCtrlDoor(ctrlClosed); S.setBayDoor(bayOpen);
    S.consoleScreens.forEach((m) => (m.emissiveIntensity = ctrlPower ? 0.85 : 0));
    S.ctrlRoom?.setPower(ctrlPower, true);
    S.setDockLights?.(false);
    S.guideLine?.userData.show(false); S.guideFuse?.userData.show(false);
    S.setArea('C');
    this.darkness = blackout;
    this.zombies.forEach((z, i) => {
      z.group = 'deck';
      const route = PATROLS[i];
      const inBay = i >= 9;
      z.route = route; z.wp = 0; z.pause = Math.random() * 2; z.susp = 0;
      z.mode = inBay && !bayZombies ? 'off' : 'patrol';
      z.c.root.visible = z.mode !== 'off';
      z.c.root.position.set(route[0][0], -4.6, route[0][1]);
      z.c.yaw = Math.random() * 6; z.c.setState('zIdle'); z.c.weights = { zIdle: 1 }; z.c.snap(); z.c.speed = 0; z.delay = 0;
    });
    this.deckAI = { detect: 0, shown: 0 };
    this.hud.noise(0, true);
  };

  P._storageDoorObstacle = function (closed) {
    const S = this.station, o = (this._sdObst ??= { minX: 5.9, maxX: 6.4, minZ: -1.05, maxZ: 1.05, minY: -4.6, maxY: -2.3 });
    const list = S.obstacles.C, i = list.indexOf(o);
    if (closed && i < 0) list.push(o); if (!closed && i >= 0) list.splice(i, 1);
    if (!S._cHasStorage) { S._cHasStorage = true; S.obstacles.S.forEach((b) => list.push(b)); }
  };

  /** Per-frame brain for a deck infected. */
  P._deckZombie = function (z, dt) {
    const c = z.c, pos = c.root.position;
    if (z.mode === 'off') { c.root.visible = false; return; }
    if (z.mode === 'dead') { c.root.visible = true; c.speed = 0; c.setState('dead', 4); c.update(dt); return; }
    if (!this.deckAI) { c.speed = 0; c.setState('zIdle', 3); c.update(dt); return; } // cutscene: AI paused
    const max = this.lead.position;
    const dx = max.x - pos.x, dz = max.z - pos.z, d = Math.hypot(dx, dz);
    // perception: noise + flashlight warmth in the dark (blind, but not senseless)
    let heard = this.player.noise * 2.0 * Math.exp(-d / 5);
    if (this.lightOn && this.darkness && d < 6.5) {
      const fwd = new THREE.Vector2(Math.sin(this.lead.yaw), Math.cos(this.lead.yaw));
      const to = new THREE.Vector2(-dx, -dz).normalize();
      if (fwd.dot(to) > 0.8) heard += 0.75 * (1 - d / 6.5);
    }
    // a sealed control-room door muffles everything inside
    if (this.station.ctrlDoor.position.z === 0 && (max.x > 28) !== (pos.x > 28)) heard *= 0.25;
    this.deckAI.detect = Math.max(this.deckAI.detect, Math.min(1, heard));
    if (z.mode === 'patrol') {
      z.susp = Math.max(0, z.susp + (heard * 1.6 - 0.35) * dt);
      if (z.susp > 0.55 && !z.turned) { z.turned = true; this.audio.groan(pos, 0.6); }
      if (z.susp > 1) { this._huntStart(z); return; }
      if (z.susp < 0.3) z.turned = false;
      const r = z.route, tgt = r[z.wp];
      const tx = tgt[0], tz = tgt[1], td = Math.hypot(tx - pos.x, tz - pos.z);
      if (z.turned) { c.speed = 0; c.setState('zIdle', 3); c.yaw += Math.atan2(Math.sin(Math.atan2(dx, dz) - c.yaw), Math.cos(Math.atan2(dx, dz) - c.yaw)) * (1 - Math.exp(-2 * dt)); }
      else if (r.length === 1 || z.pause > 0) { z.pause -= dt; c.speed = 0; c.setState('zIdle', 3); if (z.pause <= 0 && r.length > 1) z.wp = (z.wp + 1) % r.length; }
      else if (td < 0.25) { z.pause = 1.5 + Math.random() * 2.5; }
      else this._moveZombie(z, tx, tz, 0.65, 'zWalk', dt);
    } else if (z.mode === 'lure') {
      // walking to the noise beacon — still listening for anything closer
      z.susp = Math.max(0, z.susp + (heard * 1.6 - 0.35) * dt);
      if (z.susp > 1) { this._huntStart(z); return; }
      if (z.delay > 0) { z.delay -= dt; c.speed = 0; c.setState('zIdle', 3); c.update(dt); return; }
      const tgt = z.lure[z.lureI];
      if (Math.hypot(tgt[0] - pos.x, tgt[1] - pos.z) < 0.35) {
        if (z.lureI < z.lure.length - 1) z.lureI++;
        else { z.mode = 'patrol'; z.route = [tgt]; z.wp = 0; z.susp = 0; z.turned = false; }
      } else this._moveZombie(z, tgt[0], tgt[1], 0.95, 'zWalk', dt);
    } else if (z.mode === 'hunt') {
      z.huntT += dt;
      const lost = d > 9 && heard < 0.15;
      z.lostT = lost ? z.lostT + dt : 0;
      if (z.lostT > 3.5) { z.mode = 'patrol'; z.susp = 0.4; z.turned = false; this.hud.toast('…IT LOST YOU', 1.6); return; }
      this._moveZombie(z, max.x, max.z, z.huntSpeed ?? 4.3, 'zRun', dt);
      if (d < 0.8 && this.player.enabled !== null) this.g.die(this.darkness ? 'They found you in the dark.' : 'You were caught.');
      z.groanT -= dt; if (z.groanT <= 0) { z.groanT = 1.5 + Math.random() * 2; this.audio.groan(pos, 1); }
    }
    c.update(dt);
  };

  P._moveZombie = function (z, tx, tz, speed, state, dt) {
    const c = z.c, pos = c.root.position;
    const dx = tx - pos.x, dz = tz - pos.z, d = Math.hypot(dx, dz);
    if (d < 0.05) { c.speed = 0; return; }
    const step = Math.min(d, speed * dt);
    let nx = pos.x + (dx / d) * step, nz = pos.z + (dz / d) * step;
    // sealed control-room door holds them back — they pound on it instead
    if (this.station.ctrlDoor.position.z === 0 && pos.x < 28 && nx > 27.55) { nx = 27.55; z.pound = (z.pound ?? 0) - dt; if (z.pound <= 0) { z.pound = 0.6 + Math.random() * 0.6; this.audio.impact(V(28, -3.5, 0), 0.5, true); } c.setState('zPound', 6); c.speed = 0; pos.x = nx; return; }
    // closed doors (airlock glass, annex, docking door) hold them back
    const obs = this.station.obstacles.C;
    for (const b of this.station.zBarriers || []) {
      if (obs.includes(b) && nx > b.minX - 0.3 && nx < b.maxX + 0.3 && nz > b.minZ - 0.3 && nz < b.maxZ + 0.3) {
        c.speed = 0; c.setState('zPound', 6);
        z.pound = (z.pound ?? 0) - dt; if (z.pound <= 0) { z.pound = 0.8 + Math.random() * 0.6; this.audio.impact(V((b.minX + b.maxX) / 2, -3.5, (b.minZ + b.maxZ) / 2), 0.35, false); }
        return;
      }
    }
    const w = nearestWalkable('C', nx, nz);
    pos.x = w.x; pos.z = w.z;
    c.speed = step / dt;
    const want = Math.atan2(dx, dz);
    c.yaw += Math.atan2(Math.sin(want - c.yaw), Math.cos(want - c.yaw)) * (1 - Math.exp(-8 * dt));
    c.setState(state, 6);
  };

  P._huntStart = function (z) {
    z.mode = 'hunt'; z.huntT = 0; z.lostT = 0; z.groanT = 0;
    z.c.setState('zScream', 8);
    this.audio.scream(z.c.root.position);
    this.audio.stinger(0.6);
    this.cam.shake(0.03);
    this.hud.toast(this.darkness && this.lightOn ? 'IT SENSED YOUR LIGHT — KILL IT AND HIDE' : 'IT HEARD YOU — RUN, THEN GO QUIET', 2.6);
  };

  P._updateDeck = function (dt) {
    if (!this.deckAI || this.area !== 'C') return;
    const a = this.deckAI;
    a.shown += (a.detect - a.shown) * (1 - Math.exp(-6 * dt));
    this.hud.noise(a.shown, true);
    const hunting = this.zombies.some((z) => z.group === 'deck' && z.mode === 'hunt');
    this.g.renderer.fx.uDanger.value = hunting ? 0.55 : Math.max(0, a.shown - 0.4);
    this.audio.setHeartbeat(hunting ? 2.2 : a.shown > 0.3 ? 1.3 : 0.9);
    a.detect = 0;
    // zone triggers
    const p = this.lead.position;
    for (const zt of this.zones || []) if (!zt.done && zt.test(p)) { zt.done = true; zt.fn(); }
  };

  // ======================================================================= LEVEL 2
  P.beat_l2intro = async function () {
    const S = this.station;
    this.checkpoint = 'l2intro';
    this.cinematic(true);
    this.hud.fade(1, 0);
    this.zones = [];
    this._storageDoorObstacle(true);
    S.setStorageDoor(0, true); S.storageDoor.locked = true;
    this._deckSetup({ blackout: false, ctrlPower: false, alarm: false, ctrlClosed: false, bayOpen: false, bayZombies: false });
    this._placeCrew('C', [-1.4, 0.6, -Math.PI / 2], [-2.4, 1.4, -Math.PI / 2], [-4.7, 2.4, -Math.PI / 2]);
    if (!this.inventory?.length) ['Plasma cutter', 'Crowbar', 'Rations', 'EVA vests', 'Med-kit'].forEach((n) => this.addItem(n));
    this.setTasks('LEVEL 2 · BLACKOUT', L2_TASKS);
    this.audio.startLevelMusic(2); this.audio.startAmbience(); this.audio.setAmbienceLevel(0.3, 1); this.audio.startAlarm(); this.audio.setAlarmLevel(0.05, 1);
    this.cam.camera.position.set(-0.2, -3.2, 3.2);
    this.cam.shot(V(-0.2, -3.2, 3.2), V(-4.2, -3.6, 1.8), 0);
    this.hud.fade(0, 0.6);
    this.hud.chapter('LEVEL 2\nBLACKOUT', 2.4);
    await this.say('Anna', 'Breaker\'s here. When the lights die, so does the hum — they\'ll be deaf and blind in the dark.', 3.6);
    await this.say('Max', 'Lights off near them. Crouch. One step at a time.', 2.4);
    this.cinematic(false);
    this.hud.toast('NEW: SWITCH PLAYER — top bar', 3);
    this.player.camYaw = -Math.PI / 2 + 0.3; this.player.camPitch = 0.15;
    this.fSean.active = this.fAnna.active = true;
    this.hud.objective('Cut the deck power at the breaker');
    this.addInteract({ id: 'breaker', pos: S.breakerSpot, r: 1.1, text: 'Pull the main breaker', onUse: () => this._blackout() });
  };

  P._blackout = async function () {
    const S = this.station;
    this.removeInteract('breaker');
    this.cinematic(true);
    this.lead.reachTarget = 1;
    await this.tween(0.5, (k) => (S.breakerLever.rotation.z = -k * 1.2));
    this.audio.impact(S.breakerSpot, 0.8, true);
    this.audio.whoosh(1.6, false, 0.4);
    this.lead.reachTarget = 0;
    S.setBlackout(true);
    this.darkness = true;
    this.audio.setAlarmLevel(0, 0.5); this.audio.setAmbienceLevel(0.04, 2);
    this.lightOn = true; this._applyLight(); document.querySelector('[data-tb="light"]')?.classList.add('on');
    this.cam.shake(0.02);
    await this.wait(0.8);
    await this.say('Sean', '...I can\'t see a thing.', 1.8);
    await this.say('Anna', 'Neither can they.', 1.6);
    this.completeTask('breaker');
    this.cinematic(false);
    this.hud.toast('FLASHLIGHT: LIGHT button / F — infected sense it in the dark', 4);
    this.hud.objective('Unlock the storage door');
    this.addInteract({ id: 'door2', pos: S.storagePanelPos, r: 1.0, text: 'Release the mag-lock', onUse: async () => {
      this.removeInteract('door2');
      this.audio.lock(V(6, -3.3, 1.5));
      S.storageDoor.rate = 1; S.setStorageDoor(0.95);
      this._storageDoorObstacle(false);
      this.completeTask('door2');
      S.guideLine.userData.show(true); S.guideFuse.userData.show(true);
      this.hud.toast('FOLLOW THE BLUE LINE TO THE CONTROL ROOM', 3.2);
      this.hud.objective('Sneak through the Logistics Spine');
      await this.say('Max', '(whispering) Stay low. Stay behind me.', 2);
    } });
    this.zones.push({ test: (p) => p.x > 14.6, fn: () => { this.completeTask('spine'); this.hud.objective('Find an aux power fuse — the alcove on the right'); } });
    this.addInteract({ id: 'fuse', pos: S.fuseSpot, r: 1.0, text: 'Search the fuse locker', onUse: async () => {
      this.removeInteract('fuse');
      this.player.enabled = false; this.lead.reachTarget = 1; this.audio.rustle();
      this.player.noise = Math.max(this.player.noise, 0.45); // rummaging makes noise
      await this.wait(1.1);
      this.lead.reachTarget = 0; this.player.enabled = true;
      this.addItem('Aux fuse'); this.completeTask('fuse');
      S.guideFuse.userData.show(false);
      S.fuseLight.material.emissiveIntensity = 0;
      this.hud.objective('Reach the control room');
    } });
    this.zones.push({ test: (p) => p.x > 28.7 && this.taskList.find((t) => t.id === 'fuse')?.done, fn: () => this.start('l2ctrl') });
  };

  /** Mid-level checkpoint: inside the control room, door sealed behind them. */
  P.beat_l2ctrl = async function () {
    const S = this.station;
    this.checkpoint = 'l2ctrl';
    this.zones = [];
    const restarting = this.area !== 'C' || !this.darkness;
    this._deckSetup({ blackout: true, ctrlPower: false, alarm: false, ctrlClosed: false, bayOpen: false, bayZombies: false });
    this._storageDoorObstacle(false); S.setStorageDoor(0.95, true);
    if (restarting || this.lead.position.x < 28) this._placeCrew('C', [29.4, 0, Math.PI / 2], [28.6, 0.6, Math.PI / 2], [28.6, -0.6, Math.PI / 2]);
    this.addItem('Aux fuse');
    ['breaker', 'door2', 'spine', 'fuse'].forEach((id) => { const t = this.taskList?.find((x) => x.id === id); if (t) t.done = true; });
    if (!this.taskList || this.levelName !== 'LEVEL 2 · BLACKOUT') this.setTasks('LEVEL 2 · BLACKOUT', L2_TASKS.map((t, i) => ({ ...t, done: i < 4 })));
    this.hud.tasks(this.levelName, this.taskList);
    this.lightOn = true; this._applyLight();
    this.cinematic(true);
    this.fSean.active = this.fAnna.active = false;
    await this.walk(this.fSean, V(28.4, -4.6, 1.2), 2.2);
    this.cam.shot(V(31.5, -3.2, 2.4), V(28.1, -3.6, 0), 0.8);
    this.sean.yaw = -Math.PI / 2; this.sean.reachTarget = 1;
    S.setCtrlDoor(true); this.audio.doorSlide(V(28, -3.5, 0), true);
    await this.wait(0.6); this.sean.reachTarget = 0;
    this.completeTask('control');
    await this.say('Sean', 'Door\'s sealed. Whatever happens now, it happens fast.', 2.4);
    await this.say('Anna', 'Comms needs aux power. That cabinet — fuse goes in there.', 2.4);
    this.cinematic(false);
    this.fSean.active = this.fAnna.active = true;
    this.hud.objective('Install the fuse in the aux cabinet');
    this.addInteract({ id: 'power', pos: S.fuseSocketSpot, r: 1.0, text: 'Install the aux fuse', onUse: async () => {
      this.removeInteract('power');
      this.lead.reachTarget = 1; this.audio.impact(S.fuseSocketSpot, 0.3, true);
      await this.wait(0.6); this.lead.reachTarget = 0;
      this.audio.lock(S.fuseSocketSpot);
      S.ctrlPower = true; S.setArea('C');
      S.ctrlRoom.setPower(true);
      S.auxLight.material.emissive.set(0x3dff8a);
      for (let k = 0; k < S.consoleScreens.length; k++) { await this.wait(0.25); S.consoleScreens[k].emissiveIntensity = 0.85; this.audio.uiSound('on'); }
      this.completeTask('power');
      this.hud.objective('Align the comms antenna at the COMMS console');
      this.addInteract({ id: 'align', pos: S.commsSpot, r: 1.1, text: 'Align the antenna', onUse: () => this._alignAntenna() });
    } });
  };

  /** Timing mini-game: stop the needle inside the green window three times. */
  P._alignAntenna = async function () {
    this.removeInteract('align');
    this.player.enabled = false;
    const el = document.createElement('div');
    el.id = 'align';
    el.innerHTML = `<div class="al-k">ANTENNA ALIGNMENT · DISH 2</div><div class="al-bar"><i class="al-zone"></i><b class="al-needle"></b></div>
      <div class="al-hits"><i></i><i></i><i></i></div><button class="al-btn" type="button">LOCK <kbd>E</kbd></button><div class="al-tip">Tap LOCK when the needle is inside the green band</div>`;
    document.getElementById('hud').appendChild(el);
    document.body.classList.add('minigame');
    let hits = 0, misses = 0, t = 0, zone = 0.3 + Math.random() * 0.4, width = 0.16, speed = 1.1, alive = true;
    const zoneEl = el.querySelector('.al-zone'), needle = el.querySelector('.al-needle');
    const place = () => { zoneEl.style.left = `${(zone - width / 2) * 100}%`; zoneEl.style.width = `${width * 100}%`; };
    place();
    const press = () => {
      const x = 0.5 + 0.5 * Math.sin(t * speed * Math.PI);
      if (Math.abs(x - zone) < width / 2) {
        hits++; this.audio.uiSound('on'); el.querySelectorAll('.al-hits i')[hits - 1].classList.add('on');
        zone = 0.2 + Math.random() * 0.6; width *= 0.85; speed *= 1.25; place();
      } else {
        misses++; this.audio.uiSound('off'); this.audio.ui('error');
        this.player.noise = Math.max(this.player.noise, 0.7); // the console squeals
        el.classList.remove('miss'); void el.offsetWidth; el.classList.add('miss');
        if (misses % 2 === 0) { this.audio.impact(V(28, -3.5, 0), 0.8, true); this.cam.shake(0.02); }
      }
    };
    el.querySelector('.al-btn').addEventListener('click', press);
    await new Promise((resolve) => {
      const tick = () => {
        if (!alive) return;
        t += 1 / 60;
        needle.style.left = `${(0.5 + 0.5 * Math.sin(t * speed * Math.PI)) * 100}%`;
        if (this.input.wasPressed('KeyE') || this.input.wasPressed('Space')) press();
        if (hits >= 3) { alive = false; resolve(); return; }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    el.classList.add('done');
    document.body.classList.remove('minigame');
    setTimeout(() => el.remove(), 600);
    this.completeTask('align');
    this.player.enabled = true;
    await this.say('Anna', 'Dish is locked. We have a carrier wave.', 2);
    this.hud.objective('Send a signal to Earth');
    this.addInteract({ id: 'signal', pos: this.station.commsSpot, r: 1.1, text: 'Transmit distress call', onUse: () => this._transmission() });
  };

  P._transmission = async function () {
    const S = this.station;
    this.removeInteract('signal');
    this.cinematic(true);
    this.hud.noise(0, false);
    this.deckAI = null;
    const m = this.max;
    m.root.position.set(33.9, -4.6, 0.6); m.yaw = Math.PI / 2; m.snap();
    this.sean.root.position.set(33.2, -4.6, 1.6); this.sean.yaw = Math.PI / 2 + 0.4; this.sean.snap();
    this.anna.root.position.set(33.2, -4.6, -0.5); this.anna.yaw = Math.PI / 2 - 0.4; this.anna.snap();
    [m, this.sean, this.anna].forEach((c) => { c.setState('idle'); c.speed = 0; });
    this.fSean.active = this.fAnna.active = false;
    this.cam.shot(V(31.2, -3.0, 0.4), V(37.5, -3.0, 0.4), 1.2);
    S.consoleScreens.forEach((mt) => mt.emissive.set(0xff3b3b));
    await this.say('Max', 'Helios-7 to any ground station. Helios-7 to any ground station. Please respond.', 3);
    this.audio.uiSound('open');
    await this.wait(1.6);
    S.consoleScreens.forEach((mt) => mt.emissive.set(0x5ff3ff));
    await this.say('GROUND', '...Helios-7... we read you. Thank God. This is Ground Station Kestrel. Who is this?', 3.4);
    await this.say('Max', 'Max Reyes. Three survivors. The lab deck — there\'s an outbreak up here. We need evac.', 3.2);
    await this.say('GROUND', 'There is no evac. There\'s nothing left down here to send it.', 3);
    this.cam.shot(V(32.2, -3.3, 2.4), V(34.6, -3.0, -0.2), 1.6);
    await this.say('Anna', 'What do you mean, nothing left?', 2);
    await this.say('GROUND', 'It reached us eleven days ago. One sample, on a supply return.', 3);
    await this.say('GROUND', 'Up there it crawls. Down here... it moves through a city in hours. Airborne. Instant.', 3.6);
    await this.say('GROUND', 'Every hospital. Every army. We think less than one percent of us are left.', 3.4);
    await this.say('Sean', '...Then humanity\'s finished.', 2.2);
    await this.say('GROUND', 'Not if Genesis works. Your lab was building it — a cure. Ares colony on Mars is still clean. Get it there. Find a new—', 4.6);
    S.consoleScreens.forEach((mt) => mt.emissive.set(0xff3b3b));
    this.audio.impact(V(28, -3.5, 0), 1, true); this.cam.shake(0.05);
    await this.say('Max', 'Kestrel? Kestrel!', 1.4);
    this.audio.impact(V(28, -3.5, 0), 1, true); this.cam.shake(0.05);
    await this.say('Anna', 'The signal — every one of them heard it.', 2);
    this.completeTask('signal');
    saveProgress(3);
    await this._guardBeat(this.hud.levelCleared(2, 'BLACKOUT'));
    this.start('l3');
  };

  // tick hooks (called from Story.update)
  const baseUpdate = P.update;
  P.update = function (dt) {
    baseUpdate.call(this, dt);
    const S = this.station;
    if (this.area === 'C' && S.ctrlRoom) { S.ctrlRoom.update(dt, this.lead.position.x > 25.5); S.guideLine.userData.update(dt); S.guideFuse.userData.update(dt); }
    this._updateDeck(dt);
    this._updateL3(dt);
    this._updateL4(dt);
  };
}

export { wait };
