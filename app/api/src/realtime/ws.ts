import { IncomingMessage, Server } from 'http';
import { Duplex } from 'stream';
import { WebSocket, WebSocketServer } from 'ws';
import { events, OrderStatusChanged } from '../lib/events';
import { AccessClaims, verifyAccessToken } from '../lib/tokens';
import { SESSION_COOKIE } from '../middleware/auth';

export const ORDERS_WS_PATH = '/ws/orders';
const HEARTBEAT_MS = 30_000;

interface Client {
  ws: WebSocket;
  userId: number;
  role: AccessClaims['role'];
  alive: boolean;
}

function readCookie(header: string | undefined, name: string): string | null {
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

function reject(socket: Duplex, status: number, message: string) {
  const body = JSON.stringify({ error: { code: status === 401 ? 'UNAUTHORIZED' : 'NOT_FOUND', message, details: null } });
  socket.write(
    `HTTP/1.1 ${status} ${status === 401 ? 'Unauthorized' : 'Not Found'}\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`,
  );
  socket.destroy();
}

/**
 * Live order status at ws://<host>/ws/orders. Authenticates with the session cookie or ?token=<accessToken>.
 * Customers receive events for their own orders; admin and support receive every order's events.
 */
export function attachOrderSocket(server: Server) {
  const wss = new WebSocketServer({ noServer: true });
  const clients = new Set<Client>();

  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname !== ORDERS_WS_PATH) return reject(socket, 404, 'No WebSocket here');
    const token = url.searchParams.get('token') ?? readCookie(req.headers.cookie, SESSION_COOKIE);
    let claims: AccessClaims;
    try {
      if (!token) throw new Error('missing');
      claims = verifyAccessToken(token);
    } catch {
      return reject(socket, 401, 'Authentication required');
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const client: Client = { ws, userId: Number(claims.sub), role: claims.role, alive: true };
      clients.add(client);
      ws.on('pong', () => (client.alive = true));
      ws.on('close', () => clients.delete(client));
      ws.on('message', (raw) => {
        // Clients may send {"type":"ping"}; anything else is ignored.
        try {
          if (JSON.parse(raw.toString()).type === 'ping') ws.send(JSON.stringify({ type: 'pong', at: new Date().toISOString() }));
        } catch {
          /* ignore */
        }
      });
      ws.send(JSON.stringify({ type: 'hello', userId: client.userId, role: client.role }));
    });
  });

  events.onEvent('orderStatusChanged', (e: OrderStatusChanged) => {
    const message = JSON.stringify({ type: 'order.status', orderId: e.orderId, number: e.number, status: e.to, from: e.from, at: e.at });
    for (const c of clients) {
      const staff = c.role === 'admin' || c.role === 'support';
      if ((staff || c.userId === e.userId) && c.ws.readyState === WebSocket.OPEN) c.ws.send(message);
    }
  });

  const heartbeat = setInterval(() => {
    for (const c of clients) {
      if (!c.alive) {
        c.ws.terminate();
        clients.delete(c);
        continue;
      }
      c.alive = false;
      c.ws.ping();
    }
  }, HEARTBEAT_MS);
  server.on('close', () => clearInterval(heartbeat));
  return wss;
}
