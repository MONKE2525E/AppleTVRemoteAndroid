import NativeAppSettings from '../specs/NativeAppSettings';

/** Tiny JSON-in-preferences helpers shared by the icon and app-list caches. */

export async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await NativeAppSettings.getPreference(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    NativeAppSettings.setPreference(key, JSON.stringify(value));
  } catch {
    // Caching is best-effort; never surface storage failures to the remote UI.
  }
}
