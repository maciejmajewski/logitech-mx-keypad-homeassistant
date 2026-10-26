// Recover from a lost Plugin Service connection.
//
// The SDK (0.1.1) opens one WebSocket to the Plugin Service and, when that
// socket closes, only clears a flag: it neither reconnects nor exits. The
// service, for its part, only respawns a plugin whose process has died. So a
// plugin whose socket drops (seen after a wake from sleep) keeps running
// deaf and mute until someone reloads it by hand. The service respawns an
// exited plugin within about two seconds, so the fix is to exit on close.
import type { PluginSDK } from '@logitech/plugin-sdk';

type Client = {
  onClose(handler: () => void): void;
  onError(handler: (error: unknown) => void): void;
  _socket?: { terminate?(): void } | null;
};
export type ConnectionInternals = { _client?: Partial<Client> };

export type ExitFn = (code: number) => void;

// Delay before exiting, so the log line above reaches the service's log file.
export const EXIT_DELAY_MS = 200;

// Exits the process when the service connection closes or errors, so the
// service spawns a fresh plugin. Returns false when the SDK internals are
// not what we expect (the plugin then runs as before, without recovery).
export function exitOnDisconnect(sdk: PluginSDK, exit: ExitFn = (code) => process.exit(code), delayMs = EXIT_DELAY_MS): boolean {
  const client = (sdk as unknown as ConnectionInternals)._client;
  if (typeof client?.onClose !== 'function' || typeof client.onError !== 'function') {
    console.error('Logi Plugin SDK internals have changed; the plugin will not recover from a lost service connection.');
    return false;
  }
  let exiting = false;
  const leave = (why: string) => {
    if (exiting) return;
    exiting = true;
    console.error(`Plugin Service connection ${why}; exiting so the service respawns the plugin.`);
    setTimeout(() => exit(1), delayMs);
  };
  client.onClose(() => leave('closed'));
  client.onError((error) => leave(`failed (${error instanceof Error ? error.message : String(error)})`));
  return true;
}

// Test aid: `kill -USR2 <plugin pid>` drops the socket to the service the way
// a wake from sleep does, which must end in a respawn.
export function installDropSignal(sdk: PluginSDK, signal: NodeJS.Signals = 'SIGUSR2'): void {
  process.on(signal, () => {
    console.error(`${signal} received; dropping the Plugin Service connection to test recovery.`);
    const client = (sdk as unknown as ConnectionInternals)._client;
    client?._socket?.terminate?.();
  });
}
