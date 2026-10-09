// End-to-end smoke test of the built bundle: starts a fake Logi Plugin
// Service and a fake Home Assistant on localhost, runs dist/index.mjs in a
// child process, asks it for key faces, presses Entity 1 and checks that the
// toggle reached Home Assistant and the pushed state change repainted the key.
// Run: npm run build && node scripts/smoke.ts
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';

const here = dirname(fileURLToPath(import.meta.url));
const bundle = join(here, '..', 'dist', 'index.mjs');
const log = (...a: unknown[]) => console.log('[smoke]', ...a);
const fail = (why: string) => {
  console.error(`[smoke] FAILED: ${why}`);
  process.exitCode = 1;
};

const state = (s: string) => ({ entity_id: 'light.the_office_c1', state: s, attributes: { friendly_name: 'Office C1' } });
const haCalls: string[] = [];
const ha = new WebSocketServer({ port: 0 });
ha.on('connection', (ws: WebSocket) => {
  ws.send(JSON.stringify({ type: 'auth_required', ha_version: '2026.9.1' }));
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString()) as Record<string, unknown>;
    if (msg.type === 'auth') return ws.send(JSON.stringify(msg.access_token === 'smoke' ? { type: 'auth_ok', ha_version: '2026.9.1' } : { type: 'auth_invalid', message: 'Invalid access token' }));
    if (msg.type === 'get_states') return ws.send(JSON.stringify({ id: msg.id, type: 'result', success: true, result: [state('on')] }));
    if (msg.type === 'subscribe_events') return ws.send(JSON.stringify({ id: msg.id, type: 'result', success: true, result: null }));
    if (msg.type === 'call_service') {
      haCalls.push(`${msg.domain}.${msg.service} ${JSON.stringify(msg.target)}`);
      ws.send(JSON.stringify({ id: msg.id, type: 'result', success: true, result: {} }));
      ws.send(JSON.stringify({ id: 2, type: 'event', event: { event_type: 'state_changed', data: { entity_id: 'light.the_office_c1', old_state: state('on'), new_state: state('off') } } }));
    }
  });
});

const texts: string[] = [];
const images = new Set<string>();
let nextId = 100;
const lps = new WebSocketServer({ port: 0 });
lps.on('connection', (ws: WebSocket) => {
  // The SDK checks pluginName on every ExecuteCommand request.
  const ask = (name: string, actionName: string) =>
    ws.send(JSON.stringify({ id: nextId++, name, messageType: 'Request', parameters: { pluginName: 'HomeAssistantConsole', actionName, actionParameter: null } }));
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString()) as { id: number; name: string; messageType: string; failed?: boolean; errorMessage?: string; data?: { text?: string; image?: string } };
    if (msg.messageType === 'Request') {
      ws.send(JSON.stringify({ id: msg.id, name: msg.name, messageType: 'Response', data: {}, failed: false, errorMessage: '', errorCode: 0 }));
      if (msg.name === 'InitConnection') {
        log('plugin initialised with the fake Plugin Service');
        setTimeout(() => ask('GetActionText', 'ha_entity_1'), 800);
        setTimeout(() => ask('GetActionImage', 'ha_entity_1'), 850);
        setTimeout(() => ask('GetActionText', 'ha_connection'), 900);
        setTimeout(() => ask('ExecuteCommand', 'ha_entity_1'), 1000);
        setTimeout(() => ask('GetActionText', 'ha_entity_1'), 1600);
        setTimeout(() => ask('GetActionImage', 'ha_entity_1'), 1650);
      }
      return;
    }
    if (msg.messageType === 'Response') {
      if (msg.failed) fail(`${msg.name}: ${msg.errorMessage}`);
      if (msg.name === 'GetActionText' && msg.data?.text !== undefined) texts.push(msg.data.text);
      if (msg.name === 'GetActionImage' && msg.data?.image) {
        images.add(msg.data.image);
        if (Buffer.from(msg.data.image, 'base64').subarray(1, 4).toString() !== 'PNG') fail('face is not a PNG');
      }
    }
  });
});

const port = (server: WebSocketServer) => (server.address() as { port: number }).port;
const config = join(mkdtempSync(join(tmpdir(), 'ha-console-smoke-')), 'config.json');
writeFileSync(config, JSON.stringify({ url: `http://127.0.0.1:${port(ha)}`, token: 'smoke', entities: [{ entity: 'light.the_office_c1', label: 'Office C1' }] }));

const child = spawn(process.execPath, [bundle], {
  env: { ...process.env, LPS_SERVER_URL: `ws://127.0.0.1:${port(lps)}`, LPS_SESSION_TOKEN: 't', LPS_PLUGIN_NAME: 'HomeAssistantConsole', HA_CONSOLE_CONFIG: config },
  stdio: ['ignore', 'pipe', 'pipe'],
});
child.stdout.on('data', (d: Buffer) => process.stdout.write('[plugin] ' + d.toString()));
child.stderr.on('data', (d: Buffer) => process.stdout.write('[plugin!] ' + d.toString()));

setTimeout(() => {
  log('texts:', JSON.stringify(texts));
  log('HA service calls:', JSON.stringify(haCalls));
  log('distinct faces for entity 1:', images.size);
  if (texts[0] !== 'Office C1') fail('label of entity 1');
  if (!texts[1]?.startsWith('HA 2026')) fail('label of the connection key');
  if (haCalls.length !== 1 || !haCalls[0].startsWith('light.toggle')) fail('press did not toggle the light');
  if (images.size !== 2) fail('expected an "on" face and an "off" face');
  log(process.exitCode ? 'FAILED' : 'OK');
  child.kill();
  ha.close();
  lps.close();
}, 2500);
