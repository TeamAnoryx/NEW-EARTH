/** Keyboard + pointer-lock mouse input (with click-and-drag look when the mouse isn't captured). */
import { isTouch } from '../ui/touch.js';

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.down = new Set();
    this.pressed = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.locked = false;
    this.enabled = true;
    this.sensitivity = 1;
    this.invertY = false;
    this.onEscape = null;
    this.analog = null;   // {x,y} from the touch thumbstick, -1..1
    this.touch = isTouch();
    this.onLockLost = null; // pointer lock released by the browser (e.g. Esc) — not by us
    this._dragging = false;

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault(); // no page scroll / focus jumps
      if (e.repeat && this.down.has(e.code)) return;
      if (e.code === 'Escape') { this.onEscape?.(); return; }
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => { this.down.clear(); this._dragging = false; });

    canvas.addEventListener('click', () => this.requestLock());
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === canvas;
      if (was && !this.locked && !this._intentionalExit) this.onLockLost?.();
      this._intentionalExit = false;
    });
    // fallback look: hold the left button and drag (pointer lock refused, embedded page, etc.)
    canvas.addEventListener('mousedown', (e) => { if (e.button === 0) this._dragging = true; });
    window.addEventListener('mouseup', () => { this._dragging = false; });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked && !this._dragging) return;
      this.mouseDX += e.movementX || 0;
      this.mouseDY += e.movementY || 0;
    });
  }

  requestLock() {
    if (!this.enabled || this.locked || this.touch) return;
    try {
      const p = this.canvas.requestPointerLock?.();
      if (p && p.catch) p.catch((e) => console.info('Pointer lock refused (click the game to retry):', e?.message || e));
    } catch (e) { console.info('Pointer lock unavailable here (e.g. embedded page):', e?.message || e); }
  }

  exitLock() {
    if (!document.pointerLockElement) return;
    this._intentionalExit = true;
    try { document.exitPointerLock(); } catch (e) { this._intentionalExit = false; console.info('Could not release the mouse:', e?.message || e); }
  }

  isDown(...codes) { return this.enabled && codes.some((c) => this.down.has(c)); }
  wasPressed(...codes) { return this.enabled && codes.some((c) => this.pressed.has(c)); }

  consumeMouse() {
    const s = 0.0022 * this.sensitivity;
    const d = { x: this.mouseDX * s, y: this.mouseDY * s * (this.invertY ? -1 : 1) };
    this.mouseDX = this.mouseDY = 0;
    return this.enabled ? d : { x: 0, y: 0 };
  }

  endFrame() { this.pressed.clear(); }
}
