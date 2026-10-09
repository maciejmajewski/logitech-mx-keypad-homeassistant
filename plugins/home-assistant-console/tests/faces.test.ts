import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COLOUR, captionFor, faceFor, isOn, labelFor, serviceFor } from '../src/faces.ts';
import { iconFor, iconForMdi } from '../src/icons.ts';

const spec = (entity: string, extra: Partial<{ label: string; icon: string; service: string; data: Record<string, unknown> }> = {}) => ({
  entity,
  label: extra.label,
  icon: extra.icon,
  service: extra.service,
  data: extra.data,
});
const state = (entity_id: string, s: string, attributes: Record<string, unknown> = {}) => ({ entity_id, state: s, attributes });

test('icons follow the domain, then device class, then the mdi icon attribute, then the override', () => {
  assert.equal(iconFor('light.kitchen'), 'bulb');
  assert.equal(iconFor('switch.desk'), 'power');
  assert.equal(iconFor('switch.desk', { device_class: 'outlet' }), 'outlet');
  assert.equal(iconFor('switch.desk', { device_class: 'outlet', icon: 'mdi:fan' }), 'fan');
  assert.equal(iconFor('switch.desk', { icon: 'mdi:fan' }, 'lock'), 'lock');
  assert.equal(iconFor('switch.desk', {}, 'mdi:string-lights'), 'lights');
  assert.equal(iconFor('switch.desk', {}, 'mdi:no-such-icon'), 'power', 'unknown override falls through');
  assert.equal(iconFor('cover.garage', { device_class: 'garage' }), 'garage');
  assert.equal(iconFor('media_player.tv', { device_class: 'tv' }), 'tv');
  assert.equal(iconFor('lock.front'), 'lock');
  assert.equal(iconFor('scene.movie'), 'sparkle');
  assert.equal(iconFor('weird.thing'), 'question');
});

test('mdi names map by prefix', () => {
  assert.equal(iconForMdi('mdi:lightbulb-outline'), 'bulb');
  assert.equal(iconForMdi('mdi:lock-open-variant'), 'unlock');
  assert.equal(iconForMdi('mdi:lock'), 'lock');
  assert.equal(iconForMdi('mdi:robot-vacuum'), 'vacuum');
  assert.equal(iconForMdi('mdi:robot'), 'robot');
  assert.equal(iconForMdi('mdi:power-socket-eu'), 'outlet');
  assert.equal(iconForMdi('mdi:power'), 'power');
  assert.equal(iconForMdi(undefined), undefined);
  assert.equal(iconForMdi('mdi:xyz'), undefined);
});

test('on-ness and captions per domain', () => {
  assert.equal(isOn('light', 'on'), true);
  assert.equal(isOn('light', 'off'), false);
  assert.equal(isOn('cover', 'open'), true);
  assert.equal(isOn('lock', 'locked'), true);
  assert.equal(isOn('lock', 'unlocked'), false);
  assert.equal(isOn('climate', 'heat'), true);
  assert.equal(isOn('media_player', 'idle'), false);
  assert.equal(captionFor('cover', 'open'), 'OPEN');
  assert.equal(captionFor('light', 'on'), '');
  assert.equal(captionFor('climate', 'heat_cool'), 'AUTO');
});

test('faces: lit and dim, colours per domain, unavailable, missing, offline, unset', () => {
  const on = faceFor(spec('light.k'), state('light.k', 'on'), true);
  assert.deepEqual(on, { icon: 'bulb', mode: 'lit', colour: COLOUR.light, caption: '' });
  const off = faceFor(spec('light.k'), state('light.k', 'off'), true);
  assert.equal(off.mode, 'dim');
  assert.equal(faceFor(spec('fan.f'), state('fan.f', 'on'), true).colour, COLOUR.fan);
  assert.equal(faceFor(spec('climate.c'), state('climate.c', 'cool'), true).colour, COLOUR.cool);
  assert.equal(faceFor(spec('climate.c'), state('climate.c', 'heat'), true).colour, COLOUR.heat);
  assert.deepEqual(faceFor(spec('cover.b'), state('cover.b', 'closed'), true), { icon: 'blinds', mode: 'dim', colour: COLOUR.dim, caption: 'CLOSED' });
  const unlocked = faceFor(spec('lock.d'), state('lock.d', 'unlocked'), true);
  assert.equal(unlocked.icon, 'unlock');
  assert.equal(unlocked.colour, COLOUR.alert);
  assert.equal(faceFor(spec('lock.d'), state('lock.d', 'locked'), true).icon, 'lock');
  assert.equal(faceFor(spec('scene.s'), state('scene.s', '2024-01-01T00:00:00'), true).mode, 'lit', 'stateless keys stay lit');
  assert.equal(faceFor(spec('light.k'), state('light.k', 'unavailable'), true).mode, 'unavailable');
  assert.equal(faceFor(spec('light.k'), state('light.k', 'unknown'), true).caption, 'UNKNOWN');
  assert.equal(faceFor(spec('light.k'), undefined, true).mode, 'missing');
  const offline = faceFor(spec('light.k'), state('light.k', 'on'), false);
  assert.equal(offline.mode, 'offline');
  assert.equal(offline.icon, 'bulb', 'offline keeps the glyph so the key is still recognisable');
  assert.equal(faceFor(undefined, undefined, true).mode, 'unset');
});

test('labels: config, then friendly_name, then the object id', () => {
  assert.equal(labelFor(spec('light.the_office_c1', { label: 'C1' }), state('light.the_office_c1', 'on', { friendly_name: 'Office C1' })), 'C1');
  assert.equal(labelFor(spec('light.the_office_c1'), state('light.the_office_c1', 'on', { friendly_name: 'Office C1' })), 'Office C1');
  assert.equal(labelFor(spec('light.the_office_c1'), undefined), 'the office c1');
  assert.equal(labelFor(undefined, undefined), '');
});

test('service per domain, lock by state, override from config', () => {
  assert.deepEqual(serviceFor(spec('light.k'), undefined), { domain: 'light', service: 'toggle', data: {} });
  assert.deepEqual(serviceFor(spec('sensor.odd'), undefined), { domain: 'homeassistant', service: 'toggle', data: {} });
  assert.deepEqual(serviceFor(spec('scene.s'), undefined), { domain: 'scene', service: 'turn_on', data: {} });
  assert.deepEqual(serviceFor(spec('script.s'), undefined), { domain: 'script', service: 'turn_on', data: {} });
  assert.deepEqual(serviceFor(spec('button.b'), undefined), { domain: 'button', service: 'press', data: {} });
  assert.deepEqual(serviceFor(spec('automation.a'), undefined), { domain: 'automation', service: 'trigger', data: {} });
  assert.equal(serviceFor(spec('lock.d'), state('lock.d', 'locked')).service, 'unlock');
  assert.equal(serviceFor(spec('lock.d'), state('lock.d', 'unlocked')).service, 'lock');
  assert.equal(serviceFor(spec('lock.d'), undefined).service, 'lock');
  assert.deepEqual(serviceFor(spec('light.k', { service: 'light.turn_on', data: { brightness_pct: 40 } }), undefined), {
    domain: 'light',
    service: 'turn_on',
    data: { brightness_pct: 40 },
  });
});
