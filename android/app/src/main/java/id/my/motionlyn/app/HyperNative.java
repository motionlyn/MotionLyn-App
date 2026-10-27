package id.my.motionlyn.app;

import android.app.Activity;
import android.content.Context;
import android.os.PowerManager;

/**
 * "Mode Hyper" sisi native. Dipanggil dari JS lewat AndroidBridge.hyperOn(true) / hyperOff(false).
 * Menahan CPU tetap aktif (PARTIAL_WAKE_LOCK) dan meminta SustainedPerformanceMode bila perangkat mendukung.
 * Aman dipanggil berulang; semua kegagalan diabaikan (JS tetap jalan tanpa fitur ini).
 */
final class HyperNative {
    private final Activity act;
    private PowerManager.WakeLock wl;

    HyperNative(Activity a) { act = a; }

    void on() {
        act.runOnUiThread(() -> {
            try {
                PowerManager pm = (PowerManager) act.getSystemService(Context.POWER_SERVICE);
                if (pm == null) return;
                if (pm.isSustainedPerformanceModeSupported()) act.getWindow().setSustainedPerformanceMode(true);
                if (wl == null) {
                    wl = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "MotionLyn:hyper");
                    wl.setReferenceCounted(false);
                }
                wl.acquire(60 * 60 * 1000L); // maks 1 jam per aktivasi (lepas otomatis bila lupa dimatikan)
            } catch (Throwable ignored) { /* abaikan */ }
        });
    }

    void off() {
        act.runOnUiThread(() -> {
            try { if (wl != null && wl.isHeld()) wl.release(); } catch (Throwable ignored) { /* abaikan */ }
            try { act.getWindow().setSustainedPerformanceMode(false); } catch (Throwable ignored) { /* abaikan */ }
        });
    }
}
