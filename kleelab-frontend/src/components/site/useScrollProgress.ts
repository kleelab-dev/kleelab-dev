'use client';

import { useEffect, useState } from 'react';

/**
 * How far an element has been scrolled through, from 0 to 1: 0 when its top
 * reaches 80% down the screen, 1 when its bottom reaches 55%. Works the same
 * scrolling back up, so a line drawn by it un-draws too.
 *
 * Starts at 1, so the server render and reduced-motion users see the finished
 * state.
 */
export function useScrollProgress(ref: React.RefObject<HTMLElement | null>) {
  const [progress, setProgress] = useState(1);

  useEffect(() => {
    const node = ref.current;
    if (!node || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = node.getBoundingClientRect();
      const vh = window.innerHeight;
      const start = vh * 0.8;
      const end = vh * 0.55 - rect.height;
      setProgress(Math.min(1, Math.max(0, (start - rect.top) / (start - end))));
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
  }, [ref]);

  return progress;
}
