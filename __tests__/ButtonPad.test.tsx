import ReactTestRenderer from 'react-test-renderer';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ButtonPad, MIN_TOUCH_TARGET } from '../src/components/ButtonPad';

jest.mock('react-native-gesture-handler', () => ({
  ...jest.requireActual('react-native-gesture-handler'),
  GestureDetector: ({ children }: { children: React.ReactNode }) => children,
}));

function render(scale: number, transportKeys = false) {
  let renderer: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <GestureHandlerRootView>
        <ButtonPad width={320} height={500} scale={scale} showContextualIcons transportKeys={transportKeys}
          onSkipBack={() => {}} onSkipForward={() => {}} />
      </GestureHandlerRootView>,
    );
  });
  return renderer!;
}

function flat(style: unknown): Record<string, number> {
  return Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
}

test.each([0.8, 1, 1.2])('skip buttons keep a touch target of at least 48dp at scale %s', scale => {
  const renderer = render(scale);
  for (const label of ['Skip back 10 seconds', 'Skip forward 10 seconds']) {
    const node = renderer.root.findAll(n => n.props.accessibilityLabel === label && n.props.style)[0];
    const { width, height } = flat(node.props.style);
    expect(width).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
    expect(height).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
  }
  ReactTestRenderer.act(() => renderer.unmount());
});

test('Roku transport keys are labelled Rewind and Fast forward', () => {
  const renderer = render(1, true);
  expect(renderer.root.findAll(n => n.props.accessibilityLabel === 'Rewind').length).toBeGreaterThan(0);
  expect(renderer.root.findAll(n => n.props.accessibilityLabel === 'Fast forward').length).toBeGreaterThan(0);
  ReactTestRenderer.act(() => renderer.unmount());
});
