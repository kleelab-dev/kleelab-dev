'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  GlobeAltIcon,
  RocketLaunchIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { SitePageShell } from '@/components/dashboard/SiteNav';
import { apiService } from '@/services/api';
import type { Page, Site } from '@/types/api';

const inputClass =
  'w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-accent';

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-bold text-ink">{label}</span>
      {children}
      {hint && <span className="text-[10px] leading-4 text-muted">{hint}</span>}
    </label>
  );
}

export function SiteSettings({ siteId }: { siteId: string }) {
  const router = useRouter();
  const [site, setSite] = useState<Site | null>(null);
  const [homePage, setHomePage] = useState<Page | null>(null);
  const [name, setName] = useState('');
  const [subdomain, setSubdomain] = useState('');
  const [customDomain, setCustomDomain] = useState('');
  const [metaTitle, setMetaTitle] = useState('');
  const [metaDescription, setMetaDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([apiService.getSite(siteId), apiService.getPages(siteId)])
      .then(([loadedSite, pages]) => {
        if (!active) return;
        const page = pages.find((item) => item.slug === '/' || item.slug === 'home') ?? pages[0] ?? null;
        setSite(loadedSite);
        setHomePage(page);
        setName(loadedSite.name);
        setSubdomain(loadedSite.subdomain ?? '');
        setCustomDomain(loadedSite.custom_domain ?? '');
        if (page) {
          const record = page as unknown as { meta_title?: string; meta_description?: string };
          setMetaTitle(record.meta_title ?? '');
          setMetaDescription(record.meta_description ?? '');
        }
        setLoaded(true);
      })
      .catch((reason: Error) => {
        if (!active) return;
        setError(reason.message);
        setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [siteId]);

  const save = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await apiService.updateSite(siteId, {
        name: name.trim() || site?.name,
        subdomain: subdomain.trim() || null,
        custom_domain: customDomain.trim() || null,
      });
      setSite(updated);

      if (homePage) {
        await apiService.updatePageSeo(siteId, homePage.id, {
          meta_title: metaTitle.trim(),
          meta_description: metaDescription.trim(),
        });
      }
      setNotice('Settings saved.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save settings');
    } finally {
      setBusy(false);
    }
  };

  const togglePublish = async () => {
    if (!site) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (site.is_published) {
        await apiService.unpublishSite(site.id);
        setSite({ ...site, is_published: false });
        setNotice('Site unpublished.');
      } else {
        const result = await apiService.publishSite(site.id);
        setSite({ ...site, is_published: true });
        setNotice(result.url ? `Published — ${result.url}` : 'Site published.');
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  const removeSite = async () => {
    if (!site || !window.confirm(`Delete “${site.name}”? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await apiService.deleteSite(site.id);
      router.push('/builder/dashboard');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to delete site');
      setBusy(false);
    }
  };

  return (
    <SitePageShell
      siteId={siteId}
      siteName={site?.name ?? ''}
      title="Settings"
      description="Settings & publishing"
    >
      <div className="mx-auto max-w-3xl">
        {error && (
          <div role="alert" className="mb-5 flex items-start gap-2 rounded-xl border border-danger-line bg-danger-surface px-4 py-3 text-sm text-danger">
            <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="flex-1">{error}</span>
          </div>
        )}
        {notice && (
          <div role="status" className="mb-5 flex items-start gap-2 rounded-xl border border-success-line bg-success-surface px-4 py-3 text-sm text-success">
            <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="flex-1">{notice}</span>
          </div>
        )}

        {!loaded ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : (
          <div className="grid gap-6">
            <section className="rounded-2xl border border-line bg-white p-6">
              <h2 className="font-serif text-xl">Basics</h2>
              <div className="mt-4 grid gap-4">
                <Field label="Site name">
                  <input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} />
                </Field>
                <Field label="Subdomain" hint="Letters, numbers and dashes. Used for your free address.">
                  <input className={inputClass} value={subdomain} onChange={(event) => setSubdomain(event.target.value)} />
                </Field>
                <Field
                  label="Custom domain"
                  hint="Saved now; DNS verification is wired up in the publishing phase."
                >
                  <input
                    className={inputClass}
                    placeholder="www.example.com"
                    value={customDomain}
                    onChange={(event) => setCustomDomain(event.target.value)}
                  />
                </Field>
              </div>
            </section>

            <section className="rounded-2xl border border-line bg-white p-6">
              <h2 className="font-serif text-xl">Search appearance</h2>
              <p className="mt-1 text-xs text-muted">
                {homePage ? `Applies to “${homePage.title}”.` : 'No page to configure yet.'}
              </p>
              <div className="mt-4 grid gap-4">
                <Field label="Meta title">
                  <input
                    className={inputClass}
                    disabled={!homePage}
                    value={metaTitle}
                    onChange={(event) => setMetaTitle(event.target.value)}
                  />
                </Field>
                <Field label="Meta description">
                  <textarea
                    className={`${inputClass} resize-y`}
                    rows={3}
                    disabled={!homePage}
                    value={metaDescription}
                    onChange={(event) => setMetaDescription(event.target.value)}
                  />
                </Field>
              </div>
            </section>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void save()}
                disabled={busy}
                className="rounded-lg bg-ink px-5 py-2.5 text-sm font-bold text-paper hover:bg-ink-soft disabled:opacity-50"
              >
                Save changes
              </button>
              <button
                type="button"
                onClick={() => void togglePublish()}
                disabled={busy || !site}
                className="inline-flex items-center gap-2 rounded-lg border border-line-strong bg-white px-4 py-2.5 text-sm font-bold hover:border-ink disabled:opacity-50"
              >
                {site?.is_published ? <GlobeAltIcon className="h-4 w-4" /> : <RocketLaunchIcon className="h-4 w-4" />}
                {site?.is_published ? 'Unpublish' : 'Publish'}
              </button>
              <button
                type="button"
                onClick={() => void removeSite()}
                disabled={busy}
                className="ml-auto inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold text-accent hover:bg-danger-surface disabled:opacity-50"
              >
                <TrashIcon className="h-4 w-4" /> Delete site
              </button>
            </div>
          </div>
        )}
      </div>
    </SitePageShell>
  );
}
