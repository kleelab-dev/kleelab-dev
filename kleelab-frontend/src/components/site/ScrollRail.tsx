'use client';

import { useRef } from 'react';
import { useScrollProgress } from '@/components/site/useScrollProgress';

/**
 * A vertical blueprint line that draws itself in cobalt as you scroll past it.
 * Position it with `className`, e.g. absolutely down the side of a list.
 */
export function ScrollRail({ className }: { className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const progress = useScrollProgress(ref);
  return (
    <span ref={ref} aria-hidden className={`w-[2px] bg-grid ${className ?? ''}`}>
      <span className="block h-full w-full origin-top bg-cobalt" style={{ transform: `scaleY(${progress})` }} />
    </span>
  );
}
