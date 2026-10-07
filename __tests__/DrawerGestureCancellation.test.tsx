import ReactTestRenderer from 'react-test-renderer';
import { Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { SharedValue } from 'react-native-reanimated';
import { AppDrawer } from '../src/components/AppDrawer';
import { PadOverlay } from '../src/components/PadOverlay';
import { appleTVStore } from '../src/appletv/store';
import type { AppleTVDeviceInfo } from '../src/appletv/types';

jest.mock('react-native-gesture-handler', () => ({
  ...jest.requireActual('react-native-gesture-handler'),
  GestureDetector: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('react-native-reanimated', () => {
  const ReactNative = jest.requireActual('react-native');
  const entrance = {
    delay: () => entrance,
    duration: () => entrance,
  };
  return {
    __esModule: true,
    default: {
      View: ReactNative.View,
      ScrollView: ReactNative.ScrollView,
      Image: ReactNative.Image,
      Text: ReactNative.Text,
      createAnimatedComponent: (component: unknown) => component,
    },
    FadeIn: entrance,
    FadeInDown: entrance,
    cancelAnimation: jest.fn(),
    interpolate: () => 0,
    useAnimatedStyle: (callback: () => unknown) => callback(),
    useSharedValue: (value: unknown) => ({ value }),
    withRepeat: (animation: unknown) => animation,
    withSpring: (value: unknown) => value,
    withTiming: (value: unknown) => value,
  };
});

const device: AppleTVDeviceInfo = {
  id: 'tv-1',
  name: 'Living Room',
  address: '192.168.0.10',
  port: 7000,
  model: 'Roku TV',
  identifier: 'roku:tv-1',
};

const safeArea = (children: React.ReactNode) => (
  <GestureHandlerRootView>
    <SafeAreaProvider initialMetrics={{
      frame: { x: 0, y: 0, width: 360, height: 800 },
      insets: { top: 0, right: 0, bottom: 0, left: 0 },
    }}>
      {children}
    </SafeAreaProvider>
  </GestureHandlerRootView>
);

afterEach(() => {
  appleTVStore.setApps([]);
  jest.restoreAllMocks();
});

test('a cancelled handle pull settles closed once, while a successful release keeps its chosen state', async () => {
  const panSpy = jest.spyOn(Gesture, 'Pan');
  const progress = { value: 0 } as SharedValue<number>;
  const onDragStart = jest.fn();
  const onSettle = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(safeArea(
      <PadOverlay
        width={320}
        scale={1}
        drawerProgress={progress}
        sheetHeight={100}
        onDrawerDragStart={onDragStart}
        onDrawerSettle={onSettle}
      />,
    ));
  });

  const handlers = panSpy.mock.results[0].value.handlers;
  handlers.onStart({});
  handlers.onUpdate({ translationY: -45 });
  handlers.onEnd({ velocityY: -900 }, false);
  expect(onSettle).not.toHaveBeenCalled();
  handlers.onFinalize({}, false);

  expect(progress.value).toBe(0);
  expect(onDragStart).toHaveBeenCalledTimes(1);
  expect(onSettle).toHaveBeenCalledTimes(1);
  expect(onSettle).toHaveBeenLastCalledWith(false);

  progress.value = 0;
  onSettle.mockClear();
  handlers.onStart({});
  handlers.onUpdate({ translationY: -45 });
  handlers.onEnd({ velocityY: 0 }, true);
  handlers.onFinalize({}, true);

  expect(progress.value).toBe(1);
  expect(onSettle).toHaveBeenCalledTimes(1);
  expect(onSettle).toHaveBeenLastCalledWith(true);

  await ReactTestRenderer.act(() => renderer.unmount());
});

test('a pre-activation handle failure leaves the tap gesture free to open the drawer', async () => {
  const panSpy = jest.spyOn(Gesture, 'Pan');
  const tapSpy = jest.spyOn(Gesture, 'Tap');
  const progress = { value: 0.2 } as SharedValue<number>;
  const onDragStart = jest.fn();
  const onSettle = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(safeArea(
      <PadOverlay
        width={320}
        scale={1}
        drawerProgress={progress}
        sheetHeight={100}
        onDrawerDragStart={onDragStart}
        onDrawerSettle={onSettle}
      />,
    ));
  });

  const panHandlers = panSpy.mock.results[0].value.handlers;
  const tapHandlers = tapSpy.mock.results[0].value.handlers;
  panHandlers.onFinalize({}, false);
  expect(progress.value).toBe(0.2);
  expect(onSettle).not.toHaveBeenCalled();

  tapHandlers.onEnd({}, true);

  expect(progress.value).toBe(1);
  expect(onDragStart).toHaveBeenCalledTimes(1);
  expect(onSettle).toHaveBeenCalledTimes(1);
  expect(onSettle).toHaveBeenLastCalledWith(true);

  await ReactTestRenderer.act(() => renderer.unmount());
});

test('the Open apps button opens once from accessibility activation or a touch tap', async () => {
  const tapSpy = jest.spyOn(Gesture, 'Tap');
  const progress = { value: 0 } as SharedValue<number>;
  const onDragStart = jest.fn();
  const onSettle = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(safeArea(
      <PadOverlay
        width={320}
        scale={1}
        drawerProgress={progress}
        sheetHeight={100}
        onDrawerDragStart={onDragStart}
        onDrawerSettle={onSettle}
      />,
    ));
  });

  const handle = renderer.root.findByProps({ accessibilityLabel: 'Open apps' });
  expect(handle.props.accessibilityRole).toBe('button');
  expect(handle.props.accessibilityActions).toEqual([{ name: 'activate', label: 'Open apps' }]);
  expect(typeof handle.props.onAccessibilityAction).toBe('function');
  expect(typeof handle.props.onAccessibilityTap).toBe('function');
  await ReactTestRenderer.act(() => handle.props.onAccessibilityAction({ nativeEvent: { actionName: 'activate' } }));
  expect(progress.value).toBe(1);
  expect(onDragStart).toHaveBeenCalledTimes(1);
  expect(onSettle).toHaveBeenCalledTimes(1);

  await ReactTestRenderer.act(() => handle.props.onAccessibilityAction({ nativeEvent: { actionName: 'longpress' } }));
  expect(onDragStart).toHaveBeenCalledTimes(1);
  expect(onSettle).toHaveBeenCalledTimes(1);

  progress.value = 0;
  onDragStart.mockClear();
  onSettle.mockClear();
  await ReactTestRenderer.act(() => handle.props.onAccessibilityTap());
  expect(progress.value).toBe(1);
  expect(onDragStart).toHaveBeenCalledTimes(1);
  expect(onSettle).toHaveBeenCalledTimes(1);

  progress.value = 0;
  onDragStart.mockClear();
  onSettle.mockClear();
  tapSpy.mock.results[0].value.handlers.onEnd({}, true);
  expect(progress.value).toBe(1);
  expect(onDragStart).toHaveBeenCalledTimes(1);
  expect(onSettle).toHaveBeenCalledTimes(1);

  await ReactTestRenderer.act(() => renderer.unmount());
});

test('a cancelled header dismissal restores the open drawer once, while successful dismissal stays closed', async () => {
  const panSpy = jest.spyOn(Gesture, 'Pan');
  appleTVStore.setApps([{ name: 'Netflix', bundleId: 'netflix' }]);
  const progress = { value: 1 } as SharedValue<number>;
  const onSettle = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(safeArea(
      <AppDrawer
        open
        active={false}
        progress={progress}
        sheetHeight={200}
        width={360}
        left={0}
        scale={1}
        device={device}
        onSettle={onSettle}
      />,
    ));
  });

  const handlers = panSpy.mock.results[0].value.handlers;
  handlers.onStart({});
  handlers.onUpdate({ translationY: 100 });
  handlers.onEnd({ velocityY: 0 }, false);
  expect(onSettle).not.toHaveBeenCalled();
  handlers.onFinalize({}, false);

  expect(progress.value).toBe(1);
  expect(onSettle).toHaveBeenCalledTimes(1);
  expect(onSettle).toHaveBeenLastCalledWith(true);

  progress.value = 1;
  onSettle.mockClear();
  handlers.onStart({});
  handlers.onUpdate({ translationY: 100 });
  handlers.onEnd({ velocityY: 900 }, true);
  handlers.onFinalize({}, true);

  expect(progress.value).toBe(0);
  expect(onSettle).toHaveBeenCalledTimes(1);
  expect(onSettle).toHaveBeenLastCalledWith(false);

  await ReactTestRenderer.act(() => renderer.unmount());
});

test('a header pan that fails before activation leaves the open animation untouched', async () => {
  const panSpy = jest.spyOn(Gesture, 'Pan');
  appleTVStore.setApps([{ name: 'Netflix', bundleId: 'netflix' }]);
  const progress = { value: 0.65 } as SharedValue<number>;
  const onSettle = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(safeArea(
      <AppDrawer
        open
        active={false}
        progress={progress}
        sheetHeight={200}
        width={360}
        left={0}
        scale={1}
        device={device}
        onSettle={onSettle}
      />,
    ));
  });

  panSpy.mock.results[0].value.handlers.onFinalize({}, false);

  expect(progress.value).toBe(0.65);
  expect(onSettle).not.toHaveBeenCalled();

  await ReactTestRenderer.act(() => renderer.unmount());
});
