// Recover from a lost Plugin Service connection.
//
// The SDK (0.1.1) opens one WebSocket to the Plugin Service and, when that
// socket closes, only clears a flag: it neither reconnects nor exits. The
// service, for its part, only respawns a plugin whose process has died. So a
// plugin whose socket drops (seen after a wake from sleep) keeps running
// deaf and mute until someone reloads it by hand.
//
// Exiting is not enough: the service respawns the process and completes the
// handshake, but then never fetches a single key face again (measured: only
// the Init response and the action list request arrive, nothing more), so
// every key shows its static icon. Only the reload deeplink makes the
// service tear the plugin down and render its keys afresh. So on close we
// ask for that reload, repeat the request if nothing happens, and exit as a
// last resort so at least key presses work again.
import type { PluginSDK } from '@logitech/plugin-sdk';

type Client = {
  onClose(handler: () => void): void;
  onError(handler: (error: unknown) => void): void;
  _socket?: { terminate?(): void } | null;
};
export type ConnectionInternals = { _client?: Partial<Client> };

export type RecoveryOptions = {
  // Asks the service to reload this plugin (the loupedeck:// deeplink).
  reload: (reason: string) => void;
  exit?: (code: number) => void;
  // How long to wait for the service to act on a reload request before
  // asking again, and how many requests to make before exiting instead.
  reloadWaitMs?: number;
  reloadAttempts?: number;
};

export const RELOAD_WAIT_MS = 10_000;
export const RELOAD_ATTEMPTS = 3;

// Returns false when the SDK internals are not what we expect (the plugin
// then runs as before, without recovery).
export function recoverOnDisconnect(sdk: PluginSDK, options: RecoveryOptions): boolean {
  const client = (sdk as unknown as ConnectionInternals)._client;
  if (typeof client?.onClose !== 'function' || typeof client.onError !== 'function') {
    console.error('Logi Plugin SDK internals have changed; the plugin will not recover from a lost service connection.');
    return false;
  }
  const exit = options.exit ?? ((code) => process.exit(code));
  const waitMs = options.reloadWaitMs ?? RELOAD_WAIT_MS;
  const attempts = options.reloadAttempts ?? RELOAD_ATTEMPTS;
  let lost = false;
  const recover = (why: string) => {
    if (lost) return;
    lost = true;
    let attempt = 0;
    const tryReload = () => {
      attempt += 1;
      if (attempt > attempts) {
        console.error(`Plugin Service did not reload the plugin after ${attempts} requests; exiting so it respawns.`);
        exit(1);
        return;
      }
      options.reload(`Plugin Service connection ${why}; requesting a plugin reload (attempt ${attempt} of ${attempts})`);
      setTimeout(tryReload, waitMs).unref?.();
    };
    tryReload();
  };
  client.onClose(() => recover('closed'));
  client.onError((error) => recover(`failed (${error instanceof Error ? error.message : String(error)})`));
  return true;
}

// Test aid: `kill -USR2 <plugin pid>` drops the socket to the service the way
// a wake from sleep does, which must end in a reload with fresh key faces.
export function installDropSignal(sdk: PluginSDK, signal: NodeJS.Signals = 'SIGUSR2'): void {
  process.on(signal, () => {
    console.error(`${signal} received; dropping the Plugin Service connection to test recovery.`);
    const client = (sdk as unknown as ConnectionInternals)._client;
    client?._socket?.terminate?.();
  });
}
