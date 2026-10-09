// From an entity's state to what its key should show: which glyph, which
// colour, whether it reads as "on", and a short caption for states that are
// not simply on or off (cover OPEN, climate HEAT, lock LOCKED...).
import type { EntitySpec } from './config.ts';
import type { EntityState } from './ha.ts';
import { domainOf, iconFor, type IconName } from './icons.ts';
import type { Rgb } from './png.ts';

export type Mode =
  | 'lit' // on, open, playing, heating: coloured background
  | 'dim' // off, closed, idle: dark background
  | 'unavailable' // entity exists but reports unavailable / unknown
  | 'missing' // configured, but Home Assistant has no such entity
  | 'offline' // not connected to Home Assistant
  | 'unset'; // no entity configured in this slot

export type Face = {
  icon: IconName;
  mode: Mode;
  colour: Rgb;
  caption: string;
};

export const COLOUR = {
  light: [240, 184, 64] as Rgb, // warm amber
  on: [79, 169, 117] as Rgb, // green
  fan: [90, 160, 220] as Rgb, // sky blue
  cover: [38, 166, 154] as Rgb, // teal
  media: [160, 90, 210] as Rgb, // purple
  heat: [226, 120, 55] as Rgb, // orange
  cool: [90, 160, 220] as Rgb,
  alert: [218, 61, 41] as Rgb, // red
  run: [38, 166, 154] as Rgb, // stateless keys: scene, script, button
  dim: [52, 52, 58] as Rgb,
  dimInk: [150, 150, 156] as Rgb,
  unavailable: [70, 36, 36] as Rgb,
  unavailableInk: [190, 90, 90] as Rgb,
  ink: [20, 20, 24] as Rgb,
  white: [255, 255, 255] as Rgb,
};

// States Home Assistant uses for "active" per domain. Anything else is off.
const ON_STATES = new Set([
  'on', 'open', 'opening', 'closing', 'playing', 'paused', 'buffering', 'cleaning', 'returning',
  'heat', 'cool', 'heat_cool', 'auto', 'dry', 'fan_only', 'streaming', 'recording',
  'armed_home', 'armed_away', 'armed_night', 'armed_vacation', 'armed_custom_bypass', 'triggered', 'arming', 'pending',
  'eco', 'electric', 'performance', 'high_demand', 'heat_pump', 'gas',
]);

// Domains whose press runs something rather than toggling a state. Their keys
// stay lit so they read as pressable.
const STATELESS = new Set(['scene', 'script', 'button', 'input_button']);

export function isOn(domain: string, state: string): boolean {
  if (domain === 'lock') return state === 'locked' || state === 'locking';
  return ON_STATES.has(state);
}

function colourFor(domain: string, state: string, icon: IconName): Rgb {
  switch (domain) {
    case 'light':
      return COLOUR.light;
    case 'fan':
      return COLOUR.fan;
    case 'cover':
      return COLOUR.cover;
    case 'media_player':
      return COLOUR.media;
    case 'climate':
      return state === 'cool' ? COLOUR.cool : state === 'heat' ? COLOUR.heat : COLOUR.on;
    case 'water_heater':
      return COLOUR.heat;
    case 'lock':
      return COLOUR.on;
    case 'siren':
    case 'alarm_control_panel':
      return state === 'triggered' ? COLOUR.alert : COLOUR.on;
    case 'humidifier':
    case 'valve':
      return COLOUR.cool;
    case 'camera':
      return COLOUR.alert;
    case 'vacuum':
      return COLOUR.fan;
    default:
      return STATELESS.has(domain) ? COLOUR.run : icon === 'bulb' || icon === 'lamp' || icon === 'lights' || icon === 'strip' ? COLOUR.light : COLOUR.on;
  }
}

const CAPTION: Record<string, Record<string, string>> = {
  cover: { open: 'OPEN', opening: 'OPENING', closed: 'CLOSED', closing: 'CLOSING' },
  lock: { locked: 'LOCKED', unlocked: 'UNLOCKED', locking: 'LOCKING', unlocking: 'OPENING', jammed: 'JAMMED', open: 'OPEN' },
  climate: { heat: 'HEAT', cool: 'COOL', heat_cool: 'AUTO', auto: 'AUTO', dry: 'DRY', fan_only: 'FAN', off: 'OFF' },
  media_player: { playing: 'PLAYING', paused: 'PAUSED', idle: 'IDLE', standby: 'STANDBY', off: 'OFF', on: 'ON', buffering: 'LOADING' },
  vacuum: { cleaning: 'CLEANING', docked: 'DOCKED', idle: 'IDLE', paused: 'PAUSED', returning: 'RETURN', error: 'ERROR' },
  alarm_control_panel: { disarmed: 'OFF', armed_home: 'HOME', armed_away: 'AWAY', armed_night: 'NIGHT', triggered: 'ALARM', arming: 'ARMING', pending: 'PENDING' },
  water_heater: { off: 'OFF', eco: 'ECO', electric: 'ELECTRIC', performance: 'PERF', high_demand: 'HIGH', heat_pump: 'PUMP', gas: 'GAS' },
};

// The caption for a state, or '' when the colour says it all (plain on/off).
export function captionFor(domain: string, state: string): string {
  return CAPTION[domain]?.[state] ?? '';
}

export const OFFLINE_FACE: Face = { icon: 'house', mode: 'offline', colour: COLOUR.dim, caption: 'OFFLINE' };
export const UNSET_FACE: Face = { icon: 'question', mode: 'unset', colour: COLOUR.dim, caption: '' };

export function faceFor(spec: EntitySpec | undefined, state: EntityState | undefined, online: boolean): Face {
  if (!spec) return UNSET_FACE;
  const domain = domainOf(spec.entity);
  const icon = iconFor(spec.entity, state?.attributes, spec.icon);
  if (!online) return { ...OFFLINE_FACE, icon };
  if (!state) return { icon, mode: 'missing', colour: COLOUR.unavailable, caption: 'MISSING' };
  if (state.state === 'unavailable' || state.state === 'unknown') {
    return { icon, mode: 'unavailable', colour: COLOUR.unavailable, caption: state.state === 'unknown' ? 'UNKNOWN' : 'N/A' };
  }
  // Locks show the open padlock while unlocked, whatever the config says.
  const shown: IconName = domain === 'lock' && icon === 'lock' && !isOn(domain, state.state) ? 'unlock' : icon;
  const caption = captionFor(domain, state.state);
  if (STATELESS.has(domain)) return { icon: shown, mode: 'lit', colour: COLOUR.run, caption };
  if (domain === 'lock' && !isOn(domain, state.state)) return { icon: shown, mode: 'lit', colour: COLOUR.alert, caption };
  if (isOn(domain, state.state)) return { icon: shown, mode: 'lit', colour: colourFor(domain, state.state, icon), caption };
  return { icon: shown, mode: 'dim', colour: COLOUR.dim, caption };
}

// Label under the key: config label, else Home Assistant's friendly name,
// else the object id with underscores as spaces.
export function labelFor(spec: EntitySpec | undefined, state: EntityState | undefined): string {
  if (!spec) return '';
  if (spec.label) return spec.label;
  const friendly = state?.attributes.friendly_name;
  if (typeof friendly === 'string' && friendly.trim()) return friendly.trim();
  return spec.entity.split('.')[1]?.replace(/_/g, ' ') ?? spec.entity;
}

export type ServiceCall = { domain: string; service: string; data: Record<string, unknown> };

// What a press calls. Toggle for anything that has a state; run for the
// stateless domains; lock/unlock by current state. `spec.service` overrides.
export function serviceFor(spec: EntitySpec, state: EntityState | undefined): ServiceCall {
  const data = spec.data ?? {};
  if (spec.service) {
    const [domain, service] = spec.service.split('.');
    return { domain, service, data };
  }
  const domain = domainOf(spec.entity);
  switch (domain) {
    case 'button':
    case 'input_button':
      return { domain, service: 'press', data };
    case 'scene':
    case 'script':
      return { domain, service: 'turn_on', data };
    case 'automation':
      return { domain, service: 'trigger', data };
    case 'lock':
      return { domain, service: state && isOn(domain, state.state) ? 'unlock' : 'lock', data };
    case 'cover':
    case 'media_player':
    case 'fan':
    case 'light':
    case 'switch':
    case 'climate':
    case 'humidifier':
    case 'vacuum':
    case 'siren':
    case 'water_heater':
    case 'input_boolean':
    case 'remote':
    case 'valve':
      return { domain, service: 'toggle', data };
    default:
      return { domain: 'homeassistant', service: 'toggle', data };
  }
}
