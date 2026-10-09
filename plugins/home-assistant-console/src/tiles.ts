// Renders the 80x80 key faces. Options+ insets a Node plugin's image inside the
// 90x90 key and writes the action text underneath, so the image carries the
// glyph, the state colour and a short caption, and the text carries the name.
import { COLOUR, type Face } from './faces.ts';
import { ICON_SIZE, ICONS, type IconName } from './icons.ts';
import { Canvas, textWidth, type Rgb } from './png.ts';

export const IMAGE_SIZE = 80;
const MAX_LABEL_CHARS = 10;
const SCALE = 3; // 16 px glyph -> 48 px

const cache = new Map<string, string>();

function cached(key: string, render: () => Buffer): string {
  let image = cache.get(key);
  if (!image) {
    image = render().toString('base64');
    cache.set(key, image);
  }
  return image;
}

export function faceImage(face: Face, flash = false): string {
  return cached(`face|${face.icon}|${face.mode}|${face.colour.join(',')}|${face.caption}|${flash ? 1 : 0}`, () => renderFace(face, flash));
}

// Rounded square in the state colour with the glyph on it and, when the
// state has a word, a one-line caption underneath. `flash` is the brief
// white-out after a press on a stateless key.
export function renderFace(face: Face, flash = false): Buffer {
  const c = new Canvas(IMAGE_SIZE, IMAGE_SIZE);
  const inset = 2;
  const inner = IMAGE_SIZE - 2 * inset;
  let background: Rgb = face.colour;
  let ink: Rgb = COLOUR.ink;
  switch (face.mode) {
    case 'lit':
      ink = COLOUR.ink;
      break;
    case 'dim':
      ink = COLOUR.dimInk;
      break;
    case 'unavailable':
    case 'missing':
      ink = COLOUR.unavailableInk;
      break;
    case 'offline':
      background = COLOUR.dim;
      ink = [110, 110, 116];
      break;
    case 'unset':
      background = [36, 36, 40];
      ink = [80, 80, 86];
      break;
  }
  if (flash) {
    background = COLOUR.white;
    ink = COLOUR.ink;
  }
  c.fillRoundedRect(inset, inset, inner, inner, 14, background);
  if (face.mode === 'unset') {
    // Dotted frame marks an empty slot, as the reference plugin does.
    for (let i = 8; i < IMAGE_SIZE - 8; i += 6) {
      c.fillRect(i, 6, 3, 2, ink);
      c.fillRect(i, IMAGE_SIZE - 8, 3, 2, ink);
      c.fillRect(6, i, 2, 3, ink);
      c.fillRect(IMAGE_SIZE - 8, i, 2, 3, ink);
    }
  }
  const glyphSize = ICON_SIZE * SCALE;
  const captionHeight = face.caption ? 7 + 6 : 0;
  // Centre the glyph in the space above the caption.
  const top = Math.round((IMAGE_SIZE - captionHeight - glyphSize) / 2);
  c.bitmap(ICONS[face.icon], (IMAGE_SIZE - glyphSize) / 2, top, SCALE, ink);
  if (face.caption) {
    const [scale, gap] = textWidth(face.caption, 1) <= inner - 8 ? [1, 1] : [1, 0];
    c.textCentered(face.caption.slice(0, 12), IMAGE_SIZE / 2, IMAGE_SIZE - 8 - 7, scale, ink, gap);
  }
  return c.toPng();
}

// Connection key: the house glyph, green when subscribed, red when the token
// is rejected, grey while connecting or down.
export type ConnectionStatus = 'connected' | 'connecting' | 'offline' | 'auth' | 'unconfigured';

export function renderConnection(status: ConnectionStatus, caption: string): Buffer {
  const c = new Canvas(IMAGE_SIZE, IMAGE_SIZE);
  const inset = 2;
  const inner = IMAGE_SIZE - 2 * inset;
  const background: Rgb =
    status === 'connected' ? COLOUR.on : status === 'auth' ? COLOUR.alert : status === 'connecting' ? [84, 96, 120] : COLOUR.dim;
  const ink: Rgb = status === 'connected' ? COLOUR.ink : status === 'offline' || status === 'unconfigured' ? COLOUR.dimInk : COLOUR.white;
  c.fillRoundedRect(inset, inset, inner, inner, 14, background);
  c.bitmap(ICONS.house, (IMAGE_SIZE - ICON_SIZE * SCALE) / 2, 8, SCALE, ink);
  if (caption) c.textCentered(caption.slice(0, 12), IMAGE_SIZE / 2, IMAGE_SIZE - 15, 1, ink, 1);
  return c.toPng();
}

export function connectionImage(status: ConnectionStatus, caption: string): string {
  return cached(`conn|${status}|${caption}`, () => renderConnection(status, caption));
}

export function iconPreview(icon: IconName, colour: Rgb): Buffer {
  return renderFace({ icon, mode: 'lit', colour, caption: '' });
}

// The Plugin Service falls back to the action's display name when the text is
// empty or whitespace; a zero-width space gives a genuinely blank label.
export const BLANK = '​';

export function labelText(text: string): string {
  if (!text) return BLANK;
  const chars = Array.from(text);
  return chars.length > MAX_LABEL_CHARS ? chars.slice(0, MAX_LABEL_CHARS - 1).join('') + '…' : text;
}
