package id.my.motionlyn.app;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.ContentValues;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.view.WindowManager;
import android.webkit.*;
import android.widget.Toast;

import androidx.webkit.WebViewAssetLoader;

import java.io.OutputStream;

public class MainActivity extends Activity {

    private static final String HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + HOST + "/assets/index.html";
    private static final int REQ_FILE = 101, REQ_PERM = 102;
    /** Folder simpan versi APK: Download/MotionLynApp (versi web: MotionLynWeb) */
    private static final String DIR = "MotionLynApp";

    private WebView web;
    private HyperNative hyper;
    private ValueCallback<Uri[]> fileCallback;
    private PermissionRequest pendingPermission;

    // ---- Dialog izin penyimpanan ----
    private static final int REQ_STORAGE = 103;
    private static final long REMIND_MS = 60_000L; // "Ingatkan nanti" -> muncul lagi tiap 1 menit
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final Runnable remindTask = this::showStoragePrompt;
    private AlertDialog storageDialog;

    // penyimpanan chunk untuk download blob
    private OutputStream saveOut;
    private Uri saveUri;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        web = new WebView(this);
        setContentView(web);

        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .setDomain(HOST)
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setLoadWithOverviewMode(true);
        s.setBuiltInZoomControls(false);
        s.setSupportZoom(false);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);

        hyper = new HyperNative(this);
        web.addJavascriptInterface(new Bridge(), "AndroidBridge");
        web.addJavascriptInterface(new NativeSave(), "MotionLynNative"); // dipakai ML.saveBlob (js/01-core.js) agar nama file MotionLyn... terpakai

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                // Proxy native untuk impor "Link AM" (lihat AmNet.java)
                if (HOST.equals(r.getUrl().getHost()) && AmNet.matches(r.getUrl())) return AmNet.handle(r);
                return loader.shouldInterceptRequest(r.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if (HOST.equals(u.getHost())) return false;
                String sc = u.getScheme();
                if ("http".equals(sc) || "https".equals(sc) || "mailto".equals(sc) || "tel".equals(sc)) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) {}
                }
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = cb;
                try {
                    startActivityForResult(p.createIntent(), REQ_FILE);
                } catch (Exception e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }

            @Override
            public void onPermissionRequest(final PermissionRequest req) {
                runOnUiThread(() -> {
                    boolean needCam = false, needMic = false;
                    for (String r : req.getResources()) {
                        if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r)) needCam = true;
                        if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r)) needMic = true;
                    }
                    boolean haveCam = checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED;
                    boolean haveMic = checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
                    if ((needCam && !haveCam) || (needMic && !haveMic)) {
                        pendingPermission = req;
                        requestPermissions(new String[]{Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO}, REQ_PERM);
                    } else {
                        req.grant(req.getResources());
                    }
                });
            }
        });

        web.setDownloadListener((url, ua, cd, mime, len) -> handleDownload(url, cd, mime));

        if (b == null) web.loadUrl(START_URL); else web.restoreState(b);

        // Saat aplikasi dibuka: minta izin penyimpanan jika belum diberikan
        web.post(this::showStoragePrompt);
    }

    // ---------- Izin penyimpanan ----------
    private String[] storagePerms() {
        if (Build.VERSION.SDK_INT >= 33) {
            return new String[]{
                    Manifest.permission.READ_MEDIA_IMAGES,
                    Manifest.permission.READ_MEDIA_VIDEO,
                    Manifest.permission.READ_MEDIA_AUDIO};
        }
        return new String[]{Manifest.permission.READ_EXTERNAL_STORAGE};
    }

    private boolean hasStorage() {
        for (String p : storagePerms()) {
            if (checkSelfPermission(p) != PackageManager.PERMISSION_GRANTED) return false;
        }
        return true;
    }

    private void showStoragePrompt() {
        ui.removeCallbacks(remindTask);
        if (isFinishing() || isDestroyed() || hasStorage()) return;
        if (storageDialog != null && storageDialog.isShowing()) return;

        storageDialog = new AlertDialog.Builder(this)
                .setTitle("Izinkan akses penyimpanan")
                .setMessage("Izinkan storage supaya proyek kamu tidak hilang.")
                .setCancelable(false)
                .setPositiveButton("Izinkan", null)
                .setNegativeButton("Ingatkan nanti", null)
                .create();
        storageDialog.setOnShowListener(d -> {
            // listener diganti di sini supaya dialog tidak tertutup otomatis;
            // dialog baru hilang kalau izin sudah diberikan
            storageDialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> onAllowStorage());
            storageDialog.getButton(AlertDialog.BUTTON_NEGATIVE).setOnClickListener(v -> {
                storageDialog.dismiss();
                ui.postDelayed(remindTask, REMIND_MS);
            });
        });
        storageDialog.show();
    }

    private void onAllowStorage() {
        SharedPreferences sp = getSharedPreferences("ml_perm", MODE_PRIVATE);
        boolean asked = sp.getBoolean("storage_asked", false);
        boolean rationale = false;
        for (String p : storagePerms()) {
            if (shouldShowRequestPermissionRationale(p)) rationale = true;
        }
        if (asked && !rationale) {
            // Sudah ditolak permanen -> arahkan ke pengaturan aplikasi
            try {
                startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                        Uri.fromParts("package", getPackageName(), null)));
                Toast.makeText(this, "Buka Izin lalu aktifkan Penyimpanan", Toast.LENGTH_LONG).show();
            } catch (Exception ignored) {}
        } else {
            sp.edit().putBoolean("storage_asked", true).apply();
            requestPermissions(storagePerms(), REQ_STORAGE);
        }
    }

    private void closeStoragePromptIfGranted() {
        if (!hasStorage()) return;
        ui.removeCallbacks(remindTask);
        if (storageDialog != null && storageDialog.isShowing()) storageDialog.dismiss();
    }

    // ---------- Download ----------
    private void handleDownload(String url, String cd, String mime) {
        String name = URLUtil.guessFileName(url, cd, mime);
        if (url.startsWith("blob:")) {
            String js = "(async function(){try{var r=await fetch('" + url + "');var bl=await r.blob();"
                    + "AndroidBridge.begin(" + q(name) + "," + q(mime == null ? "application/octet-stream" : mime) + ");"
                    + "var C=786432,o=0;while(o<bl.size){var buf=await bl.slice(o,o+C).arrayBuffer();"
                    + "var u=new Uint8Array(buf),st='';for(var i=0;i<u.length;i+=8192){st+=String.fromCharCode.apply(null,u.subarray(i,i+8192));}"
                    + "AndroidBridge.chunk(btoa(st));o+=C;}AndroidBridge.end();}catch(e){AndroidBridge.fail(String(e));}})();";
            web.evaluateJavascript(js, null);
        } else if (url.startsWith("data:")) {
            try {
                int c = url.indexOf(',');
                String head = url.substring(0, c);
                String data = url.substring(c + 1);
                byte[] bytes = head.contains(";base64") ? Base64.decode(data, Base64.DEFAULT) : Uri.decode(data).getBytes("UTF-8");
                begin(name, mime);
                saveOut.write(bytes);
                end();
            } catch (Exception e) { fail(e.toString()); }
        } else {
            try {
                DownloadManager.Request r = new DownloadManager.Request(Uri.parse(url));
                r.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                r.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, DIR + "/" + name);
                ((DownloadManager) getSystemService(DOWNLOAD_SERVICE)).enqueue(r);
                toast("Mengunduh " + name);
            } catch (Exception e) { fail(e.toString()); }
        }
    }

    private static String q(String s) {
        return "'" + (s == null ? "" : s.replace("\\", "\\\\").replace("'", "\\'").replace("\n", " ")) + "'";
    }

    private void begin(String name, String mime) {
        try {
            ContentValues v = new ContentValues();
            v.put(MediaStore.Downloads.DISPLAY_NAME, name);
            if (mime != null && !mime.isEmpty()) v.put(MediaStore.Downloads.MIME_TYPE, mime);
            v.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/" + DIR);
            saveUri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
            saveOut = getContentResolver().openOutputStream(saveUri);
            lastName = name;
        } catch (Exception e) { fail(e.toString()); }
    }

    private String lastName = "";

    private void end() {
        try { if (saveOut != null) saveOut.close(); } catch (Exception ignored) {}
        saveOut = null;
        toast("Tersimpan di Download/" + DIR + ": " + lastName);
    }

    private void fail(String m) {
        try { if (saveOut != null) saveOut.close(); } catch (Exception ignored) {}
        saveOut = null;
        toast("Gagal menyimpan: " + m);
    }

    private void toast(String m) {
        runOnUiThread(() -> Toast.makeText(this, m, Toast.LENGTH_LONG).show());
    }

    private class Bridge {
        @JavascriptInterface public void begin(String name, String mime) { MainActivity.this.begin(name, mime); }
        @JavascriptInterface public void chunk(String b64) {
            try { if (saveOut != null) saveOut.write(Base64.decode(b64, Base64.DEFAULT)); } catch (Exception e) { fail(e.toString()); }
        }
        @JavascriptInterface public void end() { MainActivity.this.end(); }
        @JavascriptInterface public void exitApp() { runOnUiThread(() -> finish()); }
        @JavascriptInterface public void hyperOn(boolean v) { hyper.on(); }
        @JavascriptInterface public void hyperOff(boolean v) { hyper.off(); }
        @JavascriptInterface public void fail(String m) { MainActivity.this.fail(m); }
    }

    /** Jembatan simpan file untuk ML.saveBlob: nama file dari JS dipakai apa adanya (MotionLynV-..., MotionLynML-..., dst). */
    private class NativeSave {
        @JavascriptInterface public String saveBegin(String name, String mime) {
            try {
                if (saveOut != null) { try { saveOut.close(); } catch (Exception ignored) {} saveOut = null; }
                ContentValues v = new ContentValues();
                v.put(MediaStore.Downloads.DISPLAY_NAME, name);
                if (mime != null && !mime.isEmpty()) v.put(MediaStore.Downloads.MIME_TYPE, mime);
                v.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/" + DIR);
                saveUri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                if (saveUri == null) return "error: tidak bisa membuat file";
                saveOut = getContentResolver().openOutputStream(saveUri);
                lastName = name;
                return "ok";
            } catch (Exception e) { return "error: " + e; }
        }
        /** Buka browser dalam aplikasi (BrowserActivity). Hanya http/https; selain itu dibuka ke beranda. */
        @JavascriptInterface public void openBrowser(String url) {
            final String u = (url != null && (url.startsWith("https://") || url.startsWith("http://"))) ? url : BrowserActivity.HOME;
            runOnUiThread(() -> {
                try {
                    startActivity(new Intent(MainActivity.this, BrowserActivity.class).putExtra(BrowserActivity.EXTRA_URL, u));
                } catch (Throwable e) {
                    // Cadangan: buka di browser sistem agar aplikasi tidak tertutup
                    Toast.makeText(MainActivity.this, "Browser internal gagal: " + e, Toast.LENGTH_LONG).show();
                    try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(u))); } catch (Throwable ignored) {}
                }
            });
        }
        @JavascriptInterface public boolean saveChunk(String b64) {
            try { if (saveOut == null) return false; saveOut.write(Base64.decode(b64, Base64.DEFAULT)); return true; }
            catch (Exception e) { return false; }
        }
        @JavascriptInterface public String saveEnd() {
            try { if (saveOut != null) saveOut.close(); } catch (Exception e) { saveOut = null; return "error: " + e; }
            saveOut = null;
            toast("Tersimpan di Download/" + DIR + ": " + lastName);
            return "Download/" + DIR;
        }
        @JavascriptInterface public void saveAbort() {
            try { if (saveOut != null) saveOut.close(); } catch (Exception ignored) {}
            saveOut = null;
            try { if (saveUri != null) getContentResolver().delete(saveUri, null, null); } catch (Exception ignored) {}
            saveUri = null;
        }
    }

    // ---------- Result & lifecycle ----------
    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        if (req == REQ_FILE && fileCallback != null) {
            fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(res, data));
            fileCallback = null;
        } else super.onActivityResult(req, res, data);
    }

    @Override
    public void onRequestPermissionsResult(int req, String[] p, int[] r) {
        if (req == REQ_STORAGE) {
            closeStoragePromptIfGranted();
        } else if (req == REQ_PERM && pendingPermission != null) {
            pendingPermission.grant(pendingPermission.getResources());
            pendingPermission = null;
        }
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("(function(){try{return window.__mlBack?window.__mlBack():false}catch(e){return false}})()",
                v -> { if (!"true".equals(v)) finish(); });
    }

    @Override protected void onSaveInstanceState(Bundle o) { super.onSaveInstanceState(o); web.saveState(o); }
    @Override protected void onPause() { super.onPause(); web.onPause(); }
    @Override protected void onResume() { super.onResume(); web.onResume(); closeStoragePromptIfGranted(); }
    @Override protected void onDestroy() {
        ui.removeCallbacksAndMessages(null);
        if (storageDialog != null && storageDialog.isShowing()) storageDialog.dismiss();
        hyper.off(); web.destroy(); super.onDestroy();
    }
}
