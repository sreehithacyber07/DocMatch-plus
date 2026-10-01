/**
 * Body silhouette audit.
 *
 * Reads the alpha channel of every approved body PNG in a real browser canvas
 * and reports where the body actually is: its bounding box and, per row, the
 * opaque segments (torso, arms, legs), in the image's own pixels. The hitmap
 * registration is derived from these measurements instead of being placed by
 * eye. Read-only: the PNGs are never modified.
 *
 *   DOCMATCH_QA_ORIGIN=http://localhost:4174 node scripts/audit/body-silhouette-audit.mjs <out.json>
 */
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const base = process.env.DOCMATCH_QA_ORIGIN ?? 'http://localhost:4174';
const out = process.argv[2];
const FILES = [
  'male hologram front', 'male hologram back', 'male systems front', 'male systems back', 'male organ front', 'male organ back',
  'female hologram front', 'female hologram back', 'female systems front', 'female systems back', 'female organ front', 'female organ back',
];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(`${base}/`);
const result = {};
for (const name of FILES) {
  result[name] = await page.evaluate(async (src) => {
    const image = new Image();
    image.src = src;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
    const ALPHA = 90;
    let minX = width, maxX = -1, minY = height, maxY = -1;
    const rows = [];
    for (let y = 0; y < height; y += 1) {
      const segments = [];
      let start = -1;
      for (let x = 0; x < width; x += 1) {
        const on = data[(y * width + x) * 4 + 3] >= ALPHA;
        if (on && start < 0) start = x;
        if ((!on || x === width - 1) && start >= 0) {
          const end = on ? x : x - 1;
          // Ignore specks and glow fragments narrower than 4px.
          if (end - start >= 3) segments.push([start, end]);
          start = -1;
        }
      }
      if (segments.length) {
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        minX = Math.min(minX, segments[0][0]);
        maxX = Math.max(maxX, segments.at(-1)[1]);
      }
      rows.push(segments);
    }
    return { width, height, bbox: { minX, maxX, minY, maxY }, rows };
  }, `/body/${encodeURIComponent(name)}.png`);
  const entry = result[name];
  console.log(name.padEnd(24), `${entry.width}x${entry.height}`, 'body', JSON.stringify(entry.bbox));
}
await browser.close();
if (out) writeFileSync(out, JSON.stringify(result));
