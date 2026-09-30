import { useSyncExternalStore } from 'react';
import { appleTV } from './client';
import { appleTVStore, type AppleTVState } from './store';

/** Read-only snapshot of native Apple TV state, plus the typed command client. */
export function useAppleTV(): AppleTVState & { commands: typeof appleTV } {
  const state = useSyncExternalStore(appleTVStore.subscribe, appleTVStore.getSnapshot);
  return { ...state, commands: appleTV };
}
