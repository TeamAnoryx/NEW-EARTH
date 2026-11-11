#!/usr/bin/env node
/**
 * NEW EARTH app icons: the game mark (three rings, nodes, inverted V) in black on white.
 *   node scripts/make-icons.cjs   → public/favicon.svg, favicon.ico, apple-touch-icon.png, icon-192.png, icon-512.png
 * Rasterised with the preinstalled Playwright Chromium; the .ico is assembled from PNGs (no extra deps).
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const OUT = path.join(__dirname, '..', 'public');
const ring = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}"/>`;
/** bold = thicker strokes so the mark survives at 16–48 px. pad = extra margin (maskable safe zone). */
function svg({ bold = false, rounded = true, pad = 0 } = {}) {
  const sw = bold ? 30 : 16, dot = bold ? 26 : 18;
  const size = 500 + pad * 2, x0 = 262 - pad, y0 = 21 - pad;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0} ${y0} ${size} ${size}" width="512" height="512">
  <rect x="${x0}" y="${y0}" width="${size}" height="${size}" rx="${rounded ? size * 0.18 : 0}" fill="#ffffff"/>
  <g fill="none" stroke="#000000" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">
    ${ring(414, 346, 77)}${ring(512, 200, 81)}${ring(610, 346, 77)}
    <path d="M610 346 L512 200 L414 346"/>
  </g>
  <g fill="#000000"><circle cx="414" cy="346" r="${dot}"/><circle cx="512" cy="200" r="${dot}"/><circle cx="610" cy="346" r="${dot}"/></g>
</svg>`;
}

function ico(pngs) {
  // ICO container with embedded PNG images (supported by all current browsers)
  const head = Buffer.alloc(6 + 16 * pngs.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(pngs.length, 4);
  let offset = head.length;
  pngs.forEach(({ size, buf }, i) => {
    const e = 6 + i * 16;
    head.writeUInt8(size >= 256 ? 0 : size, e); head.writeUInt8(size >= 256 ? 0 : size, e + 1);
    head.writeUInt8(0, e + 2); head.writeUInt8(0, e + 3);
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(buf.length, e + 8); head.writeUInt32LE(offset, e + 12);
    offset += buf.length;
  });
  return Buffer.concat([head, ...pngs.map((p) => p.buf)]);
}

(async () => {
  let browser;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage();
    const render = async (markup, size) => {
      await page.setViewportSize({ width: size, height: size });
      await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${markup.replace('width="512" height="512"', `width="${size}" height="${size}"`)}</body></html>`);
      return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
    };
    fs.writeFileSync(path.join(OUT, 'favicon.svg'), svg({ bold: true }));
    const small = [];
    for (const size of [16, 32, 48]) small.push({ size, buf: await render(svg({ bold: true }), size) }); // one page → render in turn
    fs.writeFileSync(path.join(OUT, 'favicon.ico'), ico(small));
    fs.writeFileSync(path.join(OUT, 'apple-touch-icon.png'), await render(svg({ rounded: false, pad: 40 }), 180));
    fs.writeFileSync(path.join(OUT, 'icon-192.png'), await render(svg({ rounded: false, pad: 40 }), 192));
    fs.writeFileSync(path.join(OUT, 'icon-512.png'), await render(svg({ rounded: false, pad: 90 }), 512)); // maskable: mark inside the 80% safe zone
    console.log('icons written to', OUT);
  } catch (e) {
    console.error('Icon generation failed:', e.message);
    process.exitCode = 1;
  } finally {
    await browser?.close().catch((e) => console.warn('Browser close failed:', e.message));
  }
})();
