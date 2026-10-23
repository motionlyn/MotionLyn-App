'use strict';
/* Layar Ekspor & Bagikan: video MP4, link, paket .ml, Drive, frame PNG/JPG, urutan gambar (ZIP), GIF */
ML.drawChecker = (ctx, W, H) => { const s = Math.max(8, Math.round(Math.min(W, H) / 40)); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#cfcfcf'; for (let y = 0; y * s < H; y++) for (let x = (y & 1); x * s < W; x += 2) ctx.fillRect(x * s, y * s, s, s); };
ML.gifEncode = (frames, W, H, delay, tr) => {
  const o = [], w = (...a) => { for (const x of a) o.push(x); };
  for (const c of 'GIF89a') o.push(c.charCodeAt(0));
  w(W & 255, W >> 8, H & 255, H >> 8, 0xF7, 0, 0);
  for (let i = 0; i < 256; i++) w(((i >> 5) & 7) * 255 / 7 | 0, ((i >> 2) & 7) * 255 / 7 | 0, (i & 3) * 255 / 3 | 0);
  w(0x21, 0xFF, 11); for (const c of 'NETSCAPE2.0') o.push(c.charCodeAt(0)); w(3, 1, 0, 0, 0);
  for (const f of frames) {
    w(0x21, 0xF9, 4, tr ? 9 : 0, delay & 255, delay >> 8, 0, 0, 0x2C, 0, 0, 0, 0, W & 255, W >> 8, H & 255, H >> 8, 0, 8);
    const by = []; let cur = 0, nb = 0, size = 9, next = 258, dict = new Map();
    const emit = c => { cur |= c << nb; nb += size; while (nb >= 8) { by.push(cur & 255); cur >>= 8; nb -= 8; } };
    const px = j => { if (tr && f[j + 3] < 128) return 0; const v = (f[j] & 0xE0) | ((f[j + 1] & 0xE0) >> 3) | (f[j + 2] >> 6); return tr && !v ? 1 : v; };
    emit(256); let p = px(0);
    for (let i = 1; i < W * H; i++) {
      const c = px(i * 4), k = p * 256 + c, v = dict.get(k);
      if (v !== undefined) { p = v; continue; }
      emit(p);
      if (next < 4096) { dict.set(k, next++); if (next > (1 << size) && size < 12) size++; }
      else { emit(256); dict.clear(); size = 9; next = 258; }
      p = c;
    }
    emit(p); emit(257); if (nb > 0) by.push(cur & 255);
    for (let i = 0; i < by.length; i += 255) { const n = Math.min(255, by.length - i); o.push(n); for (let j = 0; j < n; j++) o.push(by[i + j]); }
    o.push(0);
  }
  o.push(0x3B); return new Blob([new Uint8Array(o)], { type: 'image/gif' });
};
ML.exportScreen = A => {
  const h = ML.h, I = ML.icon, { proj, P } = A, st = { opt: 'video', short: 0, fps: 0, alpha: 0 };
  const dims = () => st.short ? ML.calcSize(proj.w, proj.h, st.short) : [proj.w & ~1, proj.h & ~1];
  const FPS = () => st.fps || proj.fps, dur = () => P.dur();
  const est = () => { const [w, hh] = dims(), f = FPS(), n = Math.ceil(dur() * f);
    const b = { video: ML.clamp(Math.round(w * hh * f * 0.12), 2e6, 60e6) * dur() / 8, png: w * hh * 1.2, jpg: w * hh * .3, seq: w * hh * 1.2 * n, gif: w * hh * .35 * n, pack: 0, link: 0, drive: 0 }[st.opt];
    return b ? (b > 1e9 ? (b / 1e9).toFixed(1) + ' GB' : (b / 1e6).toFixed(1) + ' MB') : '—'; };
  const free = h('b', { text: '…' }), size = h('b', { text: '—' });
  try { navigator.storage.estimate().then(e => { free.textContent = ((e.quota - e.usage) / 1e9).toFixed(1) + ' GB'; }); } catch (e) { free.textContent = '—'; }
  const sel = (opts, get, set) => h('select', { class: 'sel wide', onchange: e => { set(+e.target.value); size.textContent = est(); } }, ...opts.map(([v, l]) => h('option', { value: v, text: l, selected: get() === v })));
  const OPTS = [['video', 'video', 'Video MP4', () => dims().join('×') + ' • ' + FPS() + ' fps' + (st.alpha ? (st.alpha === 1 ? ' • WebM transparan + audio' : ' • WebM transparan tanpa audio') : '')], ['link', 'export', 'Bagikan via Link', () => 'Maks 6 MB'], ['pack', 'layers', 'Paket Proyek (.ml)', () => 'dengan media asli'], ['drive', 'export', 'Google Drive', () => 'Simpan ke Drive'],
    ['png', 'image', 'Frame Saat Ini sebagai PNG', null], ['jpg', 'image', 'Frame Saat Ini sebagai JPG', null], ['seq', 'image', 'Urutan Gambar', () => 'PNG ' + FPS() + ' fps (ZIP)'], ['gif', 'image', 'GIF', () => 'animasi, maks 10 dtk']];
  const list = h('div'), draw = () => list.replaceChildren(...OPTS.map(([k, ic, t, sub]) => h('button', { class: 'opt' + (st.opt === k ? ' on' : ''), onclick: () => { st.opt = k; draw(); size.textContent = est(); } },
    h('span', { class: 'rd' }), h('span', { html: I(ic) }), h('span', { style: 'flex:1' }, h('b', { text: t }), sub ? h('small', { text: sub() }) : '')))); draw(); size.textContent = est();
  const frame = (t, w, hh, ck) => { const r = new ML.Renderer(), cv = document.createElement('canvas'); cv.width = w; cv.height = hh; r.render(cv, proj, t, { maxSamples: 16, checker: ck }); try { r.dispose(); } catch (e) { /* abaikan */ } return cv; };
  const seek = (el, t) => new Promise(r => { if (!el || el.readyState < 1) return r(); const d = () => { el.removeEventListener('seeked', d); r(); }; el.addEventListener('seeked', d); el.currentTime = t; setTimeout(d, 600); });
  const prep = async t => { for (const L of proj.layers) if (L.type === 'video' && !L.hidden && t >= L.start && t < L.start + L.dur) await seek(ML.media.el(L), L.trimIn + (t - L.start)); };
  const blobOf = (cv, mime, q) => new Promise(r => cv.toBlob(r, mime, q));
  const save = async (b, ext, mime) => { const loc = await ML.saveBlob(b, ML.exportFileName(proj, ext), mime); ML.toast('Tersimpan: ' + loc, 4500); };
  async function frames(kind) { // kind: 'seq' | 'gif'
    const [w0, h0] = dims(); let f = FPS(), w = w0, hh = h0, n = Math.ceil(dur() * f);
    if (kind === 'gif') { f = Math.min(f, 15); const k = Math.min(1, 480 / Math.max(w, hh)); w = Math.max(2, Math.round(w * k)); hh = Math.max(2, Math.round(hh * k)); n = Math.min(Math.ceil(dur() * f), 150); }
    else if (n > 900) { ML.toast('Terlalu banyak frame (' + n + '). Turunkan fps atau persingkat proyek (maks 900).', 4500); return; }
    const prog = h('div', { class: 'dlg-text', text: 'Merender 0%' }); let stop = false;
    const sh = ML.sheet('Mengekspor', b => b.append(prog, h('div', { class: 'btn-row' }, h('button', { class: 'btn ghost', text: 'Batal', onclick: () => { stop = true; } }))), { onClose: () => { stop = true; } });
    const out = []; ML.exporting = true; P.pause(); const t0 = P.t;
    try {
      for (let i = 0; i < n && !stop; i++) {
        const t = Math.min(i / f, dur() - 0.0005); await prep(t); const cv = frame(t, w, hh);
        out.push(kind === 'gif' ? cv.getContext('2d').getImageData(0, 0, w, hh).data : { name: 'frame_' + String(i + 1).padStart(5, '0') + '.png', blob: await blobOf(cv, 'image/png') });
        prog.textContent = 'Merender ' + Math.round((i + 1) / n * 100) + '% (' + (i + 1) + '/' + n + ')'; await new Promise(r => setTimeout(r, 0));
      }
      if (stop) { ML.toast('Ekspor dibatalkan'); return; }
      prog.textContent = 'Menyusun file…'; await new Promise(r => setTimeout(r, 20));
      if (kind === 'gif') await save(ML.gifEncode(out, w, hh, Math.round(100 / f), proj.bg === 'transparent'), 'gif', 'image/gif'); else await save(await ML.zip.build(out), 'zip', 'application/zip');
    } catch (e) { ML.toast('Gagal ekspor: ' + e.message, 4500); }
    finally { ML.exporting = false; P.seek(t0); sh.close(); }
  }
  async function go() {
    const k = st.opt; if (!dur() && !['pack', 'drive', 'link'].includes(k)) { ML.toast('Proyek masih kosong'); return; }
    if (k === 'video') { close(); A.exportVideo({ w: dims()[0], h: dims()[1], fps: FPS(), alpha: !!st.alpha, audio: st.alpha === 1 }); return; }
    await A.save(true);
    if (k === 'link') { close(); ML.share.export(proj); return; }
    if (k === 'drive') { close(); ML.gdrive.export(proj); return; }
    try {
      if (k === 'pack') { ML.toast('Menyiapkan file .ml…'); await save(await ML.buildML(proj), 'ml', 'application/octet-stream'); }
      else if (k === 'png' || k === 'jpg') { const [w, hh] = dims(), cv = frame(P.t, w, hh, k === 'jpg'); await save(await blobOf(cv, k === 'png' ? 'image/png' : 'image/jpeg', .95), k, k === 'png' ? 'image/png' : 'image/jpeg'); }
      else await frames(k);
    } catch (e) { ML.toast('Gagal ekspor: ' + e.message, 4500); }
  }
  const pg = h('div', { class: 'pg' });
  const close = () => pg.remove();
  pg.append(h('div', { class: 'pg-top' }, h('button', { class: 'icon-btn dark', html: I('x'), onclick: close }), h('b', { text: 'Ekspor & Bagikan' })),
    h('div', { class: 'pg-info' }, h('div', {}, h('span', { text: 'Ruang yang Tersedia' }), free), h('div', {}, h('span', { text: 'Ukuran file (perkiraan)' }), size)),
    h('div', { class: 'pg-body' },
      sel([[0, 'Resolusi: sama proyek (' + Math.min(proj.w, proj.h) + 'p)'], [480, '480p'], [720, '720p (HD)'], [1080, '1080p (FHD)'], [1440, '1440p (2K)'], [2160, '2160p (4K)']], () => st.short, v => { st.short = v; draw(); }),
      sel([[0, 'Frame rate: sama proyek (' + proj.fps + ' fps)'], [24, '24 fps'], [30, '30 fps'], [60, '60 fps'], [120, '120 fps']], () => st.fps, v => { st.fps = v; draw(); }),
      sel([[0, 'Latar video: sesuai proyek (MP4)'], [1, 'Transparan WebM (+ audio)'], [2, 'Transparan WebM (tanpa audio)']], () => st.alpha, v => { st.alpha = v; draw(); }), list),
    h('div', { class: 'pg-foot' }, h('button', { class: 'btn primary', text: 'Ekspor', onclick: go })));
  ML.$('#overlays').append(pg);
};
