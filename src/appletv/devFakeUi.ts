/**
 * TEMP DEV-ONLY: emulator UI harness when no real Apple TV is reachable.
 * Search for "TEMP DEV-ONLY" / "DEV_FAKE_UI" to strip before shipping.
 *
 * Keeps the remote screen painted with a fake connected device + now-playing
 * state, swallows native command failures (no redbox on button taps), and
 * ignores native connection/device events that would otherwise wipe the fake
 * store the moment AppleTVService binds.
 */
export const DEV_FAKE_UI = false;
