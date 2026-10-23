'use strict';
/* Ekspor video transparan: WebM VP9 + alpha (WebCodecs) dengan muxer WebM sendiri (+ audio Opus) */
(function () {
const cat = a => { let n = 0; for (const x of a) n += x.length; const o = new Uint8Array(n); let p = 0; for (const x of a) { o.set(x, p); p += x.length; } return o; };
const sz = n => { const b = [1, 0, 0, 0, 0, 0, 0, 0]; for (let i = 7; i > 0; i--) { b[i] = n % 256; n = Math.floor(n / 256); } return Uint8Array.from(b); };
const el = (id, p) => cat([Uint8Array.from(id), sz(p.length), p]);
const uint = (id, n) => { const b = []; do { b.unshift(n % 256); n = Math.floor(n / 256); } while (n > 0); return el(id, Uint8Array.from(b)); };
const flt = (id, v) => { const d = new DataView(new ArrayBuffer(8)); d.setFloat64(0, v); return el(id, new Uint8Array(d.buffer)); };
const str = (id, s) => el(id, Uint8Array.from([...s].map(c => c.charCodeAt(0))));
function webm(ch, W, H, dur, au) {
  const hd = el([0x1A, 0x45, 0xDF, 0xA3], cat([uint([0x42, 0x86], 1), uint([0x42, 0xF7], 1), uint([0x42, 0xF2], 4), uint([0x42, 0xF3], 8), str([0x42, 0x82], 'webm'), uint([0x42, 0x87], 4), uint([0x42, 0x85], 2)]));
  const info = el([0x15, 0x49, 0xA9, 0x66], cat([uint([0x2A, 0xD7, 0xB1], 1e6), flt([0x44, 0x89], dur * 1000), str([0x4D, 0x80], 'MotionLyn'), str([0x57, 0x41], 'MotionLyn')]));
  const vt = el([0xAE], cat([uint([0xD7], 1), uint([0x73, 0xC5], 1), uint([0x83], 1), str([0x86], 'V_VP9'), el([0xE0], cat([uint([0xB0], W), uint([0xBA], H), uint([0x53, 0xC0], 1)]))]));
  const tl = [vt];
  if (au) {
    const hh = new Uint8Array(19); hh.set([...'OpusHead'].map(c => c.charCodeAt(0))); const dv = new DataView(hh.buffer);
    hh[8] = 1; hh[9] = au.channels; dv.setUint16(10, au.preSkip, true); dv.setUint32(12, au.sampleRate, true);
    tl.push(el([0xAE], cat([uint([0xD7], 2), uint([0x73, 0xC5], 2), uint([0x83], 2), str([0x86], 'A_OPUS'), el([0x63, 0xA2], hh), uint([0x56, 0xAA], Math.round(au.preSkip / 48000 * 1e9)), uint([0x56, 0xBB], 80000000), el([0xE1], cat([flt([0xB5], au.sampleRate), uint([0x9F], au.channels)]))])));
  }
  const tr = el([0x16, 0x54, 0xAE, 0x6B], cat(tl));
  const cls = []; let cur = null;
  for (const c of ch) { if (!cur || c.key) { cur = { ts: c.ts, b: [] }; cls.push(cur); }
    const rel = c.ts - cur.ts, blk = el([0xA1], cat([Uint8Array.of(0x81, (rel >> 8) & 255, rel & 255, 0), c.d]));
    const parts = [blk]; if (c.a) parts.push(el([0x75, 0xA1], el([0xA6], cat([uint([0xEE], 1), el([0xA5], c.a)]))));
    if (!c.key) parts.push(el([0xFB], Uint8Array.of(0xFF)));
    cur.b.push({ ms: c.ts, e: el([0xA0], cat(parts)) }); }
  if (au) for (const s of au.samples) {
    const ms = Math.round(s.ts / 1000); let k = cls[0]; for (const c of cls) { if (c.ts <= ms) k = c; else break; }
    const rel = Math.max(0, ms - k.ts); k.b.push({ ms, e: el([0xA3], cat([Uint8Array.of(0x82, (rel >> 8) & 255, rel & 255, 0x80), s.data])) });
  }
  const seg = el([0x18, 0x53, 0x80, 0x67], cat([info, tr, ...cls.map(k => el([0x1F, 0x43, 0xB6, 0x75], cat([uint([0xE7], k.ts), ...k.b.sort((x, y) => x.ms - y.ms).map(x => x.e)])))]));
  return new Blob([hd, seg], { type: 'video/webm' });
}
const seekEl = (e, t) => new Promise(r => { if (!e || e.readyState < 1) return r(); const d = () => { e.removeEventListener('seeked', d); r(); }; e.addEventListener('seeked', d); try { e.pause(); e.currentTime = Math.max(0, t); } catch (x) { d(); } setTimeout(d, 1500); });
ML.exportWebmAlpha = async (proj, o, onProg, ctl) => {
  const dur = ML.duration(proj); if (dur <= 0) throw new Error('Proyek masih kosong');
  ctl.cancelled = false; ctl.cancel = () => { ctl.cancelled = true; };
  if (typeof VideoEncoder === 'undefined') throw new Error('WebCodecs tidak didukung di perangkat ini');
  const fps = o.fps || proj.fps, N = Math.max(1, Math.round(dur * fps)), W = (o.w || proj.w) & ~1, H = (o.h || proj.h) & ~1;
  const cfg = { codec: 'vp09.00.10.08', width: W, height: H, bitrate: ML.clamp(Math.round(W * H * fps * 0.15), 2e6, 60e6), framerate: fps, alpha: 'keep' };
  let sup = null; try { sup = await VideoEncoder.isConfigSupported(cfg); } catch (e) { /* abaikan */ }
  if (!sup || !sup.supported || (sup.config && sup.config.alpha !== 'keep')) throw new Error('Perangkat tidak mendukung video transparan. Pakai Urutan Gambar (PNG) atau GIF.');
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const rend = new ML.Renderer(), P = ML.player, saved = { onframe: P.onframe, onend: P.onend, t: P.t }, ch = []; let err = null;
  const ve = new VideoEncoder({ output: (c, m) => { const d = new Uint8Array(c.byteLength); c.copyTo(d); ch.push({ d, a: m && m.alphaSideData ? new Uint8Array(m.alphaSideData) : null, ts: Math.round(c.timestamp / 1000), key: c.type === 'key' }); }, error: e => { err = e; } });
  ML.exporting = true; P.pause();
  try {
    let au = null, note = 'WebM transparan';
    if (o.audio === false) note += ' (tanpa audio)';
    else { onProg(0, 'Menyiapkan audio…'); ML.mixSR = 48000;
    try { const mix = await ML._aud.mix(proj, dur, ctl);
      if (mix) { const ac = { codec: 'opus', sampleRate: mix.sampleRate, numberOfChannels: mix.numberOfChannels, bitrate: 160000 };
        if (typeof AudioEncoder === 'function' && (await AudioEncoder.isConfigSupported(ac)).supported) au = await ML._aud.enc(mix, { fourcc: 'Opus', cfg: ac }, ctl); else note += ', audio tidak bisa di-encode di perangkat ini'; } }
    catch (e) { note += ', audio gagal (' + e.message + ')'; } finally { ML.mixSR = 0; } }
    ve.configure(cfg); const vids = proj.layers.filter(L => L.type === 'video' && !L.hidden), t0 = performance.now(); let ly = t0;
    for (let i = 0; i < N; i++) {
      if (ctl.cancelled) return null; if (err) throw err;
      const t = Math.min(i / fps, dur - 0.0005);
      for (const L of vids) if (t >= L.start && t < L.start + L.dur) await seekEl(ML.media.el(L), L.trimIn + (t - L.start));
      rend.render(cv, proj, t, { maxSamples: 16 });
      const fr = new VideoFrame(cv, { timestamp: Math.round(i * 1e6 / fps), duration: Math.round(1e6 / fps), alpha: 'keep' });
      ve.encode(fr, { keyFrame: i % Math.max(1, Math.round(fps * 2)) === 0 }); fr.close();
      while (ve.encodeQueueSize > 6 && !err && !ctl.cancelled) await new Promise(r => setTimeout(r, 1));
      const now = performance.now(); if (now - ly > 80) { ly = now; onProg((i + 1) / N, Math.round((i + 1) / ((now - t0) / 1000)) + ' fps'); await new Promise(r => setTimeout(r, 0)); }
    }
    await ve.flush(); if (err) throw err;
    if (!ch.length || !ch.some(c => c.a)) throw new Error('Encoder tidak menghasilkan data alpha. Pakai Urutan Gambar (PNG) atau GIF.');
    onProg(1, 'Menyusun file…'); await new Promise(r => setTimeout(r, 0));
    return { blob: webm(ch, W, H, dur, au), ext: 'webm', mime: 'video/webm', note: au ? '' : note };
  } finally { try { ve.close(); } catch (e) { /* abaikan */ } try { rend.dispose(); } catch (e) { /* abaikan */ } P.onframe = saved.onframe; P.onend = saved.onend; ML.exporting = false; P.seek(saved.t); }
};
})();
