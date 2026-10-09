import Renderer, { act } from 'react-test-renderer';
import NativeAppleTV from '../src/specs/NativeAppleTV';
import { PlaybackPairing } from '../src/components/PlaybackPairing';

const containsText = (child: unknown, label: string): boolean => {
  if (child === label) return true;
  if (Array.isArray(child)) return child.some(item => containsText(item, label));
  if (child && typeof child === 'object' && 'props' in child) {
    return containsText((child as { props?: { children?: unknown } }).props?.children, label);
  }
  return false;
};

const button = (tree: Renderer.ReactTestRenderer, label: string) => {
  const match = tree.root.findAll(node =>
    node.props.accessibilityRole === 'button' &&
    typeof node.props.onPress === 'function' &&
    containsText(node.props.children, label),
  )[0];
  if (!match) throw new Error(`Could not find button: ${label}`);
  return match;
};

beforeEach(() => jest.clearAllMocks());

test('failed PIN submission resets the dialog so retry starts a fresh AirPlay pairing', async () => {
  jest.mocked(NativeAppleTV.submitAirPlayPin).mockRejectedValueOnce(
    new Error('Could not reach the TV while a VPN is active.'),
  );

  let tree!: Renderer.ReactTestRenderer;
  await act(async () => {
    tree = Renderer.create(<PlaybackPairing deviceId="tv:1" deviceName="Living Room TV" />);
  });

  await act(async () => { await button(tree, 'Enable playback details').props.onPress(); });
  const pinInput = () => tree.root.findByProps({ accessibilityLabel: 'AirPlay pairing code' });
  await act(async () => { pinInput().props.onChangeText('1234'); });
  await act(async () => { await button(tree, 'Pair').props.onPress(); });

  expect(tree.root.findAllByProps({ accessibilityLabel: 'AirPlay pairing code' })).toHaveLength(0);
  expect(tree.root.findAll(node => node.props.children === 'Could not reach the TV while a VPN is active.').length)
    .toBeGreaterThan(0);

  await act(async () => { await button(tree, 'Try again').props.onPress(); });
  expect(NativeAppleTV.startAirPlayPairing).toHaveBeenCalledTimes(2);
  expect(pinInput().props.value).toBe('');

  await act(async () => { tree.unmount(); });
});
