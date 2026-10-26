import { LoggerLevel, PluginSDK } from '@logitech/plugin-sdk';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createActions, entityActionName, Store, type PluginTile } from './src/actions.ts';
import { writeActionAssets } from './src/assets.ts';
import { exitOnDisconnect, installDropSignal } from './src/connection.ts';
import { installBridge, type Notify } from './src/bridge.ts';
import { CONFIG_PATH, ConfigSource, keysChanged, requestPluginReload, type Config } from './src/config.ts';
import { HaClient } from './src/ha.ts';

const source = new ConfigSource(CONFIG_PATH, onConfigChange);
const store = new Store(source.current());
console.info(`Home Assistant starting; config: ${CONFIG_PATH}; url: ${store.config.url ?? 'unset'}`);

// Options+ looks for a key's icon and picker symbol by action name, so the
// files for the configured entities are written before the actions register.
const packageDir = process.env.LPS_PLUGIN_PACKAGE_DIRECTORY_PATH || dirname(fileURLToPath(import.meta.url));
try {
  writeActionAssets(packageDir, store.config.entities);
} catch (error) {
  console.warn(`could not write key icons into ${packageDir}: ${(error as Error).message}`);
}

const tiles = createActions(store);
const sdk = new PluginSDK({ logLevel: process.env.HOME_ASSISTANT_DEBUG ? LoggerLevel.DEBUG : LoggerLevel.WARN });
for (const tile of tiles) sdk.registerAction(tile);

// Events sent before the SDK socket is up are dropped by the SDK with a
// warning each, so hold them until connect() resolves and push everything then.
let sdkConnected = false;
const bridgeNotify: Notify = installBridge(sdk, tiles);
const notify: Notify = (kind, name) => {
  if (sdkConnected) bridgeNotify(kind, name);
};
store.repaint = (name) => {
  notify('ActionImageChanged', name);
  notify('ActionTextChanged', name);
};

// Repaints only the tiles whose face or text differs from what was last shown.
const shown = new Map<string, { image: string; text: string }>();
function repaint(subset?: PluginTile[], force = false) {
  for (const tile of subset ?? tiles) {
    let image = '';
    let text = '';
    try {
      image = tile.image();
      text = tile.text();
    } catch (error) {
      console.error(`tile '${tile.name}' could not be rendered: ${(error as Error).message}`);
      continue;
    }
    const before = shown.get(tile.name);
    if (force || before?.image !== image) notify('ActionImageChanged', tile.name);
    if (force || before?.text !== text) notify('ActionTextChanged', tile.name);
    shown.set(tile.name, { image, text });
  }
}

let client: HaClient | undefined;

function connect(config: Config) {
  client?.stop();
  client = undefined;
  if (!config.url || !config.token) {
    store.status = 'unconfigured';
    store.caller = undefined;
    console.warn(`no Home Assistant ${!config.url ? 'url' : 'token'} in ${CONFIG_PATH}; keys stay offline`);
    repaint();
    return;
  }
  store.status = 'connecting';
  const next = new HaClient(config.url, config.token, {
    onStates: (states) => {
      store.setStates(states);
    },
    onStateChanged: (change) => {
      if (!store.applyChange(change)) return;
      repaint(tiles.filter((t) => t.name === entityActionName(change.entity_id)));
    },
    onReady: ({ version }) => {
      store.status = 'connected';
      store.haVersion = version;
      console.info(`subscribed to Home Assistant ${version} at ${next.url}`);
      repaint();
    },
    onAuthInvalid: (message) => {
      store.status = 'auth';
      console.error(`Home Assistant rejected the token: ${message}. Create a long-lived access token under Profile > Security and put it in ${CONFIG_PATH}`);
      repaint();
    },
    onDisconnect: (reason) => {
      if (store.status !== 'auth') store.status = 'offline';
      console.warn(`Home Assistant connection lost: ${reason}; reconnecting`);
      repaint();
    },
  }, { reconnectMs: config.reconnectMs });
  client = next;
  store.caller = next;
  next.start();
  repaint();
}

function onConfigChange(next: Config, previous: Config) {
  store.config = next;
  if (next.url !== previous.url || next.token !== previous.token || next.reconnectMs !== previous.reconnectMs) {
    connect(next);
  } else if (client?.ready) {
    // New entities need their current state: the cheapest way is a fresh
    // get_states, which a reconnect gives us.
    client.reconnect();
  }
  if (keysChanged(next, previous)) requestPluginReload();
  repaint();
}

// Poll the config file's mtime; cheap, and it also catches editors that
// replace the file rather than write into it.
setInterval(() => {
  try {
    source.current();
  } catch (error) {
    console.warn(`could not read config: ${(error as Error).message}`);
  }
}, 2000);

connect(store.config);
exitOnDisconnect(sdk);
installDropSignal(sdk);
await sdk.connect();
sdkConnected = true;
// The service keeps faces from an earlier run and only asks again when told,
// so push every face once after connecting.
repaint(undefined, true);
