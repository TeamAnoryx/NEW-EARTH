/**
 * Brand + credits used by the intro and the console.
 * LOGO_MARK / WORDMARK_SVG are vector traces of the official ANORYX artwork supplied by the owner.
 */
export const CREDITS = {
  game: 'NEW EARTH',
  studio: 'ANORYX',
  tagline: 'A creative effort from Anoryx',
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

// Official ANORYX stencil wordmark, traced to vector from the 2000 px master (one path per letter).
const WORD_PATHS = [
  'M204 276 C235 231 266 186 273 176 L284 160 L284 260 L285 360 L304 360 L324 360 L324 231 L324 103 L302 103 L280 103 L257 136 C227 179 110 349 106 355 L102 360 L124 360 L146 360 L204 276 Z',
  'M419 259 L419 159 L473 237 C502 279 533 324 542 337 L557 359 L579 359 C591 360 601 359 601 359 C601 359 579 327 552 288 C525 250 486 192 464 160 L424 103 L402 103 L380 103 L380 231 L380 360 L399 360 L419 360 L419 259 Z M602 210 L602 103 L582 103 L563 103 L563 183 L563 263 L581 290 C592 305 600 317 601 318 C601 318 602 269 602 210 Z',
  'M889 357 C906 354 920 347 933 336 C951 320 963 300 970 274 C973 264 973 263 973 231 C973 198 973 198 970 188 C958 143 929 113 889 105 C879 103 875 103 815 103 C757 103 751 103 743 104 C701 113 670 147 660 194 C657 207 657 255 660 268 C670 315 701 349 743 358 C750 359 757 359 815 359 C876 360 879 359 889 357 Z M755 321 C741 319 730 313 719 302 C712 295 710 292 706 283 C698 266 697 263 697 231 C697 199 698 196 706 179 C710 170 712 167 719 160 C726 153 730 150 736 147 C749 141 748 141 817 141 C878 141 879 141 886 143 C909 150 926 170 933 197 C935 205 935 209 935 231 C935 254 935 257 933 265 C925 296 903 317 876 321 C866 322 764 322 755 321 Z',
  'M1069 231 L1069 103 L1050 103 L1031 103 L1031 231 L1031 360 L1050 360 L1069 360 L1069 231 Z M1270 357 C1269 355 1251 333 1231 308 L1195 262 L1201 261 C1234 257 1261 234 1270 201 C1273 189 1272 170 1268 158 C1260 133 1240 113 1213 105 C1206 103 1205 103 1152 103 L1098 102 L1098 121 L1098 141 L1144 141 C1169 141 1193 141 1197 141 C1215 144 1228 156 1232 173 C1237 193 1226 213 1207 221 C1201 223 1200 223 1158 224 L1116 224 L1144 260 C1160 280 1184 310 1198 328 L1223 360 L1247 360 L1272 360 L1270 357 Z',
  'M1449 304 C1487 254 1560 155 1587 118 L1599 103 L1575 103 L1552 103 L1545 112 C1541 118 1499 175 1451 240 C1403 304 1364 358 1363 358 C1363 359 1367 360 1385 360 L1408 360 L1449 304 Z M1441 223 C1447 215 1452 208 1451 208 C1451 207 1434 183 1413 155 L1375 103 L1352 103 L1329 103 L1349 130 C1360 146 1383 176 1399 199 C1415 221 1429 239 1430 239 C1430 238 1435 231 1441 223 Z',
  'M1740 309 C1761 281 1805 223 1837 181 L1896 103 L1874 103 C1862 103 1852 103 1851 103 C1850 103 1834 125 1814 151 C1794 177 1751 234 1717 278 C1684 321 1657 358 1656 358 C1656 359 1660 360 1678 360 L1701 360 L1740 309 Z M1878 335 C1868 321 1848 296 1835 278 C1822 261 1811 247 1810 247 C1810 248 1805 254 1799 262 C1792 272 1788 277 1788 278 C1789 279 1802 295 1817 315 C1832 335 1845 353 1847 355 L1851 360 L1874 360 L1897 360 L1878 335 Z M1753 200 L1764 185 L1754 172 C1749 165 1735 146 1723 131 L1701 103 L1678 103 C1660 103 1656 103 1656 104 C1660 110 1741 215 1742 215 C1742 214 1747 208 1753 200 Z',
];
export const WORDMARK_SVG = `
<svg class="ax-word" viewBox="96 96 1808 270" aria-label="ANORYX" role="img">
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

/**
 * NEW EARTH game mark: three interlocking rings, a node at each centre, joined by an inverted V.
 * Built from strokes so it can draw itself (dots → rings → lines). Geometry measured from the
 * supplied artwork (1024 px master): top ring (512,200) r81, lower rings (414,346)/(610,346) r77.
 */
const ring = (cx, cy, r, start) => {
  // start angle (radians) = where the pen touches down; drawn clockwise as two arcs
  const x0 = cx + r * Math.cos(start), y0 = cy + r * Math.sin(start);
  const x1 = cx - r * Math.cos(start), y1 = cy - r * Math.sin(start);
  return `M${x0.toFixed(1)} ${y0.toFixed(1)} A${r} ${r} 0 1 1 ${x1.toFixed(1)} ${y1.toFixed(1)} A${r} ${r} 0 1 1 ${x0.toFixed(1)} ${y0.toFixed(1)}`;
};
export const GAME_MARK = `
<svg class="ne-mark" viewBox="318 100 388 342" aria-label="NEW EARTH" role="img">
  <g fill="none" stroke="currentColor" stroke-width="14" stroke-linecap="round" stroke-linejoin="round">
    <path class="ne-ring ne-r1" pathLength="1" d="${ring(414, 346, 77, Math.PI * 0.5)}"/>
    <path class="ne-ring ne-r2" pathLength="1" d="${ring(512, 200, 81, Math.PI * 0.5)}"/>
    <path class="ne-ring ne-r3" pathLength="1" d="${ring(610, 346, 77, Math.PI * 0.5)}"/>
    <path class="ne-line" pathLength="1" d="M610 346 L512 200 L414 346"/>
  </g>
  <g fill="currentColor">
    <circle class="ne-dot ne-d1" cx="414" cy="346" r="16"/>
    <circle class="ne-dot ne-d2" cx="512" cy="200" r="16"/>
    <circle class="ne-dot ne-d3" cx="610" cy="346" r="16"/>
  </g>
</svg>`;
