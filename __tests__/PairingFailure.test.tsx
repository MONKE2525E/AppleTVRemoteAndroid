import ReactTestRenderer from 'react-test-renderer';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import NativeAppleTV from '../src/specs/NativeAppleTV';
import { PairingScreen } from '../src/pairing/PairingScreen';
import type { ConnectionState } from '../src/appletv/types';

jest.mock('react-native-gesture-handler', () => ({
  ...jest.requireActual('react-native-gesture-handler'),
  GestureDetector: ({ children }: { children: React.ReactNode }) => children,
}));

const roku = { id: 'roku:1', name: 'Bedroom Roku', address: '192.168.0.198', port: 8060, model: 'Roku TV', identifier: 'roku:1' };
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
  expect(NativeAppleTV.startDiscovery).toHaveBeenCalled();

  await ReactTestRenderer.act(() => renderer.unmount());
});
