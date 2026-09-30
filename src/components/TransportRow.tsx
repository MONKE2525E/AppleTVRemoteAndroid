import { StyleSheet, View } from 'react-native';
import { GEOMETRY } from '../adaptive/geometry';
import { appleTV } from '../appletv/client';
import type { PlaybackInfo } from '../appletv/types';
import { CircleIconButton } from './CircleIconButton';
import { BackIcon, PauseIcon, PlayIcon, TVIcon } from './icons/Icons';

interface TransportRowProps {
  scale: number;
  playback: PlaybackInfo | null;
}

/** Play/Pause and TV Home flank a larger, dominant Back/Menu button -- matches the reference app's proportions, not three equal-sized circles. */
export function TransportRow({ scale, playback }: TransportRowProps) {
  const sideSize = GEOMETRY.transportSideSize * scale;
  const bigSize = GEOMETRY.transportBigSize * scale;
  const isPlaying = playback?.playbackState === 'playing';

  return (
    <View style={[styles.row, { marginHorizontal: GEOMETRY.transportSideMargin * scale }]}>
      <CircleIconButton size={sideSize} onPress={() => appleTV.playPause()} accessibilityLabel={isPlaying ? 'Pause' : 'Play'}>
        {isPlaying ? <PauseIcon size={sideSize * 0.36} /> : <PlayIcon size={sideSize * 0.36} />}
      </CircleIconButton>
      <CircleIconButton size={bigSize} onPress={() => appleTV.pressButton('MENU')} accessibilityLabel="Back">
        <BackIcon size={bigSize * 0.4} />
      </CircleIconButton>
      <CircleIconButton
        size={sideSize}
        onPress={() => appleTV.pressButton('HOME')}
        onLongPress={() => appleTV.holdButton('HOME')}
        accessibilityLabel="TV Home"
      >
        <TVIcon size={sideSize * 0.42} />
      </CircleIconButton>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
