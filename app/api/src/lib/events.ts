import { EventEmitter } from 'events';

export interface OrderStatusChanged {
  orderId: number;
  number: string;
  userId: number;
  from: string;
  to: string;
  changedBy: number;
  at: string;
}

export interface StockChanged {
  productId: number;
  stock: number;
}

interface AppEvents {
  orderStatusChanged: [OrderStatusChanged];
  stockChanged: [StockChanged];
  stockReset: [];
}

/** In-process event bus. The WebSocket channel and the SSE stock stream subscribe to it. */
class TypedEmitter extends EventEmitter {
  emitEvent<K extends keyof AppEvents>(name: K, ...args: AppEvents[K]) {
    return this.emit(name, ...args);
  }
  onEvent<K extends keyof AppEvents>(name: K, listener: (...args: AppEvents[K]) => void) {
    return this.on(name, listener as (...a: unknown[]) => void);
  }
}

export const events = new TypedEmitter();
events.setMaxListeners(0); // one listener per open SSE / WebSocket connection
