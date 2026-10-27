'use strict';
window.ML = { VERSION: '0.5.1', LABEL: '0.5.1 beta · build 4.00' };
ML.isApp = !!window.AndroidBridge || location.hostname === 'appassets.androidplatform.net'; // true di APK, false di web
(function () {
const memLS = {};
/* localStorage bisa melempar error (iframe/sandbox); jatuh ke memori bila tak tersedia */
ML.lsGet = k => { try { const v = localStorage.getItem(k); return v === null ? (memLS[k] === undefined ? null : memLS[k]) : v; } catch (e) { return memLS[k] === undefined ? null : memLS[k]; } };
ML.lsSet = (k, v) => { memLS[k] = String(v); try { localStorage.setItem(k, v); } catch (e) { /* abaikan */ } };

/* tampilan editor: 'mobile' (default) atau 'desk' (layout lebar: preview + timeline di kiri, properti di kanan) */
ML.uiMode = () => ML.lsGet('ml.ui') === 'desk' ? 'desk' : 'mobile';
/* Tema: 'light' / 'dark'; kosong = ikut sistem. v3.49: CSS gelap dipicu atribut data-theme pada <html>
   (menggantikan trik mediaText yang tidak andal di semua browser). */
ML.themeNow = () => { const v = ML.lsGet('ml.theme'); return v === 'dark' || v === 'light' ? v : (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); };
ML.densityNow = () => ML.lsGet('ml.density') === 'normal' ? 'normal' : 'compact';
ML.setDensity = d => { ML.lsSet('ml.density', d); ML.applyTheme(); window.dispatchEvent(new Event('resize')); };
ML.applyTheme = () => {
  document.documentElement.setAttribute('data-density', ML.densityNow());
  const t = ML.themeNow(), de = document.documentElement;
  de.setAttribute('data-theme', t); de.style.colorScheme = t;
};
try { const mq = window.matchMedia && matchMedia('(prefers-color-scheme: dark)'), fn = () => { const v = ML.lsGet('ml.theme'); if (v !== 'dark' && v !== 'light') ML.applyTheme(); };
  if (mq) { if (mq.addEventListener) mq.addEventListener('change', fn); else if (mq.addListener) mq.addListener(fn); } } catch (e) { /* abaikan */ }
ML.setTheme = t => { ML.lsSet('ml.theme', t); ML.applyTheme(); document.querySelectorAll('.ed-theme button').forEach(b => b.classList.toggle('on', b.dataset.t === ML.themeNow())); ML.toast(t === 'dark' ? 'Mode Gelap' : 'Mode Cerah', 1500); };
ML.applyUi = () => { if (document.body) document.body.classList.toggle('desk', ML.uiMode() === 'desk'); };
ML.setUi = m => {
  ML.lsSet('ml.ui', m === 'desk' ? 'desk' : 'mobile'); ML.applyUi();
  if (ML.editor && ML.editor.setUi) ML.editor.setUi();
  document.querySelectorAll('.ed-mode button').forEach(b => b.classList.toggle('on', b.dataset.m === ML.uiMode()));
  ML.toast(m === 'desk' ? 'Tampilan Desktop' : 'Tampilan Mobile', 1500);
};
ML.uiSwitch = () => {
  const mk = (m, ic, t) => { const b = ML.h('button', { title: t, 'aria-label': t, html: ML.icon(ic), onclick: () => { if (ML.uiMode() !== m) ML.setUi(m); } }); b.dataset.m = m; if (ML.uiMode() === m) b.className = 'on'; return b; };
  return ML.h('div', { class: 'ed-mode' }, mk('mobile', 'phone', 'Tampilan Mobile'), mk('desk', 'monitor', 'Tampilan Desktop'));
};
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
ML.$ = $; ML.$$ = $$;

ML.h = function (tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const k in (props || {})) {
    const v = props[k];
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k === 'html') e.innerHTML = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(c));
  return e;
};
const h = ML.h;

/* ---------- ikon (garis 24x24) ---------- */
const IC = {
  back: '<path d="M15 5l-7 7 7 7"/>',
  chat: '<path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-9l-5 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/><path d="M8 10h8M8 13h5"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>',
  prev: '<path d="M18 5L8 12l10 7z" fill="currentColor"/><path d="M5 5v14"/>',
  next: '<path d="M6 5l10 7-10 7z" fill="currentColor"/><path d="M19 5v14"/>',
  play: '<path d="M7 4l13 8-13 8z" fill="currentColor"/>',
  pause: '<rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor"/><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor"/>',
  flag: '<path d="M5 21V4"/><path d="M5 4h13l-3 4 3 4H5"/>',
  expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  export: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  more: '<circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/>',
  fx: '<path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/>',
  diamond: '<path d="M12 3l8 9-8 9-8-9z"/>',
  scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  copyAll: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/><path d="M12 14.5h5M14.5 12v5"/>',
  paste: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9z"/><path d="M9 12h6M9 16h4"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.2"/><path d="M11 18.5h2"/>',
  monitor: '<rect x="2.5" y="4" width="19" height="12.5" rx="2"/><path d="M8 20.5h8M12 16.5v4"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  unlock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.6-1.7"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeoff: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><path d="M4 4l16 16"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  volume: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 9a4 4 0 0 1 0 6"/>',
  mute: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l5 6M22 9l-5 6"/>',
  text: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',
  shape: '<rect x="3" y="9" width="12" height="12" rx="2"/><circle cx="16" cy="8" r="5"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M3 18l6-5 4 3 3-3 5 4"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  audio: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
  home: '<path d="M3 11l9-8 9 8M5 10v10h14V10"/>',
  film: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 4v16M16 4v16M3 9h5M3 15h5M16 9h5M16 15h5"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  chevd: '<path d="M6 9l6 6 6-6"/>',
  zoomin: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-5-5M11 8v6M8 11h6"/>',
  zoomout: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-5-5M8 11h6"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  sliders: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  curve: '<path d="M3 20C9 20 8 4 21 4"/>',
  up: '<path d="M6 15l6-6 6 6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  import: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 19h16"/>',
  grid: '<rect x="3" y="3" width="8" height="8"/><rect x="13" y="3" width="8" height="8"/><rect x="3" y="13" width="8" height="8"/><rect x="13" y="13" width="8" height="8"/>',
  adjust: '<circle cx="12" cy="12" r="8"/><path d="M12 4v16" /><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/>',
  trimL: '<path d="M5 4v16"/><path d="M9 8l-4 4 4 4"/><rect x="12" y="7" width="8" height="10" rx="1" stroke-dasharray="2.5 2"/>',
  trimR: '<path d="M19 4v16"/><path d="M15 8l4 4-4 4"/><rect x="4" y="7" width="8" height="10" rx="1" stroke-dasharray="2.5 2"/>',
  fill: '<path d="M5 11l6-6 7 7-6 6z"/><path d="M11 5L9 3"/><path d="M19 15c1 1.5 1.5 2.5 1.5 3.2a1.5 1.5 0 0 1-3 0c0-.7.5-1.7 1.5-3.2z"/>',
  border: '<rect x="4" y="4" width="16" height="16" rx="3"/><rect x="8.5" y="8.5" width="7" height="7" rx="1.5" stroke-dasharray="2 2"/>',
  move: '<path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/>',
  rotate: '<path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v5h-5"/>',
  scale: '<rect x="4" y="12" width="8" height="8" rx="1"/><path d="M12 12L20 4M14 4h6v6"/>',
  skew: '<path d="M8 6h12l-4 12H4z"/>',
  swap: '<path d="M4 8h14M14 4l4 4-4 4"/><path d="M20 16H6M10 12l-4 4 4 4"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-5-5"/>',
  diamondPlus: '<path d="M12 2l9 10-9 10-9-10z"/><path d="M12 8v8M8 12h8"/>',
  curveBox: '<rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="2 2.5"/><path d="M6 18C12 18 12 6 18 6"/>',
  fitIcon: '<rect x="3" y="5" width="18" height="14" rx="1.5"/><rect x="7" y="8" width="10" height="8" rx="1"/>',
  fillIcon: '<rect x="3" y="5" width="18" height="14" rx="1.5"/><rect x="2" y="7" width="20" height="10" rx="1" fill="currentColor" fill-opacity=".35"/>',
  stretchIcon: '<rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M7 12h10M7 12l2.5-2.5M7 12l2.5 2.5M17 12l-2.5-2.5M17 12l-2.5 2.5"/>'
};
ML.icon = (n, cls) => '<svg class="ic ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (IC[n] || '') + '</svg>';

/* ---------- util umum ---------- */
ML.uid = () => Math.random().toString(36).slice(2, 10);
ML.clamp = (v, a, b) => Math.min(b, Math.max(a, v));
ML.pad = (n, w = 2) => String(n).padStart(w, '0');
ML.fmt = (t, fps = 30) => {
  t = Math.max(0, t);
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  const f = Math.min(fps - 1, Math.floor((t % 1) * fps + 1e-6));
  return ML.pad(m) + ':' + ML.pad(s) + ':' + ML.pad(f, fps >= 100 ? 3 : 2);
};
ML.fmtSize = b => b < 1024 ? b + 'b' : b < 1048576 ? (b / 1024).toFixed(1).replace(/\.0$/, '') + 'KB' : b < 1073741824 ? (b / 1048576).toFixed(1) + 'MB' : (b / 1073741824).toFixed(2) + 'GB';
ML.clone = o => JSON.parse(JSON.stringify(o));
ML.ext = n => { const m = /\.([a-z0-9]+)$/i.exec(n || ''); return m ? m[1].toLowerCase() : ''; };

/* ---------- bezier kubik (kurva easing) ---------- */
const bzCache = {};
ML.cubic = function (x1, y1, x2, y2) {
  const key = [x1, y1, x2, y2].join(',');
  if (bzCache[key]) return bzCache[key];
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = t => ((ax * t + bx) * t + cx) * t, Y = t => ((ay * t + by) * t + cy) * t;
  const dX = t => (3 * ax * t + 2 * bx) * t + cx;
  const f = x => {
    if (x <= 0) return 0; if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const e = X(t) - x; if (Math.abs(e) < 1e-5) return Y(t);
      const d = dX(t); if (Math.abs(d) < 1e-6) break;
      t = ML.clamp(t - e / d, 0, 1);
    }
    let lo = 0, hi = 1; t = x;
    for (let i = 0; i < 30; i++) { const v = X(t); if (Math.abs(v - x) < 1e-5) break; if (x > v) lo = t; else hi = t; t = (lo + hi) / 2; }
    return Y(t);
  };
  return (bzCache[key] = f);
};

/* ---------- toast ---------- */
ML.toast = function (msg, ms = 2200) {
  let box = $('#toasts');
  if (!box) { box = h('div', { id: 'toasts' }); document.body.append(box); }
  clearTimeout(ML._toastT); box.replaceChildren();
  const t = h('div', { class: 'toast', text: msg });
  box.append(t);
  ML._toastT = setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 250); }, ms);
};

/* ---------- tombol kembali (Android) ---------- */
ML.backStack = [];
ML.pushBack = f => ML.backStack.push(f);
ML.popBack = f => { const i = ML.backStack.lastIndexOf(f); if (i >= 0) ML.backStack.splice(i, 1); };
ML.confirmTap = (msg, fn) => { const n = Date.now(); if (ML._ct && n - ML._ct < 2000) { ML._ct = 0; fn(); return true; } ML._ct = n; ML.toast(msg, 1800); return true; };
ML.webLeave = () => { ML._leave = true; try { window.close(); } catch (e) { /* abaikan */ } setTimeout(() => { try { history.go(-((ML._hd || 1) + 1)); } catch (e) { /* abaikan */ } }, 60); };
if (!window.AndroidBridge) {
  ML._hd = 0; const push = () => { try { history.pushState({ ml: 1 }, ''); ML._hd++; } catch (e) { /* abaikan */ } };
  push();
  const first = () => { removeEventListener('pointerdown', first, true); removeEventListener('keydown', first, true); push(); };
  addEventListener('pointerdown', first, true); addEventListener('keydown', first, true);
  addEventListener('popstate', () => { if (ML._leave) return; try { history.pushState({ ml: 1 }, ''); } catch (e) { /* abaikan */ } window.__mlBack(); });
  addEventListener('beforeunload', e => { if (ML._leave || !ML.editor) return; e.preventDefault(); e.returnValue = ''; });
}
window.__mlBack = () => {
  const f = ML.backStack[ML.backStack.length - 1];
  if (f) { f(); return true; }
  return ML.onRootBack ? !!ML.onRootBack() : false;
};

/* ---------- sheet / dialog ---------- */
ML.sheet = function (title, build, opts = {}) {
  const back = h('div', { class: 'backdrop' });
  const box = h('div', { class: 'sheet ' + (opts.cls || '') });
  const body = h('div', { class: 'sheet-body' });
  let closed = false;
  const handler = () => { close(); return true; };
  function close() {
    if (closed) return; closed = true;
    ML.popBack(handler);
    back.classList.remove('open');
    setTimeout(() => back.remove(), 180);
    if (opts.onClose) opts.onClose();
  }
  box.append(h('div', { class: 'sheet-head' }, h('span', { class: 'sheet-title', text: title }),
    h('button', { class: 'icon-btn', html: ML.icon('x'), onclick: close })), body);
  back.append(box);
  back.addEventListener('pointerdown', e => { if (e.target === back) close(); });
  $('#overlays').append(back);
  requestAnimationFrame(() => back.classList.add('open'));
  ML.pushBack(handler);
  build(body, close);
  return { body, close, box };
};

ML.dialog = function ({ title, text, input, value, ok = 'OK', cancel = 'Batal', danger }) {
  return new Promise(res => {
    let done = false;
    const fin = v => { if (done) return; done = true; res(v); };
    ML.sheet(title, (body, close) => {
      if (text) body.append(h('p', { class: 'dlg-text', text }));
      let inp;
      if (input) { inp = h('input', { class: 'txt', type: 'text', value: value || '' }); body.append(inp); setTimeout(() => { inp.focus(); inp.select(); }, 250); }
      const okf = () => { fin(inp ? inp.value.trim() : true); close(); };
      if (inp) inp.addEventListener('keydown', e => { if (e.key === 'Enter') okf(); });
      body.append(h('div', { class: 'btn-row' },
        cancel ? h('button', { class: 'btn ghost', text: cancel, onclick: () => { fin(null); close(); } }) : null,
        h('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), text: ok, onclick: okf })));
    }, { cls: 'dlg', onClose: () => fin(null) });
  });
};

/* ---------- pemilih warna (WebView tidak punya input[type=color]) ---------- */
function hex2hsl(hex) {
  let r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let H = 0, S = 0; const L = (mx + mn) / 2;
  if (mx !== mn) {
    const d = mx - mn; S = L > .5 ? d / (2 - mx - mn) : d / (mx + mn);
    H = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; H *= 60;
  }
  return [H, S * 100, L * 100];
}
function hsl2hex(H, S, L) {
  S /= 100; L /= 100;
  const k = n => (n + H / 30) % 12, a = S * Math.min(L, 1 - L);
  const f = n => Math.round(255 * (L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
  return '#' + [f(0), f(8), f(4)].map(v => ML.pad(v.toString(16))).join('');
}
ML.colorPicker = function (init, onChange, title = 'Warna') {
  const SW = ['#ffffff', '#000000', '#ff3b5c', '#ff7a45', '#ffc53d', '#ff8ad0', '#ff3fb0', '#22d3ee',
    '#4f8cff', '#8b5cf6', '#d946ef', '#ff7eb6', '#9ca3af', '#4b5563', '#7c3f00', '#111827'];
  return ML.sheet(title, body => {
    let [H, S, L] = hex2hsl(/^#[0-9a-f]{6}$/i.test(init) ? init : '#ffffff');
    const prev = h('div', { class: 'cp-prev' });
    const hex = h('input', { class: 'txt', type: 'text', maxlength: 7 });
    const mk = (lab, max, get, set, bg) => {
      const r = h('input', { type: 'range', min: 0, max, step: 1, class: 'cp-range' });
      r.style.background = bg ? bg() : '';
      r.addEventListener('input', () => { set(+r.value); apply(); });
      return { r, row: h('div', { class: 'cp-row' }, h('span', { text: lab }), r) };
    };
    const sh = mk('Rona', 360, () => H, v => H = v, () => 'linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)');
    const ss = mk('Jenuh', 100, () => S, v => S = v);
    const sl = mk('Terang', 100, () => L, v => L = v);
    function apply(fromHex) {
      const c = fromHex || hsl2hex(H, S, L);
      prev.style.background = c; if (!fromHex) hex.value = c;
      sh.r.value = H; ss.r.value = S; sl.r.value = L;
      ss.r.style.background = `linear-gradient(90deg,${hsl2hex(H, 0, L)},${hsl2hex(H, 100, L)})`;
      sl.r.style.background = `linear-gradient(90deg,#000,${hsl2hex(H, S, 50)},#fff)`;
      onChange(c);
    }
    hex.addEventListener('input', () => {
      let v = hex.value.trim(); if (v[0] !== '#') v = '#' + v;
      if (/^#[0-9a-f]{6}$/i.test(v)) { [H, S, L] = hex2hsl(v); apply(v); }
    });
    body.append(h('div', { class: 'cp-top' }, prev, hex),
      h('div', { class: 'swatches' }, SW.map(c => h('button', { class: 'sw', style: { background: c }, onclick: () => { [H, S, L] = hex2hsl(c); apply(); } }))),
      sh.row, ss.row, sl.row);
    apply();
  }, { cls: 'cp' });
};

/* ---------- pilih file & simpan file ---------- */
ML.pickFiles = (accept, multiple) => new Promise(res => {
  const i = document.createElement('input');
  i.type = 'file'; if (accept) i.accept = accept; i.multiple = !!multiple; i.style.display = 'none';
  document.body.append(i);
  i.addEventListener('change', () => { res(Array.from(i.files)); i.remove(); });
  i.addEventListener('cancel', () => { res([]); i.remove(); });
  i.click();
});

const readB64 = blob => new Promise((res, rej) => {
  const fr = new FileReader();
  fr.onload = () => res(fr.result.slice(fr.result.indexOf(',') + 1));
  fr.onerror = () => rej(fr.error);
  fr.readAsDataURL(blob);
});
/** Simpan blob ke perangkat. Urutan: jembatan Android (APK) -> kapabilitas "downloads" (halaman web
 *  di-hosting) -> unduhan biasa (browser biasa). Ekstensi .ml diberi akhiran .zip bila lewat "downloads"
 *  karena ekstensi .ml tidak ada di daftar izin; file tetap sama dan bisa diimpor langsung. */
ML.saveBlob = async function (blob, name, mime, onProgress) {
  const N = window.MotionLynNative;
  if (N && N.saveBegin) {
    const r = N.saveBegin(name, mime || 'application/octet-stream');
    if (r !== 'ok') throw new Error(r);
    const CH = 1536 * 1024;
    for (let o = 0; o < blob.size; o += CH) {
      const ok = N.saveChunk(await readB64(blob.slice(o, o + CH)));
      if (!ok) { N.saveAbort(); throw new Error('Gagal menulis file'); }
      if (onProgress) onProgress(Math.min(1, (o + CH) / blob.size));
    }
    const loc = N.saveEnd();
    if (String(loc).startsWith('error')) throw new Error(loc);
    return loc + '/' + name;
  }
  if (ML.saveDir && ML.saveDir.supported) { // web desktop: tulis ke <folder induk>/MotionLynWeb bila pengguna sudah memilih folder
    const loc = await ML.saveDir.write(blob, name);
    if (loc) return loc;
  }
  if (ML.dl) {
    const fname = ML.ext(name) === 'ml' ? name + '.zip' : name;
    try { await ML.dl.save({ filename: fname, data: blob }); return fname; }
    catch (e) {
      if (e && e.code === 'declined') throw new Error('Penyimpanan dibatalkan');
      if (e && e.code === 'too_large') throw new Error('File terlalu besar untuk disimpan');
      if (e && e.code === 'rejected_extension') throw new Error('Format file tidak diizinkan di sini');
      throw new Error((e && e.message) || 'Penyimpanan tidak tersedia');
    }
  }
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  return name;
};
})();

