/**
 * LEVEL 3 — LOCKDOWN and LEVEL 4 — NEW EARTH (installed onto Story.prototype).
 *
 * L3: the horde is at the control-room door. Anna (the station's doctor) proposes the plan:
 *     seal every section, lock the passage blast door, then vent the oxygen. The player can
 *     ASSIGN tasks to Sean and Anna, who walk to the consoles and do them.
 * L4: gather supplies, refuel ARES-1, download the lab data, reach the docking section, find
 *     the two infected mechanics in the decompression chamber, bait them into the cargo annex,
 *     seal it, then seal the chamber, suit up and fly to Mars.
 */
export const L3_TASKS = [
  { id: 'ring', text: 'Seal the Habitat Ring bulkheads' },
  { id: 'lab', text: 'Seal the Research Wing bulkheads' },
  { id: 'cargo', text: 'Seal the Cargo & Logistics bulkheads' },
  { id: 'passage', text: 'Close the blast door on the passage to the control room' },
  { id: 'vent', text: 'Vent the oxygen — decompress every section' },
];
export const L4_TASKS = [
  { id: 'essentials', text: 'Gather essentials for the 6-month journey' },
  { id: 'refuel', text: 'Refuel the ship' },
  { id: 'data', text: 'Download the research lab data' },
  { id: 'dock', text: 'Go to the docking section' },
  { id: 'bait', text: 'Bait the mechanics into the cargo annex' },
  { id: 'chamber', text: 'Seal yourselves in the decompression chamber' },
  { id: 'suit', text: 'Suit up and fly to Mars' },
];
const CREW_COLOR = { Max: '#5ff3ff', Sean: '#ffa040', Anna: '#ff7fe0' };
const MECH_SUIT = 0xd9772b;
// face directions (yaw): +x = PI/2, -x = -PI/2, +z = 0, -z = PI
const FACE = { east: Math.PI / 2, west: -Math.PI / 2, north: 0, south: Math.PI };

export function installEndgame(Story, { V, saveProgress, saveResume }) {
  const P = Story.prototype;

  // ======================================================================= task assignment
  /** defs: { taskId: { pos, face, text, time, done(who), ready?() , solo? } } */
  P._setupTasks = function (defs) {
    this._assign = { defs, queue: { Max: [], Sean: [], Anna: [] }, working: {} };
    for (const [id, d] of Object.entries(defs)) {
      if (d.noInteract) continue;
      this.addInteract({ id: `task_${id}`, pos: d.pos, r: 1.1, text: d.text, onUse: () => this._playerDoTask(id) });
    }
    this._refreshAssign();
  };

  P._assignable = function () {
    const A = this._assign; if (!A || !this.taskList) return [];
    return this.taskList.filter((t) => !t.done && !t.who && A.defs[t.id] && !A.defs[t.id].solo && (A.defs[t.id].ready?.() ?? true));
  };

  P._refreshAssign = function () {
    this.hud.assignButton(this._assignable().length > 0, () => this.openAssign());
  };

  P.openAssign = async function () {
    const tasks = this._assignable(); if (!tasks.length) return;
    const tk = this.token;
    const crew = [this.max, this.sean, this.anna].filter((c) => c !== this.lead).map((c) => ({ name: c.opts.name, color: CREW_COLOR[c.opts.name], busy: this._assign.queue[c.opts.name].length + (this._assign.working[c.opts.name] ? 1 : 0) }));
    const was = this.player.enabled; this.player.enabled = false;
    const picks = await this.hud.assignPanel(tasks.map((t) => ({ id: t.id, text: t.text })), crew);
    if (tk !== this.token) return;
    this.player.enabled = was;
    if (!picks?.length) return;
    const ack = { Sean: ['On it.', 'Leave it to me.', 'Going.'], Anna: ['I\'ve got it.', 'Done in a minute.', 'Moving.'], Max: ['I\'ll handle it.'] };
    const said = new Set();
    for (const { id, who } of picks) {
      const t = this.taskList.find((x) => x.id === id); if (!t || t.done) continue;
      t.who = who;
      this.removeInteract(`task_${id}`);
      this._assign.queue[who].push(id);
      if (!said.has(who)) { said.add(who); this.say(who, ack[who][Math.floor(Math.random() * ack[who].length)], 1.4); }
      if (!this._assign.working[who]) this._crewWork(who);
    }
    this.hud.tasks(this.levelName, this.taskList);
    this._refreshAssign();
  };

  P._followerFor = function (ch) { return [this.fSean, this.fAnna].find((f) => f.char === ch); };

  /** A crew member works through their queue: walk → face the panel → work → done. */
  P._crewWork = async function (who) {
    const A = this._assign, ch = { Max: this.max, Sean: this.sean, Anna: this.anna }[who];
    const f = this._followerFor(ch); if (!f) return;
    A.working[who] = true;
    f.active = false;
    while (A.queue[who].length) {
      const id = A.queue[who][0], d = A.defs[id];
      await this.walk(f, d.pos, 2.6, null, true); // gameplay walk: walls and consoles are solid
      ch.yaw = d.face; ch.reachTarget = 1; this.audio.uiSound('press');
      await this.wait(d.time ?? 2.4);
      ch.reachTarget = 0;
      A.queue[who].shift();
      const t = this.taskList.find((x) => x.id === id);
      if (t && !t.done) { await d.done(who); this.say(who, d.report || 'Done.', 1.6); }
    }
    A.working[who] = false;
    f.scripted = null; f.active = true;
    this._refreshAssign();
  };

  P._playerDoTask = async function (id) {
    const d = this._assign?.defs[id]; if (!d) return;
    const t = this.taskList.find((x) => x.id === id); if (!t || t.done) return;
    if (d.ready && !d.ready()) { this.hud.toast(d.notReady || 'NOT YET', 2.4); this.audio.ui('error'); return; }
    if (d.onPlayer) { d.onPlayer(); return; }
    this.removeInteract(`task_${id}`);
    this.player.enabled = false;
    this.lead.yaw = d.face; this.lead.reachTarget = 1; this.audio.uiSound('press');
    await this.wait(Math.min(1.4, d.time ?? 1.2));
    this.lead.reachTarget = 0;
    this.player.enabled = true;
    await d.done(this.lead.opts.name);
  };

  P._finishTask = function (id) {
    const t = this.taskList?.find((x) => x.id === id); if (!t || t.done) return;
    t.who = null;
    this.removeInteract(`task_${id}`);
    this.completeTask(id);
    this._refreshAssign();
    this._onTaskDone?.(id);
  };

  // ======================================================================= shared setup
  P._endgameWorld = function ({ level }) {
    const S = this.station;
    S.ledState.sealed = { ring: level >= 4, lab: level >= 4, cargo: level >= 4, passage: level >= 4 };
    S.ledState.o2 = level >= 4 ? 0 : 1; S.ledState.infected = level >= 4 ? 2 : 214;
    Object.values(S.l3Panels).forEach((m) => m.emissive.set(level >= 4 ? 0x3dff8a : 0xff3b3b));
    S.setBlast(level >= 4 ? 1 : 0);
    S.setAirlock(false); S.setAnnex(false);
    S.airlockLight.material.emissive.set(0xff3b3b); S.annexLight.material.emissive.set(0xffb547); S.airlockPanelLight.material.emissive.set(0xff3b3b);
    S.beacon.visible = false; this._beacon = null;
    S.shipHatch.material.emissive.set(0x1a4a5a);
    S.setDockLights(level >= 4);
    this.switchAllowed = false; document.body.classList.remove('can-switch');
  };

  // ======================================================================= LEVEL 3 · LOCKDOWN
  P.beat_l3 = async function () {
    const S = this.station;
    this.checkpoint = 'l3';
    this.zones = [];
    this.hud.fade(1, 0);
    this._storageDoorObstacle(false);
    this._deckSetup({ blackout: false, ctrlPower: true, alarm: true, ctrlClosed: true, bayOpen: false, bayZombies: false, bright: true });
    this._endgameWorld({ level: 3 });
    // the horde gathers at the control-room door
    this.zombies.forEach((z, i) => { if (i < 9) { z.c.root.position.set(25 + (i % 3) * 0.9, -4.6, -1 + Math.floor(i / 3) * 0.9); z.mode = 'hunt'; z.huntT = 0; z.lostT = -999; z.groanT = Math.random() * 2; z.huntSpeed = 3.6; } });
    this._placeCrew('C', [33.0, 0.6, -Math.PI / 2], [32.6, 2.0, -Math.PI / 2], [32.4, -1.6, -Math.PI / 2]);
    if (!this.inventory?.length) ['Plasma cutter', 'EVA vests', 'Med-kit'].forEach((n) => this.addItem(n));
    this.setTasks('LEVEL 3 · LOCKDOWN', L3_TASKS);
    this.lightOn = true; this._applyLight();
    this.audio.startLevelMusic(3);
    this.cinematic(true);
    this.fSean.active = this.fAnna.active = false;
    this.cam.camera.position.set(30.5, -3.0, -2.5);
    this.cam.shot(V(30.5, -3.0, -2.5), V(28, -3.4, 0), 0);
    this.hud.fade(0, 0.6);
    this.hud.chapter('LEVEL 3\nLOCKDOWN', 2.4);
    await this.say('Sean', 'That door won\'t hold for long!', 1.8);
    await this.say('Max', 'We can\'t outrun them. Not three of us. Not out there.', 2.4);
    await this.shot(V(31.2, -3.1, -0.4), V(32.4, -3.2, -1.6), 1.2);
    await this.say('Anna', 'Then we don\'t run. Listen to me — before all this, I ran the med bay. I was this station\'s doctor.', 3.6);
    await this.say('Anna', 'Whatever the virus did to them, they still breathe. And nothing that breathes survives without oxygen.', 3.6);
    await this.say('Anna', 'Seal every section so they stay where they are. Close the blast door on our passage. Then vent the air — everywhere except this room and the docking ring.', 4.6);
    await this.say('Max', 'Decompression. It\'ll kill everything out there.', 2.2);
    await this.say('Anna', 'Everything out there is already dead, Max.', 2.2);
    await this.say('Max', 'Then we split the work. Sean, Anna — take a console each.', 2.4);
    this.cinematic(false);
    this.fSean.active = this.fAnna.active = true;
    this.doorTimer = { v: 1, rate: 1 / 150 };
    this.hud.objective('Seal the sections — use ASSIGN TASK to split the work');
    this.hud.toast('NEW: ASSIGN TASK — give Sean and Anna a job', 4);
    const seal = (key, label, report) => async () => {
      S.ledState.sealed[key] = true; S.ledState.infected = Math.max(40, S.ledState.infected - 50);
      this.audio.lock(S.l3Spots[key]); this.audio.impact(V(28, -3.5, 0), 0.4, true);
      if (S.l3Panels[key]) S.l3Panels[key].emissive.set(0x3dff8a);
      this.hud.toast(`${label} SEALED`, 2);
      this._finishTask(key);
      void report;
    };
    this._onTaskDone = (id) => {
      const left = ['ring', 'lab', 'cargo', 'passage'].filter((k) => !this.taskList.find((t) => t.id === k)?.done);
      if (!left.length && id !== 'vent') { this.hud.objective('Vent the oxygen at the life-support holo-table'); this.say('Anna', 'Everything\'s sealed. The holo-table — vent it. Now.', 2.4); }
      else if (id !== 'vent') this.hud.objective(`Seal the sections — ${left.length} left`);
    };
    this._setupTasks({
      ring: { pos: S.l3Spots.ring, face: FACE.east, text: 'Seal Habitat Ring bulkheads', done: seal('ring', 'HABITAT RING'), report: 'Habitat Ring sealed.' },
      lab: { pos: S.l3Spots.lab, face: FACE.east, text: 'Seal Research Wing bulkheads', done: seal('lab', 'RESEARCH WING'), report: 'Research Wing is locked down.' },
      cargo: { pos: S.l3Spots.cargo, face: FACE.south, text: 'Seal Cargo & Logistics bulkheads', done: seal('cargo', 'CARGO & LOGISTICS'), report: 'Cargo bulkheads are down.' },
      passage: {
        pos: S.l3Spots.passage, face: FACE.west, text: 'Drop the passage blast door', report: 'Blast door\'s down. That\'ll hold.',
        done: async () => {
          this.doorTimer = null; this.hud.timer(0, false);
          S.ledState.sealed.passage = true; S.l3Panels.passage.emissive.set(0x3dff8a);
          this.audio.doorSlide(V(28.3, -3.5, 0), true); this.cam.shake(0.03);
          await this.tween(0.9, (k) => S.setBlast(k));
          this.audio.impact(V(28.3, -3.5, 0), 1, true);
          this.zombies.forEach((z, i) => { if (i < 9 && z.mode === 'hunt') { z.mode = 'patrol'; z.route = [[z.c.root.position.x, z.c.root.position.z]]; z.susp = 0.3; z.turned = false; } });
          this.hud.toast('BLAST DOOR SEALED', 2);
          this._finishTask('passage');
        },
      },
      vent: {
        pos: S.l3Spots.vent, face: FACE.north, text: 'Vent the oxygen (life-support override)', solo: true,
        ready: () => ['ring', 'lab', 'cargo', 'passage'].every((k) => this.taskList.find((t) => t.id === k)?.done),
        notReady: 'SEAL ALL FOUR SECTIONS FIRST',
        onPlayer: () => { this.removeInteract('task_vent'); this._vent(); },
      },
    });
  };

  P._vent = async function () {
    const S = this.station;
    this.hud.assignButton(false);
    this.player.enabled = false;
    this.cinematic(true);
    this.doorTimer = null; this.hud.timer(0, false); this.hud.noise(0, false);
    const ai = this.deckAI; this.deckAI = null;
    this.lead.yaw = FACE.north; this.lead.reachTarget = 1;
    await this.shot(V(29.8, -3.0, -2.6), V(31.3, -3.6, 0), 1.0);
    await this.say('Max', 'Life-support override. Every section except ours.', 2.2);
    this.lead.reachTarget = 0;
    await this.say('Anna', '...Do it.', 1.4);
    this.audio.setAlarmLevel(0.5, 0.3); S.consoleScreens.forEach((m) => m.emissive.set(0xff3b3b));
    this.audio.whoosh(3, false, 0.6);
    // out in the spine: the air goes, and so do they
    await this.shot(V(22.5, -3.2, 1.0), V(26.4, -4.1, -0.2), 0.9);
    const o2 = S.ledState.o2;
    const dying = this.zombies.filter((z, i) => i < 9);
    dying.forEach((z, i) => setTimeout(() => { z.mode = 'dead'; this.audio.groan(z.c.root.position, 0.5); }, 600 + i * 260));
    await this.tween(4, (k) => { S.ledState.o2 = o2 * (1 - k); this.cam.shake(0.004); });
    this.audio.whoosh(1.5, false, 0.3);
    await this.wait(0.6);
    this.audio.setAlarmLevel(0.05, 1); S.consoleScreens.forEach((m) => m.emissive.set(0x5ff3ff));
    await this.shot(V(31.0, -3.0, 2.6), V(32.6, -3.3, 0.2), 1.0);
    await this.say('Sean', 'It\'s... quiet.', 1.6);
    await this.say('Anna', 'No air. No life. Not for them — not for anything out there.', 3);
    void ai;
    this.completeTask('vent');
    saveProgress(4);
    await this._guardBeat(this.hud.levelCleared(3, 'LOCKDOWN'));
    this.start('l4');
  };

  /** Level 3 per-frame: control-room door integrity until the blast door drops. */
  P._updateL3 = function (dt) {
    if (this.beat !== 'l3') return;
    const dtm = this.doorTimer;
    if (dtm && !dtm.broken && !document.body.classList.contains('cinematic')) {
      dtm.v -= dtm.rate * dt;
      this.hud.timer(dtm.v, true, 'CONTROL DOOR');
      if (Math.random() < dt * 2.5) { this.audio.impact(V(28, -3.5, 0), 0.6, true); this.cam.shake(0.006); }
      if (dtm.v <= 0) { dtm.broken = true; this._breach(); }
    }
  };

  P._breach = function () {
    this.station.setCtrlDoor(false);
    this.audio.impact(V(28, -3.5, 0), 1, true); this.audio.scream(V(27, -3.5, 0)); this.cam.shake(0.06);
    this.hud.timer(0, false);
    this.hud.toast('THE DOOR IS DOWN', 2);
    this.zombies.slice(0, 9).forEach((z, i) => { z.huntSpeed = 3.0 + (i % 3) * 0.35; z.mode = 'hunt'; z.lostT = -999; });
  };

  // ======================================================================= LEVEL 4 · NEW EARTH
  P._l4World = function () {
    const S = this.station;
    this._storageDoorObstacle(false);
    this._deckSetup({ blackout: false, ctrlPower: true, alarm: false, ctrlClosed: true, bayOpen: false, bayZombies: true, bright: true });
    this._endgameWorld({ level: 4 });
    // vented spine: the horde lies where it fell
    this.zombies.forEach((z, i) => {
      if (i < 9) { z.c.root.position.set(24.6 + (i % 3) * 1.0, -4.6, -1 + Math.floor(i / 3) * 0.9); z.mode = 'dead'; return; }
      // the two mechanics, trapped in the decompression chamber
      z.c.mats?.suit?.color.set(MECH_SUIT);
      const p = i === 9 ? [31.7, -14.3] : [34.3, -14.8];
      z.route = [p]; z.c.root.position.set(p[0], -4.6, p[1]); z.mode = 'patrol'; z.susp = 0; z.turned = false;
      z.c.root.visible = true;
    });
    this.lightOn = true; this._applyLight();
    this.audio.startLevelMusic(4);
  };

  P.beat_l4 = async function () {
    const S = this.station;
    this.checkpoint = 'l4';
    this.zones = [];
    this.hud.fade(1, 0);
    this._l4World();
    this._placeCrew('C', [32.6, 0.2, 0], [33.6, 1.6, -Math.PI / 2], [32.4, -1.4, Math.PI / 2]);
    if (!this.inventory?.length) ['Plasma cutter', 'EVA vests', 'Med-kit'].forEach((n) => this.addItem(n));
    this.setTasks('LEVEL 4 · NEW EARTH', L4_TASKS);
    this.cinematic(true);
    this.fSean.active = this.fAnna.active = false;
    this.cam.camera.position.set(36.6, -3.0, 2.8);
    this.cam.shot(V(36.6, -3.0, 2.8), V(31.5, -3.6, 0), 0);
    this.hud.fade(0, 0.8);
    this.hud.chapter('LEVEL 4\nNEW EARTH', 2.4);
    await this.say('Anna', 'Every section out there is vacuum now. We\'re the only air left on Helios-7.', 3);
    await this.say('Max', 'Earth\'s gone. But before Kestrel went dark, the feed showed Ares colony on Mars — still clean.', 3.4);
    await this.say('Sean', 'ARES-1 is docked in Bay A. She\'s fuelled for a supply hop, not six months.', 2.8);
    await this.say('Max', 'Then we fuel her, pack for six months, and take the lab\'s research with us. If there\'s a cure in it, it goes to Mars.', 3.8);
    this.cinematic(false);
    this.fSean.active = this.fAnna.active = true;
    this.hud.objective('Prepare for the journey — use ASSIGN TASK to split the work');
    const prepLeft = () => ['essentials', 'refuel', 'data'].filter((k) => !this.taskList.find((t) => t.id === k)?.done);
    this._onTaskDone = (id) => {
      if (!['essentials', 'refuel', 'data'].includes(id)) return;
      const left = prepLeft();
      if (left.length) this.hud.objective(`Prepare for the journey — ${left.length} left`);
      else { this.hud.objective('Go to the docking section'); this.say('Sean', 'That\'s everything. Docking section — through the south door.', 2.4); }
    };
    this._setupTasks({
      essentials: {
        pos: S.suppliesSpot, face: FACE.north, text: 'Pack supplies for six months', time: 3, report: 'Food, water, meds — six months, packed.',
        done: async () => { ['Ration crates ×6', 'Water reclaimer', 'Med supplies'].forEach((n) => this.addItem(n)); this.audio.rustle(); this._finishTask('essentials'); },
      },
      refuel: {
        pos: S.fuelSpot, face: FACE.south, text: 'Start the fuel transfer to ARES-1', time: 3, report: 'Fuel transfer complete. Tanks are full.',
        done: async () => { S.l3Panels.cargo.emissive.set(0x5ff3ff); this.audio.whoosh(1.2, true, 0.3); this.hud.toast('ARES-1 FUEL 100%', 2); this._finishTask('refuel'); },
      },
      data: {
        pos: S.vaultSpot, face: FACE.north, text: 'Download the research lab data', time: 3, report: 'Lab data\'s on the drive. All of Genesis.',
        done: async () => { S.vaultGlow.material.emissive.set(0x5ff3ff); this.addItem('Genesis research drive'); this.audio.uiSound('on'); this._finishTask('data'); },
      },
    });
    this.addInteract({
      id: 'dockdoor', pos: V(33, -4.6, -5.35), r: 1.0, text: 'Open the docking section door',
      onUse: () => {
        if (prepLeft().length) { this.hud.toast('FINISH THE PREPARATIONS FIRST', 2.4); this.audio.ui('error'); return; }
        this.removeInteract('dockdoor');
        S.setBayDoor(true); this.audio.doorSlide(V(33, -3.5, -6), false);
        this.zones.push({ test: (p) => p.z < -7.4, fn: () => this._mechanics() });
      },
    });
  };

  P._mechanics = async function () {
    const S = this.station;
    this.hud.assignButton(false);
    this.player.enabled = false;
    this.cinematic(true);
    this.fSean.active = this.fAnna.active = false;
    const [m1, m2] = [this.zombies[9], this.zombies[10]];
    [m1, m2].forEach((z, k) => { z.c.root.position.set(k ? 33.9 : 32.1, -4.6, -12.95); z.c.yaw = 0; z.mode = 'scene'; z.c.setState('zPound', 6); z.c.snap(); });
    this.max.root.position.set(33, -4.6, -9.6); this.max.yaw = Math.PI; this.max.snap();
    this.sean.root.position.set(32.0, -4.6, -9.0); this.sean.yaw = Math.PI; this.sean.snap();
    this.anna.root.position.set(34.0, -4.6, -9.1); this.anna.yaw = Math.PI; this.anna.snap();
    [this.max, this.sean, this.anna].forEach((c) => { c.setState('idle'); c.speed = 0; });
    this.audio.impact(V(33, -3.5, -12.6), 0.5, false); this.audio.groan(m1.c.root.position, 0.9);
    await this.shot(V(33.6, -3.2, -10.4), V(33, -3.4, -13), 1.0);
    await this.say('Anna', 'Behind the glass — two of them!', 1.8);
    await this.shot(V(33.0, -3.3, -11.6), V(33, -3.4, -13.2), 1.2);
    await this.say('Max', '...Ortiz. And Bell.', 2);
    await this.say('Anna', 'You knew them?', 1.4);
    await this.shot(V(32.0, -3.1, -10.6), V(33, -3.0, -9.3), 1.0);
    await this.say('Max', 'My crew. Sean and I are mechanical — we kept this ship flying. They were prepping ARES-1 when it started.', 3.8);
    await this.say('Sean', 'The chamber\'s decompression must have failed. The vent never fired — that\'s why they\'re still... like this.', 3.6);
    await this.say('Anna', 'And they\'re trapped between the ship and the chamber. Right in our way.', 2.8);
    await this.say('Max', 'They hunt by sound. A noise beacon in the cargo annex, open the chamber, let them walk in there — then seal it behind them.', 4);
    await this.say('Sean', 'And we stay very, very quiet.', 2);
    this.completeTask('dock');
    this.checkpoint = 'l4dock'; saveResume('l4dock');
    this._startBait();
  };

  P.beat_l4dock = async function () {
    const S = this.station;
    this.checkpoint = 'l4dock';
    this.zones = [];
    this.hud.fade(1, 0);
    this._l4World();
    S.setBayDoor(true);
    this._placeCrew('C', [33, -9.6, Math.PI], [32.0, -9.0, Math.PI], [34.0, -9.1, Math.PI]);
    ['Ration crates ×6', 'Water reclaimer', 'Genesis research drive'].forEach((n) => this.addItem(n));
    this.setTasks('LEVEL 4 · NEW EARTH', L4_TASKS.map((t, i) => ({ ...t, done: i < 4 })));
    this.hud.fade(0, 0.6);
    this._startBait();
  };

  P._startBait = function () {
    const S = this.station;
    this.cinematic(false);
    this.player.enabled = true;
    this.fSean.active = this.fAnna.active = true;
    [this.zombies[9], this.zombies[10]].forEach((z, k) => { const p = k ? [34.3, -14.8] : [31.7, -14.3]; z.route = [p]; z.mode = 'patrol'; z.susp = 0; z.turned = false; z.c.setState('zIdle', 3); });
    this.hud.objective('Set the noise beacon in Cargo Annex 4 (west door)');
    this.hud.toast('STAY QUIET — CROUCH OR CRAWL NEAR THEM', 3.5);
    this.addInteract({
      id: 'beacon', pos: S.beaconSpot, r: 1.1, text: 'Set the noise beacon',
      onUse: async () => {
        this.removeInteract('beacon');
        this.lead.reachTarget = 1; this.audio.rustle();
        await this.wait(0.8); this.lead.reachTarget = 0;
        S.beacon.visible = true; this._beacon = { t: 0, on: false };
        this.hud.objective('Get out of the annex — open the chamber at the airlock panel (east wall)');
        this.say('Max', '(whispering) Beacon\'s set. It goes off when the chamber opens.', 2.4);
        this.addInteract({ id: 'airlock', pos: S.airlockPanelSpot, r: 1.0, text: 'Open the decompression chamber', onUse: () => this._openChamber() });
      },
    });
    this.addInteract({ id: 'annexSeal', pos: S.annexPanelSpot, r: 0.9, text: 'Seal the cargo annex', onUse: () => this._sealAnnex() });
  };

  P._openChamber = function () {
    const S = this.station;
    this.removeInteract('airlock');
    S.setAirlock(true); this.audio.doorSlide(V(33, -3.5, -12.6), false);
    S.airlockLight.material.emissive.set(0xffb547); S.airlockPanelLight.material.emissive.set(0x3dff8a);
    this._beacon.on = true;
    const path = [[33, -13.4], [33, -11.4], [30.2, -10.25], [26.2, -10.25]];
    [this.zombies[9], this.zombies[10]].forEach((z, k) => { z.mode = 'lure'; z.lure = path.map((p) => [p[0], p[1] + (k ? 0.35 : -0.35)]); z.lureI = 0; z.susp = 0; z.delay = k * 1.2; });
    this.hud.objective('Hide and stay silent — let them walk into the annex');
    this.hud.toast('THE BEACON IS SCREAMING — DON\'T MAKE A SOUND', 3);
  };

  P._sealAnnex = async function () {
    const S = this.station;
    const inside = [this.zombies[9], this.zombies[10]].every((z) => z.c.root.position.x < 28.5 && z.mode !== 'hunt');
    if (!S.beacon.visible) { this.hud.toast('SET THE BEACON FIRST', 2); this.audio.ui('error'); return; }
    if (!inside) { this.hud.toast('NOT YET — THEY\'RE NOT BOTH INSIDE', 2.2); this.audio.ui('error'); return; }
    if (this.lead.position.x < 29) { this.hud.toast('GET OUT OF THE ANNEX FIRST', 2); return; }
    this.removeInteract('annexSeal');
    S.setAnnex(true); this.audio.doorSlide(V(28.9, -3.5, -10.25), true); this.audio.lock(V(28.9, -3.5, -10.25));
    S.annexLight.material.emissive.set(0x3dff8a);
    this.cam.shake(0.02);
    this.completeTask('bait');
    this.say('Sean', '(whispering) Locked in. Sorry, guys.', 2);
    this.hud.objective('Get into the decompression chamber and seal it');
    this.addInteract({ id: 'chamber', pos: S.chamberSpot, r: 1.0, text: 'Seal the chamber door', onUse: () => this._sealChamber() });
  };

  P._sealChamber = async function () {
    const S = this.station;
    this.removeInteract('chamber');
    this.player.enabled = false;
    this.cinematic(true);
    this.fSean.active = this.fAnna.active = false;
    this.sean.root.position.set(32.2, -4.6, -14.2); this.sean.snap();
    this.anna.root.position.set(33.8, -4.6, -14.4); this.anna.snap();
    await this.shot(V(33, -3.0, -10.6), V(33, -3.6, -13.8), 0.8);
    S.setAirlock(false); this.audio.doorSlide(V(33, -3.5, -12.6), true); this.audio.lock(V(33, -3.5, -12.6));
    S.airlockLight.material.emissive.set(0x3dff8a);
    await this.wait(0.8);
    this.completeTask('chamber');
    await this.say('Anna', 'Chamber sealed. Suits — now.', 1.8);
    this.cinematic(false);
    this.player.enabled = true;
    this.hud.objective('Put on your space suit');
    this.addInteract({ id: 'suit', pos: S.suitSpot, r: 1.1, text: 'Put on your space suit', onUse: () => this._launchMars() });
  };

  P._launchMars = async function () {
    const S = this.station;
    this.removeInteract('suit');
    this.player.enabled = false;
    this.cinematic(true);
    this.deckAI = null; this.hud.noise(0, false);
    this.lead.reachTarget = 1; this.audio.rustle();
    await this.hud.fade(1, 0.5);
    await this.wait(0.6);
    this.lead.reachTarget = 0;
    this.hud.fade(0, 0.6);
    await this.shot(V(33, -3.0, -12.9), V(33, -3.3, -16), 1.0);
    await this.say('Max', 'Suits sealed. Venting the chamber.', 2);
    this.audio.whoosh(2.4, false, 0.5); this.cam.shake(0.01);
    await this.wait(1.6);
    S.shipHatch.material.emissive.set(0x3dff8a); this.audio.lock(V(33, -3.3, -15.9));
    await this.say('Sean', 'Hatch is green. ARES-1 is ours.', 2);
    await this.say('Anna', 'Next stop — Mars.', 1.8);
    this.completeTask('suit');
    await this._guardBeat(this.hud.fade(1, 0.8));
    saveProgress(5); // level 4 cleared
    await this._guardBeat(this.hud.levelCleared(4, 'NEW EARTH'));
    await this.g.playFinale();
  };

  /** Level 4 per-frame: the beacon's pulse. */
  P._updateL4 = function (dt) {
    const b = this._beacon; if (!b || !this.station.beacon.visible) return;
    b.t += dt;
    const on = b.on && Math.sin(b.t * 10) > 0;
    this.station.beaconLamp.material.color.set(on ? 0xff3b3b : 0x401010);
    const sealed = this.station.annexDoor.position.z === -10.25;
    if (b.on && !sealed) {
      b.beep = (b.beep ?? 0) - dt;
      if (b.beep <= 0) { b.beep = 0.45; this.audio.ui('error'); }
    }
  };
}
