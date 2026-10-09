// Generates the static assets the Plugin Service needs on disk:
//   package/actionicons/<action>.svg    key face shown before the live face arrives
//   package/actionsymbols/<action>.svg  monochrome symbol in the Options+ action picker
//   package/metadata/Icon256x256.png    plugin icon (graphic inside a centred 192x192 area)
// Run: node scripts/gen-icons.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENTITY_SLOTS } from '../src/config.ts';
import { COLOUR } from '../src/faces.ts';
import { ICONS, type IconName } from '../src/icons.ts';
import { Canvas, type Rgb } from '../src/png.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'package');
const icons = join(root, 'actionicons');
const symbols = join(root, 'actionsymbols');
mkdirSync(icons, { recursive: true });
mkdirSync(symbols, { recursive: true });

type Spec = { name: string; glyph: string };
const specs: Spec[] = [
  ...Array.from({ length: ENTITY_SLOTS }, (_, i) => ({ name: `ha_entity_${i + 1}`, glyph: String(i + 1) })),
  { name: 'ha_connection', glyph: '⌂' },
];

// The house glyph as an SVG path of unit squares, for the static assets.
function pixelPath(rows: readonly string[], scale: number, ox: number, oy: number): string {
  const parts: string[] = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] === '#') parts.push(`M${ox + x * scale} ${oy + y * scale}h${scale}v${scale}h-${scale}z`);
    }
  });
  return parts.join('');
}

// Key face: the house in white with the slot number below.
function faceSvg({ glyph }: Spec): string {
  const house = pixelPath(ICONS.house, 2.5, 20, 6);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><path d="${house}" fill="#ffffff"/><text x="40" y="68" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="20" font-weight="bold" fill="#ffffff">${glyph}</text></svg>\n`;
}

// Picker symbol: single-colour, 24px viewBox like the SDK template.
function symbolSvg({ glyph }: Spec): string {
  const house = pixelPath(ICONS.house, 0.75, 6, 1);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${house}" fill="#e3e3e3"/><text x="12" y="22" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="8" font-weight="bold" fill="#e3e3e3">${glyph}</text></svg>\n`;
}

for (const spec of specs) {
  writeFileSync(join(icons, `${spec.name}.svg`), faceSvg(spec));
  writeFileSync(join(symbols, `${spec.name}.svg`), symbolSvg(spec));
}

// Plugin icon: a 3x3 grid of lit entity tiles.
const SIZE = 256;
const c = new Canvas(SIZE, SIZE);
const grid: [IconName, Rgb][] = [
  ['bulb', COLOUR.light],
  ['fan', COLOUR.fan],
  ['blinds', COLOUR.cover],
  ['power', COLOUR.on],
  ['house', COLOUR.dim],
  ['lock', COLOUR.on],
  ['play', COLOUR.media],
  ['thermometer', COLOUR.heat],
  ['sparkle', COLOUR.run],
];
const cell = 60;
grid.forEach(([icon, colour], i) => {
  const x = SIZE / 2 + ((i % 3) - 1) * 64 - cell / 2;
  const y = SIZE / 2 + (Math.floor(i / 3) - 1) * 64 - cell / 2;
  c.fillRoundedRect(x, y, cell, cell, 12, colour);
  const ink: Rgb = icon === 'house' ? COLOUR.white : COLOUR.ink;
  c.bitmap(ICONS[icon], x + (cell - 48) / 2, y + (cell - 48) / 2, 3, ink);
});
writeFileSync(join(root, 'metadata', 'Icon256x256.png'), c.toPng());

console.log(`wrote ${specs.length} action icons, ${specs.length} symbols and Icon256x256.png`);
