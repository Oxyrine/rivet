'use client';
import { getSession } from './api';

function getWebSocketUrl(token: string): string | null {
  if (typeof window === 'undefined') return null;

  // 1. Explicit WS URL from environment
  if (process.env.NEXT_PUBLIC_WS_URL) {
    const base = process.env.NEXT_PUBLIC_WS_URL.replace(/\/+$/, '');
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}token=${encodeURIComponent(token)}`;
  }

  // 2. Derive from NEXT_PUBLIC_API_URL if present
  if (process.env.NEXT_PUBLIC_API_URL) {
    const base = process.env.NEXT_PUBLIC_API_URL.replace(/^http/i, 'ws').replace(/\/+$/, '');
    return `${base}/ws?token=${encodeURIComponent(token)}`;
  }

  // 3. Localhost development: connect directly to local FastAPI server on port 8000
  const isLocal = ['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(window.location.hostname);
  if (isLocal) {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.hostname}:8000/ws?token=${encodeURIComponent(token)}`;
  }

  // 4. On Vercel / serverless deployments without a configured WS URL, Vercel cannot
  // proxy or upgrade WebSockets. Return null so the app falls back cleanly to snapshot polling
  // without logging unhandled WebSocket connection errors in the browser console.
  return null;
}

/** A reconnecting audit-event channel. Snapshot polling remains the fallback. */
export function subscribeEvents(onEvent: (event: any) => void, onStatus?: (connected: boolean) => void) {
  let socket: WebSocket | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;
  let opened = false;
  let failures = 0;

  function connect() {
    if (closed) return;
    const token = getSession()?.token;
    if (!token) {
      onStatus?.(false);
      return;
    }

    const wsUrl = getWebSocketUrl(token);
    if (!wsUrl) {
      onStatus?.(false);
      return;
    }

    try {
      socket = new WebSocket(wsUrl);
      socket.onopen = () => {
        opened = true;
        failures = 0;
        onStatus?.(true);
      };
      socket.onmessage = message => {
        try {
          onEvent(JSON.parse(message.data));
        } catch {}
      };
      socket.onclose = () => {
        onStatus?.(false);
        if (!opened && ++failures >= 2) return;
        if (!closed) timer = setTimeout(connect, 5000);
      };
      socket.onerror = () => {
        try {
          socket?.close();
        } catch {}
      };
    } catch {
      onStatus?.(false);
    }
  }

  connect();
  return () => {
    closed = true;
    if (timer) clearTimeout(timer);
    try {
      socket?.close();
    } catch {}
  };
}

