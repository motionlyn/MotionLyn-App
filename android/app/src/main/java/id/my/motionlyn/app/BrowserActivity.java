package id.my.motionlyn.app;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.webkit.CookieManager;
import android.webkit.URLUtil;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

/**
 * Browser dalam aplikasi (WebView terpisah). Sengaja TIDAK memasang jembatan JavaScript apa pun
 * (AndroidBridge/MotionLynNative), supaya situs luar tidak bisa mengakses fungsi internal aplikasi.
 * Dibuka dari tombol browser di layar utama lewat MotionLynNative.openBrowser(url).
 */
public class BrowserActivity extends Activity {
    static final String EXTRA_URL = "url";
    static final String HOME = "https://www.google.com";

    private WebView web;
    private EditText addr;
    private ProgressBar bar;
    private TextView btnBack, btnFwd;

    private int dp(int v) { return Math.round(v * getResources().getDisplayMetrics().density); }

    private TextView btn(String label, View.OnClickListener l) {
        TextView t = new TextView(this);
        t.setText(label);
        t.setTextColor(Color.WHITE);
        t.setTextSize(22);
        t.setGravity(Gravity.CENTER);
        t.setOnClickListener(l);
        t.setLayoutParams(new LinearLayout.LayoutParams(dp(42), dp(48)));
        return t;
    }

    /** Teks alamat -> URL. Tanpa spasi & ada titik = alamat situs; selain itu = pencarian Google. */
    static String normalize(String in) {
        String s = in == null ? "" : in.trim();
        if (s.isEmpty()) return HOME;
        String low = s.toLowerCase();
        if (low.startsWith("http://") || low.startsWith("https://")) return s;
        if (!s.contains(" ") && s.contains(".")) return "https://" + s;
        return "https://www.google.com/search?q=" + Uri.encode(s);
    }

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.parseColor("#1d0f26"));
        root.setFitsSystemWindows(true);

        LinearLayout top = new LinearLayout(this);
        top.setOrientation(LinearLayout.HORIZONTAL);
        top.setGravity(Gravity.CENTER_VERTICAL);
        top.setPadding(dp(4), 0, dp(4), 0);

        btnBack = btn("‹", v -> { if (web.canGoBack()) web.goBack(); });
        btnFwd = btn("›", v -> { if (web.canGoForward()) web.goForward(); });
        TextView reload = btn("⟳", v -> web.reload());
        TextView close = btn("✕", v -> finish());

        addr = new EditText(this);
        addr.setSingleLine(true);
        addr.setTextSize(14);
        addr.setTextColor(Color.parseColor("#2a1233"));
        addr.setHint("Cari atau ketik alamat");
        addr.setImeOptions(EditorInfo.IME_ACTION_GO);
        addr.setSelectAllOnFocus(true);
        addr.setPadding(dp(14), 0, dp(14), 0);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.WHITE);
        bg.setCornerRadius(dp(20));
        addr.setBackground(bg);
        addr.setOnEditorActionListener((v, id, ev) -> {
            web.loadUrl(normalize(addr.getText().toString()));
            addr.clearFocus();
            InputMethodManager im = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
            if (im != null) im.hideSoftInputFromWindow(addr.getWindowToken(), 0);
            return true;
        });
        LinearLayout.LayoutParams ap = new LinearLayout.LayoutParams(0, dp(40), 1f);
        ap.setMargins(dp(4), 0, dp(4), 0);
        addr.setLayoutParams(ap);

        top.addView(btnBack); top.addView(btnFwd); top.addView(addr); top.addView(reload); top.addView(close);
        root.addView(top, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(52)));

        bar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        bar.setMax(100);
        root.addView(bar, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(3)));

        web = new WebView(this);
        root.addView(web, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        setContentView(root);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setSupportZoom(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);

        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                String sc = r.getUrl().getScheme();
                if ("http".equals(sc) || "https".equals(sc)) return false;
                if ("mailto".equals(sc) || "tel".equals(sc)) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, r.getUrl())); } catch (Exception ignored) {}
                }
                return true; // skema lain (intent:, market:, dll.) diblokir
            }
            @Override public void onPageStarted(WebView v, String url, Bitmap f) { showUrl(url); nav(); }
            @Override public void onPageFinished(WebView v, String url) { showUrl(url); nav(); }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onProgressChanged(WebView v, int p) {
                bar.setProgress(p);
                bar.setVisibility(p >= 100 ? View.GONE : View.VISIBLE);
            }
        });
        web.setDownloadListener((url, ua, cd, mime, len) -> {
            if (url == null || !(url.startsWith("http://") || url.startsWith("https://"))) {
                Toast.makeText(this, "Jenis unduhan ini tidak didukung di browser", Toast.LENGTH_LONG).show();
                return;
            }
            try {
                String name = URLUtil.guessFileName(url, cd, mime);
                DownloadManager.Request q = new DownloadManager.Request(Uri.parse(url));
                q.setMimeType(mime);
                q.addRequestHeader("User-Agent", ua);
                String ck = CookieManager.getInstance().getCookie(url);
                if (ck != null) q.addRequestHeader("Cookie", ck);
                q.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                q.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
                ((DownloadManager) getSystemService(DOWNLOAD_SERVICE)).enqueue(q);
                Toast.makeText(this, "Mengunduh: " + name, Toast.LENGTH_SHORT).show();
            } catch (Exception e) {
                Toast.makeText(this, "Gagal mengunduh: " + e.getMessage(), Toast.LENGTH_LONG).show();
            }
        });

        String start = getIntent().getStringExtra(EXTRA_URL);
        if (b != null) web.restoreState(b); else web.loadUrl(normalize(start));
        nav();
    }

    private void showUrl(String url) { if (url != null && !addr.hasFocus()) addr.setText(url); }

    private void nav() {
        btnBack.setAlpha(web.canGoBack() ? 1f : .35f);
        btnFwd.setAlpha(web.canGoForward() ? 1f : .35f);
    }

    @Override protected void onSaveInstanceState(Bundle o) { super.onSaveInstanceState(o); web.saveState(o); }
    @Override protected void onPause() { super.onPause(); web.onPause(); }
    @Override protected void onResume() { super.onResume(); web.onResume(); }

    @Override public void onBackPressed() {
        if (web.canGoBack()) web.goBack(); else super.onBackPressed();
    }

    @Override protected void onDestroy() {
        ViewGroup p = (ViewGroup) web.getParent();
        if (p != null) p.removeView(web);
        web.destroy();
        super.onDestroy();
    }
}
