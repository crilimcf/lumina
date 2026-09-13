package pt.digibox.lumina;

import android.content.Context;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AudioRoute")
public class AudioRoutePlugin extends Plugin {
    private AudioManager audioManager() {
        return (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
    }

    @PluginMethod
    public void setRoute(PluginCall call) {
        final String route = call.getString("route", "receiver");
        final boolean speaker = "speaker".equals(route);
        final AudioManager manager = audioManager();
        if (manager == null) {
            call.reject("audio_manager_unavailable");
            return;
        }

        try {
            manager.setMode(AudioManager.MODE_IN_COMMUNICATION);
            boolean applied = false;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                if (speaker) {
                    for (AudioDeviceInfo device : manager.getAvailableCommunicationDevices()) {
                        if (device.getType() == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER) {
                            applied = manager.setCommunicationDevice(device);
                            break;
                        }
                    }
                } else {
                    AudioDeviceInfo current = manager.getCommunicationDevice();
                    if (current != null && current.getType() != AudioDeviceInfo.TYPE_BUILTIN_SPEAKER) {
                        applied = true; // Keep Bluetooth/wired/earpiece if already selected.
                    } else {
                        for (AudioDeviceInfo device : manager.getAvailableCommunicationDevices()) {
                            if (device.getType() == AudioDeviceInfo.TYPE_BUILTIN_EARPIECE) {
                                applied = manager.setCommunicationDevice(device);
                                break;
                            }
                        }
                    }
                }
            } else {
                // Legacy Android: MODE_IN_COMMUNICATION + speakerphone=false routes
                // voice calls to the receiver/headset instead of the loudspeaker.
                manager.setSpeakerphoneOn(speaker);
                applied = true;
            }

            JSObject result = new JSObject();
            result.put("route", speaker ? "speaker" : "receiver");
            result.put("applied", applied);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("audio_route_failed", error);
        }
    }

    @PluginMethod
    public void reset(PluginCall call) {
        final AudioManager manager = audioManager();
        if (manager == null) {
            call.resolve();
            return;
        }
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) manager.clearCommunicationDevice();
            else manager.setSpeakerphoneOn(false);
            manager.setMode(AudioManager.MODE_NORMAL);
        } catch (Exception ignored) {}
        call.resolve();
    }
}
