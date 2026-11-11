import './intro.css';
import { loadYouTubeAPI, createPlayer, playSegmentsAB, waitUntilPlaying } from './youtube.js';
import { IntroScene } from './introScene.js';
import { CREDITS, GAME_MARK, wordmark, logoBlock } from './brand.js';
import { hasPlayed, markPlayed } from '../game/progress.js';
import { FootageOverlay } from './overlay.js';

/** Footage cuts requested for the intro (seconds into the SERENE "Cosmos" video). */
export const VIDEO_ID = 'a6NqW_JqFwM';
export const MUSIC_ID = '-LYhkU_hD_w';
export const SEGMENTS = [[0, 45], [226, 234], [250, 265], [404, 415]];
const MUSIC_START = 0;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const $ = (sel, el = document) => el.querySelector(sel);

/**
 * The opening sequence. Browsers only allow fullscreen, orientation lock and sound after a user
 * gesture, so the very first screen is a one-tap gate; everything after it is automatic.
 */
export class Intro {
  constructor({ audio, onBootProgress, isTouch }) {
    this.audio = audio;
    this.isTouch = isTouch;
    this.skipped = false;
    this.root = document.createElement('div');
    this.root.id = 'intro';
    this.root.innerHTML = `
      <div class="in-begin"><div class="ib-mark">${GAME_MARK}</div><button class="ib-btn" type="button"><span class="in-pulse"></span>TAP TO BEGIN</button><div class="ib-sub">Opens in full screen · sound on</div></div>
      <div class="in-sting" aria-hidden="true">
        <div class="st-mark">${GAME_MARK}</div>
        <div class="st-under">
          <div class="st-text">${wordmark('AN ANORYX CREATION', 'st-word')}</div>
          <div class="st-lock">${logoBlock('st-logo')}</div>
        </div>
      </div>
      <div class="in-gate">
        <div class="in-gate-mark">${GAME_MARK}</div>
        <div class="in-gate-title">NEW&nbsp;EARTH</div>
        <div class="in-gate-actions">
          <button class="in-gate-btn" type="button"><span class="in-pulse"></span><span>TAP TO ENTER</span></button>
          <button class="in-gate-console hidden" type="button"><span>SKIP TO CONSOLE</span><svg viewBox="0 0 24 24"><path d="M6 5l8 7-8 7M16 5v14"/></svg></button>
        </div>
        <div class="in-gate-sub">Best in landscape · sound on</div>
        <div class="in-gate-load"><i></i></div>
        <div class="in-gate-brand">${logoBlock('gate-logo')}<span>${CREDITS.tagline.toUpperCase()}</span></div>
      </div>
      <div class="in-stage hidden">
        <div class="in-video"><div class="in-yt in-yt-a"><div id="in-yt-video"></div></div><div class="in-yt in-yt-b"><div id="in-yt-video-b"></div></div></div>
        <div class="in-audio"><div id="in-yt-audio"></div></div>
        <canvas class="in-canvas"></canvas>
        <div class="in-vignette"></div>
        <div class="in-cut"></div>
        <div class="in-count hidden">
          <svg viewBox="0 0 200 200"><circle class="c-track" cx="100" cy="100" r="86"/><circle class="c-arc" cx="100" cy="100" r="86"/><circle class="c-inner" cx="100" cy="100" r="64"/></svg>
          <span class="c-num">3</span><span class="c-label">LAUNCHING INTRO</span>
        </div>
        <div class="in-buffer hidden"><i></i><span>BUFFERING</span></div>
        <div class="in-title">${wordmark('NEW EARTH', 'in-word')}</div>
        <div class="in-credits">
          <div class="in-cred-row in-cred-studio"><span class="in-cred-k">CREATED BY</span>${logoBlock('in-logo-small')}</div>
          <div class="in-cred-row in-cred-idea"><span class="in-cred-v">${CREDITS.tagline}</span></div>
        </div>
        <button class="in-min hidden" type="button" aria-label="Exit full screen">
          <svg viewBox="0 0 24 24"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>
        </button>
        <button class="in-skip hidden" type="button">SKIP INTRO <svg viewBox="0 0 24 24"><path d="M6 5l8 7-8 7M16 5v14"/></svg></button>
      </div>
      <div class="in-white">
        <div class="in-pw">
          <div class="in-pw-by">POWERED BY</div>
          ${logoBlock('in-logo-big')}
        </div>
      </div>`;
    document.body.appendChild(this.root);
    this.onBootProgress = onBootProgress;
    // Self-hosted intro media (built by scripts/make-intro.sh) wins over YouTube when present.
    this.localManifest = fetch('./intro/manifest.json', { cache: 'no-cache' })
      .then((r) => { if (r.ok) return r.json(); console.info(`No self-hosted intro media (HTTP ${r.status}); using YouTube embed.`); return null; })
      .then((m) => {
        if (!m) return null;
        const ok = typeof m.duration === 'number' && m.duration > 3 && Array.isArray(m.segments) && m.segments.length
          && m.segments.every((g) => typeof g.start === 'number' && typeof g.end === 'number') && m.video?.['720'] && m.video?.['480'] && m.music;
        if (!ok) { console.warn('intro/manifest.json is malformed; ignoring self-hosted media. Re-run scripts/make-intro.sh.'); return null; }
        this._prepLocalAudio(m);
        return m;
      })
      .catch((e) => { console.info('No self-hosted intro media; using YouTube embed.', e?.message || e); return null; });
    // start fetching the YouTube API right away so the tap → video gap is short
    this.ytReady = loadYouTubeAPI().then((YT) => this._makePlayers(YT)).catch((e) => { console.warn('Intro footage unavailable:', e.message); return null; });
  }

  _prepLocalAudio(man) {
    const a = new Audio();
    a.src = man.music; a.preload = 'auto'; a.crossOrigin = 'anonymous';
    a.addEventListener('error', () => console.warn('Intro music failed to load:', man.music));
    this.localAudio = a;
  }

  /** Must run inside the tap handler's turn: unlocks media playback on iOS Safari. */
  _unlockLocalAudio() {
    const a = this.localAudio; if (!a) return;
    a.muted = true;
    a.play().then(() => { a.pause(); a.currentTime = 0; a.muted = false; })
      .catch((e) => console.info('Intro music unlock refused:', e?.message || e));
  }

  /** Route the music element through our mixer so fades work everywhere (iOS ignores element.volume). */
  _routeLocalAudio() {
    const ctx = this.audio.ctx, a = this.localAudio;
    if (!ctx || !a || this._localGain) return;
    try {
      const src = ctx.createMediaElementSource(a);
      this._localGain = ctx.createGain();
      this._localGain.gain.value = 0.0001;
      src.connect(this._localGain).connect(this.audio.master);
    } catch (e) { console.warn('Could not route intro music through the mixer:', e?.message || e); }
  }

  /** Plays the self-hosted cut. Resolves true when it played to the end, false to fall back. */
  async _localFootage(scene, man) {
    const vEl = $('.in-video', this.root);
    const low = (navigator.deviceMemory || 4) <= 3 || innerHeight < 500 && (devicePixelRatio || 1) < 2;
    const v = document.createElement('video');
    v.className = 'in-local';
    v.muted = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', '');
    v.preload = 'auto'; v.disablePictureInPicture = true;
    v.src = man.video[low ? '480' : '720'];
    vEl.appendChild(v);
    const started = await Promise.race([v.play().then(() => true).catch((e) => { console.warn('Self-hosted intro video refused to play:', e?.message || e); return false; }), wait(6000).then(() => false)]);
    if (!started || this.skipped) { v.remove(); return false; }
    this._localVideo = v;
    this._routeLocalAudio();
    const a = this.localAudio;
    if (a) {
      a.currentTime = 0;
      a.play().then(() => this._localGain?.gain.setTargetAtTime(1, this.audio.now, 0.6))
        .catch((e) => { console.warn('Intro music refused to play; using synth score:', e?.message || e); this._synthMusic = true; this.audio.startMusic('calm'); });
    }
    vEl.classList.add('on');
    this.overlay?.show();
    const buf = $('.in-buffer', this.root);
    v.addEventListener('waiting', () => buf?.classList.remove('hidden'));
    v.addEventListener('playing', () => buf?.classList.add('hidden'));
    // keep the music locked to the picture if the video stalls
    v.addEventListener('waiting', () => a && !a.paused && a.pause());
    v.addEventListener('playing', () => a && a.paused && !this.skipped && a.play().catch((e) => console.info('Intro music resume refused:', e?.message || e)));
    let slid = false;
    await new Promise((resolve) => {
      const iv = setInterval(() => {
        if (this.skipped) { clearInterval(iv); resolve(); return; }
        const t = v.currentTime, segs = man.segments;
        let i = 0; for (let k = 0; k < segs.length; k++) if (t >= segs[k].start) i = k;
        this.overlay?.update(i, t - segs[i].start);
        if (!slid && t >= man.duration - 3.05) { slid = true; this.overlay?.hide(); scene.slideIn(3); this.audio.whoosh(2.8, true, 0.45); }
        if (v.ended || t >= man.duration - 0.06) { clearInterval(iv); resolve(); }
      }, 100);
      v.addEventListener('error', () => { console.warn('Intro video error mid-play'); clearInterval(iv); resolve(); }, { once: true });
    });
    if (!slid) { this.overlay?.hide(); scene.slideIn(2.2); this.audio.whoosh(2.2, true, 0.45); }
    v.pause();
    vEl.classList.remove('on');
    scene.fadeSpace(1.4);
    return true;
  }

  setLoad(p) { const i = $('.in-gate-load i', this.root); if (i) i.style.width = `${Math.round(p * 100)}%`; }

  async _makePlayers(YT) {
    const [video, videoB, music] = await Promise.all([
      createPlayer(YT, $('#in-yt-video', this.root), VIDEO_ID, { muted: true, start: SEGMENTS[0][0] }),
      createPlayer(YT, $('#in-yt-video-b', this.root), VIDEO_ID, { muted: true, start: SEGMENTS[1][0] }).catch(() => null),
      createPlayer(YT, $('#in-yt-audio', this.root), MUSIC_ID, { muted: false, start: MUSIC_START }).catch(() => null),
    ]);
    this.video = video; this.videoB = videoB; this.music = music;
    return { video, videoB, music };
  }

  _waitForTap() {
    return new Promise((resolve) => {
      const go = (e) => {
        if (e?.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
        e?.preventDefault?.();
        const choice = e?.target?.closest?.('.in-gate-console') ? 'console' : 'enter';
        this.root.removeEventListener('pointerup', go); window.removeEventListener('keydown', go);
        resolve(choice);
      };
      this.root.addEventListener('pointerup', go);
      window.addEventListener('keydown', go);
    });
  }

  /**
   * Opening ident on a dark full-viewport stage (browsers only allow real full screen after a tap):
   * NEW EARTH mark draws itself in 3 s → "AN ANORYX CREATION" → fades (1.5 s) → ANORYX lockup
   * holds 2 s → the tap-to-enter page. Returning players can tap to skip it.
   */
  /**
   * Browsers only allow full screen (and sound) from a tap/click, so the very first screen asks for
   * one; the logo ident then plays in real full screen. iPhone Safari has no full-screen API for
   * pages — there it plays full-viewport (or truly full screen when added to the Home Screen).
   */
  _waitForBegin() {
    const box = $('.in-begin', this.root);
    return new Promise((resolve) => {
      const go = (e) => {
        if (e.type === 'keydown' && !['Enter', ' ', 'Spacebar'].includes(e.key)) return;
        e.preventDefault?.();
        this._fullscreen();               // must run inside the gesture — before any await
        this.audio.init();
        this._unlockLocalAudio();
        box.removeEventListener('pointerup', go); window.removeEventListener('keydown', go);
        box.classList.add('leave');
        setTimeout(() => box.remove(), 700);
        resolve();
      };
      box.addEventListener('pointerup', go);
      window.addEventListener('keydown', go);
    });
  }

  async _sting() {
    const st = $('.in-sting', this.root), gate = $('.in-gate', this.root);
    gate.classList.add('pre');
    await this._waitForBegin();
    let skip = null;
    const skipped = new Promise((r) => (skip = r));
    const onTap = () => { if (hasPlayed()) skip('skip'); };
    st.addEventListener('pointerup', onTap);
    const step = async (cls, ms) => { st.classList.add(cls); return Promise.race([wait(ms), skipped]); };
    const seq = (async () => {
      // start once the page has settled (heavy textures still loading would make the draw stutter)
      if (document.readyState !== 'complete') await Promise.race([new Promise((r) => window.addEventListener('load', r, { once: true })), wait(2500)]);
      await wait(250);
      this.audio.whoosh?.(3, true, 0.18);
      if (await step('draw', 3000)) return;           // dots → rings → lines (3 s)
      if (await step('text', 1300)) return;           // "AN ANORYX CREATION"
      if (await step('text-out', 1500)) return;       // fades away in 1.5 s
      this.audio.logoSting?.();
      if (await step('lock', 800 + 2000)) return;     // ANORYX lockup fades in, holds 2 s
    })();
    await Promise.race([seq, skipped]);
    st.removeEventListener('pointerup', onTap);
    st.classList.add('out');
    gate.classList.remove('pre');
    if (hasPlayed()) setTimeout(() => $('.in-gate-console', this.root)?.classList.remove('hidden'), 500);
    setTimeout(() => st.remove(), 900);
  }

  async _fullscreen() {
    try {
      const el = document.documentElement;
      if (!document.fullscreenElement) await (el.requestFullscreen?.({ navigationUI: 'hide' }) ?? el.webkitRequestFullscreen?.());
    } catch (e) { console.info('Full screen not available here (expected on iPhone Safari):', e?.message || e); }
    try { await screen.orientation?.lock?.('landscape'); } catch (e) { console.info('Orientation lock not available:', e?.message || e); }
  }

  async _exitFullscreen() {
    try { if (document.fullscreenElement) await document.exitFullscreen(); } catch (e) { console.warn('Could not exit full screen:', e?.message || e); }
    try { screen.orientation?.unlock?.(); } catch (e) { console.info('Orientation unlock not supported:', e?.message || e); }
  }

  _flashCut(kind = 'cut') {
    const c = $('.in-cut', this.root);
    c.className = `in-cut ${kind}`; void c.offsetWidth; c.classList.add('go');
  }

  async _countdown() {
    const box = $('.in-count', this.root), num = $('.c-num', box);
    box.classList.remove('hidden');
    for (const n of [3, 2, 1]) {
      if (this.skipped) return;
      num.textContent = n;
      box.classList.remove('tick'); void box.offsetWidth; box.classList.add('tick');
      this.audio.countBeep(false);
      await wait(1000);
    }
    this.audio.countBeep(true);
    box.classList.add('out');
    await wait(350);
    box.classList.add('hidden');
  }

  /**
   * Tab hidden / app minimised: silence the intro (YouTube players are outside WebAudio, so
   * they are muted directly; the self-hosted track goes through the suspended AudioContext).
   */
  setHidden(hidden) {
    for (const p of [this.music, this.video, this.videoB]) {
      if (!p) continue;
      try { if (hidden) p.mute?.(); else if (p === this.music) p.unMute?.(); } catch (e) { console.info('Intro mute toggle:', e?.message || e); }
    }
  }

  _rampMusic(to, ms) {
    if (this._localGain) this._localGain.gain.setTargetAtTime(Math.max(0.0001, to / 85), this.audio.now, ms / 3000);
    const m = this.music; if (!m) return;
    const from = m.getVolume?.() ?? 0, start = performance.now();
    clearInterval(this._volIv);
    this._volIv = setInterval(() => {
      const k = Math.min(1, (performance.now() - start) / ms);
      try { m.setVolume(Math.round(from + (to - from) * k)); } catch { /* player gone */ }
      if (k >= 1) clearInterval(this._volIv);
    }, 60);
  }

  async _footage(scene) {
    if (this.skipped) return;
    const man = await Promise.race([this.localManifest, wait(1500).then(() => null)]);
    if (man && (await this._localFootage(scene, man))) return;
    if (this.skipped) return;
    const players = await Promise.race([this.ytReady, wait(4000).then(() => null)]);
    const vEl = $('.in-video', this.root);
    if (!players?.video) return this._fallbackFootage(scene);
    const { video, videoB, music } = players;
    // only show the footage once it is really playing — never YouTube's own error card
    try { video.seekTo(SEGMENTS[0][0], true); video.playVideo(); } catch { /* handled below */ }
    if (!(await waitUntilPlaying(video, 6000))) { try { video.stopVideo(); music?.stopVideo(); } catch { /* ignore */ } return this._fallbackFootage(scene); }
    if (this.skipped) return;
    if (music && !music.__failed) { try { music.setVolume(0); music.seekTo(MUSIC_START, true); music.playVideo(); this._rampMusic(85, 2500); } catch { /* ignore */ } }
    // if the music iframe is refused sound (some iOS versions), use the synth score instead
    setTimeout(() => { if (!this.skipped && (!music || music.__failed || music.getPlayerState?.() !== 1)) { this._synthMusic = true; this.audio.startMusic('calm'); } }, 3000);
    vEl.classList.add('on');
    this.overlay?.show();
    let slid = false;
    const lastIdx = SEGMENTS.length - 1;
    const els = [$('.in-yt-a', this.root), $('.in-yt-b', this.root)];
    // with only one player available, B falls back to A (cuts then seek in place behind a quick dip)
    await playSegmentsAB([video, videoB || video], els, SEGMENTS, {
      xfade: videoB ? 0.5 : 0.15,
      onStall: (s) => $('.in-buffer', this.root)?.classList.toggle('hidden', !s || this.skipped),
      onTime: (t, i, remain) => {
        if (this.skipped) return;
        this.overlay?.update(i, t - SEGMENTS[i][0]);
        if (!slid && i === lastIdx && remain <= 3.05) { slid = true; this.overlay?.hide(); scene.slideIn(3); this.audio.whoosh(2.8, true, 0.45); }
      },
    });
    if (!slid) { this.overlay?.hide(); scene.slideIn(2.2); this.audio.whoosh(2.2, true, 0.45); }
    vEl.classList.remove('on'); // CSS fade first, pause afterwards so no pause icon is ever visible
    setTimeout(() => { try { video.pauseVideo(); videoB?.pauseVideo(); } catch (e) { console.info('Pause after intro:', e?.message || e); } }, 1500);
    scene.fadeSpace(1.4);
  }

  /** Offline / blocked YouTube: our own 3D establishing shot with the synthesised score. */
  async _fallbackFootage(scene) {
    this._synthMusic = true;
    this.audio.startMusic('calm');
    scene.fadeSpace(2.5);
    this.overlay?.show();
    this.overlay?.caption({ kicker: 'HELIOS-7', text: 'ORBITAL RESEARCH STATION', hold: 3 });
    await wait(3500);
    this.overlay?.hide();
    scene.slideIn(3); this.audio.whoosh(2.8, true, 0.45);
    await wait(3000);
  }

  async _titleAndCredits() {
    if (this.skipped) return;
    const title = $('.in-title', this.root);
    title.classList.add('go');
    [...title.querySelectorAll('i')].forEach((_, i) => setTimeout(() => this.audio.letterTick(i), 120 + i * 140));
    await wait(120 + 9 * 140 + 400);
    this.audio.titleHit();
    title.classList.add('lock');
    await wait(1300);
    const cr = $('.in-credits', this.root);
    cr.classList.add('go-studio'); this.audio.whoosh(0.8, true, 0.25);
    await wait(1500);
    cr.classList.add('go-idea'); this.audio.letterTick(4);
    // the "exit full screen" control pops in top-right
    const min = $('.in-min', this.root);
    if (document.fullscreenElement) { min.classList.remove('hidden'); min.classList.add('pop'); this.audio.uiSound('on'); }
    await wait(2600);
  }

  async _whiteout() {
    const w = $('.in-white', this.root);
    // 2 s ease-in: brightness grows slowly, then faster, ending in full white
    w.classList.add('rise');
    this._rampMusic(0, 2000);
    if (this._synthMusic) this.audio.stopMusic(2);
    this.audio.whoosh(2, true, 0.3);
    await wait(2050);
    $('.in-stage', this.root).classList.add('hidden');
    try { this.music?.pauseVideo(); this.video?.pauseVideo(); } catch { /* ignore */ }
    const pw = $('.in-pw', this.root);
    pw.classList.add('show');
    await wait(450);
    pw.classList.add('logo');
    this.audio.logoSting();
    await wait(3000);
    pw.classList.add('implode');
    this.audio.implode();
    await wait(650);
  }

  /** Returning player: straight from the gate to the console (no footage). */
  async _toConsole({ waitForBoot, beforeReveal }) {
    this.skipped = true;
    this.audio.init();
    this.audio.uiSound('play');
    $('.in-gate', this.root).classList.add('leave');
    await Promise.all([waitForBoot(), wait(600)]);
    try { beforeReveal?.(); } catch (e) { console.error(e); }
    this.root.classList.add('fade-out');
    try { this.video?.destroy(); this.videoB?.destroy(); this.music?.destroy(); } catch (e) { console.info('YouTube player cleanup:', e?.message || e); }
    await wait(900);
    this.root.remove();
  }

  async run({ waitForBoot, beforeReveal }) {
    const gate = $('.in-gate', this.root);
    this._synthMusic = false;
    await this._sting();
    const choice = await this._waitForTap();
    if (choice === 'console') return this._toConsole({ waitForBoot, beforeReveal });
    this._unlockLocalAudio();
    this.audio.init();
    this.audio.uiSound('play');
    const fs = this._fullscreen();
    gate.classList.add('leave');
    const stage = $('.in-stage', this.root);
    stage.classList.remove('hidden');
    const lowPower = (navigator.deviceMemory || 4) <= 3;
    const scene = (this.scene = new IntroScene($('.in-canvas', this.root), { lowPower }));
    this.overlay = new FootageOverlay(stage, this.audio);
    await fs;
    // skip control (appears after a moment; returning players can jump straight to the console)
    const skip = $('.in-skip', this.root);
    setTimeout(() => skip.classList.remove('hidden'), 2500);
    const skipP = new Promise((res) => skip.addEventListener('click', () => { this.skipped = true; this.audio.uiSound('press'); res('skip'); }, { once: true }));
    $('.in-min', this.root).addEventListener('click', async (e) => {
      e.stopPropagation(); this.audio.uiSound('off');
      e.currentTarget.classList.add('hidden');
      await this._exitFullscreen();
    });
    setTimeout(() => gate.remove(), 900);
    const main = (async () => {
      await this._countdown();
      await this._footage(scene);
      await this._titleAndCredits();
    })();
    const r = await Promise.race([main, skipP]);
    skip.classList.add('hidden');
    if (r === 'skip') {
      this._rampMusic(0, 600);
      this.audio.stopMusic(0.6);
      const w = $('.in-white', this.root); w.classList.add('quick');
      await wait(450);
    } else {
      await this._whiteout();
    }
    await waitForBoot();
    // stay in full screen into the console (the ⤢ button there toggles it)
    await wait(120);
    try { beforeReveal?.(); } catch (e) { console.error(e); }
    await wait(80);
    const w = $('.in-white', this.root);
    w.classList.add('out');
    try { this.video?.destroy(); this.videoB?.destroy(); this.music?.destroy(); } catch (e) { console.info('YouTube player cleanup:', e?.message || e); }
    try { this.localAudio?.pause(); this._localVideo?.pause(); this._localVideo?.remove(); } catch (e) { console.info('Intro media cleanup:', e?.message || e); }
    clearInterval(this._volIv);
    this.overlay?.destroy();
    scene.dispose();
    markPlayed();
    await wait(1300);
    this.root.remove();
  }
}
