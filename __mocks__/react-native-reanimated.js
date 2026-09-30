/**
 * Minimal manual mock -- the real package's own jest mock pulls in native
 * init code (JSReanimated/CSS handlers) that isn't available under Jest for
 * this Reanimated/worklets version pairing. Covers only the API surface this
 * app actually uses; component rendering under test doesn't need real
 * animation, just stable no-op behavior. Auto-applied by Jest for any
 * node_modules package with a same-named file under a root __mocks__/.
 */
const React = require('react');
const RN = require('react-native');

function useSharedValue(initial) {
  const ref = React.useRef({ value: initial });
  return ref.current;
}

function useAnimatedStyle(factory) {
  return factory();
}

function useDerivedValue(factory) {
  return { value: factory() };
}

const identity = value => value;

module.exports = {
  __esModule: true,
  default: {
    View: RN.View,
    Text: RN.Text,
    Image: RN.Image,
    ScrollView: RN.ScrollView,
    createAnimatedComponent: Component => Component,
  },
  useSharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useAnimatedReaction: () => {},
  withTiming: identity,
  withSpring: identity,
  withDecay: identity,
  interpolate: (value, _input, output) => output[0],
  runOnUI: fn => fn,
  Easing: {
    linear: identity,
    ease: identity,
    out: identity,
    in: identity,
    inOut: identity,
  },
};
