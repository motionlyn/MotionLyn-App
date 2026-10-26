'use strict';
/* Renderer: menggambar layer (transform, opacity, blend) + rantai efek + motion blur ke canvas 2D */
(function () {
const mkCv = () => document.createElement('canvas');
const BLEND = {}; ML.BLENDS.forEach(b => BLEND[b[0]] = b[2]);

function shapePath(sh, w, h) {
  if (sh.am && ML.amShapePath) { const q = ML.amShapePath(sh, w, h); if (q) return q; }
  const p = new Path2D(), x = -w / 2, y = -h / 2;
  if (sh.kind === 'ellipse') p.ellipse(0, 0, Math.abs(w) / 2, Math.abs(h) / 2, 0, 0, Math.PI * 2);
  else if (sh.kind === 'triangle') { p.moveTo(0, y); p.lineTo(w / 2, h / 2); p.lineTo(-w / 2, h / 2); p.closePath(); }
  else if (sh.kind === 'star') {
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.42 : 1;
      const px = Math.cos(a) * w / 2 * r, py = Math.sin(a) * h / 2 * r;
      i ? p.lineTo(px, py) : p.moveTo(px, py);
    }
    p.closePath();
  } else {
    const r = Math.min(sh.radius || 0, Math.abs(w) / 2, Math.abs(h) / 2);
    if (r > 0) { p.moveTo(x + r, y); p.arcTo(x + w, y, x + w, y + h, r); p.arcTo(x + w, y + h, x, y + h, r); p.arcTo(x, y + h, x, y, r); p.arcTo(x, y, x + w, y, r); p.closePath(); }
    else p.rect(x, y, w, h);
  }
  return p;
}

const textCache = new WeakMap();
ML.textCanvas = function (L) {
  const t = L.text, key = JSON.stringify(t), c = textCache.get(L);
  if (c && c.key === key) return c.cv;
  const font = `${t.italic ? 'italic ' : ''}${t.bold ? 'bold ' : ''}${t.size}px ${t.font}`;
  const m = mkCv().getContext('2d'); m.font = font;
  const lines = String(t.text).split('\n'), lh = t.size * 1.25;
  let w = 0; lines.forEach(l => w = Math.max(w, m.measureText(l).width));
  const pad = Math.ceil(t.size * 0.15 + t.strokeW);
  const cv = mkCv(); cv.width = Math.max(2, Math.ceil(w + pad * 2)); cv.height = Math.max(2, Math.ceil(lh * lines.length + pad * 2));
  const x = cv.getContext('2d'); x.font = font; x.textBaseline = 'middle'; x.textAlign = t.align; x.lineJoin = 'round';
  const ax = t.align === 'left' ? pad : t.align === 'right' ? cv.width - pad : cv.width / 2;
  lines.forEach((l, i) => {
    const y = pad + lh * (i + .5);
    if (t.strokeW > 0) { x.lineWidth = t.strokeW * 2; x.strokeStyle = t.strokeColor; x.strokeText(l, ax, y); }
    if (!t.noFill) { x.fillStyle = t.color; x.fillText(l, ax, y); }
  });
  textCache.set(L, { key, cv }); L.bw = cv.width; L.bh = cv.height;
  return cv;
};

ML.Renderer = class {
  constructor(fx) { this.fx = fx || new ML.FX(); this.ownFx = !fx; this.lc = mkCv(); this.ac = mkCv(); this.maxSamples = 6; }
  dispose() { if (this.ownFx) this.fx.dispose(); if (this.sr) this.sr.dispose(); }
  size(W, H) { [this.lc, this.ac].forEach(c => { if (c.width !== W || c.height !== H) { c.width = W; c.height = H; } }); }

  render(target, proj, t, opts = {}) {
    const W = target.width, H = target.height, s = W / proj.w;
    this.size(W, H); this.maxSamples = opts.maxSamples || 6;
    const ctx = target.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    if (proj.bg === 'transparent') { ctx.clearRect(0, 0, W, H); if (opts.checker || ML.exportChecker) ML.drawChecker(ctx, W, H); } else { ctx.fillStyle = proj.bg; ctx.fillRect(0, 0, W, H); }
    const rg = opts.rootGid || null; // layer ber-gid dirender di dalam grupnya; rootGid = grup yang sedang dirender / dibuka di editor
    // MASK: bila ada layer bermode mask dan latar tidak transparan, tumpukan layer digambar di kanvas transparan dulu agar mask tidak ikut menghapus latar
    const useStack = proj.bg !== 'transparent' && proj.layers.some(L => (L.gid || null) === rg && !L.hidden && /^mask_/.test(L.blend || ''));
    let dc = ctx, sk = null;
    if (useStack) { sk = this.sk || (this.sk = mkCv()); if (sk.width !== W || sk.height !== H) { sk.width = W; sk.height = H; } dc = sk.getContext('2d'); dc.setTransform(1, 0, 0, 1, 0, 0); dc.globalAlpha = 1; dc.globalCompositeOperation = 'source-over'; dc.clearRect(0, 0, W, H); }
    for (const L of proj.layers) {
      if (L.hidden || L.k3 || L.type === 'audio' || (L.gid || null) !== rg || t < L.start || t >= L.start + L.dur) continue;
      this.layer(target, dc, proj, L, t, s);
    }
    if (sk) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.drawImage(sk, 0, 0); }
  }

  /** matriks layer (px kanvas) + ukuran layer, dipakai efek yang butuh batas layer (Ubin V3) */
  fxGeo(L, tt, s) {
    const g = ML.geom(L, tt), c = Math.cos(g.rot), n = Math.sin(g.rot), kx = Math.tan(g.skx || 0), ky = Math.tan(g.sky || 0), sx = g.sx * s, sy = g.sy * s;
    let V = [0, 0, 0, 0];
    try { const P = ML.player && ML.player.proj, fp = (P && P.fps) || 30, g0 = ML.geom(L, tt - 1 / fp); V = [(g.x - g0.x) * s, (g.y - g0.y) * s, ((g.sx + g.sy) - (g0.sx + g0.sy)) / 2, (g.rot - g0.rot) * 180 / Math.PI]; } catch (e) { /* tanpa kecepatan */ }
    return { A: [c * sx - n * ky * sx, n * sx + c * ky * sx, c * kx * sy - n * sy, n * kx * sy + c * sy], T: [g.x * s, g.y * s], Z: [Math.max(1, g.w || 1), Math.max(1, g.h || 1)], V };
  }

  /** v3.85: render isi layer UTUH di ruang-layer (tanpa terpotong layar) untuk efek Tiles; titik tengah memperhitungkan anchor.
   *  Hasil: geo.ls (kanvas) + geo.lsT (pusat kotak layer di layar). Dilewati bila layer berputar 3D (pakai jalur layar biasa). */
  layerSpaceSrc(proj, L, lt, s, vals, geo) {
    const g = ML.geom(L, L.start + lt), bw = Math.abs(L.bw || 0), bh = Math.abs(L.bh || 0);
    if (!(bw > 0 && bh > 0) || g.rx3 || g.ry3) return;
    const zoom = Math.max(1, +(vals && vals.scale) || 1);
    const q = Math.min(4, 2048 / Math.max(bw, bh), Math.max(.2, s * Math.max(Math.abs(g.sx), Math.abs(g.sy)) * zoom)), cw = Math.max(2, Math.ceil(bw * q)), ch = Math.max(2, Math.ceil(bh * q));
    const cv = this.lsc || (this.lsc = mkCv()); if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
    const tx = cv.getContext('2d'); tx.setTransform(1, 0, 0, 1, 0, 0); tx.globalAlpha = 1; tx.globalCompositeOperation = 'source-over'; tx.clearRect(0, 0, cw, ch);
    tx.setTransform(cw / bw, 0, 0, ch / bh, cw / 2, ch / 2);
    const sa = ML.fxAdj; try { this.content(tx, proj, L, lt, s, true); } finally { ML.fxAdj = sa; tx.setTransform(1, 0, 0, 1, 0, 0); }
    const A = geo.A, ax = g.ax || 0, ay = g.ay || 0;
    geo.ls = cv; geo.lsT = [geo.T[0] - (A[0] * ax + A[2] * ay), geo.T[1] - (A[1] * ax + A[3] * ay)];
  }

  vals(e, lt) { const o = {}; for (const k in e.p) o[k] = ML.evalAnim(e.p[k], lt); return o; }

  layer(target, ctx, proj, L, t, s) {
    const W = target.width, H = target.height;
    const on = this.fx.ok ? L.fx.filter(e => e.on && ML.FXDEF[e.type]) : [];
    const mb = on.find(e => e.type === 'motionblur');
    const chain = on.filter(e => !ML.FXDEF[e.type].special), propFx = on.filter(e => ML.FXDEF[e.type].prop);
    const lt = t - L.start, op = ML.clamp(ML.evalAnim(L.p.op, lt) / 100, 0, 1);
    if (op <= 0) return;
    const blend = BLEND[L.blend] || 'source-over';

    const renderAt = (tt, out, alpha, mode) => {
      const ltt = tt - L.start, adj = propFx.length ? ML.xmlAdj(propFx, L, ltt, proj, tt) : null;
      ML.fxAdj = adj; ML.fxCtx = { L, proj, tt };
      try {
        out.globalAlpha = alpha * (adj ? adj.alpha : 1); out.globalCompositeOperation = mode;
        if (!chain.length) this.content(out, proj, L, ltt, s);
        else {
          const lc = this.lc.getContext('2d');
          lc.setTransform(1, 0, 0, 1, 0, 0); lc.globalAlpha = 1; lc.globalCompositeOperation = 'source-over'; lc.clearRect(0, 0, W, H);
          this.content(lc, proj, L, ltt, s);
          const passes = chain.map(e => ({ type: e.type, vals: this.vals(e, ltt) }));
          const geo = this.fxGeo(L, tt, s), d0 = ML.FXDEF[chain[0].type];
          if (d0.layerSpace && !L.k3) this.layerSpaceSrc(proj, L, ltt, s, passes[0].vals, geo);
          out.drawImage(this.fx.run(this.lc, target, passes, ltt, geo), 0, 0);
        }
      } finally { ML.fxAdj = null; ML.fxCtx = null; }
      out.globalAlpha = 1; out.globalCompositeOperation = 'source-over';
    };

    if (mb) {
      const n = Math.max(2, Math.min(Math.round(ML.evalAnim(mb.p.samples, lt)), this.maxSamples));
      const exposure = ML.evalAnim(mb.p.shutter, lt) / 360 / proj.fps;
      const a = this.ac.getContext('2d');
      a.setTransform(1, 0, 0, 1, 0, 0); a.globalAlpha = 1; a.globalCompositeOperation = 'source-over'; a.clearRect(0, 0, W, H);
      for (let i = 0; i < n; i++) renderAt(t + (i / (n - 1) - 0.5) * exposure, a, 1 / (i + 1), 'source-over');
      ctx.globalAlpha = op; ctx.globalCompositeOperation = blend; ctx.drawImage(this.ac, 0, 0);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    } else renderAt(t, ctx, op, blend);
  }

  /** LAYER GRUP: isi grup (layer ber-gid sama) dirender terisolasi ke kanvas sebesar scene grup, lalu kanvas itu digambar sebagai satu layer.
   *  Blend/mask layer di dalam grup hanya memengaruhi isi grup itu. */
  groupCanvas(proj, L, tt, s, g) {
    const ids = new Set([L.id]); let grew = true; // seluruh keturunan grup (anak, cucu, ...), supaya grup di dalam grup ikut terisi
    while (grew) { grew = false; for (const k of proj.layers) if (k.gid && ids.has(k.gid) && !ids.has(k.id)) { ids.add(k.id); grew = true; } }
    ids.delete(L.id);
    const kids = proj.layers.filter(k => ids.has(k.id)), iw = Math.max(1, L.bw || 1), ih = Math.max(1, L.bh || 1);
    if (!kids.length) return null;
    const q = Math.min(2, Math.max(0.1, s * Math.max(Math.abs(g.sx || 1), Math.abs(g.sy || 1))), 2048 / Math.max(iw, ih));
    const cw = Math.max(2, Math.round(iw * q)), ch = Math.max(2, Math.round(ih * q));
    const gm = this.gcv || (this.gcv = new WeakMap()); let cv = gm.get(L); if (!cv) { cv = mkCv(); gm.set(L, cv); }
    if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
    const sub = { w: iw, h: ih, fps: proj.fps, dur: proj.dur, bg: 'transparent', layers: kids };
    const r = this.sr || (this.sr = new ML.Renderer(this.fx)), sa = ML.fxAdj, sc = ML.fxCtx;
    try { r.render(cv, sub, tt, { maxSamples: this.maxSamples, rootGid: L.id }); } finally { ML.fxAdj = sa; ML.fxCtx = sc; }
    return cv;
  }

  /** gambar isi layer (tanpa efek) dengan transform pada waktu-lokal lt */
  /** putar 3D sungguhan: isi layer digambar ke kanvas sementara lalu di-warp (mesh segitiga) dengan proyeksi perspektif */
  content3d(ctx, proj, L, lt, s, g) {
    const bw = L.bw, bh = L.bh; if (!bw || !bh) return;
    const q = Math.min(3, 2048 / Math.max(bw, bh), Math.max(.2, s * Math.max(Math.abs(g.sx), Math.abs(g.sy)))), cw = Math.max(2, Math.ceil(bw * q)), ch = Math.max(2, Math.ceil(bh * q));
    const tc = this.t3 || (this.t3 = document.createElement('canvas')); if (tc.width !== cw || tc.height !== ch) { tc.width = cw; tc.height = ch; }
    const tx = tc.getContext('2d'); tx.setTransform(1, 0, 0, 1, 0, 0); tx.globalAlpha = 1; tx.globalCompositeOperation = 'source-over'; tx.clearRect(0, 0, cw, ch);
    tx.setTransform(cw / bw, 0, 0, ch / bh, cw / 2, ch / 2); this.content(tx, proj, L, lt, s, true); tx.setTransform(1, 0, 0, 1, 0, 0);
    const oc = this.t3o || (this.t3o = document.createElement('canvas')), W = ctx.canvas.width, H = ctx.canvas.height; if (oc.width !== W || oc.height !== H) { oc.width = W; oc.height = H; }
    const o = oc.getContext('2d'); o.setTransform(1, 0, 0, 1, 0, 0); o.clearRect(0, 0, W, H); o.imageSmoothingQuality = 'medium';
    const N = 8, f = proj.w, cr = Math.cos(g.rot), sr = Math.sin(g.rot), cX = Math.cos(g.rx3), sX = Math.sin(g.rx3), cY = Math.cos(g.ry3), sY = Math.sin(g.ry3);
    const pts = [];
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const lx = (i / N - .5) * bw * g.sx, ly = (j / N - .5) * bh * g.sy, y1 = ly * cX, z1 = ly * sX, x2 = lx * cY + z1 * sY, z2 = -lx * sY + z1 * cY, den = f + z2;
      if (den < f * .05) { pts.push(null); continue; }
      const k = f / den, px = x2 * k, py = y1 * k; pts.push([(g.x + px * cr - py * sr) * s, (g.y + px * sr + py * cr) * s]);
    }
    const tri = (s0, s1, s2, d0, d1, d2, bx, by, bwid, bhei) => {
      const dx1 = s1[0] - s0[0], dy1 = s1[1] - s0[1], dx2 = s2[0] - s0[0], dy2 = s2[1] - s0[1], det = dx1 * dy2 - dx2 * dy1; if (!det) return;
      const ex1 = d1[0] - d0[0], ey1 = d1[1] - d0[1], ex2 = d2[0] - d0[0], ey2 = d2[1] - d0[1];
      const a = (ex1 * dy2 - ex2 * dy1) / det, b = (ey1 * dy2 - ey2 * dy1) / det, c = (ex2 * dx1 - ex1 * dx2) / det, d = (ey2 * dx1 - ey1 * dx2) / det;
      const e = d0[0] - a * s0[0] - c * s0[1], f2 = d0[1] - b * s0[0] - d * s0[1], mx = (d0[0] + d1[0] + d2[0]) / 3, my = (d0[1] + d1[1] + d2[1]) / 3;
      const ex = p => { const vx = p[0] - mx, vy = p[1] - my, l = Math.hypot(vx, vy) || 1; return [p[0] + vx / l * .7, p[1] + vy / l * .7]; };
      const A = ex(d0), B = ex(d1), C = ex(d2);
      o.save(); o.beginPath(); o.moveTo(A[0], A[1]); o.lineTo(B[0], B[1]); o.lineTo(C[0], C[1]); o.closePath(); o.clip();
      o.transform(a, b, c, d, e, f2); o.drawImage(tc, bx, by, bwid, bhei, bx, by, bwid, bhei); o.restore();
    };
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const P0 = pts[j * (N + 1) + i], P1 = pts[j * (N + 1) + i + 1], P2 = pts[(j + 1) * (N + 1) + i + 1], P3 = pts[(j + 1) * (N + 1) + i]; if (!P0 || !P1 || !P2 || !P3) continue;
      const x0 = i * cw / N, y0 = j * ch / N, x1 = (i + 1) * cw / N, y1 = (j + 1) * ch / N;
      const bx = Math.max(0, Math.floor(x0) - 1), by = Math.max(0, Math.floor(y0) - 1), bwid = Math.min(cw - bx, Math.ceil(x1 - x0) + 3), bhei = Math.min(ch - by, Math.ceil(y1 - y0) + 3);
      tri([x0, y0], [x1, y0], [x1, y1], P0, P1, P2, bx, by, bwid, bhei); tri([x0, y0], [x1, y1], [x0, y1], P0, P2, P3, bx, by, bwid, bhei);
    }
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(oc, 0, 0); ctx.restore();
  }

  content(ctx, proj, L, lt, s, raw) {
    const g = ML.geom(L, L.start + lt);
    if (!raw && (g.rx3 || g.ry3) && !L.k3) { this.content3d(ctx, proj, L, lt, s, g); return; }
    ctx.save();
    if (!raw) {
      ctx.translate(g.x * s, g.y * s); ctx.rotate(g.rot);
      if (g.skx || g.sky) ctx.transform(1, Math.tan(g.sky), Math.tan(g.skx), 1, 0, 0);
      ctx.scale(g.sx * s, g.sy * s);
      if (g.ax || g.ay) ctx.translate(-g.ax, -g.ay);
    }
    ctx.imageSmoothingQuality = 'medium';
    const sd = raw ? null : L.shadow;
    if (sd && sd.on) {
      const n = parseInt(String(sd.c).slice(1), 16) || 0;
      ctx.shadowColor = 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + (sd.a / 100) + ')';
      ctx.shadowBlur = sd.b * s; ctx.shadowOffsetX = sd.x * s; ctx.shadowOffsetY = sd.y * s;
    }
    if (L.ph3) { const c = ML.photo3dCanvas(L, lt); if (c) ctx.drawImage(c, -L.bw / 2, -L.bh / 2, L.bw, L.bh); }
    else if (L.type === 'image') { const im = ML.media.image(L); if (im) { if (L.frame) { ctx.beginPath(); ctx.rect(-L.frame.w / 2, -L.frame.h / 2, L.frame.w, L.frame.h); ctx.clip(); } ctx.drawImage(im, -L.bw / 2, -L.bh / 2, L.bw, L.bh); } }
    else if (L.type === 'video') {
      const v = ML.media.el(L);
      if (v && v.readyState >= 2 && v.videoWidth) { if (L.frame) { ctx.beginPath(); ctx.rect(-L.frame.w / 2, -L.frame.h / 2, L.frame.w, L.frame.h); ctx.clip(); } ctx.drawImage(v, -L.bw / 2, -L.bh / 2, L.bw, L.bh); }
    } else if (L.type === 'text') { const c = ML.textCanvas(L); ctx.drawImage(c, -c.width / 2, -c.height / 2); }
    else if (L.type === 'group') { const c = this.groupCanvas(proj, L, lt + L.start, s, g); if (c) ctx.drawImage(c, -L.bw / 2, -L.bh / 2, L.bw, L.bh); }
    else if (L.glb) { const c = ML.glbCanvas(L, lt); if (c) ctx.drawImage(c, -L.bw / 2, -L.bh / 2, L.bw, L.bh); }
    else if (L.type === 'shape') {
      const sh = L.shape, p = shapePath(sh, L.bw, L.bh);
      if (!sh.noFill) {
        const fm = sh.fillMedia, it = fm && ML.media.items.get(fm.mediaId), im = it && it.img; let drawn = false;
        if (im && (im.complete !== false) && (it.w || im.width)) { // isi bentuk dengan foto: dipotong mengikuti bentuk, bentuk tidak berubah
          try {
            const iw = it.w || im.width, ih = it.h || im.height, bw = Math.abs(L.bw) || 1, bh = Math.abs(L.bh) || 1, mode = fm.mode || 'fill';
            let dw = bw, dh = bh; if (mode !== 'stretch') { const k = (mode === 'fit' ? Math.min : Math.max)(bw / iw, bh / ih); dw = iw * k; dh = ih * k; }
            ctx.save(); ctx.clip(p); ctx.drawImage(im, -dw / 2 + (fm.ox || 0), -dh / 2 + (fm.oy || 0), dw, dh); ctx.restore(); drawn = true;
          } catch (e) { try { ctx.restore(); } catch (x) { /* abaikan */ } }
        }
        if (!drawn) { ctx.fillStyle = sh.fill; ctx.fill(p); }
      }
      if (sh.strokeW > 0) { ctx.lineWidth = sh.strokeW; ctx.strokeStyle = sh.strokeColor; ctx.lineJoin = 'round'; ctx.stroke(p); }
    }
    ctx.restore();
  }
};
})();

