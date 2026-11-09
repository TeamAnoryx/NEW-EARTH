/**
 * Animated HUD layer over the intro footage: story captions that decode letter by letter,
 * a live "camera feed" frame with ticking telemetry, an alert state, and tap-to-scan ripples.
 * Captions are keyed to the footage clock (segment index + seconds into the segment), so they
 * stay in sync even if the video buffers.
 */

// Edit freely: seg = index into SEGMENTS, at = seconds into that segment.
export const CAPTIONS = [
  { seg: 0, at: 2.0, kicker: 'TRANSMISSION', text: 'HUMANITY LOOKED UP', hold: 5 },
  { seg: 0, at: 10.0, kicker: 'LOW EARTH ORBIT', text: '408 KM ABOVE HOME', hold: 5 },
  { seg: 0, at: 18.5, kicker: 'HELIOS-7', text: 'ORBITAL RESEARCH STATION', hold: 5.5 },
  { seg: 0, at: 27.5, kicker: 'LAB DECK B', text: 'PROJECT GENESIS', sub: 'A cure for everything', hold: 6 },
  { seg: 0, at: 37.0, kicker: 'STATION LOG', text: 'EVERYTHING WAS PERFECT', hold: 5.5 },
  { seg: 1, at: 0.3, kicker: '03:12 STATION TIME', text: 'CONTAINMENT FAILURE', alert: true, hold: 6.5 },
  { seg: 2, at: 0.8, kicker: 'WARNING', text: 'THE INFECTED ARE BLIND', alert: true, hold: 5.5 },
  { seg: 2, at: 7.8, kicker: 'WARNING', text: 'THEY HUNT BY SOUND', alert: true, hold: 5.5 },
  { seg: 3, at: 0.6, kicker: 'THREE SURVIVORS', text: 'ONE WAY HOME', hold: 5.5 },
];

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&@/<>=+*';

export class FootageOverlay {
  constructor(parent, audio) {
    this.audio = audio;
    this.fired = new Set();
    this.alert = false;
    this.el = document.createElement('div');
    this.el.className = 'fo hidden';
    this.el.innerHTML = `
      <div class="fo-corners"><i></i><i></i><i></i><i></i></div>
      <div class="fo-scan"></div>
      <div class="fo-tl"><span class="fo-rec"></span><span class="fo-feed">LIVE FEED · HELIOS-7 · EXT CAM 04</span></div>
      <div class="fo-tr"><span class="fo-k">STATION TIME</span><span class="fo-clock">02:58:41</span></div>
      <div class="fo-bl">
        <div><span class="fo-k">ALT</span><b class="fo-alt">408.2</b><span class="fo-u">KM</span></div>
        <div><span class="fo-k">VEL</span><b class="fo-vel">7.66</b><span class="fo-u">KM/S</span></div>
        <div><span class="fo-k">O₂</span><b class="fo-o2">21.0</b><span class="fo-u">%</span></div>
        <div class="fo-bars">${'<i></i>'.repeat(14)}</div>
      </div>
      <div class="fo-cap"><div class="fo-cap-k"></div><div class="fo-cap-t"></div><div class="fo-cap-s"></div><div class="fo-cap-line"></div></div>
      <div class="fo-hint">TAP TO SCAN</div>`;
    parent.appendChild(this.el);
    this.cap = this.el.querySelector('.fo-cap');
    this._clockS = 2 * 3600 + 58 * 60 + 41;
    this._tick = setInterval(() => this._telemetry(), 250);
    this._onTap = (e) => this._scan(e);
    this.el.addEventListener('pointerdown', this._onTap);
    setTimeout(() => this.el.querySelector('.fo-hint')?.classList.add('gone'), 7000);
  }

  show() { this.el.classList.remove('hidden'); requestAnimationFrame(() => this.el.classList.add('on')); }
  hide() { this.el.classList.remove('on'); this.el.classList.add('off'); this._hideCaption(); }

  /** Drive from the footage clock. */
  update(seg, tInSeg) {
    CAPTIONS.forEach((c, i) => {
      if (this.fired.has(i) || c.seg !== seg || tInSeg < c.at) return;
      if (tInSeg > c.at + c.hold) { this.fired.add(i); return; } // skipped past it (buffering / seek)
      this.fired.add(i);
      this.caption(c);
    });
    const alert = seg === 1 || seg === 2;
    if (alert !== this.alert) { this.alert = alert; this.el.classList.toggle('alert', alert); }
  }

  caption({ kicker = '', text, sub = '', alert = false, hold = 5 }) {
    const c = this.cap;
    clearTimeout(this._capT); clearInterval(this._decodeIv);
    c.className = 'fo-cap' + (alert ? ' red' : '');
    c.querySelector('.fo-cap-k').textContent = kicker;
    c.querySelector('.fo-cap-s').textContent = sub;
    const t = c.querySelector('.fo-cap-t');
    // letter spans so each character can decode and glitch on its own
    t.innerHTML = [...text].map((ch, i) => `<i style="--i:${i}">${ch === ' ' ? '&nbsp;' : ch}</i>`).join('');
    void c.offsetWidth; c.classList.add('in');
    this.audio.uiSound('open');
    const spans = [...t.querySelectorAll('i')];
    const finalCh = [...text];
    const start = performance.now(), per = 38;
    this._decodeIv = setInterval(() => {
      const el = performance.now() - start;
      let done = true;
      spans.forEach((s, i) => {
        if (finalCh[i] === ' ') return;
        const settle = 180 + i * per;
        if (el < settle) { done = false; if (el > i * per * 0.5) s.textContent = GLYPHS[(Math.random() * GLYPHS.length) | 0]; }
        else if (s.textContent !== finalCh[i]) { s.textContent = finalCh[i]; s.classList.add('set'); if (i % 3 === 0) this.audio.letterTick(i % 8); }
      });
      if (done) clearInterval(this._decodeIv);
    }, 40);
    this._capT = setTimeout(() => this._hideCaption(), hold * 1000);
  }

  _hideCaption() {
    clearInterval(this._decodeIv);
    this.cap.classList.remove('in'); this.cap.classList.add('outro');
    setTimeout(() => this.cap.classList.remove('outro'), 700);
  }

  _telemetry() {
    const q = (s) => this.el.querySelector(s);
    this._clockS += 0.25;
    const s = Math.floor(this._clockS);
    q('.fo-clock').textContent = `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    q('.fo-alt').textContent = (408.2 + Math.sin(this._clockS * 0.3) * 0.15).toFixed(1);
    q('.fo-vel').textContent = (7.66 + (Math.random() - 0.5) * 0.006).toFixed(2);
    q('.fo-o2').textContent = (this.alert ? 19.4 + Math.random() * 0.6 : 20.9 + Math.random() * 0.1).toFixed(1);
    this.el.querySelectorAll('.fo-bars i').forEach((b) => (b.style.transform = `scaleY(${0.15 + Math.random() * (this.alert ? 1 : 0.6)})`));
  }

  /** Tap feedback: radar ripple + target readout where the viewer touched. */
  _scan(e) {
    if (e.target.closest('button')) return;
    const r = document.createElement('div');
    r.className = 'fo-ripple';
    r.style.left = `${e.clientX}px`; r.style.top = `${e.clientY}px`;
    const id = Math.random().toString(16).slice(2, 6).toUpperCase();
    r.innerHTML = `<i></i><i></i><span>SCAN ${id} · ${(e.clientX / innerWidth * 180 - 90).toFixed(1)}° ${(e.clientY / innerHeight * 90).toFixed(1)}°<br>${this.alert ? 'BIOHAZARD SIGNATURE' : 'NO THREAT'}</span>`;
    this.el.appendChild(r);
    this.audio.uiSound(this.alert ? 'off' : 'on');
    this.el.querySelector('.fo-hint')?.classList.add('gone');
    setTimeout(() => r.remove(), 1600);
  }

  destroy() { clearInterval(this._tick); clearInterval(this._decodeIv); clearTimeout(this._capT); this.el.removeEventListener('pointerdown', this._onTap); this.el.remove(); }
}
