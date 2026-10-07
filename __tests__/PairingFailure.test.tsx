import ReactTestRenderer from 'react-test-renderer';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import NativeAppleTV from '../src/specs/NativeAppleTV';
import { PairingScreen } from '../src/pairing/PairingScreen';
import { appleTVStore } from '../src/appletv/store';
import { useAppleTV } from '../src/appletv/useAppleTV';
import type { AppleTVDeviceInfo, ConnectionState } from '../src/appletv/types';

jest.mock('react-native-gesture-handler', () => ({
  ...jest.requireActual('react-native-gesture-handler'),
  GestureDetector: ({ children }: { children: React.ReactNode }) => children,
}));

const roku: AppleTVDeviceInfo = { id: 'roku:1', name: 'Bedroom Roku', address: '192.168.0.198', port: 8060, model: 'Roku TV', identifier: 'roku:1' };
const otherTv: AppleTVDeviceInfo = { id: 'tv:other', name: 'Living Room Apple TV', address: '192.168.0.50', port: 7000, model: 'AppleTV6,2', identifier: null };
const failed: ConnectionState = {
  state: 'failed',
  device: roku,
  reason: 'failed to connect to /192.168.0.198 (port 8060) after 3000ms',
  stalePairing: false,
  canWake: true,
};

const texts = (renderer: ReactTestRenderer.ReactTestRenderer) =>
  renderer.root.findAll(node => typeof node.props.children === 'string').map(node => node.props.children as string);
const press = (renderer: ReactTestRenderer.ReactTestRenderer, label: string) =>
  renderer.root.find(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function').props.onPress();

function StoreBackedPairingScreen() {
  const { devices, connection } = useAppleTV();
  return <PairingScreen devices={devices} connection={connection} />;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(NativeAppleTV.disconnect).mockReset().mockResolvedValue(undefined);
  appleTVStore.setDevices([]);
  appleTVStore.setApps([]);
  appleTVStore.setConnection({ state: 'disconnected' });
});

test('an unreachable TV can be skipped or forgotten instead of only retried', async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <GestureHandlerRootView><PairingScreen devices={[]} connection={failed} /></GestureHandlerRootView>,
    );
  });
  expect(texts(renderer)).toEqual(expect.arrayContaining(['Retry', 'Choose another TV', 'Forget Bedroom Roku']));

  await ReactTestRenderer.act(() => press(renderer, 'Choose another TV'));
  expect(texts(renderer)).toEqual(
    expect.arrayContaining(['Apple TVs and Roku TVs on your network', 'Back to Bedroom Roku']),
  );
  expect(NativeAppleTV.disconnect).toHaveBeenCalledTimes(1);
  expect(NativeAppleTV.startDiscovery).toHaveBeenCalled();

  await ReactTestRenderer.act(() => renderer.unmount());
});

test('choosing another TV waits for reconnect cancellation before showing the device list', async () => {
  let finishDisconnect!: () => void;
  const disconnect = new Promise<void>(resolve => { finishDisconnect = resolve; });
  jest.mocked(NativeAppleTV.disconnect).mockReturnValue(disconnect);

  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <GestureHandlerRootView><PairingScreen devices={[otherTv]} connection={failed} /></GestureHandlerRootView>,
    );
  });
  const discoveryCallsBefore = jest.mocked(NativeAppleTV.startDiscovery).mock.calls.length;

  let switching!: Promise<void>;
  await ReactTestRenderer.act(() => {
    switching = press(renderer, 'Choose another TV') as Promise<void>;
  });

  expect(texts(renderer)).toContain('Stopping reconnect…');
  expect(texts(renderer)).not.toContain('Apple TVs and Roku TVs on your network');
  expect(NativeAppleTV.startDiscovery).toHaveBeenCalledTimes(discoveryCallsBefore);

  await ReactTestRenderer.act(async () => {
    finishDisconnect();
    await switching;
  });

  expect(texts(renderer)).toContain('Apple TVs and Roku TVs on your network');
  expect(NativeAppleTV.startDiscovery).toHaveBeenCalledTimes(discoveryCallsBefore + 1);
  await ReactTestRenderer.act(() => renderer.unmount());
});

test('a failed disconnect leaves TV browsing unavailable and allows another attempt', async () => {
  jest.mocked(NativeAppleTV.disconnect).mockRejectedValueOnce(new Error('Service unavailable'));
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <GestureHandlerRootView><PairingScreen devices={[otherTv]} connection={failed} /></GestureHandlerRootView>,
    );
  });
  const discoveryCallsBefore = jest.mocked(NativeAppleTV.startDiscovery).mock.calls.length;
  await ReactTestRenderer.act(() => press(renderer, 'Choose another TV'));
  expect(texts(renderer)).toContain('Service unavailable');
  expect(texts(renderer)).not.toContain('Apple TVs and Roku TVs on your network');
  expect(NativeAppleTV.startDiscovery).toHaveBeenCalledTimes(discoveryCallsBefore);
  const choose = renderer.root.find(node => node.props.accessibilityLabel === 'Choose another TV' && typeof node.props.onPress === 'function');
  expect(choose.props.disabled).toBe(false);
  await ReactTestRenderer.act(() => press(renderer, 'Choose another TV'));
  expect(texts(renderer)).toContain('Apple TVs and Roku TVs on your network');
  await ReactTestRenderer.act(() => renderer.unmount());
});

test('forgetting a failed noncurrent TV returns to browsing without offering to reopen it', async () => {
  appleTVStore.setDevices([otherTv, roku]);
  appleTVStore.setConnection(failed);

  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <GestureHandlerRootView><StoreBackedPairingScreen /></GestureHandlerRootView>,
    );
  });

  await ReactTestRenderer.act(() => press(renderer, 'Forget Bedroom Roku'));

  expect(NativeAppleTV.forgetDevice).toHaveBeenCalledWith(roku.id);
  expect(texts(renderer)).toEqual(expect.arrayContaining(['Apple TVs and Roku TVs on your network']));
  expect(texts(renderer)).not.toContain('Back to Bedroom Roku');
  expect(appleTVStore.getSnapshot().connection).toEqual({ state: 'disconnected' });
  expect(appleTVStore.getSnapshot().devices).toEqual([otherTv]);
  expect(NativeAppleTV.disconnect).not.toHaveBeenCalled();

  await ReactTestRenderer.act(() => renderer.unmount());
});
