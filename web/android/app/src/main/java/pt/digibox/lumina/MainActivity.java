package pt.digibox.lumina;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AudioRoutePlugin.class);
        super.onCreate(savedInstanceState);
        bridge.getWebView().getSettings().setMediaPlaybackRequiresUserGesture(false);
    }
}
