'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { loginHref } from '@/lib/auth';
import { ApiError } from '@/services/api';

/** How often a visible page asks for fresh data. */
export const LIVE_INTERVAL_MS = 30_000;

type Snapshot<T> = {
  key: string;
  data: T | null;
  error: unknown;
  /** The last background refresh failed; `data` is what we had before. */
  stale: boolean;
};

export type LiveData<T> = {
  data: T | null;
  /** Only set when there is nothing to show: a failed background refresh keeps the data and sets `stale`. */
  error: unknown;
  stale: boolean;
  /** Clear a failed first load and try again. */
  retry: () => void;
  /** Put a fresh copy in place, such as the one an action answered with. */
  set: (data: T) => void;
};

/**
 * Data that keeps itself up to date while someone is looking at it.
 *
 * Loads once, then again every `intervalMs` while the tab is visible. A hidden
 * tab stops asking, and becoming visible again refreshes straight away.
 *
 * Background refreshes never show a loading state and never replace what is on
 * screen with an error. They only swap the data, so anything the person is
 * typing lives in its own component state and is left alone. A refresh that
 * started before a local change (`set`) is thrown away when it lands, so it
 * cannot put back what the change replaced.
 *
 * `key` names what is loaded: when it changes, the old data is dropped.
 */
export function useLiveData<T>(key: string, load: () => Promise<T>, intervalMs = LIVE_INTERVAL_MS): LiveData<T> {
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  const [snapshot, setSnapshot] = useState<Snapshot<T>>({ key, data: null, error: null, stale: false });
  const [attempt, setAttempt] = useState(0);
  // Bumped by every local change and every new key; a response from an older
  // generation is out of date by the time it lands.
  const generation = useRef(0);
  const inFlight = useRef<number | null>(null);

  const fetchNow = useCallback(
    async (background: boolean) => {
      const gen = generation.current;
      if (background && inFlight.current === gen) return;
      inFlight.current = gen;
      try {
        const data = await loadRef.current();
        if (gen !== generation.current) return;
        setSnapshot({ key, data, error: null, stale: false });
      } catch (error) {
        if (gen !== generation.current) return;
        if (error instanceof ApiError && error.status === 401) {
          // The session ended, perhaps signed out from another device.
          window.location.assign(loginHref(window.location.pathname));
          return;
        }
        setSnapshot((prev) =>
          prev.key === key && prev.data !== null ? { ...prev, stale: true } : { key, data: null, error, stale: false },
        );
      } finally {
        if (inFlight.current === gen) inFlight.current = null;
      }
    },
    [key],
  );

  useEffect(() => {
    generation.current += 1;
    let timer: number | undefined;
    const stop = () => {
      if (timer !== undefined) window.clearInterval(timer);
      timer = undefined;
    };
    const start = () => {
      stop();
      timer = window.setInterval(() => void fetchNow(true), intervalMs);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void fetchNow(true);
        start();
      } else {
        stop();
      }
    };

    void fetchNow(false);
    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
      generation.current += 1;
    };
  }, [fetchNow, intervalMs, attempt]);

  const retry = useCallback(() => {
    setSnapshot({ key, data: null, error: null, stale: false });
    setAttempt((n) => n + 1);
  }, [key]);

  const set = useCallback(
    (data: T) => {
      generation.current += 1;
      setSnapshot({ key, data, error: null, stale: false });
    },
    [key],
  );

  const current = snapshot.key === key;
  return {
    data: current ? snapshot.data : null,
    error: current ? snapshot.error : null,
    stale: current && snapshot.stale,
    retry,
    set,
  };
}
