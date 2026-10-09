# VPN regression fixture

This opt-in app has a different Android UID from the remote. It drops all IPv4
traffic and deliberately does not enable `VpnService.Builder.allowBypass`,
matching the restriction in Tailscale's Android VPN builder. Testing from the
VPN owner's own UID gives a false success because that UID can bind sockets to
its underlying network.

The fixture is never a dependency of the shipped remote. Its old target SDK
allows a short-lived background VPN service without a foreground notification;
use it only on a disposable emulator. Grant consent there, never on a personal
device, because it replaces the active VPN.

From the repository root, with the emulator serial substituted:

```sh
node android/network-test-vpn/fixture.cjs
# In another terminal:
cd android
./gradlew :network-test-vpn:assembleDebug :app:assembleDebug :app:assembleDebugAndroidTest -PincludeNetworkTestVpn -PreactNativeArchitectures=x86_64
adb -s emulator-5556 install -r network-test-vpn/build/outputs/apk/debug/network-test-vpn-debug.apk
adb -s emulator-5556 install -r app/build/outputs/apk/debug/app-debug.apk
adb -s emulator-5556 install -r app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
adb -s emulator-5556 shell appops set com.privateremote.networktestvpn ACTIVATE_VPN allow
adb -s emulator-5556 shell am instrument -w -r -e class com.privateremote.appletv.appletv.TvNetworkAndroidTest -e vpnFixtureAddress 10.0.2.2 com.privateremote.appletv.test/androidx.test.runner.AndroidJUnitRunner
```

The test proves that direct LAN binding is denied, the blocked connection ends
after one attempt with recovery advice, and the saved device can connect when
excluded from the VPN while that VPN remains active. It does not prove physical
Apple TV pairing or behavior on Samsung hardware.

For manual app verification, seed `PlaybackFixtureSetup` with
`externalFixtureAddress=10.0.2.2` and your `devServerHost`, load the React Native
bundle, and open the remote with the fixture VPN active. The failure screen must
offer Retry and app-based split tunneling advice. Restart the fixture activity
with `--ez excludeTvRemote true` to exercise the workaround. Stop the fixture
with `adb shell am force-stop com.privateremote.networktestvpn` when finished.
