package com.privateremote.networktestvpn;
import android.app.Activity;
import android.content.Intent;
import android.net.VpnService;
import android.os.Bundle;
public class StartVpnActivity extends Activity {
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        if (getIntent().getBooleanExtra("stopVpn", false)) {
            startService(new Intent(this, BlackholeVpnService.class).putExtra("stopVpn", true));
            finish();
            return;
        }
        Intent consent = VpnService.prepare(this);
        if (consent != null) startActivityForResult(consent, 1);
        else startTunnel();
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (result == RESULT_OK) startTunnel(); else finish();
    }
    private void startTunnel() {
        startService(new Intent(this, BlackholeVpnService.class)
            .putExtra("allowBypass", getIntent().getBooleanExtra("allowBypass", false))
            .putExtra("excludeTvRemote", getIntent().getBooleanExtra("excludeTvRemote", false)));
        finish();
    }
}
