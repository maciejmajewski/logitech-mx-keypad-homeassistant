import assert from 'node:assert/strict';
import { mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { ConfigSource, EMPTY_CONFIG, keysChanged, MAX_ENTITIES, normalizeConfig, normalizeEntities } from '../src/config.ts';

test('entities accept objects and bare ids, drop malformed and duplicate ones, cap the count', () => {
  assert.deepEqual(normalizeEntities(undefined), []);
  const specs = normalizeEntities([
    { entity: 'Light.Kitchen', label: ' Kitchen ', icon: 'mdi:ceiling-light', service: 'light.turn_on', data: { brightness: 10 } },
    'switch.desk',
    { entity: 'not an id' },
    { entity: 'light.x', service: 'bogus' },
    { label: 'no entity' },
    42,
    null,
    { entity: 'light.kitchen', label: 'Duplicate' },
  ]);
  assert.deepEqual(specs, [
    { entity: 'light.kitchen', label: 'Kitchen', icon: 'mdi:ceiling-light', service: 'light.turn_on', data: { brightness: 10 } },
    { entity: 'switch.desk', label: undefined, icon: undefined, service: undefined, data: undefined },
    { entity: 'light.x', label: undefined, icon: undefined, service: undefined, data: undefined },
  ]);
  assert.equal(normalizeEntities(Array.from({ length: 100 }, (_, i) => `light.l${i}`)).length, MAX_ENTITIES);
});

test('connection settings come from the file, then the environment', () => {
  const fromFile = normalizeConfig({ url: 'https://ha.example/', token: 'abc', reconnectMs: 100 }, {});
  assert.equal(fromFile.url, 'https://ha.example/');
  assert.equal(fromFile.token, 'abc');
  assert.equal(fromFile.reconnectMs, 3000, 'too small a reconnect falls back to the default');
  const fromEnv = normalizeConfig({}, { HOME_ASSISTANT_URL: 'http://env:8123', HOME_ASSISTANT_TOKEN: 'env-token' });
  assert.equal(fromEnv.url, 'http://env:8123');
  assert.equal(fromEnv.token, 'env-token');
  assert.equal(normalizeConfig({ reconnectMs: 5000 }, {}).reconnectMs, 5000);
  assert.equal(normalizeConfig({ token: 'PASTE_YOUR_LONG_LIVED_ACCESS_TOKEN_HERE' }, {}).token, undefined, 'the placeholder is not a token');
});

test('tokenFile is read when no token is given', () => {
  const dir = mkdtempSync(join(tmpdir(), 'home-assistant-'));
  const file = join(dir, 'token');
  writeFileSync(file, 'file-token\n');
  assert.equal(normalizeConfig({ tokenFile: file }, {}).token, 'file-token');
  assert.equal(normalizeConfig({ token: 'inline', tokenFile: file }, {}).token, 'inline');
  assert.equal(normalizeConfig({ tokenFile: join(dir, 'missing') }, {}).token, undefined);
});

test('ConfigSource rereads the file only when it changes and reports changes after the first load', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'home-assistant-')), 'config.json');
  const changes: string[][] = [];
  const source = new ConfigSource(path, (next) => void changes.push(next.entities.map((e) => e.entity)));
  assert.deepEqual(source.current(), EMPTY_CONFIG, 'no file: empty');
  writeFileSync(path, JSON.stringify({ entities: ['light.a'] }));
  utimesSync(path, new Date(1_700_000_000_000), new Date(1_700_000_000_000));
  assert.deepEqual(source.current().entities.map((e) => e.entity), ['light.a']);
  writeFileSync(path, JSON.stringify({ entities: ['light.b'] }));
  utimesSync(path, new Date(1_700_000_000_000), new Date(1_700_000_000_000)); // same mtime: cached
  assert.deepEqual(source.current().entities.map((e) => e.entity), ['light.a']);
  utimesSync(path, new Date(1_700_000_001_000), new Date(1_700_000_001_000));
  assert.deepEqual(source.current().entities.map((e) => e.entity), ['light.b']);
  assert.deepEqual(changes, [['light.a'], ['light.b']]);
});

test('the key set changes when an entity is added, removed or relabelled, not when reordered', () => {
  const a = normalizeConfig({ entities: [{ entity: 'light.a', label: 'A' }, 'light.b'] }, {});
  assert.equal(keysChanged(a, normalizeConfig({ entities: [{ entity: 'light.a', label: 'A' }, 'light.b'], token: 'x' }, {})), false);
  assert.equal(keysChanged(a, normalizeConfig({ entities: ['light.b', { entity: 'light.a', label: 'A' }] }, {})), false, 'reordered');
  assert.equal(keysChanged(a, normalizeConfig({ entities: [{ entity: 'light.a', label: 'B' }, 'light.b'] }, {})), true, 'relabelled');
  assert.equal(keysChanged(a, normalizeConfig({ entities: [{ entity: 'light.a', label: 'A' }] }, {})), true, 'removed');
  assert.equal(keysChanged(a, normalizeConfig({ entities: [{ entity: 'light.a', label: 'A' }, 'light.b', 'light.c'] }, {})), true, 'added');
});
