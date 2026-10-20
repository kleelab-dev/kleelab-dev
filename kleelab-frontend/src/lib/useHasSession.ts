'use client';

import { useSyncExternalStore } from 'react';
import { hasSession } from '@/services/api';

function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange);
  return () => window.removeEventListener('storage', onChange);
}

/**
 * Whether this browser holds a session. Presence only, no round trip.
 *
 * Read through useSyncExternalStore so the server render (always signed out)
 * and the first client render agree, and other tabs signing in or out update it.
 */
export function useHasSession(): boolean {
  return useSyncExternalStore(subscribe, hasSession, () => false);
}
