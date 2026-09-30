import PostHog from 'posthog-react-native';
import NativeAppSettings from '../specs/NativeAppSettings';

/** Write-only project token: safe to ship in a public app. */
const POSTHOG_TOKEN = 'phc_CKAEbYevG6UNu4WCcG9bd7HUKaHZBamg8BNqfM8rsfCv';
const POSTHOG_HOST = 'https://us.i.posthog.com';
const OPT_OUT_KEY = 'analyticsOptOut';

let client: PostHog | undefined;
let enabled = true;

/**
 * Crash/error reports plus a handful of named events. No autocapture, no
 * session replay, no identify -- device names, IPs and credentials are never
 * sent. Skipped in dev builds so local runs don't pollute the project.
 */
export async function initAnalytics(): Promise<void> {
  if (__DEV__ || client) return;
  enabled = (await NativeAppSettings.getPreference(OPT_OUT_KEY).catch(() => null)) !== '1';
  client = new PostHog(POSTHOG_TOKEN, {
    host: POSTHOG_HOST,
    disableGeoip: true,
    defaultOptIn: enabled,
    captureAppLifecycleEvents: true,
    enableSessionReplay: false,
    customStorage: {
      getItem: key => NativeAppSettings.getPreference(`ph_${key}`),
      setItem: (key, value) => NativeAppSettings.setPreference(`ph_${key}`, value),
    },
    errorTracking: {
      autocapture: { uncaughtExceptions: true, unhandledRejections: true, console: ['error'], nativeCrashes: true },
    },
  });
}

export function isAnalyticsEnabled(): boolean {
  return enabled;
}

export function setAnalyticsEnabled(next: boolean): void {
  enabled = next;
  NativeAppSettings.setPreference(OPT_OUT_KEY, next ? '0' : '1');
  if (next) void client?.optIn();
  else void client?.optOut();
}

export function track(event: string, properties?: Record<string, string | number | boolean>): void {
  if (enabled) client?.capture(event, properties);
}

export function captureError(error: unknown, context?: Record<string, string>): void {
  if (enabled) client?.captureException(error, context);
}
