'use strict';
/* Ekspor / impor proyek XML format Alight Motion (AM).
   Struktur mengikuti contoh ekspor AM: <scene> > <media>, <bookmark>, <audio>, <shape>, <text>, <nullobj>;
   <transform> (location/scale/rotation/opacity, keyframe t = pecahan 0..1 dari durasi layer),
   <effect id="com.alightcreative.effects.*"> + <property>. Efek XML dibaca dari engine efek (23-xml-engine.js),
   jadi id & nama parameter sama persis dengan Alight Motion.
   Keyframe AM: atribut e pada sebuah kf = kurva segmen yang MASUK ke kf itu; MotionLyn menyimpan kurva di kf awal segmen. */
(function () {
/* Skala: di MotionLyn 100% = 1.0 di AM dikali SCALE_K (AM 1.0 tampil setengah di MotionLyn, jadi impor x2 dan ekspor /2). */
const SCALE_K = 2;
/* nama blending AM -> id blend MotionLyn */
const BLEND_MAP = { exclude: 'exclusion', exclusion: 'exclusion', darken: 'darken', lighten: 'lighten', screen: 'screen', multiply: 'multiply', overlay: 'overlay', add: 'add', difference: 'difference', colordodge: 'colordodge', colorburn: 'colorburn', hardlight: 'hardlight', softlight: 'softlight', hue: 'hue', saturation: 'saturation', color: 'color', luminosity: 'luminosity', normal: 'normal' };
const AMVER = { amver: '1028425', ffver: '106', am: 'com.alightcreative.motion/5.0.273.1028425' };
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const f6 = n => (isFinite(n) ? +n : 0).toFixed(6);
const num = (v, d) => { const n = parseFloat(v); return isFinite(n) ? n : d; };
const nums = s => String(s == null ? '' : s).split(',').map(x => parseFloat(x)).filter(x => isFinite(x));
const hex2 = n => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
const amColor = (hex, a) => '#' + hex2(a == null ? 255 : a) + String(hex || '#000000').replace('#', '').padStart(6, '0').slice(0, 6);
const parseColor = s => { let h = String(s || '').replace('#', ''); if (h.length === 6) h = 'ff' + h; if (h.length !== 8) return { r: 255, g: 255, b: 255, a: 255 }; const [a, r, g, b] = [0, 2, 4, 6].map(i => parseInt(h.substr(i, 2), 16)); return { r, g, b, a }; };
const hexOf = c => '#' + hex2(c.r) + hex2(c.g) + hex2(c.b);

/* ---- kurva: easing MotionLyn <-> cubicBezier AM ---- */
const BZ = { Sine: { In: [.12, 0, .39, 0], InOut: [.37, 0, .63, 1] }, Quad: { In: [.11, 0, .5, 0], InOut: [.45, 0, .55, 1] }, Cubic: { In: [.32, 0, .67, 0], InOut: [.65, 0, .35, 1] },
  Quart: { In: [.5, 0, .75, 0], InOut: [.76, 0, .24, 1] }, Quint: { In: [.64, 0, .78, 0], InOut: [.83, 0, .17, 1] }, Expo: { In: [.7, 0, .84, 0], InOut: [.87, 0, .13, 1] },
  Circ: { In: [.55, 0, 1, .45], InOut: [.85, 0, .15, 1] }, Back: { In: [.36, 0, .66, -.56], InOut: [.68, -.6, .32, 1.6] } };
function easeToBezier(e) {
  if (!e || e === 'hold') return null;
  if (Array.isArray(e)) return e;
  const m = /^(\w+) (In|Out|InOut)$/.exec(e); if (!m || !BZ[m[1]]) return null;
  const b = BZ[m[1]][m[2] === 'Out' ? 'In' : m[2]]; if (!b) return null;
  return m[2] === 'Out' ? [1 - b[2], 1 - b[3], 1 - b[0], 1 - b[1]] : b;
}
const bzn = v => (Number.isInteger(+v) ? (+v).toFixed(1) : String(+(+v).toFixed(8)));
const bezStr = b => 'cubicBezier ' + b.map(bzn).join(' ');
const parseBez = s => { const m = /^(?:local\s+)?cubicBezier\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)$/.exec(String(s || '').trim()); return m && m.slice(1).every(x => isFinite(+x)) ? [+m[1], +m[2], +m[3], +m[4]] : null; };

/* ---- animasi -> XML ---- */
/** anims: daftar ML.A (komponen), fmt(values[])->string. Mengembalikan {value} atau {kfs:[{t,v,e}]} */
function animOut(anims, dur, fmt) {
  const times = new Set(); anims.forEach(a => (a.k || []).forEach(k => times.add(+k.t.toFixed(5))));
  if (!times.size) return { value: fmt(anims.map(a => a.v)) };
  const ts = [...times].sort((a, b) => a - b), kfs = [];
  ts.forEach((t, i) => {
    let e = null;
    if (i > 0) { // kurva segmen masuk = kurva yang tersimpan di kf sebelumnya
      for (const a of anims) { const k = (a.k || []).find(q => Math.abs(q.t - ts[i - 1]) < 1e-5); if (k && k.e) { e = easeToBezier(k.e); if (e) break; } }
    }
    kfs.push({ t: dur > 0 ? t / dur : 0, v: fmt(anims.map(a => ML.evalAnim(a, t))), e });
  });
  return { kfs };
}
function kfXml(kfs, ind) { return kfs.map(k => ind + '<kf t="' + f6(k.t) + '" v="' + esc(k.v) + '"' + (k.e ? ' e="' + bezStr(k.e) + '"' : '') + ' />').join('\r\n'); }

/* ---- XML -> animasi ---- */
/** el: elemen dengan atribut value ATAU anak <kf>. conv(str)->[komponen]; n = jumlah komponen. Kembalikan array ML.A per komponen. */
function animIn(el, dur, conv, n, defs) {
  const out = Array.from({ length: n }, (_, i) => ML.A(defs ? defs[i] : 0));
  if (!el) return out;
  const kids = [...el.children].filter(c => c.nodeName === 'kf');
  if (!kids.length) { const v = conv(el.getAttribute('value')); if (v) v.forEach((x, i) => { if (i < n) out[i].v = x; }); return out; }
  const list = kids.map(k => ({ t: num(k.getAttribute('t'), 0) * dur, v: conv(k.getAttribute('v')), e: parseBez(k.getAttribute('e')) })).filter(k => k.v).sort((a, b) => a.t - b.t);
  const seen = []; list.forEach(k => { if (!seen.length || k.t - seen[seen.length - 1].t > 1e-6) seen.push(k); });
  out.forEach((a, c) => {
    a.v = seen.length ? seen[0].v[c] : a.v;
    a.k = seen.map((k, i) => ({ t: k.t, v: k.v[c] == null ? a.v : k.v[c], e: i + 1 < seen.length ? seen[i + 1].e : null }));
    if (a.k.length === 1) { a.v = a.k[0].v; a.k = []; }
  });
  return out;
}
const vec = s => { const v = nums(s); return v.length ? v : null; };
const one = s => { const v = nums(s); return v.length ? [v[0]] : null; };
const colConv = s => { const c = parseColor(s); return [c.r, c.g, c.b, c.a]; };

/* ---- peta id efek AM <-> kunci efek MotionLyn ---- */
const revFx = () => { const r = {}; for (const id in (ML.XML_ID || {})) r[ML.XML_ID[id]] = id; return r; };
const mimeOf = it => it.mime || (it.kind === 'image' ? 'image/png' : it.kind === 'video' ? 'video/mp4' : 'audio/mpeg');
const FONT_TO_AM = { 'sans-serif': 'Roboto', serif: 'Merriweather', monospace: 'Roboto Mono', cursive: 'Lora', fantasy: 'Montserrat' };
const SERIF = /merriweather|lora|playfair|serif|slab/i, MONO = /mono/i;
const SHAPE_TO_AM = { rect: '.rect', ellipse: '.circle', triangle: '.triangle', star: '.star' };
const AM_TO_SHAPE = { rect: 'rect', circle: 'ellipse', ellipse: 'ellipse', triangle: 'triangle', star: 'star' };
const rid = (used) => { let n; do { n = 100000000 + Math.floor(Math.random() * 899999999); } while (used.has(n)); used.add(n); return String(n); };

/* ---- efek bawaan MotionLyn -> efek Alight Motion (id + parameter). Kunci = kunci ML.FXDEF; tanda ~ = pendekatan (bukan 1:1). ---- */
const sc = (a, f) => { const c = JSON.parse(JSON.stringify(a)); c.v *= f; (c.k || []).forEach(k => { k.v *= f; }); return c; };
const ev0 = a => ML.evalAnim(a, 0);
const F = (n, a) => ({ n, t: 'float', a: [a] }), B = (n, v) => ({ n, t: 'bool', v: !!v }), N = (n, v) => ({ n, t: 'int', v: Math.round(v) }), C = (n, r, g, b) => ({ n, t: 'color', a: [r, g, b] });
const FXA = 'com.alightcreative.effects.';
const NATIVE = {
  tiles3: [FXA + 'tile', A => [F('scale', A('crop')), F('phase', A('off')), B('mirror', ev0(A('mirror')) > .5), B('vertoffs', false), F('angle', ML.A(0))]],
  oscillate: [FXA + 'oscillate3', A => [N('direction', 0), F('angle', A('angle')), F('freq', A('freq')), F('mag', A('amp')), N('type', 0), F('phase', A('phase'))], '~'],
  swing: [FXA + 'swing2', A => [F('freq', A('freq')), F('a1', sc(A('amp'), -1)), F('a2', A('amp')), F('phase', A('phase')), N('type', 0)], '~'],
  swingv2: [FXA + 'swing2', A => [F('freq', A('freq')), F('a1', A('a1')), F('a2', A('a2')), F('phase', A('phase')), N('type', ev0(A('type')))]],
  motionblur: [FXA + 'motionblur4', A => [F('tune', sc(A('shutter'), 1 / 360)), B('usePos', true), B('useScale', true), B('useAngle', true)], '~'],
  lumakeyv2: [FXA + 'lumakey3', A => [F('lowThreshold', sc(A('low'), .01)), F('highThreshold', sc(A('high'), .01)), F('feather', sc(A('feather'), .01)), B('invert', ev0(A('invert')) > .5), B('weighted', ev0(A('weighted')) > .5)]],
  lensblur: [FXA + 'lensblur2', A => [F('strength', sc(A('strength'), .01)), F('radius', sc(A('radius'), .01))], '~'],
  exposurev2: [FXA + 'exposure', A => [F('exposure', A('exposure')), F('gamma', A('gamma')), F('offset', A('offset'))]],
  expgamma: [FXA + 'exposure', A => [F('exposure', A('exp')), F('gamma', A('gamma')), F('offset', sc(A('off'), .01))]],
  wavev2: [FXA + 'wavewarp2', A => [F('phase', A('phase')), F('a1d', A('a1d')), F('m1', A('m1')), F('m2', A('m2')), F('a2d', A('a2d')), F('damping', sc(A('damping'), .01)), F('dampingSpace', ML.A(0)), F('dampingOrigin', sc(A('dorigin'), .01)), B('screenSpace', ev0(A('screen')) > .5)], '~'],
  squeeze: [FXA + 'squeeze', A => [F('strength', sc(A('amt'), .01)), F('radius', sc(A('rad'), .01))], '~'],
  blink: [FXA + 'blink', A => [F('freq', A('freq'))], '~'],
  spin: [FXA + 'spin', A => [F('rpm', A('rpm'))]],
  chromav2: [FXA + 'chromakey', A => [C('keyColor', A('kr'), A('kg'), A('kb')), F('threshold', sc(A('threshold'), .01)), F('feather', sc(A('feather'), .01)), B('defringe', ev0(A('defringe')) > .5), B('invert', ev0(A('invert')) > .5)]],
  gradoverlay: [FXA + 'gradientoverlay2', A => [C('color1', A('pr'), A('pg'), A('pb')), C('color2', A('qr'), A('qg'), A('qb')), F('angle', A('angle')), F('scale', sc(A('scale'), .01)), F('alpha', sc(A('alpha'), .01)), N('gradType', ev0(A('gtype')))], '~']
};
ML.AM_NATIVE_FX = NATIVE;

/* ================= EKSPOR ================= */
async function build(proj, opts = {}) {
  const rep = { layers: 0, skipped: [], fxSkipped: [], fxApprox: [], media: [] };
  const rev = revFx(), used = new Set(), uniq = new Set();
  const recs = new Map((await ML.db.mediaOf(proj.id)).map(m => [m.id, m]));
  const fileOf = new Map(); // mediaId -> nama file unik
  const phMedia = new Map(); // slot kosong hasil impor: alamat media asli dipertahankan supaya Alight Motion bisa menautkan ulang
  const nameFor = id => {
    if (fileOf.has(id)) return fileOf.get(id);
    const m = recs.get(id); if (!m) return null;
    let n = (m.name || id).replace(/[\\/:*?"<>|]+/g, '_'), base = n, i = 1;
    while (uniq.has(n.toLowerCase())) { const dot = base.lastIndexOf('.'); n = dot > 0 ? base.slice(0, dot) + '_' + (i++) + base.slice(dot) : base + '_' + (i++); }
    uniq.add(n.toLowerCase()); fileOf.set(id, n); return n;
  };
  const uriOf = id => 'file:///storage/emulated/0/MotionLyn/' + encodeURI(nameFor(id));
  const ms = s => Math.round(s * 1000);
  const total = ms(ML.duration(proj));
  const L = [];
  const push = s => L.push(s);

  const body = []; // elemen layer
  const transformXml = (Ly, I) => {
    const o = [], p = Ly.p, dur = Ly.dur;
    const loc = animOut([p.x, p.y], dur, v => f6(v[0]) + ',' + f6(v[1]) + ',0.000000');
    o.push(loc.kfs ? I + '  <location>\r\n' + kfXml(loc.kfs, I + '    ') + '\r\n' + I + '  </location>' : I + '  <location value="' + loc.value + '" />');
    const sc = animOut([p.sx, p.sy], dur, v => f6(v[0] / 100 / SCALE_K) + ',' + f6(v[1] / 100 / SCALE_K));
    if (sc.kfs) o.push(I + '  <scale>\r\n' + kfXml(sc.kfs, I + '    ') + '\r\n' + I + '  </scale>');
    else if (Math.abs(p.sx.v / SCALE_K - 100) > 1e-6 || Math.abs(p.sy.v / SCALE_K - 100) > 1e-6) o.push(I + '  <scale value="' + sc.value + '" />');
    const ro = animOut([p.rot], dur, v => f6(v[0]));
    if (ro.kfs) o.push(I + '  <rotation>\r\n' + kfXml(ro.kfs, I + '    ') + '\r\n' + I + '  </rotation>');
    else if (Math.abs(p.rot.v) > 1e-6) o.push(I + '  <rotation value="' + ro.value + '" />');
    const op = animOut([p.op], dur, v => f6(v[0] / 100));
    if (op.kfs) o.push(I + '  <opacity>\r\n' + kfXml(op.kfs, I + '    ') + '\r\n' + I + '  </opacity>');
    else if (Math.abs(p.op.v - 100) > 1e-6) o.push(I + '  <opacity value="' + op.value + '" />');
    return I + '<transform>\r\n' + o.join('\r\n') + '\r\n' + I + '</transform>';
  };
  const propXml = (name, type, anims, dur, fmt, I) => {
    const r = animOut(anims, dur, fmt);
    return r.kfs ? I + '<property name="' + esc(name) + '" type="' + type + '">\r\n' + kfXml(r.kfs, I + '  ') + '\r\n' + I + '</property>'
      : I + '<property name="' + esc(name) + '" type="' + type + '" value="' + esc(r.value) + '" />';
  };
  const effectsXml = (Ly, I) => {
    const out = [];
    for (const e of Ly.fx || []) {
      const d = ML.FXDEF[e.type], nat = NATIVE[e.type], id = rev[e.type] || (nat && nat[0]);
      if (d && nat && !rev[e.type] && e.on !== false) { // efek bawaan MotionLyn yang punya padanan AM
        const Ap = k => e.p[k] || ML.A(0), J2 = I + '  ', pr2 = nat[1](Ap).map(q => q.t === 'float' ? propXml(q.n, 'float', q.a, Ly.dur, v => f6(v[0]), J2)
          : q.t === 'bool' ? J2 + '<property name="' + q.n + '" type="bool" value="' + q.v + '" />' : q.t === 'int' ? J2 + '<property name="' + q.n + '" type="int" value="' + q.v + '" />'
          : propXml(q.n, 'color', q.a, Ly.dur, v => '#ff' + hex2(v[0]) + hex2(v[1]) + hex2(v[2]), J2));
        out.push(I + '<effect id="' + esc(id) + '" locallyApplied="true">\r\n' + pr2.join('\r\n') + '\r\n' + I + '</effect>');
        if (nat[2]) rep.fxApprox.push(d.name.split(' (')[0] + ' — ' + Ly.name);
        continue;
      }
      if (!d || !id) { rep.fxSkipped.push((d ? d.name.split(' (')[0] : e.type) + ' — ' + Ly.name); continue; }
      if (e.on === false) { rep.fxSkipped.push(d.name.split(' (')[0] + ' (nonaktif) — ' + Ly.name); continue; }
      const A = k => e.p[k] || ML.A(0), pr = [], J = I + '  ';
      for (const pm of d.pmap || []) {
        const g = pm.g, dur = Ly.dur;
        if (pm.kind === 'n') pr.push(propXml(pm.id, 'float', [A(g)], dur, v => f6(v[0]), J));
        else if (pm.kind === 'b') pr.push(J + '<property name="' + esc(pm.id) + '" type="bool" value="' + (ML.evalAnim(A(g), 0) > 0.5) + '" />');
        else if (pm.kind === 's') { const ix = Math.max(0, Math.min(pm.values.length - 1, Math.round(ML.evalAnim(A(g), 0)))); pr.push(J + '<property name="' + esc(pm.id) + '" type="int" value="' + pm.values[ix] + '" />'); }
        else if (pm.kind === 'c') pr.push(propXml(pm.id, 'color', pm.alpha ? [A(g + '_r'), A(g + '_g'), A(g + '_b'), A(g + '_a')] : [A(g + '_r'), A(g + '_g'), A(g + '_b')], dur, v => '#' + hex2(v[3] == null ? 255 : v[3]) + hex2(v[0]) + hex2(v[1]) + hex2(v[2]), J));
        else if (pm.kind === 'p') pr.push(propXml(pm.id, 'vec2', [A(g + '_x'), A(g + '_y')], dur, v => f6(v[0]) + ',' + f6(v[1]), J));
        else if (pm.kind === 'h') pr.push(propXml(pm.id, 'vec3', [A(g + '_x'), A(g + '_y'), pm.bias ? A(g + '_z') : ML.A(0)], dur, v => f6(v[0]) + ',' + f6(v[1]) + ',' + f6(v[2]), J));
        else if (pm.kind === 'v3') pr.push(propXml(pm.id, 'vec3', [A(g + '_x'), A(g + '_y'), A(g + '_z')], dur, v => f6(v[0]) + ',' + f6(v[1]) + ',' + f6(v[2]), J));
      }
      out.push(I + '<effect id="' + esc(id) + '" locallyApplied="true">' + (pr.length ? '\r\n' + pr.join('\r\n') + '\r\n' + I : '') + '</effect>');
    }
    return out;
  };

  for (const Ly of proj.layers) {
    ML.ensureLayer(Ly);
    if (Ly.k3 || Ly.glb || Ly.type === '3d') { rep.skipped.push(Ly.name + ' (model 3D)'); continue; }
    const I = '  ', st = ms(Ly.start), en = ms(Ly.start + Ly.dur), idv = rid(used);
    const common = ' id="' + idv + '" label="' + esc(Ly.name) + '"' + (Ly.hidden ? ' hidden="true"' : '') + ' startTime="' + st + '" endTime="' + en + '"';
    if (Ly.ph && Ly.type === 'shape' && Ly.ph.uri) { // slot media kosong: tulis kembali sebagai layer media dengan alamat aslinya
      const ph = Ly.ph, src = esc(ph.uri), inT = ph.inTime > 0 ? ' inTime="' + ms(ph.inTime) + '"' : '', outT = ' outTime="' + ms((ph.inTime || 0) + Ly.dur) + '"'; phMedia.set(ph.uri, ph);
      const cm = ' id="' + idv + '" label="' + esc(ph.label || Ly.name) + '"' + (ph.kind !== 'audio' && Ly.hidden ? ' hidden="true"' : '') + ' startTime="' + st + '" endTime="' + en + '"';
      if (ph.kind === 'audio') { body.push(I + '<audio' + cm + ' src="' + src + '"' + inT + outT + ' mediaFillMode="fill" />'); rep.layers++; continue; }
      const op2 = ph.kind === 'video' ? '<video' + cm + ' src="' + src + '"' + inT + outT + ' mediaFillMode="fill"' : '<shape' + cm + ' fillType="media" fillImage="' + src + '" mediaFillMode="fill" s="' + (ph.keepShape && Ly.shape ? (Ly.shape.am ? '.' + Ly.shape.am.id : SHAPE_TO_AM[Ly.shape.kind] || '.rect') : '.rect') + '"';
      const k2 = [transformXml(Ly, I + '  '), ...effectsXml(Ly, I + '  '), I + '  <property name="size" type="vec2" value="' + f6(Ly.bw) + ',' + f6(Ly.bh) + '" />'];
      body.push(I + op2 + '>\r\n' + k2.join('\r\n') + '\r\n' + I + '</' + op2.slice(1).split(' ')[0] + '>'); rep.layers++; continue;
    }
    if (Ly.type === 'audio') {
      const fn = nameFor(Ly.mediaId); if (!fn) { rep.skipped.push(Ly.name + ' (media tidak ada)'); continue; }
      body.push(I + '<audio id="' + idv + '" label="' + esc(Ly.name) + '" startTime="' + st + '" endTime="' + en + '" src="' + esc(uriOf(Ly.mediaId)) + '"' + (Ly.trimIn > 0 ? ' inTime="' + ms(Ly.trimIn) + '"' : '') + ' outTime="' + ms((Ly.trimIn || 0) + Ly.dur) + '" mediaFillMode="fill" />');
      rep.layers++; continue;
    }
    const kids = [transformXml(Ly, I + '  ')];
    let open;
    if (Ly.type === 'image' || Ly.type === 'video') {
      const fn = nameFor(Ly.mediaId); if (!fn) { rep.skipped.push(Ly.name + ' (media tidak ada)'); continue; }
      if (Ly.type === 'video') open = '<video' + common + ' src="' + esc(uriOf(Ly.mediaId)) + '"' + (Ly.trimIn > 0 ? ' inTime="' + ms(Ly.trimIn) + '"' : '') + ' outTime="' + ms((Ly.trimIn || 0) + Ly.dur) + '" mediaFillMode="fill"';
      else open = '<shape' + common + ' fillType="media" fillImage="' + esc(uriOf(Ly.mediaId)) + '" mediaFillMode="fill" s=".rect"';
    } else if (Ly.type === 'shape') {
      const s = Ly.shape || {}, am = s.am && ML.AM_SHAPES && ML.AM_SHAPES[s.am.id];
      const fmN = s.fillMedia && nameFor(s.fillMedia.mediaId);
      open = '<shape' + common + (fmN ? ' fillType="media" fillImage="' + esc(uriOf(s.fillMedia.mediaId)) + '" mediaFillMode="' + (s.fillMedia.mode || 'fill') + '"' : ' fillType="color" mediaFillMode="fill"') + ' s="' + (am ? '.' + s.am.id : SHAPE_TO_AM[s.kind] || '.rect') + '"';
      kids.push(I + '  <fillColor value="' + amColor(s.fill) + '" />');
      if (s.strokeW > 0) kids.push(I + '  <path-stroke direction="centered" end-size="1.500000">\r\n' + I + '    <size value="' + f6(s.strokeW) + '" />\r\n' + I + '  </path-stroke>');
    } else if (Ly.type === 'text') {
      const t = Ly.text || {}, fam = FONT_TO_AM[t.font] || String(t.font || 'Roboto').split(',')[0].replace(/["']/g, '');
      open = '<text id="' + idv + '" label="' + esc(Ly.name) + '"' + (Ly.hidden ? ' hidden="true"' : '') + ' startTime="' + st + '" endTime="' + en + '" fillType="color" size="' + f6(t.size) + '" font="googlefonts?name=' + esc(fam) + '&amp;weight=' + (t.bold ? 700 : 400) + '" wrapWidth="' + Math.round(proj.w) + '" align="' + (t.align || 'center') + '"';
      kids.push(I + '  <fillColor value="' + amColor(t.color) + '" />');
    } else { rep.skipped.push(Ly.name + ' (jenis ' + Ly.type + ')'); continue; }
    kids.push(...effectsXml(Ly, I + '  '));
    if (Ly.type === 'text') kids.push(I + '  <content>' + esc(Ly.text && Ly.text.text != null ? Ly.text.text : Ly.name) + '</content>');
    if (Ly.type !== 'text') kids.push(I + '  <property name="size" type="vec2" value="' + (Ly.frame && Ly.type === 'image' ? f6(Ly.frame.w) + ',' + f6(Ly.frame.h) : f6(Ly.bw) + ',' + f6(Ly.bh)) + '" />');
    body.push(I + open + '>\r\n' + kids.join('\r\n') + '\r\n' + I + '</' + open.slice(1).split(' ')[0] + '>');
    rep.layers++;
  }

  // daftar media (hanya yang dipakai layer yang tertulis)
  const mediaXml = [];
  for (const [id, fn] of fileOf) {
    const m = recs.get(id), isV = m.kind === 'video', isA = m.kind === 'audio';
    mediaXml.push('  <media uri="' + esc(uriOf(id)) + '" filename="' + esc(fn) + '" title="' + esc(fn) + '" type="' + esc(mimeOf(m)) + '"' + (isV || isA ? ' duration="' + Math.round((m.dur || 0) * 1e6) + '"' : '') + ' size="' + (m.size || 0) + '" orientation="0" infoUpdated="' + Date.now() + '"' + (!isA ? ' width="' + (m.w || 0) + '" height="' + (m.h || 0) + '"' : '') + ' />');
    rep.media.push({ id, file: fn, blob: m.blob });
  }
  phMedia.forEach(ph => {
    const mt = ph.kind === 'video' ? 'video/mp4' : ph.kind === 'audio' ? 'audio/mpeg' : /\.jpe?g$/i.test(ph.file) ? 'image/jpeg' : /\.webp$/i.test(ph.file) ? 'image/webp' : 'image/png';
    mediaXml.push('  <media uri="' + esc(ph.uri) + '" filename="' + esc(ph.file) + '" title="' + esc(ph.file) + '" type="' + mt + '" size="0" orientation="0" infoUpdated="' + Date.now() + '"' + (ph.kind !== 'audio' && ph.w ? ' width="' + ph.w + '" height="' + ph.h + '"' : '') + ' />');
  });
  const d = new Date(), pad = n => String(n).padStart(2, '0');
  const bg = proj.bg === 'transparent' ? '#00000000' : amColor(proj.bg);
  push("<?xml version='1.0' encoding='UTF-8' ?><!--\r\nCreated by MotionLyn (format kompatibel Alight Motion)\r\nExported: " + d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + '\r\n' + AMVER.am + '\r\n-->\r\n');
  push('<scene title="' + esc(proj.name) + '" width="' + proj.w + '" height="' + proj.h + '" exportWidth="' + proj.w + '" exportHeight="' + proj.h + '" precompose="dynamicResolution" bgcolor="' + bg + '" totalTime="' + total + '" fps="' + proj.fps + '" modifiedTime="' + Date.now() + '" amver="' + AMVER.amver + '" ffver="' + AMVER.ffver + '" am="' + AMVER.am + '" amplatform="android" retime="freeze" retimeAdaptFPS="false">\r\n');
  mediaXml.forEach(s => push(s + '\r\n'));
  (proj.markers || []).slice().sort((a, b) => b.t - a.t).forEach(m => push('  <bookmark t="' + ms(m.t) + '" />\r\n'));
  body.forEach(s => push(s + '\r\n'));
  push('</scene>\r\n');
  rep.xml = L.join('');
  return rep;
}

/** Ekspor: 'xml' = hanya .xml; 'zip' = .xml + folder media/ dalam satu .zip */
ML.buildAMXML = build;
ML.exportAMXML = async (proj, mode) => {
  const rep = await build(proj), xmlBlob = new Blob([rep.xml], { type: 'application/xml' });
  let loc;
  if (mode === 'zip') {
    const entries = [{ name: ML.exportFileName(proj, 'xml'), blob: xmlBlob }];
    rep.media.forEach(m => entries.push({ name: 'media/' + m.file, blob: m.blob }));
    loc = await ML.saveBlob(await ML.zip.build(entries), ML.exportFileName(proj, 'zip'), 'application/zip');
  } else {
    try { loc = await ML.saveBlob(xmlBlob, ML.exportFileName(proj, 'xml'), 'application/xml'); }
    catch (e) { if (!/tidak diizinkan/.test(e.message)) throw e; loc = await ML.saveBlob(await ML.zip.build([{ name: ML.exportFileName(proj, 'xml'), blob: xmlBlob }]), ML.exportFileName(proj, 'zip'), 'application/zip'); }
  }
  rep.loc = loc; return rep;
};

/** Transformasi lokal sebuah elemen AM (objek null atau layer biasa). Dipakai untuk rantai induk (parent -> parent -> ...). */
function readXf(el, W, H) {
  const st = num(el.getAttribute('startTime'), 0) / 1000, dur = Math.max(0.05, num(el.getAttribute('endTime'), 0) / 1000 - st);
  const tr = [...el.children].find(c => c.nodeName === 'transform'), sub = nm => tr && [...tr.children].find(c => c.nodeName === nm);
  const scv = q => { const v = vec(q); return v && [v[0] * 100, (v.length > 1 ? v[1] : v[0]) * 100]; };
  const par = el.getAttribute('parent') || null, loc = animIn(sub('location'), dur, vec, 2, par ? [0, 0] : [W / 2, H / 2]), sc = animIn(sub('scale'), dur, scv, 2, [100, 100]);
  const ro = animIn(sub('rotation'), dur, one, 1, [0]), op = animIn(sub('opacity'), dur, q => { const v = one(q); return v && [v[0] * 100]; }, 1, [100]);
  const off = (el.getAttribute('ml-off') || '').split(',').map(Number); // isi scene bersarang: lokasi AM absolut di kanvas scene -> relatif terhadap tengah scene
  if (off.length === 2 && off.every(isFinite) && sub('location')) [0, 1].forEach(i => { loc[i].v -= off[i]; (loc[i].k || []).forEach(q => { q.v -= off[i]; }); });
  return { id: el.getAttribute('id'), parent: el.getAttribute('parent') || null, start: st, dur, loc, sc, ro, op };
}
const keyed = N => [].concat(N.loc, N.sc, N.ro).some(a => a.k.length);
const nonIdentity = (N, W, H) => keyed(N) || Math.abs(N.loc[0].v - (N.parent ? 0 : W / 2)) > 1e-3 || Math.abs(N.loc[1].v - (N.parent ? 0 : H / 2)) > 1e-3 || Math.abs(N.sc[0].v - 100) > 1e-3 || Math.abs(N.sc[1].v - 100) > 1e-3 || Math.abs(N.ro[0].v) > 1e-3;
/** adakah leluhur (bukan node itu sendiri) yang menggeser/memutar/menskala? */
function ancestorMoves(N, nodes, W, H) {
  const seen = new Set([N.id]); let q = N.parent && nodes.get(N.parent);
  while (q && !seen.has(q.id)) { if (nonIdentity(q, W, H)) return true; seen.add(q.id); q = q.parent && nodes.get(q.parent); }
  return false;
}
/** nilai lokal node pada waktu global tg */
function evalLocal(N, tg) {
  const t = Math.max(0, Math.min(N.dur, tg - N.start)), ev = ML.evalAnim;
  return { x: ev(N.loc[0], t), y: ev(N.loc[1], t), sx: ev(N.sc[0], t) / 100, sy: ev(N.sc[1], t) / 100, r: ev(N.ro[0], t) };
}
/** nilai dunia = rantai induk diterapkan: dunia = P + R*S*(anak - pusat komposisi); skala dikali, rotasi dijumlah */
function evalWorld(N, tg, nodes, W, H, depth) {
  const l = evalLocal(N, tg), Pn = N.parent && (depth || 0) < 24 ? nodes.get(N.parent) : null;
  if (!Pn) return l;
  const w = evalWorld(Pn, tg, nodes, W, H, (depth || 0) + 1), d = Math.PI / 180, dx = l.x * w.sx, dy = l.y * w.sy, c = Math.cos(w.r * d), s = Math.sin(w.r * d);
  return { x: w.x + c * dx - s * dy, y: w.y + s * dx + c * dy, sx: l.sx * w.sx, sy: l.sy * w.sy, r: l.r + w.r };
}
/** Bakar rantai induk ke keyframe layer (MotionLyn belum punya parenting). Disampel rapat di tiap segmen supaya kurva tetap halus. */
function bakeChain(Ly, N, nodes, W, H) {
  const ts = new Set([0, +Ly.dur.toFixed(5)]), add = (a, off) => (a.k || []).forEach(k => { const t = k.t + off; if (t >= 0 && t <= Ly.dur) ts.add(+t.toFixed(5)); });
  [N.loc[0], N.loc[1], N.sc[0], N.sc[1], N.ro[0]].forEach(a => add(a, 0));
  const seen = new Set([N.id]); let q = N.parent && nodes.get(N.parent);
  while (q && !seen.has(q.id)) { [q.loc[0], q.loc[1], q.sc[0], q.sc[1], q.ro[0]].forEach(a => add(a, q.start - Ly.start)); seen.add(q.id); q = q.parent && nodes.get(q.parent); }
  const base = [...ts].sort((a, b) => a - b), cache = new Map();
  const world = t => { const k = +t.toFixed(6); let v = cache.get(k); if (!v) { const w = evalWorld(N, Ly.start + t, nodes, W, H); v = [w.x, w.y, w.sx * 100, w.sy * 100, w.r]; cache.set(k, v); } return v; };
  const TOL = [0.3, 0.3, 0.1, 0.1, 0.1]; // toleransi per kanal: px, px, %, %, derajat (tak terlihat mata)
  /* tiap kanal disampel SENDIRI-SENDIRI; titik uji (0.25/0.5/0.75) hanya untuk mengukur galat, BUKAN dijadikan keyframe.
     Keyframe baru dibuat hanya di titik belah segmen yang memang galat, jadi jumlahnya mendekati keyframe asli AM. */
  const LIN = [0, 0, 1, 1], names = ['x', 'y', 'sx', 'sy', 'rot'];
  names.forEach((nm, c) => {
    const keys = new Set(base), g = t => world(t)[c];
    const refine = (a, b, d) => {
      const va = g(a), vb = g(b); let bad = false;
      for (const f of [0.25, 0.5, 0.75]) if (Math.abs(g(a + (b - a) * f) - (va + (vb - va) * f)) > TOL[c]) { bad = true; break; }
      if (bad && d < 9 && b - a > 1e-4) { const m = +((a + b) / 2).toFixed(6); keys.add(m); refine(a, m, d + 1); refine(m, b, d + 1); }
    };
    base.forEach((t, i) => { if (i + 1 < base.length) refine(t, base[i + 1], 0); });
    const all = [...keys].sort((x, y) => x - y), vs = all.map(g);
    if (Math.max(...vs) - Math.min(...vs) < 1e-6) { Ly.p[nm] = { v: vs[0], k: [] }; return; } // kanal tak berubah: tanpa keyframe
    Ly.p[nm] = { v: vs[0], k: all.map((t, i) => ({ t, v: vs[i], e: i + 1 < all.length ? LIN : null })) };
  });
}

/** Opacity grup AM berlaku ke semua isinya: kalikan ke opacity layer (statis: skala nilai; beranimasi: disampel linear). */
function composeGroupOpacity(Ly, N, nodes) {
  const gs = [], seen = new Set([N.id]); let q = N.parent && nodes.get(N.parent);
  while (q && !seen.has(q.id)) { if (q.group) gs.push(q); seen.add(q.id); q = q.parent && nodes.get(q.parent); }
  if (!gs.length) return;
  const op = Ly.p.op, animated = [op].concat(gs.map(g => g.op[0])).some(a => a.k && a.k.length);
  if (!animated) { const f = gs.reduce((m, g) => m * g.op[0].v / 100, 1); if (Math.abs(f - 1) < 1e-6) return; op.v *= f; return; }
  const LIN = [0, 0, 1, 1], ts = new Set([0, Ly.dur]);
  const addKeys = (a, off) => (a.k || []).forEach(k => { const t = k.t + off; if (t > 0 && t < Ly.dur) ts.add(+t.toFixed(6)); });
  addKeys(op, 0); gs.forEach(g => addKeys(g.op[0], g.start - Ly.start));
  const base = [...ts].sort((a, b) => a - b), all = new Set(base);
  base.forEach((t, i) => { if (i + 1 < base.length) for (const f of [0.25, 0.5, 0.75]) all.add(+(t + (base[i + 1] - t) * f).toFixed(6)); });
  const arr = [...all].sort((a, b) => a - b), val = t => gs.reduce((m, g) => m * ML.evalAnim(g.op[0], t + Ly.start - g.start) / 100, ML.evalAnim(op, t));
  const vs = arr.map(val);
  Ly.p.op = { v: vs[0], k: arr.map((t, i) => ({ t, v: vs[i], e: i + 1 < arr.length ? LIN : null })) };
}

/** Gabungkan induk ke layer anak SECARA ANALITIK bila bisa: keyframe + kurva easing induk disalin apa adanya (jumlah keyframe & kurva sama dengan AM).
 *  Kanal yang tidak bisa dihitung eksak (dua-duanya beranimasi sekaligus, induk berotasi, anak hidup di luar umur induk) jatuh ke pembakaran rapat (bakeChain). */
function composeParent(Ly, N, nodes, W, H) {
  bakeChain(Ly, N, nodes, W, H); // dasar: seluruh kanal dibakar dulu, lalu kanal yang eksak ditimpa
  const P = N.parent && nodes.get(N.parent); if (!P || ancestorMoves(P, nodes, W, H)) return;
  const e = 1e-3; if (Ly.start < P.start - e || Ly.start + Ly.dur > P.start + P.dur + e) return; // anak harus hidup di dalam umur induk
  const off = P.start - Ly.start, still = a => !a.k.length || a.k.every(q => Math.abs(q.v - a.k[0].v) < 1e-9), copy = a => JSON.parse(JSON.stringify(a));
  const map = (a, dt, mul, add) => ({ v: a.v * mul + add, k: a.k.map(k => ({ t: k.t + dt, v: k.v * mul + add, e: k.e })) });
  const cx = N.loc[0], cy = N.loc[1], csx = N.sc[0], csy = N.sc[1], cr = N.ro[0], px = P.loc[0], py = P.loc[1], psx = P.sc[0], psy = P.sc[1], pr = P.ro[0];
  const noRot = still(pr) && Math.abs(pr.v) < 1e-9;
  const pos = (c, pc, ps, half) => { // world = Pc(t) + ps(t)/100 * (c(t) - half)
    if (!noRot) return null;
    if (still(c)) { const d0 = c.v - half; if (Math.abs(d0) < 1e-9) return map(pc, off, 1, 0); if (still(ps)) return map(pc, off, 1, ps.v / 100 * d0); return null; }
    if (still(pc) && still(ps)) return map(c, 0, ps.v / 100, pc.v - ps.v / 100 * half);
    return null;
  };
  const scl = (c, ps) => still(c) ? map(ps, off, c.v / 100, 0) : still(ps) ? map(c, 0, ps.v / 100, 0) : null;
  const rot = () => still(cr) ? map(pr, off, 1, cr.v) : still(pr) ? map(cr, 0, 1, pr.v) : null;
  const res = { x: pos(cx, px, psx, 0), y: pos(cy, py, psy, 0), sx: scl(csx, psx), sy: scl(csy, psy), rot: rot() };
  for (const k in res) if (res[k]) Ly.p[k] = res[k];
}

/* ================= IMPOR ================= */
const waitXml = async () => { for (let i = 0; i < 40 && !Object.keys(ML.XML_ID || {}).length; i++) await ML.sleep(100); };
const baseName = u => { try { return decodeURIComponent(String(u || '').split('?')[0].split('/').pop()); } catch (e) { return String(u || '').split('/').pop(); } };

const normName = n => String(n || '').toLowerCase().replace(/\.[^.]+$/, '').replace(/[^a-z0-9]+/g, '');
async function collectFiles(files) { // File[] -> Map(nama huruf kecil -> File/Blob bernama); zip dibuka
  const map = new Map();
  for (const f of files) {
    if (/\.zip$/i.test(f.name)) {
      try { const z = await ML.zip.read(f); for (const n of z.names) { if (/\/$/.test(n) || /\.xml$/i.test(n)) continue; const b = await z.get(n); const nm = n.split('/').pop(); map.set(nm.toLowerCase(), new File([b], nm, { type: b.type || '' })); } } catch (e) { /* abaikan zip rusak */ }
    } else if (!/\.xml$/i.test(f.name)) map.set(f.name.toLowerCase(), f);
  }
  const nmap = new Map(); map.forEach((f, k) => { const n = normName(k); if (n && !nmap.has(n)) nmap.set(n, f); }); map.norm = nmap;
  return map;
}
async function xmlTextFrom(files) {
  for (const f of files) if (/\.xml$/i.test(f.name)) return { text: await f.text(), name: f.name };
  for (const f of files) if (/\.zip$/i.test(f.name)) { const z = await ML.zip.read(f); const n = z.names.find(x => /\.xml$/i.test(x) && !/\/$/.test(x)); if (n) return { text: await (await z.get(n)).text(), name: n.split('/').pop() }; }
  return null;
}

ML.importAMXML = async files => {
  files = Array.from(files || []);
  const src = await xmlTextFrom(files); if (!src) throw new Error('File .xml tidak ditemukan (pilih file .xml proyek Alight Motion)');
  const doc = new DOMParser().parseFromString(src.text.replace(/^\uFEFF/, ''), 'text/xml'), root = doc.documentElement;
  if (!root || root.nodeName === 'parsererror' || doc.getElementsByTagName('parsererror').length) throw new Error('XML tidak valid');
  if (root.nodeName !== 'scene') throw new Error('Bukan proyek Alight Motion (elemen <scene> tidak ada)');
  await waitXml();
  const pool = await collectFiles(files), rep = { layers: 0, missingMedia: [], fxSkipped: [], fxApprox: [], skipped: [], groups: [], parentNote: 0, shapeUnknown: 0, name: '' };
  const W = Math.max(2, Math.round(num(root.getAttribute('width'), 1080))), H = Math.max(2, Math.round(num(root.getAttribute('height'), 1920)));
  const g = (a, b) => b ? g(b, a % b) : a, gg = g(W, H);
  const bgc = parseColor(root.getAttribute('bgcolor') || '#ff000000');
  const id = ML.uid() + ML.uid();
  const proj = { id, name: root.getAttribute('title') || src.name.replace(/\.xml$/i, '') || 'Proyek AM', createdAt: Date.now(), updatedAt: Date.now(), w: W, h: H,
    fps: Math.max(1, Math.round(num(root.getAttribute('fps'), 30))), ratio: (W / gg) + ':' + (H / gg), resLabel: Math.min(W, H) + 'p', bg: bgc.a === 0 ? 'transparent' : hexOf(bgc),
    markers: [], layers: [], thumb: null, size: 0, dur: 0 };
  rep.name = proj.name;
  const LAYER_TAGS = ['audio', 'shape', 'text', 'video', 'image', 'nullobj', 'group', 'embedScene'];
  const kids = []; // daftar datar. <group> berisi layer, dan <embedScene> (= "Group" di AM: scene bersarang dengan kanvas sendiri) diratakan:
  // isinya diangkat ke linimasa utama, berinduk ke grupnya; id diberi awalan agar unik; waktu digeser ke awal grup; lokasi dihitung dari tengah kanvas scene.
  const shiftT = (e, t0) => { if (!t0) return; ['startTime', 'endTime'].forEach(k => { if (e.getAttribute(k) != null) e.setAttribute(k, String(Math.round(num(e.getAttribute(k), 0) + t0))); }); };
  const expand = (list, ctx) => {
    for (const e of list) {
      const tg = e.nodeName, isL = LAYER_TAGS.includes(tg);
      if (isL) {
        if (ctx.pre && e.getAttribute('id') != null) e.setAttribute('id', ctx.pre + ':' + e.getAttribute('id')); // id unik per scene
        const pa = e.getAttribute('parent');
        if (pa && ctx.pre) e.setAttribute('parent', ctx.pre + ':' + pa);
        else if (!pa && ctx.pid && e.getAttribute('id') != null) e.setAttribute('parent', ctx.pid); // isi <group> lama: berinduk ke grupnya
        if (ctx.gid) e.setAttribute('gid', ctx.gid); // layer di dalam <embedScene> (Group AM) = anak layer grup
        shiftT(e, ctx.t0); if (ctx.hidden) e.setAttribute('hidden', 'true');
      }
      kids.push(e);
      if (tg === 'group') expand([...e.children].filter(c => LAYER_TAGS.includes(c.nodeName)), { pid: e.getAttribute('id'), pre: ctx.pre, gid: ctx.gid, t0: ctx.t0, hidden: ctx.hidden || e.getAttribute('hidden') === 'true' });
      else if (tg === 'embedScene') {
        const sc = [...e.children].find(c => c.nodeName === 'scene'); if (!sc) continue;
        const id = e.getAttribute('id');
        expand([...sc.children].filter(c => LAYER_TAGS.includes(c.nodeName) || c.nodeName === 'media'), { pid: null, pre: id, gid: id, t0: num(e.getAttribute('startTime'), 0), hidden: ctx.hidden || e.getAttribute('hidden') === 'true' });
      }
    }
  };
  expand([...root.children], { pid: null, pre: null, gid: null, t0: 0, hidden: false });
  const mediaInfo = new Map(); kids.filter(k => k.nodeName === 'media').forEach(m => mediaInfo.set(m.getAttribute('uri'), { file: m.getAttribute('filename') || baseName(m.getAttribute('uri')), type: m.getAttribute('type') || '', w: num(m.getAttribute('width'), 0), h: num(m.getAttribute('height'), 0) }));
  let n = 0; kids.filter(k => k.nodeName === 'bookmark').forEach(b => proj.markers.push({ id: ML.uid(), t: num(b.getAttribute('t'), 0) / 1000, name: 'Penanda ' + (++n) }));
  proj.markers.sort((a, b) => a.t - b.t);

  const loaded = new Map(); let size = 0;
  async function mediaFor(uri) { // -> item media atau null
    if (loaded.has(uri)) return loaded.get(uri);
    const info = mediaInfo.get(uri), fname = (info && info.file) || baseName(uri);
    const f = pool.get(String(fname).toLowerCase()) || pool.get(baseName(uri).toLowerCase()) || pool.norm.get(normName(fname)) || pool.norm.get(normName(baseName(uri)));
    let it = null;
    if (f) { try { it = await ML.media.importFile(proj, f); size += f.size; } catch (e) { it = null; } }
    if (!it) rep.missingMedia.push(fname);
    loaded.set(uri, it); return it;
  }
  const kindOfInfo = (info, fname, hint) => {
    const ty = (info && info.type) || '', fn = String(fname || '');
    if (/^video\//i.test(ty) || /\.(mp4|mov|webm|mkv|3gp|m4v)$/i.test(fn)) return 'video';
    if (/^audio\//i.test(ty) || /\.(mp3|m4a|wav|ogg|opus|aac|flac)$/i.test(fn)) return 'audio';
    if (/^image\//i.test(ty) || /\.(png|jpe?g|webp|gif|bmp|heic|avif)$/i.test(fn)) return 'image';
    return hint || 'image';
  };
  const nodes = new Map(); // id -> transform lokal (objek null & layer) untuk rantai induk
  for (const el of kids) { if (['media', 'bookmark'].includes(el.nodeName) || el.getAttribute('id') == null) continue; const n = readXf(el, W, H); n.group = el.nodeName === 'group'; if (n.group) { n.fxEls = [...el.children].filter(c => c.nodeName === 'effect'); n.label = el.getAttribute('label') || el.nodeName; } nodes.set(n.id, n); }

  /** bangun satu efek MotionLyn dari elemen <effect> AM. fdur = durasi pemilik efek (untuk skala kunci), shift = geseran waktu ke linimasa layer. null bila tak punya padanan. */
  const fxFrom = (fe, fdur, shift) => {
    const amId = fe.getAttribute('id'), key = ML.XML_ID && ML.XML_ID[amId];
    if (!key || !ML.FXDEF[key]) return { skip: amId.replace('com.alightcreative.effects.', '') };
    const e = ML.makeEffect(key), d = ML.FXDEF[key], moved = [];
    const A1 = (pe, cnt, defs, conv) => { const a = animIn(pe, fdur, conv, cnt, defs); a.forEach(x => moved.push(x)); return a; };
    for (const pe of [...fe.children].filter(c => c.nodeName === 'property')) {
      const pm = (d.pmap || []).find(q => q.id === pe.getAttribute('name')); if (!pm) continue;
      const gk = pm.g, set = (suf, a) => { e.p[gk + suf] = a; };
      if (pm.kind === 'n') e.p[gk] = A1(pe, 1, [e.p[gk].v], one)[0];
      else if (pm.kind === 'b') e.p[gk] = ML.A(/^true$/i.test(pe.getAttribute('value')) ? 1 : 0);
      else if (pm.kind === 's') { const ix = pm.values.indexOf(Math.round(num(pe.getAttribute('value'), pm.values[0]))); e.p[gk] = ML.A(ix < 0 ? e.p[gk].v : ix); }
      else if (pm.kind === 'c') { const a = A1(pe, 4, [255, 255, 255, 255], colConv); set('_r', a[0]); set('_g', a[1]); set('_b', a[2]); if (pm.alpha) set('_a', a[3]); }
      else if (pm.kind === 'p') { const a = A1(pe, 2, [0, 0], vec); set('_x', a[0]); set('_y', a[1]); }
      else if (pm.kind === 'h') { const a = A1(pe, 3, [0, 0, 0], vec); set('_x', a[0]); set('_y', a[1]); if (pm.bias) set('_z', a[2]); }
      else if (pm.kind === 'v3') { const a = A1(pe, 3, [0, 0, 0], vec); set('_x', a[0]); set('_y', a[1]); set('_z', a[2]); }
    }
    if (shift) moved.forEach(a => (a.k || []).forEach(q => { q.t += shift; }));
    return { e };
  };
  const grpFxNoted = new Set(), gidMap = new Map();
  for (const el of kids) {
    const tag = el.nodeName; if (['media', 'bookmark'].includes(tag)) continue;
    const label = el.getAttribute('label') || tag, st = num(el.getAttribute('startTime'), 0) / 1000, en = num(el.getAttribute('endTime'), 0) / 1000, dur = Math.max(0.05, en - st);
    if (tag === 'nullobj') continue;
    if (tag === 'group') { rep.groups.push(label); continue; }
    if (tag === 'embedScene') rep.groups.push(label);
    if (!['audio', 'shape', 'text', 'video', 'image', 'embedScene'].includes(tag)) { rep.skipped.push(label + ' (<' + tag + '>)'); continue; }
    const ND = nodes.get(el.getAttribute('id')) || readXf(el, W, H);
    const ft = el.getAttribute('fillType');
    let type, it = null, bw = 0, bh = 0, phUri = null, phHint = null;
    const sEarly = (el.getAttribute('s') || '.rect').replace(/^\./, ''), keepShape = tag === 'shape' && ft === 'media' && sEarly !== 'rect' && !!(AM_TO_SHAPE[sEarly] || (ML.AM_SHAPES && ML.AM_SHAPES[sEarly])); // bentuk non-persegi berisi foto: bentuk dipertahankan
    const sizeEl = [...el.children].find(c => c.nodeName === 'property' && c.getAttribute('name') === 'size');
    if (tag === 'audio') { phUri = el.getAttribute('src'); phHint = 'audio'; it = await mediaFor(phUri); type = it ? 'audio' : 'shape'; }
    else if (tag === 'video' || tag === 'image') { phUri = el.getAttribute('src') || el.getAttribute('fillImage'); phHint = tag; it = await mediaFor(phUri); type = it ? (it.kind === 'video' ? 'video' : it.kind === 'audio' ? 'audio' : 'image') : 'shape'; }
    else if (tag === 'text') type = 'text';
    else if (tag === 'embedScene') { type = 'group'; const sc0 = [...el.children].find(c => c.nodeName === 'scene'); bw = num(sc0 && sc0.getAttribute('width'), W); bh = num(sc0 && sc0.getAttribute('height'), H); }
    else if (ft === 'media') { phUri = el.getAttribute('fillImage'); it = await mediaFor(phUri); if (it && it.kind !== 'image') it = keepShape ? null : it; type = keepShape ? 'shape' : it ? (it.kind === 'video' ? 'video' : it.kind === 'audio' ? 'audio' : 'image') : 'shape'; }
    else type = 'shape';
    const isPh = !!phUri && !it, phInfo = isPh ? (mediaInfo.get(phUri) || {}) : null;
    const sz = sizeEl && tag !== 'embedScene' ? nums(sizeEl.getAttribute('value')) : null;
    if (sz && sz.length >= 2) { bw = sz[0]; bh = sz[1]; } else if (it && it.w) { [bw, bh] = ML.fitBox(it.w, it.h, proj); }
    else if (isPh && phInfo.w && phInfo.h) { [bw, bh] = ML.fitBox(phInfo.w, phInfo.h, proj); }
    const Ly = ML.makeLayer(proj, type, { name: label, mediaId: it ? it.id : null, start: st, dur, bw, bh, srcDur: it ? it.dur || 0 : 0 });
    Ly.dur = dur; Ly.start = st; Ly.name = label; if (el.getAttribute('hidden') === 'true') Ly.hidden = true;
    if (type === 'group') gidMap.set(el.getAttribute('id'), Ly.id);
    if (el.getAttribute('gid')) Ly.gid = gidMap.get(el.getAttribute('gid')) || null;
    { const bl = el.getAttribute('blending'); if (bl) { Ly.blend = BLEND_MAP[bl] || (ML.BLENDS.some(b => b[0] === bl) ? bl : 'normal'); if (!BLEND_MAP[bl] && Ly.blend === 'normal') rep.fxApprox.push('blending “' + bl + '” → Normal — ' + label); } }
    if (it && ft === 'media' && tag === 'shape' && type === 'image' && bw > 0 && bh > 0 && it.w && it.h) { // AM: gambar mengisi bentuk (dipotong) / pas, tidak dirangkang
      const mf = el.getAttribute('mediaFillMode') || 'fill';
      if (mf !== 'stretch') { const sc = (mf === 'fit' ? Math.min : Math.max)(bw / it.w, bh / it.h); Ly.bw = it.w * sc; Ly.bh = it.h * sc; if (mf !== 'fit') Ly.frame = { w: bw, h: bh }; }
    }
    if (it && (type === 'video' || type === 'audio')) { Ly.trimIn = num(el.getAttribute('inTime'), 0) / 1000; Ly.srcDur = it.dur || 0; }
    if (type === 'shape') {
      const miss = isPh;
      const fc = [...el.children].find(c => c.nodeName === 'fillColor'), c = fc ? parseColor(fc.getAttribute('value')) : { r: 255, g: 255, b: 255, a: 255 };
      const sRaw = (el.getAttribute('s') || '.rect').replace(/^\./, ''), kind = AM_TO_SHAPE[sRaw];
      Ly.shape = { kind: miss && !keepShape ? 'rect' : kind || 'rect', fill: miss ? '#555555' : hexOf(c), radius: 0, strokeW: 0, strokeColor: '#ffffff' };
      if (keepShape && it) { const mf0 = el.getAttribute('mediaFillMode') || 'fill'; Ly.shape.fillMedia = { mediaId: it.id, mode: mf0 === 'fit' || mf0 === 'stretch' ? mf0 : 'fill' }; }
      if ((!miss || keepShape) && !kind) { if (ML.AM_SHAPES && ML.AM_SHAPES[sRaw]) { const d = ML.AM_SHAPES[sRaw], p = {}; d.params.forEach(q => { p[q.id] = q.pt ? { x: q.def.x, y: q.def.y } : q.def; }); Ly.shape.am = { id: sRaw, p }; } else rep.shapeUnknown++; }
      if (miss) {
        const file = phInfo.file || baseName(phUri), kd = kindOfInfo(phInfo, file, phHint);
        Ly.name = '⚠ ' + label;
        Ly.ph = { keepShape, kind: kd, file, uri: phUri, label, w: phInfo.w || 0, h: phInfo.h || 0, inTime: num(el.getAttribute('inTime'), 0) / 1000, hid: kd === 'audio' };
        if (kd === 'audio') { Ly.hidden = true; Ly.bw = Ly.bh = Math.round(Math.min(W, H) * 0.25); } // slot audio: tidak tampil di layar
      }
      const ps = [...el.children].find(c => c.nodeName === 'path-stroke'), pz = ps && ps.querySelector('size'); if (pz) Ly.shape.strokeW = num(pz.getAttribute('value'), 0);
      if (!bw) { Ly.bw = Math.round(Math.min(W, H) * 0.5); Ly.bh = Ly.bw; }
    }
    if (type === 'text') {
      const fc = [...el.children].find(c => c.nodeName === 'fillColor'), c = fc ? parseColor(fc.getAttribute('value')) : { r: 255, g: 255, b: 255, a: 255 };
      const fm = /name=([^&]+)/.exec(el.getAttribute('font') || ''), wm = /weight=(\d+)/.exec(el.getAttribute('font') || ''), fam = fm ? decodeURIComponent(fm[1].replace(/\+/g, ' ')) : 'Roboto';
      const ctEl = [...el.children].find(c => c.nodeName === 'content');
      Ly.text = { text: ctEl ? ctEl.textContent : label, font: MONO.test(fam) ? 'monospace' : SERIF.test(fam) ? 'serif' : 'sans-serif', size: Math.round(num(el.getAttribute('size'), 48)), color: hexOf(c), bold: wm ? +wm[1] >= 600 : false, italic: false, align: el.getAttribute('align') || 'center', strokeW: 0, strokeColor: '#000000' };
    }
    // transform (lokal) + rantai induk
    Ly.p.x = ND.loc[0]; Ly.p.y = ND.loc[1]; Ly.p.sx = ND.sc[0]; Ly.p.sy = ND.sc[1]; Ly.p.rot = ND.ro[0]; Ly.p.op = ND.op[0];
    if (ND.parent && nodes.has(ND.parent)) { composeParent(Ly, ND, nodes, W, H); if (ancestorMoves(ND, nodes, W, H)) rep.parentNote++; composeGroupOpacity(Ly, ND, nodes); }
    { const K = type === 'group' ? 1 : SCALE_K; ['sx', 'sy'].forEach(k => { const a = Ly.p[k]; a.v *= K; (a.k || []).forEach(q => { q.v *= K; }); }); } // ukuran bentuk AM -> MotionLyn (x2); layer grup memakai ukuran scene apa adanya
    // efek milik layer sendiri
    for (const fe of [...el.children].filter(c => c.nodeName === 'effect')) {
      if (fe.getAttribute('hidden') === 'true') continue; // efek dimatikan di AM
      const r = fxFrom(fe, dur, 0);
      if (r.skip) rep.fxSkipped.push(r.skip + ' — ' + label); else Ly.fx.push(r.e);
    }
    // efek milik GRUP: MotionLyn belum punya layer grup, jadi efek grup diterapkan ke tiap layer di dalamnya (setelah efek layer itu sendiri)
    { const seenG = new Set(); let q = ND.parent && nodes.get(ND.parent);
      while (q && !seenG.has(q.id)) {
        seenG.add(q.id);
        if (q.group && q.fxEls && q.fxEls.length) for (const fe of q.fxEls) {
          if (fe.getAttribute('hidden') === 'true') continue;
          const r = fxFrom(fe, q.dur, q.start - ND.start), nk = q.id + '|' + fe.getAttribute('id');
          if (r.skip) { if (!grpFxNoted.has(nk)) { grpFxNoted.add(nk); rep.fxSkipped.push(r.skip + ' — grup ' + q.label); } }
          else { Ly.fx.push(r.e); if (!grpFxNoted.has(nk)) { grpFxNoted.add(nk); rep.fxApprox.push(((ML.FXDEF[r.e.type] && ML.FXDEF[r.e.type].name) || r.e.type).split(' (')[0] + ' — diterapkan ke tiap layer di grup ' + q.label); } }
        }
        q = q.parent && nodes.get(q.parent);
      } }
    proj.layers.push(Ly); rep.layers++;
  }
  proj.dur = ML.duration(proj); proj.size = size + JSON.stringify(proj.layers).length;
  proj.layers.forEach(ML.ensureLayer);
  await ML.db.putProject(proj);
  rep.id = id; rep.missingMedia = [...new Set(rep.missingMedia)]; rep.slots = proj.layers.filter(l => l.ph).length;
  return rep;
};

/* ================= UI ================= */
const lines = (arr, max = 8) => arr.slice(0, max).map(x => '• ' + esc(x)).join('<br>') + (arr.length > max ? '<br>… +' + (arr.length - max) + ' lagi' : '');
ML.amReportSheet = (title, rep, imported) => {
  const parts = [];
  if (imported) parts.push('<b>' + rep.layers + ' layer</b> berhasil diimpor.');
  else parts.push('<b>' + rep.layers + ' layer</b> ditulis ke XML.');
  if (rep.missingMedia && rep.missingMedia.length) parts.push('<b>Media belum terhubung (' + rep.missingMedia.length + '):</b> layernya jadi <b>slot kosong</b> (kotak abu-abu ⚠) lengkap dengan posisi, ukuran, dan gerakannya. Isi lewat <b>Editor Template</b> di bawah, atau impor lagi bersama file medianya (.xml + foto/video/audio, atau .zip).<br>' + lines(rep.missingMedia));
  if (rep.fxSkipped && rep.fxSkipped.length) parts.push('<b>Efek dilewati (' + rep.fxSkipped.length + '):</b> tidak punya padanan efek Alight Motion' + (imported ? ' di engine MotionLyn' : '') + '.<br>' + lines(rep.fxSkipped));
  if (rep.fxApprox && rep.fxApprox.length) parts.push('<b>Efek dipetakan perkiraan (' + rep.fxApprox.length + '):</b> padanan AM-nya mirip, tapi tampilannya bisa sedikit beda.<br>' + lines(rep.fxApprox));
  if (rep.skipped && rep.skipped.length) parts.push('<b>Layer dilewati (' + rep.skipped.length + '):</b><br>' + lines(rep.skipped));
  if (rep.groups && rep.groups.length) parts.push('<b>Grup (' + rep.groups.length + '):</b> grup AM (scene bersarang) dibuat sebagai <b>layer grup</b>: isinya dirender terpisah, jadi blend/mask di dalam grup hanya memengaruhi isi grup itu, dan efek/transform grup berlaku ke seluruh isinya.<br>' + lines(rep.groups));
  if (rep.parentNote) parts.push(rep.parentNote + ' layer berinduk ke objek null yang bergerak: gerakan induk dibakar ke keyframe tiap layer (MotionLyn belum punya parenting).');
  if (rep.shapeUnknown) parts.push(rep.shapeUnknown + ' bentuk khusus AM diganti persegi.');
  if (!imported && rep.media && rep.media.length) parts.push('Alamat media di XML bersifat lokal perangkat; di Alight Motion hubungkan ulang medianya bila diminta.');
  ML.sheet(title, (b, close) => {
    b.append(...parts.map(p => ML.h('p', { class: 'dlg-text', html: p })));
    if (imported && rep.id && ML.tpl) b.append(ML.h('div', { class: 'btn-row' },
      ML.h('button', { class: 'btn soft', text: 'Buka proyek', onclick: () => { close(); ML.openEditor(rep.id); } }),
      ML.h('button', { class: 'btn primary', text: 'Editor Template', onclick: () => { close(); ML.tpl.open(rep.id); } })));
  });
};
ML.amImportUi = async () => {
  const files = await ML.pickFiles('.xml,.zip,image/*,video/*,audio/*,.mp3,.ogg,.opus,.m4a,.wav,.flac,.aac', true); if (!files.length) return;
  ML.toast('Mengimpor XML…', 4000);
  try {
    const rep = await ML.importAMXML(files);
    if (ML.editVer() !== 'am') { ML.setEditVer('am'); }
    if (ML.home && ML.home.show) await ML.home.show();
    const bad = rep.missingMedia.length || rep.fxSkipped.length || rep.skipped.length || rep.shapeUnknown || (rep.groups && rep.groups.length);
    ML.toast('Proyek “' + rep.name + '” diimpor (mode AM aktif)' + (rep.parentNote ? ', ' + rep.parentNote + ' layer dibakar dari induk' : ''));
    if (bad) { ML.amReportSheet('Hasil impor XML', rep, true); } else ML.openEditor(rep.id);
    ML.amLast = rep.id;
  } catch (e) { ML.toast('Gagal impor XML: ' + e.message, 5000); }
};
ML.amExportUi = proj => {
  const go = async mode => {
    ML.toast('Menyiapkan XML…');
    try { const rep = await ML.exportAMXML(proj, mode); ML.toast('Tersimpan: ' + rep.loc, 4500); if (rep.fxSkipped.length || rep.skipped.length || rep.fxApprox.length) ML.amReportSheet('Hasil ekspor XML', rep, false); }
    catch (e) { ML.toast('Gagal ekspor XML: ' + e.message, 5000); }
  };
  ML.sheet('Ekspor XML (Alight Motion)', (b, close) => {
    const h = ML.h || ((t, a, ...c) => { const e = document.createElement(t); Object.entries(a || {}).forEach(([k, v]) => { if (k === 'text') e.textContent = v; else if (k === 'html') e.innerHTML = v; else if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v); }); c.flat().forEach(x => x && e.append(x)); return e; });
    b.append(h('button', { class: 'row-btn', text: 'Hanya file .xml', onclick: () => { close(); go('xml'); } }),
      h('button', { class: 'row-btn', text: '.zip: XML + folder media', onclick: () => { close(); go('zip'); } }));
  });
};
})();
