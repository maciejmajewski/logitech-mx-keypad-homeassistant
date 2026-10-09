// Renders every glyph and face variant into one PNG sheet for a visual check.
// Run: node scripts/render-deck.ts [out.png]
import { writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { COLOUR, faceFor } from '../src/faces.ts';
import { ICON_NAMES } from '../src/icons.ts';
import { Canvas } from '../src/png.ts';
import { IMAGE_SIZE, iconPreview, renderConnection, renderFace } from '../src/tiles.ts';

const spec = (entity: string, icon?: string) => ({ entity, label: undefined, icon, service: undefined, data: undefined });
const state = (entity_id: string, state: string, attributes: Record<string, unknown> = {}) => ({ entity_id, state, attributes });

const faces: Buffer[] = [
  ...ICON_NAMES.map((icon) => iconPreview(icon, COLOUR.light)),
  renderFace(faceFor(spec('light.kitchen'), state('light.kitchen', 'on'), true)),
  renderFace(faceFor(spec('light.kitchen'), state('light.kitchen', 'off'), true)),
  renderFace(faceFor(spec('light.kitchen'), state('light.kitchen', 'unavailable'), true)),
  renderFace(faceFor(spec('light.kitchen'), undefined, true)),
  renderFace(faceFor(spec('light.kitchen'), undefined, false)),
  renderFace(faceFor(undefined, undefined, true)),
  renderFace(faceFor(spec('switch.desk'), state('switch.desk', 'on', { device_class: 'outlet' }), true)),
  renderFace(faceFor(spec('cover.blinds'), state('cover.blinds', 'open'), true)),
  renderFace(faceFor(spec('cover.blinds'), state('cover.blinds', 'closed'), true)),
  renderFace(faceFor(spec('lock.door'), state('lock.door', 'locked'), true)),
  renderFace(faceFor(spec('lock.door'), state('lock.door', 'unlocked'), true)),
  renderFace(faceFor(spec('climate.living'), state('climate.living', 'heat'), true)),
  renderFace(faceFor(spec('climate.living'), state('climate.living', 'cool'), true)),
  renderFace(faceFor(spec('media_player.tv'), state('media_player.tv', 'playing', { device_class: 'tv' }), true)),
  renderFace(faceFor(spec('scene.movie'), state('scene.movie', '2024-01-01'), true)),
  renderFace(faceFor(spec('scene.movie'), state('scene.movie', '2024-01-01'), true), true),
  renderFace(faceFor(spec('light.xmas', 'mdi:string-lights'), state('light.xmas', 'on'), true)),
  renderFace(faceFor(spec('fan.office'), state('fan.office', 'on'), true)),
  renderFace(faceFor(spec('vacuum.robo'), state('vacuum.robo', 'docked'), true)),
  renderConnection('connected', 'ONLINE'),
  renderConnection('auth', 'TOKEN'),
  renderConnection('connecting', 'WAIT'),
  renderConnection('offline', 'OFFLINE'),
];

// Decode our own PNGs (single IDAT, filter 0) back into pixels.
function decode(png: Buffer): Buffer {
  let o = 8;
  const idat: Buffer[] = [];
  while (o < png.length) {
    const len = png.readUInt32BE(o);
    const type = png.toString('ascii', o + 4, o + 8);
    if (type === 'IDAT') idat.push(png.subarray(o + 8, o + 8 + len));
    o += 12 + len;
  }
  return inflateSync(Buffer.concat(idat));
}

const cols = 8;
const cell = IMAGE_SIZE + 10;
const rows = Math.ceil(faces.length / cols);
const sheet = new Canvas(cols * cell + 10, rows * cell + 10);
sheet.fill([0, 0, 0]);
faces.forEach((png, i) => {
  const raw = decode(png);
  const stride = IMAGE_SIZE * 4 + 1;
  const ox = 10 + (i % cols) * cell;
  const oy = 10 + Math.floor(i / cols) * cell;
  for (let y = 0; y < IMAGE_SIZE; y++) {
    for (let x = 0; x < IMAGE_SIZE; x++) {
      const p = y * stride + 1 + x * 4;
      if (raw[p + 3] > 0) sheet.set(ox + x, oy + y, [raw[p], raw[p + 1], raw[p + 2]]);
    }
  }
});
const out = process.argv[2] ?? 'deck.png';
writeFileSync(out, sheet.toPng());
console.log(`wrote ${out}`);
