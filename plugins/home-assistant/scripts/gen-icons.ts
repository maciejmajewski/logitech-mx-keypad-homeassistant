// Generates the static assets for the connection key:
//   package/actionicons/ha_connection.svg    key face shown before the live face arrives
//   package/actionsymbols/ha_connection.svg  monochrome symbol in the Options+ action picker
// both from the Home Assistant logomark (assets/, CC BY-NC-SA 4.0). The entity
// keys get theirs at plugin start (src/assets.ts); the plugin icon comes from
// scripts/gen-logo.ts. Run: node scripts/gen-icons.ts
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const icons = join(root, 'package', 'actionicons');
const symbols = join(root, 'package', 'actionsymbols');
mkdirSync(icons, { recursive: true });
mkdirSync(symbols, { recursive: true });

// The logomark's single path, from the monochrome SVG (viewBox 0 0 240 240).
const mono = readFileSync(join(root, 'assets', 'ha-logomark-mono.svg'), 'utf8');
const path = /<path d="([^"]+)"/.exec(mono)?.[1];
if (!path) throw new Error('assets/ha-logomark-mono.svg: no path found');

const face = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><g transform="translate(16 16) scale(0.2)"><path d="${path}" fill="#ffffff"/></g></svg>\n`;
const symbol = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><g transform="translate(2 2) scale(0.0833)"><path d="${path}" fill="#e3e3e3"/></g></svg>\n`;
writeFileSync(join(icons, 'ha_connection.svg'), face);
writeFileSync(join(symbols, 'ha_connection.svg'), symbol);
console.log('wrote ha_connection.svg icon and symbol');
