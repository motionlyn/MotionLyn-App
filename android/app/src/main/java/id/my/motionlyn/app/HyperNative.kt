package id.my.motionlyn.app

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.os.Process
import android.provider.Settings
import android.view.View
import android.view.WindowManager
import android.webkit.WebView

/**
 * Mode Hyper (sisi native) untuk MotionLyn.
 * Dipanggil dari JS lewat AndroidBridge.hyperOn / hyperOff / hyperBattery (lihat MainActivity.Bridge).
 *
 * Yang dikerjakan (semuanya hukum Android biasa, tanpa root, tidak berlebihan):
 *  1. SustainedPerformanceMode  : minta sistem menahan performa CPU/GPU stabil (tidak turun mendadak karena panas ringan).
 *  2. PARTIAL_WAKE_LOCK         : CPU tidak tidur saat render/ekspor (otomatis lepas maksimal 2 jam sebagai pengaman).
 *  3. Refresh rate tertinggi    : pilih mode layar beresolusi sama dengan refresh rate paling tinggi (mis. 90/120 Hz).
 *  4. Prioritas thread UI       : THREAD_PRIORITY_DISPLAY.
 *  5. Prioritas proses renderer WebView : IMPORTANT (tidak dikorbankan saat memori sempit) + pra-raster di luar layar
 *     + layer hardware.
 *  6. Pengecualian optimasi baterai : hanya bila pengguna menyetujui dialog sistem (hyperBattery).
 */
object HyperNative {
    private const val WL_TAG = "MotionLyn:hyper"
    private const val WL_MAX_MS = 2L * 60 * 60 * 1000 // pengaman: maksimal 2 jam

    @Volatile private var active = false
    private var wl: PowerManager.WakeLock? = null

    @JvmStatic fun isActive(): Boolean = active

    @JvmStatic
    fun apply(a: Activity, web: WebView, on: Boolean) {
        a.runOnUiThread { if (on) enable(a, web) else disable(a, web) }
    }

    private fun pm(a: Context) = a.getSystemService(Context.POWER_SERVICE) as PowerManager

    private fun enable(a: Activity, web: WebView) {
        if (active) return
        active = true
        try {
            val p = pm(a)
            // 1. performa stabil
            if (p.isSustainedPerformanceModeSupported) a.window.setSustainedPerformanceMode(true)
            // 2. CPU tidak tidur
            wl = p.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, WL_TAG).apply {
                setReferenceCounted(false)
                acquire(WL_MAX_MS)
            }
        } catch (e: Throwable) { /* perangkat tidak mendukung: lanjut */ }
        // 3. refresh rate tertinggi pada resolusi sekarang
        try {
            @Suppress("DEPRECATION")
            val d = a.windowManager.defaultDisplay
            val cur = d.mode
            val best = d.supportedModes
                .filter { it.physicalWidth == cur.physicalWidth && it.physicalHeight == cur.physicalHeight }
                .maxByOrNull { it.refreshRate }
            if (best != null) {
                val lp = a.window.attributes
                lp.preferredDisplayModeId = best.modeId
                a.window.attributes = lp
            }
        } catch (e: Throwable) { }
        // 4. thread UI
        try { Process.setThreadPriority(Process.THREAD_PRIORITY_DISPLAY) } catch (e: Throwable) { }
        // 5. WebView
        try {
            if (Build.VERSION.SDK_INT >= 26) web.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false)
            web.settings.setOffscreenPreRaster(true)
            web.setLayerType(View.LAYER_TYPE_HARDWARE, null)
            a.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        } catch (e: Throwable) { }
    }

    private fun disable(a: Activity, web: WebView) {
        if (!active) return
        active = false
        try { if (pm(a).isSustainedPerformanceModeSupported) a.window.setSustainedPerformanceMode(false) } catch (e: Throwable) { }
        try { wl?.let { if (it.isHeld) it.release() } } catch (e: Throwable) { }
        wl = null
        try {
            val lp = a.window.attributes
            lp.preferredDisplayModeId = 0 // kembali ke pilihan sistem
            a.window.attributes = lp
        } catch (e: Throwable) { }
        try { Process.setThreadPriority(Process.THREAD_PRIORITY_DEFAULT) } catch (e: Throwable) { }
        try {
            if (Build.VERSION.SDK_INT >= 26) web.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, true)
            web.settings.setOffscreenPreRaster(false)
        } catch (e: Throwable) { }
    }

    /** Minta pengguna mengecualikan app dari optimasi baterai (dialog sistem; tidak otomatis). */
    @JvmStatic
    fun requestBatteryExemption(a: Activity) {
        a.runOnUiThread {
            try {
                if (!pm(a).isIgnoringBatteryOptimizations(a.packageName)) {
                    a.startActivity(
                        Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + a.packageName))
                    )
                }
            } catch (e: Throwable) { }
        }
    }

    /** Dipanggil saat Activity dihancurkan. */
    @JvmStatic
    fun release(a: Activity) {
        try { wl?.let { if (it.isHeld) it.release() } } catch (e: Throwable) { }
        wl = null
        active = false
    }
}
