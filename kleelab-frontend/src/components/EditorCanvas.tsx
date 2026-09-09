'use client';

import {
  ArrowLeftIcon, ArrowPathIcon, Bars3Icon, ChevronLeftIcon, ChevronRightIcon,
  ComputerDesktopIcon, DevicePhoneMobileIcon, DeviceTabletIcon, EyeIcon,
  PlusIcon, RocketLaunchIcon, Squares2X2Icon,
} from '@heroicons/react/24/outline';
import { BlockType, BuilderBlock, Page, Site } from '@/types/api';

type Props = {
  site: Site | null;
  pages: Page[];
  selectedPage: Page | null;
  blocks: BuilderBlock[];
  selectedBlock: BuilderBlock | null;
  selectedBlockId: string;
  viewport: 'desktop' | 'tablet' | 'mobile';
  saveState: 'saved' | 'saving';
  notice: string | null;
  error: string | null;
  isPublishing: boolean;
  onBack: () => void;
  onPreview: () => void;
  onPublish: () => void;
  onCreatePage: () => void;
  onSelectPage: (page: Page) => void;
  onSelectBlock: (id: string) => void;
  onAddBlock: (type: BlockType) => void;
  onUpdateBlock: (field: keyof BuilderBlock, value: string) => void;
  onMoveBlock: (direction: -1 | 1) => void;
  onUndo: () => void;
  onRedo: () => void;
  onViewportChange: (viewport: 'desktop' | 'tablet' | 'mobile') => void;
};

const blockTypes: Array<{ type: BlockType; label: string }> = [
  { type: 'hero', label: 'Hero section' },
  { type: 'text', label: 'Text block' },
  { type: 'image', label: 'Image and copy' },
  { type: 'features', label: 'Feature grid' },
];

export function EditorCanvas(props: Props) {
  const width = props.viewport === 'desktop' ? 'max-w-[760px]' : props.viewport === 'tablet' ? 'max-w-[520px]' : 'max-w-[360px]';
  return <main className="flex h-screen flex-col overflow-hidden bg-[#eef1eb] text-[#17231c]">
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-[#d8e0d5] bg-[#f6f7f2] px-5">
      <div className="flex items-center gap-4"><button onClick={props.onBack} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-[#e5ebe2]" title="Back to setup"><ArrowLeftIcon className="h-4 w-4" /></button><span className="text-sm font-bold">{props.site?.name || 'My website'}</span><span className="rounded-full bg-[#d8e2d2] px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[#4e6654]">{props.site?.is_published ? 'Published' : 'Draft'}</span></div>
      <div className="flex items-center gap-3"><span className="hidden text-xs text-[#627067] sm:inline">{props.error || props.notice || (props.saveState === 'saving' ? 'Saving changes...' : 'All changes saved')}</span><button onClick={props.onPreview} className="inline-flex items-center gap-2 rounded-lg border border-[#ccd8ca] bg-white px-3 py-2 text-xs font-bold"><EyeIcon className="h-4 w-4" /> Preview</button><button onClick={props.onPublish} disabled={props.isPublishing} className="inline-flex items-center gap-2 rounded-lg bg-[#e25d3f] px-4 py-2 text-xs font-bold text-white disabled:opacity-50"><RocketLaunchIcon className="h-4 w-4" /> {props.isPublishing ? 'Publishing...' : 'Publish'}</button></div>
    </header>
    <div className="flex min-h-0 flex-1">
      <aside className="hidden w-64 shrink-0 border-r border-[#d8e0d5] bg-[#f6f7f2] p-4 lg:block"><div className="mb-6 flex items-center justify-between"><span className="text-xs font-bold uppercase tracking-wider text-[#627067]">Pages</span><button onClick={props.onCreatePage} className="rounded-md p-1 hover:bg-[#e5ebe2]" title="Add page"><PlusIcon className="h-4 w-4" /></button></div>{props.pages.map((page) => <button key={page.id} onClick={() => props.onSelectPage(page)} className={`mb-1 flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm ${props.selectedPage?.id === page.id ? 'bg-[#d8e2d2] font-bold' : 'text-[#627067] hover:bg-[#edf1eb]'}`}><span>{page.title}</span><ChevronRightIcon className="h-4 w-4" /></button>)}<div className="mt-8 border-t border-[#d8e0d5] pt-5"><p className="mb-3 text-xs font-bold uppercase tracking-wider text-[#627067]">Site tools</p>{['Design system', 'Assets', 'Store', 'Settings'].map((item) => <button key={item} onClick={() => window.alert(`${item} is coming next`)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-[#627067] hover:bg-[#edf1eb]"><Squares2X2Icon className="h-4 w-4" />{item}</button>)}</div></aside>
      <section className="flex min-w-0 flex-1 flex-col"><div className="flex h-12 shrink-0 items-center justify-center gap-1 border-b border-[#d8e0d5] bg-[#f6f7f2]"><button onClick={props.onUndo} className="rounded-md p-2 text-[#627067] hover:bg-[#e5ebe2]" title="Undo"><ArrowPathIcon className="h-4 w-4 -scale-x-100" /></button><button onClick={props.onRedo} className="rounded-md p-2 text-[#627067] hover:bg-[#e5ebe2]" title="Redo"><ArrowPathIcon className="h-4 w-4" /></button><span className="mx-3 h-5 w-px bg-[#d8e0d5]" />{([['desktop', ComputerDesktopIcon], ['tablet', DeviceTabletIcon], ['mobile', DevicePhoneMobileIcon]] as const).map(([size, Icon]) => <button key={size} onClick={() => props.onViewportChange(size)} className={`rounded-md p-2 ${props.viewport === size ? 'bg-[#d8e2d2]' : 'text-[#627067] hover:bg-[#e5ebe2]'}`} title={`${size} preview`}><Icon className="h-4 w-4" /></button>)}</div><div className="flex-1 overflow-auto p-8"><div className={`mx-auto overflow-hidden rounded-xl bg-white shadow-[0_12px_35px_rgba(23,35,28,.09)] transition-all ${width}`}><div className="flex items-center justify-between border-b border-[#edf0ea] px-7 py-5 text-xs font-bold"><span>north / studio</span><div className="hidden gap-5 text-[#627067] sm:flex"><span>Work</span><span>About</span><span>Contact</span></div><Bars3Icon className="h-5 w-5 sm:hidden" /></div>{props.blocks.map((block) => <button key={block.id} onClick={() => props.onSelectBlock(block.id)} className={`block w-full text-left ring-inset ${props.selectedBlockId === block.id ? 'ring-2 ring-[#e25d3f]' : 'hover:ring-2 hover:ring-[#d8e2d2]'}`}><BlockPreview block={block} /></button>)}<button onClick={() => props.onAddBlock('text')} className="flex w-full items-center justify-center gap-2 border-t border-dashed border-[#ccd8ca] py-6 text-xs font-bold text-[#627067] hover:bg-[#f6f7f2]"><PlusIcon className="h-4 w-4" /> Add section</button></div></div></section>
      <aside className="hidden w-80 shrink-0 border-l border-[#d8e0d5] bg-[#f6f7f2] xl:block"><div className="border-b border-[#d8e0d5] px-5 py-4"><p className="text-xs font-bold uppercase tracking-wider text-[#627067]">Add to page</p><div className="mt-3 grid gap-2">{blockTypes.map((item) => <button key={item.type} onClick={() => props.onAddBlock(item.type)} className="flex items-center gap-3 rounded-lg border border-[#d8e0d5] bg-white p-3 text-left hover:border-[#e25d3f]"><PlusIcon className="h-4 w-4 text-[#e25d3f]" /><span className="text-sm font-bold">{item.label}</span></button>)}</div></div>{props.selectedBlock && <div className="space-y-5 p-5"><div><label className="text-xs font-bold uppercase tracking-wider text-[#627067]">Headline</label><textarea value={props.selectedBlock.title || ''} onChange={(event) => props.onUpdateBlock('title', event.target.value)} rows={2} className="mt-2 w-full resize-none rounded-lg border border-[#ccd8ca] bg-white p-3 text-sm outline-none focus:border-[#e25d3f]" /></div><div><label className="text-xs font-bold uppercase tracking-wider text-[#627067]">Supporting copy</label><textarea value={props.selectedBlock.body || ''} onChange={(event) => props.onUpdateBlock('body', event.target.value)} rows={4} className="mt-2 w-full resize-none rounded-lg border border-[#ccd8ca] bg-white p-3 text-sm outline-none focus:border-[#e25d3f]" /></div>{props.selectedBlock.type === 'hero' && <div><label className="text-xs font-bold uppercase tracking-wider text-[#627067]">Button label</label><input value={props.selectedBlock.cta || ''} onChange={(event) => props.onUpdateBlock('cta', event.target.value)} className="mt-2 w-full rounded-lg border border-[#ccd8ca] bg-white p-3 text-sm outline-none focus:border-[#e25d3f]" /></div>}<div className="flex gap-2 border-t border-[#d8e0d5] pt-5"><button onClick={() => props.onMoveBlock(-1)} className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-[#ccd8ca] py-2 text-xs font-bold"><ChevronLeftIcon className="h-4 w-4" /> Move up</button><button onClick={() => props.onMoveBlock(1)} className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-[#ccd8ca] py-2 text-xs font-bold">Move down <ChevronRightIcon className="h-4 w-4" /></button></div></div>}</aside>
    </div>
  </main>;
}

function BlockPreview({ block }: { block: BuilderBlock }) {
  if (block.type === 'hero') return <div className="bg-[#d8e2d2] px-8 py-16 sm:px-12 sm:py-24"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#e25d3f]">{block.eyebrow}</p><h2 className="mt-4 max-w-xl font-serif text-5xl leading-[.95] tracking-[-0.04em] sm:text-6xl">{block.title}</h2><p className="mt-6 max-w-md text-sm leading-6 text-[#627067]">{block.body}</p><span className="mt-8 inline-flex rounded-full bg-[#17231c] px-5 py-3 text-xs font-bold text-white">{block.cta}</span></div>;
  if (block.type === 'features') return <div className="px-8 py-14 sm:px-12"><p className="max-w-lg font-serif text-3xl leading-tight tracking-[-0.03em]">{block.title}</p><p className="mt-4 max-w-md text-sm leading-6 text-[#627067]">{block.body}</p><div className="mt-10 grid gap-3 sm:grid-cols-3">{(block.items || []).map((item) => <div key={item} className="border-t-2 border-[#e25d3f] pt-3 text-xs font-bold">{item}</div>)}</div></div>;
  if (block.type === 'contact') return <div className="bg-[#17231c] px-8 py-14 text-[#f6f7f2] sm:px-12"><p className="max-w-lg font-serif text-4xl leading-none tracking-[-0.03em]">{block.title}</p><p className="mt-4 max-w-md text-sm leading-6 text-[#b7c4b7]">{block.body}</p><span className="mt-8 inline-flex rounded-full bg-[#e25d3f] px-5 py-3 text-xs font-bold">Start a conversation</span></div>;
  return <div className="px-8 py-14 sm:px-12"><p className="font-serif text-3xl tracking-[-0.03em]">{block.title}</p><p className="mt-4 max-w-lg text-sm leading-6 text-[#627067]">{block.body}</p></div>;
}