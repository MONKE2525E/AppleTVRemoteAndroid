import PostHog from 'posthog-react-native';
import NativeAppSettings from '../specs/NativeAppSettings';

/** Write-only project token: safe to ship in a public app. */
const POSTHOG_TOKEN = 'phc_CKAEbYevG6UNu4WCcG9bd7HUKaHZBamg8BNqfM8rsfCv';
const POSTHOG_HOST = 'https://us.i.posthog.com';
const OPT_OUT_KEY = 'analyticsOptOut';

let client: PostHog | undefined;
let initialization: Promise<void> | undefined;
let enabled = true;
let preferenceChanged = false;

/** Development reports are enabled only by the explicit Settings test action. */
export function initAnalytics(allowDevelopment = false): Promise<void> {
  if (__DEV__ && !allowDevelopment) return Promise.resolve();
  if (initialization) return initialization;
  initialization = (async () => {
    const [optOut, info] = await Promise.all([
      NativeAppSettings.getPreference(OPT_OUT_KEY).catch(() => null),
      NativeAppSettings.getAppInfo(),
    ]);
    if (!preferenceChanged) enabled = optOut !== '1';
    const app = info as { version: string; build: string; namespace: string };
    client = new PostHog(POSTHOG_TOKEN, {
      host: POSTHOG_HOST,
      disableGeoip: true,
      defaultOptIn: enabled,
      flushAt: 1,
      captureAppLifecycleEvents: true,
      enableSessionReplay: false,
      customAppProperties: {
        $app_version: app.version,
        $app_build: app.build,
        $app_namespace: app.namespace,
      },
      customStorage: {
        getItem: key => NativeAppSettings.getPreference(`ph_${key}`),
        setItem: (key, value) => NativeAppSettings.setPreference(`ph_${key}`, value),
      },
      before_send: event => enabled ? event : null,
      errorTracking: {
        autocapture: { uncaughtExceptions: true, unhandledRejections: true, nativeCrashes: true },
      },
    });
    await client.ready();
    // The app preference is authoritative over an older SDK opt-in value.
    if (enabled) await client.optIn();
    else await client.optOut();
  })().catch(error => {
    initialization = undefined;
    console.warn('Crash reporting could not start', error);
  });
  return initialization;
}

export function isAnalyticsEnabled(): boolean {
  return enabled;
}

export function setAnalyticsEnabled(next: boolean): void {
  preferenceChanged = true;
  enabled = next;
  NativeAppSettings.setPreference(OPT_OUT_KEY, next ? '0' : '1');
  if (next) void client?.optIn();
  else void client?.optOut();
}

export function track(event: string, properties?: Record<string, string | number | boolean>): void {
  void initAnalytics().then(() => {
    if (enabled) client?.capture(event, properties);
  });
}

export function captureError(error: unknown, context?: Record<string, string>): void {
  void initAnalytics().then(() => {
    if (enabled) client?.captureException(error, context);
  });
}

/** Native messages may contain device addresses or pairing data; send only a safe error category. */
export function captureCommandError(operation: string, error: unknown): void {
  const code = (error as { code?: unknown } | null)?.code;
  const category = typeof code === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(code) ? code : 'CommandError';
  captureError(new Error(`Remote command failed: ${category}`), { operation });
}

/** A nonfatal report, flushed immediately so setup can be checked on a real phone. */
export async function sendTestError(): Promise<void> {
  await initAnalytics(true);
  if (!enabled) throw new Error('Enable Share crash reports first.');
  if (!client) throw new Error('Crash reporting is unavailable.');
  client.captureException(new Error('TV Remote error tracking test'), { source: 'settings_test' });
  await client.flush();
}
