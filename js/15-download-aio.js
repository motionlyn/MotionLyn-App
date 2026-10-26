'use strict';
/* Download AIO (dongtube.id): tempel link IG/TikTok/YouTube/Spotify/X/Pinterest/FB/Reddit, lalu unduh media (butuh online). */
ML.aio = (() => {
  const h = ML.h, EP = 'https://api.dongtube.id/download/aio', KEYS = ['DONGTUBE_c938813c5a968da9b08776875c02e034', 'DONGTUBE_ee3877641e557ad9d3e662df971913bb', 'DONGTUBE_e6e57acdd3e993b3eb7e051a72b6bce6', 'DONGTUBE_32e00418fc09d299f33b60e53a69c817', 'DONGTUBE_42678c813d2c3219a7d64e90af0149b8'];
  let ki = 0; try { ki = (+(ML.lsGet ? ML.lsGet('ml.aiokey') : localStorage.getItem('ml.aiokey')) || 0) % KEYS.length; } catch (e) { ki = 0; }
  const isU = s => typeof s === 'string' && /^https?:\/\//i.test(s);
  const findD = o => { if (!o || typeof o !== 'object') return null; if (Array.isArray(o.medias)) return o; for (const v of Object.values(o)) { const r = findD(v); if (r) return r; } return null; };
  const extOf = (u, t) => { const m = u.split('?')[0].match(/\.(mp4|webm|mkv|mp3|m4a|aac|wav|ogg|jpe?g|png|webp|gif)$/i); return m ? m[1].toLowerCase() : (t === 'audio' ? 'mp3' : t === 'image' ? 'jpg' : 'mp4'); };
  const dur = s => { s = Math.round(+s); return isFinite(s) && s > 0 ? Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') : ''; };
  async function call(url) {
    const KEY = KEYS[ki], q = EP + '?apikey=' + encodeURIComponent(KEY) + '&url=' + encodeURIComponent(url);
    let r; try { r = await fetch(q); } catch (e) { r = await fetch(q, { headers: { 'X-API-Key': KEY } }); }
    let j; try { j = await r.json(); } catch (e) { throw new Error('Respons API tidak valid (' + r.status + ')'); }
    if (!r.ok || j.success === false || j.status === false) throw new Error((j && (j.message || j.error)) || 'Gagal (' + r.status + ')');
    return j;
  }
  async function save(url, type, btn) {
    const old = btn.textContent; btn.disabled = true; btn.textContent = 'Mengunduh…';
    const name = 'MotionLyn_' + Date.now() + '.' + extOf(url, type);
    try {
      const r = await fetch(url); if (!r.ok) throw new Error('HTTP ' + r.status);
      const blob = await r.blob(); ML.toast('Tersimpan: ' + await ML.saveBlob(blob, name, blob.type || 'application/octet-stream'), 4000);
    } catch (e) { ML.toast('Diunduh lewat browser…', 2500); window.open(url, '_blank'); }
    btn.disabled = false; btn.textContent = old;
  }
  const card = (label, sub, preview, url, type) => {
    const b = h('button', { class: 'btn soft', text: 'Unduh', onclick: () => save(url, type, b) });
    return h('div', { class: 'dl-card' }, preview || '',
      h('div', { style: 'display:flex;align-items:center;gap:10px;margin-top:8px' },
        h('div', { style: 'flex:1;min-width:0' }, h('div', { style: 'font-weight:600;font-size:15px', text: label }), sub ? h('div', { style: 'font-size:12px;opacity:.7', text: sub }) : ''), b));
  };
  function render(d, res) {
    const src = d.source || d.platform || '';
    const head = h('div', { style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:6px' });
    if (src) head.append(h('span', { class: 'dl-tag', text: 'Dari: ' + src }));
    if (dur(d.duration)) head.append(h('span', { style: 'font-size:13px;opacity:.75', text: 'Durasi ' + dur(d.duration) }));
    res.append(head);
    if (d.title) res.append(h('div', { style: 'font-size:12px;opacity:.7;margin-top:6px', text: 'Caption' }), h('p', { class: 'dlg-text', style: 'margin:2px 0 8px;white-space:pre-wrap;word-break:break-word', text: d.title }));
    if (isU(d.thumbnail)) res.append(card('Thumbnail', '', h('img', { src: d.thumbnail, style: 'width:100%;max-height:260px;object-fit:contain;border-radius:12px;background:#000' }), d.thumbnail, 'image'));
    const ms = d.medias.filter(m => m && isU(m.url));
    const nV = ms.filter(m => m.type === 'video').length; let iV = 0, iA = 0, iI = 0;
    for (const m of ms) {
      const t = (m.type || '').toLowerCase(), q = (m.quality || '').toUpperCase();
      if (t === 'audio') res.append(card('Audio' + (++iA > 1 ? ' ' + iA : ''), 'MP3', h('audio', { src: m.url, controls: true, preload: 'none', style: 'width:100%' }), m.url, 'audio'));
      else if (t === 'image') res.append(card('Gambar ' + (++iI), '', h('img', { src: m.url, style: 'width:100%;max-height:260px;object-fit:contain;border-radius:12px' }), m.url, 'image'));
      else { iV++; res.append(card(q === 'HD' ? 'Video HD' : 'Video' + (nV > 1 && !q ? ' ' + iV : ''), q && q !== 'HD' ? q : (q ? '' : 'Kualitas standar'), h('video', { src: m.url, poster: isU(d.thumbnail) ? d.thumbnail : '', controls: true, playsinline: true, preload: 'metadata', style: 'width:100%;max-height:300px;border-radius:12px;background:#000' }), m.url, 'video')); }
    }
    if (!ms.length) throw new Error('Tidak ada media ditemukan');
  }
  function open() {
    ML.sheet('Download AIO', (body) => {
      const inp = h('input', { class: 'ed-name', type: 'url', placeholder: 'Tempel link IG / TikTok / YouTube / dll', style: 'width:100%;color:inherit;border-bottom:1px solid #8a8fa8;margin:6px 0 10px;box-sizing:border-box' });
      const res = h('div', {}), go = h('button', { class: 'btn primary', style: 'flex:1;margin:0', text: 'Ambil Media' });
      const kb = h('button', { class: 'btn soft', title: 'Ganti API key', style: 'width:52px;margin:0;padding:0;font-size:13px;line-height:1.1', onclick: () => { ki = (ki + 1) % KEYS.length; try { ML.lsSet ? ML.lsSet('ml.aiokey', ki) : localStorage.setItem('ml.aiokey', ki); } catch (e) { /* abaikan */ } kb.innerHTML = 'Key<br>' + (ki + 1) + '/' + KEYS.length; ML.toast('API key ' + (ki + 1) + ' dari ' + KEYS.length); } });
      kb.innerHTML = 'Key<br>' + (ki + 1) + '/' + KEYS.length;
      const run = async () => {
        const u = inp.value.trim(); if (!isU(u)) { ML.toast('Masukkan link yang valid'); return; }
        go.disabled = true; go.textContent = 'Memproses…'; res.replaceChildren();
        try { const d = findD(await call(u)); if (!d) throw new Error('Format respons tidak dikenali'); render(d, res); }
        catch (e) { res.replaceChildren(h('p', { class: 'dlg-text', text: 'Gagal: ' + e.message + '. Fitur ini butuh internet.' })); }
        go.disabled = false; go.textContent = 'Ambil Media';
      };
      go.onclick = run; inp.addEventListener('keydown', e => { if (e.key === 'Enter') run(); });
      body.append(inp, h('div', { style: 'display:flex;gap:8px;margin-top:14px' }, go, kb), res);
    });
  }
  return { open, KEYS };
})();

/* AI Chat (dongtube.id /ai/chatgpt): tanya apa saja, butuh online. API key bisa diganti (daftar sama dengan Download AIO). */
ML.aichat = (() => {
  const h = ML.h, EP = 'https://api.dongtube.id/ai/chatgpt', KEYS = ML.aio.KEYS, hist = [];
  let ki = 0; try { ki = (+ML.lsGet('ml.aichatkey') || 0) % KEYS.length; } catch (e) { ki = 0; }
  const pick = j => {
    if (typeof j === 'string') return j;
    for (const k of ['result', 'data', 'response', 'answer', 'message', 'text', 'content', 'reply']) { if (j && j[k] != null) { const r = pick(j[k]); if (r) return r; } }
    if (j && typeof j === 'object') { let best = ''; for (const v of Object.values(j)) { const r = typeof v === 'object' ? pick(v) : (typeof v === 'string' ? v : ''); if (r && r.length > best.length) best = r; } return best; }
    return '';
  };
  async function ask(q) {
    const u = EP + '?apikey=' + encodeURIComponent(KEYS[ki]) + '&q=' + encodeURIComponent(q);
    let r; try { r = await fetch(u); } catch (e) { r = await fetch(u, { headers: { 'X-API-Key': KEYS[ki] } }); }
    let j; try { j = await r.json(); } catch (e) { throw new Error('Respons tidak valid (' + r.status + ')'); }
    if (!r.ok || j.success === false || j.status === false) throw new Error((j && (j.message || j.error)) || 'Gagal (' + r.status + ')');
    const t = pick(j); if (!t) throw new Error('Jawaban kosong'); return t;
  }
  const bub = (t, me) => h('div', { style: 'display:flex;justify-content:' + (me ? 'flex-end' : 'flex-start') + ';margin:6px 0' },
    h('div', { class: 'bub ' + (me ? 'me' : 'ai'), text: t }));
  function open() {
    ML.sheet('AI Chat', body => {
      const list = h('div', { style: 'min-height:120px' });
      hist.forEach(m => list.append(bub(m.t, m.me)));
      if (!hist.length) list.append(h('p', { class: 'dlg-text', text: 'Tanya apa saja, mis. “Cara bikin aplikasi”.' }));
      const inp = h('input', { class: 'ed-name', type: 'text', placeholder: 'Ketik pertanyaan…', style: 'flex:1;color:inherit;border-bottom:1px solid #8a8fa8;box-sizing:border-box' });
      const send = h('button', { class: 'btn primary', style: 'margin:0', text: 'Kirim' });
      const kb = h('button', { class: 'btn soft', title: 'Ganti API key', style: 'width:52px;margin:0;padding:0;font-size:13px;line-height:1.1', onclick: () => { ki = (ki + 1) % KEYS.length; ML.lsSet('ml.aichatkey', ki); lab(); ML.toast('API key ' + (ki + 1) + ' dari ' + KEYS.length); } });
      const lab = () => { kb.innerHTML = 'Key<br>' + (ki + 1) + '/' + KEYS.length; }; lab();
      const run = async () => {
        const q = inp.value.trim(); if (!q) return;
        inp.value = ''; if (!hist.length) list.replaceChildren();
        hist.push({ t: q, me: true }); list.append(bub(q, true));
        const wait = bub('Mengetik…', false); list.append(wait); send.disabled = true;
        try { const a = await ask(q); hist.push({ t: a, me: false }); wait.replaceWith(bub(a, false)); }
        catch (e) { wait.replaceWith(bub('Gagal: ' + e.message + '. Coba ganti API key atau cek internet.', false)); }
        send.disabled = false; inp.focus();
      };
      send.onclick = run; inp.addEventListener('keydown', e => { if (e.key === 'Enter') run(); });
      body.append(list, h('div', { style: 'display:flex;gap:8px;align-items:center;margin-top:12px' }, inp, send, kb));
    });
  }
  return { open };
})();

/* Google Drive: ekspor = simpan .ml lalu buka folder Drive untuk diunggah; impor = tempel link file Drive, diunduh lewat API dongtube.id/download/gdrive. */
ML.gdrive = (() => {
  const h = ML.h, EP = 'https://api.dongtube.id/download/gdrive', KEYS = ML.aio.KEYS, FOLDER = 'https://drive.google.com/drive/folders/1_ua7WHmYBbsIE_AuGRXKlK1COLORHmFB';
  let ki = 0; try { ki = (+ML.lsGet('ml.gdkey') || 0) % KEYS.length; } catch (e) { ki = 0; }
  const isU = s => typeof s === 'string' && /^https?:\/\//i.test(s);
  const dl = o => {
    if (!o || typeof o !== 'object') return '';
    for (const k of ['download', 'downloadUrl', 'download_url', 'url', 'link']) if (isU(o[k])) return o[k];
    for (const v of Object.values(o)) { if (isU(v)) return v; }
    for (const v of Object.values(o)) { const r = dl(v); if (r) return r; }
    return '';
  };
  async function fetchFile(link) {
    const q = EP + '?apikey=' + encodeURIComponent(KEYS[ki]) + '&url=' + encodeURIComponent(link);
    let r; try { r = await fetch(q); } catch (e) { r = await fetch(q, { headers: { 'X-API-Key': KEYS[ki] } }); }
    let j; try { j = await r.json(); } catch (e) { throw new Error('Respons API tidak valid (' + r.status + ')'); }
    if (!r.ok || j.success === false || j.status === false) throw new Error((j && (j.message || j.error)) || 'Gagal (' + r.status + ')');
    const u = dl(j); if (!u) throw new Error('Link unduhan tidak ditemukan di respons');
    const f = await fetch(u); if (!f.ok) throw new Error('File tidak bisa diunduh (' + f.status + ')');
    return f.blob();
  }
  async function exportP(p) {
    ML.toast('Menyiapkan file .ml…', 6000);
    try {
      const blob = await ML.buildML(p), loc = await ML.saveBlob(blob, ML.exportFileName(p, 'ml'), 'application/octet-stream');
      const go = await ML.dialog({ title: 'Simpan ke Google Drive', text: 'File .ml sudah tersimpan: ' + loc + '. Buka folder Drive, tekan + → Upload, pilih file tadi. Lalu bagikan link file itu ke penerima (Impor → Dari Drive).', ok: 'Buka folder Drive', cancel: 'Tutup' });
      if (go) window.open(FOLDER, '_blank');
    } catch (e) { ML.toast('Gagal ekspor: ' + e.message, 4000); }
  }
  function importD() {
    ML.sheet('Impor dari Google Drive', (body, close) => {
      const inp = h('input', { class: 'ed-name', type: 'url', placeholder: 'Tempel link file .ml di Google Drive', style: 'width:100%;color:inherit;border-bottom:1px solid #8a8fa8;margin:6px 0 10px;box-sizing:border-box' });
      const go = h('button', { class: 'btn primary', style: 'flex:1;margin:0', text: 'Impor' });
      const kb = h('button', { class: 'btn soft', title: 'Ganti API key', style: 'width:52px;margin:0;padding:0;font-size:13px;line-height:1.1', onclick: () => { ki = (ki + 1) % KEYS.length; ML.lsSet('ml.gdkey', ki); lab(); ML.toast('API key ' + (ki + 1) + ' dari ' + KEYS.length); } });
      const lab = () => { kb.innerHTML = 'Key<br>' + (ki + 1) + '/' + KEYS.length; }; lab();
      const msg = h('p', { class: 'dlg-text', text: 'Butuh internet. File harus dibagikan "siapa saja yang memiliki link".' });
      go.onclick = async () => {
        const u = inp.value.trim(); if (!isU(u)) { ML.toast('Masukkan link Google Drive'); return; }
        go.disabled = true; go.textContent = 'Mengunduh…';
        try { const id = await ML.importML(await fetchFile(u)); close(); await ML.home.show(); ML.toast('Proyek diimpor'); ML.openEditor(id); }
        catch (e) { msg.textContent = 'Gagal: ' + e.message + '. Coba ganti API key.'; go.disabled = false; go.textContent = 'Impor'; }
      };
      body.append(inp, h('div', { style: 'display:flex;gap:8px' }, go, kb), msg);
    });
  }
  return { export: exportP, import: importD };
})();

/* Easter egg: tap logo ML 3x → tampilkan seluruh kode HTML (hanya baca, bisa disalin). */
(() => {
  let n = 0, tm = 0;
  ML.srcTap = () => { n++; clearTimeout(tm); tm = setTimeout(() => { n = 0; }, 800); if (n >= 3) { n = 0; ML.showSource(); } };
  ML.showSource = async () => {
    const h = ML.h; ML.toast('Memuat kode…', 1500);
    let src = ''; try { const r = await fetch(location.href.split('#')[0]); if (r.ok) src = await r.text(); } catch (e) { /* abaikan */ }
    if (!src || !/<html/i.test(src)) src = '<!DOCTYPE html>\n' + document.documentElement.outerHTML;
    const ta = h('textarea', { readonly: true, spellcheck: false, style: 'flex:1;width:100%;box-sizing:border-box;background:#10081a;color:#ffd6ef;border:0;border-radius:10px;padding:10px;font:12px/1.4 monospace;white-space:pre;overflow:auto;resize:none;-webkit-user-select:text;user-select:text' });
    ta.value = src;
    let ov; const bk = () => { ov.remove(); ML.popBack(bk); return true; }; ML.pushBack(bk);
    const dk = h('button', { class: 'btn soft', style: 'margin:0;padding:8px 14px', text: 'Desktop: ' + (ML.uiMode() === 'desk' ? 'ON' : 'OFF'), onclick: () => { ML.setUi(ML.uiMode() === 'desk' ? 'mobile' : 'desk'); dk.textContent = 'Desktop: ' + (ML.uiMode() === 'desk' ? 'ON' : 'OFF'); } });
    ov = h('div', { style: 'position:fixed;inset:0;z-index:10000;background:#170c1e;color:#e6e8f6;display:flex;flex-direction:column;gap:8px;padding:calc(env(safe-area-inset-top,0px) + 10px) 10px 12px' },
      h('div', { style: 'display:flex;align-items:center;gap:8px' }, h('div', { style: 'flex:1;font-weight:700', text: 'Kode HTML MotionLyn · ' + (src.length / 1024).toFixed(0) + ' KB' }),
        h('button', { class: 'btn soft', style: 'margin:0;padding:8px 14px', text: 'Salin semua', onclick: async () => { try { await navigator.clipboard.writeText(src); ML.toast('Kode disalin'); } catch (e) { ta.focus(); ta.select(); ML.toast('Tekan lama untuk salin'); } } }),
        dk, h('button', { class: 'btn soft', style: 'margin:0;padding:8px 14px', text: 'Tutup', onclick: bk })), ta);
    document.body.append(ov);
  };
})();

/* Foto 3D (experimental): foto datar → relief 3D (kedalaman dari terang/gelap) dirender WebGL, dengan posisi/putar foto dan kamera 3D (X, Y, Z, yaw, pitch, roll, FOV) yang bisa di-keyframe. */
(function () {
const D2R = Math.PI / 180, G_N = 48;
ML.PH3A = [['pho_x', 'Posisi foto X', -5, 5, '', .01], ['pho_y', 'Posisi foto Y', -5, 5, '', .01], ['pho_z', 'Posisi foto Z', -10, 10, '', .01],
  ['pho_rx', 'Putar foto X', -360, 360, '°', 1], ['pho_ry', 'Putar foto Y', -360, 360, '°', 1], ['pho_rz', 'Putar foto Z', -360, 360, '°', 1],
  ['pho_s', 'Skala foto', 10, 400, '%', 1], ['pho_dep', 'Kedalaman relief', 0, 200, '%', 1]];
ML.PH3C = [['cam_x', 'Kamera X (geser kiri/kanan)', -10, 10, '', .01], ['cam_y', 'Kamera Y (geser atas/bawah)', -10, 10, '', .01], ['cam_z', 'Kamera Z (maju/mundur)', 0.3, 30, '', .01],
  ['cam_yaw', 'Sudut kamera Y (menoleh)', -180, 180, '°', 1], ['cam_pitch', 'Sudut kamera X (mendongak)', -90, 90, '°', 1], ['cam_roll', 'Sudut kamera Z (miring)', -180, 180, '°', 1], ['cam_fov', 'Lensa kamera (FOV)', 20, 120, '°', 1]];
ML.ph3Defaults = L => { const D = { pho_x: 0, pho_y: 0, pho_z: 0, pho_rx: 0, pho_ry: 0, pho_rz: 0, pho_s: 100, pho_dep: 35, cam_x: 0, cam_y: 0, cam_z: 3, cam_yaw: 0, cam_pitch: 0, cam_roll: 0, cam_fov: 50 }; for (const k in D) if (!L.p[k]) L.p[k] = ML.A(D[k]); if (L.ph3.mode === undefined) L.ph3.mode = 1; };
ML.ph3FitZ = (ia, asp, fov) => 1.05 * Math.max(1, ia / asp) / Math.tan(fov * D2R / 2);

const mul = (a, b) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; };
const T = (x, y, z) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
const RX = a => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]; };
const RY = a => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]; };
const RZ = a => { const c = Math.cos(a), s = Math.sin(a); return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; };
const SC = (x, y) => [x, 0, 0, 0, 0, y, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const PS = (fov, asp, n, f) => { const k = 1 / Math.tan(fov / 2); return [k / asp, 0, 0, 0, 0, k, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, 2 * f * n / (n - f), 0]; };

let cv, gl, prog, loc, ibuf, nIdx, uvBuf, fail = false; const res = new Map();
function init() {
  if (gl) return gl.isContextLost() ? null : gl; if (fail) return null;
  try {
    cv = document.createElement('canvas'); gl = cv.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: true });
    if (!gl) throw new Error('WebGL tidak tersedia');
    const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, 'attribute vec2 a_uv;attribute float a_d;uniform mat4 u_M;uniform vec2 u_sz;uniform float u_dep;varying vec2 v_uv;void main(){vec3 p=vec3((a_uv.x-.5)*u_sz.x,(.5-a_uv.y)*u_sz.y,(a_d-.5)*u_dep);gl_Position=u_M*vec4(p,1.);v_uv=a_uv;}'));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, 'precision mediump float;uniform sampler2D u_tex;varying vec2 v_uv;void main(){gl_FragColor=texture2D(u_tex,v_uv);}'));
    gl.linkProgram(prog); if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    loc = { uv: gl.getAttribLocation(prog, 'a_uv'), d: gl.getAttribLocation(prog, 'a_d'), M: gl.getUniformLocation(prog, 'u_M'), sz: gl.getUniformLocation(prog, 'u_sz'), dep: gl.getUniformLocation(prog, 'u_dep'), tex: gl.getUniformLocation(prog, 'u_tex') };
    const V = G_N + 1, uv = new Float32Array(V * V * 2), idx = new Uint16Array(G_N * G_N * 6);
    for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) { uv[(j * V + i) * 2] = i / G_N; uv[(j * V + i) * 2 + 1] = j / G_N; }
    let n = 0; for (let j = 0; j < G_N; j++) for (let i = 0; i < G_N; i++) { const a = j * V + i, b = a + 1, c = a + V, d = c + 1; idx[n++] = a; idx[n++] = b; idx[n++] = d; idx[n++] = a; idx[n++] = d; idx[n++] = c; }
    uvBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf); gl.bufferData(gl.ARRAY_BUFFER, uv, gl.STATIC_DRAW);
    ibuf = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibuf); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW); nIdx = idx.length;
    return gl;
  } catch (e) { fail = true; console.warn('Foto 3D:', e); return null; }
}
function depthArr(img, mode) {
  const V = G_N + 1, out = new Float32Array(V * V); if (!mode) return out;
  const c = document.createElement('canvas'); c.width = c.height = 96; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, 96, 96);
  let px; try { px = x.getImageData(0, 0, 96, 96).data; } catch (e) { return out; }
  let mn = 1, mx = 0;
  for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) { const sx = Math.min(95, Math.round(i / G_N * 95)), sy = Math.min(95, Math.round(j / G_N * 95)), o = (sy * 96 + sx) * 4, l = (px[o] * .299 + px[o + 1] * .587 + px[o + 2] * .114) / 255; out[j * V + i] = l; }
  for (let p = 0; p < 2; p++) { const t = out.slice(); for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) { let s = 0, n = 0; for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const jj = j + dj, ii = i + di; if (jj >= 0 && jj < V && ii >= 0 && ii < V) { s += t[jj * V + ii]; n++; } } out[j * V + i] = s / n; } }
  for (const v of out) { if (v < mn) mn = v; if (v > mx) mx = v; }
  const r = mx - mn || 1; for (let k = 0; k < out.length; k++) { const v = (out[k] - mn) / r; out[k] = mode === 2 ? 1 - v : v; }
  return out;
}
function resOf(L, img) {
  let r = res.get(L.mediaId);
  if (!r) {
    const iw = img.naturalWidth || img.videoWidth || img.width, ih = img.naturalHeight || img.videoHeight || img.height, k = Math.min(1, 2048 / Math.max(iw, ih));
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(iw * k)); c.height = Math.max(1, Math.round(ih * k)); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    r = { tex, ia: iw / ih, dbuf: gl.createBuffer(), mode: -1, src: c }; res.set(L.mediaId, r);
  }
  const m = (L.ph3 && L.ph3.mode) | 0;
  if (r.mode !== m) { r.mode = m; gl.bindBuffer(gl.ARRAY_BUFFER, r.dbuf); gl.bufferData(gl.ARRAY_BUFFER, depthArr(r.src, m), gl.STATIC_DRAW); }
  return r;
}
ML.photo3dCanvas = (L, lt) => {
  if (!init()) return null; const img = ML.media.image(L); if (!img) return null;
  if (!(img.naturalWidth || img.videoWidth || img.width)) return null;
  ML.ph3Defaults(L); const r = resOf(L, img), v = k => ML.evalAnim(L.p[k], lt);
  const k = Math.min(1, 2048 / Math.max(L.bw, L.bh)), cw = Math.max(2, Math.round(L.bw * k)), ch = Math.max(2, Math.round(L.bh * k));
  if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
  gl.viewport(0, 0, cw, ch); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND);
  const sc = v('pho_s') / 100, Pm = PS(v('cam_fov') * D2R, L.bw / L.bh, .05, 200);
  const V = mul(RZ(-v('cam_roll') * D2R), mul(RX(-v('cam_pitch') * D2R), mul(RY(-v('cam_yaw') * D2R), T(-v('cam_x'), -v('cam_y'), -v('cam_z')))));
  const M = mul(T(v('pho_x'), v('pho_y'), v('pho_z')), mul(RZ(v('pho_rz') * D2R), mul(RY(v('pho_ry') * D2R), mul(RX(v('pho_rx') * D2R), SC(sc, sc)))));
  gl.useProgram(prog); gl.uniformMatrix4fv(loc.M, false, new Float32Array(mul(Pm, mul(V, M)))); gl.uniform2f(loc.sz, 2 * r.ia, 2); gl.uniform1f(loc.dep, v('pho_dep') / 100);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, r.tex); gl.uniform1i(loc.tex, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf); gl.enableVertexAttribArray(loc.uv); gl.vertexAttribPointer(loc.uv, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, r.dbuf); gl.enableVertexAttribArray(loc.d); gl.vertexAttribPointer(loc.d, 1, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibuf); gl.drawElements(gl.TRIANGLES, nIdx, gl.UNSIGNED_SHORT, 0);
  return cv;
};
})();

/* 3D Tracking: lacak 1–2 titik pada layer video (template matching per frame, sub-piksel), lalu tulis keyframe posisi (+ putar & Z/kedalaman bila 2 titik) ke layer target atau Null object baru. */
ML.track3d = (E, L) => {
  const h = ML.h, proj = E.proj, P = E.P, v = ML.media.el(L);
  if (!v) { ML.toast('Video belum siap'); return; }
  const lt0 = ML.clamp(P.t, L.start, L.start + L.dur - 0.05), vt = t => L.trimIn + (t - L.start);
  const seek = (tt) => new Promise(res => { let d = false; const fin = () => { if (d) return; d = true; v.removeEventListener('seeked', fin); clearTimeout(to); res(); }; const to = setTimeout(fin, 2500); v.addEventListener('seeked', fin); if (Math.abs(v.currentTime - tt) < 1e-3) fin(); else v.currentTime = tt; });
  const pts = []; let target = '', mode = 'full', running = false, cancelled = false;
  ML.sheet('3D Tracking', (body, close) => {
    P.pause();
    const cv = h('canvas', { style: 'width:100%;height:auto;border-radius:12px;background:#000;touch-action:none' }), cx = cv.getContext('2d');
    const info = h('p', { class: 'dlg-text', text: 'Ketuk objek yang mau dilacak (titik A). Ketuk lagi untuk titik B (opsional): dengan 2 titik, putaran dan jarak/kedalaman (Z) ikut dilacak.' });
    const draw = () => { cx.drawImage(v, 0, 0, cv.width, cv.height); pts.forEach((p, i) => { cx.lineWidth = 3; cx.strokeStyle = i ? '#4f8cff' : '#ff3b5c'; cx.beginPath(); cx.arc(p[0] * cv.width, p[1] * cv.height, 14, 0, 7); cx.stroke(); cx.fillStyle = cx.strokeStyle; cx.font = 'bold 16px sans-serif'; cx.fillText(i ? 'B' : 'A', p[0] * cv.width + 18, p[1] * cv.height - 12); }); };
    seek(vt(lt0)).then(() => { cv.width = 640; cv.height = Math.max(2, Math.round(640 * (v.videoHeight || 360) / (v.videoWidth || 640))); draw(); });
    cv.addEventListener('pointerdown', e => { if (running) return; const r = cv.getBoundingClientRect(), p = [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; if (pts.length >= 2) pts.length = 0; pts.push(p); draw(); upd(); });
    const chips = (opts, get, set) => { const box = h('div', { class: 'chips' }); const dr = () => box.replaceChildren(...opts.map(([k, l]) => h('button', { class: 'chip' + (get() === k ? ' on' : ''), text: l, onclick: () => { set(k); dr(); } }))); dr(); return box; };
    const others = proj.layers.filter(x => x.id !== L.id && x.type !== 'audio');
    const tBox = chips([['', 'Null object baru']].concat(others.map(x => [x.id, x.name])), () => target, k => { target = k; });
    const mBox = chips([['full', 'Posisi + putar + Z'], ['pos', 'Posisi saja']], () => mode, k => { mode = k; });
    const fill = h('i'), prog = h('div', { class: 'prog', style: 'display:none' }, fill), txt = h('p', { class: 'dlg-text', text: '' });
    const go = h('button', { class: 'btn primary wide', text: 'Mulai lacak' }), rs = h('button', { class: 'btn soft', style: 'margin-top:8px', text: 'Reset titik', onclick: () => { if (!running) { pts.length = 0; draw(); upd(); } } });
    const upd = () => { txt.textContent = pts.length ? 'Titik: ' + (pts.length === 1 ? 'A' : 'A + B') + '. Dilacak dari ' + lt0.toFixed(2) + ' dtk sampai akhir layer.' : ''; };
    go.onclick = async () => {
      if (running) { cancelled = true; return; } if (!pts.length) { ML.toast('Ketuk dulu titik pada gambar'); return; }
      running = true; cancelled = false; go.textContent = 'Batal'; prog.style.display = '';
      try {
        const res = await run(pts.map(p => p.slice()), (f, s) => { fill.style.width = (f * 100).toFixed(1) + '%'; txt.textContent = s; }, () => cancelled || !document.body.contains(cv));
        if (!res) { ML.toast('Pelacakan dibatalkan'); } else { apply(res); close(); }
      } catch (e) { ML.toast('Gagal melacak: ' + e.message, 4000); }
      running = false; go.textContent = 'Mulai lacak';
      try { await seek(vt(P.t)); P.seek(P.t); } catch (e) { /* abaikan */ }
    };
    body.append(info, cv, rs, h('div', { class: 'psec', text: 'Terapkan ke' }), tBox, h('div', { class: 'psec', text: 'Hasil' }), mBox, prog, txt, go);
  });

  async function run(P0, prog, stop) {
    const dt = Math.max(1 / proj.fps, 1 / 15), tEnd = L.start + L.dur - 0.02, W = 480, vw = v.videoWidth || 640, vh = v.videoHeight || 360, H = Math.max(8, Math.round(W * vh / vw));
    const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d', { willReadFrequently: true });
    const cap = async tt => { await seek(vt(tt)); x.drawImage(v, 0, 0, W, H); const d = x.getImageData(0, 0, W, H).data, g = new Uint8Array(W * H); for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = (d[j] * 77 + d[j + 1] * 151 + d[j + 2] * 28) >> 8; return g; };
    const R = 22, PH = 9, PW = 2 * PH + 1, patch = (g, px, py) => { const o = new Uint8Array(PW * PW); for (let j = 0; j < PW; j++) for (let i = 0; i < PW; i++) o[j * PW + i] = g[(py - PH + j) * W + (px - PH + i)]; return o; };
    const clampP = (px, py) => [Math.min(W - PH - 2, Math.max(PH + 1, px)), Math.min(H - PH - 2, Math.max(PH + 1, py))];
    function match(g, tpl, cx0, cy0) {
      let best = 1e12, bx = cx0, by = cy0; const sad = {};
      for (let dy = -R; dy <= R; dy++) { const py = cy0 + dy; if (py < PH + 1 || py > H - PH - 2) continue;
        for (let dx = -R; dx <= R; dx++) { const px = cx0 + dx; if (px < PH + 1 || px > W - PH - 2) continue;
          let s = 0; for (let j = 0; j < PW && s < best * 1.3 + 50; j++) { const o = (py - PH + j) * W + px - PH, t = j * PW; for (let i = 0; i < PW; i++) s += Math.abs(g[o + i] - tpl[t + i]); }
          sad[dy * 100 + dx] = s; if (s < best) { best = s; bx = px; by = py; } } }
      const gs = (dx, dy) => sad[(by - cy0 + dy) * 100 + (bx - cx0 + dx)], s0 = best; let fx = bx, fy = by;
      const l = gs(-1, 0), r = gs(1, 0), u = gs(0, -1), dn = gs(0, 1);
      if (l !== undefined && r !== undefined) { const dd = l - 2 * s0 + r; if (dd > 0) fx += Math.max(-.5, Math.min(.5, (l - r) / (2 * dd))); }
      if (u !== undefined && dn !== undefined) { const dd = u - 2 * s0 + dn; if (dd > 0) fy += Math.max(-.5, Math.min(.5, (u - dn) / (2 * dd))); }
      return { x: fx, y: fy, bx, by, err: best / (PW * PW) };
    }
    let g = await cap(lt0); const T = [], n = P0.length;
    const st = P0.map(p => { const [px, py] = clampP(Math.round(p[0] * W), Math.round(p[1] * H)); return { x: px, y: py, t0: patch(g, px, py), tp: patch(g, px, py) }; });
    const times = [lt0], out = [st.map(s => [s.x / W, s.y / H])]; const total = Math.max(1, Math.ceil((tEnd - lt0) / dt));
    for (let i = 1; i <= total; i++) {
      if (stop()) return null; const tt = Math.min(tEnd, lt0 + i * dt); if (tt <= times[times.length - 1] + 1e-4) break;
      g = await cap(tt); const row = [];
      for (const s of st) {
        const [cx0, cy0] = clampP(Math.round(s.x), Math.round(s.y)); let r = match(g, s.t0, cx0, cy0);
        if (r.err > 20) { const r2 = match(g, s.tp, cx0, cy0); if (r2.err < r.err) r = r2; }
        s.x = r.x; s.y = r.y; const [qx, qy] = clampP(r.bx, r.by); s.tp = patch(g, qx, qy); if (r.err > 20) s.t0 = s.tp; row.push([s.x / W, s.y / H]);
      }
      times.push(tt); out.push(row); prog(i / total, 'Melacak ' + i + '/' + total + ' frame…');
    }
    return { times, out, n };
  }

  function apply(res) {
    const { times, out, n } = res, g0 = t => ML.geom(L, t), Wp = proj.w, Hp = proj.h, f = Wp;
    const toP = (t, p) => { const g = g0(t), lx = (p[0] - .5) * L.bw * g.sx, ly = (p[1] - .5) * L.bh * g.sy, c = Math.cos(g.rot), s = Math.sin(g.rot); return [g.x + lx * c - ly * s, g.y + lx * s + ly * c]; };
    const sm = arr => arr.map((p, i) => i && i < arr.length - 1 ? [(arr[i - 1][0] + 2 * p[0] + arr[i + 1][0]) / 4, (arr[i - 1][1] + 2 * p[1] + arr[i + 1][1]) / 4] : p);
    const A = sm(times.map((t, i) => toP(t, out[i][0]))), B = n > 1 ? sm(times.map((t, i) => toP(t, out[i][1]))) : null;
    E.cp();
    let T = target && proj.layers.find(q => q.id === target);
    if (!T) { T = ML.makeLayer(proj, 'shape', { name: 'Track ' + L.name, start: Math.max(0, lt0), dur: Math.max(0.1, L.start + L.dur - Math.max(0, lt0)), bw: 120, bh: 120 }); T.k3 = 'null'; T.shape.noFill = true; T.shape.strokeW = 0; ML.ensureLayer(T); T.p.x = ML.A(A[0][0]); T.p.y = ML.A(A[0][1]); proj.layers.push(T); }
    const t0 = times[0], ev = k => ML.evalAnim(T.p[k], Math.max(0, t0 - T.start)), x0 = T.k3 && !target ? A[0][0] : ev('x'), y0 = T.k3 && !target ? A[0][1] : ev('y'), rot0 = ev('rot'), z0 = T.p.z ? ev('z') : 0;
    const full = B && mode === 'full', d0 = full ? Math.hypot(B[0][0] - A[0][0], B[0][1] - A[0][1]) : 0, a0 = full ? Math.atan2(B[0][1] - A[0][1], B[0][0] - A[0][0]) : 0, comp = full && !T.k3 && d0 > 1;
    const keys = { x: [], y: [] }; if (full && d0 > 1) { keys.rot = []; keys.z = []; }
    times.forEach((t, i) => {
      const lt = t - T.start; if (lt < -1e-6) return; const sx = x0 + A[i][0] - A[0][0], sy = y0 + A[i][1] - A[0][1]; let px = sx, py = sy;
      if (keys.rot) {
        const d = Math.hypot(B[i][0] - A[i][0], B[i][1] - A[i][1]), r = ML.clamp(d / d0, .05, 20), ang = Math.atan2(B[i][1] - A[i][1], B[i][0] - A[i][0]) - a0;
        const z = (f + z0) / r - f; keys.rot.push([lt, rot0 + ang * 180 / Math.PI]); keys.z.push([lt, z]);
        if (comp) { const k = f / (f + z); px = Wp / 2 + (sx - Wp / 2) / k; py = Hp / 2 + (sy - Hp / 2) / k; }
      }
      keys.x.push([lt, px]); keys.y.push([lt, py]);
    });
    for (const k in keys) { if (!T.p[k]) T.p[k] = ML.A(0); T.p[k].k = []; keys[k].forEach(([lt, val]) => ML.addKey(T.p[k], lt, val)); if (keys[k].length) T.p[k].v = keys[k][0][1]; }
    if (E.renderBar) E.renderBar(); if (E.buildLanes) E.buildLanes(); E.changed(true);
    ML.toast('Tracking selesai: ' + times.length + ' titik keyframe' + (target ? ' ke ' + T.name : ' → Null "' + T.name + '". Sambungkan layer lain ke Null ini (Move & Transform → 3D)'), 4500);
  }
};

/* Berbagi proyek via link/kode (online): file .ml diunggah ke penyimpanan halaman, kode disimpan di db bersama. Maks 6 MB. */
ML.share = (() => {
  const MAX = 6 * 1048576, ART = 'https://claude.ai/artifact/JS8pY6pDiVW5kYtyENB9hk', mb = n => (n / 1048576).toFixed(1);
  const caps = async () => { try { const c = window.claude; if (!c || !c.use) return null; const [A, D] = await Promise.all([c.use('assets'), c.use('db')]); return D ? { A, D } : null; } catch (e) { return null; } };
  const rnd = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), b => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('');
  const NEED = 'Butuh internet, versi online MotionLyn (claude.ai), dan login';
  async function send(p) {
    const c = await caps(); if (!c) throw new Error(NEED);
    if (!c.A) throw new Error('Akun ini belum boleh mengunggah (butuh akses Contributor ke halaman MotionLyn)');
    const blob = await ML.buildML(p); if (blob.size > MAX) throw new Error('Proyek ' + mb(blob.size) + ' MB, melebihi batas 6 MB');
    const up = await c.A.upload(new Blob([ML.glbB64(await blob.arrayBuffer())], { type: 'text/plain' })), k = rnd();
    await c.D.doc('shares/' + k).set({ aid: up.id, name: p.name, size: blob.size, at: Date.now() });
    return k;
  }
  async function recv(input) {
    const c = await caps(); if (!c) throw new Error(NEED);
    const mm = String(input).match(/share=([A-Z0-9]{8})/i) || String(input).match(/\b([A-Z0-9]{8})\b/i); if (!mm) throw new Error('Kode tidak valid');
    const sn = await c.D.doc('shares/' + mm[1].toUpperCase()).get(); if (!sn.exists) throw new Error('Kode tidak ditemukan');
    const r = await fetch('/_blob/' + sn.data().aid); if (!r.ok) throw new Error('File proyek tidak bisa diunduh');
    const bin = atob(await r.text()), u = new Uint8Array(bin.length); for (let i = 0; i < u.length; i++) u[i] = bin.charCodeAt(i);
    if (u.length > MAX) throw new Error('Proyek melebihi batas 6 MB'); return new Blob([u]);
  }
  return {
    export: async p => {
      ML.toast('Mengunggah proyek…', 8000);
      try {
        const k = await send(p), link = ART + '#share=' + k; let cp = false; try { await navigator.clipboard.writeText(link); cp = true; } catch (e) { /* abaikan */ }
        await ML.dialog({ title: 'Proyek dibagikan', text: 'Kode: ' + k + ' · Link: ' + link + (cp ? ' (sudah disalin)' : '') + ' · Penerima buka halaman MotionLyn, login, lalu Impor → Dari link, tempel kode.', ok: 'OK' });
      } catch (e) { ML.toast('Gagal membagikan: ' + e.message, 4500); }
    },
    import: async () => {
      const v = await ML.dialog({ title: 'Impor dari link/kode', text: 'Tempel link/kode MotionLyn (8 karakter) atau link bagikan Alight Motion', input: true, value: '', ok: 'Impor' }); if (!v) return;
      if (ML.amLink && ML.amLink.isLink(v)) return ML.amLink.run(v);
      ML.toast('Mengunduh proyek…', 6000);
      try { const id = await ML.importML(await recv(v)); await ML.home.show(); ML.toast('Proyek diimpor'); ML.openEditor(id); }
      catch (e) { ML.toast('Gagal impor: ' + e.message, 4500); }
    }
  };
})();
