/** Chrome Native Messaging bridge to SideFlow desktop (host proxies to localhost WebSocket). */
const NATIVE_HOST = 'com.sideflow.nmh';
const RECONNECT_DELAYS = [1000, 2000, 5000, 10000, 30000];

type Listener = (...args: unknown[]) => void;

export class NativeMessagingBridge {
  private port: chrome.runtime.Port | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Map<string, Listener[]>();

  on(event: string, fn: Listener): void {
    const list = this.listeners.get(event) ?? [];
    list.push(fn);
    this.listeners.set(event, list);
  }

  private emit(event: string, ...args: unknown[]): void {
    (this.listeners.get(event) ?? []).forEach((fn) => fn(...args));
  }

  connect(): void {
    if (this.port) return;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    try {
      this.port = chrome.runtime.connectNative(NATIVE_HOST);
    } catch {
      this.scheduleReconnect();
      return;
    }

    if (chrome.runtime.lastError?.message) {
      this.port = null;
      this.scheduleReconnect();
      return;
    }

    if (!this.port) {
      this.scheduleReconnect();
      return;
    }

    this.reconnectAttempt = 0;
    this.emit('connected');

    this.port.onMessage.addListener((msg: unknown) => {
      this.emit('message', msg);
    });

    this.port.onDisconnect.addListener(() => {
      const err = chrome.runtime.lastError?.message;
      if (err) {
        console.warn('SideFlow: native messaging disconnected:', err);
      }
      this.port = null;
      this.emit('disconnected');
      this.scheduleReconnect();
    });
  }

  send(data: object): void {
    if (this.port) {
      try {
        this.port.postMessage(data);
      } catch (e) {
        console.warn('SideFlow: native postMessage failed:', e);
      }
    }
  }

  get connected(): boolean {
    return this.port != null;
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    const delay =
      RECONNECT_DELAYS[
        Math.min(this.reconnectAttempt, RECONNECT_DELAYS.length - 1)
      ];
    this.reconnectAttempt++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
}
