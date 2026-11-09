import './intro.css';
import { loadYouTubeAPI, createPlayer, playSegments, waitUntilPlaying } from './youtube.js';
import { IntroScene } from './introScene.js';
import { CREDITS, LOGO_MARK, wordmark, logoBlock } from './brand.js';

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
      <div class="in-gate">
        <div class="in-gate-mark">${LOGO_MARK}</div>
        <div class="in-gate-title">NEW&nbsp;EARTH</div>
        <button class="in-gate-btn" type="button"><span class="in-pulse"></span><span>TAP TO ENTER</span></button>
        <div class="in-gate-sub">Best in landscape · sound on</div>
        <div class="in-gate-load"><i></i></div>
      </div>
      <div class="in-stage hidden">
        <div class="in-video"><div id="in-yt-video"></div></div>
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
          <div class="in-cred-row in-cred-idea"><span class="in-cred-k">CREATIVE IDEA BY</span><span class="in-cred-v">${CREDITS.ideaBy}</span></div>
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
    // start fetching the YouTube API right away so the tap → video gap is short
    this.ytReady = loadYouTubeAPI().then((YT) => this._makePlayers(YT)).catch((e) => { console.warn('Intro footage unavailable:', e.message); return null; });
  }

  setLoad(p) { const i = $('.in-gate-load i', this.root); if (i) i.style.width = `${Math.round(p * 100)}%`; }

  async _makePlayers(YT) {
    const [video, music] = await Promise.all([
      createPlayer(YT, $('#in-yt-video', this.root), VIDEO_ID, { muted: true, start: SEGMENTS[0][0] }),
      createPlayer(YT, $('#in-yt-audio', this.root), MUSIC_ID, { muted: false, start: MUSIC_START }).catch(() => null),
    ]);
    this.video = video; this.music = music;
    return { video, music };
  }

  _waitForTap() {
    return new Promise((resolve) => {
      const go = (e) => {
        e?.preventDefault?.();
        this.root.removeEventListener('pointerup', go); window.removeEventListener('keydown', go);
        resolve();
      };
      this.root.addEventListener('pointerup', go);
      window.addEventListener('keydown', go);
    });
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

  _flash(kind = 'cut') {
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

  _rampMusic(to, ms) {
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
    const players = await Promise.race([this.ytReady, wait(4000).then(() => null)]);
    const vEl = $('.in-video', this.root);
    if (!players?.video) return this._fallbackFootage(scene);
    const { video, music } = players;
    // only show the footage once it is really playing — never YouTube's own error card
    try { video.seekTo(SEGMENTS[0][0], true); video.playVideo(); } catch { /* handled below */ }
    if (!(await waitUntilPlaying(video, 6000))) { try { video.stopVideo(); music?.stopVideo(); } catch { /* ignore */ } return this._fallbackFootage(scene); }
    if (this.skipped) return;
    if (music && !music.__failed) { try { music.setVolume(0); music.seekTo(MUSIC_START, true); music.playVideo(); this._rampMusic(85, 2500); } catch { /* ignore */ } }
    // if the music iframe is refused sound (some iOS versions), use the synth score instead
    setTimeout(() => { if (!this.skipped && (!music || music.__failed || music.getPlayerState?.() !== 1)) { this._synthMusic = true; this.audio.startMusic('calm'); } }, 3000);
    vEl.classList.add('on');
    let slid = false;
    const lastIdx = SEGMENTS.length - 1;
    await playSegments(video, SEGMENTS, {
      onCut: () => this._flash('cut'),
      onStall: (s) => $('.in-buffer', this.root)?.classList.toggle('hidden', !s || this.skipped),
      onTime: (t, i, remain) => {
        if (this.skipped) return;
        if (!slid && i === lastIdx && remain <= 3.05) { slid = true; scene.slideIn(3); this.audio.whoosh(2.8, true, 0.45); }
      },
    });
    if (!slid) { scene.slideIn(2.2); this.audio.whoosh(2.2, true, 0.45); }
    try { video.pauseVideo(); } catch { /* ignore */ }
    vEl.classList.remove('on'); // CSS fade
    scene.fadeSpace(1.4);
  }

  /** Offline / blocked YouTube: our own 3D establishing shot with the synthesised score. */
  async _fallbackFootage(scene) {
    this._synthMusic = true;
    this.audio.startMusic('calm');
    scene.fadeSpace(2.5);
    await wait(3500);
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

  async run({ waitForBoot, beforeReveal }) {
    const gate = $('.in-gate', this.root);
    this._synthMusic = false;
    await this._waitForTap();
    this.audio.init();
    this.audio.uiSound('play');
    const fs = this._fullscreen();
    gate.classList.add('leave');
    const stage = $('.in-stage', this.root);
    stage.classList.remove('hidden');
    const lowPower = (navigator.deviceMemory || 4) <= 3;
    const scene = (this.scene = new IntroScene($('.in-canvas', this.root), { lowPower }));
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
    // leave full screen while the screen is still white so the jump in viewport size is hidden
    await this._exitFullscreen();
    await wait(120);
    try { beforeReveal?.(); } catch (e) { console.error(e); }
    await wait(80);
    const w = $('.in-white', this.root);
    w.classList.add('out');
    try { this.video?.destroy(); this.music?.destroy(); } catch { /* ignore */ }
    clearInterval(this._volIv);
    scene.dispose();
    await wait(1300);
    this.root.remove();
  }
}
