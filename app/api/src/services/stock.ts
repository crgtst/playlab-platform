import { query } from '../db/pool';
import { events } from '../lib/events';

/** Tells SSE stock subscribers the current stock of these products. Call after the change has committed. */
export async function emitStock(productIds: number[]) {
  if (!productIds.length) return;
  const rows = await query<{ id: number; stock: number }>('SELECT id, stock FROM products WHERE id = ANY($1)', [productIds]);
  for (const r of rows) events.emitEvent('stockChanged', { productId: r.id, stock: r.stock });
}
