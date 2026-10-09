import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConnectionKey, createActions, EntityKey, Store, type Caller } from '../src/actions.ts';
import { ENTITY_SLOTS, normalizeConfig } from '../src/config.ts';
import { COLOUR } from '../src/faces.ts';
import { faceImage } from '../src/tiles.ts';

function fakeCaller() {
  const calls: unknown[][] = [];
  const caller: Caller = {
    callService: async (domain, service, entityId, data) => void calls.push([domain, service, entityId, data]),
    reconnect: () => void calls.push(['reconnect']),
  };
  return { caller, calls };
}

const config = normalizeConfig({ entities: [{ entity: 'light.k', label: 'Kitchen' }, 'scene.movie'] }, {});

test('an entity key shows its state and toggles on press', async () => {
  const store = new Store(config);
  const { caller, calls } = fakeCaller();
  store.caller = caller;
  const key = new EntityKey(store, 1, config.entities[0]);
  assert.equal(key.displayName, 'Entity 1: Kitchen');

  // Not connected yet: offline face, nothing sent.
  assert.equal(key.text(), 'HA offline');
  await key.onKeyDown();
  assert.deepEqual(calls, []);

  store.status = 'connected';
  store.setStates([
    { entity_id: 'light.k', state: 'on', attributes: { friendly_name: 'Kitchen light' } },
    { entity_id: 'light.other', state: 'on', attributes: {} },
  ]);
  assert.equal(store.state('light.other'), undefined, 'unconfigured entities are not kept');
  assert.equal(key.text(), 'Kitchen');
  assert.equal(key.image(), faceImage({ icon: 'bulb', mode: 'lit', colour: COLOUR.light, caption: '' }));
  await key.onKeyDown();
  assert.deepEqual(calls, [['light', 'toggle', 'light.k', {}]]);
  await new Promise((r) => setTimeout(r, 300)); // let the press flash end

  assert.equal(store.applyChange({ entity_id: 'light.k', old_state: null, new_state: { entity_id: 'light.k', state: 'off', attributes: {} } }), true);
  assert.equal(store.applyChange({ entity_id: 'light.other', old_state: null, new_state: null }), false);
  assert.equal(key.image(), faceImage({ icon: 'bulb', mode: 'dim', colour: COLOUR.dim, caption: '' }));
  assert.deepEqual(store.slotsFor('light.k'), [1]);
});

test('a stateless key flashes on press and asks for a repaint', async () => {
  const store = new Store(config);
  const { caller, calls } = fakeCaller();
  store.caller = caller;
  store.status = 'connected';
  store.setStates([{ entity_id: 'scene.movie', state: '2024-01-01T00:00:00+00:00', attributes: { friendly_name: 'Movie time' } }]);
  const repaints: string[] = [];
  store.repaint = (name) => void repaints.push(name);
  const key = new EntityKey(store, 2, config.entities[1]);
  assert.equal(key.text(), 'Movie time');
  const lit = key.image();
  await key.onKeyDown();
  assert.deepEqual(calls, [['scene', 'turn_on', 'scene.movie', {}]]);
  assert.notEqual(key.image(), lit, 'flashing right after the press');
  assert.deepEqual(repaints, ['ha_entity_2']);
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(key.image(), lit);
  assert.deepEqual(repaints, ['ha_entity_2', 'ha_entity_2']);
});

test('an empty slot has a blank label and does nothing', async () => {
  const store = new Store(config);
  const { caller, calls } = fakeCaller();
  store.caller = caller;
  store.status = 'connected';
  const key = new EntityKey(store, 5);
  assert.equal(key.displayName, 'Entity 5');
  assert.equal(key.text(), '​');
  await key.onKeyDown();
  assert.deepEqual(calls, []);
});

test('the connection key reflects the status and reconnects on press', () => {
  const store = new Store(config);
  const { caller, calls } = fakeCaller();
  const key = new ConnectionKey(store);
  assert.equal(key.text(), 'no config');
  key.onKeyDown();
  assert.deepEqual(calls, []);
  store.caller = caller;
  store.status = 'auth';
  assert.equal(key.text(), 'bad token');
  store.status = 'connected';
  store.haVersion = '2026.9.1';
  assert.equal(key.text(), 'HA 2026.9…');
  key.onKeyDown();
  assert.deepEqual(calls, [['reconnect']]);
});

test('createActions registers one key per slot plus the connection key', () => {
  const tiles = createActions(new Store(config));
  assert.equal(tiles.length, ENTITY_SLOTS + 1);
  assert.equal(tiles[0].name, 'ha_entity_1');
  assert.equal(tiles[ENTITY_SLOTS].name, 'ha_connection');
  const names = new Set(tiles.map((t) => t.name));
  assert.equal(names.size, tiles.length);
});
