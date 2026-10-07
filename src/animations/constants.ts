export const COLORS = {
  background: '#000000',
  // One shared frosted fill for Mute / pill / Power so the top row matches
  // Apple's even white band (circles and pill same material, same height).
  controlFill: 'rgba(255,255,255,0.13)',
  controlFillPressed: 'rgba(255,255,255,0.22)',
  controlBorder: 'rgba(255,255,255,0.04)',
  icon: '#FFFFFF',
  iconSecondary: 'rgba(255,255,255,0.55)',
  textSecondary: '#8E8E93',
  pillFill: 'rgba(255,255,255,0.13)',
  pillFillPressed: 'rgba(255,255,255,0.22)',
  touchSurfaceFill: 'rgba(255,255,255,0.08)',
  touchSurfaceBorder: 'rgba(255,255,255,0.10)',
  touchSurfaceHighlight: 'rgba(255,255,255,0.12)',
  separator: 'rgba(255,255,255,0.12)',
  sheetFill: '#1C1C1E',
  scrim: '#000000',
} as const;

/** Press-state feedback: quick, no bounce -- matches Apple's snappy control press. */
export const PRESS_SCALE = 0.96;
export const PRESS_OPACITY = 0.55;
export const PRESS_TIMING = { duration: 90 };

/**
 * Device-selector open/close spring. Tightly damped with overshoot clamped --
 * the reference recording shows a fast settle (~150-170ms) with no cartoon
 * bounce, and every piece (mute/power fade-out, chevron rotation, device row
 * fade-in, touch-surface reflow) shares this single driver so they move as
 * one overlapping motion rather than a sequence.
 */
export const SELECTOR_SPRING = { damping: 26, stiffness: 260, mass: 0.6, overshootClamping: true };

export const TOUCH_HIGHLIGHT_TIMING = { duration: 120 };

/**
 * App drawer sheet. Gesture release hands its velocity to this spring, so a
 * flick carries straight into the settle; overshoot is clamped so the sheet
 * never lifts off the bottom edge.
 */
export const DRAWER_SPRING = { damping: 28, stiffness: 240, mass: 0.7, overshootClamping: true };

/** Share of the sheet a pull must cover (or a flick speed in px/s) to open or dismiss it. */
export const DRAWER_COMMIT_FRACTION = 0.28;
export const DRAWER_FLICK_VELOCITY = 650;
