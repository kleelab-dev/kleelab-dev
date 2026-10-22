'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowDownIcon, ArrowUpIcon, ExclamationTriangleIcon, PlusIcon, StarIcon } from '@heroicons/react/24/outline';
import { Button } from '@/components/ui/Button';
import { Panel, Pill } from '@/components/project/Pill';
import { errorText, formatMoney, timeAgo } from '@/components/project/format';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States';
import { apiService } from '@/services/api';
import type { PortfolioItem, PortfolioKind } from '@/types/api';
import { KIND_LABEL, PORTFOLIO_STATUS, blankItem } from './portfolioText';

type Filter = 'all' | PortfolioKind;

/** Every portfolio item, in the order visitors see them, with how each is doing. */
export function PortfolioList() {
  const router = useRouter();
  const [items, setItems] = useState<PortfolioItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [filter, setFilter] = useState<Filter>('all');
  const [adding, setAdding] = useState(false);
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    let active = true;
    apiService
      .adminPortfolio()
      .then((list) => active && setItems(list))
      .catch((reason) => active && setError(errorText(reason)));
    return () => {
      active = false;
    };
  }, [attempt]);

  async function move(index: number, direction: -1 | 1) {
    if (!items) return;
    const next = [...items];
    [next[index], next[index + direction]] = [next[index + direction], next[index]];
    setItems(next);
    setMoving(true);
    try {
      setItems(await apiService.adminOrderPortfolio(next.map((i) => i.id)));
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setMoving(false);
    }
  }

  const shown = items?.filter((i) => filter === 'all' || i.kind === filter) ?? [];
  const broken = items?.filter((i) => i.demo_status === 'broken' && i.status !== 'archived') ?? [];

  return (
    <div>
      <p className="tag">on the website</p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-4xl font-extrabold tracking-tightest sm:text-5xl">Portfolio</h1>
        {!adding && (
          <Button type="button" onClick={() => setAdding(true)} disabled={!items}>
            <PlusIcon className="h-4 w-4" aria-hidden /> New item
          </Button>
        )}
      </div>
      <p className="mt-3 max-w-2xl text-muted">
        Sites we built (with the client&rsquo;s agreement) and ready-made sites we sell and change to suit the buyer.
        Items show on the Portfolio page in this order, featured ones first. An enquiry from an item&rsquo;s page
        arrives under Enquiries, and a proposal for a ready-made site starts with its price and steps.
      </p>

      {adding && <NewItem onCreated={(item) => router.push(`/portfolio/${item.id}`)} onCancel={() => setAdding(false)} />}

      {broken.length > 0 && (
        <div role="status" className="mt-6 flex items-start gap-3 rounded-xl border-[1.5px] border-danger bg-white p-4 text-sm">
          <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-hidden />
          <p>
            <strong>{broken.length === 1 ? 'One demo link is' : `${broken.length} demo links are`} not working:</strong>{' '}
            {broken.map((item, n) => (
              <span key={item.id}>
                {n > 0 && ', '}
                <Link href={`/portfolio/${item.id}`} className="font-semibold text-cobalt underline">{item.title}</Link>
              </span>
            ))}
            . Visitors who press &ldquo;Open live demo&rdquo; get an error page.
          </p>
        </div>
      )}

      <div className="mt-8 flex flex-wrap gap-2" role="group" aria-label="Show">
        {(['all', 'work', 'for_sale'] as Filter[]).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
            className={`rounded-full border-[1.5px] px-3.5 py-1 text-sm font-semibold ${filter === value ? 'border-ink bg-ink text-paper' : 'border-line bg-white hover:border-ink'}`}
          >
            {value === 'all' ? 'Everything' : KIND_LABEL[value]}
            {items && <span className="ml-1.5 font-mono text-xs opacity-70">{value === 'all' ? items.length : items.filter((i) => i.kind === value).length}</span>}
          </button>
        ))}
      </div>

      <div className="mt-5 grid gap-3">
        {error && <ErrorState message={error} onRetry={() => { setError(null); setItems(null); setAttempt((n) => n + 1); }} />}
        {!error && items === null && <Skeleton rows={3} />}
        {items && shown.length === 0 && (
          <EmptyState title={items.length ? 'Nothing of this kind yet' : 'Nothing in the portfolio yet'}>
            Add a site we built, or a ready-made site to sell. You can also start one from a finished project&rsquo;s hand-over.
          </EmptyState>
        )}
        {shown.map((item) => {
          const index = items!.indexOf(item);
          const status = PORTFOLIO_STATUS[item.status];
          const cover = item.images[0];
          return (
            <article key={item.id} className="card flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
              <Link href={`/portfolio/${item.id}`} className="block aspect-[16/10] w-full shrink-0 overflow-hidden rounded-lg border-[1.5px] border-line bg-paper sm:w-40">
                {cover ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a small admin thumbnail from Cloudinary
                  <img src={cover.url} alt="" className="h-full w-full object-cover object-top" loading="lazy" />
                ) : (
                  <span className="grid h-full place-items-center font-mono text-[10px] uppercase tracking-label text-muted">No screenshot</span>
                )}
              </Link>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone={status.tone}>{status.label}</Pill>
                  <span className="font-mono text-[10px] uppercase tracking-label text-muted">{KIND_LABEL[item.kind]}</span>
                  {item.featured && (
                    <span className="inline-flex items-center gap-0.5 font-mono text-[10px] uppercase tracking-label text-ink">
                      <StarIcon className="h-3 w-3" aria-hidden /> Featured
                    </span>
                  )}
                  {item.demo_status === 'broken' && <Pill tone="bg-danger text-white">Demo broken</Pill>}
                </div>
                <h2 className="mt-1.5 truncate font-semibold">
                  <Link href={`/portfolio/${item.id}`} className="hover:underline">{item.title}</Link>
                </h2>
                <p className="mt-0.5 line-clamp-1 text-sm text-muted">
                  {item.kind === 'for_sale'
                    ? [item.price_cents ? `from ${formatMoney(item.price_cents, item.currency)}` : 'No price yet', item.exclusive ? 'sold once' : null].filter(Boolean).join(' · ')
                    : item.client_name ?? 'No client named'}
                  {item.missing.length > 0 && item.status === 'draft' && ` · needs ${item.missing.join(', ')}`}
                </p>
              </div>
              <dl className="grid shrink-0 grid-cols-3 gap-4 text-center sm:w-56">
                <Stat label="Views" value={item.view_count} />
                <Stat label="Demo clicks" value={item.demo_clicks} />
                <Stat label="Enquiries" value={item.enquiries} />
              </dl>
              <div className="flex shrink-0 items-center gap-1 text-muted sm:flex-col">
                <button type="button" aria-label={`Move ${item.title} up`} disabled={moving || index === 0} onClick={() => move(index, -1)} className="rounded p-1 hover:text-ink disabled:opacity-30">
                  <ArrowUpIcon className="h-4 w-4" aria-hidden />
                </button>
                <button type="button" aria-label={`Move ${item.title} down`} disabled={moving || index === items!.length - 1} onClick={() => move(index, 1)} className="rounded p-1 hover:text-ink disabled:opacity-30">
                  <ArrowDownIcon className="h-4 w-4" aria-hidden />
                </button>
              </div>
              <p className="font-mono text-[10px] uppercase tracking-label text-muted sm:hidden">Changed {timeAgo(item.updated_at)}</p>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="font-mono text-[10px] uppercase tracking-label text-muted">{label}</dt>
      <dd className="mt-0.5 font-display text-xl font-extrabold">{value}</dd>
    </div>
  );
}

function NewItem({ onCreated, onCancel }: { onCreated: (item: PortfolioItem) => void; onCancel: () => void }) {
  const [kind, setKind] = useState<PortfolioKind>('for_sale');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (title.trim().length < 2) return setError('Give it a name.');
    setBusy(true);
    setError(null);
    try {
      onCreated(await apiService.adminCreatePortfolioItem({ ...blankItem(kind), title: title.trim() }));
    } catch (reason) {
      setError(errorText(reason));
      setBusy(false);
    }
  }

  return (
    <Panel tag="new item" title="Add to the portfolio" className="mt-6 shadow-block">
      <form onSubmit={submit} className="grid gap-4">
        <fieldset>
          <legend className="label">What is it?</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {(['for_sale', 'work'] as PortfolioKind[]).map((value) => (
              <label key={value} className={`flex cursor-pointer gap-3 rounded-xl border-[1.5px] p-3 ${kind === value ? 'border-ink bg-paper' : 'border-line'}`}>
                <input type="radio" name="kind" value={value} checked={kind === value} onChange={() => setKind(value)} className="mt-1" />
                <span>
                  <span className="block font-semibold">{KIND_LABEL[value]}</span>
                  <span className="text-sm text-muted">
                    {value === 'for_sale'
                      ? 'A site ready to sell, changed to suit the buyer. Has a price.'
                      : 'A site we built for a client. Needs their agreement to show.'}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <label htmlFor="p-new-title" className="label">Name</label>
          <input id="p-new-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} className="field"
            placeholder={kind === 'for_sale' ? 'Bakery with online orders' : 'Ade Fabrics online shop'} autoFocus />
        </div>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="flex gap-2">
          <Button type="submit" disabled={busy}>{busy ? 'Starting…' : 'Start a draft'}</Button>
          <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        </div>
      </form>
    </Panel>
  );
}
