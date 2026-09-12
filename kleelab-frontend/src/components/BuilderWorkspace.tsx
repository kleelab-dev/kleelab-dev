/* eslint-disable @next/next/no-img-element -- template thumbnails are arbitrary
   remote URLs served by the template catalog, so next/image cannot be used
   without widening images.remotePatterns to every host. */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import { apiService } from '@/services/api';
import { documentFromTemplate } from '@/lib/templates';
import type { Site, Template } from '@/types/api';

/**
 * Onboarding: pick a template, create a site, then hand off to the document
 * editor at /builder/[siteId]/edit. Editing itself lives in EditorShell.
 */
export function BuilderWorkspace() {
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [step, setStep] = useState<'welcome' | 'templates'>('welcome');
  const [siteName, setSiteName] = useState('');
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('register');
  const [authName, setAuthName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(true);
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);
  const [isCreatingSite, setIsCreatingSite] = useState(false);

  const loadTemplates = useCallback(async () => {
    // Loading state is set by the caller; setting it here would run
    // synchronously inside the mount effect (react-hooks/set-state-in-effect).
    try {
      setTemplates(await apiService.getTemplates());
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load templates');
    } finally {
      setIsLoadingTemplates(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    apiService
      .getTemplates()
      .then((data) => {
        if (!active) return;
        setTemplates(data);
        setError(null);
      })
      .catch((reason: Error) => {
        if (active) setError(reason.message);
      })
      .finally(() => {
        if (active) setIsLoadingTemplates(false);
      });

    if (window.localStorage.getItem('kleelab_access_token')) {
      apiService
        .getSites()
        .then((data) => {
          if (active) setSites(data);
        })
        .catch(() => undefined);
    }

    return () => {
      active = false;
    };
  }, []);

  /** Opening a site hands off to the document editor. */
  const openSite = (site: Site) => {
    router.push(`/builder/${site.id}/edit`);
  };

  const createSite = async () => {
    if (!window.localStorage.getItem('kleelab_access_token')) {
      setAuthMode('register');
      setShowAuth(true);
      return;
    }
    if (!selectedTemplate) {
      setStep('templates');
      setNotice('Pick a template to start your new site.');
      return;
    }

    const name = siteName.trim() || 'My new website';
    setIsCreatingSite(true);
    setError(null);
    try {
      const site = await apiService.createSite({
        name,
        subdomain: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        template_id: selectedTemplate.id,
      });
      await apiService.createPage(site.id, {
        title: 'Home',
        slug: '/',
        content_json: { document: documentFromTemplate(selectedTemplate) },
      });
      setSites((current) => [site, ...current]);
      setNotice(null);
      router.push(`/builder/${site.id}/edit`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to create your site');
    } finally {
      setIsCreatingSite(false);
    }
  };

  const authenticate = async () => {
    if (!authEmail.trim() || !authPassword) {
      setError('Enter your email and password to continue.');
      return;
    }
    setIsSubmittingAuth(true);
    setError(null);
    try {
      if (authMode === 'register') {
        await apiService.register({
          full_name: authName.trim(),
          email: authEmail.trim(),
          password: authPassword,
        });
      }
      await apiService.login(authEmail.trim(), authPassword);
      setShowAuth(false);

      const existingSites = await apiService.getSites().catch(() => [] as Site[]);
      setSites(existingSites);
      if (existingSites.length > 0) {
        openSite(existingSites[0]);
        return;
      }
      await createSite();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to authenticate');
    } finally {
      setIsSubmittingAuth(false);
    }
  };

  const openAuth = (mode: 'login' | 'register') => {
    setAuthMode(mode);
    setError(null);
    setNotice(null);
    setShowAuth(true);
  };

  const feedback = (
    <>
      {error && (
        <div
          role="alert"
          className="animate-rise mt-6 flex items-start gap-3 rounded-xl border border-danger-line bg-danger-surface px-4 py-3 text-sm text-danger"
        >
          <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-xs font-bold underline underline-offset-2">
            Dismiss
          </button>
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="animate-rise mt-6 flex items-start gap-3 rounded-xl border border-success-line bg-success-surface px-4 py-3 text-sm text-success"
        >
          <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{notice}</span>
          <button onClick={() => setNotice(null)} className="text-xs font-bold underline underline-offset-2">
            Dismiss
          </button>
        </div>
      )}
    </>
  );

  if (showAuth) {
    return (
      <main className="grid min-h-screen place-items-center bg-paper px-6 text-ink">
        <section className="animate-rise w-full max-w-md rounded-2xl border border-line bg-white p-8 shadow-[0_18px_50px_rgba(23,35,28,.08)]">
          <button
            onClick={() => setShowAuth(false)}
            className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-ink"
          >
            <ArrowLeftIcon className="h-4 w-4" /> Back to setup
          </button>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">Save your work</p>
          <h1 className="mt-3 font-serif text-4xl tracking-[-0.04em]">
            {authMode === 'register' ? 'Create your KleeLab account.' : 'Welcome back.'}
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted">
            {authMode === 'register'
              ? 'Your site and edits will be saved to your account.'
              : 'Sign in to keep building where you left off.'}
          </p>

          <form
            className="mt-7"
            onSubmit={(event) => {
              event.preventDefault();
              void authenticate();
            }}
          >
            {authMode === 'register' && (
              <input
                value={authName}
                onChange={(event) => setAuthName(event.target.value)}
                placeholder="Full name"
                autoComplete="name"
                className="w-full rounded-lg border border-line-strong px-4 py-3 text-sm outline-none focus:border-accent"
              />
            )}
            <input
              value={authEmail}
              onChange={(event) => setAuthEmail(event.target.value)}
              placeholder="Email address"
              type="email"
              autoComplete="email"
              required
              className="mt-3 w-full rounded-lg border border-line-strong px-4 py-3 text-sm outline-none focus:border-accent"
            />
            <input
              value={authPassword}
              onChange={(event) => setAuthPassword(event.target.value)}
              placeholder="Password"
              type="password"
              autoComplete={authMode === 'register' ? 'new-password' : 'current-password'}
              required
              className="mt-3 w-full rounded-lg border border-line-strong px-4 py-3 text-sm outline-none focus:border-accent"
            />

            {error && (
              <p role="alert" className="mt-3 rounded-lg bg-danger-surface px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmittingAuth}
              aria-busy={isSubmittingAuth}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-ink px-4 py-3 text-sm font-bold text-white transition hover:bg-ink-soft disabled:opacity-60"
            >
              {isSubmittingAuth && <span className="spinner" aria-hidden />}
              {isSubmittingAuth ? 'Please wait…' : authMode === 'register' ? 'Create account' : 'Sign in'}
            </button>
          </form>

          <button
            onClick={() => {
              setAuthMode(authMode === 'register' ? 'login' : 'register');
              setError(null);
            }}
            className="mt-5 w-full text-sm text-muted hover:text-ink"
          >
            {authMode === 'register' ? 'Already have an account? Sign in' : 'Need an account? Create one'}
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-paper text-ink">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-7 lg:px-12">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-sm font-semibold tracking-tight">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-ink text-paper">
              <SparklesIcon className="h-5 w-5" />
            </span>
            KleeLab
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/builder/dashboard')}
              className="text-sm text-muted hover:text-ink"
            >
              Your sites
            </button>
            {sites.length > 0 ? (
              <button
                onClick={() => openSite(sites[0])}
                className="rounded-full border border-line-strong bg-white px-4 py-2 text-sm font-semibold hover:border-ink"
              >
                Continue editing {sites[0].name}
              </button>
            ) : (
              <button onClick={() => openAuth('login')} className="text-sm text-muted hover:text-ink">
                Already have a site? <span className="font-semibold text-ink">Sign in</span>
              </button>
            )}
          </div>
        </header>

        {feedback}

        {step === 'welcome' ? (
          <section className="grid flex-1 items-center gap-12 py-16 lg:grid-cols-[1.1fr_.9fr]">
            <div className="max-w-2xl">
              <p className="mb-6 text-xs font-bold uppercase tracking-[0.22em] text-accent">
                Your corner of the internet
              </p>
              <h1 className="font-serif text-6xl leading-[.96] tracking-[-0.04em] sm:text-8xl">
                Build a site with a point of view.
              </h1>
              <p className="mt-8 max-w-lg text-lg leading-8 text-muted">
                A calm, capable place to turn an idea into a website. Start with a template, make it
                yours, and publish when it feels right.
              </p>
              <button
                onClick={() => setStep('templates')}
                className="mt-10 inline-flex items-center gap-3 rounded-full bg-accent px-6 py-3 text-sm font-bold text-white shadow-[0_10px_24px_rgba(226,93,63,.28)] hover:bg-accent-dark"
              >
                Start building <ArrowPathIcon className="h-4 w-4 rotate-45" />
              </button>
            </div>
            <div className="relative min-h-[430px] overflow-hidden rounded-[2rem] bg-mint p-5 shadow-[0_24px_60px_rgba(23,35,28,.12)]">
              <div className="absolute -right-12 -top-12 h-56 w-56 rounded-full border-[28px] border-accent" />
              <div className="relative flex h-full flex-col justify-between rounded-[1.5rem] bg-paper p-8">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span>studio / 01</span>
                  <span className="text-accent">preview</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-accent">A small practice in</p>
                  <h2 className="mt-3 max-w-sm font-serif text-5xl leading-none tracking-[-0.04em]">
                    Making good things visible.
                  </h2>
                </div>
                <div className="flex items-end justify-between border-t border-mint pt-5 text-xs text-muted">
                  <span>Designed by you</span>
                  <span>Scroll to explore</span>
                </div>
              </div>
            </div>
          </section>
        ) : (
          <section className="flex-1 py-16">
            <button
              onClick={() => setStep('welcome')}
              className="mb-12 inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-ink"
            >
              <ArrowLeftIcon className="h-4 w-4" /> Back
            </button>
            <div className="mb-10 max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-accent">
                Choose your starting point
              </p>
              <h1 className="mt-3 font-serif text-5xl tracking-[-0.04em]">What are you making?</h1>
              <p className="mt-4 text-muted">
                Pick a direction. You can change every word and section later.
              </p>
            </div>

            {isLoadingTemplates ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4" aria-busy="true" aria-live="polite">
                {[0, 1, 2, 3].map((index) => (
                  <div key={index} className="overflow-hidden rounded-2xl border border-line bg-white">
                    <div className="aspect-[1.2] animate-pulse bg-mint" />
                    <div className="space-y-3 p-5">
                      <div className="h-3 w-20 animate-pulse rounded bg-mint" />
                      <div className="h-5 w-32 animate-pulse rounded bg-mint" />
                      <div className="h-3 w-full animate-pulse rounded bg-canvas" />
                    </div>
                  </div>
                ))}
              </div>
            ) : templates.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-line-strong bg-white p-10 text-center">
                <p className="font-serif text-2xl">No templates loaded</p>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
                  {error || 'The template library is empty right now.'}
                </p>
                <button
                  onClick={() => {
                    setIsLoadingTemplates(true);
                    void loadTemplates();
                  }}
                  className="mt-6 inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-bold text-white hover:bg-ink-soft"
                >
                  <ArrowPathIcon className="h-4 w-4" /> Try again
                </button>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {templates.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => {
                      setSelectedTemplate(template);
                      setSiteName(`${template.title} site`);
                      setNotice(null);
                    }}
                    aria-pressed={selectedTemplate?.id === template.id}
                    className={`group overflow-hidden rounded-2xl border bg-white text-left transition hover:-translate-y-1 hover:shadow-xl ${
                      selectedTemplate?.id === template.id
                        ? 'border-accent ring-2 ring-accent/20'
                        : 'border-line'
                    }`}
                  >
                    <div className="aspect-[1.2] overflow-hidden bg-mint">
                      {template.thumbnail_url ? (
                        <img
                          src={template.thumbnail_url}
                          alt={`${template.title} template preview`}
                          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                        />
                      ) : (
                        <div className="grid h-full w-full place-items-center bg-gradient-to-br from-mint to-[#b9cbb6] text-ink">
                          <span className="font-serif text-5xl opacity-70">
                            {template.title.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="p-5">
                      <p className="text-xs font-bold uppercase tracking-wider text-accent">
                        {template.category}
                      </p>
                      <h2 className="mt-2 font-serif text-2xl">{template.title}</h2>
                      <p className="mt-2 text-sm leading-6 text-muted">{template.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            <div className="mt-12 max-w-xl">
              <label htmlFor="site-name" className="text-sm font-bold">
                Name your site
              </label>
              <div className="mt-3 flex gap-3">
                <input
                  id="site-name"
                  value={siteName}
                  onChange={(event) => setSiteName(event.target.value)}
                  placeholder="e.g. Maya Carter Studio"
                  className="min-w-0 flex-1 rounded-xl border border-line-strong bg-white px-4 py-3 text-sm outline-none focus:border-accent"
                />
                <button
                  onClick={() => void createSite()}
                  disabled={!selectedTemplate || !siteName.trim() || isCreatingSite}
                  aria-busy={isCreatingSite}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-ink px-5 py-3 text-sm font-bold text-white transition hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isCreatingSite ? <span className="spinner" aria-hidden /> : null}
                  {isCreatingSite ? 'Creating…' : 'Create site'}{' '}
                  <ArrowPathIcon className="h-4 w-4 rotate-45" />
                </button>
              </div>
              {!selectedTemplate && (
                <p className="mt-3 text-xs text-muted">Select a template above to enable this.</p>
              )}
              {sites.length > 0 && (
                <div className="mt-6 border-t border-line pt-5">
                  <p className="mb-3 text-xs font-bold uppercase tracking-wider text-muted">Your sites</p>
                  <div className="grid gap-2">
                    {sites.map((site) => (
                      <button
                        key={site.id}
                        onClick={() => openSite(site)}
                        className="flex items-center justify-between rounded-lg border border-line bg-white px-4 py-3 text-left text-sm hover:border-ink"
                      >
                        <span className="font-semibold">{site.name}</span>
                        <span className="text-xs text-muted">
                          {site.is_published ? 'Published' : 'Draft'}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
