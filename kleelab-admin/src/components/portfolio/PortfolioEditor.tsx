'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowTopRightOnSquareIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  PhotoIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { Button, buttonClass } from '@/components/ui/Button';
import { Panel, Pill } from '@/components/project/Pill';
import { CURRENCIES, errorText, formatMoney, timeAgo } from '@/components/project/format';
import { TemplatePicker } from '@/components/library/TemplatePicker';
import { ErrorState, Skeleton } from '@/components/ui/States';
import { apiService } from '@/services/api';
import type { Currency, PortfolioItem, PortfolioItemInput, PortfolioStatus } from '@/types/api';
import { KIND_LABEL, PORTFOLIO_STATUS, toInput } from './portfolioText';

const MAX_IMAGES = 12;
const MAX_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/avif'];

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

/** The same rules the API applies before an item can go on the site. */
function missing(form: PortfolioItemInput): string[] {
  const gaps: string[] = [];
  if (!form.summary.trim()) gaps.push('a short summary');
  if (!form.images.length) gaps.push('at least one screenshot');
  else if (form.images.some((i) => !i.alt.trim())) gaps.push('a description for every screenshot');
  if (form.kind === 'work' && !form.client_permission) gaps.push("the client's agreement to show it");
  return gaps;
}

function toPrice(cents: number | null): string {
  return cents ? String(cents / 100) : '';
}

export function PortfolioEditor({ itemId }: { itemId: string }) {
  const router = useRouter();
  const [item, setItem] = useState<PortfolioItem | null>(null);
  const [form, setForm] = useState<PortfolioItemInput | null>(null);
  const [price, setPrice] = useState('');
  const [tags, setTags] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function load(next: PortfolioItem) {
    setItem(next);
    setForm(toInput(next));
    setPrice(toPrice(next.price_cents));
    setTags(next.tags.join(', '));
  }

  useEffect(() => {
    let active = true;
    apiService
      .adminPortfolioItem(itemId)
      .then((next) => active && load(next))
      .catch((reason) => active && setLoadError(errorText(reason)));
    return () => {
      active = false;
    };
  }, [itemId, attempt]);

  if (loadError) return <ErrorState message={loadError} onRetry={() => { setLoadError(null); setAttempt((n) => n + 1); }} />;
  if (!item || !form) return <Skeleton rows={4} />;

  const forSale = form.kind === 'for_sale';
  const gaps = missing(form);
  const status = PORTFOLIO_STATUS[item.status];
  const set = (change: Partial<PortfolioItemInput>) => setForm({ ...form, ...change });

  function payload(statusChoice: PortfolioStatus = form!.status): PortfolioItemInput {
    const cents = Math.round(parseFloat(price.replace(/[^\d.]/g, '')) * 100);
    return {
      ...form!,
      status: statusChoice,
      price_cents: forSale && cents > 0 ? cents : null,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 8),
    };
  }

  async function save(event?: React.FormEvent, statusChoice?: PortfolioStatus) {
    event?.preventDefault();
    const input = payload(statusChoice);
    if (input.title.trim().length < 2) return setError('Give it a name.');
    if (input.status === 'published' || input.status === 'sold') {
      const needs = missing(input);
      if (needs.length) return setError(`Before it goes on the site it needs ${needs.join(', ')}.`);
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await apiService.adminUpdatePortfolioItem(item!.id, input);
      load(saved);
      setNotice(saved.status !== item!.status ? `Saved. It is now ${PORTFOLIO_STATUS[saved.status].label.toLowerCase()}.` : 'Saved.');
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete ${item!.title} and its screenshots? Enquiries about it are kept. To hide it but keep it, archive it instead.`)) return;
    try {
      await apiService.adminDeletePortfolioItem(item!.id);
      router.push('/portfolio');
    } catch (reason) {
      setError(errorText(reason));
    }
  }

  return (
    <div>
      <Link href="/portfolio" className="font-mono text-[11px] uppercase tracking-label text-muted hover:text-ink">← Portfolio</Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={status.tone}>{status.label}</Pill>
            <span className="font-mono text-[10px] uppercase tracking-label text-muted">{KIND_LABEL[item.kind]}</span>
            {item.project_id && item.project_reference && (
              <Link href={`/projects/${item.project_id}`} className="font-mono text-[10px] uppercase tracking-label text-cobalt hover:underline">
                from {item.project_reference}
              </Link>
            )}
          </div>
          <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">{item.title}</h1>
          <p className="mt-1 text-sm text-muted">
            {item.view_count} views · {item.demo_clicks} demo clicks · {item.enquiries} {item.enquiries === 1 ? 'enquiry' : 'enquiries'} · changed {timeAgo(item.updated_at)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {item.status === 'published' || item.status === 'sold' ? (
            <a href={item.public_url} target="_blank" rel="noreferrer" className={buttonClass('secondary', 'sm')}>
              View on the site <ArrowTopRightOnSquareIcon className="h-4 w-4" aria-hidden />
            </a>
          ) : item.status === 'draft' ? (
            <a href={item.preview_url} target="_blank" rel="noreferrer" className={buttonClass('secondary', 'sm')}
              title="Anyone with this link can see the draft, so you can send it for a check before it goes live.">
              Preview <ArrowTopRightOnSquareIcon className="h-4 w-4" aria-hidden />
            </a>
          ) : null}
        </div>
      </div>

      <form onSubmit={(e) => save(e)} className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid min-w-0 gap-6">
          <Panel tag="what visitors read" title="Details">
            <div className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="p-title" className="label">Name</label>
                  <input id="p-title" value={form.title} onChange={(e) => set({ title: e.target.value })} maxLength={120} className="field" />
                </div>
                <div>
                  <label htmlFor="p-slug" className="label">Web address</label>
                  <div className="flex items-center rounded-xl border-[1.5px] border-line bg-white focus-within:border-ink">
                    <span className="pl-3 font-mono text-xs text-muted">/portfolio/</span>
                    <input id="p-slug" value={form.slug ?? ''} onChange={(e) => set({ slug: e.target.value.toLowerCase() })} maxLength={80}
                      className="min-w-0 flex-1 bg-transparent px-1 py-2.5 font-mono text-sm outline-none" />
                  </div>
                </div>
              </div>
              <div>
                <label htmlFor="p-summary" className="label">Summary (one or two sentences, shown on the card)</label>
                <textarea id="p-summary" rows={2} value={form.summary} onChange={(e) => set({ summary: e.target.value })} maxLength={300} className="field" />
                <p className="mt-1 text-right font-mono text-[10px] text-muted">{form.summary.length}/300</p>
              </div>
              <div>
                <label htmlFor="p-body" className="label">The story (what the client needed, what we built, how it turned out)</label>
                <textarea id="p-body" rows={7} value={form.body ?? ''} onChange={(e) => set({ body: e.target.value || null })} maxLength={20000} className="field leading-6"
                  placeholder="Blank lines start a new paragraph." />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="p-sector" className="label">Kind of business</label>
                  <input id="p-sector" value={form.sector ?? ''} onChange={(e) => set({ sector: e.target.value || null })} maxLength={60} className="field" placeholder="Food and drink" />
                </div>
                <div>
                  <label htmlFor="p-tags" className="label">Tags (commas between, up to 8)</label>
                  <input id="p-tags" value={tags} onChange={(e) => setTags(e.target.value)} className="field" placeholder="Online orders, Paystack, Booking" />
                </div>
              </div>
              {!forSale && (
                <div>
                  <label htmlFor="p-client" className="label">Client name as shown</label>
                  <input id="p-client" value={form.client_name ?? ''} onChange={(e) => set({ client_name: e.target.value || null })} maxLength={150} className="field" />
                </div>
              )}
            </div>
          </Panel>

          <Screenshots item={item} form={form} onChange={(images) => set({ images })} onUploaded={(next) => {
            // Several files upload one after another, so build on the latest form, not this render's.
            setItem(next);
            setForm((current) => {
              if (!current) return current;
              const known = new Set(current.images.map((i) => i.url));
              return { ...current, images: [...current.images, ...next.images.filter((i) => !known.has(i.url)).map(({ url, alt }) => ({ url, alt }))] };
            });
          }} />

          {forSale && (
            <Panel tag="for buyers" title="Price and what they get">
              <div className="grid gap-4">
                <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_7rem_minmax(0,1fr)]">
                  <div>
                    <label htmlFor="p-price" className="label">Price from</label>
                    <input id="p-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className="field" placeholder="450000" />
                  </div>
                  <div>
                    <label htmlFor="p-currency" className="label">Currency</label>
                    <select id="p-currency" value={form.currency} onChange={(e) => set({ currency: e.target.value as Currency })} className="field">
                      {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="p-days" className="label">Ready in (working days)</label>
                    <input id="p-days" type="number" min={1} max={365} value={form.delivery_days ?? ''} className="field"
                      onChange={(e) => set({ delivery_days: e.target.value ? Number(e.target.value) : null })} />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="p-includes" className="label">What it comes with (one per line)</label>
                    <textarea id="p-includes" rows={5} value={form.includes ?? ''} onChange={(e) => set({ includes: e.target.value || null })} maxLength={3000} className="field leading-6"
                      placeholder={'Five pages\nOrder form to WhatsApp\nSet up on your domain'} />
                  </div>
                  <div>
                    <label htmlFor="p-custom" className="label">What we change to suit them (one per line)</label>
                    <textarea id="p-custom" rows={5} value={form.customisable ?? ''} onChange={(e) => set({ customisable: e.target.value || null })} maxLength={3000} className="field leading-6"
                      placeholder={'Your logo and colours\nYour photos and menu\nPages added or removed'} />
                  </div>
                </div>
                <label className="flex gap-3 rounded-xl border-[1.5px] border-line p-3">
                  <input type="checkbox" checked={form.exclusive} onChange={(e) => set({ exclusive: e.target.checked })} className="mt-1" />
                  <span>
                    <span className="block font-semibold">Sold once only</span>
                    <span className="text-sm text-muted">The buyer gets this design to themselves. Mark it sold when they pay and it stays on the site as sold, with no price.</span>
                  </span>
                </label>
                <TemplatePicker
                  id="p-template"
                  label="Proposal steps from a template"
                  value={form.template_id ?? ''}
                  emptyLabel="No template: a proposal starts with the usual steps"
                  onPick={(template) => set({ template_id: template?.id ?? null })}
                />
              </div>
            </Panel>
          )}
        </div>

        <aside className="grid content-start gap-6">
          <Panel tag="where it shows" title="Status">
            <fieldset className="grid gap-2">
              <legend className="sr-only">Status</legend>
              {(['draft', 'published', ...(forSale ? ['sold'] : []), 'archived'] as PortfolioStatus[]).map((value) => (
                <label key={value} className={`flex cursor-pointer items-center gap-2 rounded-lg border-[1.5px] px-3 py-2 text-sm ${form.status === value ? 'border-ink bg-paper font-semibold' : 'border-line'}`}>
                  <input type="radio" name="status" value={value} checked={form.status === value} onChange={() => set({ status: value })} />
                  {PORTFOLIO_STATUS[value].label}
                  <span className="ml-auto text-xs font-normal text-muted">
                    {value === 'draft' ? 'only you' : value === 'archived' ? 'hidden' : 'everyone'}
                  </span>
                </label>
              ))}
            </fieldset>
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.featured} onChange={(e) => set({ featured: e.target.checked })} />
              Featured: shown first
            </label>
            {!forSale && (
              <label className={`mt-3 flex gap-2 rounded-lg border-[1.5px] p-3 text-sm ${form.client_permission ? 'border-line' : 'border-sun bg-sun-soft'}`}>
                <input type="checkbox" checked={form.client_permission} onChange={(e) => set({ client_permission: e.target.checked })} className="mt-0.5" />
                <span>The client agreed to have this site shown, with their name.</span>
              </label>
            )}
            {gaps.length > 0 ? (
              <p className="mt-4 text-sm text-muted">
                <strong className="text-ink">To go on the site it needs</strong> {gaps.join(', ')}.
              </p>
            ) : (
              <p className="mt-4 flex items-center gap-1.5 text-sm text-ink"><CheckCircleIcon className="h-4 w-4 text-cobalt" aria-hidden /> Ready for the site.</p>
            )}
            {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
            {notice && !error && <p role="status" className="mt-3 text-sm text-cobalt-dark">{notice}</p>}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
              {item.status === 'draft' && form.status === 'draft' && gaps.length === 0 && (
                <Button type="button" variant="sun" disabled={busy} onClick={() => save(undefined, 'published')}>Save and publish</Button>
              )}
            </div>
          </Panel>

          <DemoPanel item={item} url={form.demo_url} onUrl={(demo_url) => set({ demo_url })} onChecked={(next) => setItem({ ...item, ...pickDemo(next) })} />

          {forSale && item.price_cents && (
            <p className="px-1 text-sm text-muted">
              Shown as <strong className="text-ink">from {formatMoney(item.price_cents, item.currency)}</strong>. An enquiry from its page can be turned
              into a proposal that starts at this price{item.template_name ? ` with the ${item.template_name} steps` : ''}.
            </p>
          )}

          <button type="button" onClick={remove} className="flex w-fit items-center gap-1.5 px-1 text-sm font-semibold text-danger hover:underline">
            <TrashIcon className="h-4 w-4" aria-hidden /> Delete this item
          </button>
        </aside>
      </form>
    </div>
  );
}

function pickDemo(item: PortfolioItem) {
  return { demo_status: item.demo_status, demo_error: item.demo_error, demo_checked_at: item.demo_checked_at };
}

function DemoPanel({ item, url, onUrl, onChecked }: {
  item: PortfolioItem;
  url: string | null;
  onUrl: (url: string | null) => void;
  onChecked: (item: PortfolioItem) => void;
}) {
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saved = url === item.demo_url;

  async function check() {
    setChecking(true);
    setError(null);
    try {
      onChecked(await apiService.adminCheckPortfolioDemo(item.id));
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setChecking(false);
    }
  }

  return (
    <Panel tag="live demo" title="Demo link">
      <label htmlFor="p-demo" className="label">Address of the working site</label>
      <input id="p-demo" value={url ?? ''} onChange={(e) => onUrl(e.target.value.trim() || null)} maxLength={500} className="field" placeholder="demo-bakery.kleelab.com" />
      <p className="mt-2 text-xs text-muted">Visitors see the screenshots and an &ldquo;Open live demo&rdquo; button. We check the link every day.</p>
      {saved && item.demo_url && (
        <div className="mt-3 text-sm">
          {item.demo_status === 'broken' ? (
            <p className="flex gap-1.5 text-danger"><ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> Not working: {item.demo_error}</p>
          ) : item.demo_status === 'ok' ? (
            <p className="flex items-center gap-1.5"><CheckCircleIcon className="h-4 w-4 text-cobalt" aria-hidden /> Working</p>
          ) : (
            <p className="text-muted">Not checked yet.</p>
          )}
          {item.demo_checked_at && <p className="mt-0.5 text-xs text-muted">Checked {timeAgo(item.demo_checked_at)}</p>}
          <Button type="button" variant="secondary" size="sm" className="mt-3" disabled={checking} onClick={check}>
            {checking ? 'Checking…' : 'Check now'}
          </Button>
        </div>
      )}
      {!saved && <p className="mt-2 text-xs text-muted">Save to check the new link.</p>}
      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
    </Panel>
  );
}

function Screenshots({ item, form, onChange, onUploaded }: {
  item: PortfolioItem;
  form: PortfolioItemInput;
  onChange: (images: PortfolioItemInput['images']) => void;
  onUploaded: (item: PortfolioItem) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const images = form.images;
  const removed = item.images.filter((i) => !images.some((f) => f.url === i.url)).length;

  async function upload(files: File[]) {
    setError(null);
    const room = MAX_IMAGES - item.images.length;
    if (files.length > room) setError(`Only ${room} more ${room === 1 ? 'screenshot fits' : 'screenshots fit'}; the rest were skipped.`);
    for (const file of files.slice(0, Math.max(room, 0))) {
      if (!IMAGE_TYPES.includes(file.type)) {
        setError(`${file.name} is not a PNG, JPEG, WebP or AVIF image.`);
        continue;
      }
      if (file.size > MAX_BYTES) {
        setError(`${file.name} is larger than 5MB. Export it smaller, or as WebP.`);
        continue;
      }
      setUploading(file.name);
      try {
        onUploaded(await apiService.adminUploadPortfolioImage(item.id, await readAsDataUrl(file), file.name, ''));
      } catch (reason) {
        setError(errorText(reason));
        break;
      }
    }
    setUploading(null);
  }

  function move(index: number, to: number) {
    const next = [...images];
    const [image] = next.splice(index, 1);
    next.splice(to, 0, image);
    onChange(next);
  }

  return (
    <Panel tag="the first is the cover" title="Screenshots">
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); upload(Array.from(e.dataTransfer.files)); }}
        className={`grid place-items-center rounded-xl border-[1.5px] border-dashed p-6 text-center ${over ? 'border-cobalt bg-cobalt-soft' : 'border-line'}`}
      >
        <PhotoIcon className="h-7 w-7 text-muted" aria-hidden />
        <p className="mt-2 text-sm">
          {uploading ? `Uploading ${uploading}…` : 'Drop screenshots here, or'}{' '}
          {!uploading && (
            <button type="button" onClick={() => input.current?.click()} className="font-semibold text-cobalt underline">choose files</button>
          )}
        </p>
        <p className="mt-1 text-xs text-muted">PNG, JPEG, WebP or AVIF, up to 5MB each. Wide desktop shots at 1600px or more look best.</p>
        <input ref={input} type="file" accept={IMAGE_TYPES.join(',')} multiple className="sr-only" tabIndex={-1}
          onChange={(e) => { upload(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
      {images.length > 0 && (
        <ol className="mt-4 grid gap-4 sm:grid-cols-2">
          {images.map((image, index) => (
            <li key={image.url} className="rounded-xl border-[1.5px] border-line p-2">
              <div className="relative aspect-[16/10] overflow-hidden rounded-lg bg-paper">
                {/* eslint-disable-next-line @next/next/no-img-element -- an admin preview from Cloudinary */}
                <img src={image.url} alt="" className="h-full w-full object-cover object-top" />
                {index === 0 && <span className="absolute left-2 top-2 rounded-full bg-ink px-2 py-0.5 font-mono text-[10px] uppercase tracking-label text-paper">Cover</span>}
              </div>
              <label htmlFor={`p-alt-${index}`} className="sr-only">Describe screenshot {index + 1}</label>
              <input id={`p-alt-${index}`} value={image.alt} maxLength={200} placeholder="Describe it: Home page with the order button"
                onChange={(e) => onChange(images.map((i, n) => (n === index ? { ...i, alt: e.target.value } : i)))}
                className={`field mt-2 py-1.5 text-sm ${image.alt.trim() ? '' : 'border-sun'}`} />
              <div className="mt-2 flex items-center gap-1 text-muted">
                <button type="button" aria-label="Move earlier" disabled={index === 0} onClick={() => move(index, index - 1)} className="rounded p-1 hover:text-ink disabled:opacity-30">
                  <ArrowLeftIcon className="h-4 w-4" aria-hidden />
                </button>
                <button type="button" aria-label="Move later" disabled={index === images.length - 1} onClick={() => move(index, index + 1)} className="rounded p-1 hover:text-ink disabled:opacity-30">
                  <ArrowRightIcon className="h-4 w-4" aria-hidden />
                </button>
                {index > 0 && (
                  <button type="button" onClick={() => move(index, 0)} className="ml-1 text-xs font-semibold text-cobalt hover:underline">Make cover</button>
                )}
                <button type="button" aria-label={`Remove screenshot ${index + 1}`} onClick={() => onChange(images.filter((_, n) => n !== index))} className="ml-auto rounded p-1 hover:text-danger">
                  <TrashIcon className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
      {removed > 0 && <p className="mt-3 text-xs text-muted">{removed === 1 ? 'One screenshot is' : `${removed} screenshots are`} deleted when you save.</p>}
      <p className="mt-3 text-xs text-muted">New screenshots are kept straight away. Order, descriptions and removals are kept when you save.</p>
    </Panel>
  );
}
