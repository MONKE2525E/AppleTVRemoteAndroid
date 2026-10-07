# TV Remote for Android

Control Apple TVs and Roku TVs from Android. The React Native interface uses
a Kotlin Companion Link / MRP implementation for Apple TV and ECP for Roku,
with a bound service for the remote connection and playback details.

## Architecture

```
React Native UI (src/)
  -> TurboModule command/event facade (AppleTVModule.kt, FoldStateModule.kt, HapticsModule.kt)
    -> AppleTVService (bound service, owns the controller)
      -> AppleTVController (session/controller layer, only class besides
         discovery/securestore that touches the protocol module directly)
        -> android/protocol (vendored, near-verbatim -- see android/protocol/UPSTREAM.md)
```

`FoldStateModule` is independent of `AppleTVService`. `Media3PlaybackAdapter`
is a projection of `AppleTVController`'s MRP now-playing state onto a Media3
`Player`, not a second state machine -- commands issued through the Media3
session forward back into the controller. The service stays alive while clients
are bound, or as a connected-device foreground service during playback, and rebuilds its session from persisted state
(`CredentialStore` / `AppleTvSecureStore`, AndroidKeyStore-backed AES-GCM, no
EncryptedSharedPreferences) on every `onCreate()`, including after process
death.

## Pinned toolchain (resolved during setup)

| | Version |
|---|---|
| JDK | Temurin 21 (via `mise`) |
| Android compileSdk / targetSdk | 36 (Android 16) |
| Android minSdk | 26 |
| build-tools | 36.1.0 |
| NDK | 27.1.12297006 |
| Kotlin | 2.2.0 |
| React Native | 0.87.1 (New Architecture on) |
| React | 19.2.3 |
| react-native-reanimated | 4.6.0 |
| react-native-worklets | 0.12.2 |
| react-native-gesture-handler | 3.3.0 |
| react-native-safe-area-context | 5.5.2 |
| react-native-svg | 15.15.5 |
| androidx.window | 1.5.1 |
| androidx.media3 (session/common) | 1.5.1 |
| androidx.core-ktx | 1.16.0 (pinned below 1.19.x, which requires compileSdk 37) |
| kotlinx-coroutines-android | 1.11.0 |

The SDK/JDK toolchain is installed locally under `.toolchain/` (gitignored,
not system-wide) and pinned via `.mise.toml`. Before running any Gradle/adb
command in a fresh shell:

```sh
eval "$(mise env -s bash)"
```

## Running it

```sh
npm install
eval "$(mise env -s bash)"
npx react-native run-android   # or: cd android && ./gradlew :app:installDebug
```

Builds and emulator launch have been verified. Pairing, audio control, playback
metadata, and background behavior still need testing with real TVs and phones.
Use the hardware checklist below.

## Diagnostics screen (dev-only)

Long-press the top-left corner of the remote screen (invisible, ~32x32dp
hotspot) to open a diagnostics overlay: connection/MRP state, discovery and
reconnect counts, touch throughput (sent/coalesced per second), JS FPS,
window/content-rect bounds, fold posture/hinge bounds, current adaptive
layout mode, and the Media3 session projection. The diagnostics entry is disabled in release builds.

## Manual hardware test checklist

- [ ] First-run discovery finds real Apple TVs on the network
- [ ] Companion Link pairing (PIN entry) succeeds and connects
- [ ] AirPlay pairing for now-playing metadata (if prompted) succeeds
- [ ] Touchpad feels like the physical Siri Remote's touch surface (not 4-way swipe)
- [ ] Device-selector open/close matches the reference recording's timing/feel (no bounce)
- [ ] Fold/unfold while connected preserves the connection and app state
- [ ] Split-screen and rapid resize don't clip controls or place them under the hinge
- [ ] Repeated device-picker open/close stays smooth, no dropped frames
- [ ] Edge/corner touchpad gestures behave correctly
- [ ] Apple TV sleep/wake via the Power button
- [ ] Reconnect after Wi-Fi loss/change
- [ ] Pairing cancel and pairing failure (wrong PIN) recover cleanly
- [ ] Background the app during playback, then foreground -- state is intact
- [ ] Opening and connecting the remote posts no activity until content is playing
- [ ] Playing content shows a Live Update chip and expanded card on supported Android 16+ phones
- [ ] Pausing, stopping, losing playback metadata, or disconnecting removes the activity
- [ ] Pause and supported skip actions control the TV without opening the app
- [ ] After process death, reopening the app reconnects cleanly

## Playback controls and Roku TVs

- The remote stays bound while idle. While content is playing, a connected-device
  foreground service keeps playback monitoring and controls available in the background.
  It returns to a bound service on pause, stop, missing metadata, or disconnect.
- For Apple TV content details, open **Settings > Enable playback details**
  and enter the separate AirPlay code. Companion pairing alone only
  enables remote commands. The metadata connection retries after a dropped
  channel or failed heartbeat.
- Add the **TV playback controls** widget from your launcher's widget picker to
  see available content details. Its play/pause button opens the remote and
  sends the command once the service binds.
- Each touchpad swipe sends one directional step. Lift your finger before the
  next swipe; dragging farther does not repeat navigation.
- Discovery includes Roku SSDP alongside Apple's Companion discovery. Roku TVs
  connect through local ECP on port 8060 without an Apple pairing code. Enable
  **Settings > System > Advanced system settings > Control by mobile apps** on
  the Roku. ECP uses local HTTP, so the Android app permits cleartext traffic.
  Roku navigation, play/pause, rewind, fast forward, volume keys, mute and TV power are supported.
  Swipe-pad and notification controls use Roku Rev/Fwd keys, not a promised ten-second skip.
  Roku content metadata varies by channel; exact seeking and skip-by-seconds
  are not advertised. This does not add generic HomeKit or all AirPlay TV support.
- Apple TV volume uses relative up/down keys. Held rocker repeats do not queue
  behind a slow TV, and stale input expires. Every key press attempts a release
  even when cancelled or when an acknowledgement fails. Infrared-only audio setups
  still need a physical remote or another supported control path.

Roku protocol reference: https://developer.roku.com/dev/docs/external-control-api

Verification for this update includes TypeScript, Jest swipe regression and
render checks, native Roku parsing/identity tests, protocol tests and a release
APK build. Real Apple TV/Roku connections, background behavior,
and physical volume/gesture feel still need hardware testing.

## GitHub releases and app updates

[Download the latest APK](https://github.com/MONKE2525E/AppleTVRemoteAndroid/releases/latest).
Install this version once to receive future update prompts. Open **App updates**
on the discovery screen or in the connected remote's device selector to check
manually. The app checks when opened, when returning to it after an hour, and
with a daily WorkManager task. Background notifications require notification
permission. Android may delay background checks to save battery.

Updates download only when you tap **Install update**. Allow TV Remote to install
apps when Android prompts, return to the app, and tap the button again. The app
checks the APK's size, SHA-256 hash, package identity, version code, and signing
certificate before opening Android's confirmation screen. No GitHub login is
needed. Playback connections and saved pairings remain during normal updates.

To publish a new version, increase both values in `version.properties`, push the
change, and run **Publish release** from the repository's Actions tab. The workflow
runs checks, builds a signed universal APK, and publishes `TVRemote.apk`,
`update.json`, and `SHA256SUMS`. Keep version codes increasing and keep the same
signing key. Existing release versions cannot be overwritten by the workflow.

The repository uses GitHub Actions secrets `ANDROID_KEYSTORE_BASE64`,
`ANDROID_STORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD`.
Signing keys, local SDK files, saved device credentials, and build outputs are
excluded from source control. The release currently preserves the original
app's debug signing identity for compatibility with installations made before
this repository existed. Switching signing identities requires reinstalling
the app unless a signing migration is implemented.

The vendored protocol code and notices are in `android/protocol/`.

## Error tracking

Release builds initialize PostHog for uncaught JavaScript errors, unhandled
rejections, native crashes, and handled remote-command failures. Native command
reports contain the operation and error category, without raw native messages.
App version, build and package metadata let PostHog match uploaded source maps.
**Settings > Share crash reports** disables reporting. **Test crash reporting**
sends a nonfatal test error and waits for the upload. Development builds do not
report until that explicit test is used.

For native crash autocapture, enable **Enable exception autocapture** in the
PostHog project's error tracking settings. For readable JavaScript stacks, set
the GitHub Actions repository variable `POSTHOG_CLI_PROJECT_ID` and secret
`POSTHOG_CLI_API_KEY`. Use a project-restricted key with error tracking write.
The Metro serializer inserts a chunk ID into the bundle and source map. The
release workflow installs PostHog CLI and the Gradle hook uploads Hermes maps. Without credentials, builds still work
and the workflow warns that source maps were skipped. Local release builds use
the same environment variables, plus a globally installed `@posthog/cli`.

See [PostHog's React Native source map setup](https://posthog.com/docs/error-tracking/upload-source-maps/react-native).

## Android playback activity

The service publishes one MediaStyle notification with the real Media3 platform
session token. The earlier ProgressStyle notification is cancelled, including
notifications retained across an APK update. Samsung's Media player Now Bar and
Android's system media controls consume the same session. MediaStyle is not
eligible for Android's separate promoted Live Update chip API.

AppleTVService extends MediaSessionService and registers its session so Media3's
notification controller exports the available custom commands to the platform
session. It overrides notification publication to retain one card and the
connected-device foreground-service type. Back/forward command buttons are
registered with the session, not only the notification. Roku sends Rev/Fwd keys;
Apple TV sends relative ten-second skips when supported. The session exposes the
GET_TIMELINE command so reported duration reaches Android's media metadata.

TV-provided artwork takes precedence. Roku fetches the active channel icon from
query/icon/<plugin-id>, caches it per channel, and retries failures after a minute.
If the player omits its plugin ID, query/active-app supplies the channel identity.
For on-demand playback, runtime supplies duration when duration is missing or zero.
Image responses are bounded to 512 KiB. If artwork is unavailable, the installed
app icon replaces the generic music placeholder. A Roku channel icon is not the
video thumbnail. Roku YouTube may omit video title, duration, position and video
artwork from query/media-player; this feed cannot supply those missing details.
No timer or video identity is invented.

Only the explicit PLAYING state qualifies. The notification and session end on
pause, stop or disconnect. Retained metadata cannot keep the Now Bar alive.
Dismissal suppresses the activity until the next playback session or content
change. Settings > Playback diagnostics shows TV timing and system notification
state for hardware troubleshooting.

Allow Playback activities and updates in the app's Settings. On Samsung enable
lock-screen notifications and Media player under Lock screen and AOD > Now bar.
Apple TV requires the separate AirPlay playback-details pairing before it can
supply playback state. The pairing action is also visible on the remote screen.

References:
- [Android system media controls and custom buttons](https://developer.android.com/media/implement/surfaces/mobile)
- [Connected-device foreground services](https://developer.android.com/develop/background-work/services/fgs/service-types#connected-device)
- [Samsung Now Bar settings](https://www.samsung.com/za/support/mobile-devices/how-to-use-the-now-bar-on-the-lock-screen-of-your-samsung-galaxy-device/)
- [Roku ECP metadata and channel icons](https://developer.roku.com/dev/docs/external-control-api)

PlaybackLiveUpdateAndroidTest checks eligibility, dismissal and bitmap decoding.
Its integration test runs the controller/service against a Roku HTTP fixture,
verifies that only the media notification is posted, checks platform duration and
artwork, sends the platform session's rewind/fast-forward custom actions and
Pause, and checks removal on pause, stop and disconnect. Emulator verification
covers the system media card. The user confirmed the preceding APK appears in
Samsung's Now Bar; physical Apple TV and this revision's Samsung rendering still
require hardware verification.
