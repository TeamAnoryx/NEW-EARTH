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

const $ = (id) => document.getElementById(id);
const frame = () => new Promise((r) => requestAnimationFrame(() => r()));

const SETTINGS_KEY = 'new-earth-settings';
function loadSettings() {
  try { return Object.assign({ quality: 'high', sens: 1, vol: 0.8, invert: false }, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); }
  catch { return { quality: 'high', sens: 1, vol: 0.8, invert: false }; }
}
function saveSettings(s) { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* storage unavailable */ } }

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
    if (this.isTouch) { let saved = null; try { saved = localStorage.getItem(SETTINGS_KEY); } catch { /* private mode */ } if (!saved) this.settings.quality = 'medium'; }
    if (this.isTouch) {
      this.touch = new TouchControls(this.input, {
        onCrouch: (v) => { if (this.story) this.story.player.forceCrouch = v; },
        onMap: () => { if (this.tablet.open) this.closeTablet(); else if (this.tabletEnabled && this.story?.player.enabled) this.openTablet(null); },
        onPause: () => (this.mode === 'pause' ? this.resume() : this.mode === 'play' && this.pause()),
        onTap: () => this.hud.advance(),
      });
    }
    this.input.onEscape = () => this.onEscape();
    // pause when the tab is hidden (rAF stops; avoid a huge delta and missed cues)
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && this.mode === 'play') this.pause(); });
    this._bindUI();
  }

  async boot() {
    const fill = $('boot-fill'), txt = $('boot-text');
    const step = async (p, label) => { fill.style.width = `${p}%`; txt.textContent = label; await frame(); await frame(); };
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
    await new Promise((r) => setTimeout(r, 350));
    $('boot').style.opacity = 0;
    setTimeout(() => $('boot').classList.add('hidden'), 800);
    this.toTitle(true);
    this.loop();
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
    document.querySelectorAll('[data-action]').forEach((b) => b.addEventListener('click', () => this.onAction(b.dataset.action)));
    document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => b.closest('.panel').classList.add('hidden')));
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
    if (this.renderer.qualityName !== s.quality) this.renderer.setQuality(s.quality);
    this.input.sensitivity = s.sens; this.input.invertY = s.invert;
    this.audio.setVolume(s.vol);
    saveSettings(s);
  }

  onAction(a) {
    this.audio.init();
    this.audio.ui('blip');
    if (a === 'start') this.startGame();
    else if (a === 'controls') $('panel-controls').classList.remove('hidden');
    else if (a === 'settings') $('panel-settings').classList.remove('hidden');
    else if (a === 'resume') this.resume();
    else if (a === 'restart') { this.resume(); this.retry(); }
    else if (a === 'retry') this.retry();
  }

  onEscape() {
    if (this.tablet.open) { this.closeTablet(); return; }
    if (!$('panel-controls').classList.contains('hidden') || !$('panel-settings').classList.contains('hidden')) {
      $('panel-controls').classList.add('hidden'); $('panel-settings').classList.add('hidden'); return;
    }
    if (this.mode === 'play') this.pause();
    else if (this.mode === 'pause') this.resume();
  }

  pause() {
    this.mode = 'pause';
    $('pause').classList.remove('hidden');
    this.input.exitLock();
  }

  resume() {
    $('pause').classList.add('hidden');
    if (this.mode === 'pause') this.mode = 'play';
    this.input.requestLock();
  }

  async startGame() {
    this.audio.init();
    $('title').classList.add('hidden');
    await this.hud.fade(1, 1.2);
    this.inTitle = false;
    this.renderer.renderPass.scene = this.renderer.scene;
    this.renderer.renderPass.camera = this.renderer.camera;
    this.hud.show(true);
    this.touch?.show(true);
    this._goFullscreen();
    this.mode = 'play';
    this.tabletEnabled = false;
    this.input.requestLock();
    this.story.checkpoint = 'intro';
    this.story.start('intro');
  }

  async _goFullscreen() {
    if (!this.isTouch) return;
    try {
      const el = document.documentElement;
      if (!document.fullscreenElement && el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
      await screen.orientation?.lock?.('landscape');
    } catch { /* iOS Safari: no fullscreen/orientation lock — the rotate prompt covers it */ }
  }

  toTitle(first = false) {
    this.mode = 'title';
    this.touch?.show(false);
    this.inTitle = true;
    this.hud.show(false); this.hud.clearSub(); this.hud.cinematic(false);
    this.input.exitLock();
    this.audio.stopAll?.();
    this.renderer.renderPass.scene = this.titleScene;
    this.renderer.renderPass.camera = this.titleCam;
    this.renderer.fx.uDanger.value = 0; this.renderer.fx.uDesat.value = 0;
    $('title').classList.remove('hidden');
    $('death').classList.add('hidden'); $('pause').classList.add('hidden');
    this.hud.fade(0, first ? 2.5 : 2);
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
    setTimeout(() => {
      this.input.exitLock();
      $('death-reason').textContent = reason;
      $('death').classList.remove('hidden');
    }, 900);
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
    const dt = Math.min(0.05, this.timer.getDelta());
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
      if (w > 760) this.titleCam.setViewOffset(w, h, -w * 0.2, -h * 0.04, w, h); else this.titleCam.clearViewOffset();
    } else if (this.mode === 'play' || this.mode === 'dead') {
      const I = this.input;
      if (this.mode === 'play' && !this.tablet.open) {
        const m = I.consumeMouse();
        const p = this.story.player;
        p.camYaw -= m.x; p.camPitch = Math.max(-0.6, Math.min(0.9, p.camPitch + m.y));
        if (I.wasPressed('Space', 'Enter')) this.hud.advance();
        if (I.wasPressed('Tab') && this.tabletEnabled && this.story.player.enabled) this.openTablet(null);
        this.story.update(dt);
        this.touch?.setMapAvailable(this.tabletEnabled);
      } else if (this.tablet.open) {
        I.consumeMouse();
        if (I.wasPressed('Tab')) this.closeTablet();
      } else {
        this.story.update(dt * 0.25);
      }
      this.station.update(this.t, dt, R.camera);
      this.story.cam.update(dt, this.story.player);
    } else if (this.mode === 'pause') {
      this.input.consumeMouse();
    }
    this.input.endFrame();
    R.render(this.t);
  }
}

const game = new Game();
window.__game = game; // handy for debugging from the console
game.boot().catch((e) => {
  console.error(e);
  $('boot-text').textContent = 'BOOT FAILURE: ' + (e?.message || e);
});
