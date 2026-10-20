import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, ApiRequestError, errorMessage } from '../../api/client';
import type { Category, PageMeta, Product, ProductList } from '../../api/types';
import { Field } from '../../components/Field';
import { Modal } from '../../components/Modal';
import { Pagination } from '../../components/Pagination';
import { useToast } from '../../context/ToastContext';
import { formatPrice } from '../../lib/format';
import { EditControl, useCanEdit } from './ReadOnly';

interface FormState {
  sku: string;
  name: string;
  description: string;
  category: string;
  price: string;
  stock: string;
}

const emptyForm: FormState = { sku: '', name: '', description: '', category: 'electronics', price: '', stock: '0' };

export function AdminProducts() {
  const canEdit = useCanEdit();
  const { show } = useToast();
  const [params, setParams] = useSearchParams();
  const page = Number(params.get('page') ?? '1') || 1;
  const q = params.get('q') ?? '';
  const [products, setProducts] = useState<Product[] | null>(null);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState(q);
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    document.title = 'Admin: products – PlayLab Shop';
    api<{ data: Category[] }>('/categories').then((r) => setCategories(r.data)).catch(() => setCategories([]));
  }, []);

  const load = useCallback(async () => {
    const p = new URLSearchParams({ page: String(page), limit: '20', sort: 'name_asc' });
    if (q) p.set('q', q);
    try {
      const r = await api<ProductList>(`/products?${p}`);
      setProducts(r.data);
      setMeta(r.meta);
    } catch (err) {
      show(errorMessage(err), 'error');
    }
  }, [page, q, show]);

  useEffect(() => {
    load();
  }, [load]);

  const openEditor = (p: Product | 'new') => {
    setErrors({});
    setFormError('');
    setForm(
      p === 'new'
        ? emptyForm
        : {
            sku: p.sku,
            name: p.name,
            description: p.description,
            category: p.category.slug,
            price: (p.priceCents / 100).toFixed(2),
            stock: String(p.stock),
          },
    );
    setEditing(p);
  };

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!form.sku.trim()) e.sku = 'SKU is required';
    if (!form.name.trim()) e.name = 'Name is required';
    const price = Number(form.price);
    if (form.price.trim() === '' || Number.isNaN(price) || price < 0) e.priceCents = 'Enter a price of 0 or more';
    const stock = Number(form.stock);
    if (!Number.isInteger(stock) || stock < 0) e.stock = 'Stock must be a whole number of 0 or more';
    return e;
  };

  const onSave = async (ev: FormEvent) => {
    ev.preventDefault();
    setFormError('');
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    const body = {
      sku: form.sku.trim(),
      name: form.name.trim(),
      description: form.description,
      category: form.category,
      priceCents: Math.round(Number(form.price) * 100),
      stock: Number(form.stock),
    };
    setSaving(true);
    try {
      if (editing === 'new') {
        const r = await api<{ data: Product }>('/products', { method: 'POST', body });
        show(`${r.data.name} created`, 'success');
      } else if (editing) {
        const r = await api<{ data: Product }>(`/products/${editing.id}`, { method: 'PUT', body });
        show(`${r.data.name} saved`, 'success');
      }
      setEditing(null);
      await load();
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 422) setErrors(err.fieldErrors());
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (p: Product) => {
    // Native confirm dialog: handle it in tests with page.on('dialog').
    if (!window.confirm(`Delete ${p.name}? This cannot be undone.`)) return;
    try {
      await api(`/products/${p.id}`, { method: 'DELETE' });
      show(`${p.name} deleted`, 'success');
      await load();
    } catch (err) {
      show(errorMessage(err), 'error');
    }
  };

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    const p = new URLSearchParams();
    if (search.trim()) p.set('q', search.trim());
    setParams(p);
  };

  const goToPage = (n: number) => {
    const p = new URLSearchParams(params);
    if (n <= 1) p.delete('page');
    else p.set('page', String(n));
    setParams(p);
  };

  return (
    <section aria-labelledby="admin-products-heading">
      <h2 id="admin-products-heading">Products</h2>
      <div className="admin-toolbar">
        <form role="search" className="inline-form" onSubmit={onSearch} aria-label="Search products">
          <label htmlFor="admin-product-search">Search</label>
          <input id="admin-product-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="admin-product-search-input" />
          <button type="submit" data-testid="admin-product-search-button">
            Search
          </button>
        </form>
        <EditControl id="new-product">
          <button type="button" disabled={!canEdit} onClick={() => openEditor('new')} data-testid="new-product-button">
            New product
          </button>
        </EditControl>
      </div>
      {!products && <p role="status">Loading products…</p>}
      {products && (
        <>
          <p className="result-count" role="status" data-testid="admin-products-count">
            {meta?.total ?? 0} products
          </p>
          <table className="data-table" data-testid="admin-products-table">
            <caption className="visually-hidden">Products</caption>
            <thead>
              <tr>
                <th scope="col">Product</th>
                <th scope="col">SKU</th>
                <th scope="col">Category</th>
                <th scope="col">Price</th>
                <th scope="col">Stock</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} data-testid="admin-product-row" data-product-id={p.id}>
                  <th scope="row" data-label="Product">
                    <Link to={`/products/${p.id}`} data-testid="admin-product-link">
                      {p.name}
                    </Link>
                  </th>
                  <td data-label="SKU">{p.sku}</td>
                  <td data-label="Category">{p.category.name}</td>
                  <td data-label="Price" data-testid="admin-product-price" data-cents={p.priceCents}>
                    {formatPrice(p.priceCents)}
                  </td>
                  <td data-label="Stock" data-testid="admin-product-stock">
                    {p.stock}
                  </td>
                  <td>
                    <span className="row-actions">
                      <EditControl id={`product-edit-${p.id}`}>
                        <button type="button" className="secondary" disabled={!canEdit} onClick={() => openEditor(p)} aria-label={`Edit ${p.name}`} data-testid="admin-product-edit">
                          Edit
                        </button>
                      </EditControl>
                      <EditControl id={`product-delete-${p.id}`}>
                        <button type="button" className="secondary danger" disabled={!canEdit} onClick={() => onDelete(p)} aria-label={`Delete ${p.name}`} data-testid="admin-product-delete">
                          Delete
                        </button>
                      </EditControl>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {meta && <Pagination page={meta.page} totalPages={meta.totalPages} onPage={goToPage} />}
        </>
      )}

      <Modal open={editing !== null} title={editing === 'new' ? 'New product' : 'Edit product'} onClose={() => setEditing(null)} testId="product-modal">
        <form onSubmit={onSave} noValidate data-testid="product-form">
          {formError && (
            <p className="alert error" role="alert" data-testid="product-form-error">
              {formError}
            </p>
          )}
          <Field id="pf-name" label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={errors.name} testId="product-form-name" />
          <div className="row">
            <Field id="pf-sku" label="SKU" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} error={errors.sku} testId="product-form-sku" />
            <div className="field">
              <label htmlFor="pf-category">Category</label>
              <select id="pf-category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} data-testid="product-form-category">
                {categories.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="row">
            <Field id="pf-price" label="Price (€, excl. VAT)" type="number" min={0} step="0.01" inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} error={errors.priceCents} testId="product-form-price" />
            <Field id="pf-stock" label="Stock" type="number" min={0} step={1} inputMode="numeric" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} error={errors.stock} testId="product-form-stock" />
          </div>
          <div className="field">
            <label htmlFor="pf-description">Description</label>
            <textarea id="pf-description" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} data-testid="product-form-description" />
          </div>
          <div className="form-actions">
            <button type="button" className="secondary" onClick={() => setEditing(null)} data-testid="product-form-cancel">
              Cancel
            </button>
            <button type="submit" disabled={saving} data-testid="product-form-save">
              {saving ? 'Saving…' : 'Save product'}
            </button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
