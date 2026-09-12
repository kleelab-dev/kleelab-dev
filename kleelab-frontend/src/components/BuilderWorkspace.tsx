'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import { apiService } from '@/services/api';
import { BuilderBlock, BlockType, Page, Site, Template } from '@/types/api';
import { EditorCanvas } from '@/components/EditorCanvas';

const blockCatalog: Array<{ type: BlockType; label: string; description: string }> = [
  { type: 'hero', label: 'Hero section', description: 'A bold introduction with a clear action' },
  { type: 'text', label: 'Text block', description: 'Tell your story with a flexible text area' },
  { type: 'image', label: 'Image and copy', description: 'Pair a visual with a supporting message' },
  { type: 'features', label: 'Feature grid', description: 'Show what makes your work different' },
  { type: 'testimonials', label: 'Testimonials', description: 'Let happy customers speak for you' },
  { type: 'contact', label: 'Contact form', description: 'Make it easy for people to reach you' },
];

function blocksFromTemplate(template: Template): BuilderBlock[] {
  const sections = Array.isArray(template.config?.sections) ? template.config.sections : ['hero', 'text', 'form'];
  return sections.map((section, index) => {
    const type = String(section) === 'form' ? 'contact' : blockCatalog.some((item) => item.type === section) ? section as BlockType : 'text';
    const catalogItem = blockCatalog.find((item) => item.type === type)!;
    return {
      id: `${type}-${index}`,
      type,
      eyebrow: type === 'hero' ? template.category : undefined,
      title: type === 'hero' ? `Your ${template.title} starts here` : catalogItem.label,
      body: catalogItem.description,
      cta: type === 'hero' ? 'Learn more' : undefined,
      items: type === 'features' ? ['First point', 'Second point', 'Third point'] : undefined,
    };
  });
}

/** Escape user-authored copy before writing it into the preview window. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function BuilderWorkspace() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [pages, setPages] = useState<Page[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [selectedSite, setSelectedSite] = useState<Site | null>(null);
  const [selectedPage, setSelectedPage] = useState<Page | null>(null);
  const [blocks, setBlocks] = useState<BuilderBlock[]>([]);
  const [selectedBlockId, setSelectedBlockId] = useState('');
  const [step, setStep] = useState<'welcome' | 'templates' | 'editor'>('welcome');
  const [siteName, setSiteName] = useState('');
  const [history, setHistory] = useState<BuilderBlock[][]>([]);
  const [future, setFuture] = useState<BuilderBlock[][]>([]);
  const [saveState, setSaveState] = useState<'saved' | 'saving'>('saved');
  const [viewport, setViewport] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('register');
  const [authName, setAuthName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(true);
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);
  const [isCreatingSite, setIsCreatingSite] = useState(false);

  // Signature of the content currently persisted on the server. Autosave only
  // fires when the in-memory blocks differ, which stops the old save -> state
  // update -> save loop that hammered the API and tripped the rate limiter.
  const router = useRouter();
  const lastSavedRef = useRef<string>('');

  const loadTemplates = useCallback(async () => {
    // Deliberately does not set isLoadingTemplates(true) here: the state already
    // starts as true, and setting it synchronously from the mount effect trips
    // react-hooks/set-state-in-effect. The retry button sets it explicitly.
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
    // Fetch through promise callbacks rather than by calling the async loader
    // directly: react-hooks/set-state-in-effect forbids setState that is
    // reachable synchronously from an effect. The `active` flag also prevents
    // state updates after unmount.
    let active = true;
    apiService.getTemplates()
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
      apiService.getSites()
        .then((sites) => { if (active) setSites(sites); })
        .catch((reason: Error) => { if (active) setError(reason.message); });
    }
    return () => { active = false; };
  }, []);

  const siteId = selectedSite?.id ?? null;
  const pageId = selectedPage?.id ?? null;

  useEffect(() => {
    if (step !== 'editor' || !siteId || !pageId) return;
    const signature = JSON.stringify(blocks);
    if (signature === lastSavedRef.current) return;

    setSaveState('saving');
    const timer = window.setTimeout(() => {
      apiService.savePage(siteId, pageId, blocks)
        .then(() => { lastSavedRef.current = signature; setSaveState('saved'); })
        .catch((reason: Error) => { setError(reason.message); setSaveState('saved'); });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [blocks, pageId, siteId, step]);

  const selectedBlock = blocks.find((block) => block.id === selectedBlockId) ?? null;

  const updateBlocks = (nextBlocks: BuilderBlock[]) => {
    setHistory((current) => [...current.slice(-19), blocks]);
    setFuture([]);
    setBlocks(nextBlocks);
  };

  /** Replace the canvas content and remember it as the server's baseline. */
  const loadBlocks = (nextBlocks: BuilderBlock[]) => {
    lastSavedRef.current = JSON.stringify(nextBlocks);
    setBlocks(nextBlocks);
    setSelectedBlockId(nextBlocks[0]?.id ?? '');
    setHistory([]);
    setFuture([]);
    setSaveState('saved');
  };

  /** Switching pages must also swap the canvas content, otherwise the autosave
   *  would write the previous page's blocks onto the newly selected page. */
  const selectPage = (page: Page) => {
    const pageBlocks = (page.content_json?.blocks as BuilderBlock[] | undefined) ?? [];
    setSelectedPage(page);
    loadBlocks(pageBlocks);
  };

  const updateSelectedBlock = (field: keyof BuilderBlock, value: string) => {
    if (!selectedBlock) return;
    updateBlocks(blocks.map((block) => block.id === selectedBlock.id ? { ...block, [field]: value } : block));
  };

  const addBlock = (type: BlockType) => {
    const catalogItem = blockCatalog.find((item) => item.type === type)!;
    const newBlock: BuilderBlock = {
      id: `${type}-${Date.now()}`,
      type,
      title: catalogItem.label,
      body: catalogItem.description,
      ...(type === 'hero' ? { eyebrow: 'New section', cta: 'Learn more' } : {}),
      ...(type === 'features' ? { items: ['First point', 'Second point', 'Third point'] } : {}),
    };
    updateBlocks([...blocks, newBlock]);
    setSelectedBlockId(newBlock.id);
  };

  const moveBlock = (direction: -1 | 1) => {
    const index = blocks.findIndex((block) => block.id === selectedBlockId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= blocks.length) return;
    const nextBlocks = [...blocks];
    [nextBlocks[index], nextBlocks[target]] = [nextBlocks[target], nextBlocks[index]];
    updateBlocks(nextBlocks);
  };

  /** Opening a site hands off to the full document editor. */
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
      // Signing in without choosing a template must not dead-end: send the
      // person back to the picker instead of crashing on a null template.
      setStep('templates');
      setNotice('Pick a template to start your new site.');
      return;
    }

    const name = siteName.trim() || 'My new website';
    setIsCreatingSite(true);
    setError(null);
    try {
      const site = await apiService.createSite({ name, subdomain: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), template_id: selectedTemplate.id });
      const initialBlocks = blocksFromTemplate(selectedTemplate);
      const page = await apiService.createPage(site.id, { title: 'Home', slug: '/', content_json: { version: 1, blocks: initialBlocks } });
      setSites((current) => [site, ...current]);
      setSelectedSite(site);
      setPages([page]);
      setSelectedPage(page);
      loadBlocks(initialBlocks);
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
        await apiService.register({ full_name: authName.trim(), email: authEmail.trim(), password: authPassword });
      }
      await apiService.login(authEmail.trim(), authPassword);
      setShowAuth(false);

      // If this account already has sites, jump straight back into the editor.
      const existingSites = await apiService.getSites().catch(() => [] as Site[]);
      setSites(existingSites);
      if (existingSites.length > 0) {
        await openSite(existingSites[0]);
        return;
      }
      await createSite();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to authenticate');
    } finally {
      setIsSubmittingAuth(false);
    }
  };

  const undo = () => {
    const previous = history.at(-1);
    if (!previous) return;
    setFuture((current) => [blocks, ...current]);
    setBlocks(previous);
    setHistory((current) => current.slice(0, -1));
  };

  const redo = () => {
    const next = future[0];
    if (!next) return;
    setHistory((current) => [...current, blocks]);
    setBlocks(next);
    setFuture((current) => current.slice(1));
  };

  const createPage = async () => {
    if (!selectedSite) return;
    try {
      const page = await apiService.createPage(selectedSite.id, { title: `Page ${pages.length + 1}`, slug: `/page-${pages.length + 1}`, content_json: { version: 1, blocks: [] } });
      setPages((current) => [...current, page]);
      setSelectedPage(page);
      loadBlocks([]);
      setNotice('New page created.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to create page');
    }
  };

  const publishSite = async () => {
    if (!selectedSite || isPublishing) return;
    setIsPublishing(true);
    try {
      const result = await apiService.publishSite(selectedSite.id);
      setSelectedSite({ ...selectedSite, is_published: true });
      setNotice(result.url ? `Published at ${result.url}` : 'Site published.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to publish site');
    } finally {
      setIsPublishing(false);
    }
  };

  const openPreview = () => {
    const preview = window.open('', '_blank');
    if (!preview) {
      setError('Preview was blocked. Allow pop-ups for this site and try again.');
      return;
    }
    const body = blocks.map((block) => {
      const background = block.type === 'hero' ? '#d8e2d2' : block.type === 'contact' ? '#17231c' : '#fff';
      const color = block.type === 'contact' ? '#f6f7f2' : '#17231c';
      return `<section style="background:${background};color:${color}"><small>${escapeHtml(block.eyebrow || '')}</small><h1>${escapeHtml(block.title || '')}</h1><p>${escapeHtml(block.body || '')}</p>${block.cta ? `<button>${escapeHtml(block.cta)}</button>` : ''}</section>`;
    }).join('');
    preview.document.write(`<html><head><title>${escapeHtml(selectedPage?.title || 'KleeLab preview')}</title><style>body{margin:0;font-family:system-ui,sans-serif;color:#17231c}section{padding:64px 10%}button{padding:12px 20px;border:0;border-radius:999px;background:#e25d3f;color:white}</style></head><body>${body}</body></html>`);
    preview.document.close();
  };

  const openAuth = (mode: 'login' | 'register') => {
    setAuthMode(mode);
    setError(null);
    setNotice(null);
    setShowAuth(true);
  };

  if (step === 'editor') {
    return <EditorCanvas site={selectedSite} pages={pages} selectedPage={selectedPage} blocks={blocks} selectedBlock={selectedBlock} selectedBlockId={selectedBlockId} viewport={viewport} saveState={saveState} notice={notice} error={error} isPublishing={isPublishing} onBack={() => setStep('templates')} onPreview={openPreview} onPublish={publishSite} onCreatePage={createPage} onSelectPage={selectPage} onSelectBlock={setSelectedBlockId} onAddBlock={addBlock} onUpdateBlock={updateSelectedBlock} onMoveBlock={moveBlock} onUndo={undo} onRedo={redo} onViewportChange={setViewport} />;
  }

  const feedback = (
    <>
      {error && (
        <div role="alert" className="animate-rise mt-6 flex items-start gap-3 rounded-xl border border-[#f0c3b7] bg-[#fdf1ed] px-4 py-3 text-sm text-[#a63d24]">
          <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-xs font-bold underline underline-offset-2">Dismiss</button>
        </div>
      )}
      {notice && (
        <div role="status" className="animate-rise mt-6 flex items-start gap-3 rounded-xl border border-[#bcd8c2] bg-[#eef6f0] px-4 py-3 text-sm text-[#2c5540]">
          <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{notice}</span>
          <button onClick={() => setNotice(null)} className="text-xs font-bold underline underline-offset-2">Dismiss</button>
        </div>
      )}
    </>
  );

  if (showAuth) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f6f7f2] px-6 text-[#17231c]">
        <section className="animate-rise w-full max-w-md rounded-2xl border border-[#d8e0d5] bg-white p-8 shadow-[0_18px_50px_rgba(23,35,28,.08)]">
          <button onClick={() => setShowAuth(false)} className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-[#627067] hover:text-[#17231c]">
            <ArrowLeftIcon className="h-4 w-4" /> Back to setup
          </button>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#e25d3f]">Save your work</p>
          <h1 className="mt-3 font-serif text-4xl tracking-[-0.04em]">
            {authMode === 'register' ? 'Create your KleeLab account.' : 'Welcome back.'}
          </h1>
          <p className="mt-3 text-sm leading-6 text-[#627067]">
            {authMode === 'register' ? 'Your site and edits will be saved to your account.' : 'Sign in to keep building where you left off.'}
          </p>

          <form
            className="mt-7"
            onSubmit={(event) => { event.preventDefault(); void authenticate(); }}
          >
            {authMode === 'register' && (
              <input value={authName} onChange={(event) => setAuthName(event.target.value)} placeholder="Full name" autoComplete="name" className="w-full rounded-lg border border-[#ccd8ca] px-4 py-3 text-sm outline-none focus:border-[#e25d3f]" />
            )}
            <input value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} placeholder="Email address" type="email" autoComplete="email" required className="mt-3 w-full rounded-lg border border-[#ccd8ca] px-4 py-3 text-sm outline-none focus:border-[#e25d3f]" />
            <input value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} placeholder="Password" type="password" autoComplete={authMode === 'register' ? 'new-password' : 'current-password'} required className="mt-3 w-full rounded-lg border border-[#ccd8ca] px-4 py-3 text-sm outline-none focus:border-[#e25d3f]" />

            {error && (
              <p role="alert" className="mt-3 rounded-lg bg-[#fdf1ed] px-3 py-2 text-sm text-[#a63d24]">{error}</p>
            )}

            <button
              type="submit"
              disabled={isSubmittingAuth}
              aria-busy={isSubmittingAuth}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#17231c] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#2a3a30] disabled:opacity-60"
            >
              {isSubmittingAuth && <span className="spinner" aria-hidden />}
              {isSubmittingAuth
                ? 'Please wait...'
                : authMode === 'register' ? 'Create account' : 'Sign in'}
            </button>
          </form>

          <button onClick={() => { setAuthMode(authMode === 'register' ? 'login' : 'register'); setError(null); }} className="mt-5 w-full text-sm text-[#627067] hover:text-[#17231c]">
            {authMode === 'register' ? 'Already have an account? Sign in' : 'Need an account? Create one'}
          </button>
        </section>
      </main>
    );
  }

  if (step === 'welcome' || step === 'templates') {
    return (
      <main className="min-h-screen bg-[#f6f7f2] text-[#17231c]">
        <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-7 lg:px-12">
          <header className="flex items-center justify-between">
            <div className="flex items-center gap-3 text-sm font-semibold tracking-tight">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#17231c] text-[#f6f7f2]"><SparklesIcon className="h-5 w-5" /></span>
              KleeLab
            </div>
            {sites.length > 0 ? (
              <button onClick={() => { void openSite(sites[0]); }} className="rounded-full border border-[#ccd8ca] bg-white px-4 py-2 text-sm font-semibold text-[#17231c] hover:border-[#17231c]">
                Continue editing {sites[0].name}
              </button>
            ) : (
              <button onClick={() => openAuth('login')} className="text-sm text-[#627067] hover:text-[#17231c]">
                Already have a site? <span className="font-semibold text-[#17231c]">Sign in</span>
              </button>
            )}
          </header>

          {feedback}

          {step === 'welcome' ? (
            <section className="grid flex-1 items-center gap-12 py-16 lg:grid-cols-[1.1fr_.9fr]">
              <div className="max-w-2xl">
                <p className="mb-6 text-xs font-bold uppercase tracking-[0.22em] text-[#e25d3f]">Your corner of the internet</p>
                <h1 className="font-serif text-6xl leading-[.96] tracking-[-0.04em] sm:text-8xl">Build a site with a point of view.</h1>
                <p className="mt-8 max-w-lg text-lg leading-8 text-[#627067]">A calm, capable place to turn an idea into a website. Start with a template, make it yours, and publish when it feels right.</p>
                <button onClick={() => setStep('templates')} className="mt-10 inline-flex items-center gap-3 rounded-full bg-[#e25d3f] px-6 py-3 text-sm font-bold text-white shadow-[0_10px_24px_rgba(226,93,63,.28)] hover:bg-[#c94d32] active:bg-[#b24529]">
                  Start building <ArrowPathIcon className="h-4 w-4 rotate-45" />
                </button>
              </div>
              <div className="relative min-h-[430px] overflow-hidden rounded-[2rem] bg-[#d8e2d2] p-5 shadow-[0_24px_60px_rgba(23,35,28,.12)]">
                <div className="absolute -right-12 -top-12 h-56 w-56 rounded-full border-[28px] border-[#e25d3f]" />
                <div className="relative flex h-full flex-col justify-between rounded-[1.5rem] bg-[#f6f7f2] p-8">
                  <div className="flex items-center justify-between text-xs font-bold"><span>studio / 01</span><span className="text-[#e25d3f]">preview</span></div>
                  <div>
                    <p className="text-sm font-semibold text-[#e25d3f]">A small practice in</p>
                    <h2 className="mt-3 max-w-sm font-serif text-5xl leading-none tracking-[-0.04em]">Making good things visible.</h2>
                  </div>
                  <div className="flex items-end justify-between border-t border-[#d8e2d2] pt-5 text-xs text-[#627067]"><span>Designed by you</span><span>Scroll to explore</span></div>
                </div>
              </div>
            </section>
          ) : (
            <section className="flex-1 py-16">
              <button onClick={() => setStep('welcome')} className="mb-12 inline-flex items-center gap-2 text-sm font-semibold text-[#627067] hover:text-[#17231c]">
                <ArrowLeftIcon className="h-4 w-4" /> Back
              </button>
              <div className="mb-10 max-w-2xl">
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#e25d3f]">Choose your starting point</p>
                <h1 className="mt-3 font-serif text-5xl tracking-[-0.04em]">What are you making?</h1>
                <p className="mt-4 text-[#627067]">Pick a direction. You can change every word and section later.</p>
              </div>

              {isLoadingTemplates ? (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4" aria-busy="true" aria-live="polite">
                  {[0, 1, 2, 3].map((index) => (
                    <div key={index} className="overflow-hidden rounded-2xl border border-[#dce4da] bg-white">
                      <div className="aspect-[1.2] animate-pulse bg-[#e5ebe2]" />
                      <div className="space-y-3 p-5">
                        <div className="h-3 w-20 animate-pulse rounded bg-[#e5ebe2]" />
                        <div className="h-5 w-32 animate-pulse rounded bg-[#e5ebe2]" />
                        <div className="h-3 w-full animate-pulse rounded bg-[#edf1eb]" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : templates.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[#ccd8ca] bg-white p-10 text-center">
                  <p className="font-serif text-2xl">No templates loaded</p>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#627067]">
                    {error || 'The template library is empty right now.'}
                  </p>
                  <button onClick={() => { setIsLoadingTemplates(true); void loadTemplates(); }} className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#17231c] px-5 py-3 text-sm font-bold text-white hover:bg-[#2a3a30]">
                    <ArrowPathIcon className="h-4 w-4" /> Try again
                  </button>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  {templates.map((template) => (
                    <button
                      key={template.id}
                      onClick={() => { setSelectedTemplate(template); setSiteName(`${template.title} site`); setNotice(null); }}
                      aria-pressed={selectedTemplate?.id === template.id}
                      className={`group overflow-hidden rounded-2xl border bg-white text-left transition hover:-translate-y-1 hover:shadow-xl ${selectedTemplate?.id === template.id ? 'border-[#e25d3f] ring-2 ring-[#e25d3f]/20' : 'border-[#dce4da]'}`}
                    >
                      <div className="aspect-[1.2] overflow-hidden bg-[#d8e2d2]">
                        {template.thumbnail_url ? (
                          <img src={template.thumbnail_url} alt={`${template.title} template preview`} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                        ) : (
                          <div className="grid h-full w-full place-items-center bg-gradient-to-br from-[#d8e2d2] to-[#b9cbb6] text-[#17231c]">
                            <span className="font-serif text-5xl opacity-70">{template.title.charAt(0).toUpperCase()}</span>
                          </div>
                        )}
                      </div>
                      <div className="p-5">
                        <p className="text-xs font-bold uppercase tracking-wider text-[#e25d3f]">{template.category}</p>
                        <h2 className="mt-2 font-serif text-2xl">{template.title}</h2>
                        <p className="mt-2 text-sm leading-6 text-[#627067]">{template.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              <div className="mt-12 max-w-xl">
                <label htmlFor="site-name" className="text-sm font-bold">Name your site</label>
                <div className="mt-3 flex gap-3">
                  <input
                    id="site-name"
                    value={siteName}
                    onChange={(event) => setSiteName(event.target.value)}
                    placeholder="e.g. Maya Carter Studio"
                    className="min-w-0 flex-1 rounded-xl border border-[#ccd8ca] bg-white px-4 py-3 text-sm outline-none focus:border-[#e25d3f]"
                  />
                  <button
                    onClick={() => void createSite()}
                    disabled={!selectedTemplate || !siteName.trim() || isCreatingSite}
                    aria-busy={isCreatingSite}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#17231c] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#2a3a30] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {isCreatingSite ? <span className="spinner" aria-hidden /> : null}
                    {isCreatingSite ? 'Creating...' : 'Create site'} <ArrowPathIcon className="h-4 w-4 rotate-45" />
                  </button>
                </div>
                {!selectedTemplate && <p className="mt-3 text-xs text-[#627067]">Select a template above to enable this.</p>}
                {sites.length > 0 && (
                  <div className="mt-6 border-t border-[#d8e0d5] pt-5">
                    <p className="mb-3 text-xs font-bold uppercase tracking-wider text-[#627067]">Your sites</p>
                    <div className="grid gap-2">
                      {sites.map((site) => (
                        <button key={site.id} onClick={() => { void openSite(site); }} className="flex items-center justify-between rounded-lg border border-[#dce4da] bg-white px-4 py-3 text-left text-sm hover:border-[#17231c]">
                          <span className="font-semibold">{site.name}</span>
                          <span className="text-xs text-[#627067]">{site.is_published ? 'Published' : 'Draft'}</span>
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

  return (
    <main className="grid min-h-screen place-items-center bg-[#f6f7f2] px-6 text-[#17231c]">
      <section className="w-full max-w-md rounded-2xl border border-[#d8e0d5] bg-white p-8 text-center shadow-[0_18px_50px_rgba(23,35,28,.08)]">
        <h1 className="font-serif text-3xl tracking-[-0.03em]">Something went off track</h1>
        <p className="mt-3 text-sm leading-6 text-[#627067]">{error || 'Return to the start and try again.'}</p>
        <button onClick={() => { setError(null); setStep('welcome'); }} className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#17231c] px-5 py-3 text-sm font-bold text-white hover:bg-[#2a3a30]">
          <ArrowLeftIcon className="h-4 w-4" /> Back to start
        </button>
      </section>
    </main>
  );
}
