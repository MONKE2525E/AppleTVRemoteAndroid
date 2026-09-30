import { VolumeOff } from 'lucide-react-native';
import Svg, { Circle, Path, Rect, Text as SvgText } from 'react-native-svg';
import { COLORS } from '../../animations/constants';

export interface IconProps {
  size?: number;
  color?: string;
}

const DEFAULT_SIZE = 20;

/** SF Symbol-style `power`: open ring with a centered stem through the gap. */
export function PowerIcon({ size = DEFAULT_SIZE, color = COLORS.icon }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 2.8v9.2"
        stroke={color}
        strokeWidth={2.15}
        strokeLinecap="round"
        fill="none"
      />
      <Path
        d="M7.15 5.35a7.1 7.1 0 1 0 9.7 0"
        stroke={color}
        strokeWidth={2.15}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}

/** Lucide `volume-off` -- speaker with a slash, not a hand-drawn path. */
export function MuteIcon({ size = DEFAULT_SIZE, color = COLORS.icon }: IconProps) {
  return <VolumeOff size={size} color={color} strokeWidth={2} />;
}

/** Points right at rest; DeviceSelectorPill rotates it 0->90deg when the selector opens. */
export function ChevronIcon({ size = 12, color = COLORS.iconSecondary }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M9 6l6 6-6 6" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

export function TVIcon({ size = DEFAULT_SIZE, color = COLORS.icon }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x="3" y="5" width="18" height="12" rx="2" stroke={color} strokeWidth={2} fill="none" />
      <Path d="M9 20h6M12 17v3" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

export function BackIcon({ size = DEFAULT_SIZE, color = COLORS.icon }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M15 6l-6 6 6 6" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

export function PlayIcon({ size = DEFAULT_SIZE, color = COLORS.icon }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M8 5v14l11-7z" fill={color} />
    </Svg>
  );
}

export function PauseIcon({ size = DEFAULT_SIZE, color = COLORS.icon }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x="6" y="5" width="4" height="14" rx="1" fill={color} />
      <Rect x="14" y="5" width="4" height="14" rx="1" fill={color} />
    </Svg>
  );
}

/**
 * Google Material `replay_10` / `forward_10` (Apache-2.0). The "10" is real
 * vector paths, not SvgText, so it stays optically centered inside the ring.
 */
export function SkipIcon({
  size = DEFAULT_SIZE,
  color = COLORS.icon,
  direction,
}: IconProps & { direction: 'back' | 'forward'; seconds?: number }) {
  if (direction === 'back') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path
          d="M11.99 5V1l-5 5 5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"
          fill={color}
        />
        <Path d="M10.89 16h-.85v-3.26l-1.01.31v-.69l1.77-.63h.09V16z" fill={color} />
        <Path
          d="M15.17 14.24c0 .32-.03.6-.1.82s-.17.42-.29.57-.28.26-.45.33-.37.1-.59.1-.41-.03-.59-.1-.33-.18-.46-.33-.23-.34-.3-.57-.11-.5-.11-.82V13.5c0-.32.03-.6.1-.82s.17-.42.29-.57.28-.26.45-.33.37-.1.59-.1.41.03.59.1c.18.07.33.18.46.33s.23.34.3.57.11.5.11.82v.74zm-.85-.86c0-.19-.01-.35-.04-.48s-.07-.23-.12-.31-.11-.14-.19-.17-.16-.05-.25-.05-.18.02-.25.05-.14.09-.19.17-.09.18-.12.31-.04.29-.04.48v.97c0 .19.01.35.04.48s.07.24.12.32.11.14.19.17.16.05.25.05.18-.02.25-.05.14-.09.19-.17.09-.19.11-.32.04-.29.04-.48v-.97z"
          fill={color}
        />
      </Svg>
    );
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M18 13c0 3.31-2.69 6-6 6s-6-2.69-6-6 2.69-6 6-6v4l5-5-5-5v4c-4.42 0-8 3.58-8 8 0 4.42 3.58 8 8 8s8-3.58 8-8h-2z"
        fill={color}
      />
      <Path d="M10.86 15.94V11.67h-.09L9 12.3v.69l1.01-.31v3.26h.85z" fill={color} />
      <Path
        d="M12.25 13.44v.74c0 1.9 1.31 1.82 1.44 1.82.14 0 1.44.09 1.44-1.82v-.74c0-1.9-1.31-1.82-1.44-1.82-.14 0-1.44-.09-1.44 1.82zm2.04-.12v.97c0 .77-.21 1.03-.59 1.03-.38 0-.6-.26-.6-1.03v-.97c0-.75.22-1.01.59-1.01.38 0 .6.27.6 1.01z"
        fill={color}
      />
    </Svg>
  );
}

/** SF Symbol-style `info.circle`. */
export function InfoIcon({ size = DEFAULT_SIZE, color = COLORS.icon }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="9.15" stroke={color} strokeWidth={1.65} fill="none" />
      <Circle cx="12" cy="7.55" r="1.2" fill={color} />
      <Path d="M12 11v6.35" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

/**
 * Captions control as on the Apple TV Remote: rounded balloon whose
 * bottom-left corner comes to a sharp speech-tail point, with bold "CC".
 */
export function CaptionsIcon({ size = DEFAULT_SIZE, color = COLORS.icon }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M5.2 4h13.6c1.1 0 2 .9 2 2v7.8c0 1.1-.9 2-2 2H10.4L5.9 19.7c-.45.35-1.1.03-1.1-.55V15.8H5.2c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"
        stroke={color}
        strokeWidth={1.55}
        strokeLinejoin="round"
        fill="none"
      />
      <SvgText x="12.1" y="12.6" fontSize={8.2} fontWeight="700" fill={color} textAnchor="middle">
        CC
      </SvgText>
    </Svg>
  );
}

export function CheckmarkIcon({ size = DEFAULT_SIZE, color = COLORS.accent }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M5 12l5 5L19 7" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

export function FindIcon({ size = DEFAULT_SIZE, color = COLORS.icon }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 21s7-7.5 7-12a7 7 0 1 0-14 0c0 4.5 7 12 7 12z" stroke={color} strokeWidth={1.8} fill="none" />
      <Circle cx="12" cy="9" r="2.2" fill={color} />
    </Svg>
  );
}
