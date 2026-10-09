import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { iconSvg, symbolSvg, writeActionAssets } from '../src/assets.ts';
import { normalizeEntities } from '../src/config.ts';

test('entity icons and symbols are written per action name, stale ones removed, the connection key kept', () => {
  const dir = mkdtempSync(join(tmpdir(), 'home-assistant-assets-'));
  mkdirSync(join(dir, 'actionicons'));
  writeFileSync(join(dir, 'actionicons', 'ha_connection.svg'), '<svg/>');
  writeFileSync(join(dir, 'actionicons', 'ha_light__gone.svg'), '<svg/>');
  writeFileSync(join(dir, 'actionicons', 'unrelated.svg'), '<svg/>');
  const entities = normalizeEntities(['light.k', { entity: 'switch.s', icon: 'mdi:fan' }]);
  writeActionAssets(dir, entities);
  assert.deepEqual(readdirSync(join(dir, 'actionicons')).sort(), ['ha_connection.svg', 'ha_light__k.svg', 'ha_switch__s.svg', 'unrelated.svg']);
  assert.deepEqual(readdirSync(join(dir, 'actionsymbols')).sort(), ['ha_light__k.svg', 'ha_switch__s.svg']);
  assert.equal(readFileSync(join(dir, 'actionicons', 'ha_light__k.svg'), 'utf8'), iconSvg(entities[0]));
  assert.equal(readFileSync(join(dir, 'actionsymbols', 'ha_switch__s.svg'), 'utf8'), symbolSvg(entities[1]));
  assert.match(iconSvg(entities[0]), /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 80 80"><path d="M/);
  assert.notEqual(symbolSvg(entities[0]), symbolSvg(entities[1]), 'the icon override changes the symbol');
  // Idempotent: a second run leaves everything as it is.
  writeActionAssets(dir, entities);
  assert.deepEqual(readdirSync(join(dir, 'actionsymbols')).sort(), ['ha_light__k.svg', 'ha_switch__s.svg']);
});
