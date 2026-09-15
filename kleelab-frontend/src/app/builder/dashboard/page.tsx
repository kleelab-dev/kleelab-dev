'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRightIcon,
  ArrowTopRightOnSquareIcon,
  Cog6ToothIcon,
  ExclamationTriangleIcon,
  GlobeAltIcon,
  PlusIcon,
  ReceiptPercentIcon,
  RocketLaunchIcon,
  ShoppingBagIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { apiService, getToken } from '@/services/api';
import { KleeLabLogo } from '@/components/marketing/KleeLabLogo';
import { Overview } from '@/components/dashboard/Overview';
import { PlanCard } from '@/components/dashboard/PlanCard';
import type { Account, Site } from '@/types/api';

type Status = 'checking' | 'signed-out' | 'ready';
type ResendState = 'idle' | 'sending' | 'done' | 'failed';

export default function DashboardPage() {
  const router = useRouter();
  const [sites, setSites] = useState<Site[]>([]);
  const [user, setUser] = useState<Account | null>(null);
  const [status, setStatus] = useState<Status>('checking');
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [resendState, setResendState] = useState<ResendState>('idle');
  const [resendNote, setResendNote] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    if (!getToken()) {
      Promise.resolve().then(() => {
        if (active) setStatus('signed-out');
      });
      return () => {
        active = false;
      };
    }

    apiService
      .getSites()
      .then(async (data) => {
        if (!active) return;
        setSites(data);
        setStatus('ready');
        // Verification state and the plan card only decorate the page, so a
        // failure here must not take the dashboard down with it.
        try {
          const me = await apiService.getAccount();
          if (active) setUser(me);
        } catch {
          if (active) setUser(null);
        }
      })
      .catch((reason: Error) => {
        if (!active) return;
        setError(reason.message);
        setStatus('ready');
      });

    return () => {
      active = false;
    };
  }, []);

  const resendVerification = async () => {
    setResendState('sending');
    setResendNote(null);
    try {
      const result = await apiService.resendVerification();
      setResendState('done');
      setResendNote(
        result.delivered
          ? 'Verification email sent. Check your inbox.'
          : 'No email provider is configured, so the link was written to the server log.',
      );
    } catch (reason) {
      setResendState('failed');
      setResendNote(reason instanceof Error ? reason.message : 'Could not send the email.');
    }
  };

  const togglePublish = async (site: Site) => {
    setBusyId(site.id);
    setError(null);
    try {
      if (site.is_published) {
        await apiService.unpublishSite(site.id);
        setSites((current) =>
          current.map((item) => (item.id === site.id ? { ...item, is_published: false } : item)),
        );
      } else {
        await apiService.publishSite(site.id);
        setSites((current) =>
          current.map((item) => (item.id === site.id ? { ...item, is_published: true } : item)),
        );
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Action failed');
    } finally {
      setBusyId(null);
    }
  };

  const removeSite = async (site: Site) => {
    if (!window.confirm(`Delete “${site.name}”? This cannot be undone.`)) return;
    setBusyId(site.id);
    setError(null);
    try {
      await apiService.deleteSite(site.id);
      setSites((current) => current.filter((item) => item.id !== site.id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to delete site');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <main className="min-h-screen bg-canvas text-ink">
      <header className="border-b border-line bg-paper">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <KleeLabLogo className="h-7 w-auto text-ink" />
            <p className="text-xs text-muted">Your sites</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => router.push('/builder/new')}
              className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-xs font-bold text-paper hover:bg-ink-soft"
            >
              <PlusIcon className="h-4 w-4" /> New site
            </button>
            <button
              type="button"
              onClick={() => {
                void apiService.logout();
                setStatus('signed-out');
              }}
              className="rounded-lg border border-line-strong bg-white px-3 py-2 text-xs font-bold hover:border-ink"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-8">
        {error && (
          <div
            role="alert"
            className="mb-6 flex items-start gap-2 rounded-xl border border-danger-line bg-danger-surface px-4 py-3 text-sm text-danger"
          >
            <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="flex-1">{error}</span>
            <button type="button" onClick={() => setError(null)} className="text-xs font-bold underline">
              Dismiss
            </button>
          </div>
        )}

        {status === 'checking' && <p className="text-sm text-muted">Loading your sites…</p>}

        {/* Publishing is blocked until the address is confirmed, so say so before
            the user finds out by clicking Publish and getting a 403. */}
        {status === 'ready' && user && !user.is_verified && (
          <div className="mb-6 rounded-xl border border-line-strong bg-canvas px-4 py-3 text-sm">
            <div className="flex flex-wrap items-center gap-3">
              <ExclamationTriangleIcon className="h-4 w-4 shrink-0 text-accent" />
              <span className="flex-1">
                Confirm <strong className="font-bold">{user.email}</strong> to publish your sites.
              </span>
              <button
                type="button"
                disabled={resendState === 'sending'}
                onClick={() => void resendVerification()}
                className="rounded-lg bg-ink px-3 py-2 text-xs font-bold text-paper hover:bg-ink-soft disabled:opacity-40"
              >
                {resendState === 'sending' ? 'Sending…' : 'Resend email'}
              </button>
            </div>
            {resendNote && (
              <p
                className={`mt-2 pl-7 text-xs ${resendState === 'failed' ? 'text-danger' : 'text-muted'}`}
              >
                {resendNote}
              </p>
            )}
          </div>
        )}

        {status === 'signed-out' && (
          <div className="rounded-2xl border border-line bg-paper p-8 text-center">
            <p className="font-serif text-2xl">Sign in to see your sites</p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
              Your sites are tied to your account.
            </p>
            {/* This used to have a single action, and it sent you to the new-site
                wizard — so the only way back into your own account was to start
                creating a site you did not want. */}
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => router.push('/login?next=%2Fbuilder%2Fdashboard')}
                className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-medium text-paper hover:bg-ink-soft"
              >
                Sign in <ArrowRightIcon className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => router.push('/register?next=%2Fbuilder%2Fdashboard')}
                className="rounded-full border border-line-strong px-5 py-3 text-sm font-medium hover:border-ink"
              >
                Create an account
              </button>
            </div>
          </div>
        )}

        {status === 'ready' && user && <Overview />}

        {status === 'ready' && user && (
          <section aria-label="Plan" className="mb-10">
            <PlanCard account={user} />
          </section>
        )}

        {status === 'ready' && sites.length === 0 && (
          <div className="rounded-2xl border border-dashed border-line-strong bg-paper p-10 text-center">
            <p className="font-serif text-2xl">No sites yet</p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
              Describe your business in a sentence or two, and we will build the first version
              for you to edit and publish.
            </p>
            <button
              type="button"
              onClick={() => router.push('/builder/new')}
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-medium text-paper hover:bg-ink-soft"
            >
              <PlusIcon className="h-4 w-4" /> Create a site
            </button>
          </div>
        )}

        {status === 'ready' && sites.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {sites.map((site) => (
              <article
                key={site.id}
                className="flex flex-col rounded-2xl border border-line bg-white p-5 transition hover:-translate-y-0.5 hover:shadow-lg"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate font-serif text-xl">{site.name}</h2>
                    <p className="mt-1 truncate text-xs text-muted">
                      {site.subdomain ? `${site.subdomain}.kleelab.com` : 'No subdomain yet'}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${
                      site.is_published ? 'bg-mint text-ink' : 'bg-canvas text-muted'
                    }`}
                  >
                    {site.is_published ? 'Published' : 'Draft'}
                  </span>
                </div>

                <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4">
                  <button
                    type="button"
                    onClick={() => router.push(`/builder/${site.id}/edit`)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-3 py-2 text-xs font-bold text-paper hover:bg-ink-soft"
                  >
                    Open editor <ArrowRightIcon className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={busyId === site.id}
                    onClick={() => void togglePublish(site)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong px-3 py-2 text-xs font-bold hover:border-ink disabled:opacity-40"
                  >
                    {site.is_published ? (
                      <>
                        <GlobeAltIcon className="h-3.5 w-3.5" /> Unpublish
                      </>
                    ) : (
                      <>
                        <RocketLaunchIcon className="h-3.5 w-3.5" /> Publish
                      </>
                    )}
                  </button>
                  {site.is_published && site.subdomain && (
                    <a
                      href={`/s/${site.subdomain}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong px-3 py-2 text-xs font-bold hover:border-ink"
                    >
                      <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" /> View
                    </a>
                  )}
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => router.push(`/builder/${site.id}/products`)}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-muted hover:bg-canvas hover:text-ink"
                  >
                    <ShoppingBagIcon className="h-3.5 w-3.5" /> Products
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push(`/builder/${site.id}/orders`)}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-muted hover:bg-canvas hover:text-ink"
                  >
                    <ReceiptPercentIcon className="h-3.5 w-3.5" /> Orders
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push(`/builder/${site.id}/settings`)}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-muted hover:bg-canvas hover:text-ink"
                  >
                    <Cog6ToothIcon className="h-3.5 w-3.5" /> Settings
                  </button>
                  <button
                    type="button"
                    disabled={busyId === site.id}
                    onClick={() => void removeSite(site)}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-accent hover:bg-danger-surface disabled:opacity-40"
                  >
                    <TrashIcon className="h-3.5 w-3.5" /> Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
