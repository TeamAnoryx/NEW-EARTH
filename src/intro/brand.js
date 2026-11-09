/**
 * Brand + credits used by the intro and the console.
 * The ANORYX emblem below is a stand-in drawn in SVG (orbital ring + "A" chevron + satellite).
 * To use the official logo, replace LOGO_MARK with the real SVG markup, keeping the classes
 * lg-ring / lg-a / lg-dot on the parts that should animate (or drop them; the wordmark still animates).
 */
export const CREDITS = {
  game: 'NEW EARTH',
  studio: 'ANORYX',
  ideaBy: 'Ahmed Pasha',
  footage: { title: 'Relaxing Space Music | Cosmos', channel: 'SERENE', url: 'https://www.youtube.com/watch?v=a6NqW_JqFwM' },
  music: { title: 'Space Meditation [Ambient Music] — Thoughts', channel: 'MokkaMusic', url: 'https://www.youtube.com/watch?v=-LYhkU_hD_w' },
};

export const LOGO_MARK = `
<svg class="anoryx-mark" viewBox="0 0 120 120" aria-hidden="true">
  <defs>
    <linearGradient id="axg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#9ff8ff"/><stop offset="1" stop-color="#2e7bff"/>
    </linearGradient>
  </defs>
  <ellipse class="lg-ring" cx="60" cy="62" rx="52" ry="20" transform="rotate(-18 60 62)" fill="none" stroke="url(#axg)" stroke-width="3.2" stroke-linecap="round"/>
  <path class="lg-a" d="M60 14 L94 98 L78 98 L60 50 L42 98 L26 98 Z M50 76 L70 76" fill="none" stroke="url(#axg)" stroke-width="4.5" stroke-linejoin="round" stroke-linecap="round"/>
  <circle class="lg-dot" cx="108" cy="46" r="4.5" fill="#bff9ff"/>
</svg>`;

/** Wordmark: each letter is its own span so it can be animated individually. */
export function wordmark(text, cls = 'anoryx-word') {
  return `<span class="${cls}">${[...text].map((ch, i) => `<i style="--i:${i}">${ch === ' ' ? '&nbsp;' : ch}</i>`).join('')}</span>`;
}

export function logoBlock(extraClass = '') {
  return `<div class="anoryx-logo ${extraClass}">${LOGO_MARK}${wordmark(CREDITS.studio)}</div>`;
}
