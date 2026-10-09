import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WebSocketServer, type WebSocket } from 'ws';
import { HaClient, HaSession, websocketUrl, type EntityState, type SessionHandlers } from '../src/ha.ts';

const light: EntityState = { entity_id: 'light.k', state: 'on', attributes: {} };

function handlers() {
  const log: unknown[] = [];
  const h: SessionHandlers = {
    onStates: (s) => log.push(['states', s]),
    onStateChanged: (c) => log.push(['changed', c.entity_id, c.new_state?.state]),
    onReady: (i) => log.push(['ready', i.version]),
    onAuthInvalid: (m) => log.push(['auth_invalid', m]),
  };
  return { h, log };
}

test('websocket URL from the base URL', () => {
  assert.equal(websocketUrl('https://homeassistant.example.pl/'), 'wss://homeassistant.example.pl/api/websocket');
  assert.equal(websocketUrl('http://192.168.1.2:8123'), 'ws://192.168.1.2:8123/api/websocket');
  assert.equal(websocketUrl('https://ha.example/prefix/?x=1'), 'wss://ha.example/prefix/api/websocket');
});

test('session: authenticates, fetches states, subscribes, routes events, answers commands', async () => {
  const sent: Record<string, unknown>[] = [];
  const { h, log } = handlers();
  const session = new HaSession((t) => sent.push(JSON.parse(t)), 'tok', h, 1000);

  session.receive(JSON.stringify({ type: 'auth_required', ha_version: '2026.9.1' }));
  assert.deepEqual(sent[0], { type: 'auth', access_token: 'tok' });
  session.receive(JSON.stringify({ type: 'auth_ok', ha_version: '2026.9.1' }));
  await Promise.resolve();
  assert.deepEqual(sent[1], { id: 1, type: 'get_states' });
  session.receive(JSON.stringify({ id: 1, type: 'result', success: true, result: [light] }));
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(sent[2], { id: 2, type: 'subscribe_events', event_type: 'state_changed' });
  session.receive(JSON.stringify({ id: 2, type: 'result', success: true, result: null }));
  await new Promise((r) => setImmediate(r));
  assert.equal(session.ready, true);
  assert.deepEqual(log, [['states', [light]], ['ready', '2026.9.1']]);

  session.receive(JSON.stringify({ id: 2, type: 'event', event: { event_type: 'state_changed', data: { entity_id: 'light.k', old_state: light, new_state: { ...light, state: 'off' } } } }));
  session.receive(JSON.stringify({ id: 99, type: 'event', event: { event_type: 'state_changed', data: { entity_id: 'light.other', old_state: null, new_state: light } } }));
  assert.deepEqual(log[2], ['changed', 'light.k', 'off']);
  assert.equal(log.length, 3, 'events from other subscriptions are ignored');

  const call = session.callService('light', 'toggle', 'light.k', { brightness: 1 });
  assert.deepEqual(sent[3], { id: 3, type: 'call_service', domain: 'light', service: 'toggle', service_data: { brightness: 1 }, target: { entity_id: 'light.k' } });
  session.receive(JSON.stringify({ id: 3, type: 'result', success: true, result: { context: {} } }));
  assert.deepEqual(await call, { context: {} });

  const failing = session.callService('light', 'nope', 'light.k');
  session.receive(JSON.stringify({ id: 4, type: 'result', success: false, error: { code: 'not_found', message: 'Service light.nope not found' } }));
  await assert.rejects(failing, /Service light.nope not found/);

  const ping = session.ping();
  assert.deepEqual(sent[5], { id: 5, type: 'ping' });
  session.receive(JSON.stringify({ id: 5, type: 'pong' }));
  await ping;

  const dropped = session.ping();
  session.close('gone');
  await assert.rejects(dropped, /gone/);
  assert.equal(session.ready, false);
});

test('session: auth_invalid is reported and commands time out', async () => {
  const { h, log } = handlers();
  const session = new HaSession(() => {}, 'bad', h, 20);
  session.receive(JSON.stringify({ type: 'auth_invalid', message: 'Invalid access token' }));
  assert.deepEqual(log, [['auth_invalid', 'Invalid access token']]);
  await assert.rejects(session.ping(), /did not answer ping within 20ms/);
});

// A tiny Home Assistant: one auth flow, get_states, subscribe, call_service.
function fakeHomeAssistant(token: string) {
  const server = new WebSocketServer({ port: 0 });
  const calls: unknown[] = [];
  const sockets: WebSocket[] = [];
  let connections = 0;
  server.on('connection', (ws) => {
    connections += 1;
    sockets.push(ws);
    ws.send(JSON.stringify({ type: 'auth_required', ha_version: '2026.9.1' }));
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString()) as Record<string, unknown>;
      if (msg.type === 'auth') {
        ws.send(JSON.stringify(msg.access_token === token ? { type: 'auth_ok', ha_version: '2026.9.1' } : { type: 'auth_invalid', message: 'Invalid access token' }));
        return;
      }
      if (msg.type === 'get_states') ws.send(JSON.stringify({ id: msg.id, type: 'result', success: true, result: [light] }));
      if (msg.type === 'subscribe_events') ws.send(JSON.stringify({ id: msg.id, type: 'result', success: true, result: null }));
      if (msg.type === 'ping') ws.send(JSON.stringify({ id: msg.id, type: 'pong' }));
      if (msg.type === 'call_service') {
        calls.push(msg);
        ws.send(JSON.stringify({ id: msg.id, type: 'result', success: true, result: {} }));
        ws.send(JSON.stringify({ id: 2, type: 'event', event: { event_type: 'state_changed', data: { entity_id: 'light.k', old_state: light, new_state: { ...light, state: 'off' } } } }));
      }
    });
  });
  const port = (server.address() as { port: number }).port;
  return {
    url: `http://127.0.0.1:${port}`,
    calls,
    get connections() {
      return connections;
    },
    dropAll: () => sockets.splice(0).forEach((s) => s.terminate()),
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

test('client: connects, toggles, receives the change and reconnects after a drop', async () => {
  const ha = fakeHomeAssistant('secret');
  const events: unknown[] = [];
  let ready: () => void = () => {};
  const client = new HaClient(ha.url, 'secret', {
    onStates: (s) => events.push(['states', s.length]),
    onStateChanged: (c) => events.push(['changed', c.new_state?.state]),
    onReady: () => {
      events.push(['ready']);
      ready();
    },
    onAuthInvalid: (m) => events.push(['auth', m]),
    onDisconnect: (r) => events.push(['down', r.split(' (')[0]]),
  }, { reconnectMs: 50, pingMs: 20 });
  try {
    const first = new Promise<void>((r) => (ready = r));
    client.start();
    await first;
    assert.equal(client.ready, true);
    await client.callService('light', 'toggle', 'light.k');
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(ha.calls.length, 1);
    assert.deepEqual(events, [['states', 1], ['ready'], ['changed', 'off']]);

    const again = new Promise<void>((r) => (ready = r));
    ha.dropAll();
    await again;
    assert.equal(ha.connections, 2);
    assert.deepEqual(events.slice(3), [['down', 'socket closed'], ['states', 1], ['ready']]);
    await client.callService('light', 'toggle', 'light.k');
    assert.equal(ha.calls.length, 2);
  } finally {
    client.stop();
    await ha.close();
  }
});

test('client: a rejected token is reported and not retried until asked', async () => {
  const ha = fakeHomeAssistant('secret');
  const events: unknown[] = [];
  let rejected: () => void = () => {};
  const client = new HaClient(ha.url, 'wrong', {
    onStates: () => events.push('states'),
    onStateChanged: () => {},
    onReady: () => events.push('ready'),
    onAuthInvalid: (m) => {
      events.push(['auth', m]);
      rejected();
    },
    onDisconnect: (r) => events.push(['down', r]),
  }, { reconnectMs: 10 });
  try {
    const done = new Promise<void>((r) => (rejected = r));
    client.start();
    await done;
    await new Promise((r) => setTimeout(r, 50));
    assert.deepEqual(events, [['auth', 'Invalid access token']]);
    assert.equal(ha.connections, 1, 'no automatic retry after auth_invalid');
    assert.equal(client.ready, false);
    await assert.rejects(client.callService('light', 'toggle', 'light.k'), /not connected/);
    // A manual reconnect (the connection key, or a config change) tries again once.
    const again = new Promise<void>((r) => (rejected = r));
    client.reconnect();
    await again;
    assert.equal(ha.connections, 2);
  } finally {
    client.stop();
    await ha.close();
  }
});
