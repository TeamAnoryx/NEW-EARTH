/** Keyboard + pointer-lock mouse input. */
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

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab') e.preventDefault();
      if (e.code === 'Escape') { this.onEscape?.(); return; }
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());

    canvas.addEventListener('click', () => this.requestLock());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX || 0;
      this.mouseDY += e.movementY || 0;
    });
  }

  requestLock() {
    if (!this.enabled || this.locked) return;
    try {
      const p = this.canvas.requestPointerLock?.();
      if (p && p.catch) p.catch(() => {});
    } catch { /* pointer lock unavailable (e.g. iframe) */ }
  }

  exitLock() { if (document.pointerLockElement) document.exitPointerLock(); }

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
