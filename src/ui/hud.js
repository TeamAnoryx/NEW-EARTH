const $ = (id) => document.getElementById(id);

const SPEAKERS = {
  Max: '#5ff3ff', Sean: '#ffa040', Anna: '#ff7fe0', HELIOS: '#ff5a5a', '': '#cfd8e0',
};

/** DOM HUD: objectives, prompts, subtitles, meters, toasts, chapter cards. */
export class HUD {
  constructor(audio) {
    this.audio = audio;
    this.el = $('hud');
    this._subTimer = null;
    this._advance = null;
  }

  show(v = true) { this.el.classList.toggle('hidden', !v); }

  objective(text) {
    const o = $('objective');
    if (!text) { o.style.opacity = 0; return; }
    o.style.opacity = 1;
    $('obj-text').textContent = text;
    o.classList.remove('flash'); void o.offsetWidth; o.classList.add('flash');
    this.audio.ui('objective');
  }

  prompt(text, key = 'E') {
    const p = $('prompt');
    if (!text) { p.classList.add('hidden'); this._prompt = null; return; }
    if (this._prompt === text + key) return;
    this._prompt = text + key;
    $('prompt-key').textContent = key; $('prompt-text').textContent = text;
    p.classList.remove('hidden');
  }

  /** Typewriter subtitle. Resolves when finished (auto after reading time, or Space/Enter). */
  say(name, text, hold = null) {
    return new Promise((res) => {
      const box = $('subtitle'), n = $('sub-name'), t = $('sub-text');
      box.classList.remove('hidden');
      n.textContent = name ? name.toUpperCase() : '';
      n.style.color = SPEAKERS[name] ?? SPEAKERS[''];
      t.textContent = '';
      let i = 0;
      clearInterval(this._typer);
      this._typer = setInterval(() => {
        i += 2; t.textContent = text.slice(0, i);
        if (i >= text.length) clearInterval(this._typer);
      }, 22);
      const dur = hold ?? Math.max(1.8, 0.9 + text.length * 0.052);
      const finish = () => { clearTimeout(this._subTimer); clearInterval(this._typer); this._advance = null; res(); };
      this._subTimer = setTimeout(finish, dur * 1000);
      this._advance = () => {
        if (t.textContent.length < text.length) { clearInterval(this._typer); t.textContent = text; return; }
        finish();
      };
    });
  }

  advance() { this._advance?.(); }
  clearSub() { $('subtitle').classList.add('hidden'); clearInterval(this._typer); clearTimeout(this._subTimer); this._advance = null; }

  chapter(text, dur = 3.5) {
    const c = $('chapter-card');
    c.textContent = text; c.classList.add('show');
    return new Promise((res) => setTimeout(() => { c.classList.remove('show'); setTimeout(res, 1200); }, dur * 1000));
  }

  toast(text, dur = 2.5) {
    const t = $('toast'); t.textContent = text; t.classList.add('show');
    clearTimeout(this._toastT); this._toastT = setTimeout(() => t.classList.remove('show'), dur * 1000);
  }

  noise(v, visible = true) {
    $('noise').classList.toggle('hidden', !visible);
    if (!visible) return;
    const f = $('noise-fill');
    f.style.width = `${Math.min(100, v * 100)}%`;
    f.style.background = v > 0.55 ? '#ff3b3b' : v > 0.35 ? '#ffb547' : '#5ff3ff';
  }

  timer(v, visible = true, label = 'DOOR INTEGRITY') {
    $('timer').classList.toggle('hidden', !visible);
    if (!visible) return;
    $('timer-label').textContent = label;
    $('timer-fill').style.width = `${Math.max(0, Math.min(1, v)) * 100}%`;
  }

  qte(progress, visible = true, text = 'SEAL THE DOOR') {
    $('qte').classList.toggle('hidden', !visible);
    if (!visible) return;
    $('qte-text').textContent = text;
    $('qte-arc').style.strokeDashoffset = `${276.5 * (1 - Math.max(0, Math.min(1, progress)))}`;
  }

  cinematic(on) { document.body.classList.toggle('cinematic', on); }

  fade(to, dur = 1) {
    const f = $('fade');
    f.style.transition = `opacity ${dur}s ease`;
    f.style.opacity = to;
    return new Promise((res) => setTimeout(res, dur * 1000));
  }
}
