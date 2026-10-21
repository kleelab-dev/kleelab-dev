'use client';

import { clsx } from 'clsx';
import { useEffect, useRef, useState } from 'react';
import { processStages } from '@/content/site';

const COUNT = processStages.length;

/**
 * The six stages as one blueprint line that draws itself as you scroll. Each
 * stop gets its stamp once the line reaches it. Horizontal on wide screens,
 * vertical on phones.
 */
export function ProcessTimeline() {
  const ref = useRef<HTMLOListElement>(null);
  // Starts complete so the server render and reduced-motion users see it all.
  const [progress, setProgress] = useState(1);

  useEffect(() => {
    const node = ref.current;
    if (!node || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = node.getBoundingClientRect();
      const vh = window.innerHeight;
      // 0 when the list's top reaches 80% down the screen, 1 when its bottom reaches 55%.
      const start = vh * 0.8;
      const end = vh * 0.55 - rect.height;
      const raw = (start - rect.top) / (start - end);
      setProgress(Math.min(1, Math.max(0, raw)));
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  // Stop i is reached once the line passes its share of the track.
  const reached = (index: number) => progress >= index / (COUNT - 1) - 0.001;

  return (
    <ol ref={ref} className="relative mt-14 grid gap-10 lg:grid-cols-6 lg:gap-5">
      {/* Track and fill, vertical on phones. */}
      <span aria-hidden className="absolute bottom-6 left-[17px] top-4 w-[2px] bg-grid lg:hidden">
        <span className="block h-full w-full origin-top bg-cobalt" style={{ transform: `scaleY(${progress})` }} />
      </span>
      {/* Horizontal on wide screens, from the first node's centre to the last. */}
      <span
        aria-hidden
        className="absolute left-[calc(100%/12)] right-[calc(100%/12)] top-[17px] hidden h-[2px] bg-grid lg:block"
      >
        <span className="block h-full w-full origin-left bg-cobalt" style={{ transform: `scaleX(${progress})` }} />
      </span>

      {processStages.map((stage, index) => {
        const on = reached(index);
        const last = index === COUNT - 1;
        return (
          <li key={stage.name} className="relative grid grid-cols-[36px_1fr] gap-x-5 lg:flex lg:flex-col lg:items-center lg:text-center">
            <span
              className={clsx(
                'relative z-10 grid h-9 w-9 place-items-center rounded-full border-[1.5px] border-ink font-mono text-xs transition-colors duration-300',
                on ? (last ? 'bg-sun text-ink' : 'bg-ink text-paper') : 'bg-white text-ink',
              )}
            >
              {on && !last ? '✓' : String(index + 1).padStart(2, '0')}
            </span>
            <div className="lg:mt-5">
              <div className="flex min-h-[28px] items-center gap-3 lg:justify-center">
                <h3 className="font-display text-xl font-extrabold tracking-tight">{stage.name}</h3>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted">{stage.short}</p>
              <span className={clsx('stamp mt-4', on ? 'kl-stamp-in' : 'invisible')}>
                {index === 0 ? 'Free call' : last ? 'All yours' : 'Approved'}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
