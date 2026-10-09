// The keys. Every action is a FaceProvider (image + text) that the bridge
// serves to the Plugin Service; the store tells the keys when to repaint.
import { CommandAction, type Action } from '@logitech/plugin-sdk';
import { ENTITY_SLOTS, type Config, type EntitySpec } from './config.ts';
import { faceFor, labelFor, serviceFor, UNSET_FACE, type Face } from './faces.ts';
import type { EntityState, StateChanged } from './ha.ts';
import { BLANK, connectionImage, faceImage, labelText, type ConnectionStatus } from './tiles.ts';

export const GROUP_ENTITIES = 'Home Assistant entities';
export const GROUP_STATUS = 'Home Assistant status';

export type Caller = {
  callService(domain: string, service: string, entityId: string, data?: Record<string, unknown>): Promise<unknown>;
  reconnect(): void;
};

// Presses run one at a time so rapid taps see the state left by the previous one.
let queue: Promise<void> = Promise.resolve();
function enqueue(task: () => Promise<void>): Promise<void> {
  const run = async () => {
    try {
      await task();
    } catch (error) {
      console.error(`key action failed: ${(error as Error).message}`);
    }
  };
  queue = queue.then(run, run);
  return queue;
}

// Shared between keys: the entity states, the connection and the config.
export class Store {
  private readonly states = new Map<string, EntityState>();
  caller: Caller | undefined;
  config: Config;
  status: ConnectionStatus = 'unconfigured';
  haVersion = '';
  // Set by index.ts: asks the service to re-request a key's face and text now.
  repaint: ((actionName: string) => void) | undefined;

  constructor(config: Config) {
    this.config = config;
  }

  get online(): boolean {
    return this.status === 'connected';
  }

  spec(slot: number): EntitySpec | undefined {
    return this.config.entities[slot - 1];
  }

  state(entityId: string): EntityState | undefined {
    return this.states.get(entityId);
  }

  // Keeps only the configured entities; the rest of a get_states is noise.
  setStates(all: EntityState[]): void {
    this.states.clear();
    const wanted = new Set(this.config.entities.map((e) => e.entity));
    for (const state of all) if (wanted.has(state.entity_id)) this.states.set(state.entity_id, state);
    for (const id of wanted) if (!this.states.has(id)) console.warn(`entity ${id} is configured but Home Assistant does not know it`);
  }

  // Applies one state_changed event; returns whether a configured entity changed.
  applyChange(change: StateChanged): boolean {
    if (!this.config.entities.some((e) => e.entity === change.entity_id)) return false;
    if (change.new_state) {
      const before = this.states.get(change.entity_id);
      this.states.set(change.entity_id, change.new_state);
      if (before?.state !== change.new_state.state) console.info(`${change.entity_id}: ${before?.state ?? 'new'} -> ${change.new_state.state}`);
    } else {
      this.states.delete(change.entity_id);
      console.info(`${change.entity_id}: removed from Home Assistant`);
    }
    return true;
  }

  slotsFor(entityId: string): number[] {
    const slots: number[] = [];
    this.config.entities.forEach((e, i) => {
      if (e.entity === entityId) slots.push(i + 1);
    });
    return slots;
  }
}

export interface Tile {
  readonly name: string;
  image(): string;
  text(): string;
}

export function entityActionName(slot: number): string {
  return `ha_entity_${slot}`;
}

// One key per configured entity: the face follows its state, a press calls
// the toggle (or run) service for it.
export class EntityKey extends CommandAction implements Tile {
  readonly name: string;
  readonly slot: number;
  displayName: string;
  description: string;
  groupName = GROUP_ENTITIES;
  private readonly store: Store;
  private flashUntil = 0;

  // The display name and description are what the Options+ action picker
  // shows; they are reported once at startup, so they come from the config
  // loaded before registration. The key face and label stay live.
  constructor(store: Store, slot: number, initial?: EntitySpec) {
    super();
    this.store = store;
    this.slot = slot;
    this.name = entityActionName(slot);
    const label = initial ? (initial.label ?? initial.entity.split('.')[1]?.replace(/_/g, ' ')) : undefined;
    this.displayName = initial ? `Entity ${slot}: ${label}` : `Entity ${slot}`;
    this.description = initial
      ? `Toggle ${initial.entity}; the key shows its current state`
      : `Entity ${slot} from ~/.config/home-assistant-console/config.json ("entities"); unset`;
  }

  face(): Face {
    const spec = this.store.spec(this.slot);
    if (!spec) return UNSET_FACE;
    return faceFor(spec, this.store.state(spec.entity), this.store.online);
  }

  image() {
    return faceImage(this.face(), Date.now() < this.flashUntil);
  }

  text() {
    const spec = this.store.spec(this.slot);
    if (!spec) return BLANK;
    if (!this.store.online) return labelText(this.store.status === 'auth' ? 'bad token' : 'HA offline');
    return labelText(labelFor(spec, this.store.state(spec.entity)));
  }

  onKeyDown() {
    const spec = this.store.spec(this.slot);
    const caller = this.store.caller;
    if (!spec) {
      console.info(`Entity ${this.slot} pressed but no entity is configured in that slot; nothing sent`);
      return;
    }
    if (!caller || !this.store.online) {
      console.info(`${spec.entity} pressed while not connected to Home Assistant; nothing sent`);
      return;
    }
    const state = this.store.state(spec.entity);
    const call = serviceFor(spec, state);
    console.info(`${spec.entity}: ${call.domain}.${call.service}${Object.keys(call.data).length ? ' ' + JSON.stringify(call.data) : ''}`);
    this.flash();
    return enqueue(() => caller.callService(call.domain, call.service, spec.entity, call.data).then(() => undefined));
  }

  // Brief white-out so a press on a stateless key (scene, script) is visible.
  private flash(): void {
    this.flashUntil = Date.now() + 250;
    this.store.repaint?.(this.name);
    setTimeout(() => {
      this.flashUntil = 0;
      this.store.repaint?.(this.name);
    }, 260);
  }
}

// Connection key: shows whether the plugin is subscribed to Home Assistant.
// Press: reconnect now.
export class ConnectionKey extends CommandAction implements Tile {
  readonly name = 'ha_connection';
  displayName = 'Home Assistant connection';
  description = 'Green while subscribed to Home Assistant, red when the token is rejected, grey while down; press to reconnect';
  groupName = GROUP_STATUS;
  private readonly store: Store;

  constructor(store: Store) {
    super();
    this.store = store;
  }

  image() {
    const caption =
      this.store.status === 'connected' ? 'ONLINE' : this.store.status === 'auth' ? 'TOKEN' : this.store.status === 'connecting' ? 'WAIT' : this.store.status === 'unconfigured' ? 'CONFIG' : 'OFFLINE';
    return connectionImage(this.store.status, caption);
  }

  text() {
    switch (this.store.status) {
      case 'connected':
        return labelText(this.store.haVersion ? `HA ${this.store.haVersion}` : 'online');
      case 'auth':
        return labelText('bad token');
      case 'connecting':
        return labelText('connecting');
      case 'unconfigured':
        return labelText('no config');
      default:
        return labelText('offline');
    }
  }

  onKeyDown() {
    const caller = this.store.caller;
    if (!caller) {
      console.info('Connection key pressed but no Home Assistant URL/token is configured');
      return;
    }
    console.info('Connection key pressed: reconnecting to Home Assistant');
    caller.reconnect();
  }
}

export type PluginTile = Action & Tile;

export function createActions(store: Store): PluginTile[] {
  return [
    ...Array.from({ length: ENTITY_SLOTS }, (_, i) => new EntityKey(store, i + 1, store.config.entities[i])),
    new ConnectionKey(store),
  ];
}
