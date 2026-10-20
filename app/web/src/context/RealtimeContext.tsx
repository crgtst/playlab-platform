import { createContext, ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext';

export interface OrderStatusEvent {
  type: 'order.status';
  orderId: number;
  number: string;
  status: string;
  from: string;
  at: string;
}

type SocketState = 'idle' | 'connecting' | 'open' | 'closed';

interface Realtime {
  state: SocketState;
  subscribe: (fn: (e: OrderStatusEvent) => void) => () => void;
}

const RealtimeContext = createContext<Realtime | null>(null);
const BACKOFF_MS = [1000, 2000, 5000, 10000];

/** One WebSocket to /ws/orders while signed in; reconnects with backoff. */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [state, setState] = useState<SocketState>('idle');
  const listeners = useRef(new Set<(e: OrderStatusEvent) => void>());

  useEffect(() => {
    if (!user) {
      setState('idle');
      return;
    }
    let ws: WebSocket | null = null;
    let attempt = 0;
    let timer: number | undefined;
    let stopped = false;

    const connect = () => {
      setState('connecting');
      const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/orders`;
      ws = new WebSocket(url);
      ws.onopen = () => {
        attempt = 0;
        setState('open');
      };
      ws.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data);
          if (data.type === 'order.status') listeners.current.forEach((fn) => fn(data));
        } catch {
          /* ignore malformed messages */
        }
      };
      ws.onclose = () => {
        setState('closed');
        if (stopped) return;
        timer = window.setTimeout(connect, BACKOFF_MS[Math.min(attempt++, BACKOFF_MS.length - 1)]);
      };
    };
    connect();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      ws?.close();
    };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const value: Realtime = {
    state,
    subscribe: (fn) => {
      listeners.current.add(fn);
      return () => listeners.current.delete(fn);
    },
  };
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

/** Calls `fn` for every live order status change the signed-in user may see. */
export function useOrderEvents(fn: (e: OrderStatusEvent) => void) {
  const ctx = useContext(RealtimeContext);
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => ctx?.subscribe((e) => ref.current(e)), [ctx]);
}

export function useRealtimeState(): SocketState {
  return useContext(RealtimeContext)?.state ?? 'idle';
}
