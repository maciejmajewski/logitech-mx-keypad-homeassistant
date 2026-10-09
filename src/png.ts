// Dependency-free RGBA canvas, 5x7 pixel font and PNG encoder.
// The encoder is adapted from herdr-logi-plugin (MIT, Niklas Berglund); see NOTICE.md.
import { deflateSync } from 'node:zlib';

export type Rgb = [number, number, number];

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

export class Canvas {
  readonly width: number;
  readonly height: number;
  readonly data: Buffer;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.data = Buffer.alloc(width * height * 4);
  }

  set(x: number, y: number, rgb: Rgb, alpha = 255) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const o = (y * this.width + x) * 4;
    this.data[o] = rgb[0];
    this.data[o + 1] = rgb[1];
    this.data[o + 2] = rgb[2];
    this.data[o + 3] = alpha;
  }

  fill(rgb: Rgb, alpha = 255) {
    for (let y = 0; y < this.height; y++) for (let x = 0; x < this.width; x++) this.set(x, y, rgb, alpha);
  }

  fillRect(x0: number, y0: number, w: number, h: number, rgb: Rgb) {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(x, y, rgb);
  }

  // Filled rounded rectangle; `radius` rounds the corners.
  fillRoundedRect(x0: number, y0: number, w: number, h: number, radius: number, rgb: Rgb) {
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        const cx = x < x0 + radius ? x0 + radius : x >= x0 + w - radius ? x0 + w - radius - 1 : x;
        const cy = y < y0 + radius ? y0 + radius : y >= y0 + h - radius ? y0 + h - radius - 1 : y;
        if (Math.hypot(x - cx, y - cy) <= radius) this.set(x, y, rgb);
      }
    }
  }

  // Circle outline (ring) or filled disc; `dots` > 0 draws a dotted ring.
  circle(cx: number, cy: number, r: number, rgb: Rgb, style: 'filled' | 'outline' | 'dotted', stroke = 6) {
    const DOTS = 10;
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        const d = Math.hypot(dx, dy);
        const onRing = Math.abs(d - r) <= stroke / 2;
        const phase = ((Math.atan2(dy, dx) / (2 * Math.PI)) * DOTS + DOTS) % 1;
        const inside = style === 'filled' ? d <= r : style === 'outline' ? onRing : onRing && phase < 0.5;
        if (inside) this.set(x, y, rgb);
      }
    }
  }

  // Draws `text` in the 5x7 font at integer `scale`, left-aligned at (x, y).
  // `gap` is the space between glyphs in pixels (default one scaled pixel).
  text(text: string, x: number, y: number, scale: number, rgb: Rgb, gap = scale) {
    let cx = x;
    for (const ch of text.toUpperCase()) {
      const glyph = FONT[ch] ?? FONT['?'];
      for (let row = 0; row < 7; row++) {
        for (let col = 0; col < 5; col++) {
          if (glyph[row][col] !== '#') continue;
          this.fillRect(cx + col * scale, y + row * scale, scale, scale, rgb);
        }
      }
      cx += 5 * scale + gap;
    }
  }

  // Draws `text` centred horizontally around `centerX`.
  textCentered(text: string, centerX: number, y: number, scale: number, rgb: Rgb, gap = scale) {
    const width = textWidth(text, scale, gap);
    this.text(text, Math.round(centerX - width / 2), y, scale, rgb, gap);
  }

  // Draws a bitmap (rows of '#' lit / '.' off, as in FONT) at integer `scale`,
  // top-left at (x, y).
  bitmap(rows: readonly string[], x: number, y: number, scale: number, rgb: Rgb) {
    rows.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) {
        if (row[c] === '#') this.fillRect(x + c * scale, y + r * scale, scale, scale, rgb);
      }
    });
  }

  // Draws an alpha mask (one byte per pixel, row-major, `size` wide and high)
  // in `rgb`, blending over whatever is already on the canvas.
  mask(alpha: Buffer, size: number, x0: number, y0: number, rgb: Rgb) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const a = alpha[y * size + x];
        if (a === 0) continue;
        const px = x0 + x;
        const py = y0 + y;
        if (px < 0 || py < 0 || px >= this.width || py >= this.height) continue;
        const o = (py * this.width + px) * 4;
        const under = this.data[o + 3];
        if (a === 255 || under === 0) {
          this.set(px, py, rgb, Math.max(a, under === 0 ? a : 255));
          continue;
        }
        const t = a / 255;
        this.data[o] = Math.round(rgb[0] * t + this.data[o] * (1 - t));
        this.data[o + 1] = Math.round(rgb[1] * t + this.data[o + 1] * (1 - t));
        this.data[o + 2] = Math.round(rgb[2] * t + this.data[o + 2] * (1 - t));
      }
    }
  }

  toPng(): Buffer {
    const stride = this.width * 4 + 1;
    const raw = Buffer.alloc(stride * this.height);
    for (let y = 0; y < this.height; y++) {
      // Filter byte 0 (None) then the row.
      this.data.copy(raw, y * stride + 1, y * this.width * 4, (y + 1) * this.width * 4);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(this.width, 0);
    ihdr.writeUInt32BE(this.height, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 6; // RGBA
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(raw)),
      chunk('IEND', Buffer.alloc(0)),
    ]);
  }
}

export function textWidth(text: string, scale: number, gap = scale): number {
  const n = Array.from(text).length;
  return n === 0 ? 0 : n * 5 * scale + (n - 1) * gap;
}

// 5x7 glyphs. Rows top to bottom, '#' is lit.
export const FONT: Record<string, string[]> = {
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['#####', '...#.', '..#..', '...#.', '....#', '#...#', '.###.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['###..', '#..#.', '#...#', '#...#', '#...#', '#..#.', '###..'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.####'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  ':': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.....'],
  '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  '>': ['#....', '.#...', '..#..', '...#.', '..#..', '.#...', '#....'],
  '<': ['....#', '...#.', '..#..', '.#...', '..#..', '...#.', '....#'],
  '^': ['..#..', '.#.#.', '#...#', '.....', '.....', '.....', '.....'],
  '#': ['.#.#.', '.#.#.', '#####', '.#.#.', '#####', '.#.#.', '.#.#.'],
  '%': ['##..#', '##.#.', '...#.', '..#..', '.#...', '.#.##', '#..##'],
};
