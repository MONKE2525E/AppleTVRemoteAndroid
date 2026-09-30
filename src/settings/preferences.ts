import { useEffect, useState } from 'react';
import { track } from '../analytics/analytics';
import NativeAppSettings from '../specs/NativeAppSettings';

export type InputMode = 'swipe' | 'buttons';

const INPUT_MODE_KEY = 'inputMode';
const listeners = new Set<(mode: InputMode) => void>();
let inputMode: InputMode = 'swipe';
let loaded: Promise<void> | undefined;

function load(): Promise<void> {
  loaded ??= NativeAppSettings.getPreference(INPUT_MODE_KEY).then(
    stored => {
      if (stored === 'swipe' || stored === 'buttons') setMode(stored, false);
    },
    () => {},
  );
  return loaded;
}

function setMode(mode: InputMode, persist: boolean) {
  if (mode === inputMode && !persist) return;
  inputMode = mode;
  if (persist) NativeAppSettings.setPreference(INPUT_MODE_KEY, mode);
  listeners.forEach(listener => listener(mode));
}

export function setInputMode(mode: InputMode) {
  setMode(mode, true);
  track('input_mode_changed', { mode });
}

export function useInputMode(): InputMode {
  const [mode, setLocal] = useState(inputMode);
  useEffect(() => {
    listeners.add(setLocal);
    setLocal(inputMode);
    void load();
    return () => { listeners.delete(setLocal); };
  }, []);
  return mode;
}
