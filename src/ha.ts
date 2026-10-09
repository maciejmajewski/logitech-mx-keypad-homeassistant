// Home Assistant WebSocket API client.
//
// One socket per plugin: authenticate with the long-lived token, fetch the
// current states, subscribe to `state_changed` and keep the connection alive
// with pings. Everything about the protocol lives in `HaSession`, which only
// knows how to send and receive text frames, so tests drive it with a fake
// socket; `HaClient` adds the real `ws` socket and reconnection.
//
// Protocol: https://developers.home-assistant.io/docs/api/websocket/
import WebSocket from 'ws';

export type EntityState = {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed?: string;
  last_updated?: string;
};

export type StateChanged = { entity_id: string; old_state: EntityState | null; new_state: EntityState | null };

export type SessionHandlers = {
  // All states after (re)connecting, before any event.
  onStates(states: EntityState[]): void;
  onStateChanged(change: StateChanged): void;
  // The session is authenticated and subscribed.
  onReady(info: { version: string }): void;
  // The token was rejected; the caller should not retry quickly.
  onAuthInvalid(message: string): void;
};

type Incoming =
  | { type: 'auth_required'; ha_version: string }
  | { type: 'auth_ok'; ha_version: string }
  | { type: 'auth_invalid'; message: string }
  | { id: number; type: 'result'; success: boolean; result?: unknown; error?: { code: string; message: string } }
  | { id: number; type: 'event'; event: { event_type: string; data: unknown } }
  | { id: number; type: 'pong' };

export class HaError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

type Pending = { resolve(value: unknown): void; reject(error: Error): void; timer: NodeJS.Timeout };

export class HaSession {
  private readonly send: (text: string) => void;
  private readonly token: string;
  private readonly handlers: SessionHandlers;
  private readonly timeoutMs: number;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private subscriptionId: number | undefined;
  private version = '';
  ready = false;

  constructor(send: (text: string) => void, token: string, handlers: SessionHandlers, timeoutMs = 10_000) {
    this.send = send;
    this.token = token;
    this.handlers = handlers;
    this.timeoutMs = timeoutMs;
  }

  // Feed every text frame from the socket here.
  receive(text: string): void {
    let msg: Incoming;
    try {
      msg = JSON.parse(text) as Incoming;
    } catch {
      console.warn(`Home Assistant sent a non-JSON frame: ${text.slice(0, 80)}`);
      return;
    }
    switch (msg.type) {
      case 'auth_required':
        this.version = msg.ha_version;
        this.send(JSON.stringify({ type: 'auth', access_token: this.token }));
        return;
      case 'auth_ok':
        this.version = msg.ha_version || this.version;
        void this.bootstrap();
        return;
      case 'auth_invalid':
        this.handlers.onAuthInvalid(msg.message);
        return;
      case 'result': {
        const pending = this.pending.get(msg.id);
        if (!pending) return;
        this.pending.delete(msg.id);
        clearTimeout(pending.timer);
        if (msg.success) pending.resolve(msg.result);
        else pending.reject(new HaError(msg.error?.code ?? 'failed', msg.error?.message ?? 'Home Assistant reported failure'));
        return;
      }
      case 'event':
        if (msg.id === this.subscriptionId && msg.event.event_type === 'state_changed') {
          this.handlers.onStateChanged(msg.event.data as StateChanged);
        }
        return;
      case 'pong': {
        const pending = this.pending.get(msg.id);
        if (!pending) return;
        this.pending.delete(msg.id);
        clearTimeout(pending.timer);
        pending.resolve(undefined);
        return;
      }
    }
  }

  // Sends a command and resolves with its result.
  command<T>(payload: Record<string, unknown>): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new HaError('timeout', `Home Assistant did not answer ${String(payload.type)} within ${this.timeoutMs}ms`));
      }, this.timeoutMs);
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      this.send(JSON.stringify({ id, ...payload }));
    });
  }

  private async bootstrap(): Promise<void> {
    try {
      const states = await this.command<EntityState[]>({ type: 'get_states' });
      this.handlers.onStates(states);
      const id = this.nextId;
      await this.command({ type: 'subscribe_events', event_type: 'state_changed' });
      this.subscriptionId = id;
      this.ready = true;
      this.handlers.onReady({ version: this.version });
    } catch (error) {
      console.error(`Home Assistant session setup failed: ${(error as Error).message}`);
    }
  }

  callService(domain: string, service: string, entityId: string, data: Record<string, unknown> = {}): Promise<unknown> {
    return this.command({ type: 'call_service', domain, service, service_data: data, target: { entity_id: entityId } });
  }

  ping(): Promise<unknown> {
    return this.command({ type: 'ping' });
  }

  // Fails every outstanding command; called when the socket drops.
  close(reason: string): void {
    this.ready = false;
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new HaError('disconnected', reason));
      this.pending.delete(id);
    }
  }
}

export function websocketUrl(base: string): string {
  const url = new URL(base);
  url.protocol = url.protocol === 'https:' || url.protocol === 'wss:' ? 'wss:' : 'ws:';
  url.pathname = url.pathname.replace(/\/+$/, '') + '/api/websocket';
  url.search = '';
  url.hash = '';
  return url.toString();
}

export type ClientHandlers = SessionHandlers & {
  // Fires when the socket is lost (after having been up or while connecting).
  onDisconnect(reason: string): void;
};

export type ClientOptions = {
  reconnectMs?: number;
  pingMs?: number;
};

// Owns the socket: connects, hands frames to the session, pings, reconnects.
export class HaClient {
  readonly url: string;
  private readonly token: string;
  private readonly handlers: ClientHandlers;
  private readonly reconnectMs: number;
  private readonly pingMs: number;
  private socket: WebSocket | undefined;
  private session: HaSession | undefined;
  private reconnectTimer: NodeJS.Timeout | undefined;
  private pingTimer: NodeJS.Timeout | undefined;
  private stopped = false;
  private attempt = 0;

  constructor(url: string, token: string, handlers: ClientHandlers, options: ClientOptions = {}) {
    this.url = websocketUrl(url);
    this.token = token;
    this.handlers = handlers;
    this.reconnectMs = options.reconnectMs ?? 3000;
    this.pingMs = options.pingMs ?? 30_000;
  }

  get ready(): boolean {
    return this.session?.ready ?? false;
  }

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.clearTimers();
    this.teardown('stopped');
  }

  // Drop the socket and connect again right away.
  reconnect(): void {
    this.clearTimers();
    this.teardown('reconnect requested');
    this.connect();
  }

  callService(domain: string, service: string, entityId: string, data?: Record<string, unknown>): Promise<unknown> {
    if (!this.session?.ready) return Promise.reject(new HaError('offline', 'not connected to Home Assistant'));
    return this.session.callService(domain, service, entityId, data);
  }

  private connect(): void {
    if (this.stopped || this.socket) return;
    this.attempt += 1;
    let socket: WebSocket;
    try {
      socket = new WebSocket(this.url, { handshakeTimeout: 10_000 });
    } catch (error) {
      this.scheduleReconnect(`cannot open ${this.url}: ${(error as Error).message}`);
      return;
    }
    this.socket = socket;
    const session = new HaSession((text) => socket.send(text), this.token, {
      onStates: (states) => this.handlers.onStates(states),
      onStateChanged: (change) => this.handlers.onStateChanged(change),
      onReady: (info) => {
        this.attempt = 0;
        this.startPings();
        this.handlers.onReady(info);
      },
      onAuthInvalid: (message) => {
        // No automatic retry: Home Assistant counts failed logins per IP and
        // can ban the address. The plugin reconnects when the config changes
        // or the connection key is pressed.
        this.handlers.onAuthInvalid(message);
        this.teardown('auth invalid');
      },
    });
    this.session = session;
    socket.on('message', (data) => session.receive(data.toString()));
    socket.on('error', (error) => {
      // 'close' follows; log here so the reason is visible.
      console.warn(`Home Assistant socket error: ${error.message}`);
    });
    socket.on('close', (code, reason) => {
      if (this.socket !== socket) return;
      const why = `socket closed (${code}${reason.length ? ' ' + reason.toString() : ''})`;
      this.teardown(why);
      this.scheduleReconnect(why);
    });
  }

  private startPings(): void {
    clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => {
      const session = this.session;
      if (!session?.ready) return;
      session.ping().catch((error: Error) => {
        console.warn(`Home Assistant ping failed: ${error.message}; reconnecting`);
        this.reconnect();
      });
    }, this.pingMs);
  }

  private scheduleReconnect(reason: string | undefined, delay = this.backoff()): void {
    if (this.stopped || this.reconnectTimer) return;
    if (reason) this.handlers.onDisconnect(reason);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connect();
    }, delay);
  }

  // 1x, 2x, 4x ... the base delay, capped at 30 s.
  private backoff(): number {
    return Math.min(this.reconnectMs * 2 ** Math.max(0, this.attempt - 1), 30_000);
  }

  private clearTimers(): void {
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    clearInterval(this.pingTimer);
    this.pingTimer = undefined;
  }

  private teardown(reason: string): void {
    clearInterval(this.pingTimer);
    this.pingTimer = undefined;
    const socket = this.socket;
    const session = this.session;
    this.socket = undefined;
    this.session = undefined;
    session?.close(reason);
    if (socket) {
      socket.removeAllListeners();
      socket.on('error', () => {});
      try {
        socket.close();
      } catch {
        // already closed
      }
    }
  }
}
