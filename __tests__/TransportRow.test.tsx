import ReactTestRenderer from 'react-test-renderer';
import { TransportRow } from '../src/components/TransportRow';
import { PlayPauseIcon } from '../src/components/icons/Icons';

jest.mock('react-native-gesture-handler', () => ({
  ...jest.requireActual('react-native-gesture-handler'),
  GestureDetector: ({ children }: { children: React.ReactNode }) => children,
}));

it('shows and announces a toggle when Fire TV playback state is unknown', () => {
  let renderer: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<TransportRow scale={1} playback={null} toggleOnly />);
  });
  expect(renderer!.root.findAll(n => n.props.accessibilityLabel === 'Play or pause').length).toBeGreaterThan(0);
  expect(renderer!.root.findAllByType(PlayPauseIcon)).toHaveLength(1);
  ReactTestRenderer.act(() => renderer!.unmount());
});
