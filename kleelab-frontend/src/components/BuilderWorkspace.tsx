'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  Bars3Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ComputerDesktopIcon,
  DevicePhoneMobileIcon,
  DeviceTabletIcon,
  EyeIcon,
  PlusIcon,
  RocketLaunchIcon,
  SparklesIcon,
  Squares2X2Icon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { apiService } from '@/services/api';
import { BuilderBlock, BlockType, Page, Site, Template } from '@/types/api';

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

  useEffect(() => {
    apiService.getTemplates().then(setTemplates).catch((reason: Error) => setError(reason.message));
    if (window.localStorage.getItem('kleelab_access_token')) {
      apiService.getSites().then(setSites).catch((reason: Error) => setError(reason.message));
    }
  }, []);

  useEffect(() => {
    if (step !== 'editor' || !selectedSite || !selectedPage) return;
    setSaveState('saving');
    const timer = window.setTimeout(() => {
      apiService.savePage(selectedSite.id, selectedPage.id, blocks)
        .then((page) => { setSelectedPage(page); setSaveState('saved'); })
        .catch((reason: Error) => { setError(reason.message); setSaveState('saved'); });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [blocks, selectedPage, selectedSite, step]);

  const selectedBlock = blocks.find((block) => block.id === selectedBlockId) ?? null;
  const canvasWidth = viewport === 'desktop' ? 'max-w-[760px]' : viewport === 'tablet' ? 'max-w-[520px]' : 'max-w-[360px]';
  const templateChoices = useMemo(() => templates.slice(0, 4), [templates]);

  const updateBlocks = (nextBlocks: BuilderBlock[]) => {
    setHistory((current) => [...current.slice(-19), blocks]);
    setFuture([]);
    setBlocks(nextBlocks);
    setSaveState('saving');
    window.setTimeout(() => setSaveState('saved'), 500);
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

  const createSite = async () => {
    if (!window.localStorage.getItem('kleelab_access_token')) {
      setShowAuth(true);
      return;
    }
    const name = siteName || 'My new website';
    try {
      const site = await apiService.createSite({ name, subdomain: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), template_id: selectedTemplate?.id });
      const initialBlocks = blocksFromTemplate(selectedTemplate!);
      const page = await apiService.createPage(site.id, { title: 'Home', slug: '/', content_json: { version: 1, blocks: initialBlocks } });
      setSites((current) => [site, ...current]);
      setSelectedSite(site);
      setPages([page]);
      setSelectedPage(page);
      setBlocks(initialBlocks);
      setSelectedBlockId(initialBlocks[0]?.id || '');
      setStep('editor');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to create your site');
    }
  };

  const authenticate = async () => {
    try {
      if (authMode === 'register') await apiService.register({ full_name: authName, email: authEmail, password: authPassword });
      await apiService.login(authEmail, authPassword);
      setShowAuth(false);
      setError(null);
      await createSite();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to authenticate');
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

  if (showAuth) {
    return <main className="grid min-h-screen place-items-center bg-[#f6f7f2] px-6 text-[#17231c]"><section className="w-full max-w-md rounded-2xl border border-[#d8e0d5] bg-white p-8 shadow-[0_18px_50px_rgba(23,35,28,.08)]"><button onClick={() => setShowAuth(false)} className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-[#627067]"><ArrowLeftIcon className="h-4 w-4" /> Back to setup</button><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#e25d3f]">Save your work</p><h1 className="mt-3 font-serif text-4xl tracking-[-0.04em]">Create your KleeLab account.</h1><p className="mt-3 text-sm leading-6 text-[#627067]">Your site and edits will be saved to your account.</p>{authMode === 'register' && <input value={authName} onChange={(event) => setAuthName(event.target.value)} placeholder="Full name" className="mt-7 w-full rounded-lg border border-[#ccd8ca] px-4 py-3 text-sm outline-none focus:border-[#e25d3f]" />}<input value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} placeholder="Email address" type="email" className="mt-3 w-full rounded-lg border border-[#ccd8ca] px-4 py-3 text-sm outline-none focus:border-[#e25d3f]" /><input value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} placeholder="Password" type="password" className="mt-3 w-full rounded-lg border border-[#ccd8ca] px-4 py-3 text-sm outline-none focus:border-[#e25d3f]" />{error && <p className="mt-3 text-sm text-[#c94d32]">{error}</p>}<button onClick={authenticate} className="mt-5 w-full rounded-lg bg-[#17231c] px-4 py-3 text-sm font-bold text-white">{authMode === 'register' ? 'Create account' : 'Sign in'}</button><button onClick={() => setAuthMode(authMode === 'register' ? 'login' : 'register')} className="mt-5 w-full text-sm text-[#627067]">{authMode === 'register' ? 'Already have an account? Sign in' : 'Need an account? Create one'}</button></section></main>;
  }

  if (step !== 'editor') {
    return (
      <main className="min-h-screen bg-[#f6f7f2] text-[#17231c]">
        <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-7 lg:px-12">
          <header className="flex items-center justify-between"><div className="flex items-center gap-3 text-sm font-semibold tracking-tight"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#17231c] text-[#f6f7f2]"><SparklesIcon className="h-5 w-5" /></span>KleeLab</div><button onClick={() => { setAuthMode('login'); setShowAuth(true); }} className="text-sm text-[#627067]">Already have a site? <span className="font-semibold text-[#17231c]">Sign in</span></button></header>
          {step === 'welcome' ? <section className="grid flex-1 items-center gap-12 py-16 lg:grid-cols-[1.1fr_.9fr]"><div className="max-w-2xl"><p className="mb-6 text-xs font-bold uppercase tracking-[0.22em] text-[#e25d3f]">Your corner of the internet</p><h1 className="font-serif text-6xl leading-[.96] tracking-[-0.04em] sm:text-8xl">Build a site with a point of view.</h1><p className="mt-8 max-w-lg text-lg leading-8 text-[#627067]">A calm, capable place to turn an idea into a website. Start with a template, make it yours, and publish when it feels right.</p><button onClick={() => setStep('templates')} className="mt-10 inline-flex items-center gap-3 rounded-full bg-[#e25d3f] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#c94d32]">Start building <ArrowPathIcon className="h-4 w-4 rotate-45" /></button></div><div className="relative min-h-[430px] overflow-hidden rounded-[2rem] bg-[#d8e2d2] p-5 shadow-[0_24px_60px_rgba(23,35,28,.12)]"><div className="absolute -right-12 -top-12 h-56 w-56 rounded-full border-[28px] border-[#e25d3f]" /><div className="relative flex h-full flex-col justify-between rounded-[1.5rem] bg-[#f6f7f2] p-8"><div className="flex items-center justify-between text-xs font-bold"><span>studio / 01</span><span className="text-[#e25d3f]">preview</span></div><div><p className="text-sm font-semibold text-[#e25d3f]">A small practice in</p><h2 className="mt-3 max-w-sm font-serif text-5xl leading-none tracking-[-0.04em]">Making good things visible.</h2></div><div className="flex items-end justify-between border-t border-[#d8e2d2] pt-5 text-xs text-[#627067]"><span>Designed by you</span><span>Scroll to explore</span></div></div></div></section> : <section className="flex-1 py-16"><button onClick={() => setStep('welcome')} className="mb-12 inline-flex items-center gap-2 text-sm font-semibold text-[#627067]"><ArrowLeftIcon className="h-4 w-4" /> Back</button><div className="mb-10 max-w-2xl"><p className="text-xs font-bold uppercase tracking-[0.22em] text-[#e25d3f]">Choose your starting point</p><h1 className="mt-3 font-serif text-5xl tracking-[-0.04em]">What are you making?</h1><p className="mt-4 text-[#627067]">Pick a direction. You can change every word and section later.</p></div><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">{templateChoices.map((template) => <button key={template.id} onClick={() => { setSelectedTemplate(template); setSiteName(`${template.title} site`); }} className={`group overflow-hidden rounded-2xl border bg-white text-left transition hover:-translate-y-1 hover:shadow-xl ${selectedTemplate?.id === template.id ? 'border-[#e25d3f] ring-2 ring-[#e25d3f]/20' : 'border-[#dce4da]'}`}><div className="aspect-[1.2] overflow-hidden bg-[#d8e2d2]"><img src={template.thumbnail_url} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /></div><div className="p-5"><p className="text-xs font-bold uppercase tracking-wider text-[#e25d3f]">{template.category}</p><h2 className="mt-2 font-serif text-2xl">{template.title}</h2><p className="mt-2 text-sm leading-6 text-[#627067]">{template.description}</p></div></button>)}</div><div className="mt-12 max-w-xl"><label className="text-sm font-bold">Name your site</label><div className="mt-3 flex gap-3"><input value={siteName} onChange={(event) => setSiteName(event.target.value)} placeholder="e.g. Maya Carter Studio" className="min-w-0 flex-1 rounded-xl border border-[#ccd8ca] bg-white px-4 py-3 text-sm outline-none focus:border-[#e25d3f]" /><button onClick={createSite} className="inline-flex items-center gap-2 rounded-xl bg-[#17231c] px-5 py-3 text-sm font-bold text-white disabled:opacity-30" disabled={!selectedTemplate || !siteName}>Create site <ArrowPathIcon className="h-4 w-4 rotate-45" /></button></div></div></section>}
        </div>
      </main>
    );
  }

  return <main className="flex h-screen flex-col overflow-hidden bg-[#eef1eb] text-[#17231c]"><header className="flex h-16 shrink-0 items-center justify-between border-b border-[#d8e0d5] bg-[#f6f7f2] px-5"><div className="flex items-center gap-4"><button className="grid h-8 w-8 place-items-center rounded-lg hover:bg-[#e5ebe2]"><ArrowLeftIcon className="h-4 w-4" /></button><span className="text-sm font-bold">{selectedSite?.name || 'My website'}</span><span className="rounded-full bg-[#d8e2d2] px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[#4e6654]">Draft</span></div><div className="flex items-center gap-3"><span className="hidden text-xs text-[#627067] sm:inline">{saveState === 'saving' ? 'Saving changes...' : 'All changes saved'}</span><button className="inline-flex items-center gap-2 rounded-lg border border-[#ccd8ca] bg-white px-3 py-2 text-xs font-bold"><EyeIcon className="h-4 w-4" /> Preview</button><button className="inline-flex items-center gap-2 rounded-lg bg-[#e25d3f] px-4 py-2 text-xs font-bold text-white"><RocketLaunchIcon className="h-4 w-4" /> Publish</button></div></header><div className="flex min-h-0 flex-1"><aside className="hidden w-64 shrink-0 border-r border-[#d8e0d5] bg-[#f6f7f2] p-4 lg:block"><div className="mb-6 flex items-center justify-between"><span className="text-xs font-bold uppercase tracking-wider text-[#627067]">Pages</span><button className="rounded-md p-1 hover:bg-[#e5ebe2]"><PlusIcon className="h-4 w-4" /></button></div>{(pages.length ? pages : [{ id: 'home', title: 'Home' } as Page]).map((page) => <button key={page.id} onClick={() => setSelectedPage(page)} className={`mb-1 flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm ${selectedPage?.id === page.id ? 'bg-[#d8e2d2] font-bold' : 'text-[#627067] hover:bg-[#edf1eb]'}`}><span>{page.title}</span><ChevronRightIcon className="h-4 w-4" /></button>)}<div className="mt-8 border-t border-[#d8e0d5] pt-5"><p className="mb-3 text-xs font-bold uppercase tracking-wider text-[#627067]">Site tools</p>{['Design system', 'Assets', 'Store', 'Settings'].map((item) => <button key={item} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-[#627067] hover:bg-[#edf1eb]"><Squares2X2Icon className="h-4 w-4" />{item}</button>)}</div></aside><section className="flex min-w-0 flex-1 flex-col"><div className="flex h-12 shrink-0 items-center justify-center gap-1 border-b border-[#d8e0d5] bg-[#f6f7f2]"><button onClick={undo} disabled={!history.length} className="rounded-md p-2 text-[#627067] disabled:opacity-30" title="Undo"><ArrowPathIcon className="h-4 w-4 -scale-x-100" /></button><button onClick={redo} disabled={!future.length} className="rounded-md p-2 text-[#627067] disabled:opacity-30" title="Redo"><ArrowPathIcon className="h-4 w-4" /></button><span className="mx-3 h-5 w-px bg-[#d8e0d5]" />{([['desktop', ComputerDesktopIcon], ['tablet', DeviceTabletIcon], ['mobile', DevicePhoneMobileIcon]] as const).map(([size, Icon]) => <button key={size} onClick={() => setViewport(size)} className={`rounded-md p-2 ${viewport === size ? 'bg-[#d8e2d2]' : 'text-[#627067]'}`} title={`${size} preview`}><Icon className="h-4 w-4" /></button>)}</div><div className="flex-1 overflow-auto p-8"><div className={`mx-auto overflow-hidden rounded-xl bg-white shadow-[0_12px_35px_rgba(23,35,28,.09)] transition-all ${canvasWidth}`}><div className="flex items-center justify-between border-b border-[#edf0ea] px-7 py-5 text-xs font-bold"><span>north / studio</span><div className="hidden gap-5 text-[#627067] sm:flex"><span>Work</span><span>About</span><span>Contact</span></div><Bars3Icon className="h-5 w-5 sm:hidden" /></div>{blocks.map((block) => <button key={block.id} onClick={() => setSelectedBlockId(block.id)} className={`group block w-full text-left transition ring-inset ${selectedBlockId === block.id ? 'ring-2 ring-[#e25d3f]' : 'hover:ring-2 hover:ring-[#d8e2d2]'}`}><BlockPreview block={block} /></button>)}<button onClick={() => addBlock('text')} className="flex w-full items-center justify-center gap-2 border-t border-dashed border-[#ccd8ca] py-6 text-xs font-bold text-[#627067]"><PlusIcon className="h-4 w-4" /> Add section</button></div></div></section><aside className="hidden w-80 shrink-0 border-l border-[#d8e0d5] bg-[#f6f7f2] xl:block"><div className="flex h-12 items-center justify-between border-b border-[#d8e0d5] px-5"><span className="text-xs font-bold uppercase tracking-wider">Edit section</span><button className="rounded-md p-1 text-[#627067]"><XMarkIcon className="h-4 w-4" /></button></div><div className="border-b border-[#d8e0d5] p-5"><p className="mb-3 text-xs font-bold uppercase tracking-wider text-[#627067]">Add to page</p><div className="grid gap-2">{blockCatalog.slice(0, 4).map((item) => <button key={item.type} onClick={() => addBlock(item.type)} className="flex items-center gap-3 rounded-lg border border-[#d8e0d5] bg-white p-3 text-left hover:border-[#e25d3f]"><PlusIcon className="h-4 w-4 text-[#e25d3f]" /><span><span className="block text-sm font-bold">{item.label}</span><span className="block text-xs text-[#627067]">{item.description}</span></span></button>)}</div></div>{selectedBlock && <div className="space-y-5 p-5"><div><label className="text-xs font-bold uppercase tracking-wider text-[#627067]">Headline</label><textarea value={selectedBlock.title || ''} onChange={(event) => updateSelectedBlock('title', event.target.value)} rows={2} className="mt-2 w-full resize-none rounded-lg border border-[#ccd8ca] bg-white p-3 text-sm outline-none focus:border-[#e25d3f]" /></div><div><label className="text-xs font-bold uppercase tracking-wider text-[#627067]">Supporting copy</label><textarea value={selectedBlock.body || ''} onChange={(event) => updateSelectedBlock('body', event.target.value)} rows={4} className="mt-2 w-full resize-none rounded-lg border border-[#ccd8ca] bg-white p-3 text-sm outline-none focus:border-[#e25d3f]" /></div>{selectedBlock.type === 'hero' && <div><label className="text-xs font-bold uppercase tracking-wider text-[#627067]">Button label</label><input value={selectedBlock.cta || ''} onChange={(event) => updateSelectedBlock('cta', event.target.value)} className="mt-2 w-full rounded-lg border border-[#ccd8ca] bg-white p-3 text-sm outline-none focus:border-[#e25d3f]" /></div>}<div className="flex gap-2 border-t border-[#d8e0d5] pt-5"><button onClick={() => moveBlock(-1)} className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-[#ccd8ca] py-2 text-xs font-bold"><ChevronLeftIcon className="h-4 w-4" /> Move up</button><button onClick={() => moveBlock(1)} className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-[#ccd8ca] py-2 text-xs font-bold">Move down <ChevronRightIcon className="h-4 w-4" /></button></div></div>}</aside></div></main>;
}

function BlockPreview({ block }: { block: BuilderBlock }) {
  if (block.type === 'hero') return <div className="bg-[#d8e2d2] px-8 py-16 sm:px-12 sm:py-24"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#e25d3f]">{block.eyebrow}</p><h2 className="mt-4 max-w-xl font-serif text-5xl leading-[.95] tracking-[-0.04em] sm:text-6xl">{block.title}</h2><p className="mt-6 max-w-md text-sm leading-6 text-[#627067]">{block.body}</p><span className="mt-8 inline-flex rounded-full bg-[#17231c] px-5 py-3 text-xs font-bold text-white">{block.cta}</span></div>;
  if (block.type === 'features') return <div className="px-8 py-14 sm:px-12"><p className="max-w-lg font-serif text-3xl leading-tight tracking-[-0.03em]">{block.title}</p><p className="mt-4 max-w-md text-sm leading-6 text-[#627067]">{block.body}</p><div className="mt-10 grid gap-3 sm:grid-cols-3">{(block.items || []).map((item) => <div key={item} className="border-t-2 border-[#e25d3f] pt-3 text-xs font-bold">{item}</div>)}</div></div>;
  if (block.type === 'contact') return <div className="bg-[#17231c] px-8 py-14 text-[#f6f7f2] sm:px-12"><p className="max-w-lg font-serif text-4xl leading-none tracking-[-0.03em]">{block.title}</p><p className="mt-4 max-w-md text-sm leading-6 text-[#b7c4b7]">{block.body}</p><span className="mt-8 inline-flex rounded-full bg-[#e25d3f] px-5 py-3 text-xs font-bold">Start a conversation</span></div>;
  return <div className="px-8 py-14 sm:px-12"><p className="font-serif text-3xl tracking-[-0.03em]">{block.title}</p><p className="mt-4 max-w-lg text-sm leading-6 text-[#627067]">{block.body}</p></div>;
}