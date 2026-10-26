'use strict';
/* ---------- Engine efek XML (format Alight Motion) ----------
   Salin file .xml ke folder effects/ lalu daftarkan namanya di effects/index.json
   (jalankan: python3 tools/make-index.py). XML dibaca langsung di browser, tanpa konversi/koding ulang.
   Didukung: fragment + vertex shader (3D raymarch), grup shader yang dipilih script, multi-pass + buffer,
   sub-efek antar-pass (Gaussian Blur dll), iterations, tekstur comp (latar), tekstur gambar, hue-disc, xyz, orient,
   script `animate(env,el,p)` untuk efek transform/opasitas/teks, serta efek lama (deprecated).
   Efek yang gagal kompilasi di GPU disembunyikan lalu diingat. */
(function () {
const PRE = `
vec2 getTexSize(vec2 s){ return s; }
int max(int a,int b){ return a>b?a:b; } int min(int a,int b){ return a<b?a:b; } int abs(int a){ return a<0?-a:a; } int clamp(int x,int a,int b){ return x<a?a:(x>b?b:x); }
float max(int a,float b){ return max(float(a),b); } float max(float a,int b){ return max(a,float(b)); } float min(int a,float b){ return min(float(a),b); } float min(float a,int b){ return min(a,float(b)); }
float saturate(float x){ return clamp(x,0.,1.); } vec2 saturate(vec2 x){ return clamp(x,0.,1.); }
vec3 saturate(vec3 x){ return clamp(x,0.,1.); } vec4 saturate(vec4 x){ return clamp(x,0.,1.); }
#define AM_MAX 160
vec2 am_Z(){ return (u_Lz.x>1.&&u_Lz.y>1.)?u_Lz:u_res; }
int acPass; vec2 acScreenNorm; vec2 acScreenSize; vec2 acPreviewSize; vec2 acProjectSize; vec2 acLayerSize; vec2 acLayerSizeNorm;
vec2 acLayerCenter; vec2 acLayerCenterNorm; vec2 acLayerPivot; vec2 acLayerNorm; vec2 acVelocity;
float acScaleVelocity; float acAngularVelocity; float acTime; bool acShowGuides;
mat4 acLayerToScreen; mat4 acLTS; mat4 acScreenToLayer;
vec2 am_l2s(vec2 v){ vec2 n=vec2(v.x,1.-v.y); vec2 l=(n-.5)*am_Z(); vec2 p=(vec2(u_A.x*l.x+u_A.z*l.y,u_A.y*l.x+u_A.w*l.y)+u_T)/u_res; return vec2(p.x,1.-p.y); }
vec2 am_s2l(vec2 s){ vec2 p=vec2(s.x,1.-s.y)*u_res-u_T; float det=u_A.x*u_A.w-u_A.z*u_A.y; if(abs(det)<1e-6) det=1e-6;
  vec2 l=vec2(u_A.w*p.x-u_A.z*p.y,-u_A.y*p.x+u_A.x*p.y)/det; vec2 n=l/am_Z()+.5; return vec2(n.x,1.-n.y); }
mat4 am_mat(bool inv){ vec2 o,a,b;
  if(inv){ o=am_s2l(vec2(0.)); a=am_s2l(vec2(1.,0.))-o; b=am_s2l(vec2(0.,1.))-o; }
  else { o=am_l2s(vec2(0.)); a=am_l2s(vec2(1.,0.))-o; b=am_l2s(vec2(0.,1.))-o; }
  return mat4(a.x,b.x,0.,o.x, a.y,b.y,0.,o.y, 0.,0.,1.,0., 0.,0.,0.,1.); }
vec4 am_t2D(sampler2D s, vec2 uv){ return texture2D(s,vec2(uv.x,1.-uv.y)); }
vec4 am_tCv(sampler2D s, vec2 uv){ if(uv.x<0.||uv.x>1.||uv.y<0.||uv.y>1.) return vec4(0.); return texture2D(s,vec2(uv.x,1.-uv.y)); }
void am_init(){ vec2 Z=am_Z(); acPass=int(u_pass+.5);
  acScreenNorm=vec2(vUV.x,1.-vUV.y); acScreenSize=u_res; acPreviewSize=u_res; acProjectSize=u_res;
  acLayerSize=vec2(length(u_A.xy)*Z.x,length(u_A.zw)*Z.y); acLayerSizeNorm=acLayerSize/u_res;
  acLayerCenter=vec2(u_T.x,u_res.y-u_T.y); acLayerCenterNorm=acLayerCenter/u_res; acLayerPivot=acLayerCenter;
  acLayerNorm=am_s2l(acScreenNorm); acVelocity=vec2(u_V.x,-u_V.y); acScaleVelocity=u_V.z; acAngularVelocity=u_V.w;
  acTime=u_time; acShowGuides=false; acLayerToScreen=(u_ls>.5)?mat4(1.):am_mat(false); acLTS=acLayerToScreen; acScreenToLayer=am_mat(true); }
`;
const OK_AC = new Set('acPass acScreenNorm acScreenSize acPreviewSize acProjectSize acLayerSize acLayerSizeNorm acLayerCenter acLayerCenterNorm acLayerPivot acLayerNorm acLayerToScreen acLTS acScreenToLayer acVelocity acScaleVelocity acAngularVelocity acTime acShowGuides'.split(' '));
const RESERVED = new Set('asm class union enum typedef template this packed goto switch default inline noinline volatile public static extern external interface long short double half fixed unsigned superp input output sizeof cast namespace using'.split(' '));
const CAT = { distort: 'Distorsi', color: 'Warna', procedural: 'Prosedural', blur: 'Blur', transform: 'Transform', drawing: 'Gambar', matte: 'Matte', opacity: 'Opasitas', repeat: 'Ulangi', text: 'Teks', '3d': '3D', other: 'Lainnya', old: 'Lama (deprecated)' };
const GRAD = { Distorsi: '#1d6a7a,#14334a', Warna: '#7a3a2a,#3a1520', Prosedural: '#4a6a2a,#1d2d14', Blur: '#2b4a7a,#1d2b4d', Transform: '#3d3a7a,#1b1d3d', Gambar: '#6a2a4a,#2a1420', Matte: '#6a4a2a,#2a1d14', Opasitas: '#5a5a2a,#26261a', Ulangi: '#7a2e6a,#2e1540', Teks: '#2a5a5a,#142a2a', '3D': '#2a5a7a,#10202d', Lainnya: '#3a4a5a,#161d28', 'Lama (deprecated)': '#444,#222' };
const NUM = (k, l, min, max, def, step, unit) => ({ k, l, min, max, def, step, unit: unit || '' });
const SEL = (k, l, opts, def) => ({ k, l, type: 'sel', opts, def });
const pretty = s => { s = s.split('/').pop().replace(/^effect_param_/, '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ').trim(); return s ? s[0].toUpperCase() + s.slice(1) : 'Param'; };
const nums = (s, n, d) => { if (s == null) return d; const v = (s.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) || []).map(Number); if (!v.length) return d; while (v.length < n) v.push(v[v.length - 1]); return v.slice(0, n); };
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const attr = (el, a) => el.getAttribute(a);
const san = s => String(s).replace(/\W/g, '_');

/* ES 1.00 mewajibkan loop dengan batas konstan. Loop yang awal/batas/langkahnya bukan literal diubah:
   awal & langkah literal -> loop literal sepanjang AM_MAX + break (indeks array tetap sah);
   selain itu -> loop penghitung _k + variabel turunan + break. */
const AMX = 160, LOOP = /for\s*\(\s*(int|float)\s+(\w+)\s*=\s*([^;]+);\s*([^;]+);\s*([^;{]+?)\s*\)\s*\{/g, NUMLIT = /^\s*[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?\s*$/i;
let loopN = 0;
function fixLoops(code) {
  return code.replace(LOOP, (m, ty, v, a, cond, upd) => {
    const c = cond.match(/^\s*(\w+)\s*(<=|<|>=|>|!=)\s*([\s\S]+?)\s*$/); if (!c || c[1] !== v) return m;
    const u = upd.trim(); let dir, step, x;
    if (new RegExp('^(?:' + v + '\\s*\\+\\+|\\+\\+\\s*' + v + ')$').test(u)) { dir = 1; step = '1'; }
    else if (new RegExp('^(?:' + v + '\\s*--|--\\s*' + v + ')$').test(u)) { dir = -1; step = '1'; }
    else if ((x = u.match(new RegExp('^' + v + '\\s*\\+=\\s*([\\s\\S]+)$')))) { dir = 1; step = x[1]; }
    else if ((x = u.match(new RegExp('^' + v + '\\s*-=\\s*([\\s\\S]+)$')))) { dir = -1; step = x[1]; }
    else return m;
    if (NUMLIT.test(a) && NUMLIT.test(c[3]) && NUMLIT.test(step)) return m;
    const n = ++loopN, fl = ty === 'float', brk = `if(!(${v}${c[2]}(${c[3]}))) break;`;
    if (NUMLIT.test(a) && NUMLIT.test(step)) {
      const av = parseFloat(a), sv = parseFloat(step), lim = av + dir * AMX * sv, fmt = q => fl ? (Number.isInteger(q) ? q.toFixed(1) : String(q)) : String(Math.round(q));
      return `for(${ty} ${v}=${fmt(av)};${v}${dir > 0 ? '<' : '>'}${fmt(lim)};${v}${dir > 0 ? '+=' : '-='}${fmt(sv)}){ ${brk}`;
    }
    return `for(int _k${n}=0;_k${n}<AM_MAX;_k${n}++){ ${ty} ${v}=(${a})${dir > 0 ? '+' : '-'}${fl ? 'float(_k' + n + ')' : '_k' + n}*(${step}); ${brk}`;
  });
}

/* ES 1.00: array lokal tidak boleh diindeks variabel biasa; bacaan arr[idx] diganti fungsi pemilih (hanya efek yang perlu) */
const ARRAYFIX = new Set(['chromatic-zoomblur']);
/* v3.85: efek yang mengambil isi layer dalam koordinat layer (Tiles). Sumbernya dirender utuh sebesar layer (bukan terpotong layar),
   jadi saat layer digeser/diayun/diputar tepi layar yang kosong tetap terisi ubin. */
const LAYERSPACE = new Set(['tile']);
function fixArrays(code) {
  const decs = [...code.matchAll(/\b(float|int|vec2|vec3|vec4)\s+(\w+)\s*\[\s*(\d+)\s*\]\s*;/g)], fns = [];
  for (const [, ty, nm, n] of decs) {
    const fn = `am_sel_${nm}`; let used = false;
    code = code.replace(new RegExp('\\b' + nm + '\\[([^\\[\\]]*[A-Za-z_][^\\[\\]]*)\\](?!\\s*=[^=])', 'g'), (m, ix) => { used = true; return `${fn}(${nm},${ix})`; });
    if (used) { let b = `${ty} ${fn}(${ty} a[${n}], int i){ `; for (let k = 0; k < +n; k++) b += `if(i==${k}) return a[${k}]; `; fns.push(b + `return a[0]; }`); }
  }
  if (!fns.length) return code;
  const at = code.search(/void\s+am_main/); return at < 0 ? code : code.slice(0, at) + fns.join('\n') + '\n' + code.slice(at);
}

/* ================= runtime script efek (API Alight: animate(env, el, p)) ================= */
function simplex(xin, yin, zin) { /* simplex noise 3D (Gustavson), keluaran -1..1 */
  const g3 = [[1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0], [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1], [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]];
  if (!simplex.p) { const p = [], s = 12345; let r = s; for (let i = 0; i < 256; i++) p[i] = i; for (let i = 255; i > 0; i--) { r = (r * 16807) % 2147483647; const j = r % (i + 1); [p[i], p[j]] = [p[j], p[i]]; } simplex.p = new Uint8Array(512); simplex.m = new Uint8Array(512); for (let i = 0; i < 512; i++) { simplex.p[i] = p[i & 255]; simplex.m[i] = simplex.p[i] % 12; } }
  const P = simplex.p, M = simplex.m, F3 = 1 / 3, G3 = 1 / 6; xin = +xin || 0; yin = +yin || 0; zin = +zin || 0;
  const s = (xin + yin + zin) * F3, i = Math.floor(xin + s), j = Math.floor(yin + s), k = Math.floor(zin + s), t = (i + j + k) * G3;
  const x0 = xin - (i - t), y0 = yin - (j - t), z0 = zin - (k - t); let i1, j1, k1, i2, j2, k2;
  if (x0 >= y0) { if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; } else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; } else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; } }
  else { if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; } else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; } else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; } }
  const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3, x2 = x0 - i2 + 2 * G3, y2 = y0 - j2 + 2 * G3, z2 = z0 - k2 + 2 * G3, x3 = x0 - 1 + 3 * G3, y3 = y0 - 1 + 3 * G3, z3 = z0 - 1 + 3 * G3;
  const ii = i & 255, jj = j & 255, kk = k & 255;
  const c = (tt, gi, x, y, z) => { if (tt < 0) return 0; tt *= tt; const g = g3[gi]; return tt * tt * (g[0] * x + g[1] * y + g[2] * z); };
  const n0 = c(.6 - x0 * x0 - y0 * y0 - z0 * z0, M[ii + P[jj + P[kk]]], x0, y0, z0), n1 = c(.6 - x1 * x1 - y1 * y1 - z1 * z1, M[ii + i1 + P[jj + j1 + P[kk + k1]]], x1, y1, z1);
  const n2 = c(.6 - x2 * x2 - y2 * y2 - z2 * z2, M[ii + i2 + P[jj + j2 + P[kk + k2]]], x2, y2, z2), n3 = c(.6 - x3 * x3 - y3 * y3 - z3 * z3, M[ii + 1 + P[jj + 1 + P[kk + 1]]], x3, y3, z3);
  return Math.max(-1, Math.min(1, 32 * (n0 + n1 + n2 + n3)));
}
const AMLIB = { simplexNoise: simplex, log() { }, triangle: x => { x -= Math.floor(x); return x < .25 ? 4 * x : x < .75 ? 2 - 4 * x : 4 * x - 4; }, clamp: (v, a, b) => Math.max(a, Math.min(b, v)), mix: (a, b, t) => a + (b - a) * t };

function scriptFn(d) {
  if (d._fn !== undefined) return d._fn;
  try { d._fn = new Function('AM', 'console', d.script + '\n;return (typeof animate!=="undefined")?animate:null;')(AMLIB, { log() { } }) || false; } catch (e) { console.warn('script efek gagal:', d.name, e.message); d._fn = false; }
  return d._fn;
}
/* nilai parameter -> objek p untuk script; hz/rpm diakumulasi (fase) seperti di Alight */
function scriptP(d, get, lt, accFn) {
  const p = {};
  for (const m of d.pmap || []) {
    const v = k => get(k);
    switch (m.kind) {
      case 'n': { p[m.id] = accFn && d.accOf[m.g] ? accFn(m.g, lt) : v(m.g); break; }
      case 'b': p[m.id] = v(m.g) > .5; break;
      case 's': p[m.id] = m.values[Math.max(0, Math.min(m.values.length - 1, Math.round(v(m.g))))]; break;
      case 'c': p[m.id] = { r: v(m.g + '_r') / 255, g: v(m.g + '_g') / 255, b: v(m.g + '_b') / 255, a: m.alpha ? v(m.g + '_a') / 255 : 1 }; break;
      case 'p': p[m.id] = { x: v(m.g + '_x'), y: v(m.g + '_y') }; break;
      case 'v3': p[m.id] = { x: v(m.g + '_x'), y: v(m.g + '_y'), z: v(m.g + '_z') }; break;
      case 'h': p[m.id] = { x: v(m.g + '_x'), y: v(m.g + '_y'), z: m.bias ? v(m.g + '_z') : 0 }; break;
    }
  }
  return p;
}
function scriptEnv(L, lt, proj) {
  const fps = (proj && proj.fps) || 30, dur = L ? Math.max(.001, L.dur) : 1, start = L ? L.start : 0;
  const env = { time: Math.max(0, Math.min(1, lt / dur)), duration: dur, fps, frame: Math.round((start + lt) * fps), absTime: start + lt, inTime: start, editMode: '', selected: false, velocity: { x: 0, y: 0 }, angularVelocity: 0, scaleVelocity: 0 };
  if (L && ML.geom) { /* kecepatan per frame dari geometri layer */
    try { const g1 = ML.geom(L, start + lt), g0 = ML.geom(L, start + lt - 1 / fps); env.velocity = { x: g1.x - g0.x, y: g1.y - g0.y }; env.angularVelocity = (g1.rot - g0.rot) * 180 / Math.PI; env.scaleVelocity = ((g1.sx + g1.sy) - (g0.sx + g0.sy)) / 2; } catch (e) { /* abaikan */ }
  }
  return env;
}
/* grup shader aktif untuk sebuah efek (dipanggil engine per frame) */
ML.xmlGroups = (type, vals, time) => {
  const d = ML.FXDEF[type], all = Object.keys(d.groups || {}).map(Number).sort((a, b) => a - b), fn = d.script ? scriptFn(d) : null;
  if (!fn) return all;
  const ctx = ML.fxCtx || {}, el = { shaderGroups: undefined, alpha: 1, text: '', transform: { location: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1 }, angle: 0 } };
  try { const p = scriptP(d, k => vals[k], time), r = fn(scriptEnv(ctx.L, time, ctx.proj), el, p, p) || el; return Array.isArray(r.shaderGroups) ? r.shaderGroups.filter(g => d.groups[g]) : all; } catch (e) { return all; }
};
/* efek penyetel properti (transform/opasitas/teks) -> penyesuaian layer pada waktu lokal lt */
ML.xmlAdj = (list, L, lt, proj, tAbs) => {
  const el = { alpha: 1, text: L.type === 'text' && L.text ? String(L.text.text) : '', transform: { location: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1 }, angle: 0 } };
  let used = false;
  for (const e of list) {
    const d = ML.FXDEF[e.type], fn = d && scriptFn(d); if (!fn) continue;
    const get = k => ML.evalAnim(e.p[k], lt), acc = (g, tt) => {
      const m = d.accOf[g], a = e.p[g]; if (!a) return 0;
      if (!a.k || !a.k.length) return ML.evalAnim(a, 0) * tt * m;
      const n = Math.max(8, Math.min(400, Math.ceil(tt * 24))); let s = 0, pv = ML.evalAnim(a, 0);
      for (let i = 1; i <= n; i++) { const cv = ML.evalAnim(a, tt * i / n); s += (pv + cv) / 2 * (tt / n); pv = cv; }
      return s * m;
    };
    try { const p = scriptP(d, get, lt, acc); fn(scriptEnv(L, lt, proj), el, p, p); used = true; } catch (er) { /* skrip rusak: abaikan */ }
  }
  if (!used) return null;
  const t = el.transform;
  return { L, t: tAbs, x: t.location.x, y: t.location.y, rot: t.angle * Math.PI / 180, sx: t.scale.x, sy: t.scale.y, alpha: Math.max(0, el.alpha), text: L.type === 'text' ? el.text : null };
};
/* geometri & teks layer memperhitungkan penyesuaian yang sedang aktif (hanya saat menggambar) */
{
  const g0 = ML.geom;
  ML.geom = function (L, t, dp) {
    const g = g0.call(this, L, t, dp), a = ML.fxAdj;
    if (!a || a.L !== L || Math.abs(a.t - t) > 1e-4) return g;
    return Object.assign({}, g, { x: g.x + a.x, y: g.y + a.y, rot: g.rot + a.rot, sx: g.sx * a.sx, sy: g.sy * a.sy });
  };
  const tc0 = ML.textCanvas;
  if (tc0) ML.textCanvas = function (L) {
    const a = ML.fxAdj;
    if (a && a.L === L && a.text != null && L.text && a.text !== String(L.text.text)) { const L2 = Object.create(L); L2.text = Object.assign({}, L.text, { text: a.text }); const cv = tc0(L2); L.bw = L2.bw; L.bh = L2.bh; return cv; }
    return tc0(L);
  };
}

/* ================= konversi XML -> definisi efek ================= */
ML.XML_ID = {}; ML.XML_THUMB = {};
const NOT_READY = new Set(['test', 'test2', 'test3', 'testblur', 'layernormtest', 'outline-bad', 'maskblur']);
function convert(raw, stem) {
  const doc = new DOMParser().parseFromString(raw, 'text/xml');
  const root = doc.documentElement; if (!root || doc.querySelector('parsererror')) return null;
  const dep = attr(root, 'deprecated') === 'true', eid = attr(root, 'id') || stem;
  const scs = [...root.getElementsByTagName('script')];
  if (scs.some(s => s.hasAttribute('external'))) return null;
  const script = scs.length ? scs[0].textContent : null;
  if (script && !/function\s+animate\s*\(/.test(script)) return null;
  const shs = [...root.getElementsByTagName('shader')], frags = shs.filter(s => (attr(s, 'type') || 'fragment') !== 'vertex'), verts = shs.filter(s => attr(s, 'type') === 'vertex');
  const prop = !frags.length;
  if (prop && !script) return null;
  /* tekstur: content (wajib bila ada shader) -> u_tex, comp -> u_bg, buffer -> FBO perantara, image/src -> gambar bawaan */
  const tmap = {}, bufs = [], imgs = []; let hasContent = false, hasComp = false;
  for (const t of root.getElementsByTagName('texture')) {
    const id = attr(t, 'id'), g = san(id || ''), st = attr(t, 'srcType') || (t.hasAttribute('src') ? 'image' : '');
    if (!id) return null;
    if (st === 'content') { if (hasContent) return null; hasContent = true; tmap[id] = ['u_tex', 'u_res']; }
    else if (st === 'comp') { hasComp = true; tmap[id] = ['u_bg', 'u_res']; }
    else if (st === 'buffer') { bufs.push({ id: g, ds: Math.max(1, Math.round(+attr(t, 'downsample')) || 1) }); tmap[id] = ['u_b_' + g, 'u_bs_' + g]; }
    else if (st === 'image' && attr(t, 'src')) { imgs.push({ id: g, src: attr(t, 'src') }); tmap[id] = ['u_i_' + g, 'u_is_' + g]; }
    else return null;
  }
  if (!prop && !hasContent) return null;
  /* urutan pass */
  let seq = null; const pe = root.getElementsByTagName('passes')[0];
  if (pe) {
    seq = [];
    for (const p of pe.getElementsByTagName('pass')) {
      const tg = attr(p, 'target'), sr = attr(p, 'src'); if (tg && !(tmap[tg] && tmap[tg][0].startsWith('u_b_'))) return null;
      seq.push({ target: tg ? san(tg) : null, effect: attr(p, 'effect') || null, src: sr ? san(sr) : null });
    }
    if (seq.length < 2 && !(seq[0] && seq[0].effect)) seq = null;
  }
  const st = {}, lm = raw.match(/<locale lang="en">([\s\S]*?)<\/locale>/);
  if (lm) for (const m of lm[1].matchAll(/<!--<string name="(\w+)">([\s\S]*?)<\/string>-->/g)) st[m[1]] = m[2];
  const labelOf = (el, oid) => st[oid] || st[(attr(el, 'label') || '').split('/').pop().replace('effect_param_', '')] || pretty(attr(el, 'label') || oid);

  /* parameter */
  const P = [], decl = [], init = [], pmap = [], accOf = {}, ren = [], pr = root.getElementsByTagName('params')[0]; if (!pr) return null;
  let hasOrient = false;
  for (const el of pr.getElementsByTagName('*')) {
    const t = el.tagName; let i = attr(el, 'id'); if (!i || t === 'texture' || t === 'preset') continue;
    const g = san(i), oid = i;
    if (RESERVED.has(i)) { ren.push(i); i = 'p_' + i; }
    const lab = labelOf(el, oid);
    if (t === 'orient') { hasOrient = true; decl.push(`mat4 ${i};`); init.push(`${i}=u_orient;`); continue; }
    if (t === 'spinner' || t === 'slider') {
      const d = nums(attr(el, 'default'), 1, [0])[0], ty = attr(el, 'type'); let lo = nums(attr(el, 'min'), 1, [null])[0], hi = nums(attr(el, 'max'), 1, [null])[0];
      if (lo == null) lo = d < 0 ? d * 10 - 100 : 0; if (hi == null) hi = Math.max(d * 10, 100);
      P.push(NUM(g, lab, lo, hi, d, nums(attr(el, 'step'), 1, [0.01])[0], ty === 'angle' ? '°' : ty === 'seconds' ? ' s' : '')); decl.push(`float ${i};`); init.push(`${i}=u_${g};`);
      pmap.push({ id: oid, g, kind: 'n' }); if (ty === 'hz') accOf[g] = 1; else if (ty === 'rpm') accOf[g] = 6;
    } else if (t === 'switch') {
      P.push(SEL(g, lab, ['Mati', 'Hidup'], attr(el, 'default') === 'true' ? 1 : 0)); decl.push(`bool ${i};`); init.push(`${i}=u_${g}>.5;`); pmap.push({ id: oid, g, kind: 'b' });
    } else if (t === 'selector') {
      const ch = [...el.getElementsByTagName('choice')].map(c => [Math.round(+attr(c, 'value')), st[(attr(c, 'label') || '').split('/').pop().replace('effect_param_', '')] || pretty(attr(c, 'label') || 'Opsi')]);
      if (!ch.length) return null;
      const dv = Math.round(+(attr(el, 'default') || ch[0][0])), di = Math.max(0, ch.findIndex(c => c[0] === dv));
      P.push(SEL(g, lab, ch.map(c => c[1]), di));
      let ex = String(ch[ch.length - 1][0]); for (let n = ch.length - 2; n >= 0; n--) ex = `(v==${n}?${ch[n][0]}:${ex})`;
      decl.push(`int ${i};`); init.push(`{int v=int(u_${g}+.5); ${i}=${ex};}`); pmap.push({ id: oid, g, kind: 's', values: ch.map(c => c[0]) });
    } else if (t === 'color') {
      let h = (attr(el, 'default') || '#FFFFFFFF').replace('#', ''); if (h.length === 6) h = 'FF' + h;
      const [a, r, gg, b] = [0, 2, 4, 6].map(n => parseInt(h.substr(n, 2), 16)), al = attr(el, 'alpha') === 'true';
      P.push(NUM(g + '_r', lab + ' (R)', 0, 255, r, 1), NUM(g + '_g', lab + ' (G)', 0, 255, gg, 1), NUM(g + '_b', lab + ' (B)', 0, 255, b, 1)); if (al) P.push(NUM(g + '_a', lab + ' (A)', 0, 255, a, 1));
      decl.push(`vec4 ${i};`); init.push(`${i}=vec4(u_${g}_r,u_${g}_g,u_${g}_b,${al ? 'u_' + g + '_a' : '255.'})/255.;`); pmap.push({ id: oid, g, kind: 'c', alpha: al });
    } else if (t === 'point') {
      const d = nums(attr(el, 'default'), 2, [0, 0]), lo = nums(attr(el, 'min'), 2, [-1000, -1000]), hi = nums(attr(el, 'max'), 2, [1000, 1000]), sp = nums(attr(el, 'step'), 1, [1])[0];
      ['x', 'y'].forEach((s, n) => P.push(NUM(g + '_' + s, lab + ' ' + s.toUpperCase(), lo[n], hi[n], d[n], sp)));
      decl.push(`vec2 ${i};`); init.push(`${i}=vec2(u_${g}_x,u_${g}_y);`); pmap.push({ id: oid, g, kind: 'p' });
    } else if (t === 'hue-disc') {
      /* (hue °, saturasi, bias): x,y,z pada shader */
      const single = pr.getElementsByTagName('hue-disc').length === 1, d = nums(attr(el, 'default'), 3, [0, single ? 0.6 : 0, 0]), bias = attr(el, 'bias') === 'true';
      P.push(NUM(g + '_x', lab + ' (Hue)', 0, 360, d[0], 1, '°'), NUM(g + '_y', lab + ' (Saturasi)', 0, 1, d[1], 0.01));
      if (bias) P.push(NUM(g + '_z', lab + ' (Bias)', -1, 1, d[2], 0.01));
      decl.push(`vec3 ${i};`); init.push(`${i}=vec3(u_${g}_x,u_${g}_y,${bias ? 'u_' + g + '_z' : '0.'});`); pmap.push({ id: oid, g, kind: 'h', bias });
    } else if (t === 'xyz') {
      const d = nums(attr(el, 'default'), 3, [0, 0, 0]), sp = nums(attr(el, 'step'), 1, [0.1])[0], rot = attr(el, 'type') === 'rotate';
      ['x', 'y', 'z'].forEach((a, n) => P.push(NUM(g + '_' + a, lab + ' ' + a.toUpperCase(), rot ? -3600 : -2000, rot ? 3600 : 2000, d[n], rot ? 1 : sp, rot ? '°' : '')));
      decl.push(`vec3 ${i};`); init.push(`${i}=vec3(u_${g}_x,u_${g}_y,u_${g}_z);`); pmap.push({ id: oid, g, kind: 'v3' });
    } else if (t === 'float') { decl.push(`float ${i};`); init.push(`${i}=${(+attr(el, 'value') || 0).toFixed(6)};`); }
  }
  if (!P.length && !hasComp && !prop && !frags.length) return null;
  const itEl = root.getElementsByTagName('iterations')[0], iterG = itEl && attr(itEl, 'param') ? san(attr(itEl, 'param')) : null;

  /* transformasi kode shader */
  const xf = (code, vert) => {
    for (const t of code.match(/\bac[A-Z]\w*/g) || []) if (!OK_AC.has(t)) return null;
    code = code.replace(/^\s*(precision\s.*|#version.*)$/gm, '')
      .replace(/\b(\w+)\.(texture|size)\b/g, (m, id, w) => tmap[id] ? tmap[id][w === 'texture' ? 0 : 1] : m)
      .replace(/\b\w+\.texture\b/g, 'u_tex').replace(/\btexture2DCv(?:Cv)?\b/g, 'am_tCv').replace(/\btexture2D\b/g, 'am_t2D')
      .replace(/void\s+main\s*\(\s*(?:void)?\s*\)/, vert ? 'void am_vmain()' : 'void am_main()');
    code = fixLoops(code); if (!vert && ARRAYFIX.has(stem)) code = fixArrays(code);
    for (const r of ren) code = code.replace(new RegExp('\\b' + r + '\\b', 'g'), 'p_' + r);
    return code;
  };
  const UNI = 'uniform float u_pass; uniform vec4 u_V; uniform float u_ls;\n' + bufs.map(b => `uniform sampler2D u_b_${b.id}; uniform vec2 u_bs_${b.id};`).join('\n') + imgs.map(b => `uniform sampler2D u_i_${b.id}; uniform vec2 u_is_${b.id};`).join('\n') + (hasOrient ? '\nuniform mat4 u_orient;' : '') + '\n';
  const mkFrag = sh => { const c = xf(sh.textContent || '', false); if (c == null || !c.includes('am_main') || !c.includes('gl_FragColor')) return null; return UNI + PRE + decl.join('\n') + '\n' + c + '\nvoid main(){ am_init(); ' + init.join(' ') + ' am_main(); }'; };
  const mkVert = sh => { const c = xf(sh.textContent || '', true); if (c == null || !c.includes('am_vmain')) return null; return decl.join('\n') + '\n' + c + '\nvoid main(){ ' + init.join(' ') + ' am_vmain(); }'; };

  const def = { layerSpace: LAYERSPACE.has(stem), name: '', icon: 'fx', xml: true, params: P, pmap, accOf, needsBg: hasComp, passes: seq, bufs, imgs, iter: iterG, script };
  const grouped = frags.some(s => s.hasAttribute('group'));
  if (prop) { def.prop = true; def.special = true; }
  else if (grouped) {
    def.groups = {}; def.scriptGroups = true;
    const vdef = verts.find(v => !v.hasAttribute('group'));
    for (const s of frags) {
      const gid = +(attr(s, 'group') || 0), f = mkFrag(s); if (!f) continue;
      const vs = verts.find(v => +(attr(v, 'group') || -1) === gid) || vdef, vtxt = vs ? mkVert(vs) : null; if (vs && !vtxt) continue;
      def.groups[gid] = { frag: f, vert: vtxt };
    }
    const ks = Object.keys(def.groups).map(Number).sort((a, b) => a - b); if (!ks.length) return null; def.defGroup = ks[0];
  } else {
    if (frags.length !== 1) return null;
    def.frag = mkFrag(frags[0]); if (!def.frag) return null;
    if (verts.length) { if (verts.length !== 1) return null; def.vert = mkVert(verts[0]); if (!def.vert) return null; }
  }
  const nm = st.name || pretty(stem);
  return { key: 'x_' + san(stem), id: eid, cat: dep ? CAT.old : (CAT[attr(root, 'category')] || 'Lainnya'), def: Object.assign(def, { name: nm + (dep ? ' (lama)' : ' (XML)') }) };
}

ML.FX_XML = [];
const byCat = {}, cats = [];
function register(raw, stem) {
  if (NOT_READY.has(stem)) return false;
  let r; try { r = convert(raw, stem); } catch (e) { console.warn('XML', stem, e.message); return false; }
  if (!r || ML.FXDEF[r.key]) return false;
  ML.FXDEF[r.key] = r.def; ML.XML_ID[r.id] = r.key;
  if (ML.XML_THUMB[stem]) r.def.thumbFile = ML.XML_THUMB[stem];
  r.def.stem = stem; ML.FX_XML.push(r.key); ML.FX_ORDER.push(r.key);
  let row = byCat[r.cat];
  if (!row) { row = byCat[r.cat] = ['XML · ' + r.cat, [], GRAD[r.cat] || GRAD.Lainnya]; cats.push(row); if (ML.FX_CATS) ML.FX_CATS.push(row); }
  row[1].push(r.key); return true;
}
const hide = bad => {
  ML.FX_XML = ML.FX_XML.filter(k => !bad.has(k));
  for (let j = ML.FX_ORDER.length - 1; j >= 0; j--) if (bad.has(ML.FX_ORDER[j])) ML.FX_ORDER.splice(j, 1);
  cats.forEach(c => { c[1] = c[1].filter(k => !bad.has(k)); });
  if (ML.FX_CATS) for (let j = ML.FX_CATS.length - 1; j >= 0; j--) if (cats.includes(ML.FX_CATS[j]) && !ML.FX_CATS[j][1].length) ML.FX_CATS.splice(j, 1);
  ML.fxThumbCache = null;
};

/* Cek kompilasi GPU sekali saja; hasil gagal disimpan sehingga pembukaan berikutnya tanpa kompilasi */
function verify() {
  let fx; try { fx = new ML.FX(); } catch (e) { return; } if (!fx.ok) return;
  let gpu = ''; try { const x = fx.gl.getExtension('WEBGL_debug_renderer_info'); gpu = x ? fx.gl.getParameter(x.UNMASKED_RENDERER_WEBGL) : ''; } catch (e) { /* abaikan */ }
  const ck = 'mlxfx_bad2:' + ML.FX_XML.length + ':' + gpu; let cached = null;
  try { cached = JSON.parse(localStorage.getItem(ck)); } catch (e) { /* abaikan */ }
  const list = ML.FX_XML.filter(k => !ML.FXDEF[k].prop);
  const apply = bad => { const del = {}; (bad || []).forEach(s => { const [k, g] = s.split('|'); if (g != null) (del[k] = del[k] || []).push(g); else del[k] = null; });
    const hideSet = new Set(); for (const k in del) { const d = ML.FXDEF[k]; if (del[k] === null || !d.groups) hideSet.add(k); else { del[k].forEach(g => delete d.groups[g]); if (!Object.keys(d.groups).length) hideSet.add(k); else if (!d.groups[d.defGroup]) d.defGroup = +Object.keys(d.groups)[0]; } }
    if (hideSet.size) hide(hideSet); };
  if (cached) { fx.dispose(); apply(cached); return; }
  const bad = []; let i = 0;
  (function step() {
    for (let n = 0; n < 4 && i < list.length; n++, i++) {
      const k = list[i], d = ML.FXDEF[k];
      if (d.groups) { for (const g in d.groups) if (!fx.prog(k, +g)) bad.push(k + '|' + g); }
      else if (!fx.prog(k)) bad.push(k);
    }
    if (i < list.length) return setTimeout(step, 40);
    fx.dispose(); if (bad.length) { apply(bad); console.info('Efek XML disembunyikan (gagal kompilasi):', bad.join(', ')); }
    try { localStorage.setItem(ck, JSON.stringify(bad)); } catch (e) { /* abaikan */ }
  })();
}

async function load() {
  let list; try { const r = await fetch('effects/index.json'); if (!r.ok) return; list = await r.json(); } catch (e) { return; }
  try { const r = await fetch('effects/thumbs.json'); if (r.ok) ML.XML_THUMB = await r.json(); } catch (e) { /* tanpa thumbnail Alight */ }
  let i = 0;
  const worker = async () => { while (i < list.length) { const f = list[i++]; try { const r = await fetch('effects/' + f); if (r.ok) register(await r.text(), f.replace(/\.xml$/i, '')); } catch (e) { /* lewati */ } } };
  await Promise.all(Array.from({ length: 6 }, worker));
  ML.FX_XML.sort(); ML.FX_XML.forEach(k => (ML.FXDEF[k].imgs || []).forEach(b => ML.xmlImage(b.src))); setTimeout(verify, 300);
  if (ML.xmlReady) ML.xmlReady();
}
ML.xmlFx = { add: register, load, verify };
setTimeout(load, 200);
})();
