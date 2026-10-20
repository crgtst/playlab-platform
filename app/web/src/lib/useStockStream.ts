import { useEffect, useState } from 'react';

export type StreamState = 'connecting' | 'open' | 'error';

/** Live stock for the given products over SSE (GET /api/v1/stock/stream). */
export function useStockStream(ids: number[]) {
  const [stock, setStock] = useState<Record<number, number>>({});
  const [state, setState] = useState<StreamState>('connecting');
  const key = ids.join(',');

  useEffect(() => {
    if (!key) return;
    const source = new EventSource(`/api/v1/stock/stream?ids=${key}`);
    setState('connecting');
    source.addEventListener('open', () => setState('open'));
    source.addEventListener('error', () => setState('error'));
    source.addEventListener('snapshot', (e) => {
      const data = JSON.parse((e as MessageEvent).data) as { products: { productId: number; stock: number }[] };
      setStock(Object.fromEntries(data.products.map((p) => [p.productId, p.stock])));
      setState('open');
    });
    source.addEventListener('stock', (e) => {
      const data = JSON.parse((e as MessageEvent).data) as { productId: number; stock: number };
      setStock((s) => ({ ...s, [data.productId]: data.stock }));
    });
    return () => source.close();
  }, [key]);

  return { stock, state };
}
