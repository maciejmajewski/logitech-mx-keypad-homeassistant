import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inflateSync } from 'node:zlib';
import { COLOUR } from '../src/faces.ts';
import { ICON_NAMES, ICON_SIZE, ICONS } from '../src/icons.ts';
import { Canvas, textWidth } from '../src/png.ts';
import { faceImage, IMAGE_SIZE, labelText, renderFace } from '../src/tiles.ts';

function chunks(png: Buffer) {
  const out: { type: string; data: Buffer }[] = [];
  let o = 8;
  while (o < png.length) {
    const len = png.readUInt32BE(o);
    out.push({ type: png.toString('ascii', o + 4, o + 8), data: png.subarray(o + 8, o + 8 + len) });
    o += 12 + len;
  }
  return out;
}

const lit = { icon: 'bulb' as const, mode: 'lit' as const, colour: COLOUR.light, caption: '' };

test('encodes a well-formed RGBA PNG of the requested size', () => {
  const png = renderFace(lit);
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const [ihdr, idat, iend] = chunks(png);
  assert.equal(ihdr.type, 'IHDR');
  assert.equal(ihdr.data.readUInt32BE(0), IMAGE_SIZE);
  assert.equal(ihdr.data.readUInt32BE(4), IMAGE_SIZE);
  assert.equal(ihdr.data[9], 6, 'colour type RGBA');
  assert.equal(idat.type, 'IDAT');
  assert.equal(inflateSync(idat.data).length, (IMAGE_SIZE * 4 + 1) * IMAGE_SIZE);
  assert.equal(iend.type, 'IEND');
});

test('a face has an opaque centre and transparent corners', () => {
  const png = renderFace(lit);
  const raw = inflateSync(chunks(png)[1].data);
  const stride = IMAGE_SIZE * 4 + 1;
  const alphaAt = (x: number, y: number) => raw[y * stride + 1 + x * 4 + 3];
  assert.equal(alphaAt(0, 0), 0);
  assert.equal(alphaAt(IMAGE_SIZE / 2, IMAGE_SIZE / 2), 255);
});

test('every glyph is a 16x16 bitmap', () => {
  for (const name of ICON_NAMES) {
    const rows = ICONS[name];
    assert.equal(rows.length, ICON_SIZE, `${name} has ${rows.length} rows`);
    for (const row of rows) assert.equal(row.length, ICON_SIZE, `${name} row '${row}'`);
    assert.ok(rows.some((r) => r.includes('#')), `${name} is blank`);
  }
});

test('bitmaps are drawn scaled', () => {
  const c = new Canvas(12, 12);
  c.bitmap(['#.', '.#'], 0, 0, 3, [255, 255, 255]);
  const alpha = (x: number, y: number) => c.data[(y * 12 + x) * 4 + 3];
  assert.equal(alpha(0, 0), 255);
  assert.equal(alpha(2, 2), 255);
  assert.equal(alpha(3, 0), 0);
  assert.equal(alpha(3, 3), 255);
  assert.equal(alpha(5, 5), 255);
  assert.equal(alpha(6, 6), 0);
  assert.equal(textWidth('ABC', 2), (3 * 6 - 1) * 2);
});

test('faces are cached per glyph, mode, colour, caption and flash', () => {
  assert.equal(faceImage(lit), faceImage({ ...lit }));
  assert.notEqual(faceImage(lit), faceImage({ ...lit, mode: 'dim', colour: COLOUR.dim }));
  assert.notEqual(faceImage(lit), faceImage({ ...lit, caption: 'OPEN' }));
  assert.notEqual(faceImage(lit), faceImage(lit, true));
});

test('labels are truncated and blank labels become a zero-width space', () => {
  assert.equal(labelText(''), '​');
  assert.equal(labelText('short'), 'short');
  assert.equal(labelText('a-very-long-entity-name'), 'a-very-lo…');
});
