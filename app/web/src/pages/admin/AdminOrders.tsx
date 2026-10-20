import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '../../api/client';
import { Order, ORDER_STATUSES, OrderStatus, PageMeta } from '../../api/types';
import { LiveIndicator } from '../../components/LiveIndicator';
import { Modal } from '../../components/Modal';
import { useOnline } from '../../components/OfflineBanner';
import { useOrderEvents } from '../../context/RealtimeContext';
import { Pagination } from '../../components/Pagination';
import { useToast } from '../../context/ToastContext';
import { formatDateTime, formatPrice } from '../../lib/format';
import { EditControl, useCanEdit } from './ReadOnly';

const LIMIT = 10;

export function AdminOrders() {
  const canEdit = useCanEdit();
  const { show } = useToast();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const q = params.get('q') ?? '';
  const page = Number(params.get('page') ?? '1') || 1;

  const [orders, setOrders] = useState<Order[] | null>(null);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState(q);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<{ id: number; status: OrderStatus } | null>(null);
  const [saving, setSaving] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<OrderStatus>('processing');
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    document.title = 'Admin: orders – PlayLab Shop';
  }, []);
  useEffect(() => setSearch(q), [q]);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (status) p.set('status', status);
    if (q) p.set('q', q);
    return p;
  }, [status, q]);

  const load = useCallback(async () => {
    setError('');
    try {
      const p = new URLSearchParams(query);
      p.set('page', String(page));
      p.set('limit', String(LIMIT));
      const r = await api<{ data: Order[]; meta: PageMeta }>(`/orders?${p}`);
      setOrders(r.data);
      setMeta(r.meta);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [query, page]);

  useEffect(() => {
    load();
    setSelected(new Set());
    setEditing(null);
  }, [load]);
  useOnline(load);

  // Status changes made anywhere (another admin, a bulk action) arrive over the WebSocket.
  useOrderEvents((e) => setOrders((list) => list?.map((o) => (o.id === e.orderId ? { ...o, status: e.status as OrderStatus } : o)) ?? null));

  const setFilter = (key: 'status' | 'q', value: string) => {
    const p = new URLSearchParams(params);
    if (value) p.set(key, value);
    else p.delete(key);
    p.delete('page');
    setParams(p);
  };

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    setFilter('q', search.trim());
  };

  const goToPage = (n: number) => {
    const p = new URLSearchParams(params);
    if (n <= 1) p.delete('page');
    else p.set('page', String(n));
    setParams(p);
  };

  const toggle = (id: number) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allSelected = !!orders?.length && orders.every((o) => selected.has(o.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(orders?.map((o) => o.id)));

  const saveStatus = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const r = await api<{ data: Order }>(`/orders/${editing.id}/status`, { method: 'PATCH', body: { status: editing.status } });
      setOrders((list) => list?.map((o) => (o.id === r.data.id ? r.data : o)) ?? null);
      show(`Order ${r.data.number} is now ${r.data.status}`, 'success');
      setEditing(null);
    } catch (err) {
      show(errorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const applyBulk = async () => {
    setSaving(true);
    try {
      const r = await api<{ data: Order[]; meta: { updated: number } }>('/orders/bulk-status', {
        method: 'POST',
        body: { ids: [...selected], status: bulkStatus },
      });
      show(`${r.meta.updated} ${r.meta.updated === 1 ? 'order' : 'orders'} changed to ${bulkStatus}`, 'success');
      setConfirmOpen(false);
      setSelected(new Set());
      await load();
    } catch (err) {
      show(errorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const exportHref = `/api/v1/orders/export.csv${query.toString() ? `?${query}` : ''}`;

  return (
    <section aria-labelledby="admin-orders-heading">
      <h2 id="admin-orders-heading">Orders</h2>
      <LiveIndicator />
      <div className="admin-toolbar">
        <div className="field">
          <label htmlFor="admin-status-filter">Status</label>
          <select id="admin-status-filter" value={status} onChange={(e) => setFilter('status', e.target.value)} data-testid="admin-status-filter">
            <option value="">All statuses</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <form role="search" className="inline-form" onSubmit={onSearch} aria-label="Search orders">
          <label htmlFor="admin-search">Search</label>
          <input
            id="admin-search"
            type="search"
            placeholder="Order number, email or name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="admin-search-input"
          />
          <button type="submit" data-testid="admin-search-button">
            Search
          </button>
        </form>
        {canEdit ? (
          <a href={exportHref} download className="button secondary" data-testid="export-csv-link">
            Export CSV
          </a>
        ) : (
          <EditControl id="export">
            <button type="button" className="secondary" disabled data-testid="export-csv-link">
              Export CSV
            </button>
          </EditControl>
        )}
      </div>

      {selected.size > 0 && (
        <div className="bulk-bar" role="region" aria-label="Bulk actions" data-testid="bulk-bar">
          <span data-testid="bulk-selected-count">{selected.size} selected</span>
          <label htmlFor="bulk-status">Change status to</label>
          <select id="bulk-status" value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value as OrderStatus)} disabled={!canEdit} data-testid="bulk-status-select">
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <EditControl id="bulk">
            <button type="button" disabled={!canEdit} onClick={() => setConfirmOpen(true)} data-testid="bulk-apply-button">
              Apply
            </button>
          </EditControl>
          <button type="button" className="link-button" onClick={() => setSelected(new Set())} data-testid="bulk-clear-button">
            Clear selection
          </button>
        </div>
      )}

      {error && (
        <div className="alert error" role="alert" data-testid="admin-orders-error">
          <p>{error}</p>
          <button type="button" onClick={load} data-testid="admin-orders-retry">
            Try again
          </button>
        </div>
      )}
      {!orders && !error && <p role="status">Loading orders…</p>}
      {orders && (
        <>
          <p className="result-count" role="status" data-testid="admin-orders-count" data-count={meta?.total}>
            {meta?.total ?? 0} {meta?.total === 1 ? 'order' : 'orders'}
          </p>
          {orders.length === 0 ? (
            <p className="empty-state" data-testid="admin-orders-empty">
              No orders match these filters.
            </p>
          ) : (
            <table className="data-table" data-testid="admin-orders-table">
              <caption className="visually-hidden">Orders</caption>
              <thead>
                <tr>
                  <th scope="col">
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all orders on this page" data-testid="select-all" />
                  </th>
                  <th scope="col">Order</th>
                  <th scope="col">Customer</th>
                  <th scope="col">Placed</th>
                  <th scope="col">Total</th>
                  <th scope="col">Status</th>
                  <th scope="col">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const isEditing = editing?.id === o.id;
                  return (
                    <tr key={o.id} data-testid="admin-order-row" data-order-id={o.id} data-status={o.status} data-selected={selected.has(o.id)}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selected.has(o.id)}
                          onChange={() => toggle(o.id)}
                          aria-label={`Select order ${o.number}`}
                          data-testid="row-select"
                        />
                      </td>
                      <th scope="row" data-label="Order">
                        <Link to={`/account/orders/${o.id}`} data-testid="admin-order-link">
                          {o.number}
                        </Link>
                      </th>
                      <td data-label="Customer">
                        <span dir="auto">{o.customer.name}</span>
                        <br />
                        <span className="muted small" data-testid="admin-order-email">
                          {o.customer.email}
                        </span>
                      </td>
                      <td data-label="Placed">
                        <time dateTime={o.createdAt}>{formatDateTime(o.createdAt)}</time>
                      </td>
                      <td data-label="Total" data-testid="admin-order-total" data-cents={o.totals.totalCents}>
                        {formatPrice(o.totals.totalCents)}
                      </td>
                      <td data-label="Status">
                        {isEditing ? (
                          <>
                            <label htmlFor={`status-${o.id}`} className="visually-hidden">
                              Status for {o.number}
                            </label>
                            <select
                              id={`status-${o.id}`}
                              value={editing.status}
                              onChange={(e) => setEditing({ id: o.id, status: e.target.value as OrderStatus })}
                              data-testid="admin-order-status-select"
                            >
                              {ORDER_STATUSES.map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </select>
                          </>
                        ) : (
                          <span className={`status status-${o.status}`} data-testid="admin-order-status">
                            {o.status}
                          </span>
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <span className="row-actions">
                            <button type="button" onClick={saveStatus} disabled={saving} data-testid="admin-order-save">
                              Save
                            </button>
                            <button type="button" className="secondary" onClick={() => setEditing(null)} data-testid="admin-order-cancel">
                              Cancel
                            </button>
                          </span>
                        ) : (
                          <EditControl id={`edit-${o.id}`}>
                            <button
                              type="button"
                              className="secondary"
                              disabled={!canEdit}
                              onClick={() => setEditing({ id: o.id, status: o.status })}
                              aria-label={`Edit status of ${o.number}`}
                              data-testid="admin-order-edit"
                            >
                              Edit
                            </button>
                          </EditControl>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {meta && <Pagination page={meta.page} totalPages={meta.totalPages} onPage={goToPage} />}
        </>
      )}

      <Modal
        open={confirmOpen}
        title="Change order status"
        onClose={() => setConfirmOpen(false)}
        testId="bulk-confirm-modal"
        footer={
          <>
            <button type="button" className="secondary" onClick={() => setConfirmOpen(false)} data-testid="bulk-cancel-button">
              Cancel
            </button>
            <button type="button" onClick={applyBulk} disabled={saving} data-testid="bulk-confirm-button">
              {saving ? 'Saving…' : 'Change status'}
            </button>
          </>
        }
      >
        <p data-testid="bulk-confirm-message">
          Change {selected.size} {selected.size === 1 ? 'order' : 'orders'} to <strong>{bulkStatus}</strong>?
        </p>
      </Modal>
    </section>
  );
}
