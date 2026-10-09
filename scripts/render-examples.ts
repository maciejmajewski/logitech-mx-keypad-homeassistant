// Renders docs/examples.png: the key faces of the README's example config,
// each with its label underneath as Options+ draws it.
// Run: node scripts/render-examples.ts
import { writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { normalizeEntities } from '../src/config.ts';
import { faceFor, labelFor } from '../src/faces.ts';
import type { EntityState } from '../src/ha.ts';
import { Canvas } from '../src/png.ts';
import { IMAGE_SIZE, labelText, renderConnection, renderFace } from '../src/tiles.ts';

const entities = normalizeEntities([
  { entity: 'light.the_office_c1', label: 'Office C1' },
  { entity: 'light.xmas_the_office_olas_desk', label: 'Xmas desk', icon: 'mdi:string-lights' },
  'switch.desk_outlet',
  { entity: 'cover.office_blinds', label: 'Blinds' },
  { entity: 'lock.front_door', label: 'Front door' },
  { entity: 'climate.living_room', label: 'Living' },
  { entity: 'media_player.tv', label: 'TV' },
  { entity: 'scene.movie_night', label: 'Movie' },
  { entity: 'light.desk', label: 'Desk 40%', service: 'light.turn_on', data: { brightness_pct: 40 } },
]);
const states: Record<string, EntityState> = {
  'light.the_office_c1': { entity_id: 'light.the_office_c1', state: 'on', attributes: {} },
  'light.xmas_the_office_olas_desk': { entity_id: 'light.xmas_the_office_olas_desk', state: 'off', attributes: {} },
  'switch.desk_outlet': { entity_id: 'switch.desk_outlet', state: 'on', attributes: { device_class: 'outlet', friendly_name: 'Desk outlet' } },
  'cover.office_blinds': { entity_id: 'cover.office_blinds', state: 'open', attributes: {} },
  'lock.front_door': { entity_id: 'lock.front_door', state: 'unlocked', attributes: {} },
  'climate.living_room': { entity_id: 'climate.living_room', state: 'heat', attributes: {} },
  'media_player.tv': { entity_id: 'media_player.tv', state: 'playing', attributes: { device_class: 'tv' } },
  'scene.movie_night': { entity_id: 'scene.movie_night', state: '2026-10-09T18:00:00+00:00', attributes: {} },
  'light.desk': { entity_id: 'light.desk', state: 'on', attributes: {} },
};

const faces: { png: Buffer; label: string }[] = entities.map((spec) => ({
  png: renderFace(faceFor(spec, states[spec.entity], true)),
  label: labelText(labelFor(spec, states[spec.entity])),
}));
faces.push({ png: renderConnection('connected', 'ONLINE'), label: 'HA 2026.8' });

function decode(png: Buffer): Buffer {
  let o = 8;
  const idat: Buffer[] = [];
  while (o < png.length) {
    const len = png.readUInt32BE(o);
    if (png.toString('ascii', o + 4, o + 8) === 'IDAT') idat.push(png.subarray(o + 8, o + 8 + len));
    o += 12 + len;
  }
  return inflateSync(Buffer.concat(idat));
}

// Mimic a key as Options+ draws it: a rounded grey square with the face inset
// at the top and the label inside the square underneath. The face is kept at
// its native 80 px so the one-pixel captions stay legible.
const cols = 5;
const key = 118;
const faceSize = IMAGE_SIZE;
const gap = 12;
const rows = Math.ceil(faces.length / cols);
const sheet = new Canvas(cols * (key + gap) + gap, rows * (key + gap) + gap);
sheet.fill([24, 24, 28]);
faces.forEach(({ png, label }, i) => {
  const raw = decode(png);
  const stride = IMAGE_SIZE * 4 + 1;
  const kx = gap + (i % cols) * (key + gap);
  const ky = gap + Math.floor(i / cols) * (key + gap);
  sheet.fillRoundedRect(kx, ky, key, key, 10, [44, 44, 50]);
  const fx = kx + (key - faceSize) / 2;
  const fy = ky + 8;
  for (let y = 0; y < faceSize; y++) {
    for (let x = 0; x < faceSize; x++) {
      const p = y * stride + 1 + x * 4;
      if (raw[p + 3] > 0) sheet.set(fx + x, fy + y, [raw[p], raw[p + 1], raw[p + 2]]);
    }
  }
  sheet.textCentered(label.replace('…', '.'), kx + key / 2, ky + key - 19, 1, [225, 225, 230]);
});
const out = process.argv[2] ?? 'docs/examples.png';
writeFileSync(out, sheet.toPng());
console.log(`wrote ${out}`);
