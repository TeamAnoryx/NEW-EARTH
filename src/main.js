import * as THREE from 'three';
import { Renderer } from './engine/renderer.js';
import { Input } from './engine/input.js';
import { Audio } from './engine/audio.js';
import { HUD } from './ui/hud.js';
import { Tablet } from './ui/tablet.js';
import { getMaterials } from './world/materials.js';
import { Station, AREAS } from './world/station.js';
import { createEarth, createStars, createSun, createStationExterior } from './world/space.js';
import { Story } from './game/story.js';
import { TouchControls, isTouch } from './ui/touch.js';
import { Intro } from './intro/intro.js';
import { buildShip, playEndingFilm } from './game/finale.js';
import { CREDITS, WORDMARK_SVG } from './intro/brand.js';
import { detectTier, FrameGovernor } from './engine/perf.js';
import { loadProgress, loadCleared, loadResume, LEVELS, BEAT_LEVEL, markPlayed } from './game/progress.js';

const $ = (id) => document.getElementById(id);
const frame = () => new Promise((r) => requestAnimationFrame(() => r()));

const SETTINGS_KEY = 'new-earth-settings';
function loadSettings() {
  const def = { quality: 'auto', sens: 1, vol: 0.8, invert: false, music: true };
  try { return Object.assign(def, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); }
  catch { return def; }
}
function saveSettings(s) { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch (e) { console.info('Settings not saved (storage unavailable):', e?.message || e); } }

class Game {
  constructor() {
    this.canvas = $('game');
    this.renderer = new Renderer(this.canvas);
    this.input = new Input(this.canvas);
    this.audio = new Audio();
    this.hud = new HUD(this.audio);
    this.tablet = new Tablet(this.audio);
    this.areas = AREAS;
    this.mode = 'boot';      // boot | title | play | pause | dead
    this.timer = new THREE.Timer();
    this.timer.connect?.(document);
    this.t = 0;
    this.tabletEnabled = false;
    this.settings = loadSettings();
    this.isTouch = isTouch();
    document.body.classList.toggle('touch', this.isTouch);
    this.governor = new FrameGovernor(this.renderer);
    this.tablet.onCloseRequest = () => this.closeTablet();
    // LOOK lives above the touch layer (the joystick zone would otherwise swallow taps)
    const look = document.getElementById('lookbtn'); document.body.appendChild(look);
    look.addEventListener('click', (e) => { e.stopPropagation(); this.story?.toggleLookAround(); });
    if (this.isTouch) {
      this.touch = new TouchControls(this.input, {
        onCrouch: (v) => { if (this.story) this.story.player.forceCrouch = v; },
        onCrawl: (v) => { if (this.story) this.story.player.forceCrawl = v; },
        onMap: () => { if (this.tablet.open) this.closeTablet(); else if (this.tabletEnabled && this.story?.player.enabled) this.openTablet(null); },
        onPause: () => (this.mode === 'pause' ? this.resume() : this.mode === 'play' && this.pause()),
        onTap: () => this.hud.advance(),
      });
    }
    this.input.onEscape = () => this.onEscape();
    // desktop: the browser released the mouse (Esc) → pause, so a click on RESUME re-captures it
    window.addEventListener('keydown', (e) => { if ((e.code === 'Enter' || e.code === 'NumpadEnter') && !$('keyhelp').classList.contains('hidden')) { e.preventDefault(); this.closeKeyHelp(); } });
    this.input.onLockLost = () => { if (this.mode === 'play' && !this.tablet.open && !this.isTouch) this.pause(); };
    $('keyhint').addEventListener('click', (e) => { e.stopPropagation(); this.audio.uiSound('press'); this.openKeyHelp(); });
    $('keyhelp').querySelector('.kh-go').addEventListener('click', (e) => { e.stopPropagation(); this.audio.uiSound('play'); this.closeKeyHelp(); });
    // pause when the tab is hidden (rAF stops; avoid a huge delta and missed cues)
    // and silence everything: music, ambience, terror layer, heartbeat, intro soundtrack
    const onHide = () => {
      if (this.mode === 'play') this.pause();
      this.audio.suspend();
      this.intro?.setHidden(true);
    };
    const onShow = () => {
      this.intro?.setHidden(false);
      // a paused run stays silent until the player presses RESUME
      if (this.mode !== 'pause') this.audio.resumeAll();
    };
    document.addEventListener('visibilitychange', () => (document.visibilityState === 'hidden' ? onHide() : onShow()));
    window.addEventListener('pagehide', onHide);
    // switching to another app/window while the browser stays visible (desktop alt-tab)
    window.addEventListener('blur', () => { if (this.mode === 'play') this.pause(); });
    this._bindUI();
  }

  async boot() {
    const step = async (p) => { this.onBootProgress?.(p / 100); await frame(); };
    await step(8, 'SYNTHESISING MATERIALS…');
    getMaterials();
    await step(25, 'CONSTRUCTING HELIOS-7…');
    this.station = new Station(this.renderer.scene);
    await step(50, 'GROWING CREW…');
    this.story = new Story(this);
    await step(68, 'PLOTTING ORBIT…');
    this._buildTitle();
    await step(84, 'COMPILING SHADERS…');
    this.applySettings();
    // warm up both scenes so the first frames don't hitch
    try { this.renderer.renderer.compile(this.renderer.scene, this.renderer.camera); this.renderer.renderer.compile(this.titleScene, this.titleCam); } catch { /* compile is an optimisation only */ }
    await step(100, 'SYSTEMS NOMINAL');
    this.loop();
  }

  /** Called when the intro hands over: the main console with its looping score. */
  showConsole() {
    if (this.mode !== 'boot') return; // only the first hand-over; never yank a started run back to the menu
    this.toTitle(true, 0);
  }

  _buildTitle() {
    const s = (this.titleScene = new THREE.Scene());
    s.background = new THREE.Color(0x000000);
    s.environment = this.renderer.envMap; s.environmentIntensity = 0.15;
    this.titleCam = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.5, 6000);
    const earth = createEarth(1400, 1.0); earth.position.set(0, -1480, -250); earth.rotation.set(1.35, 0, 0.3); s.add(earth);
    const stars = createStars(7000, 2800); s.add(stars);
    const sunDir = earth.userData.sunDir;
    const sun = createSun(sunDir, 2500); sun.scale.setScalar(420); s.add(sun);
    const light = new THREE.DirectionalLight(0xfff4e6, 2.0); light.position.copy(sunDir).multiplyScalar(100); s.add(light);
    s.add(new THREE.AmbientLight(0x6a8ab8, 0.6));
    const rim = new THREE.DirectionalLight(0x4aa0ff, 0.8); rim.position.set(0, -1, 0); s.add(rim);
    const st = createStationExterior(); st.position.set(0, 0, 0); st.rotation.set(0.08, 0.3, -0.12); s.add(st);
    const sunL = new THREE.DirectionalLight(0xfff1dc, 0.0); void sunL;
    this._title = { earth, stars, st };
    addEventListener('resize', () => { this.titleCam.aspect = innerWidth / innerHeight; this.titleCam.updateProjectionMatrix(); });
  }

  _bindUI() {
    // top-right control bar
    document.querySelectorAll('[data-tb]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); this.onTopbar(b.dataset.tb, b); }));
    document.querySelector('.clue-x')?.addEventListener('click', (e) => { e.stopPropagation(); this.audio.uiSound('close'); this.hud.clue(null); });
    document.querySelector('.tasks-x')?.addEventListener('click', () => { this.audio.uiSound('close'); this.hud.toggleTasks(false); });
    // idle UI: controls fade after 4 s without input, any touch/key brings them back
    const wake = () => { document.body.classList.remove('idle-ui'); clearTimeout(this._idleT); this._idleT = setTimeout(() => { if (this.mode === 'play') document.body.classList.add('idle-ui'); }, 4000); };
    ['pointerdown', 'keydown'].forEach((ev) => document.addEventListener(ev, wake, { passive: true }));
    wake();
    $('cred-idea').textContent = CREDITS.tagline;
    const foot = document.querySelector('.title-foot b'); if (foot) foot.innerHTML = WORDMARK_SVG;
    // UI sound design: hover (mouse only), press, panel open/close
    document.addEventListener('pointerover', (e) => {
      if (e.pointerType !== 'mouse') return;
      const b = e.target.closest?.('button'); if (b && b !== this._hoverBtn) { this._hoverBtn = b; this.audio.uiSound('hover'); }
    });
    document.addEventListener('pointerout', (e) => { if (e.target.closest?.('button') === this._hoverBtn) this._hoverBtn = null; });
    document.addEventListener('fullscreenchange', () => document.body.classList.toggle('is-fs', !!document.fullscreenElement));
    // left full screen mid-game (Esc, system gesture)? the next tap in the game puts it back
    document.addEventListener('pointerdown', () => {
      if (this.mode === 'play' && this.wantFullscreen && !document.fullscreenElement && !document.webkitFullscreenElement) this._goFullscreen();
    }, { capture: true });
    const mb = document.querySelector('[data-action="music"]');
    mb.classList.toggle('on', this.settings.music !== false); mb.setAttribute('aria-pressed', String(this.settings.music !== false));
    document.querySelectorAll('[data-action]').forEach((b) => b.addEventListener('click', () => this.onAction(b.dataset.action)));
    document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => { this.audio.uiSound('close'); b.closest('.panel').classList.add('hidden'); }));
    const q = $('opt-quality'), sens = $('opt-sens'), vol = $('opt-vol'), inv = $('opt-invert');
    const s = this.settings;
    q.value = s.quality; sens.value = s.sens; vol.value = s.vol; inv.checked = s.invert;
    q.addEventListener('change', () => { s.quality = q.value; this.applySettings(); });
    sens.addEventListener('input', () => { s.sens = +sens.value; this.applySettings(); });
    vol.addEventListener('input', () => { s.vol = +vol.value; this.applySettings(); });
    inv.addEventListener('change', () => { s.invert = inv.checked; this.applySettings(); });
  }

  applySettings() {
    const s = this.settings;
    const name = s.quality === 'auto' ? (this._autoTier ??= detectTier(this.renderer.renderer).tier) : s.quality;
    if (this.renderer.qualityName !== name) this.renderer.setQuality(name);
    this.governor.enabled = s.quality === 'auto';
    this.governor.reset();
    this.input.sensitivity = s.sens; this.input.invertY = s.invert;
    this.audio.setVolume(s.vol);
    saveSettings(s);
  }

  onAction(a) {
    this.audio.init();
    this.audio.uiSound(a === 'start' ? 'play' : ['controls', 'settings', 'credits'].includes(a) ? 'open' : 'press');
    if (a === 'start') this.startGame(0);
    else if (a === 'continue') this.startGame(loadProgress(), loadResume());
    else if (a === 'restart-all') this.restartAll();
    else if (a === 'controls') $('panel-controls').classList.remove('hidden');
    else if (a === 'settings') $('panel-settings').classList.remove('hidden');
    else if (a === 'credits') $('panel-credits').classList.remove('hidden');
    else if (a === 'music') {
      this.settings.music = this.settings.music === false;
      const b = document.querySelector('[data-action="music"]');
      b.classList.toggle('on', this.settings.music); b.setAttribute('aria-pressed', String(this.settings.music));
      this.audio.uiSound(this.settings.music ? 'on' : 'off');
      if (this.settings.music && this.mode === 'title') this.audio.startMenuMusic(); else this.audio.stopMenuMusic(0.6);
      saveSettings(this.settings);
    } else if (a === 'fullscreen') this.toggleFullscreen();
    else if (a === 'resume') this.resume();
    else if (a === 'restart') { this.resume(); this.retry(); }
    else if (a === 'retry') this.retry();
    else if (a === 'home') this.goHome();
  }

  onEscape() {
    if (!$('keyhelp').classList.contains('hidden')) { this.closeKeyHelp(); return; }
    if (this.tablet.open) { this.closeTablet(); return; }
    const open = ['panel-controls', 'panel-settings', 'panel-credits'].filter((id) => !$(id).classList.contains('hidden'));
    if (open.length) { open.forEach((id) => $(id).classList.add('hidden')); this.audio.uiSound('close'); return; }
    if (this.mode === 'play') this.pause();
    else if (this.mode === 'pause') this.resume();
  }

  pause() {
    this.mode = 'pause';
    $('pause').classList.remove('hidden');
    this.input.exitLock();
    this.audio.suspend();
  }

  resume() {
    if (this.wantFullscreen) this._goFullscreen();
    this.audio.resumeAll();
    $('pause').classList.add('hidden');
    $('keyhelp').classList.add('hidden');
    if (this.mode === 'pause') this.mode = 'play';
    this.input.requestLock();
  }

  onTopbar(id, btn) {
    this.audio.uiSound('press');
    if (id === 'skip') this.story?.skipCinematic();
    else if (id === 'prev') this.openLevelPicker();
    else if (id === 'switch') { if (this.story?.switchAllowed && this.story.player.enabled) this.story.openSwitcher(); }
    else if (id === 'tasks') this.hud.toggleTasks();
    else if (id === 'keys') this.openKeyHelp();
    else if (id === 'clue') { if (this.hud.clueOpen) this.hud.clue(null); else if (this.story && this.mode === 'play') { this.hud.toggleTasks(false); this.hud.clue(this.story.currentClue()); } }
    else if (id === 'light') { const on = this.story?.toggleLight(); btn.classList.toggle('on', !!on); this.audio.uiSound(on ? 'on' : 'off'); }
    else if (id === 'pause') { if (this.mode === 'pause') this.resume(); else if (this.mode === 'play') this.pause(); }
    else if (id === 'home') {
      // two-step so a stray tap can't throw away the run
      if (!btn.classList.contains('confirm')) { btn.classList.add('confirm'); btn.querySelector('span').textContent = 'SURE?'; setTimeout(() => { btn.classList.remove('confirm'); btn.querySelector('span').textContent = 'MENU'; }, 2200); return; }
      btn.classList.remove('confirm'); btn.querySelector('span').textContent = 'MENU';
      this.goHome();
    }
  }

  /** Jump to any level already unlocked (cleared levels ✓, the current one, the next unlocked). */
  async openLevelPicker() {
    if (!this.story || this.mode !== 'play') return;
    const cleared = loadCleared(), unlocked = loadProgress(), cur = this.story.level ?? 0;
    const opts = LEVELS.filter((L) => L.n <= Math.max(unlocked, cur)).map((L) => ({
      name: `LEVEL ${L.n}`, face: String(L.n), color: L.n <= cleared ? '#3dff8a' : L.n === cur ? '#5ff3ff' : '#ffb547',
      role: `${L.name}${L.n <= cleared ? ' · ✓ CLEARED' : ''}${L.n === cur ? ' · YOU ARE HERE' : ''}`,
    }));
    const wasEnabled = this.story.player.enabled; this.story.player.enabled = false;
    const pick = await this.hud.pickPlayer(opts, 'JUMP TO LEVEL');
    this.story.player.enabled = wasEnabled;
    if (!pick) return;
    const n = +pick.split(' ')[1];
    await this.hud.fade(1, 0.3);
    this.story.inventory = this.story.inventory || [];
    this.story.start(LEVELS[n].beat);
  }

  /**
   * Replay from Level 0. Saved progress is kept: cleared levels stay cleared, and the
   * CONTINUE point only moves once this run gets past it.
   */
  restartAll() {
    this.story.inventory = [];
    this.startGame(0);
  }

  /** Leave the run and return to the console (checkpoint is kept for "restart"). */
  goHome() {
    this.story.token++;
    this.story.ff = false;
    if (this.tablet.open) this.tablet.toggle(false);
    this.hud.toggleTasks(false); this.hud.clue(null); this.hud.prompt(null); this.hud.qte(0, false); this.hud.noise(0, false); this.hud.timer(0, false);
    this.audio.setHeartbeat(0);
    $('pause').classList.add('hidden'); $('death').classList.add('hidden');
    this.hud.fade(1, 0.3).then(() => this.toTitle(false, 0.6));
  }

  /** Ending: the escape pod pulls away from HELIOS-7 over a dark Earth. */
  /** Ending: ARES-1 leaves Helios-7 and Earth (3D), then the image film on Mars, then the console. */
  async playFinale() {
    const s = this.titleScene, cam = this.titleCam;
    this.mode = 'finale';
    this.hud.show(false); this.touch?.show(false); this.hud.cinematic(false);
    this.renderer.renderPass.scene = s; this.renderer.renderPass.camera = cam;
    cam.clearViewOffset();
    const ship = buildShip(); ship.scale.setScalar(1.7); s.add(ship);
    const { earth, stars, st } = this._title;
    // away from Earth (which sits far below) and out past the station
    const dir = new THREE.Vector3(0.62, 0.3, 0.72).normalize();
    ship.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);
    const start = new THREE.Vector3(30, 6, 22);
    const side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
    // three-quarter rear view: engines glowing, station and Earth behind the ship as it leaves
    const camFrom = start.clone().addScaledVector(side, -26).addScaledVector(dir, -22).add(new THREE.Vector3(0, 9, 0));
    const camTo = camFrom.clone().addScaledVector(dir, 14).add(new THREE.Vector3(0, 4, 0));
    const t0 = performance.now();
    this._finaleTick = () => {
      const t = (performance.now() - t0) / 1000; // wall clock: same flight on any frame rate
      earth.userData.update(this.t, cam); stars.userData.update(this.t); st.userData.update(this.t);
      const dist = 1.0 * t * t + 3.2 * t; // pulls away, ever faster
      ship.position.copy(start).addScaledVector(dir, dist);
      ship.position.y += Math.sin(t * 1.4) * 0.15;
      ship.userData.update(t, Math.min(1, 0.45 + t * 0.35));
      const k = Math.min(1, t / 9), e = k * k * (3 - 2 * k);
      cam.position.lerpVectors(camFrom, camTo, e);
      const look = ship.position.clone().lerp(new THREE.Vector3(0, -95, -60), 0.04 + 0.1 * e); // a little low, so Earth's limb sits in the lower frame
      cam.lookAt(look);
    };
    cam.position.copy(camFrom); cam.lookAt(ship.position);
    this.audio.startMusic('calm');
    this.audio.whoosh?.(4, true, 0.35);
    await this.hud.fade(0, 1.0);
    await new Promise((r) => setTimeout(r, 8500));
    await this.hud.fade(1, 1.2);
    this._finaleTick = null;
    s.remove(ship); ship.userData.dispose();
    this.mode = 'finale-film';
    await playEndingFilm({ audio: this.audio });
    this.audio.stopMusic(1);
    this.toTitle(false, 1.2);
  }

  async toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else { await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }); await screen.orientation?.lock?.('landscape').catch((e) => console.info('Orientation lock not available:', e?.message || e)); }
    } catch (e) { console.info('Full screen toggle not supported here:', e?.message || e); this.hud.toast?.('FULL SCREEN NOT SUPPORTED ON THIS BROWSER', 2.5); }
  }

  async startGame(level = 0, beat = null) {
    this._goFullscreen(); // first, while the tap's user gesture is still fresh
    markPlayed();
    this.story.toggleLookAround?.(false);
    this.audio.init();
    this.audio.stopMenuMusic(1.2);
    $('title').classList.add('hidden');
    await this.hud.fade(1, 0.35);
    this.inTitle = false;
    this.renderer.renderPass.scene = this.renderer.scene;
    this.renderer.renderPass.camera = this.renderer.camera;
    this.hud.show(true);
    this.touch?.show(true);
    this.mode = 'play';
    this.tabletEnabled = false;
    this.input.requestLock();
    this.story.checkpoint = 'intro';
    this.story.inventory = [];
    this.story.start(beat || (LEVELS[level] || LEVELS[0]).beat);
    if (!this.isTouch && !this._keyHelpOff()) this.openKeyHelp();
  }

  _keyHelpOff() { try { return localStorage.getItem('new-earth-keyhelp-off') === '1'; } catch (e) { console.info('Settings unavailable:', e?.message || e); return false; } }

  /** Desktop only: centred keyboard & mouse guide. The game waits underneath until START PLAYING. */
  openKeyHelp() {
    if (this.isTouch || this.mode === 'title') return;
    if (this.mode === 'play') { this.mode = 'pause'; this.audio.suspend(); }
    this.input.exitLock();
    $('kh-dont').checked = this._keyHelpOff();
    $('keyhelp').classList.remove('hidden');
  }

  closeKeyHelp() {
    const box = $('keyhelp'); if (box.classList.contains('hidden')) return;
    box.classList.add('hidden');
    try { localStorage.setItem('new-earth-keyhelp-off', $('kh-dont').checked ? '1' : '0'); } catch (e) { console.info('Setting not saved:', e?.message || e); }
    this.input.pressed.clear(); // the Enter that closed it must not also skip a dialogue line
    if ($('pause').classList.contains('hidden')) this.resume(); // runs inside the click/keypress → mouse capture allowed
  }

  /**
   * Play in full screen on every device. Must be called synchronously inside a tap/click
   * handler (browsers only allow it with a fresh user gesture), so it runs before any await.
   */
  _goFullscreen() {
    this.wantFullscreen = true;
    const el = document.documentElement;
    if (document.fullscreenElement || document.webkitFullscreenElement) return;
    const req = el.requestFullscreen?.bind(el) || el.webkitRequestFullscreen?.bind(el);
    if (!req) { this._iosFullscreenHint(); return; } // iPhone Safari: no element full screen
    let p;
    try { p = req({ navigationUI: 'hide' }); } catch (e) { console.info('Full screen refused:', e?.message || e); return; } // some engines throw instead of rejecting
    Promise.resolve(p)
      .then(() => this.isTouch && screen.orientation?.lock?.('landscape'))
      .catch((e) => console.info('Full screen refused:', e?.message || e));
  }

  /** iPhone Safari can't full-screen a page; launching from the home screen can. Hint once. */
  _iosFullscreenHint() {
    if (navigator.standalone || this._iosHinted) return;
    this._iosHinted = true;
    setTimeout(() => this.hud.toast('FOR FULL SCREEN: SHARE ▸ ADD TO HOME SCREEN', 5), 1500);
  }

  toTitle(first = false, fadeSec = null) {
    this.wantFullscreen = false; // the console lives in the normal browser window
    this.mode = 'title';
    this.touch?.show(false);
    this.inTitle = true;
    this.hud.show(false); this.hud.clearSub(); this.hud.cinematic(false);
    this.input.exitLock();
    this.audio.stopAll?.();
    this.renderer.renderPass.scene = this.titleScene;
    this.renderer.renderPass.camera = this.titleCam;
    this.renderer.fx.uDanger.value = 0; this.renderer.fx.uDesat.value = 0;
    if (this.settings.music !== false) this.audio.startMenuMusic();
    const lvl = loadProgress(), cleared = loadCleared();
    $('cont-lvl').textContent = String(lvl);
    const resume = loadResume();
    $('cont-lvl').textContent = String(BEAT_LEVEL[resume] ?? lvl);
    const started = lvl > 0 || resume !== LEVELS[0].beat;
    document.querySelector('.btn-continue').classList.toggle('hidden', !started);
    document.querySelector('.btn-restart').classList.toggle('hidden', !started);
    $('lv-row').innerHTML = LEVELS.map((L) => {
      const st = L.n <= cleared ? 'cleared' : L.n === lvl ? 'next' : L.n > lvl ? 'locked' : '';
      const sub = st === 'cleared' ? '✓ CLEARED' : st === 'next' ? '▶ CONTINUE' : st === 'locked' ? 'LOCKED' : 'PLAY';
      return `<button class="lv-chip ${st}" type="button" data-level="${L.n}" ${st === 'locked' ? 'disabled' : ''}><b>LEVEL ${L.n}</b><small>${L.name} · ${sub}</small></button>`;
    }).join('');
    $('lv-row').querySelectorAll('.lv-chip:not(.locked)').forEach((b) => (b.onclick = () => { this.audio.init(); this.audio.uiSound('play'); this.startGame(+b.dataset.level); }));
    $('title').classList.remove('hidden');
    $('death').classList.add('hidden'); $('pause').classList.add('hidden');
    this.hud.fade(0, fadeSec ?? (first ? 2.5 : 2));
  }

  die(reason) {
    if (this.mode === 'dead') return;
    this.mode = 'dead';
    this.story.token++;
    this.story.player.enabled = false;
    this.hud.prompt(null); this.hud.qte(0, false);
    this.audio.stinger(1.2);
    this.audio.setHeartbeat(0);
    this.story.cam.shake(0.1);
    this.renderer.fx.uDanger.value = 1;
    const show = () => {
      if (this.mode !== 'dead') return;
      this.input.exitLock();
      $('death-reason').textContent = reason;
      $('death').classList.remove('hidden');
    };
    this.story.playDeath().then(show, (e) => { console.error('Death cinematic failed:', e); show(); });
  }

  async retry() {
    $('death').classList.add('hidden');
    this.mode = 'play';
    this.renderer.fx.uDanger.value = 0;
    this.input.requestLock();
    await this.hud.fade(1, 0.4);
    const cp = this.story.checkpoint === 'intro' ? 'door' : this.story.checkpoint;
    this.story.start(cp);
  }

  openTablet(onClose) {
    this._tabletClose = onClose;
    this.tablet.toggle(true);
    this.input.exitLock();
    this.story.player.enabled = false;
  }

  closeTablet() {
    this.tablet.toggle(false);
    this.input.requestLock();
    if (this._tabletClose) { const f = this._tabletClose; this._tabletClose = null; f(); }
    else this.story.player.enabled = !document.body.classList.contains('cinematic');
  }

  loop(ts = performance.now()) {
    requestAnimationFrame((t) => this.loop(t));
    this.timer.update(ts);
    const raw = this.timer.getDelta();
    const dt = Math.min(0.05, raw);
    if (this.mode === 'boot' || this.mode === 'finale-film') return; // the intro / ending film owns the screen
    if (this.mode === 'finale') { this._finaleTick?.(dt); this.input.endFrame(); this.renderer.render(this.t); return; }
    if (this.mode === 'title' || this.mode === 'play' || this.mode === 'dead') this.governor.sample(raw);
    this.t += dt;
    const R = this.renderer;
    if (this.mode === 'title') {
      const t = this.t;
      const { earth, stars, st } = this._title;
      earth.userData.update(t, this.titleCam); stars.userData.update(t); st.userData.update(t);
            const a2 = 0.9 + Math.sin(t * 0.02) * 0.25;
      this.titleCam.position.set(Math.cos(a2) * 115, 62 + Math.sin(t * 0.05) * 4, Math.sin(a2) * 115);
      this.titleCam.lookAt(0, -8, 0);
      const w = innerWidth, h = innerHeight;
      if (w > h) this.titleCam.setViewOffset(w, h, -w * (w > 760 ? 0.2 : 0.24), -h * 0.04, w, h); else this.titleCam.clearViewOffset();
    } else if (this.mode === 'play' || this.mode === 'dead') {
      const I = this.input;
      if (this.mode === 'play' && !this.tablet.open) {
        const m = I.consumeMouse();
        const p = this.story.player;
        p.camYaw -= m.x;
        // first person: look up/down like a person; look-around orbit: never from below the floor
        p.camPitch = p.firstPerson ? Math.max(-1.1, Math.min(1.25, p.camPitch + m.y)) : Math.max(-0.12, Math.min(0.9, p.camPitch + m.y));
        if (I.wasPressed('Space')) this.hud.advance();
        if (I.wasPressed('Enter', 'NumpadEnter')) this.story.skipCinematic(); // skip the scene
        if (I.wasPressed('Tab') && this.tabletEnabled && this.story.player.enabled) this.openTablet(null);
        if (I.wasPressed('KeyF')) { const on = this.story.toggleLight(); document.querySelector('[data-tb="light"]')?.classList.toggle('on', !!on); }
        if (I.wasPressed('KeyJ')) this.hud.toggleTasks();
        if (I.wasPressed('KeyV')) this.story.toggleLookAround();
        if (I.wasPressed('KeyQ')) this.onTopbar('clue', document.querySelector('[data-tb="clue"]'));
        if (I.wasPressed('KeyG') && !$('assignbar').classList.contains('hidden')) this.story.openAssign?.();
        if (I.wasPressed('KeyK', 'KeyH')) this.openKeyHelp();
        if (I.wasPressed('KeyP')) this.pause();
        // arrow keys turn (for players without a mouse / trackpad drag)
        const turn = (I.isDown('ArrowLeft') ? 1 : 0) - (I.isDown('ArrowRight') ? 1 : 0);
        if (turn) p.camYaw += turn * 2.2 * dt;
        const ff = this.story.ff ? 60 : 1;
        if (ff > 1) this.hud.advance();
        this.story.update(dt * ff);
        this.touch?.setMapAvailable(this.tabletEnabled);
      } else if (this.tablet.open) {
        I.consumeMouse();
        if (I.wasPressed('Tab')) this.closeTablet();
      } else {
        this.story.update(dt * (this.story.deathCine ? 1 : 0.25));
      }
      this.station.update(this.t, dt, R.camera);
      this.story.cam.update(dt * (this.story.ff ? 60 : 1), this.story.player);
    } else if (this.mode === 'pause') {
      this.input.consumeMouse();
    }
    this.input.endFrame();
    R.render(this.t);
  }
}

const game = new Game();
window.__game = game; // handy for debugging from the console
const intro = new Intro({ audio: game.audio, isTouch: game.isTouch });
window.__intro = intro; // debugging handle
game.intro = intro;
game.onBootProgress = (p) => intro.setLoad(p);
const booting = game.boot().catch((e) => {
  console.error(e);
  const t = document.querySelector('.in-gate-sub');
  if (t) t.textContent = 'Could not start: ' + (e?.message || e) + ' — try reloading.';
  throw e;
});
intro.run({ waitForBoot: () => booting, beforeReveal: () => game.showConsole() })
  .catch((e) => { console.error('Intro failed:', e); document.getElementById('intro')?.remove(); })
  .then(() => booting)
  .then(() => { game.intro = null; game.showConsole(); })
  .catch(() => { /* boot failure already reported */ });
