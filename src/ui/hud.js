const $ = (id) => document.getElementById(id);

const SPEAKERS = {
  Max: '#5ff3ff', Sean: '#ffa040', Anna: '#ff7fe0', HELIOS: '#ff5a5a', GROUND: '#9dff8a', '': '#cfd8e0',
};

/** DOM HUD: objectives, prompts, subtitles, meters, toasts, chapter cards. */
export class HUD {
  constructor(audio) {
    this.audio = audio;
    this.el = $('hud');
    this._subTimer = null;
    this._advance = null;
  }

  show(v = true) { this.el.classList.toggle('hidden', !v); document.getElementById('lookbtn')?.classList.toggle('hidden', !v); }

  objective(text) {
    this.currentObjective = text || null;
    const o = $('objective');
    if (!text) { o.style.opacity = 0; return; }
    o.style.opacity = 1;
    $('obj-text').textContent = text;
    o.classList.remove('flash'); void o.offsetWidth; o.classList.add('flash');
    this.audio.ui('objective');
  }

  prompt(text, key = 'E') {
    const p = $('prompt');
    document.body.classList.toggle('can-act', !!text);
    if (!text) { p.classList.add('hidden'); this._prompt = null; return; }
    if (this._prompt === text + key) return;
    this._prompt = text + key;
    $('prompt-key').textContent = key; $('prompt-text').textContent = text;
    p.classList.remove('hidden');
  }

  /** Typewriter subtitle. Resolves when finished (auto after reading time, or Space/Enter). */
  /**
   * Typewriter subtitle. Lines are queued: a line requested while another is showing waits its
   * turn (never cuts it off), and every returned promise always resolves — so story scripts
   * awaiting a line can't hang. clearSub() flushes the queue.
   */
  say(name, text, hold = null) {
    const gen = this._subGen || 0;
    this._subQ = (this._subQ || Promise.resolve()).then(() => (gen === (this._subGen || 0) ? this._showLine(name, text, hold) : null));
    return this._subQ;
  }

  _showLine(name, text, hold) {
    if (this.fast) return Promise.resolve(); // skipping: lines resolve instantly
    return new Promise((res) => {
      document.body.classList.add('talking');
      const box = $('subtitle'), n = $('sub-name'), t = $('sub-text');
      clearTimeout(this._subHide);
      const col = SPEAKERS[name] ?? SPEAKERS[''];
      const changed = box.dataset.who !== (name || '') || box.classList.contains('hidden') || box.classList.contains('out');
      box.classList.remove('hidden', 'out');
      box.dataset.who = name || '';
      box.style.setProperty('--sc', col);
      n.textContent = name ? name.toUpperCase() : '';
      $('sub-initial').textContent = name === 'GROUND' ? '📡' : (name || '•').slice(0, 1).toUpperCase();
      box.classList.add('speaking');
      if (changed) { box.classList.remove('pop'); void box.offsetWidth; box.classList.add('pop'); }
      t.textContent = '';
      let i = 0;
      clearInterval(this._typer);
      this._typer = setInterval(() => {
        i += 2; t.textContent = text.slice(0, i);
        if (i >= text.length) { clearInterval(this._typer); box.classList.remove('speaking'); }
      }, 22);
      const dur = hold ?? Math.max(1.8, 0.9 + text.length * 0.052);
      const finish = () => {
        clearTimeout(this._subTimer); clearInterval(this._typer); this._advance = null; this._finish = null;
        document.body.classList.remove('talking'); box.classList.remove('speaking');
        // tuck the box away unless another line follows straight on
        clearTimeout(this._subHide); this._subHide = setTimeout(() => box.classList.add('out'), 450);
        res();
      };
      this._finish = finish;
      this._subTimer = setTimeout(finish, dur * 1000);
      this._advance = () => {
        if (t.textContent.length < text.length) { clearInterval(this._typer); t.textContent = text; box.classList.remove('speaking'); return; }
        finish();
      };
    });
  }

  advance() { this._advance?.(); }
  clearSub() {
    document.body.classList.remove('talking');
    $('chapter-card').classList.remove('show');
    $('subtitle').classList.add('hidden'); clearInterval(this._typer); clearTimeout(this._subTimer);
    this._subGen = (this._subGen || 0) + 1; // drop queued lines
    const f = this._finish; this._finish = null; this._advance = null; f?.(); // release whoever awaits the current one
    this._subQ = Promise.resolve();
  }

  chapter(text, dur = 3.5) {
    const c = $('chapter-card');
    if (this.fast) { c.classList.remove('show'); return Promise.resolve(); }
    c.textContent = text; c.classList.add('show');
    return new Promise((res) => setTimeout(() => { c.classList.remove('show'); setTimeout(res, 1200); }, dur * 1000));
  }

  toast(text, dur = 2.5) {
    const t = $('toast'); t.textContent = text; t.classList.add('show');
    clearTimeout(this._toastT); this._toastT = setTimeout(() => t.classList.remove('show'), dur * 1000);
  }

  /** Vertical segmented noise meter (left edge). 0.55 = the infected hear you. */
  noise(v, visible = true) {
    const el = $('noise');
    el.classList.toggle('hidden', !visible);
    if (!visible) return;
    const segs = $('noise-segs');
    if (!segs.children.length) segs.innerHTML = Array.from({ length: 22 }, (_, i) => `<i style="--k:${i / 21}"></i>`).join('');
    const x = Math.max(0, Math.min(1, v)), lit = Math.round(x * 22);
    [...segs.children].forEach((s, i) => s.classList.toggle('on', i < lit));
    $('noise-fill').style.transform = `scaleY(${x})`;
    $('noise-val').textContent = String(Math.round(x * 100));
    el.classList.toggle('warn', x > 0.35 && x <= 0.55);
    el.classList.toggle('loud', x > 0.55);
    el.classList.toggle('silent', x < 0.02);
  }

  /** Full white-out: CONGRATS — LEVEL n CLEARED. Resolves when the white has faded away again. */
  levelCleared(n, name) {
    let el = document.getElementById('cleared');
    if (!el) { el = document.createElement('div'); el.id = 'cleared'; document.body.appendChild(el); }
    el.innerHTML = `<div class="cl-in"><div class="cl-k">CONGRATS</div><div class="cl-n">LEVEL ${n}</div><div class="cl-s">CLEARED</div><div class="cl-name">${name}</div></div>`;
    el.className = 'show';
    this.audio.titleHit?.();
    return new Promise((res) => {
      setTimeout(() => this.audio.logoSting?.(), 700);
      setTimeout(() => { el.className = 'show out'; }, 3600);
      setTimeout(() => { el.className = ''; res(); }, 4500);
    });
  }

  /** Character picker. options: [{ name, color, role }]; resolves with the chosen name or null. */
  pickPlayer(options, title = 'TAKE CONTROL OF') {
    const box = $('switcher'), cards = $('sw-cards');
    $('sw-title').textContent = title;
    document.body.classList.add('focus-ui');
    cards.innerHTML = options.map((o, i) => `<button class="sw-card" type="button" data-name="${o.name}" style="--c:${o.color};--i:${i}">
      <span class="sw-face">${o.face ?? o.name[0]}</span><b>${o.name.toUpperCase()}</b><small>${o.role}</small></button>`).join('');
    box.classList.remove('hidden');
    this.audio.uiSound('open');
    window.dispatchEvent(new Event('ne-panel-opened'));
    return new Promise((res) => {
      const done = (v) => { box.classList.add('hidden'); document.body.classList.remove('focus-ui'); this.audio.uiSound(v ? 'play' : 'close'); window.dispatchEvent(new Event('ne-panel-closed')); res(v); };
      cards.querySelectorAll('.sw-card').forEach((b) => (b.onclick = () => done(b.dataset.name)));
      box.querySelector('.sw-cancel').onclick = () => done(null);
    });
  }

  /** Show/hide the floating SWITCH PLAYER button; onClick fires when pressed. */
  /** Floating ASSIGN TASK button (Levels 3–4). */
  assignButton(visible, onClick) {
    const bar = $('assignbar');
    const was = !bar.classList.contains('hidden');
    bar.classList.toggle('hidden', !visible);
    if (visible && !was) { bar.classList.remove('pop'); void bar.offsetWidth; bar.classList.add('pop'); }
    bar.querySelector('.as-open').onclick = visible ? () => { this.audio.uiSound('press'); onClick?.(); } : null;
  }

  /**
   * Task picker: each row = a task; tap a crew member to give it to them (tap again to clear).
   * Resolves with [{id, who}] on ASSIGNED, or null when closed.
   */
  assignPanel(tasks, crew) {
    const box = $('assigner'), list = box.querySelector('.as-list'), go = box.querySelector('.as-go');
    const picks = {};
    list.innerHTML = tasks.map((t) => `<li data-id="${t.id}"><span class="as-task">${t.text}</span><span class="as-who">${crew.map((c) =>
      `<button type="button" class="as-c" data-who="${c.name}" style="--c:${c.color}"><i>${c.name[0]}</i>${c.name.toUpperCase()}${c.busy ? `<small>+${c.busy}</small>` : ''}</button>`).join('')}</span></li>`).join('');
    list.querySelectorAll('li').forEach((li) => li.querySelectorAll('.as-c').forEach((b) => (b.onclick = () => {
      const id = li.dataset.id, who = b.dataset.who;
      picks[id] = picks[id] === who ? null : who;
      li.querySelectorAll('.as-c').forEach((x) => x.classList.toggle('on', picks[id] === x.dataset.who));
      li.classList.toggle('picked', !!picks[id]);
      go.disabled = !Object.values(picks).some(Boolean);
      this.audio.uiSound(picks[id] ? 'on' : 'off');
    })));
    go.disabled = true;
    box.classList.remove('hidden'); document.body.classList.add('focus-ui');
    window.dispatchEvent(new Event('ne-panel-opened'));
    return new Promise((res) => {
      const done = (v) => { box.classList.add('hidden'); document.body.classList.remove('focus-ui'); go.onclick = null; box.querySelector('.as-x').onclick = null; window.dispatchEvent(new Event('ne-panel-closed')); res(v); };
      go.onclick = () => { this.audio.uiSound('play'); done(Object.entries(picks).filter(([, w]) => w).map(([id, who]) => ({ id, who }))); };
      box.querySelector('.as-x').onclick = () => { this.audio.uiSound('close'); done(null); };
    });
  }

  switchButton(visible, onClick) {
    const bar = $('switchbar');
    bar.classList.toggle('hidden', !visible);
    bar.querySelector('.sw-open').onclick = visible ? () => { this.audio.uiSound('press'); onClick?.(); } : null;
  }

  /** Blur the game and wait for TAKE CONTROL BACK. */
  takeControlBack(note) {
    const box = $('takeback');
    $('tk-note').textContent = note;
    box.classList.remove('hidden'); document.body.classList.add('focus-ui');
    this.audio.uiSound('on');
    return new Promise((res) => {
      box.querySelector('.tk-btn').onclick = () => { box.classList.add('hidden'); document.body.classList.remove('focus-ui'); this.audio.uiSound('play'); res(); };
    });
  }

  timer(v, visible = true, label = 'DOOR INTEGRITY') {
    $('timer').classList.toggle('hidden', !visible);
    if (!visible) return;
    $('timer-label').textContent = label;
    $('timer-fill').style.width = `${Math.max(0, Math.min(1, v)) * 100}%`;
  }

  qte(progress, visible = true, text = 'SEAL THE DOOR') {
    $('qte').classList.toggle('hidden', !visible);
    document.body.classList.toggle('qte', visible);
    if (!visible) return;
    $('qte-text').textContent = text;
    $('qte-arc').style.strokeDashoffset = `${276.5 * (1 - Math.max(0, Math.min(1, progress)))}`;
  }

  /** Level checklist in the TASKS panel. items: [{ id, text, done }] ; the first open item is "now". */
  tasks(level, items) {
    this._tasks = { level, items };
    $('tasks-level').textContent = level;
    let nowSet = false;
    $('tasks-list').innerHTML = items.map((t) => {
      const cls = t.done ? 'done' : !nowSet ? ((nowSet = true), 'now') : '';
      return `<li class="${cls}">${t.text}${t.who && !t.done ? ` <em class="tk-who">→ ${t.who.toUpperCase()}</em>` : ''}</li>`;
    }).join('');
  }

  /** Collected items shown as chips (bottom-left). */
  inventory(list) {
    let el = document.getElementById('inventory');
    if (!el) { el = document.createElement('div'); el.id = 'inventory'; this.el.appendChild(el); }
    el.innerHTML = list.map((n, i) => `<span class="inv${i === list.length - 1 ? ' new' : ''}">${n}</span>`).join('');
  }

  /** Show a clue card (auto-hides; tap ✕ or CLUE again to close). */
  clue(c) {
    const el = $('clue');
    if (!c) { el.classList.add('hidden'); clearTimeout(this._clueT); document.querySelector('[data-tb="clue"]')?.classList.remove('on'); return; }
    $('clue-title').textContent = c.title;
    $('clue-text').textContent = c.text;
    $('clue-step').textContent = c.step || '';
    el.classList.remove('hidden'); el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
    document.querySelector('[data-tb="clue"]')?.classList.add('on');
    clearTimeout(this._clueT);
    this._clueT = setTimeout(() => this.clue(null), 12000);
  }

  get clueOpen() { return !$('clue').classList.contains('hidden'); }

  toggleTasks(v) { const el = $('tasks'); el.classList.toggle('hidden', v === undefined ? !el.classList.contains('hidden') : !v); document.querySelector('[data-tb="tasks"]')?.classList.toggle('on', !el.classList.contains('hidden')); }

  cinematic(on) { document.body.classList.toggle('cinematic', on); }

  fade(to, dur = 1) {
    const f = $('fade');
    if (this.fast) dur = Math.min(dur, 0.05);
    f.style.transition = `opacity ${dur}s ease`;
    f.style.opacity = to;
    return new Promise((res) => setTimeout(res, dur * 1000));
  }
}
