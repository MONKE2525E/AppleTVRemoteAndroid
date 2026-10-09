import ReactTestRenderer from 'react-test-renderer';
import { Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import NativeAppleTV from '../src/specs/NativeAppleTV';
import { TouchSurface } from '../src/components/TouchSurface';

jest.mock('react-native-gesture-handler', () => ({
  ...jest.requireActual('react-native-gesture-handler'),
  GestureDetector: ({ children }: { children: React.ReactNode }) => children,
}));

test('a long swipe sends one direction, and the next swipe sends another', async () => {
  const panSpy = jest.spyOn(Gesture, 'Pan');
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<GestureHandlerRootView><TouchSurface width={320} height={400} borderRadius={24} scale={1}
      showContextualIcons={false} onSkipBack={() => {}} onSkipForward={() => {}} /></GestureHandlerRootView>);
  });
  const pan = panSpy.mock.results[0].value;
  const handlers = pan.handlers;
  jest.mocked(NativeAppleTV.pressButton).mockClear();
  handlers.onBegin({});
  for (const distance of [10, 25, 60, 130, 250]) {
    handlers.onUpdate({ translationX: distance, translationY: 0 });
  }
  expect(NativeAppleTV.pressButton).toHaveBeenCalledTimes(1);
  expect(NativeAppleTV.pressButton).toHaveBeenLastCalledWith('RIGHT');
  handlers.onFinalize({});
  handlers.onBegin({});
  handlers.onUpdate({ translationX: 0, translationY: -60 });
  expect(NativeAppleTV.pressButton).toHaveBeenCalledTimes(2);
  expect(NativeAppleTV.pressButton).toHaveBeenLastCalledWith('UP');
  await ReactTestRenderer.act(() => { renderer!.unmount(); });
  panSpy.mockRestore();
});

test('screen-reader activation selects and exposes directional actions', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<GestureHandlerRootView><TouchSurface width={320} height={400} borderRadius={24} scale={1}
      showContextualIcons={false} onSkipBack={() => {}} onSkipForward={() => {}} /></GestureHandlerRootView>);
  });
  const surface = renderer!.root.findAll(n => n.props.accessibilityLabel === 'Touch surface' && n.props.onAccessibilityTap)[0];
  jest.mocked(NativeAppleTV.pressButton).mockClear();
  surface.props.onAccessibilityTap();
  expect(NativeAppleTV.pressButton).toHaveBeenLastCalledWith('SELECT');
  surface.props.onAccessibilityAction({ nativeEvent: { actionName: 'activate' } });
  expect(NativeAppleTV.pressButton).toHaveBeenLastCalledWith('SELECT');
  surface.props.onAccessibilityAction({ nativeEvent: { actionName: 'left' } });
  expect(NativeAppleTV.pressButton).toHaveBeenLastCalledWith('LEFT');
  expect(surface.props.accessibilityActions.map((a: { name: string }) => a.name)).toEqual(['activate', 'up', 'down', 'left', 'right']);
  await ReactTestRenderer.act(() => { renderer!.unmount(); });
});
