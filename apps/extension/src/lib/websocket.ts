const WS_URL = 'ws://127.0.0.1:9847';
const RECONNECT_DELAYS = [1000, 2000, 5000, 10000, 30000];
const PING_INTERVAL_MS = 30000;

type Listener = (...args: unknown[]) => void;

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private reconnectAttempt = 0;
  private listeners = new Map<string, Listener[]>();
  private pingTimer: ReturnType<typeof setInterval> | null = null;

  on(event: string, fn: Listener): void {
    const list = this.listeners.get(event) ?? [];
    list.push(fn);
    this.listeners.set(event, list);
  }

  off(event: string, fn: Listener): void {
    const list = this.listeners.get(event) ?? [];
    this.listeners.set(
      event,
      list.filter((l) => l !== fn)
    );
  }

  private emit(event: string, ...args: unknown[]): void {
    (this.listeners.get(event) ?? []).forEach((fn) => fn(...args));
  }

  connect(): void {
    try {
      this.ws = new WebSocket(WS_URL);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectAttempt = 0;
      this.emit('connected');
      this.startPing();
    };

    this.ws.onclose = () => {
      this.stopPing();
      this.ws = null;
      this.emit('disconnected');
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.emit('disconnected');
    };

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data as string);
        this.emit('message', data);
      } catch {
        this.emit('message', event.data);
      }
    };
  }

  disconnect(): void {
    this.stopPing();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  send(data: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      this.send({ type: 'ping' });
    }, PING_INTERVAL_MS);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private scheduleReconnect(): void {
    const delay =
      RECONNECT_DELAYS[
        Math.min(this.reconnectAttempt, RECONNECT_DELAYS.length - 1)
      ];
    this.reconnectAttempt++;
    setTimeout(() => this.connect(), delay);
  }
}
