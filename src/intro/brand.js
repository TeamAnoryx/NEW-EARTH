/**
 * Brand + credits used by the intro and the console.
 * LOGO_MARK / WORDMARK_SVG are vector traces of the official ANORYX artwork supplied by the owner.
 */
export const CREDITS = {
  game: 'NEW EARTH',
  studio: 'ANORYX',
  ideaBy: 'Ahmed Pasha',
  footage: { title: 'Relaxing Space Music | Cosmos', channel: 'SERENE', url: 'https://www.youtube.com/watch?v=a6NqW_JqFwM' },
  music: { title: 'Space Meditation [Ambient Music] — Thoughts', channel: 'MokkaMusic', url: 'https://www.youtube.com/watch?v=-LYhkU_hD_w' },
};

// Official ANORYX mark, traced to vector from the brand artwork (1024 px master).
// Parts are separate so they can animate: two slanted bars, the A leg and the crossbar.
export const LOGO_MARK = `
<svg class="ax-mark" viewBox="140 190 745 640" aria-hidden="true">
  <polygon class="ax-p ax-bar1" points="459,206 551,206 247,817 154,817"/>
  <polygon class="ax-p ax-bar2" points="601,206 693,206 389,817 296,817"/>
  <polygon class="ax-p ax-leg" points="653,385 870,817 777,817 607,478"/>
  <polygon class="ax-p ax-cross" points="527,637 638,637 676,712 490,712"/>
</svg>`;

// Official ANORYX stencil wordmark, traced to vector (letters animate individually).
const WORD_PATHS = [
  'M82 288 L224 82 L259 82 L259 288 L228 288 L228 127 L118 288 Z',
  'M304 82 L340 82 L481 288 L446 288 L334 127 L334 288 L304 288 Z M451 82 L481 82 L481 255 L451 210 Z',
  'M610 82 H695 A84 84 0 0 1 779 166 V204 A84 84 0 0 1 695 288 H610 A84 84 0 0 1 526 204 V166 A84 84 0 0 1 610 82 Z M610 112 A54 54 0 0 0 557 166 V204 A54 54 0 0 0 610 257 H695 A54 54 0 0 0 749 204 V166 A54 54 0 0 0 695 112 Z',
  'M825 82 H856 V288 H825 Z M877 82 H958 A63 63 0 0 1 958 208 L1017 288 H978 L893 178 H958 A33 33 0 0 0 958 112 H877 Z',
  'M1063 82 H1100 L1161 165 L1142 190 Z M1243 82 H1280 L1127 288 H1090 Z',
  'M1325 82 H1362 L1411 147 L1392 172 Z M1480 82 H1517 L1362 288 H1325 Z M1430 222 L1449 197 L1517 288 H1480 Z',
];
export const WORDMARK_SVG = `
<svg class="ax-word" viewBox="70 70 1460 230" aria-label="ANORYX" role="img">
  ${WORD_PATHS.map((d, i) => `<path class="ax-l" style="--i:${i}" fill-rule="evenodd" d="${d}"/>`).join('')}
</svg>`;

/** Wordmark: each letter is its own span so it can be animated individually. */
export function wordmark(text, cls = 'anoryx-word') {
  return `<span class="${cls}">${[...text].map((ch, i) => `<i style="--i:${i}">${ch === ' ' ? '&nbsp;' : ch}</i>`).join('')}</span>`;
}

/** Logo lockup: mark + wordmark, side by side (default) or stacked like the square brand artwork. */
export function logoBlock(extraClass = '', stacked = false) {
  return `<div class="anoryx-logo ${stacked ? 'stacked' : ''} ${extraClass}">${LOGO_MARK}${WORDMARK_SVG}</div>`;
}
