/**
 * Mobile controls: floating thumbstick (left half), drag-to-look (right half),
 * action buttons (interact — tap or hold, crouch toggle, sprint hold, map, pause).
 * Feeds the same Input object the keyboard uses, so gameplay code is input-agnostic.
 */
export const isTouch = () => matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

export class TouchControls {
  constructor(input, hooks = {}) {
    this.input = input;
    this.hooks = hooks;
    this.crouch = false;
    this.root = document.createElement('div');
    this.root.id = 'touch';
    this.root.innerHTML = `
      <div class="t-zone t-move"></div>
      <div class="t-zone t-look"></div>
      <div class="t-stick hidden"><i></i></div>
      <button class="t-btn t-act" data-k="KeyE" aria-label="Interact"><span>E</span></button>
      <button class="t-btn t-crouch" aria-label="Crouch"><svg viewBox="0 0 24 24"><path d="M12 4a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm-3 6h6l1 5h-2l-1 5h-2l-1-5H8l1-5Z"/></svg></button>
      <button class="t-btn t-sprint" data-k="ShiftLeft" aria-label="Sprint"><svg viewBox="0 0 24 24"><path d="M13 3 6 13h5l-1 8 7-10h-5l1-8Z"/></svg></button>
      <button class="t-btn t-map" aria-label="Station map"><svg viewBox="0 0 24 24"><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2V6Zm6-2v14m6-12v14" fill="none" stroke="currentColor" stroke-width="1.8"/></svg></button>
      <button class="t-btn t-pause" aria-label="Pause"><svg viewBox="0 0 24 24"><path d="M7 5h3v14H7zM14 5h3v14h-3z"/></svg></button>`;
    document.body.appendChild(this.root);
    this.stick = this.root.querySelector('.t-stick');
    this.knob = this.stick.querySelector('i');
    this._bindStick(this.root.querySelector('.t-move'));
    this._bindLook(this.root.querySelector('.t-look'));
    this.root.querySelectorAll('[data-k]').forEach((b) => this._bindHold(b, b.dataset.k));
    const cr = this.root.querySelector('.t-crouch');
    cr.addEventListener('pointerdown', (e) => { e.preventDefault(); this.crouch = !this.crouch; cr.classList.toggle('on', this.crouch); this.hooks.onCrouch?.(this.crouch); this._buzz(); });
    this.root.querySelector('.t-map').addEventListener('pointerdown', (e) => { e.preventDefault(); this.hooks.onMap?.(); });
    this.root.querySelector('.t-pause').addEventListener('pointerdown', (e) => { e.preventDefault(); this.hooks.onPause?.(); });
    this.show(false);
  }

  _buzz(ms = 12) { try { navigator.vibrate?.(ms); } catch { /* unsupported */ } }

  show(v) { this.root.classList.toggle('hidden', !v); }
  setActionHighlight(on, label) {
    const b = this.root.querySelector('.t-act');
    b.classList.toggle('ready', on);
    b.querySelector('span').textContent = label || 'E';
  }
  setMapAvailable(v) { this.root.querySelector('.t-map').classList.toggle('hidden', !v); }

  _bindHold(el, code) {
    const I = this.input;
    const down = (e) => { e.preventDefault(); el.setPointerCapture?.(e.pointerId); if (!I.down.has(code)) I.pressed.add(code); I.down.add(code); el.classList.add('held'); this._buzz(); };
    const up = (e) => { e.preventDefault(); I.down.delete(code); el.classList.remove('held'); };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
  }

  _bindStick(zone) {
    const I = this.input, R = 56;
    let id = null, ox = 0, oy = 0;
    zone.addEventListener('pointerdown', (e) => {
      if (id !== null) return;
      id = e.pointerId; zone.setPointerCapture?.(id);
      ox = e.clientX; oy = e.clientY;
      this.stick.style.left = `${ox}px`; this.stick.style.top = `${oy}px`;
      this.stick.classList.remove('hidden');
      I.analog = { x: 0, y: 0 };
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      let dx = e.clientX - ox, dy = e.clientY - oy;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx *= R / d; dy *= R / d; }
      this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const m = Math.min(1, d / R);
      const dead = 0.12;
      const k = m < dead ? 0 : (m - dead) / (1 - dead);
      I.analog = { x: d ? (dx / Math.max(d, 1e-3)) * k : 0, y: d ? (dy / Math.max(d, 1e-3)) * k : 0 };
    });
    const end = (e) => {
      if (e.pointerId !== id) return;
      id = null; I.analog = null;
      this.knob.style.transform = '';
      this.stick.classList.add('hidden');
    };
    zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end);
  }

  _bindLook(zone) {
    const I = this.input;
    let id = null, lx = 0, ly = 0, startT = 0, moved = 0;
    zone.addEventListener('pointerdown', (e) => {
      if (id !== null) return;
      id = e.pointerId; zone.setPointerCapture?.(id); lx = e.clientX; ly = e.clientY; startT = performance.now(); moved = 0;
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      const dx = e.clientX - lx, dy = e.clientY - ly; lx = e.clientX; ly = e.clientY;
      moved += Math.abs(dx) + Math.abs(dy);
      // touch look is scaled relative to screen size so it feels the same on every phone
      const s = 900 / Math.max(innerWidth, 1);
      I.mouseDX += dx * 1.9 * s; I.mouseDY += dy * 1.6 * s;
    });
    const end = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      if (moved < 10 && performance.now() - startT < 250) this.hooks.onTap?.();
    };
    zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end);
  }
}
