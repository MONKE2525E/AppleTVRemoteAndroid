package com.privateremote.networktestvpn;
import android.content.Intent;
import android.net.VpnService;
import android.os.ParcelFileDescriptor;
import java.io.IOException;
/** Separate UID so the TV app does not get the VPN owner's socket privileges. */
public class BlackholeVpnService extends VpnService {
    private ParcelFileDescriptor tunnel;
    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        closeTunnel();
        if (intent.getBooleanExtra("stopVpn", false)) { stopSelf(); return START_NOT_STICKY; }
        Builder builder = new Builder().setSession("TV network test")
            .addAddress("100.100.100.1", 32).addRoute("0.0.0.0", 0);
        if (intent.getBooleanExtra("allowBypass", false)) builder.allowBypass();
        if (intent.getBooleanExtra("excludeTvRemote", false)) {
            try { builder.addDisallowedApplication("com.privateremote.appletv"); }
            catch (android.content.pm.PackageManager.NameNotFoundException e) { throw new IllegalStateException(e); }
        }
        tunnel = builder.establish();
        return START_NOT_STICKY;
    }
    private void closeTunnel() {
        if (tunnel != null) try { tunnel.close(); } catch (IOException ignored) { }
        tunnel = null;
    }
    @Override public void onDestroy() { closeTunnel(); super.onDestroy(); }
}
