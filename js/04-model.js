'use strict';
/* Model data proyek, animasi keyframe, layer */
(function () {
ML.RATIOS = ['16:9', '9:16', '4:5', '1:1'];
ML.RES = { '720p': 720, '1080p': 1080, '2K': 1440, '4K': 2160 };
ML.FPS = [24, 30, 60, 120, 240];
ML.BLENDS = [['normal', 'Normal', 'source-over'], ['multiply', 'Multiply', 'multiply'], ['screen', 'Screen', 'screen'],
  ['overlay', 'Overlay', 'overlay'], ['darken', 'Darken', 'darken'], ['lighten', 'Lighten', 'lighten'],
  ['add', 'Add', 'lighter'], ['difference', 'Difference', 'difference']];
ML.PREVIEW_Q = [[360, 'Sangat rendah'], [480, 'Rendah'], [720, 'Sedang'], [1080, 'Tinggi']];
ML.previewMax = () => +(ML.lsGet('ml.pv') || 480);

/** resolusi = sisi terpendek (1080p di 9:16 => 1080x1920) */
ML.calcSize = (rw, rh, short) => {
  let w, h;
  if (rw >= rh) { h = short; w = Math.round(short * rw / rh); } else { w = short; h = Math.round(short * rh / rw); }
  return [Math.max(2, w & ~1), Math.max(2, h & ~1)];
};

ML.newProject = o => {
  const [w, h] = ML.calcSize(o.rw, o.rh, o.short);
  return {
    id: ML.uid() + ML.uid(), name: o.name || 'Proyek Baru', createdAt: Date.now(), updatedAt: Date.now(),
    w, h, fps: o.fps, ratio: o.ratio, resLabel: o.resLabel, bg: o.bg || '#000000',
    markers: [], layers: [], thumb: null, size: 0, dur: 0
  };
};

/* ---------- animasi (keyframe + kurva) ---------- */
ML.A = v => ({ v, k: [] });
ML.evalAnim = (a, t) => {
  const k = a.k;
  if (!k || !k.length) return a.v;
  if (t <= k[0].t) return k[0].v;
  const n = k.length - 1;
  if (t >= k[n].t) return k[n].v;
  let i = 0; while (k[i + 1].t < t) i++;
  const A = k[i], B = k[i + 1];
  if (A.e === 'hold') return A.v;
  const u = (t - A.t) / (B.t - A.t);
  const f = A.e ? ML.cubic(A.e[0], A.e[1], A.e[2], A.e[3])(u) : u;
  return A.v + (B.v - A.v) * f;
};
ML.keyIndexAt = (a, t, eps) => a.k.findIndex(k => Math.abs(k.t - t) <= eps);
ML.addKey = (a, t, v, e) => { a.k.push({ t, v, e: e || null }); a.k.sort((x, y) => x.t - y.t); };
/** Ubah nilai; jika properti sudah beranimasi, tulis ke keyframe di waktu t (buat baru bila belum ada). */
ML.setAnim = (a, t, v, eps) => {
  if (!a.k.length) { a.v = v; return false; }
  const i = ML.keyIndexAt(a, t, eps);
  if (i >= 0) { a.k[i].v = v; return false; }
  ML.addKey(a, t, v); return true; // true = keyframe baru dibuat
};
ML.toggleKey = (a, t, eps, cur) => {
  const i = ML.keyIndexAt(a, t, eps);
  if (i >= 0) { a.k.splice(i, 1); if (!a.k.length) a.v = cur; return false; }
  ML.addKey(a, t, cur); return true;
};

/* ---------- layer ---------- */
ML.fitBox = (mw, mh, proj) => { const s = Math.min(proj.w / mw, proj.h / mh); return [mw * s, mh * s]; };

ML.makeLayer = (proj, type, o = {}) => {
  const L = {
    id: ML.uid(), type, name: o.name || type, mediaId: o.mediaId || null,
    start: o.start || 0, dur: o.dur || +(ML.lsGet('ml.defdur') || 5), trimIn: 0, srcDur: o.srcDur || 0,
    locked: false, hidden: false, muted: false, volume: 100, blend: 'normal',
    bw: o.bw || 0, bh: o.bh || 0,
    p: { x: ML.A(proj.w / 2), y: ML.A(proj.h / 2), sx: ML.A(100), sy: ML.A(100), rot: ML.A(0), op: ML.A(100), skx: ML.A(0), sky: ML.A(0) },
    shadow: { on: false, c: '#000000', a: 60, b: 14, x: 6, y: 8 }, tag: null, fit: null,
    fx: []
  };
  if (type === 'text') {
    L.text = { text: 'Teks', font: 'sans-serif', size: Math.round(Math.min(proj.w, proj.h) * 0.12), color: '#ffffff', bold: true, italic: false, align: 'center', strokeW: 0, strokeColor: '#000000' };
  }
  if (type === 'shape') {
    L.shape = { kind: 'rect', fill: '#6a5cff', radius: 0, strokeW: 0, strokeColor: '#ffffff' };
    L.bw = o.bw || Math.round(Math.min(proj.w, proj.h) * 0.5); L.bh = o.bh || L.bw;
  }
  return L;
};

ML.duration = proj => proj.layers.reduce((m, L) => Math.max(m, L.start + L.dur), 0);

ML.splitLayer = (proj, L, t) => {
  const off = t - L.start;
  if (off < 0.02 || L.dur - off < 0.02) return null;
  const B = ML.clone(L);
  B.id = ML.uid(); B.start = t; B.dur = L.dur - off; B.trimIn = L.trimIn + off;
  const shift = a => {
    if (!a.k.length) return;
    const v0 = ML.evalAnim(a, off);
    const ks = a.k.map(k => ({ t: k.t - off, v: k.v, e: k.e })).filter(k => k.t > 1e-6);
    ks.unshift({ t: 0, v: v0, e: null }); a.k = ks;
  };
  Object.values(B.p).forEach(shift);
  B.fx.forEach(e => { e.id = ML.uid(); Object.values(e.p).forEach(shift); });
  L.dur = off;
  proj.layers.splice(proj.layers.indexOf(L) + 1, 0, B);
  return B;
};

ML.duplicateLayer = (proj, L) => {
  const C = ML.clone(L);
  C.id = ML.uid(); C.name = L.name + ' (salinan)'; C.locked = false;
  C.fx.forEach(e => e.id = ML.uid());
  proj.layers.splice(proj.layers.indexOf(L) + 1, 0, C);
  return C;
};

ML.snapshot = proj => JSON.stringify({ layers: proj.layers, markers: proj.markers, bg: proj.bg, w: proj.w, h: proj.h, fps: proj.fps, ratio: proj.ratio, resLabel: proj.resLabel });
ML.restore = (proj, s) => { const o = JSON.parse(s); proj.layers = o.layers; proj.markers = o.markers; proj.bg = o.bg; if (o.w) { proj.w = o.w; proj.h = o.h; proj.fps = o.fps; proj.ratio = o.ratio; proj.resLabel = o.resLabel; } };

/** proyek lama belum punya skew/bayangan: lengkapi supaya aman */
ML.ensureLayer = L => {
  ['skx', 'sky'].forEach(k => { if (!L.p[k]) L.p[k] = ML.A(0); });
  if (!L.shadow) L.shadow = { on: false, c: '#000000', a: 60, b: 14, x: 6, y: 8 };
  if (L.tag === undefined) L.tag = null;
  return L;
};

/** Sesuaikan / Isi / Regangkan ke area komposisi. nw,nh = ukuran asli media (bila ada). */
ML.fitLayer = (proj, L, mode, nw, nh, keep) => {
  const W = proj.w, H = proj.h; nw = nw || L.bw; nh = nh || L.bh;
  if (!nw || !nh) return false;
  let bw, bh;
  if (mode === 'stretch') { bw = W; bh = H; }
  else { const s = mode === 'fill' ? Math.max(W / nw, H / nh) : Math.min(W / nw, H / nh); bw = nw * s; bh = nh * s; }
  L.bw = bw; L.bh = bh; L.fit = mode;
  const reset = (a, v, keepSign) => { if (!a.k.length) a.v = keepSign ? (a.v < 0 ? -v : v) : v; };
  if (!keep) { reset(L.p.x, W / 2); reset(L.p.y, H / 2); reset(L.p.sx, 100, true); reset(L.p.sy, 100, true); reset(L.p.rot, 0); } // keep: ganti media mempertahankan transformasi
  return true;
};

/** Ubah ukuran komposisi di tengah proyek: posisi (semua keyframe), ukuran layer, teks, border, bayangan ikut diskalakan. */
ML.resizeProject = (proj, nw, nh) => {
  const ow = proj.w, oh = proj.h; if (nw === ow && nh === oh) return;
  const px = nw / ow, py = nh / oh, s = Math.abs(px - py) < 1e-3 ? px : Math.min(px, py);
  const sc = (a, f) => { if (!a) return; a.v *= f; a.k.forEach(k => { k.v *= f; }); };
  for (const L of proj.layers) {
    const full = Math.abs(L.bw - ow) < 1.5 && Math.abs(L.bh - oh) < 1.5;
    sc(L.p.x, px); sc(L.p.y, py); sc(L.p.z, px);
    if (full) { L.bw = nw; L.bh = nh; } else { L.bw *= s; L.bh *= s; }
    if (L.text) { L.text.size = Math.max(4, Math.round(L.text.size * s)); L.text.strokeW *= s; }
    if (L.shape) { L.shape.strokeW *= s; L.shape.radius *= s; }
    if (L.shadow) { L.shadow.b *= s; L.shadow.x *= s; L.shadow.y *= s; }
    (L.fx || []).forEach(e => { if (e.type === 'randdispv2') sc(e.p.mag, s); if (e.type === 'wavev2') sc(e.p.m1, s); });
  }
  proj.w = nw; proj.h = nh;
  for (const L of proj.layers) { const it = ML.media && ML.media.items.get(L.mediaId); if (L.fit && it && it.w) ML.fitLayer(proj, L, L.fit, it.w, it.h, true); }
};

/** geometri layer pada waktu t (koordinat komposisi) */
ML.geom = (L, t) => {
  const lt = t - L.start, v = k => ML.evalAnim(L.p[k], lt), d = Math.PI / 180;
  return { x: v('x'), y: v('y'), sx: v('sx') / 100, sy: v('sy') / 100, rot: v('rot') * d, w: L.bw, h: L.bh, op: v('op') / 100,
    skx: L.p.skx ? v('skx') * d : 0, sky: L.p.sky ? v('sky') * d : 0 };
};
ML.hit = (L, t, px, py) => {
  const g = ML.geom(L, t), dx = px - g.x, dy = py - g.y, c = Math.cos(g.rot), s = Math.sin(g.rot);
  const lx = dx * c + dy * s, ly = -dx * s + dy * c;
  return Math.abs(lx) <= Math.abs(g.w * g.sx) / 2 && Math.abs(ly) <= Math.abs(g.h * g.sy) / 2;
};
})();

