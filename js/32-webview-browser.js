'use strict';
/* 32-webview-browser.js — tombol browser (globe) di bar atas layar utama.
   Di APK: membuka BrowserActivity (WebView terpisah) lewat MotionLynNative.openBrowser.
   Di web biasa: membuka tab baru. Tombol dipasang ulang otomatis bila layar utama dirender ulang. */
(function () {
if (!window.ML) return;
const GLOBE = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.6 2.4 3.9 5.4 3.9 9s-1.3 6.6-3.9 9c-2.6-2.4-3.9-5.4-3.9-9S9.4 5.4 12 3z"/></svg>';
const URL0 = 'https://www.google.com';

ML.openBrowser = (url) => {
  const u = url || URL0;
  try {
    if (window.MotionLynNative && window.MotionLynNative.openBrowser) { window.MotionLynNative.openBrowser(u); return; }
  } catch (e) { /* lanjut ke fallback */ }
  window.open(u, '_blank');
};

function inject() {
  const bar = document.querySelector('.home-top');
  if (!bar || bar.querySelector('[data-mlwb]')) return;
  const b = document.createElement('button');
  b.className = 'icon-btn dark';
  b.setAttribute('data-mlwb', '1');
  b.title = 'Browser'; b.setAttribute('aria-label', 'Browser');
  b.innerHTML = GLOBE;
  b.onclick = () => ML.openBrowser();
  const gear = bar.querySelector('[title="Pengaturan"]');
  if (gear) bar.insertBefore(b, gear); else bar.appendChild(b);
}

let t = 0;
const mo = new MutationObserver(() => { if (!t) t = setTimeout(() => { t = 0; inject(); }, 50); });
const start = () => { const app = document.getElementById('app'); if (!app) return; mo.observe(app, { childList: true, subtree: true }); inject(); };
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
