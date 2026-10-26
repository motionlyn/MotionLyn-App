package id.my.motionlyn.app;

import android.net.Uri;
import android.util.Base64;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.HashMap;
import java.util.Map;

/**
 * Proxy jaringan native untuk fitur "Link AM" (impor dari link bagikan Alight Motion).
 * WebView mengirim fetch ke https://appassets.androidplatform.net/amnet/?u=<url>[&m=POST&b=<base64 body>];
 * unduhan dilakukan di sini (tanpa CORS) lalu dialirkan balik ke JS (stream, tidak dimuat penuh ke memori).
 * Hanya host Alight Motion yang diizinkan.
 */
public final class AmNet {
    public static final String PATH = "/amnet/";
    private static final String[] HOSTS = {
            "firebasestorage.googleapis.com",
            "us-central1-alight-creative.cloudfunctions.net",
            "alightcreative.com", "www.alightcreative.com",
            "alight.link", "www.alight.link"
    };

    private AmNet() {}

    public static boolean matches(Uri u) {
        String p = u.getPath();
        return p != null && p.startsWith(PATH);
    }

    private static boolean allowed(URL url) {
        if (!"https".equals(url.getProtocol())) return false;
        String h = url.getHost().toLowerCase();
        for (String a : HOSTS) if (h.equals(a)) return true;
        return false;
    }

    private static WebResourceResponse err(int code, String msg) {
        Map<String, String> h = new HashMap<>();
        h.put("Access-Control-Allow-Origin", "*");
        byte[] b;
        try { b = msg.getBytes("UTF-8"); } catch (Exception e) { b = new byte[0]; }
        return new WebResourceResponse("text/plain", "UTF-8", code, "Error", h, new ByteArrayInputStream(b));
    }

    public static WebResourceResponse handle(WebResourceRequest r) {
        try {
            Uri q = r.getUrl();
            String target = q.getQueryParameter("u");
            if (target == null) return err(400, "u kosong");
            URL url = new URL(target);
            if (!allowed(url)) return err(403, "host tidak diizinkan");

            HttpURLConnection c = (HttpURLConnection) url.openConnection();
            c.setInstanceFollowRedirects(true);
            c.setConnectTimeout(20000);
            c.setReadTimeout(60000);
            c.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 MotionLyn");

            String method = q.getQueryParameter("m");
            String b64 = q.getQueryParameter("b");
            if ("POST".equalsIgnoreCase(method)) {
                c.setRequestMethod("POST");
                c.setDoOutput(true);
                c.setRequestProperty("Content-Type", "application/json");
                byte[] body = b64 == null ? new byte[0] : Base64.decode(b64, Base64.URL_SAFE | Base64.NO_WRAP);
                OutputStream os = c.getOutputStream();
                os.write(body);
                os.flush();
                os.close();
            }

            int code = c.getResponseCode();
            InputStream in = code < 400 ? c.getInputStream() : c.getErrorStream();
            if (in == null) in = new ByteArrayInputStream(new byte[0]);
            if (code < 200 || code > 599 || (code >= 300 && code < 400)) return err(502, "balasan " + code);

            String ct = c.getContentType();
            String mime = "application/octet-stream";
            if (ct != null && !ct.isEmpty()) mime = ct.split(";")[0].trim();
            Map<String, String> h = new HashMap<>();
            h.put("Access-Control-Allow-Origin", "*");
            h.put("Access-Control-Expose-Headers", "Content-Length, X-Final-Url");
            h.put("X-Final-Url", c.getURL().toString());
            long len = c.getContentLengthLong();
            if (len > 0) h.put("Content-Length", String.valueOf(len));
            return new WebResourceResponse(mime, null, code, code < 400 ? "OK" : "Error", h, in);
        } catch (Exception e) {
            return err(502, String.valueOf(e));
        }
    }
}
