import NativeHaptics from '../specs/NativeHaptics';

export type HapticStyle = 'light' | 'medium' | 'heavy' | 'selection';

/** Fire-and-forget; a missing/broken vibrator must never affect remote control. */
export function triggerHaptic(style: HapticStyle = 'light'): void {
  try {
    const result = NativeHaptics.impact(style) as void | Promise<void>;
    // Some TurboModule bridges surface native failures as rejected promises
    // even when the Spec is typed as void -- swallow those too.
    if (result != null && typeof (result as Promise<void>).then === 'function') {
      void (result as Promise<void>).catch(() => {});
    }
  } catch {
    // best-effort
  }
}
