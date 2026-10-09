// Config file: Home Assistant connection and the entity keys.
//
// The Node SDK has no per-key parameters, so the plugin registers a fixed
// number of entity slots and fills them from `entities` in the config file.
// Changing the file takes effect within a couple of seconds; when the slot
// names change the plugin restarts itself once so the Options+ picker follows.
import { execFile } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const CONFIG_PATH = process.env.HA_CONSOLE_CONFIG ?? join(homedir(), '.config/home-assistant-console/config.json');

export const ENTITY_SLOTS = 18;

export type EntitySpec = {
  // Home Assistant entity id, e.g. "light.kitchen".
  entity: string;
  // Shown under the key and in the picker. Defaults to the entity's
  // friendly_name from Home Assistant, then to the id after the dot.
  label: string | undefined;
  // Glyph override: a glyph name from src/icons.ts or an "mdi:" name.
  icon: string | undefined;
  // Service to call on press, "domain.service"; defaults per domain (toggle).
  service: string | undefined;
  // Extra service data merged into the call.
  data: Record<string, unknown> | undefined;
};

export type Config = {
  // Base URL of Home Assistant, e.g. "https://homeassistant.local:8123".
  url: string | undefined;
  // Long-lived access token (Profile > Security in Home Assistant).
  token: string | undefined;
  // How long to wait before reconnecting after a drop, in ms (default 3000).
  reconnectMs: number;
  entities: EntitySpec[];
};

export const EMPTY_CONFIG: Config = { url: undefined, token: undefined, reconnectMs: 3000, entities: [] };

export function loadRaw(path = CONFIG_PATH): Record<string, unknown> {
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch (error) {
    console.warn(`config ${path} is not valid JSON and is ignored: ${(error as Error).message}`);
    return {};
  }
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function normalizeEntities(raw: unknown): EntitySpec[] {
  if (!Array.isArray(raw)) return [];
  const specs: EntitySpec[] = [];
  for (const item of raw) {
    // A bare string is just the entity id.
    const obj = typeof item === 'string' ? { entity: item } : item;
    if (!obj || typeof obj !== 'object') continue;
    const { entity, label, icon, service, data } = obj as Record<string, unknown>;
    const id = str(entity)?.toLowerCase();
    if (!id || !/^[a-z0-9_]+\.[a-z0-9_]+$/.test(id)) {
      if (entity !== undefined) console.warn(`config: "${String(entity)}" is not an entity id (domain.object_id); skipped`);
      continue;
    }
    const svc = str(service);
    if (svc && !/^[a-z0-9_]+\.[a-z0-9_]+$/.test(svc)) console.warn(`config: service "${svc}" for ${id} is not domain.service; ignored`);
    specs.push({
      entity: id,
      label: str(label),
      icon: str(icon),
      service: svc && /^[a-z0-9_]+\.[a-z0-9_]+$/.test(svc) ? svc : undefined,
      data: data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : undefined,
    });
  }
  return specs.slice(0, ENTITY_SLOTS);
}

// The token the generated config ships with; treated as no token at all so
// the plugin never logs in with it.
export const TOKEN_PLACEHOLDER = 'PASTE_YOUR_LONG_LIVED_ACCESS_TOKEN_HERE';

export function normalizeConfig(raw: Record<string, unknown>, env: NodeJS.ProcessEnv = process.env): Config {
  let token = str(raw.token) ?? str(env.HA_CONSOLE_TOKEN);
  if (token === TOKEN_PLACEHOLDER) token = undefined;
  const tokenFile = str(raw.tokenFile);
  if (!token && tokenFile) {
    try {
      token = readFileSync(tokenFile.replace(/^~(?=$|\/)/, homedir()), 'utf8').trim() || undefined;
    } catch (error) {
      console.warn(`config: tokenFile ${tokenFile} is unreadable: ${(error as Error).message}`);
    }
  }
  const reconnect = typeof raw.reconnectMs === 'number' && raw.reconnectMs >= 500 ? raw.reconnectMs : 3000;
  return {
    url: str(raw.url) ?? str(env.HA_CONSOLE_URL),
    token,
    reconnectMs: reconnect,
    entities: normalizeEntities(raw.entities),
  };
}

export function loadConfig(path = CONFIG_PATH): Config {
  return normalizeConfig(loadRaw(path));
}

// Re-reads the config only when the file changed. `onChange` fires for every
// change after the first load, with the old and new config.
export class ConfigSource {
  private readonly path: string;
  private readonly onChange: ((next: Config, previous: Config) => void) | undefined;
  private mtime = -1;
  private config: Config = EMPTY_CONFIG;

  constructor(path: string, onChange?: (next: Config, previous: Config) => void) {
    this.path = path;
    this.onChange = onChange;
  }

  current(): Config {
    let mtime = 0;
    try {
      mtime = statSync(this.path).mtimeMs;
    } catch {
      mtime = 0; // no file
    }
    if (mtime !== this.mtime) {
      const first = this.mtime === -1;
      this.mtime = mtime;
      const previous = this.config;
      this.config = mtime === 0 ? EMPTY_CONFIG : loadConfig(this.path);
      console.info(`entity keys: ${this.config.entities.map((e) => e.label ?? e.entity).join(', ') || 'none'}`);
      if (!first) this.onChange?.(this.config, previous);
    }
    return this.config;
  }
}

// Whether the entity slots' picker names would differ between two configs.
export function slotNamesChanged(a: Config, b: Config): boolean {
  if (a.entities.length !== b.entities.length) return true;
  return a.entities.some((e, i) => e.entity !== b.entities[i].entity || e.label !== b.entities[i].label);
}

// Asks the Plugin Service to restart this plugin so the Options+ action picker
// picks up new slot names. The service re-launches the plugin within a second.
export function requestPluginReload(): void {
  const name = process.env.LPS_PLUGIN_NAME;
  if (!name || process.platform !== 'darwin') return;
  console.info('entity config changed; reloading the plugin so Options+ shows the new names');
  execFile('/usr/bin/open', [`loupedeck://plugin/${name}/reload`], (error) => {
    if (error) console.warn(`could not request a plugin reload: ${error.message}`);
  });
}
