'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { PencilSquareIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import { SitePageShell } from '@/components/dashboard/SiteNav';
import { apiService } from '@/services/api';
import { formatMoney } from '@/lib/storefront';
import type { Product, ProductInput, Site } from '@/types/api';

type FormTarget = Product | 'new' | null;
type Status = 'loading' | 'ready' | 'signed-out';

const FIELD =
  'w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ink';

function ProductForm({
  target,
  currency,
  busy,
  onCancel,
  onSubmit,
}: {
  target: Product | 'new';
  currency: string;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (values: ProductInput) => void;
}) {
  const existing = target === 'new' ? null : target;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        onSubmit({
          name: String(data.get('name') ?? '').trim(),
          description: String(data.get('description') ?? '').trim() || null,
          price: Number(data.get('price') ?? 0),
          stock: Number(data.get('stock') ?? 0),
          category: String(data.get('category') ?? '').trim() || null,
          is_active: data.get('is_active') === 'on',
        });
      }}
      className="rounded-xl border border-line bg-paper p-5"
    >
      <h2 className="font-serif text-xl">{existing ? 'Edit product' : 'New product'}</h2>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="sm:col-span-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted">Name</span>
          <input name="name" required defaultValue={existing?.name ?? ''} className={`mt-1.5 ${FIELD}`} />
        </label>

        <label>
          <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted">
            Price ({currency})
          </span>
          <input
            name="price"
            type="number"
            min={0}
            step="0.01"
            required
            defaultValue={existing ? String(existing.price) : ''}
            className={`mt-1.5 ${FIELD}`}
          />
        </label>

        <label>
          <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted">
            In stock
          </span>
          <input
            name="stock"
            type="number"
            min={0}
            step="1"
            required
            defaultValue={existing ? String(existing.stock) : '0'}
            className={`mt-1.5 ${FIELD}`}
          />
        </label>

        <label>
          <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted">
            Category
          </span>
          <input name="category" defaultValue={existing?.category ?? ''} className={`mt-1.5 ${FIELD}`} />
        </label>

        <label className="flex items-end gap-2 pb-2">
          <input
            name="is_active"
            type="checkbox"
            defaultChecked={existing ? existing.is_active : true}
            className="h-4 w-4 rounded border-line accent-accent"
          />
          <span className="text-xs text-ink">Show in the shop</span>
        </label>

        <label className="sm:col-span-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted">
            Description
          </span>
          <textarea
            name="description"
            rows={3}
            defaultValue={existing?.description ?? ''}
            className={`mt-1.5 resize-y ${FIELD}`}
          />
        </label>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-full bg-ink px-5 py-2.5 text-xs font-bold text-paper hover:bg-ink-soft disabled:opacity-50"
        >
          {busy ? 'Saving…' : existing ? 'Save changes' : 'Add product'}
        </button>
        <button type="button" onClick={onCancel} className="text-xs font-bold text-muted hover:text-ink">
          Cancel
        </button>
      </div>
    </form>
  );
}

export function ProductsManager({ siteId }: { siteId: string }) {
  const [site, setSite] = useState<Site | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<FormTarget>(null);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [loadedSite, loadedProducts] = await Promise.all([
        apiService.getSite(siteId),
        apiService.getProducts(siteId),
      ]);
      setSite(loadedSite);
      setProducts(loadedProducts);
      setStatus('ready');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load products.');
      setStatus('ready');
    }
  }, [siteId]);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) void load();
    });
    return () => {
      active = false;
    };
  }, [load]);

  const save = async (values: ProductInput) => {
    setBusy(true);
    setError(null);
    try {
      if (editing && editing !== 'new') {
        const updated = await apiService.updateProduct(siteId, editing.id, values);
        setProducts((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      } else {
        const created = await apiService.createProduct(siteId, values);
        setProducts((current) => [...current, created]);
      }
      setEditing(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save the product.');
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (product: Product) => {
    setBusyId(product.id);
    setError(null);
    try {
      const updated = await apiService.updateProduct(siteId, product.id, {
        is_active: !product.is_active,
      });
      setProducts((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not update the product.');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (product: Product) => {
    if (!window.confirm(`Delete “${product.name}”? Orders that already include it are unaffected.`)) {
      return;
    }
    setBusyId(product.id);
    setError(null);
    try {
      await apiService.deleteProduct(siteId, product.id);
      setProducts((current) => current.filter((item) => item.id !== product.id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not delete the product.');
    } finally {
      setBusyId(null);
    }
  };

  if (status === 'loading') {
    return <p className="text-sm text-muted">Loading products…</p>;
  }

  const currency = site?.currency ?? 'GBP';

  return (
    <SitePageShell
      siteId={siteId}
      siteName={site?.name ?? ''}
      title="Products"
      description={`${products.length} ${products.length === 1 ? 'item' : 'items'}`}
      actions={
        editing ? undefined : (
          <button
            type="button"
            onClick={() => setEditing('new')}
            className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-xs font-bold text-paper hover:bg-ink-soft"
          >
            <PlusIcon className="h-3.5 w-3.5" /> Add product
          </button>
        )
      }
    >
      {error && (
        <div
          role="alert"
          className="mb-6 rounded-xl border border-danger-line bg-danger-surface px-4 py-3 text-sm text-danger"
        >
          {error}
        </div>
      )}

      {editing && (
        <div className="mb-6">
          <ProductForm
            key={editing === 'new' ? 'new' : editing.id}
            target={editing}
            currency={currency}
            busy={busy}
            onCancel={() => setEditing(null)}
            onSubmit={save}
          />
        </div>
      )}

      {products.length === 0 && !editing ? (
        <div className="rounded-2xl border border-dashed border-line-strong bg-paper p-10 text-center">
          <p className="font-serif text-2xl">Nothing for sale yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
            Add your first product, then place a Products block on a page and it will appear there.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => setEditing('new')}
              className="rounded-full bg-ink px-5 py-3 text-sm font-bold text-paper hover:bg-ink-soft"
            >
              Add product
            </button>
            <Link
              href={`/builder/${siteId}/edit`}
              className="rounded-full border border-line-strong px-5 py-3 text-sm font-bold hover:border-ink"
            >
              Open the editor
            </Link>
          </div>
        </div>
      ) : (
        products.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-line bg-paper">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-[10px] uppercase tracking-[0.16em] text-muted">
                <tr>
                  <th className="px-4 py-3 font-bold">Product</th>
                  <th className="px-4 py-3 font-bold">Price</th>
                  <th className="px-4 py-3 font-bold">Stock</th>
                  <th className="px-4 py-3 font-bold">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {products.map((product) => (
                  <tr key={product.id} className="align-top">
                    <td className="px-4 py-3">
                      <p className="font-bold text-ink">{product.name}</p>
                      {product.category && (
                        <p className="mt-0.5 text-xs text-muted">{product.category}</p>
                      )}
                      {product.description && (
                        <p className="mt-1 max-w-md text-xs leading-5 text-muted">
                          {product.description}
                        </p>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-ink">
                      {formatMoney(product.price, currency)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={product.stock === 0 ? 'text-muted' : 'text-ink'}>
                        {product.stock === 0 ? 'Sold out' : product.stock}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        disabled={busyId === product.id}
                        onClick={() => void toggleActive(product)}
                        className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider disabled:opacity-40 ${
                          product.is_active ? 'bg-ink text-paper' : 'bg-canvas text-muted'
                        }`}
                        title={product.is_active ? 'Shown in the shop — click to hide' : 'Hidden — click to show'}
                      >
                        {product.is_active ? 'Shown' : 'Hidden'}
                      </button>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setEditing(product)}
                        className="rounded-md p-1.5 text-muted hover:bg-canvas hover:text-ink"
                        title="Edit"
                      >
                        <PencilSquareIcon className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        disabled={busyId === product.id}
                        onClick={() => void remove(product)}
                        className="rounded-md p-1.5 text-muted hover:bg-canvas hover:text-ink disabled:opacity-40"
                        title="Delete"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {products.length > 0 && (
        <p className="mt-4 text-xs leading-5 text-muted">
          Products appear wherever a <strong className="text-ink">Products</strong> block is placed in
          the editor. Hiding one keeps it on past orders but removes it from the shop.
        </p>
      )}
    </SitePageShell>
  );
}
