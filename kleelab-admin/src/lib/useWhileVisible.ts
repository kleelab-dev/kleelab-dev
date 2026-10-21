'use client';

import { useEffect, useRef } from 'react';

/**
 * Run `callback` every `ms` while the tab is visible: paused while it is hidden,
 * and run straight away when it comes back, so a returning teammate sees what
 * changed without waiting for the next tick. Not run on mount; the page loads
 * its own data first.
 */
export function useWhileVisible(callback: () => void, ms: number, enabled = true): void {
  const latest = useRef(callback);

  // The newest callback, so the timer never runs one that closed over old state.
  useEffect(() => {
    latest.current = callback;
  });

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer === null) timer = setInterval(() => latest.current(), ms);
    };
    const stop = () => {
      if (timer !== null) clearInterval(timer);
      timer = null;
    };
    function onVisibility() {
      if (document.hidden) {
        stop();
      } else {
        latest.current();
        start();
      }
    }
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [ms, enabled]);
}