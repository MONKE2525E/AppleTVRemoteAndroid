# Vendored protocol module

Source: https://github.com/msthind04/AppleTV-Remote (Apache-2.0)
Vendored path: `protocol/` (this directory only — the Compose `app/` and `cli/`
modules were not taken)
Vendored commit: `d72fd6d75d4ba0a9fb140c85136985e8bdf4fcba` (2026-09-13)

## Rule

This directory should stay as close to upstream as reasonably possible so
future upstream fixes/updates can be re-applied by re-copying `src/` wholesale.
Do not add Android/React-Native-specific code here — that belongs in
`android/app/src/main/java/.../appletv/` (the integration layer), which
depends on this module but is never depended on by it.

## Deliberate local adaptations

`src/` has the feedback disconnect callback patch documented below and a
button-release safety patch.
`build.gradle.kts` remains unchanged from upstream. The
`kotlin("jvm")` plugin in `build.gradle.kts` resolves against the Kotlin
Gradle plugin version already on this repo's root `buildscript` classpath
(`android/build.gradle`'s `kotlinVersion` ext, currently 2.2.0) rather than
its own `pluginManagement` block, which is why no local version pin was
needed here despite this repo's `android/` root being a stock React Native
Gradle project rather than upstream's own root project.

Any required change going forward should be a small, separately-committed,
documented diff — not a rewrite — so it's obvious what to re-check when
re-vendoring.

## License

`LICENSE`, `NOTICE`, and `THIRD_PARTY_NOTICES.md` in this directory are
carried over unmodified from upstream, as required by the Apache-2.0 license
(upstream itself derives protocol knowledge from pyatv, MIT-licensed — see
`THIRD_PARTY_NOTICES.md`).

### Playback feedback disconnect notification

`Ap2Session.startFeedback` now notifies `onDisconnect` when the feedback
request fails. Previously the heartbeat silently stopped while the controller
continued to consider the metadata tunnel connected. The integration layer
uses the callback to close the old session and retry with backoff.

## Button-release safety patch

`AppleTvRemote.press` delegates to the small `ButtonPress.kt` helper. It attempts
the HID release in a finally block even when the down acknowledgement fails or
the coroutine is cancelled while holding a key. Release runs outside cancellation
with a 1.5-second timeout, and preserves the original error when release also
fails. `ButtonPressTest` covers cancellation and failed acknowledgements. Retain
this patch when re-vendoring until upstream guarantees the same behavior.

## Companion request cancellation patch

`CompanionClient.exchange` removes its pending waiter in a finally block after
success, send failure, timeout, or cancellation. `withTimeoutOrNull` converts only
the request's own deadline into a protocol timeout, preserving cancellation from
an enclosing caller deadline. A framed transport contract permits deterministic
fake transport tests without opening sockets. Retain this patch when re-vendoring
until upstream covers these cases.
