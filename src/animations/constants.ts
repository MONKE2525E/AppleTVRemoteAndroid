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
  // Frosted glass is for buttons only; surfaces stay flat black / dark gray.
  // On a black app there is nothing behind a button to blur, so the glass comes
  // from a low fill, a top-lit gradient, a thin rim, and a brighter top edge.
  glassButtonFill: 'rgba(255,255,255,0.10)',
  glassButtonGradient: 'linear-gradient(180deg, rgba(255,255,255,0.15), rgba(255,255,255,0.02))',
  glassButtonBorder: 'rgba(255,255,255,0.13)',
  glassButtonRim: 'rgba(255,255,255,0.36)',
  cardFill: '#1C1C1E',
  accent: '#0A84FF',
  success: '#30D158',
  warning: '#FF9F0A',
  danger: '#FF453A',
} as const;

/** Press-state feedback: quick, no bounce -- matches Apple's snappy control press. */
export const PRESS_SCALE = 0.96;
export const PRESS_OPACITY = 0.55;
export const PRESS_TIMING = { duration: 90 };
/** Release spring for `bouncy` controls: overshoots rest slightly before settling. */
export const PRESS_SPRING = { damping: 9, stiffness: 320, mass: 0.6 };

/**
 * Device-selector open/close spring. Tightly damped with overshoot clamped --
 * the reference recording shows a fast settle (~150-170ms) with no cartoon
 * bounce, and every piece (mute/power fade-out, chevron rotation, device row
 * fade-in, touch-surface reflow) shares this single driver so they move as
 * one overlapping motion rather than a sequence.
 */
export const SELECTOR_SPRING = { damping: 26, stiffness: 260, mass: 0.6, overshootClamping: true };

export const TOUCH_HIGHLIGHT_TIMING = { duration: 120 };


/** Share of the sheet a pull must cover (or a flick speed in px/s) to open or dismiss it. */
export const DRAWER_COMMIT_FRACTION = 0.28;
export const DRAWER_FLICK_VELOCITY = 650;

/**
 * App drawer. Deliberately underdamped: a flick overshoots a little and
 * settles back, so the sheet feels like it has weight rather than sliding on
 * a rail. The sheet is built taller than its window so the overshoot never
 * exposes a gap.
 */
export const DRAWER_SPRING = { damping: 18, stiffness: 210, mass: 0.8 };
/** Dismissal stays crisp: no bounce while leaving. */
export const DRAWER_CLOSE_SPRING = { damping: 24, stiffness: 260, mass: 0.7, overshootClamping: true };
/** How far (in reference px) the sheet may overshoot past fully open. */
export const DRAWER_OVERSHOOT = 36;
