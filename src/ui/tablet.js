/** Holographic station map shown on the found NAV-PAD. Pure SVG, generated at runtime. */
const NS = 'http://www.w3.org/2000/svg';

const DECKS = [
  {
    id: 'section', label: 'SECTION VIEW', info: `<h3>VERTICAL SECTION · RING B</h3>
      <p>Crew Quarters <span class="ok">3-C</span> sits directly above <span class="ok">Storage C-7</span>.</p>
      <p>Ventilation trunk <span class="ok">V-12</span> links the floor vent in 3-C to a ceiling grate in C-7.</p>
      <p class="warn">Infected signatures detected in Hab Corridor 3 and Logistics Spine L-2.</p>`,
  },
  {
    id: 'd1', label: 'DECK 1 · COMMAND', info: `<h3>DECK 1 · COMMAND</h3><p>Bridge, comms array, and <span class="ok">escape pods EP-1 → EP-4</span>.</p><p>Status: <span class="warn">NO SIGNAL</span></p>`,
  },
  {
    id: 'd2', label: 'DECK 2 · HAB RING', info: `<h3>DECK 2 · HAB RING</h3><p>Crew Quarters 3-C — <span class="ok">YOU ARE HERE</span>.</p><p class="warn">Corridor 3: 6+ infected. Door 3-C mag-locked.</p>`,
  },
  {
    id: 'd3', label: 'DECK 3 · LOGISTICS', info: `<h3>DECK 3 · LOGISTICS</h3><p><span class="ok">Storage C-7</span>: tools, medical, EVA equipment.</p><p class="warn">C-7 door: OBSTRUCTED / PARTIALLY OPEN.</p>`,
  },
  {
    id: 'lab', label: 'LAB DECK B', haz: true, info: `<h3 class="warn">LAB DECK B · BIOTECH</h3><p class="warn">CONTAINMENT FAILURE 02:47 STATION TIME.</p><p>Project file: <b>GENESIS</b> — access restricted.</p><p>Life signs: <span class="warn">0 / 23 nominal</span></p>`,
  },
];

function el(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  parent?.appendChild(e);
  return e;
}

export class Tablet {
  constructor(audio) {
    this.audio = audio;
    this.root = document.getElementById('tablet');
    this.svg = document.getElementById('tablet-map');
    this.info = document.getElementById('tablet-info');
    this.decksEl = document.getElementById('tablet-decks');
    this.open = false;
    this.current = 'section';
    DECKS.forEach((d) => {
      const b = document.createElement('button');
      b.className = 'deck-btn' + (d.haz ? ' haz' : '');
      b.textContent = d.label; b.dataset.id = d.id;
      b.addEventListener('click', () => { this.show(d.id); this.audio.ui('blip'); });
      this.decksEl.appendChild(b);
    });
    this.start = performance.now();
    this.onProceed = null;
    this.root.querySelector('.tablet-x').addEventListener('click', () => { this.audio.uiSound?.('close'); this.onCloseRequest?.(); });
    this.root.querySelectorAll('[data-tablet]').forEach((b) => b.addEventListener('click', () => this._action(b.dataset.tablet)));
    const pw = document.getElementById('tw-power');
    pw.innerHTML = Array.from({ length: 16 }, (_, i) => `<i class="${i > 11 ? 'low' : ''}"></i>`).join('');
  }

  /** Show/hide the PROCEED button (only when the story allows moving on). */
  setProceed(label) { const b = this.root.querySelector('.tf-go'); b.classList.toggle('hidden', !label); if (label) b.firstChild.textContent = label + ' '; }

  _action(a) {
    this.audio.uiSound?.(a === 'proceed' ? 'play' : 'press');
    if (a === 'proceed') { this.onProceed?.(); return; }
    if (a === 'route') { this.show('section'); this.svg.querySelectorAll('path').forEach((p) => { if (p.getAttribute('stroke-dasharray')) { p.classList.remove('route-pulse'); void p.getBBox(); p.classList.add('route-pulse'); } }); }
    if (a === 'scan') {
      const r = this.root.querySelector('.tablet-radar'); r.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.35)', boxShadow: '0 0 40px #5ff3ff' }, { transform: 'scale(1)' }], { duration: 700 });
      document.getElementById('tw-threat').textContent = String(9 + Math.floor(Math.random() * 5));
    }
  }

  toggle(v = !this.open) {
    this.open = v;
    this.root.classList.toggle('hidden', !v);
    if (v) { this.show(this.current); this.audio.ui('tablet'); this._tick(); }
  }

  _tick() {
    if (!this.open) return;
    document.querySelectorAll('#tw-power i').forEach((b, i) => (b.style.transform = `scaleY(${(i > 11 ? 0.15 : 0.45) + Math.random() * 0.5})`));
    const s = Math.floor((performance.now() - this.start) / 1000) + 1694;
    document.getElementById('tablet-clock').textContent = `STATION 03:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    setTimeout(() => this._tick(), 500);
  }

  show(id) {
    this.current = id;
    [...this.decksEl.children].forEach((b) => b.classList.toggle('active', b.dataset.id === id));
    this.info.innerHTML = DECKS.find((d) => d.id === id).info;
    const s = this.svg; s.innerHTML = '';
    const defs = el('defs', {}, s);
    const glow = el('filter', { id: 'g', x: '-50%', y: '-50%', width: '200%', height: '200%' }, defs);
    el('feGaussianBlur', { stdDeviation: '3', result: 'b' }, glow);
    const mg = el('feMerge', {}, glow); el('feMergeNode', { in: 'b' }, mg); el('feMergeNode', { in: 'SourceGraphic' }, mg);
    // grid
    for (let x = 0; x <= 800; x += 40) el('line', { x1: x, y1: 0, x2: x, y2: 520, stroke: 'rgba(95,243,255,0.06)' }, s);
    for (let y = 0; y <= 520; y += 40) el('line', { x1: 0, y1: y, x2: 800, y2: y, stroke: 'rgba(95,243,255,0.06)' }, s);
    const C = 'rgba(95,243,255,0.85)', F = 'rgba(95,243,255,0.07)', R = '#ff3b3b';
    const room = (x, y, w, h, label, opts = {}) => {
      el('rect', { x, y, width: w, height: h, fill: opts.fill || F, stroke: opts.stroke || C, 'stroke-width': opts.sw || 1.5, rx: 3, filter: opts.glow ? 'url(#g)' : '' }, s);
      if (label) { const t = el('text', { x: x + 8, y: y + 18, fill: opts.text || C, 'font-family': 'monospace', 'font-size': opts.fs || 12, 'letter-spacing': 2 }, s); t.textContent = label; }
    };
    const blip = (x, y, color = R) => {
      const c = el('circle', { cx: x, cy: y, r: 4, fill: color, filter: 'url(#g)' }, s);
      const ring = el('circle', { cx: x, cy: y, r: 4, fill: 'none', stroke: color, 'stroke-width': 1.5 }, s);
      el('animate', { attributeName: 'r', from: 4, to: 16, dur: `${1.2 + Math.random()}s`, repeatCount: 'indefinite' }, ring);
      el('animate', { attributeName: 'opacity', from: 1, to: 0, dur: `${1.2 + Math.random()}s`, repeatCount: 'indefinite' }, ring);
      void c;
    };
    const you = (x, y) => {
      el('circle', { cx: x, cy: y, r: 6, fill: '#fff', filter: 'url(#g)' }, s);
      const t = el('text', { x: x + 12, y: y + 4, fill: '#fff', 'font-family': 'monospace', 'font-size': 11 }, s); t.textContent = 'YOU (3)';
    };
    const route = (d) => {
      const p = el('path', { d, fill: 'none', stroke: '#5ff3ff', 'stroke-width': 3, 'stroke-dasharray': '10 8', filter: 'url(#g)' }, s);
      el('animate', { attributeName: 'stroke-dashoffset', from: 72, to: 0, dur: '1.2s', repeatCount: 'indefinite' }, p);
    };
    const label = (x, y, text, color = C, fs = 11) => { const t = el('text', { x, y, fill: color, 'font-family': 'monospace', 'font-size': fs, 'letter-spacing': 2 }, s); t.textContent = text; };

    if (id === 'section') {
      label(20, 30, 'HELIOS-7 · RING B · SECTION A-A', C, 13);
      // deck bands
      room(40, 60, 720, 100, 'DECK 2 · HAB RING', { fill: 'rgba(95,243,255,0.04)', stroke: 'rgba(95,243,255,0.35)' });
      room(40, 300, 720, 160, 'DECK 3 · LOGISTICS', { fill: 'rgba(95,243,255,0.04)', stroke: 'rgba(95,243,255,0.35)' });
      room(300, 80, 220, 76, 'QUARTERS 3-C', { glow: true, sw: 2 });
      room(530, 80, 210, 76, 'CORRIDOR 3', { stroke: R, text: R, fill: 'rgba(255,59,59,0.08)' });
      room(60, 80, 220, 76, 'GALLEY', {});
      room(280, 330, 260, 120, 'STORAGE C-7', { glow: true, sw: 2 });
      room(550, 330, 190, 120, 'LOGISTICS SPINE L-2', { stroke: R, text: R, fill: 'rgba(255,59,59,0.08)' });
      room(60, 330, 200, 120, 'RECYCLING', {});
      // duct
      room(330, 190, 190, 40, 'VENT TRUNK V-12', { stroke: '#ffb547', text: '#ffb547', fill: 'rgba(255,181,71,0.06)', fs: 10 });
      route('M 470 150 L 470 210 L 350 210 L 350 360 L 350 400');
      you(470, 132);
      label(480, 182, 'FLOOR VENT', '#ffb547', 10);
      label(360, 290, 'CEILING GRATE', '#ffb547', 10);
      [[560, 120], [600, 108], [650, 128], [700, 115], [720, 135], [585, 140]].forEach(([x, y]) => blip(x, y));
      [[600, 380], [640, 400], [680, 370], [700, 420], [620, 430]].forEach(([x, y]) => blip(x, y));
      label(40, 500, '■ ROUTE COMPUTED · 14.2 m · CRAWLSPACE ONLY', '#5ff3ff', 11);
    } else if (id === 'd1') {
      room(80, 80, 640, 360, 'COMMAND DECK', {});
      room(320, 120, 160, 120, 'BRIDGE', {});
      room(110, 280, 140, 120, 'COMMS', {});
      ['EP-1', 'EP-2', 'EP-3', 'EP-4'].forEach((n, i) => room(540 + (i % 2) * 90, 270 + Math.floor(i / 2) * 80, 80, 60, n, { stroke: '#3dff8a', text: '#3dff8a' }));
      label(110, 470, 'ESCAPE PODS: STATUS UNKNOWN', '#3dff8a');
    } else if (id === 'd2') {
      el('circle', { cx: 400, cy: 260, r: 200, fill: 'none', stroke: C, 'stroke-width': 26, opacity: 0.18 }, s);
      el('circle', { cx: 400, cy: 260, r: 200, fill: 'none', stroke: C, 'stroke-width': 1.5 }, s);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2, x = 400 + Math.cos(a) * 200, y = 260 + Math.sin(a) * 200;
        el('rect', { x: x - 18, y: y - 12, width: 36, height: 24, fill: i === 2 ? 'rgba(95,243,255,0.35)' : F, stroke: i >= 3 && i <= 5 ? R : C, transform: `rotate(${(a * 180) / Math.PI + 90} ${x} ${y})` }, s);
        if (i >= 3 && i <= 5) blip(x, y);
      }
      you(400 + Math.cos((2 / 12) * Math.PI * 2) * 200, 260 + Math.sin((2 / 12) * Math.PI * 2) * 200);
      label(330, 265, 'HAB RING B', C, 13);
    } else if (id === 'd3') {
      room(60, 80, 680, 360, 'LOGISTICS DECK', {});
      room(260, 160, 240, 180, 'STORAGE C-7', { glow: true, sw: 2 });
      room(510, 140, 200, 220, 'SPINE L-2', { stroke: R, text: R, fill: 'rgba(255,59,59,0.08)' });
      label(270, 320, 'TOOLS · MED · EVA', C, 10);
      el('rect', { x: 497, y: 235, width: 8, height: 30, fill: '#ffb547' }, s);
      label(420, 380, 'DOOR AJAR ▲', '#ffb547', 10);
      [[560, 200], [600, 250], [650, 220], [620, 300], [680, 280]].forEach(([x, y]) => blip(x, y));
    } else if (id === 'lab') {
      room(80, 80, 640, 360, 'LAB DECK B · BIOTECH', { stroke: R, text: R, fill: 'rgba(255,59,59,0.06)' });
      room(120, 130, 200, 130, 'GENOMICS', { stroke: R, text: R });
      room(340, 130, 160, 130, 'CULTURE VAULT', { stroke: R, text: R });
      room(520, 130, 160, 280, 'PROJECT GENESIS', { stroke: R, text: R, glow: true });
      for (let i = 0; i < 16; i++) blip(130 + Math.random() * 560, 140 + Math.random() * 280);
      label(120, 470, '⚠ CONTAINMENT FAILURE · ALL BULKHEADS SEALED', R, 12);
    }
  }
}
