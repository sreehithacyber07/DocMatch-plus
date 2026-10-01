/**
 * Body hitmap generator.
 *
 * Derives every body region from the measured silhouette of the approved
 * artwork (scripts/audit/body-silhouette-audit.mjs), instead of placing shapes
 * by eye. For each variant, view and layer:
 *
 *   1. The layer's image is mapped into the 1024x1536 frame the stage renders
 *      in, exactly as the CSS draws it: a 1024x1536 image fills
 *      the frame; the female hologram (1145x1374) is fitted to the frame height
 *      and centred.
 *   2. Landmarks are read from the mask: head top, neck, shoulder line,
 *      armpits, crotch, elbows, wrists, knees, ankles, sole.
 *   3. Each region is a polygon that traces the body outline between its
 *      landmarks, so a selected region follows the anatomy rather than
 *      floating as a rough shape.
 *   4. Patient-relative laterality: on the front view the patient's right is
 *      on the viewer's left; on the back view it is on the viewer's right.
 *
 * It also reports how far the systems and organ figures sit from the hologram:
 * they differ enough (arm spread, crotch height, hands and feet) that each
 * layer is registered on its own. Region ids are the frozen Body Domain ids. Nothing clinical is read
 * or written here, and the PNGs are never modified.
 *
 *   node scripts/audit/body-hitmap-generate.mjs <silhouettes.json> [--write]
 */
import { readFileSync, writeFileSync } from 'node:fs';

const [, , input, flag] = process.argv;
const data = JSON.parse(readFileSync(input, 'utf8'));
const VB_W = 1024;
const VB_H = 1536;
const STEP = 4;

/* --- Frame mapping: exactly how the stage CSS draws each image. ------------ */
function frameRows(name) {
  const image = data[name];
  const scale = VB_H / image.height; // height-fit (identity for 1024x1536)
  const offsetX = VB_W / 2 - (image.width * scale) / 2;
  const rows = [];
  for (let y = 0; y < VB_H; y += 1) {
    const v = Math.min(image.height - 1, Math.round(y / scale));
    rows.push(image.rows[v].map(([a, b]) => [offsetX + a * scale, offsetX + b * scale]).filter(([a, b]) => b - a >= 6));
  }
  return rows;
}

const width = (row) => (row.length ? row.at(-1)[1] - row[0][0] : 0);
const segmentAt = (row, x) => row.find(([a, b]) => a <= x && x <= b);

/* --- Landmarks ------------------------------------------------------------- */
function landmarks(rows) {
  const top = rows.findIndex((row) => row.length > 0);
  let bottom = rows.length - 1;
  while (bottom > 0 && rows[bottom].length === 0) bottom -= 1;
  const H = bottom - top;
  const cx = VB_W / 2;

  // Neck: the narrowest single-segment row between the head and the shoulders.
  let neckY = top + Math.round(H * 0.1);
  let neckW = Infinity;
  for (let y = top + Math.round(H * 0.08); y < top + Math.round(H * 0.19); y += 1) {
    const w = width(rows[y]);
    if (w > 0 && w < neckW) { neckW = w; neckY = y; }
  }
  // Head bottom: the chin, a short way above the narrowest point of the neck.
  const headBottom = neckY - Math.round((neckY - top) * 0.12);
  // Shoulder line: first row below the neck wider than 2.4 neck widths.
  let shoulderY = neckY;
  for (let y = neckY; y < top + H * 0.35; y += 1) if (width(rows[y]) > neckW * 2.4) { shoulderY = y; break; }
  // Armpit: first row below the shoulder line where the arms separate from the torso.
  let armpitY = shoulderY;
  for (let y = shoulderY + 10; y < top + H * 0.45; y += 1) {
    const torso = segmentAt(rows[y], cx);
    if (rows[y].length >= 3 && torso && rows[y].some(([a, b]) => b < torso[0]) && rows[y].some(([a]) => a > torso[1])) { armpitY = y; break; }
  }
  // Crotch: first row below the torso where the centre line is outside the body.
  let crotchY = armpitY;
  for (let y = armpitY + Math.round(H * 0.2); y < top + H * 0.7; y += 1) {
    if (!segmentAt(rows[y], cx)) { crotchY = y; break; }
  }
  // Torso limits, taken where the arms have separated.
  const torsoAt = (y) => segmentAt(rows[y], cx) ?? [cx - 60, cx + 60];
  const torsoArmpit = torsoAt(armpitY + 12);
  return { top, bottom, H, neckY, neckW, headBottom, shoulderY, armpitY, crotchY, torsoArmpit };
}

/** The limb segment on one side, following it row by row from a seed. */
function trackLimb(rows, y0, y1, pick) {
  const out = [];
  for (let y = y0; y <= y1; y += 1) {
    const segment = pick(rows[y], y);
    if (segment) out.push([y, segment[0], segment[1]]);
  }
  return out;
}

function polygon(points) {
  // points: [y, left, right] per row, top to bottom. Traced down the left edge and up the right.
  const sampled = points.filter((_, index) => index % STEP === 0 || index === points.length - 1);
  if (sampled.length < 2) return null;
  const left = sampled.map(([y, a]) => `${Math.round(a)} ${y}`);
  const right = sampled.slice().reverse().map(([y, , b]) => `${Math.round(b)} ${y}`);
  return `M${left[0]} L${left.slice(1).join(' L')} L${right.join(' L')} Z`;
}

function generate(name, view) {
  const rows = frameRows(name);
  const L = landmarks(rows);
  const cx = VB_W / 2;
  const [tL, tR] = L.torsoArmpit;
  const torsoLen = L.crotchY - L.shoulderY;

  // Arms: on each side, the outermost segment beyond the torso edge.
  const armPick = (side) => (row) => {
    const candidates = side === 'viewer-left'
      ? row.filter(([a, b]) => (a + b) / 2 < tL - 8)
      : row.filter(([a, b]) => (a + b) / 2 > tR + 8);
    if (!candidates.length) return null;
    // The whole limb on that side: spread fingers are separate segments, and
    // taking only the outermost one would cut the hand and misplace the wrist.
    return [candidates[0][0], candidates.at(-1)[1]];
  };
  // Legs: the segment nearest the centre line on each side, below the crotch.
  const legPick = (side) => (row) => {
    const candidates = side === 'viewer-left'
      ? row.filter(([a, b]) => (a + b) / 2 < cx && (a + b) / 2 > tL - 70)
      : row.filter(([a, b]) => (a + b) / 2 > cx && (a + b) / 2 < tR + 70);
    if (!candidates.length) return null;
    return side === 'viewer-left' ? candidates.at(-1) : candidates[0];
  };

  const armBottom = (side) => {
    // The arm is followed from where it has separated from the torso to the fingertips.
    let last = L.armpitY + 12;
    for (let y = L.armpitY + 12; y < L.bottom; y += 1) if (armPick(side)(rows[y])) last = y; else if (y - last > 12) break;
    return last;
  };
  const narrowest = (track, from, to) => {
    let best = null;
    for (const [y, a, b] of track) if (y >= from && y <= to && (!best || b - a < best[2] - best[1])) best = [y, a, b];
    return best?.[0] ?? Math.round((from + to) / 2);
  };

  const regions = [];
  const add = (id, d) => { if (d) regions.push({ id, d }); };
  const band = (track, from, to) => polygon(track.filter(([y]) => y >= from && y <= to));

  // Head and face.
  const headRows = trackLimb(rows, L.top, L.headBottom, (row) => segmentAt(row, cx));
  add('head', polygon(headRows));
  if (view === 'front') {
    const headW = Math.max(...headRows.map(([, a, b]) => b - a));
    const headH = L.headBottom - L.top;
    regions.push({ id: 'face', ellipse: { cx: Math.round(cx), cy: Math.round(L.top + headH * 0.56), rx: Math.round(headW * 0.34), ry: Math.round(headH * 0.36) } });
  }
  // Neck, clamped to the neck column.
  const neckHalf = L.neckW * 0.62;
  add('neck', polygon(trackLimb(rows, L.headBottom, L.shoulderY + 6, (row) => {
    const s = segmentAt(row, cx);
    return s ? [Math.max(s[0], cx - neckHalf), Math.min(s[1], cx + neckHalf)] : null;
  })));

  // Torso bands, clamped to the torso column so the shoulders stay separate.
  const torso = trackLimb(rows, L.shoulderY, L.crotchY + Math.round(torsoLen * 0.08), (row, y) => {
    const s = segmentAt(row, cx);
    if (!s) {
      // Below the crotch: span both leg tops, for the groin.
      const legs = row.filter(([a, b]) => (a + b) / 2 > tL - 70 && (a + b) / 2 < tR + 70);
      return legs.length ? [legs[0][0], legs.at(-1)[1]] : null;
    }
    return y < L.armpitY + 12 ? [Math.max(s[0], tL), Math.min(s[1], tR)] : [s[0], s[1]];
  });
  const at = (fraction) => Math.round(L.shoulderY + torsoLen * fraction);
  const pelvisTop = at(0.8);
  const pelvisBottom = L.crotchY + Math.round(torsoLen * 0.08);
  if (view === 'front') {
    add('chest', band(torso, L.shoulderY, at(0.42)));
    add('upper-abdomen', band(torso, at(0.42), at(0.63)));
    add('lower-abdomen', band(torso, at(0.63), pelvisTop));
  } else {
    add('upper-back', band(torso, L.shoulderY, at(0.46)));
    add('lower-back', band(torso, at(0.46), pelvisTop));
  }
  // Pelvis in the middle of the band; hips at its sides.
  const pelvisRows = torso.filter(([y]) => y >= pelvisTop && y <= pelvisBottom);
  const inner = pelvisRows.map(([y, a, b]) => [y, a + (b - a) * 0.24, b - (b - a) * 0.24]);
  if (view === 'front') add('pelvis', polygon(inner));
  const hipLeft = pelvisRows.map(([y, a, b]) => [y, a, a + (b - a) * (view === 'front' ? 0.26 : 0.5)]);
  const hipRight = pelvisRows.map(([y, a, b]) => [y, b - (b - a) * (view === 'front' ? 0.26 : 0.5), b]);

  // Patient-relative sides: front shows the patient's right on the viewer's left; back shows it on the viewer's right.
  const patient = (viewerSide) => (view === 'front') === (viewerSide === 'viewer-left') ? 'right' : 'left';

  add(`${patient('viewer-left')}-hip`, polygon(hipLeft));
  add(`${patient('viewer-right')}-hip`, polygon(hipRight));

  for (const side of ['viewer-left', 'viewer-right']) {
    const p = patient(side);
    const end = armBottom(side);
    const arm = trackLimb(rows, L.shoulderY, end, (row, y) => {
      if (y >= L.armpitY + 12) return armPick(side)(row);
      // Above the armpit the arm is joined to the torso: take the part beyond the torso edge.
      const outer = side === 'viewer-left' ? row[0] : row.at(-1);
      if (!outer) return null;
      return side === 'viewer-left' ? [outer[0], Math.min(outer[1], tL)] : [Math.max(outer[0], tR), outer[1]];
    });
    const armLen = end - L.shoulderY;
    // The deltoid cap: the top fifth of the arm, whether or not the arm has left the torso yet.
    const shoulderBottom = L.shoulderY + Math.round(armLen * 0.2);
    const wristY = narrowest(arm, L.shoulderY + Math.round(armLen * 0.68), L.shoulderY + Math.round(armLen * 0.9));
    // The elbow markers in the approved art sit at 0.59 to 0.62 of shoulder-to-wrist on every view.
    const elbowY = Math.round(L.shoulderY + (wristY - L.shoulderY) * 0.6);
    const elbowHalf = Math.round(armLen * 0.05);
    const wristHalf = Math.round(armLen * 0.03);
    add(`${p}-shoulder`, band(arm, L.shoulderY, shoulderBottom));
    add(`${p}-upper-arm`, band(arm, shoulderBottom, elbowY - elbowHalf));
    add(`${p}-elbow`, band(arm, elbowY - elbowHalf, elbowY + elbowHalf));
    add(`${p}-forearm`, band(arm, elbowY + elbowHalf, wristY - wristHalf));
    add(`${p}-wrist`, band(arm, wristY - wristHalf, wristY + wristHalf));
    add(`${p}-hand`, band(arm, wristY + wristHalf, end));

    const leg = trackLimb(rows, pelvisBottom, L.bottom, legPick(side));
    const legLen = L.bottom - pelvisBottom;
    const ankleY = narrowest(leg, pelvisBottom + Math.round(legLen * 0.8), pelvisBottom + Math.round(legLen * 0.93));
    // The kneecap markers in the approved art sit at about 0.4 of groin-to-ankle.
    const kneeY = Math.round(pelvisBottom + (ankleY - pelvisBottom) * 0.4);
    const kneeHalf = Math.round(legLen * 0.06);
    const ankleHalf = Math.round(legLen * 0.028);
    add(`${p}-thigh`, band(leg, pelvisBottom, kneeY - kneeHalf));
    add(`${p}-knee`, band(leg, kneeY - kneeHalf, kneeY + kneeHalf));
    add(`${p}-lower-leg`, band(leg, kneeY + kneeHalf, ankleY - ankleHalf));
    add(`${p}-ankle`, band(leg, ankleY - ankleHalf, ankleY + ankleHalf));
    add(`${p}-foot`, band(leg, ankleY + ankleHalf, L.bottom));
  }
  return { L, regions };
}

/* --- Layer alignment ---------------------------------------------------------- */
function alignment(reference, other) {
  const a = frameRows(reference);
  const b = frameRows(other);
  const deltas = [];
  for (let y = 300; y < 1450; y += 50) {
    const ta = segmentAt(a[y], VB_W / 2);
    const tb = segmentAt(b[y], VB_W / 2);
    if (ta && tb) deltas.push([Math.round((ta[0] + ta[1]) / 2 - (tb[0] + tb[1]) / 2), Math.round((ta[1] - ta[0]) - (tb[1] - tb[0]))]);
  }
  return deltas;
}

// Each layer is its own drawing: the systems and organ figures are proportioned
// differently from the hologram (arm spread, hand and foot position), so every
// layer gets its own registration rather than borrowing the hologram's.
const LAYERS = [['hologram', 'hologram'], ['systems', 'systems'], ['structures', 'organ']];
const out = {};
for (const variant of ['male', 'female']) {
  for (const view of ['front', 'back']) {
    for (const [layer, file] of LAYERS) {
      const name = `${variant} ${file} ${view}`;
      const result = generate(name, view);
      out[`${variant}-${view}-${layer}`] = result.regions;
      const { L } = result;
      console.log(`\n== ${variant} ${view} ${layer}: top ${L.top} headBottom ${L.headBottom} neck ${L.neckY} (w ${Math.round(L.neckW)}) shoulder ${L.shoulderY} armpit ${L.armpitY} crotch ${L.crotchY} bottom ${L.bottom} torso@armpit ${L.torsoArmpit.map(Math.round)}`);
      console.log(`   regions ${result.regions.length}: ${result.regions.map((r) => r.id).join(' ')}`);
      if (layer !== 'hologram') {
        const d = alignment(`${variant} hologram ${view}`, name);
        const worst = d.reduce((m, [dx, dw]) => Math.max(m, Math.abs(dx), Math.abs(dw) / 2), 0);
        console.log(`   torso centre/width vs hologram: worst ${worst}`);
      }
    }
  }
}

if (flag === '--write') {
  const shape = (region) => region.ellipse
    ? `el(${region.ellipse.cx}, ${region.ellipse.cy}, ${region.ellipse.rx}, ${region.ellipse.ry})`
    : `pa('${region.d}')`;
  const block = (key) => out[key].map((region) => `      { regionId: '${region.id}', shape: ${shape(region)} },`).join('\n');
  const layers = (variant, view) => LAYERS.map(([layer]) => `    ${layer}: [\n${block(`${variant}-${view}-${layer}`)}\n    ],`).join('\n');
  const text = `/**
 * GENERATED by scripts/audit/body-hitmap-generate.mjs from the measured
 * silhouettes of the approved artwork. Do not edit by hand: re-run the
 * silhouette audit and the generator instead.
 *
 * One registration per variant, view and layer, in the 1024x1536 frame the
 * stage renders every layer in. Patient-relative laterality: patient right is
 * on the viewer's left on the front view and on the viewer's right on the
 * back view.
 */
import type { BodyLayerId, BodyView } from '../../../body/index.ts';
import type { BodyVariantId, HitRegion, HitShape } from './hitmap-geometry.ts';

const el = (cx: number, cy: number, rx: number, ry: number): HitShape => ({ kind: 'ellipse', cx, cy, rx, ry });
const pa = (d: string): HitShape => ({ kind: 'path', d });

export const GENERATED_HIT_REGIONS: Record<BodyVariantId, Record<BodyView, Record<BodyLayerId, readonly HitRegion[]>>> = {
${['male', 'female'].map((variant) => `  ${variant}: {\n${['front', 'back'].map((view) => `   ${view}: {\n${layers(variant, view)}\n   },`).join('\n')}\n  },`).join('\n')}
};
`;
  writeFileSync('src/features/body-explorer/artwork/hitmap-regions.generated.ts', text);
  console.log('\nwrote src/features/body-explorer/artwork/hitmap-regions.generated.ts');
}
