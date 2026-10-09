// Live key faces from a Node.js plugin.
//
// The public SDK (0.1.1) answers every GetActionImage with null and never
// handles GetActionText, but the Plugin Service speaks the same protocol to
// Node plugins as to C# ones. We hook the SDK's private WebSocket client,
// answer those two requests for our own actions, and push
// ActionImageChanged / ActionTextChanged events when a face changes.
//
// Adapted from herdr-logi-plugin (MIT, Niklas Berglund); see NOTICE.md.
import type { PluginSDK } from '@logitech/plugin-sdk';

export type FaceProvider = {
  readonly name: string;
  image(): string; // base64 PNG
  text(): string;
};

type Client = { onMessage(handler: (data: Buffer) => void): void; sendMessage(message: unknown): void };
export type Internals = { _client?: Partial<Client>; _handleMessage?(data: Buffer): Promise<void> };

export type Notify = (kind: 'ActionImageChanged' | 'ActionTextChanged', actionName: string) => void;

export function installBridge(sdk: PluginSDK, providers: Iterable<FaceProvider>): Notify {
  if (!process.env.LPS_PLUGIN_NAME) {
    console.error('LPS_PLUGIN_NAME is not set; the Plugin Service ignores face update events without it, so tiles will not refresh.');
  }
  return hookMessages(sdk as unknown as Internals, providers);
}

export function hookMessages(internals: Internals, providers: Iterable<FaceProvider>): Notify {
  const client = internals._client;
  if (typeof client?.onMessage !== 'function' || typeof client.sendMessage !== 'function' || typeof internals._handleMessage !== 'function') {
    console.error('Logi Plugin SDK internals have changed; live tile faces are disabled. Pin @logitech/plugin-sdk to 0.1.1.');
    return () => {};
  }
  const send = client.sendMessage.bind(client);
  const fallback = internals._handleMessage.bind(internals);
  const byName = new Map<string, FaceProvider>();
  for (const p of providers) byName.set(p.name, p);

  client.onMessage((data) => {
    let msg: { id: number; name: string; messageType: string; parameters?: { actionName?: string } };
    try {
      msg = JSON.parse(data.toString('utf8'));
    } catch {
      return void fallback(data);
    }
    const provider = msg.messageType === 'Request' ? byName.get(msg.parameters?.actionName ?? '') : undefined;
    if (provider && msg.name === 'GetActionImage') {
      reply(msg.id, msg.name, { image: safe(() => provider.image(), '') });
      return;
    }
    if (provider && msg.name === 'GetActionText') {
      reply(msg.id, msg.name, { text: safe(() => provider.text(), provider.name) });
      return;
    }
    void fallback(data);
  });

  function reply(id: number, name: string, data: unknown) {
    send({ id, name, messageType: 'Response', data, failed: false, errorMessage: '', errorCode: 0 });
  }

  return (kind, actionName) => {
    send({
      id: 0,
      name: kind,
      messageType: 'Event',
      parameters: { pluginName: process.env.LPS_PLUGIN_NAME, actionName, actionParameter: null },
    });
  };
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch (error) {
    console.error(`face render failed: ${(error as Error).message}`);
    return fallback;
  }
}
