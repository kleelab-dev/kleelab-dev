'use client';

import { clsx } from 'clsx';
import { ArrowLeftIcon, ArrowRightIcon } from '@heroicons/react/24/outline';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PortfolioCard } from '@/components/site/PortfolioCard';
import type { PortfolioItem, PortfolioKind } from '@/lib/portfolio';

type Filter = 'all' | PortfolioKind;

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'for_sale', label: 'Ready-made' },
  { value: 'work', label: 'We built' },
];

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * A row of portfolio cards that scrolls sideways. Swiping and scroll-snap are the
 * browser's own; the arrows step one card, and the counter and bar show which
 * cards are in view. Works as a plain scrolling row without JS.
 */
export function PortfolioSlider({ items }: { items: PortfolioItem[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [view, setView] = useState({ first: 0, visible: 1, atStart: true, atEnd: false });

  const shown = items.filter((item) => filter === 'all' || item.kind === filter);
  const hasBoth = items.some((item) => item.kind === 'work') && items.some((item) => item.kind === 'for_sale');

  /** Card width plus the gap, read from the layout so it follows the breakpoints. */
  const step = () => {
    const cards = trackRef.current?.children;
    if (!cards || cards.length === 0) return 0;
    if (cards.length === 1) return (cards[0] as HTMLElement).offsetWidth;
    return (cards[1] as HTMLElement).offsetLeft - (cards[0] as HTMLElement).offsetLeft;
  };

  const measure = useCallback(() => {
    const track = trackRef.current;
    const size = step();
    if (!track || !size) return;
    const max = track.scrollWidth - track.clientWidth;
    const gap = size - (track.children[0] as HTMLElement).offsetWidth;
    setView({
      first: Math.round(track.scrollLeft / size),
      // Rounded, not floored: the last card often ends a pixel past the edge.
      visible: Math.max(1, Math.round((track.clientWidth + gap) / size)),
      atStart: track.scrollLeft <= 2,
      atEnd: track.scrollLeft >= max - 2,
    });
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollLeft = 0;
    measure();
    track.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      track.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, [filter, measure]);

  const go = (direction: 1 | -1) => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    trackRef.current?.scrollBy({ left: direction * step(), behavior: reduce ? 'auto' : 'smooth' });
  };

  const total = shown.length;
  const visible = Math.min(view.visible, total);
  const first = view.atEnd ? total - visible : Math.min(view.first, total - visible);
  const last = first + visible;
  const scrolls = total > visible;

  return (
    <div className="mt-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        {hasBoth ? (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Show">
            {FILTERS.map(({ value, label }) => {
              const count = value === 'all' ? items.length : items.filter((item) => item.kind === value).length;
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                  className={clsx(
                    'rounded-full border-[1.5px] border-ink px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-label transition-colors',
                    filter === value ? 'bg-ink text-paper' : 'bg-white text-ink hover:bg-paper',
                  )}
                >
                  {label} · {count}
                </button>
              );
            })}
          </div>
        ) : (
          <span />
        )}
        {scrolls && (
          <div className="hidden gap-2 sm:flex">
            {([-1, 1] as const).map((direction) => (
              <button
                key={direction}
                type="button"
                onClick={() => go(direction)}
                disabled={direction === -1 ? view.atStart : view.atEnd}
                aria-label={direction === -1 ? 'Previous sites' : 'Next sites'}
                className="flex h-11 w-11 items-center justify-center rounded-full border-[1.5px] border-ink bg-white text-ink transition-colors hover:border-cobalt hover:bg-cobalt hover:text-white disabled:pointer-events-none disabled:opacity-35"
              >
                {direction === -1 ? <ArrowLeftIcon className="h-4 w-4" /> : <ArrowRightIcon className="h-4 w-4" />}
              </button>
            ))}
          </div>
        )}
      </div>

      <div
        ref={trackRef}
        role="region"
        aria-label="Portfolio sites"
        tabIndex={0}
        className="-mx-5 mt-6 flex snap-x snap-mandatory scroll-px-5 gap-5 overflow-x-auto px-5 pb-4 pt-2 outline-none [scrollbar-width:none] focus-visible:ring-2 focus-visible:ring-cobalt sm:-mx-8 sm:scroll-px-8 sm:px-8 lg:mx-0 lg:scroll-px-0 lg:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {shown.map((item, index) => (
          <div
            key={item.slug}
            className="w-[85%] shrink-0 snap-start pr-1.5 pt-1 sm:w-[calc((100%-1.25rem)/2)] lg:w-[calc((100%-2.5rem)/3)]"
          >
            <PortfolioCard item={item} compact priority={index < 3} />
          </div>
        ))}
      </div>

      {scrolls && (
        <div className="mt-4 flex items-center gap-4" aria-hidden>
          <span className="min-w-[4.5rem] font-mono text-[11px] uppercase tracking-label text-ink">
            {visible > 1 ? `${pad(first + 1)}–${pad(last)}` : pad(first + 1)} / {pad(total)}
          </span>
          <div className="relative h-3 flex-1">
            <div className="absolute inset-x-0 top-[5px] border-t-[1.5px] border-dashed border-ink/30" />
            <div className="absolute left-0 top-0 h-3 border-l-[1.5px] border-ink" />
            <div className="absolute right-0 top-0 h-3 border-l-[1.5px] border-ink" />
            <div
              className="absolute top-1 h-1 rounded-full bg-cobalt transition-all duration-300"
              style={{ left: `${(first / total) * 100}%`, width: `${(visible / total) * 100}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
