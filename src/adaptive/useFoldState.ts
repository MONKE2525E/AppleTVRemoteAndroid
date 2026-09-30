import { useEffect, useState } from 'react';
import { NativeEventEmitter } from 'react-native';
import NativeFoldState from '../specs/NativeFoldState';
import { FLAT_FOLD_STATE, type FoldState } from './types';

// See src/appletv/client.ts for why this cast is needed.
const emitter = new NativeEventEmitter(NativeFoldState as never);

/**
 * Live fold/hinge posture from androidx.window, independent of any Apple TV
 * connection state -- see FoldStateModule.kt's layering note. Folding and
 * unfolding must never reset AppleTVState; this hook only ever informs
 * layout (see src/adaptive's layout hooks, built on top of this).
 */
export function useFoldState(): FoldState {
  const [state, setState] = useState<FoldState>(FLAT_FOLD_STATE);

  useEffect(() => {
    let cancelled = false;
    NativeFoldState.getCurrentFoldState().then(snapshot => {
      if (!cancelled) setState(snapshot as FoldState);
    });

    const subscription = emitter.addListener('foldStateChanged', (payload: Object) => {
      setState(payload as FoldState);
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  return state;
}
