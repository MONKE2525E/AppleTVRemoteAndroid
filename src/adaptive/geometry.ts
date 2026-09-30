/**
 * Reference frame the static geometry below was measured against (iPhone
 * 13/14/15-class screen, 390x844 logical points -- matches the 1170x2532 @3x
 * reference screenshots). Every component multiplies these by
 * AdaptiveLayout.scale rather than using hardcoded phone pixels, so the same
 * proportions hold when folded (near 1:1 against this reference) and when
 * centered/constrained inside a capped width when unfolded.
 *
 * Values are a best-effort reconstruction of the resting-state screenshots;
 * they are intentionally centralized here so they can be tuned against a
 * real device without touching component code.
 */
export const REFERENCE_WIDTH = 390;
export const REFERENCE_HEIGHT = 844;

export const GEOMETRY = {
  topBarSideMargin: 16,
  // Mute, device pill, and Power share one height. Tight gap so the pill
  // stretches between the two circles like Apple's top band.
  topBarControlSize: 46,
  topBarGap: 10,
  devicePillHorizontalPadding: 16,
  chevronSize: 12,

  gapTopBarToSurface: 18,

  // The touchpad is the dominant element -- it fills essentially all the
  // remaining space between the top bar and the transport row. Height is
  // measured from layout (see RemoteScreen), not clamped to a fixed pt range,
  // so opening the device list only shortens the pad and never nudges Play/Back/TV.
  touchSurfaceRadius: 32,
  touchSurfaceSideMargin: 20,

  // The -10/info/captions/+10 row lives *inside* the touchpad's bottom edge
  // (only while capabilities call for it), not as a separate element below.
  contextualIconSize: 32,
  contextualBottomInset: 28,

  gapSurfaceToTransport: 22,
  // Play/Pause and TV Home flank a larger, dominant Back/Menu button.
  transportSideSize: 78,
  transportBigSize: 120,
  transportSideMargin: 26,

  bottomMargin: 18,

  deviceRowHeight: 44,
  deviceRowIconSize: 22,
  deviceRowCheckSlot: 22,
} as const;

/** Composition width caps -- keeps the remote from stretching edge-to-edge on large/unfolded screens. */
export const COMPACT_MAX_WIDTH = 430;
export const EXPANDED_MAX_WIDTH = 460;

/** Usable-width threshold above which we switch from a near-1:1 phone composition to the centered/constrained one. */
export const EXPANDED_WIDTH_THRESHOLD = 600;
