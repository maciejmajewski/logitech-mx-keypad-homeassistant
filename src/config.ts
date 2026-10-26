// Config file: Home Assistant connection and the entity keys.
//
// The Node SDK has no per-key parameters, so the plugin registers one action
// per entity listed in `entities`, named after the entity id. Changing the
// file takes effect within a couple of seconds; when the list of keys changes
// the plugin restarts itself once so the Options+ picker follows.
import { execFile } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const CONFIG_PATH = process.env.HOME_ASSISTANT_CONFIG ?? join(homedir(), '.config/logitech-options-plus-home-assistant/config.json');

// Sanity cap on configured entities (one action each).
export const MAX_ENTITIES = 64;

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
  const seen = new Set<string>();
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
    if (seen.has(id)) {
      console.warn(`config: ${id} is listed twice; the first entry wins`);
      continue;
    }
    seen.add(id);
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
  if (specs.length > MAX_ENTITIES) console.warn(`config: only the first ${MAX_ENTITIES} entities get keys`);
  return specs.slice(0, MAX_ENTITIES);
}

// The token the generated config ships with; treated as no token at all so
// the plugin never logs in with it.
export const TOKEN_PLACEHOLDER = 'PASTE_YOUR_LONG_LIVED_ACCESS_TOKEN_HERE';

export function normalizeConfig(raw: Record<string, unknown>, env: NodeJS.ProcessEnv = process.env): Config {
  let token = str(raw.token) ?? str(env.HOME_ASSISTANT_TOKEN);
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
    url: str(raw.url) ?? str(env.HOME_ASSISTANT_URL),
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

// Whether the set of keys (entity ids and their picker names) differs between
// two configs. Order does not matter: keys are named after the entity, so a
// reordered file changes nothing in Options+.
export function keysChanged(a: Config, b: Config): boolean {
  const key = (c: Config) => c.entities.map((e) => `${e.entity}=${e.label ?? ''}`).sort().join('\n');
  return key(a) !== key(b);
}

// Asks the Plugin Service to restart this plugin: after a config change, so
// the Options+ action picker picks up new key names, and after a lost service
// connection (see connection.ts). The service re-launches the plugin within a
// second or two. The loupedeck:// deep link is opened with the platform's URL opener.
export function requestPluginReload(reason: string): void {
  const name = process.env.LPS_PLUGIN_NAME;
  if (!name) return;
  const url = `loupedeck://plugin/${name}/reload`;
  const [command, args] =
    process.platform === 'darwin' ? ['/usr/bin/open', [url]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : [undefined, []];
  if (!command) return;
  console.info(reason);
  execFile(command, args, (error) => {
    if (error) console.warn(`could not request a plugin reload: ${error.message}`);
  });
}
