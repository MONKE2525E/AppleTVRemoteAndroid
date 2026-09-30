import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFoldState } from './useFoldState';
import { COMPACT_MAX_WIDTH, EXPANDED_MAX_WIDTH, EXPANDED_WIDTH_THRESHOLD, REFERENCE_WIDTH } from './geometry';
import type { FoldState } from './types';

export type AdaptiveMode = 'compact' | 'expanded';

export interface ContentRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AdaptiveLayout {
  mode: AdaptiveMode;
  windowWidth: number;
  windowHeight: number;
  /** Safe-area- and hinge-excluded rect the remote UI is centered/constrained within. */
  contentRect: ContentRect;
  /** Multiply GEOMETRY constants (authored against REFERENCE_WIDTH) by this. */
  scale: number;
  fold: FoldState;
}

/**
 * useWindowDimensions() + fold/hinge state -> one layout descriptor. Never
 * places controls under the hinge: in a half-opened posture, the usable rect
 * is clipped to whichever side of the hinge is larger, not stretched across
 * it. Folding/unfolding only ever changes this descriptor -- it must never
 * reset AppleTVState (see useFoldState.ts / useAppleTV.ts, which are
 * intentionally independent stores).
 */
export function useAdaptiveLayout(): AdaptiveLayout {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const fold = useFoldState();

  let usableLeft = insets.left;
  let usableRight = width - insets.right;
  let usableTop = insets.top;
  let usableBottom = height - insets.bottom;

  if (fold.posture === 'half_opened' && fold.bounds) {
    if (fold.orientation === 'vertical') {
      // Hinge runs top-to-bottom (book/tabletop-portrait) -- keep the wider half.
      const leftWidth = fold.bounds.left - usableLeft;
      const rightWidth = usableRight - fold.bounds.right;
      if (leftWidth >= rightWidth) {
        usableRight = fold.bounds.left;
      } else {
        usableLeft = fold.bounds.right;
      }
    } else if (fold.orientation === 'horizontal') {
      // Hinge runs left-to-right (tabletop/laptop posture) -- keep the taller half.
      const topHeight = fold.bounds.top - usableTop;
      const bottomHeight = usableBottom - fold.bounds.bottom;
      if (topHeight >= bottomHeight) {
        usableBottom = fold.bounds.top;
      } else {
        usableTop = fold.bounds.bottom;
      }
    }
  }

  const usableWidth = Math.max(0, usableRight - usableLeft);
  const usableHeight = Math.max(0, usableBottom - usableTop);

  const mode: AdaptiveMode = usableWidth >= EXPANDED_WIDTH_THRESHOLD ? 'expanded' : 'compact';
  const maxWidth = mode === 'expanded' ? EXPANDED_MAX_WIDTH : COMPACT_MAX_WIDTH;
  const contentWidth = Math.min(usableWidth, maxWidth);
  const contentX = usableLeft + (usableWidth - contentWidth) / 2;

  return {
    mode,
    windowWidth: width,
    windowHeight: height,
    contentRect: { x: contentX, y: usableTop, width: contentWidth, height: usableHeight },
    scale: contentWidth / REFERENCE_WIDTH,
    fold,
  };
}
