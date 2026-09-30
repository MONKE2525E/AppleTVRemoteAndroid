const mockClient = {
  ready: jest.fn(async () => {}),
  optIn: jest.fn(async () => {}),
  optOut: jest.fn(async () => {}),
  capture: jest.fn(),
  captureException: jest.fn(),
  flush: jest.fn(async () => {}),
};
const mockConstructor = jest.fn<typeof mockClient, [string, object]>(() => mockClient);
jest.mock('posthog-react-native', () => ({ __esModule: true, default: mockConstructor }));

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  (globalThis as unknown as { __DEV__: boolean }).__DEV__ = false;
});
afterEach(() => { (globalThis as unknown as { __DEV__: boolean }).__DEV__ = true; });

test('initializes once and supplies build metadata for source maps', async () => {
  const analytics = require('../src/analytics/analytics');
  await Promise.all([analytics.initAnalytics(), analytics.initAnalytics()]);
  expect(mockConstructor).toHaveBeenCalledTimes(1);
  expect(mockConstructor.mock.calls[0][1]).toMatchObject({
    customAppProperties: { $app_version: '1.2.0', $app_build: '3', $app_namespace: 'com.privateremote.appletv' },
  });
});

test('handled native failures are reported without their address or credential message', async () => {
  const analytics = require('../src/analytics/analytics');
  await analytics.initAnalytics();
  analytics.captureCommandError('setVolume', { code: 'IOException', message: '192.168.1.2 token=secret' });
  await Promise.resolve();
  expect(mockClient.captureException).toHaveBeenCalledWith(expect.any(Error), { operation: 'setVolume' });
  expect(mockClient.captureException.mock.calls[0][0].message).toBe('Remote command failed: IOException');
});

test('an opt-out stops manual errors and the test action', async () => {
  const settings = require('../src/specs/NativeAppSettings').default;
  settings.getPreference.mockResolvedValueOnce('1');
  const analytics = require('../src/analytics/analytics');
  await analytics.initAnalytics();
  analytics.captureCommandError('volume', { code: 'IOException' });
  await Promise.resolve();
  expect(mockClient.captureException).not.toHaveBeenCalled();
  expect(mockClient.optOut).toHaveBeenCalled();
  await expect(analytics.sendTestError()).rejects.toThrow('Enable Share crash reports first');
});

test('startup cannot undo a privacy preference changed while loading', async () => {
  let resolvePreference: (value: string | null) => void = () => {};
  const settings = require('../src/specs/NativeAppSettings').default;
  settings.getPreference.mockImplementationOnce(() => new Promise(resolve => { resolvePreference = resolve; }));
  const analytics = require('../src/analytics/analytics');
  const starting = analytics.initAnalytics();
  analytics.setAnalyticsEnabled(false);
  resolvePreference(null);
  await starting;
  expect(analytics.isAnalyticsEnabled()).toBe(false);
  expect(mockClient.optIn).not.toHaveBeenCalled();
});

test('the explicit test sends a nonfatal error and waits for flush', async () => {
  (globalThis as unknown as { __DEV__: boolean }).__DEV__ = true;
  const analytics = require('../src/analytics/analytics');
  await analytics.initAnalytics();
  expect(mockConstructor).not.toHaveBeenCalled();
  await analytics.sendTestError();
  expect(mockClient.captureException).toHaveBeenCalledWith(expect.any(Error), { source: 'settings_test' });
  expect(mockClient.flush).toHaveBeenCalled();
});
