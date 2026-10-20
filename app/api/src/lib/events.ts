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

interface AppEvents {
  orderStatusChanged: [OrderStatusChanged];
}

/** In-process event bus. Phase 3's WebSocket channel subscribes to it. */
class TypedEmitter extends EventEmitter {
  emitEvent<K extends keyof AppEvents>(name: K, ...args: AppEvents[K]) {
    return this.emit(name, ...args);
  }
  onEvent<K extends keyof AppEvents>(name: K, listener: (...args: AppEvents[K]) => void) {
    return this.on(name, listener as (...a: unknown[]) => void);
  }
}

export const events = new TypedEmitter();
