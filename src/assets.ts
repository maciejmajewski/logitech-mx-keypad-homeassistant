// Static SVG assets for the entity keys, written into the plugin package at
// startup so Options+ finds them by action name:
//   actionicons/<action>.svg    key face shown before the live face arrives
//   actionsymbols/<action>.svg  monochrome symbol next to the name in the action picker
// The connection key's files are generated at build time (scripts/gen-icons.ts).
import { mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { entityActionName } from './actions.ts';
import type { EntitySpec } from './config.ts';
import { ICONS, iconFor, pixelPath } from './icons.ts';

export function iconSvg(spec: EntitySpec): string {
  const path = pixelPath(ICONS[iconFor(spec.entity, {}, spec.icon)], 3, 16, 16);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><path d="${path}" fill="#ffffff"/></svg>\n`;
}

export function symbolSvg(spec: EntitySpec): string {
  const path = pixelPath(ICONS[iconFor(spec.entity, {}, spec.icon)], 1.25, 2, 2);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${path}" fill="#e3e3e3"/></svg>\n`;
}

// Writes one icon and one symbol per entity and removes those of entities no
// longer configured. Files that already have the right content are left alone.
export function writeActionAssets(packageDir: string, entities: EntitySpec[]): void {
  const dirs = { actionicons: iconSvg, actionsymbols: symbolSvg } as const;
  for (const [dir, render] of Object.entries(dirs)) {
    const folder = join(packageDir, dir);
    mkdirSync(folder, { recursive: true });
    const wanted = new Map(entities.map((spec) => [`${entityActionName(spec.entity)}.svg`, render(spec)]));
    for (const file of readdirSync(folder)) {
      if (file.startsWith('ha_') && file !== 'ha_connection.svg' && !wanted.has(file)) unlinkSync(join(folder, file));
    }
    for (const [file, content] of wanted) {
      const target = join(folder, file);
      let current = '';
      try {
        current = readFileSync(target, 'utf8');
      } catch {
        // new file
      }
      if (current !== content) writeFileSync(target, content);
    }
  }
}
