import { DestroyRef, Injectable, effect, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { take } from 'rxjs';

import { RealtimeTicketResponse } from './models';
import { runtimeConfig } from './runtime-config';
import { Session } from './session';
import { SurebetApi } from './surebet-api';

const REFRESH_EVENT_TYPES = new Set(['odds.snapshot', 'odds.update', 'match.removed']);
const REALTIME_REFRESH_THROTTLE_MS = 2_000;
const MAX_RECONNECT_DELAY_MS = 30_000;

export function shouldRefreshFromRealtimeMessage(data: unknown): boolean {
  if (typeof data !== 'string') return false;
  try {
    const message = JSON.parse(data) as { type?: unknown };
    return typeof message.type === 'string' && REFRESH_EVENT_TYPES.has(message.type);
  } catch {
    return false;
  }
}

@Injectable({ providedIn: 'root' })
export class RealtimeUpdates {
  private readonly http = inject(HttpClient);
  private readonly session = inject(Session);
  private readonly api = inject(SurebetApi);
  private readonly destroyRef = inject(DestroyRef);
  private socket: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private refreshTimer: number | null = null;
  private lastRefreshAt = 0;
  private reconnectAttempts = 0;

  readonly connected = signal(false);

  constructor() {
    effect(() => {
      if (this.session.loading()) return;
      if (this.session.enabled && this.session.authenticated()) {
        this.connect();
      } else {
        this.disconnect();
      }
    });
    this.destroyRef.onDestroy(() => this.disconnect());
  }

  private connect(): void {
    if (this.socket || this.reconnectTimer !== null) return;
    this.http
      .post<RealtimeTicketResponse>(`${runtimeConfig.apiBaseUrl}/auth/realtime-ticket`, {})
      .pipe(take(1))
      .subscribe({
        next: (response) => this.openSocket(response.websocket_path, response.ticket),
        error: () => this.scheduleReconnect(),
      });
  }

  private openSocket(path: string, ticket: string): void {
    const apiOrigin = new URL(runtimeConfig.apiBaseUrl, window.location.origin).origin;
    const url = new URL(path, apiOrigin);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('ticket', ticket);
    this.socket = new WebSocket(url);
    this.socket.onopen = () => {
      this.reconnectAttempts = 0;
      this.connected.set(true);
    };
    this.socket.onmessage = (event) => {
      if (!shouldRefreshFromRealtimeMessage(event.data)) return;
      if (this.refreshTimer !== null) return;
      const delay = Math.max(0, REALTIME_REFRESH_THROTTLE_MS - (Date.now() - this.lastRefreshAt));
      this.refreshTimer = window.setTimeout(() => {
        this.refreshTimer = null;
        this.lastRefreshAt = Date.now();
        this.api.refresh('live', false);
      }, delay);
    };
    this.socket.onerror = () => this.socket?.close();
    this.socket.onclose = () => {
      this.socket = null;
      this.connected.set(false);
      if (this.session.authenticated()) this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    if (!this.session.authenticated() || this.reconnectTimer !== null) return;
    const baseDelay = Math.min(1000 * 2 ** this.reconnectAttempts, MAX_RECONNECT_DELAY_MS);
    const delay = baseDelay + Math.round(Math.random() * Math.min(1000, baseDelay / 4));
    this.reconnectAttempts += 1;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private disconnect(): void {
    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer);
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    this.reconnectTimer = null;
    this.refreshTimer = null;
    this.reconnectAttempts = 0;
    if (this.socket) {
      this.socket.onclose = null;
      this.socket.close();
      this.socket = null;
    }
    this.connected.set(false);
  }
}
