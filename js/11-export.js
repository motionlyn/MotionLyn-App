'use strict';
/* Ekspor / impor proyek (.ml) dan ekspor video */
(function () {
const dataURLtoBlob = u => { const [h, b] = u.split(','), bin = atob(b), a = new Uint8Array(bin.length); for (let i = 0; i < a.length; i++) a[i] = bin.charCodeAt(i); return new Blob([a], { type: /:(.*?);/.exec(h)[1] }); };
const blobToDataURL = b => new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
ML.sleep = sleep;

/** .ml = ZIP berisi manifest.json, project.json (data edit/kodingan), media.json, thumb.jpg, media/* (foto, audio, video) */
ML.buildML = async proj => {
  const used = new Set(proj.layers.map(l => l.mediaId).filter(Boolean)); proj.layers.forEach(l => { if (l.shape && l.shape.fillMedia && l.shape.fillMedia.mediaId) used.add(l.shape.fillMedia.mediaId); }); // termasuk foto isi bentuk
  const list = (await ML.db.mediaOf(proj.id)).filter(m => used.has(m.id));
  const meta = list.map(m => ({ id: m.id, kind: m.kind, name: m.name, mime: m.mime, w: m.w, h: m.h, dur: m.dur, file: 'media/' + m.id + '.' + (ML.ext(m.name) || 'bin') }));
  const entries = [
    { name: 'manifest.json', text: JSON.stringify({ app: 'MotionLyn', format: 1, version: ML.VERSION, created: Date.now() }) },
    { name: 'project.json', text: JSON.stringify(Object.assign({}, proj, { thumb: null })) },
    { name: 'media.json', text: JSON.stringify(meta) }
  ];
  if (proj.thumb) entries.push({ name: 'thumb.jpg', blob: dataURLtoBlob(proj.thumb) });
  list.forEach((m, i) => entries.push({ name: meta[i].file, blob: m.blob }));
  return ML.zip.build(entries);
};

ML.importML = async blob => {
  const z = await ML.zip.read(blob);
  const pj = await z.get('project.json'), mj = await z.get('media.json');
  if (!pj || !mj) throw new Error('File .ml tidak valid (project.json tidak ada)');
  const proj = JSON.parse(await pj.text()), meta = JSON.parse(await mj.text());
  if (!Array.isArray(proj.layers) || !proj.w || !proj.h) throw new Error('Data proyek rusak');
  const id = ML.uid() + ML.uid(); let size = 0;
  for (const m of meta) {
    const b = await z.get(m.file); if (!b) continue; size += b.size;
    await ML.db.putMedia({ id: m.id, pid: id, kind: m.kind, name: m.name, mime: m.mime, size: b.size, blob: new Blob([b], { type: m.mime || '' }), w: m.w, h: m.h, dur: m.dur });
  }
  const th = await z.get('thumb.jpg');
  proj.thumb = th ? await blobToDataURL(th) : null;
  proj.id = id; proj.createdAt = proj.updatedAt = Date.now(); proj.size = size + JSON.stringify(proj.layers).length;
  proj.markers = proj.markers || []; proj.layers.forEach(ML.ensureLayer);
  await ML.db.putProject(proj);
  return id;
};

/* v0.4.6: MotionLyn<JENIS>-<NAMA_PROYEK>_[<KODE_ACAK>].<ekstensi>
   V = video (mp4/webm), PNG, JPG, ML (proyek .ml), AMXML (XML Alight Motion); lainnya: GIF, SEQ (urutan gambar zip), AMXMLZIP (xml+media zip). Kode acak 6 karakter, baru tiap ekspor. */
ML.exportCode = () => { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', r = new Uint8Array(6); try { crypto.getRandomValues(r); } catch (e) { for (let i = 0; i < 6; i++) r[i] = Math.floor(Math.random() * 256); } return Array.from(r, b => A[b % A.length]).join(''); };
ML.exportFileName = (proj, ext, tag) => {
  const E = String(ext || '').toLowerCase().replace(/^\./, '');
  const T = tag || ({ mp4: 'V', webm: 'V', mov: 'V', m4v: 'V', png: 'PNG', jpg: 'JPG', jpeg: 'JPG', ml: 'ML', xml: 'AMXML', gif: 'GIF' }[E] || E.toUpperCase());
  const nm = String((proj && proj.name) || 'Proyek').replace(/[\\/:*?"<>|\x00-\x1f]+/g, '_').replace(/\s+/g, '_').replace(/^[._]+/, '').slice(0, 60) || 'Proyek';
  return 'MotionLyn' + T + '-' + nm + '_[' + ML.exportCode() + '].' + E;
};

/* ===== Ekspor video v2: per-frame (tepat waktu, bebas lag) via WebCodecs + muxer MP4 sendiri ===== */
const MP4 = (() => {
  const enc = new TextEncoder();
  const u32 = v => [v >>> 24 & 255, v >>> 16 & 255, v >>> 8 & 255, v & 255], u16 = v => [v >> 8 & 255, v & 255];
  const cat = parts => { let n = 0; for (const p of parts) n += p.length; const o = new Uint8Array(n); let k = 0; for (const p of parts) { o.set(p, k); k += p.length; } return o; };
  const box = (type, ...kids) => { const body = cat(kids.map(k => k instanceof Uint8Array ? k : Uint8Array.from(k))); return cat([Uint8Array.from(u32(body.length + 8)), enc.encode(type), body]); };
  const full = (type, ver, flags, ...kids) => box(type, [ver, flags >> 16 & 255, flags >> 8 & 255, flags & 255], ...kids);
  const rle = (arr) => { const o = []; for (const v of arr) { const l = o[o.length - 1]; if (l && l[1] === v) l[0]++; else o.push([1, v]); } return o; };
  const matrix = [...u32(0x10000), ...u32(0), ...u32(0), ...u32(0), ...u32(0x10000), ...u32(0), ...u32(0), ...u32(0), ...u32(0x40000000)];
  const esLen = n => [0x80 | (n >> 21 & 127), 0x80 | (n >> 14 & 127), 0x80 | (n >> 7 & 127), n & 127];

  /** vtrack/atrack: { samples:[{data,ts(us),dur(us),key}], ... }; kembalikan Blob mp4 (moov di depan) */
  function build(v, a) {
    const tracks = [];
    const vid = { kind: 'v', id: 1, ts: 90000, s: v.samples, cfg: v };
    tracks.push(vid);
    if (a && a.samples.length) tracks.push({ kind: 'a', id: 2, ts: a.sampleRate, s: a.samples, cfg: a });
    for (const t of tracks) {
      const us2t = us => Math.round(us * t.ts / 1e6), d = [];
      for (let i = 0; i < t.s.length; i++) {
        const nextTs = i + 1 < t.s.length ? t.s[i + 1].ts : t.s[i].ts + (t.s[i].dur || (i ? t.s[i].ts - t.s[i - 1].ts : 33333));
        d.push(Math.max(1, us2t(nextTs) - us2t(t.s[i].ts)));
      }
      t.d = d; t.total = d.reduce((x, y) => x + y, 0);
    }
    // urutan data: interleave menurut waktu
    const order = []; tracks.forEach(t => t.s.forEach((s, i) => order.push({ t, i, ts: s.ts })));
    order.sort((x, y) => x.ts - y.ts || x.t.id - y.t.id);
    const ftyp = box('ftyp', enc.encode('isom'), u32(512), enc.encode('isomiso2avc1mp41'));
    const mvTs = 1000, mvDur = Math.max(...tracks.map(t => Math.round(t.total * 1000 / t.ts)));

    const mkMoov = base => {
      let off = base; const offs = new Map(tracks.map(t => [t, new Array(t.s.length)]));
      for (const o of order) { offs.get(o.t)[o.i] = off; off += o.t.s[o.i].data.length; }
      const trk = t => {
        const c = t.cfg, isV = t.kind === 'v', dur = t.total;
        let entry;
        if (isV) {
          const nm = new Uint8Array(32);
          const cfgBox = c.fourcc === 'avc1' ? box('avcC', new Uint8Array(c.desc)) : c.vpcC;
          entry = box(c.fourcc, [0, 0, 0, 0, 0, 0], u16(1), [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], u16(c.w), u16(c.h), [0, 0x48, 0, 0], [0, 0x48, 0, 0], [0, 0, 0, 0], u16(1), nm, u16(0x18), u16(0xffff), cfgBox);
        } else if (c.fourcc === 'mp4a') {
          const asc = new Uint8Array(c.desc), dsi = [5, ...esLen(asc.length), ...asc];
          const dec = [4, ...esLen(13 + dsi.length), 0x40, 0x15, 0, 0, 0, ...u32(c.bitrate || 128000), ...u32(c.bitrate || 128000), ...dsi];
          const es = [3, ...esLen(3 + dec.length + 3), ...u16(2), 0, ...dec, 6, 1, 2];
          entry = box('mp4a', [0, 0, 0, 0, 0, 0], u16(1), [0, 0, 0, 0, 0, 0, 0, 0], u16(c.channels), u16(16), [0, 0, 0, 0], u16(c.sampleRate), [0, 0], full('esds', 0, 0, es));
        } else {
          entry = box('Opus', [0, 0, 0, 0, 0, 0], u16(1), [0, 0, 0, 0, 0, 0, 0, 0], u16(c.channels), u16(16), [0, 0, 0, 0], u16(c.sampleRate), [0, 0],
            box('dOps', [0, c.channels], u16(c.preSkip || 312), u32(c.sampleRate), u16(0), [0]));
        }
        const stsd = full('stsd', 0, 0, u32(1), entry);
        const stts = full('stts', 0, 0, (r => [...u32(r.length), ...r.flatMap(([n, d]) => [...u32(n), ...u32(d)])])(rle(t.d)));
        const stsz = full('stsz', 0, 0, u32(0), u32(t.s.length), t.s.flatMap(s => u32(s.data.length)));
        const stsc = full('stsc', 0, 0, u32(1), u32(1), u32(1), u32(1));
        const stco = full('stco', 0, 0, u32(t.s.length), offs.get(t).flatMap(o => u32(o)));
        const kids = [stsd, stts];
        if (isV) { const ks = []; t.s.forEach((s, i) => { if (s.key) ks.push(i + 1); }); kids.push(full('stss', 0, 0, u32(ks.length), ks.flatMap(u32))); }
        kids.push(stsc, stsz, stco);
        const hdlr = full('hdlr', 0, 0, u32(0), enc.encode(isV ? 'vide' : 'soun'), new Uint8Array(12), enc.encode(isV ? 'Video\0' : 'Audio\0'));
        const mediaHdr = isV ? full('vmhd', 0, 1, u16(0), [0, 0, 0, 0, 0, 0]) : full('smhd', 0, 0, u16(0), u16(0));
        const dinf = box('dinf', full('dref', 0, 0, u32(1), full('url ', 0, 1)));
        const mdhd = full('mdhd', 0, 0, u32(0), u32(0), u32(t.ts), u32(dur), u16(0x55c4), u16(0));
        const tkhd = full('tkhd', 0, 3, u32(0), u32(0), u32(t.id), u32(0), u32(Math.round(dur * 1000 / t.ts)), new Uint8Array(8), u16(0), u16(0), u16(isV ? 0 : 0x0100), u16(0), matrix, u32(isV ? c.w << 16 : 0), u32(isV ? c.h << 16 : 0));
        return box('trak', tkhd, box('mdia', mdhd, hdlr, box('minf', mediaHdr, dinf, box('stbl', ...kids))));
      };
      const mvhd = full('mvhd', 0, 0, u32(0), u32(0), u32(mvTs), u32(mvDur), u32(0x10000), u16(0x100), u16(0), new Uint8Array(8), matrix, new Uint8Array(24), u32(tracks.length + 1));
      return box('moov', mvhd, ...tracks.map(trk));
    };
    const probe = mkMoov(0), dataStart = ftyp.length + probe.length + 8;
    const moov = mkMoov(dataStart);
    const mdatSize = order.reduce((n, o) => n + o.t.s[o.i].data.length, 0) + 8;
    if (mdatSize > 0xfffffff0) throw new Error('Video terlalu besar (>4 GB)');
    return new Blob([ftyp, moov, Uint8Array.from([...u32(mdatSize), ...enc.encode('mdat')]), ...order.map(o => o.t.s[o.i].data)], { type: 'video/mp4' });
  }
  return { build, box, full };
})();

const vpcCBox = () => MP4.full('vpcC', 1, 0, [0, 40, (8 << 4) | (1 << 1), 1, 1, 1, 0, 0]);
const toU8 = d => !d ? new Uint8Array(0) : d instanceof ArrayBuffer ? new Uint8Array(d.slice(0)) : new Uint8Array(d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength));

const hasWC = () => typeof VideoEncoder === 'function' && typeof VideoFrame === 'function';

async function pickVideoCfg(W, H, fps, bps, force) {
  const lvl = W * H > 1920 * 1088 ? ['avc1.640033', 'avc1.64002A', 'avc1.4D0033', 'avc1.42E01F'] : W * H > 1280 * 736 ? ['avc1.64002A', 'avc1.640028', 'avc1.4D002A', 'avc1.42E01F'] : ['avc1.64001F', 'avc1.4D001F', 'avc1.42E01F'];
  const list = [];
  if (force !== 'vp9') for (const c of lvl) list.push({ fourcc: 'avc1', cfg: { codec: c, width: W, height: H, bitrate: bps, framerate: fps, avc: { format: 'avc' }, latencyMode: 'quality' } });
  if (force !== 'avc') list.push({ fourcc: 'vp09', cfg: { codec: 'vp09.00.40.08', width: W, height: H, bitrate: bps, framerate: fps, latencyMode: 'quality' } });
  for (const it of list) { try { const r = await VideoEncoder.isConfigSupported(it.cfg); if (r && r.supported) return { fourcc: it.fourcc, cfg: r.config || it.cfg }; } catch (e) { /* coba berikutnya */ } }
  return null;
}

/** campur semua layer audio/video menjadi satu AudioBuffer 48 kHz stereo (offline, tepat waktu) */
async function mixAudio(proj, dur, ctl) {
  ML.media.hold = (ML.media.hold || 0) + 1; // v3.91: ekspor langsung kualitas penuh, tanpa berbagi CPU dengan gelombang timeline
  try { return await mixAudio0(proj, dur, ctl); } finally { ML.media.hold = Math.max(0, ML.media.hold - 1); }
}
async function mixAudio0(proj, dur, ctl) {
  const SR = ML.mixSR || +(ML.lsGet('ml.asr') || 48000), layers = proj.layers.filter(L => (L.type === 'audio' || L.type === 'video') && !L.hidden && !L.muted && L.volume > 0 && L.mediaId && ML.media.items.get(L.mediaId));
  if (!layers.length) return null;
  const AC = window.OfflineAudioContext || window.webkitOfflineAudioContext; if (!AC) return null;
  const off = new AC(2, Math.max(1, Math.ceil(dur * SR)), SR), dec = new Map(); let used = 0;
  const ids = [...new Set(layers.map(L => L.mediaId))]; // v3.90: decode semua media unik sekaligus (bukan satu-satu)
  await Promise.all(ids.map(async id => {
    let b = null;
    try { b = await new AC(2, 1, SR).decodeAudioData(await ML.media.items.get(id).blob.arrayBuffer()); } catch (e) { b = null; }
    dec.set(id, b);
  }));
  for (const L of layers) {
    if (ctl.cancelled) return null;
    const buf = dec.get(L.mediaId);
    if (!buf) continue;
    const src = off.createBufferSource(), g = off.createGain(); src.buffer = buf; g.gain.value = L.volume / 100; src.connect(g); g.connect(off.destination);
    const len = Math.min(L.dur, Math.max(0, buf.duration - L.trimIn)); if (len <= 0) continue;
    src.start(Math.max(0, L.start), Math.max(0, L.trimIn), len); used++;
  }
  if (!used) return null;
  return off.startRendering();
}

ML._aud = { mix: mixAudio, enc: encodeAudio };
async function pickAudioCfg(sr, ch) {
  for (const it of [{ fourcc: 'mp4a', cfg: { codec: 'mp4a.40.2', sampleRate: sr, numberOfChannels: ch, bitrate: 192000 } }, { fourcc: 'Opus', cfg: { codec: 'opus', sampleRate: sr, numberOfChannels: ch, bitrate: 160000 } }]) {
    try { if (typeof AudioEncoder === 'function' && (await AudioEncoder.isConfigSupported(it.cfg)).supported) return it; } catch (e) { /* lanjut */ }
  }
  return null;
}

async function encodeAudio(buf, pick, ctl) {
  const ch = buf.numberOfChannels, sr = buf.sampleRate, samples = []; let meta = null, err = null;
  const ae = new AudioEncoder({ output: (c, m) => { const d = new Uint8Array(c.byteLength); c.copyTo(d); samples.push({ data: d, ts: c.timestamp, dur: c.duration || 0 }); if (m && m.decoderConfig && !meta) meta = m.decoderConfig; }, error: e => { err = e; } });
  ae.configure(pick.cfg);
  const chans = []; for (let c = 0; c < ch; c++) chans.push(buf.getChannelData(c));
  const STEP = 4096;
  for (let p = 0; p < buf.length; p += STEP) {
    if (ctl.cancelled || err) break;
    const n = Math.min(STEP, buf.length - p), data = new Float32Array(n * ch);
    for (let c = 0; c < ch; c++) data.set(chans[c].subarray(p, p + n), c * n);
    const ad = new AudioData({ format: 'f32-planar', sampleRate: sr, numberOfFrames: n, numberOfChannels: ch, timestamp: Math.round(p * 1e6 / sr), data });
    ae.encode(ad); ad.close();
    while (ae.encodeQueueSize > 16 && !err) await new Promise(r => setTimeout(r, 2));
  }
  if (!err) await ae.flush(); try { ae.close(); } catch (e) { /* abaikan */ }
  if (err) throw err;
  if (!meta) throw new Error('encoder audio tidak memberi konfigurasi');
  return { samples, sampleRate: sr, channels: ch, fourcc: pick.fourcc, desc: toU8(meta.description), bitrate: pick.cfg.bitrate, preSkip: 312 };
}

const seekEl = (el, t) => new Promise(res => {
  if (!isFinite(t)) return res();
  t = Math.max(0, Math.min(t, (el.duration || 1e9) - 0.001));
  if (Math.abs(el.currentTime - t) < 0.0005 && el.readyState >= 2) return res();
  let done = false; const fin = () => { if (done) return; done = true; clearTimeout(to); el.removeEventListener('seeked', fin); res(); };
  const to = setTimeout(fin, 2500); el.addEventListener('seeked', fin); try { el.pause(); el.currentTime = t; } catch (e) { fin(); }
});

async function exportFrames(proj, o, onProg, ctl) {
  const dur = ML.duration(proj), fps = o.fps || proj.fps, N = Math.max(1, Math.round(dur * fps));
  const W = (o.w || proj.w) & ~1, H = (o.h || proj.h) & ~1;
  const bps = ML.clamp(Math.round(W * H * fps * 0.12), 2e6, 60e6);
  const vp = await pickVideoCfg(W, H, fps, bps, o.codec);
  if (!vp) return undefined; // tidak didukung -> cadangan real-time
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const rend = new ML.Renderer(), P = ML.player, saved = { onframe: P.onframe, onend: P.onend, t: P.t };
  ML.exporting = true; P.pause(); let wl = null; try { wl = await navigator.wakeLock.request('screen'); } catch (e) { /* tidak didukung */ }
  const vs = [], t0 = performance.now(); let vdesc = null, verr = null;
  const ve = new VideoEncoder({ output: (c, m) => { const d = new Uint8Array(c.byteLength); c.copyTo(d); vs.push({ data: d, ts: c.timestamp, dur: c.duration || 0, key: c.type === 'key' }); if (m && m.decoderConfig && m.decoderConfig.description && !vdesc) vdesc = toU8(m.decoderConfig.description); }, error: e => { verr = e; } });
  try {
    ve.configure(vp.cfg);
    onProg(0, 'Menyiapkan audio…');
    let audio = null, note = '';
    try {
      const mix = await mixAudio(proj, dur, ctl);
      if (mix) { const pick = await pickAudioCfg(mix.sampleRate, mix.numberOfChannels); if (pick) audio = await encodeAudio(mix, pick, ctl); else note = 'Audio tidak bisa di-encode di perangkat ini; video diekspor tanpa suara.'; }
    } catch (e) { audio = null; note = 'Audio gagal diproses (' + e.message + '); video diekspor tanpa suara.'; }
    const vids = proj.layers.filter(L => L.type === 'video' && !L.hidden);
    vids.forEach(L => ML.media.el(L));
    let lastYield = performance.now();
    for (let i = 0; i < N; i++) {
      if (ctl.cancelled) break; if (verr) throw verr;
      const t = Math.min(i / fps, dur - 0.0005);
      for (const L of vids) { if (t >= L.start && t < L.start + L.dur) { const el = ML.media.el(L); if (el) await seekEl(el, L.trimIn + (t - L.start)); } }
      rend.render(cv, proj, t, { maxSamples: 16 });
      const ts = Math.round(i * 1e6 / fps), fr = new VideoFrame(cv, { timestamp: ts, duration: Math.round(1e6 / fps) });
      ve.encode(fr, { keyFrame: i % Math.max(1, Math.round(fps * 2)) === 0 }); fr.close();
      while (ve.encodeQueueSize > 6 && !verr && !ctl.cancelled) await new Promise(r => setTimeout(r, 1));
      const now = performance.now();
      if (now - lastYield > 80) { lastYield = now; const el = (now - t0) / 1000; onProg((i + 1) / N, Math.round((i + 1) / el) + ' fps • sisa ±' + Math.max(0, Math.round(el / (i + 1) * (N - i - 1))) + ' dtk'); await new Promise(r => setTimeout(r, 0)); }
    }
    if (ctl.cancelled) return null;
    await ve.flush(); if (verr) throw verr;
    if (!vs.length) throw new Error('encoder tidak menghasilkan frame');
    onProg(1, 'Menyusun file…'); await new Promise(r => setTimeout(r, 0));
    const vtr = { samples: vs, w: W, h: H, fourcc: vp.fourcc, desc: vdesc, vpcC: vp.fourcc === 'vp09' ? vpcCBox() : null };
    if (vp.fourcc === 'avc1' && !vdesc) throw new Error('konfigurasi H.264 tidak tersedia');
    const blob = MP4.build(vtr, audio);
    return { blob, ext: 'mp4', mime: 'video/mp4', note };
  } finally {
    try { ve.close(); } catch (e) { /* abaikan */ }
    try { if (wl) wl.release(); } catch (e) { /* abaikan */ }
    rend.dispose(); P.onframe = saved.onframe; P.onend = saved.onend; ML.exporting = false; P.seek(saved.t);
  }
}

ML.exportVideo = async (proj, o, onProg, ctl) => {
  const dur = ML.duration(proj);
  if (dur <= 0) throw new Error('Proyek masih kosong');
  ctl.cancelled = false; ctl.cancel = () => { ctl.cancelled = true; };
  if (hasWC() && o.mode !== 'realtime') {
    try { const r = await exportFrames(proj, o, onProg, ctl); if (r !== undefined) return r; }
    catch (e) { if (ctl.cancelled) return null; console.warn('Ekspor per-frame gagal, beralih ke real-time:', e); ML.toast('Mode cepat gagal (' + e.message + '), memakai mode real-time…', 3500); }
  }
  return exportRealtime(proj, o, onProg, ctl);
};

/** Cadangan (perangkat tanpa WebCodecs): rekam real-time lewat MediaRecorder */
const exportRealtime = async (proj, o, onProg, ctl) => {
  const dur = ML.duration(proj);
  if (dur <= 0) throw new Error('Proyek masih kosong');
  if (!window.MediaRecorder) throw new Error('MediaRecorder tidak tersedia di perangkat ini');
  const cv = document.createElement('canvas'); cv.width = (o.w || proj.w) & ~1; cv.height = (o.h || proj.h) & ~1;
  const rend = new ML.Renderer(), fps = o.fps || proj.fps;
  const stream = cv.captureStream(fps);
  ML.audio.ensure();
  if (ML.audio.dest) ML.audio.dest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
  const cands = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  const mime = cands.find(m => MediaRecorder.isTypeSupported(m));
  if (!mime) throw new Error('Tidak ada format video yang didukung');
  const bps = ML.clamp(Math.round(proj.w * proj.h * fps * 0.1), 2e6, 80e6);
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bps });
  const chunks = []; rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  const stopped = new Promise(r => rec.onstop = r);
  const P = ML.player, saved = { onframe: P.onframe, onend: P.onend, t: P.t };
  let cancelled = false;
  const ended = new Promise(res => { P.onend = res; ctl.cancel = () => { cancelled = true; res(); }; });
  ML.exporting = true;
  try {
    P.pause();
    P.onframe = t => { rend.render(cv, proj, Math.min(t, dur - 0.001), { maxSamples: 8 }); onProg(Math.min(1, t / dur)); };
    P.t = 0; P.syncMedia(false); P.draw();
    await sleep(500);
    rec.start(250); P.play();
    await ended;
    if (!cancelled) await sleep(500);
    P.pause(); if (rec.state !== 'inactive') rec.stop();
    await stopped;
  } finally {
    stream.getTracks().forEach(t => t.stop()); rend.dispose();
    P.onframe = saved.onframe; P.onend = saved.onend; ML.exporting = false; P.seek(saved.t);
  }
  if (cancelled) return null;
  const type = mime.split(';')[0];
  return { blob: new Blob(chunks, { type }), ext: type === 'video/mp4' ? 'mp4' : 'webm', mime: type };
};
})();

