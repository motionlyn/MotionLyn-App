'use strict';
/* Model 3D (.glb): material + tekstur + warna vertex, animasi (node & skinning), varian material, scene, bagian tampil/sembunyi */
(function () {
const cache = {}; let gl, cv, pg, lc, fid = 0;
const mul = (a, b) => { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let t = 0; for (let k = 0; k < 4; k++) t += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = t; } return o; };
const I4 = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const rX = a => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]; };
const rY = a => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]; };
const rZ = a => { const c = Math.cos(a), s = Math.sin(a); return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; };
const nrm = q => { const l = Math.hypot(...q) || 1; return q.map(x => x / l); };
const trsM = (t, q, s) => { const [x, y, z, w] = q; return [(1 - 2 * (y * y + z * z)) * s[0], 2 * (x * y + z * w) * s[0], 2 * (x * z - y * w) * s[0], 0, 2 * (x * y - z * w) * s[1], (1 - 2 * (x * x + z * z)) * s[1], 2 * (y * z + x * w) * s[1], 0, 2 * (x * z + y * w) * s[2], 2 * (y * z - x * w) * s[2], (1 - 2 * (x * x + y * y)) * s[2], 0, t[0], t[1], t[2], 1]; };
const sample = (c, t) => {
  const nc = c.nc || (c.p === 'rotation' ? 4 : 3), T = c.t, n = T.length, cs = c.i === 'CUBICSPLINE', st = cs ? nc * 3 : nc, vo = cs ? nc : 0, V = c.v, at = (i, o) => V.slice(i * st + o, i * st + o + nc);
  if (t <= T[0] || n === 1) return at(0, vo); if (t >= T[n - 1]) return at(n - 1, vo);
  let i = 0; while (T[i + 1] < t) i++;
  const dt = T[i + 1] - T[i], u = (t - T[i]) / dt, a = at(i, vo), b = at(i + 1, vo);
  if (c.i === 'STEP') return a;
  if (cs) { const bo = at(i, nc * 2), ai = at(i + 1, 0), u2 = u * u, u3 = u2 * u, r = a.map((x, k) => (2 * u3 - 3 * u2 + 1) * x + dt * (u3 - 2 * u2 + u) * bo[k] + (-2 * u3 + 3 * u2) * b[k] + dt * (u3 - u2) * ai[k]); return c.p === 'rotation' ? nrm(r) : r; }
  if (c.p === 'rotation') { const sg = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] < 0 ? -1 : 1; return nrm(a.map((x, k) => x * (1 - u) + sg * b[k] * u)); }
  return a.map((x, k) => x + (b[k] - x) * u);
};
function pose(m, o, lt, bn) {
  const loc = m.nodes.map(n => ({ t: n.translation || [0, 0, 0], r: n.rotation || [0, 0, 0, 1], s: n.scale || [1, 1, 1] }));
  const wts = m.nodes.map((n, i) => m.w0[i] ? m.w0[i].slice() : null), sel = o.pose === 1 ? -1 : (o.anim === undefined ? -2 : o.anim), used = new Set();
  for (const an of (sel === -1 ? [] : sel >= 0 ? [m.anims[sel]] : m.anims)) {
    if (!an || !(an.len > 0)) continue; let t = lt * (o.speed || 1); t = o.loop === 0 ? Math.min(t, an.len) : t % an.len; const mine = [];
    for (const c of an.ch) { const key = c.n + c.p; if (sel === -2 && used.has(key)) continue; mine.push(key); if (c.p === 'weights') wts[c.n] = sample(c, t); else loc[c.n][c.p[0]] = sample(c, t); }
    mine.forEach(k => used.add(k));
  }
  
  if (bn) {
    const qm = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]], d = Math.PI / 360;
    for (const i in bn) { const e = bn[i], l = loc[i]; if (!l) continue; if (e[3] || e[4] || e[5]) l.t = [l.t[0] + e[3], l.t[1] + e[4], l.t[2] + e[5]]; if (e[6] !== 100) l.s = l.s.map(x => x * e[6] / 100); l.r = qm(l.r, qm([0, 0, Math.sin(e[2] * d), Math.cos(e[2] * d)], qm([0, Math.sin(e[1] * d), 0, Math.cos(e[1] * d)], [Math.sin(e[0] * d), 0, 0, Math.cos(e[0] * d)]))); }
  }
  const W = [], vis = [];
  const walk = (ni, pm, hid) => { const n = m.nodes[ni], l = loc[ni], hd = hid || (o.hide && o.hide[ni]); W[ni] = mul(pm, n.matrix ? n.matrix : trsM(l.t, l.r, l.s)); vis[ni] = !hd; (n.children || []).forEach(c => walk(c, W[ni], hd)); };
  const sc = m.j.scenes[o.scene || 0] || m.j.scenes[0]; (sc.nodes || []).forEach(r => walk(r, I4(), false));
  return { W, vis, wts };
}
function skin(m, pr, W, P0, N0) {
  P0 = P0 || pr.P; N0 = N0 || pr.N;
  const sk = m.skins[pr.skin], jm = sk.joints.map((jn, k) => mul(W[jn] || I4(), sk.ibm ? sk.ibm.slice(k * 16, k * 16 + 16) : I4())), n = pr.n, P = new Float32Array(n * 3), N = new Float32Array(n * 3);
  for (let v = 0; v < n; v++) {
    const x = P0[v * 3], y = P0[v * 3 + 1], z = P0[v * 3 + 2], a = N0[v * 3], b = N0[v * 3 + 1], c = N0[v * 3 + 2];
    for (let k = 0; k < 4; k++) {
      const w = pr.W[v * 4 + k]; if (!w) continue; const M = jm[pr.J[v * 4 + k]]; if (!M) continue;
      P[v * 3] += w * (M[0] * x + M[4] * y + M[8] * z + M[12]); P[v * 3 + 1] += w * (M[1] * x + M[5] * y + M[9] * z + M[13]); P[v * 3 + 2] += w * (M[2] * x + M[6] * y + M[10] * z + M[14]);
      N[v * 3] += w * (M[0] * a + M[4] * b + M[8] * c); N[v * 3 + 1] += w * (M[1] * a + M[5] * b + M[9] * c); N[v * 3 + 2] += w * (M[2] * a + M[6] * b + M[10] * c);
    }
  }
  return [P, N];
}
ML.glbParse = buf => {
  const dv = new DataView(buf); if (buf.byteLength < 20 || dv.getUint32(0, true) !== 0x46546C67) throw new Error('bukan file .glb');
  let o = 12, j = null, bin = null;
  while (o + 8 <= buf.byteLength) { const len = dv.getUint32(o, true), ty = dv.getUint32(o + 4, true), d = new Uint8Array(buf, o + 8, len); if (ty === 0x4E4F534A) j = JSON.parse(new TextDecoder().decode(d)); else if (ty === 0x004E4942 && !bin) bin = d; o += 8 + len; }
  if (!j || !bin) throw new Error('data GLB tidak lengkap');
  const req = j.extensionsRequired || [];
  if (req.includes('KHR_draco_mesh_compression')) throw new Error('model terkompresi Draco, ekspor ulang tanpa kompresi');
  if (req.some(x => /meshopt/i.test(x))) throw new Error('model terkompresi Meshopt, ekspor ulang tanpa kompresi');
  const CT = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 }, SZ = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
  const FN = { 5120: 'getInt8', 5121: 'getUint8', 5122: 'getInt16', 5123: 'getUint16', 5125: 'getUint32', 5126: 'getFloat32' }, dvw = new DataView(bin.buffer);
  const rd = i => {
    const a = j.accessors[i], c = CT[a.type], sz = SZ[a.componentType], f = FN[a.componentType], out = new Array(a.count * c).fill(0);
    if (a.bufferView != null) {
      const bv = j.bufferViews[a.bufferView], st = bv.byteStride || sz * c, b0 = bin.byteOffset + (bv.byteOffset || 0) + (a.byteOffset || 0);
      for (let n = 0; n < a.count; n++) for (let k = 0; k < c; k++) out[n * c + k] = dvw[f](b0 + n * st + k * sz, true);
    }
    if (a.sparse) {
      const sp = a.sparse, ib = j.bufferViews[sp.indices.bufferView], vb = j.bufferViews[sp.values.bufferView], isz = SZ[sp.indices.componentType], ifn = FN[sp.indices.componentType];
      const i0 = bin.byteOffset + (ib.byteOffset || 0) + (sp.indices.byteOffset || 0), v0 = bin.byteOffset + (vb.byteOffset || 0) + (sp.values.byteOffset || 0);
      for (let n = 0; n < sp.count; n++) { const ix = dvw[ifn](i0 + n * isz, true); for (let k = 0; k < c; k++) out[ix * c + k] = dvw[f](v0 + (n * c + k) * sz, true); }
    }
    return out;
  };
  const nd = i => ({ 5121: 255, 5123: 65535 }[j.accessors[i].componentType] || 1);
  const rdN = i => { const o = rd(i), a = j.accessors[i], dv = a.normalized ? { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 }[a.componentType] : 0; if (dv) for (let k = 0; k < o.length; k++) o[k] = Math.max(o[k] / dv, -1); return o; };
  const m = { j, bin, nodes: j.nodes || [], prims: [], skins: [], anims: [], bm: [], gt: {}, w0: [] };
  m.nodes.forEach((n, ni) => {
    if (n.mesh == null) return; const ms = j.meshes[n.mesh];
    for (const pr of ms.primitives) {
      const A = pr.attributes, md = pr.mode == null ? 4 : pr.mode; if (![4, 5, 6].includes(md) || A.POSITION == null) continue;
      const pos = rdN(A.POSITION); let idx = pr.indices != null ? rd(pr.indices) : null;
      if (md !== 4) { const base = idx || Array.from({ length: pos.length / 3 }, (_, q) => q), o2 = []; for (let q = 0; q + 2 < base.length; q++) { if (md === 5) { if (q % 2) o2.push(base[q + 1], base[q], base[q + 2]); else o2.push(base[q], base[q + 1], base[q + 2]); } else o2.push(base[0], base[q + 1], base[q + 2]); } idx = o2; }
      const cnt = idx ? idx.length : pos.length / 3, n3 = cnt - cnt % 3;
      const g = (arr, c, div) => { if (!arr) return null; const r = new Float32Array(n3 * c); for (let t = 0; t < n3; t++) { const v = idx ? idx[t] : t; for (let k = 0; k < c; k++) r[t * c + k] = arr[v * c + k] / (div || 1); } return r; };
      const P = g(pos, 3); let N = A.NORMAL != null ? g(rdN(A.NORMAL), 3) : null;
      if (!N) { N = new Float32Array(n3 * 3); for (let i = 0; i < n3 * 3; i += 9) { const ax = P[i + 3] - P[i], ay = P[i + 4] - P[i + 1], az = P[i + 5] - P[i + 2], bx = P[i + 6] - P[i], by = P[i + 7] - P[i + 1], bz = P[i + 8] - P[i + 2]; let x = ay * bz - az * by, y = az * bx - ax * bz, z = ax * by - ay * bx; const l = Math.hypot(x, y, z) || 1; for (let k = 0; k < 3; k++) { N[i + k * 3] = x / l; N[i + k * 3 + 1] = y / l; N[i + k * 3 + 2] = z / l; } } }
      let C = null; if (A.COLOR_0 != null) { const ca = j.accessors[A.COLOR_0], cc = ca.type === 'VEC4' ? 4 : 3, raw = rd(A.COLOR_0), dd = nd(A.COLOR_0); C = new Float32Array(n3 * 4); for (let t = 0; t < n3; t++) { const v = idx ? idx[t] : t; for (let k = 0; k < 4; k++) C[t * 4 + k] = k < cc ? raw[v * cc + k] / dd : 1; } }
      const sk = n.skin != null && A.JOINTS_0 != null && A.WEIGHTS_0 != null; let J = null, Wt = null;
      if (sk) { J = g(rd(A.JOINTS_0), 4); Wt = g(rd(A.WEIGHTS_0), 4, nd(A.WEIGHTS_0)); for (let v = 0; v < n3; v++) { const s4 = Wt[v * 4] + Wt[v * 4 + 1] + Wt[v * 4 + 2] + Wt[v * 4 + 3]; if (s4 > 0 && Math.abs(s4 - 1) > 1e-3) for (let k = 0; k < 4; k++) Wt[v * 4 + k] /= s4; } }
      const vm = (pr.extensions && pr.extensions.KHR_materials_variants && pr.extensions.KHR_materials_variants.mappings) || [];
      const T = (pr.targets || []).map(tg => ({ P: tg.POSITION != null ? g(rdN(tg.POSITION), 3) : new Float32Array(n3 * 3), N: tg.NORMAL != null ? g(rdN(tg.NORMAL), 3) : null }));
      if (T.length && !m.w0[ni]) m.w0[ni] = Array.from({ length: T.length }, (_, q) => (n.weights || ms.weights || [])[q] || 0);
      m.prims.push({ node: ni, P, N, UV: A.TEXCOORD_0 != null ? g(rdN(A.TEXCOORD_0), 2) : null, C, skin: sk ? n.skin : null, J, W: Wt, mat: pr.material, vm, n: n3, T: T.length ? T : null });
    }
  });
  if (!m.prims.length) throw new Error('model kosong');
  m.skins = (j.skins || []).map(s => ({ joints: s.joints, ibm: s.inverseBindMatrices != null ? rd(s.inverseBindMatrices) : null }));
  m.anims = (j.animations || []).map((a, i) => { const ch = a.channels.filter(c => c.target.node != null && ['translation', 'rotation', 'scale', 'weights'].includes(c.target.path)).map(c => { const sp = a.samplers[c.sampler], T = rd(sp.input), V = rd(sp.output), cs = sp.interpolation === 'CUBICSPLINE'; return { n: c.target.node, p: c.target.path, t: T, v: V, i: sp.interpolation || 'LINEAR', nc: c.target.path === 'weights' ? Math.max(1, Math.round(V.length / (T.length * (cs ? 3 : 1)))) : 0 }; }); return { name: a.name || 'Animasi ' + (i + 1), ch, len: Math.max(0, ...ch.map(c => c.t[c.t.length - 1])) }; });
  const { W } = pose(m, {}, 0), mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (const pr of m.prims) {
    const sk = pr.skin != null, Pw = sk ? skin(m, pr, W)[0] : pr.P, M = sk ? I4() : W[pr.node]; if (!M) continue;
    for (let v = 0; v < pr.n; v++) { const x = Pw[v * 3], y = Pw[v * 3 + 1], z = Pw[v * 3 + 2], q = [M[0] * x + M[4] * y + M[8] * z + M[12], M[1] * x + M[5] * y + M[9] * z + M[13], M[2] * x + M[6] * y + M[10] * z + M[14]]; for (let k = 0; k < 3; k++) { if (q[k] < mn[k]) mn[k] = q[k]; if (q[k] > mx[k]) mx[k] = q[k]; } }
  }
  const ce = mn.map((v, k) => (v + mx[k]) / 2); m.ce = ce; m.k = 1 / Math.max(1e-6, Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) / 2); m.y0 = (mn[1] - ce[1]) * m.k;
  const ext = j.extensions && j.extensions.KHR_materials_variants;
  m.info = { anims: m.anims.map(a => a.name), variants: ext ? ext.variants.map((v, i) => v.name || 'Varian ' + (i + 1)) : [], scenes: (j.scenes || []).length, morphs: Math.max(0, ...m.prims.map(p => (p.T || []).length)),
    bones: (() => { const dp = {}, wk = (i, d) => { dp[i] = d; (m.nodes[i].children || []).forEach(c => wk(c, d + 1)); }; const sc = (j.scenes && (j.scenes[j.scene || 0] || j.scenes[0])) || { nodes: m.nodes.map((n, i) => i) }; (sc.nodes || []).forEach(r => wk(r, 0)); const mk = i => ({ i, name: m.nodes[i].name || 'Node ' + i, d: dp[i] || 0, t: Math.hypot(...(m.nodes[i].translation || [0, 0, 0])) }); const s = new Set(); (j.skins || []).forEach(k => k.joints.forEach(x => s.add(x))); return { joints: [...s].sort((a, b) => a - b).slice(0, 400).map(mk), all: m.nodes.map((n, i) => i).slice(0, 600).map(mk) }; })(),
    parts: m.nodes.map((n, i) => n.mesh != null ? { i, name: n.name || 'Mesh ' + i } : null).filter(Boolean).slice(0, 40) };
  return m;
};
function deform(m, pr, W, wts, sk) {
  if (pr.dcf === fid && pr.dcw === W) return pr.dc; pr.dcf = fid; pr.dcw = W; let P = pr.P, N = pr.N, mo = false; const w = wts[pr.node];
  if (pr.T && w) for (let k = 0; k < pr.T.length; k++) {
    const wk = w[k]; if (!wk || Math.abs(wk) < 1e-4) continue;
    if (!mo) { P = Float32Array.from(P); N = Float32Array.from(N); mo = true; }
    const t = pr.T[k], tp = t.P, tn = t.N; for (let i = 0; i < P.length; i++) P[i] += wk * tp[i]; if (tn) for (let i = 0; i < N.length; i++) N[i] += wk * tn[i];
  }
  if (sk) { [P, N] = skin(m, pr, W, P, N); mo = true; }
  return (pr.dc = mo ? [P, N] : null);
}
ML.glbB64 = buf => { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768)); return btoa(s); };
const model = L => modelB(L.glb.b64);
const modelB = b64 => {
  const key = b64.length + b64.slice(0, 48) + b64.slice(b64.length >> 1, (b64.length >> 1) + 48) + b64.slice(-48); let m = cache[key];
  if (m === undefined) {
    try { const b = atob(b64), u = new Uint8Array(b.length); for (let i = 0; i < u.length; i++) u[i] = b.charCodeAt(i); m = cache[key] = ML.glbParse(u.buffer); }
    catch (e) { m = cache[key] = null; ML.toast('Model 3D gagal: ' + e.message); }
  }
  return m;
};
ML.glbInfo = L => { const m = model(L); return m ? m.info : null; };
/** letakkan model pendamping tepat di lantai map (isi Y otomatis) */
ML.glbFloor = L => { if (!L.glb || !L.glb.mod) return; const m = model(L), mc = modelB(L.glb.mod.b64); if (!m || !mc || !L.p.m_y) return; const s = (L.p.m_ms ? L.p.m_ms.v : 12) / 100; L.p.m_y.v = m.y0 - mc.y0 * s; L.p.m_y.k = []; };
/* ---------- Preset pose: retarget otomatis ke rig humanoid (berbasis arah tulang, tidak bergantung orientasi rig) ---------- */
const qm = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
const qi = q => [-q[0], -q[1], -q[2], q[3]];
const vsub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], vadd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], vsc = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const vdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], vcr = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const vn = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const qrot = (q, v) => { const u = [q[0], q[1], q[2]], t = vsc(vcr(u, v), 2), c = vcr(u, t); return [v[0] + q[3] * t[0] + c[0], v[1] + q[3] * t[1] + c[1], v[2] + q[3] * t[2] + c[2]]; };
const qarc = (a, b) => { const d = vdot(a, b); if (d < -0.999999) { let ax = vcr([1, 0, 0], a); if (Math.hypot(...ax) < 1e-3) ax = vcr([0, 1, 0], a); ax = vn(ax); return [ax[0], ax[1], ax[2], 0]; } const c = vcr(a, b); return nrm([c[0], c[1], c[2], 1 + d]); };
const qax = (ax, deg) => { const h = deg * Math.PI / 360, s = Math.sin(h), a = vn(ax); return [a[0] * s, a[1] * s, a[2] * s, Math.cos(h)]; };

/** nama tulang -> { side:'L'|'R'|null, part, fg } ; null bila bukan tulang tubuh utama */
function boneKind(nm) {
  const t = String(nm).replace(/([a-z])([A-Z])/g, '$1_$2').replace(/([A-Za-z])(\d)/g, '$1_$2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean), s = ' ' + t.join(' ') + ' ';
  if (/ (end|top|nub|ik|pole|target|twist|roll|helper|ctrl|ctl|tip|offset|jiggle|physics|spring|ear|ears)( |$)/.test(s)) return null;
  if (/hair|skirt|tail|cloth|bust|breast|ribbon|eye|jaw|tongue|teeth|brow|lash|cape|cloak|sleeve|bangs|acc/.test(s)) return null;
  const has = w => t.includes(w), side = (has('left') || has('l')) ? 'L' : (has('right') || has('r')) ? 'R' : null, j = t.join('');
  const fg = has('thumb') ? 'thumb' : has('index') ? 'index' : has('middle') ? 'middle' : has('ring') ? 'ring' : (has('pinky') || has('little') || has('pinkie')) ? 'pinky' : null;
  if (fg) return side ? { side, part: 'finger', fg } : null;
  if (/forearm|lowerarm|elbow/.test(j) || (has('lower') && has('arm')) || has('fore')) return { side, part: 'low' };
  if (has('hand') || has('wrist')) return { side, part: 'hand' };
  if (has('shoulder') || has('clavicle') || has('collar')) return { side, part: 'sh' };
  if (has('arm') || /upperarm/.test(j)) return { side, part: 'up' };
  if (/thigh|upleg|upperleg/.test(j) || (has('up') && has('leg')) || (has('upper') && has('leg'))) return { side, part: 'thigh' };
  if (/calf|shin|lowerleg|knee/.test(j) || (has('lower') && has('leg')) || has('leg')) return { side, part: 'shin' };
  if (has('foot') || has('ankle')) return { side, part: 'foot' };
  if (has('pelvis') || has('hips') || has('hip')) return { side: null, part: 'hips' };
  if (has('neck')) return { side: null, part: 'neck' };
  if (has('head') || has('skull')) return { side: null, part: 'head' };
  if (/spine|chest|torso|abdomen|waist/.test(j)) return { side: null, part: 'spine' };
  return null;
}

function solvePreset(m, id) {
  const N = m.nodes.length, par = new Array(N).fill(-1), dp = new Array(N).fill(0);
  m.nodes.forEach((n, i) => (n.children || []).forEach(c => { par[c] = i; }));
  const sc = (m.j.scenes && (m.j.scenes[m.j.scene || 0] || m.j.scenes[0])) || { nodes: m.nodes.map((n, i) => i).filter(i => par[i] < 0) }, roots = sc.nodes || [];
  const rest = m.nodes.map(n => ({ t: n.translation || [0, 0, 0], r: n.rotation || [0, 0, 0, 1], s: n.scale || [1, 1, 1] })), lr = rest.map(x => x.r.slice());
  let W, Qw; const mkd = (i, d) => { dp[i] = d; (m.nodes[i].children || []).forEach(c => mkd(c, d + 1)); }; roots.forEach(r => mkd(r, 0));
  const calc = () => { W = []; Qw = []; const walk = (i, pm, pq) => { const n = m.nodes[i]; W[i] = mul(pm, n.matrix ? n.matrix : trsM(rest[i].t, lr[i], rest[i].s)); Qw[i] = n.matrix ? pq : qm(pq, lr[i]); (n.children || []).forEach(c => walk(c, W[i], Qw[i])); }; roots.forEach(r => walk(r, I4(), [0, 0, 0, 1])); };
  calc(); const Q0 = Qw.map(q => q && q.slice()), P0 = W.map(w => w && [w[12], w[13], w[14]]), pos = i => [W[i][12], W[i][13], W[i][14]];

  // --- kenali tulang ---
  const sk = new Set(); (m.skins || []).forEach(s => (s.joints || []).forEach(x => sk.add(x)));
  const ent = []; m.nodes.forEach((n, i) => { if (!W[i]) return; const k = boneKind(n.name || ''); if (k) ent.push(Object.assign({ i }, k)); });
  const srt = (a, b) => (sk.has(a.i) ? 0 : 1) - (sk.has(b.i) ? 0 : 1) || dp[a.i] - dp[b.i] || a.i - b.i;
  const one = (part, side) => { const c = ent.filter(e => e.part === part && (side === undefined || e.side === side)).sort(srt)[0]; return c ? c.i : -1; };
  const sp = ent.filter(e => e.part === 'spine').sort(srt).map(e => e.i).sort((a, b) => dp[a] - dp[b]);
  const S = { hips: one('hips'), neck: one('neck'), head: one('head'), sp, L: {}, R: {} };
  for (const sd of ['L', 'R']) { const o = S[sd]; for (const p of ['sh', 'up', 'low', 'hand', 'thigh', 'shin', 'foot']) o[p] = one(p, sd); o.fg = {}; for (const f of ['thumb', 'index', 'middle', 'ring', 'pinky']) o.fg[f] = ent.filter(e => e.part === 'finger' && e.side === sd && e.fg === f).sort(srt).map(e => e.i).sort((a, b) => dp[a] - dp[b]); }
  if (S.L.up < 0 || S.R.up < 0 || S.L.low < 0 || S.R.low < 0 || S.L.hand < 0 || S.R.hand < 0) return null;

  // --- kerangka acuan karakter: kiri(+x) atas(+y) depan(+z) ---
  const base = S.hips >= 0 ? S.hips : (sp[0] >= 0 ? sp[0] : S.L.thigh), topB = S.head >= 0 ? S.head : S.neck >= 0 ? S.neck : sp[sp.length - 1];
  let up = [0, 1, 0]; if (base >= 0 && topB >= 0) { const u = vn(vsub(pos(topB), pos(base))); if (vdot(u, up) < 0.5) up = u; }
  let left = vsub(pos(S.L.up), pos(S.R.up)); left = vn(vsub(left, vsc(up, vdot(left, up)))); const fwd = vcr(left, up);
  const C = (x, y, z) => vn(vadd(vadd(vsc(left, x), vsc(up, y)), vsc(fwd, z))), CV = a => vadd(vadd(vsc(left, a[0]), vsc(up, a[1])), vsc(fwd, a[2]));
  const AX = { x: left, y: up, z: fwd };

  const applyW = (b, qw) => { if (b < 0) return; const Qp = par[b] >= 0 ? Qw[par[b]] : [0, 0, 0, 1]; lr[b] = nrm(qm(qi(Qp), qm(qw, qm(Qp, lr[b])))); calc(); };
  const turn = (b, ax, deg) => { if (b < 0 || !deg) return; applyW(b, qax(typeof ax === 'string' ? AX[ax] : ax, deg)); };
  const aim = (b, c, dir) => { if (b < 0 || c < 0 || c == null) return; const v = vsub(pos(c), pos(b)); if (Math.hypot(...v) < 1e-9) return; applyW(b, qarc(vn(v), dir)); };
  const aimP = (b, p, dir) => { if (b < 0) return; applyW(b, qarc(vn(vsub(p, pos(b))), dir)); };
  const palm0 = vsc(up, -1);
  const palm = (b, c, target) => { if (b < 0 || c < 0) return; const a = vn(vsub(pos(c), pos(b))), n = qrot(qm(Qw[b], qi(Q0[b])), palm0), pr = v => vn(vsub(v, vsc(a, vdot(v, a)))), n1 = pr(n), t1 = pr(target); if (Math.hypot(...vsub(n, vsc(a, vdot(n, a)))) < 1e-3) return; turn(b, a, Math.atan2(vdot(vcr(n1, t1), a), vdot(n1, t1)) * 180 / Math.PI); };
  const curl = (list, degs) => list.forEach((b, k) => { const d = degs[Math.min(k, degs.length - 1)]; if (!d) return; const nx = list[k + 1], v = nx != null ? vsub(P0[nx], P0[b]) : vsub(P0[b], P0[par[b]]); if (Math.hypot(...v) < 1e-9) return; const axw = vcr(vn(v), palm0); if (Math.hypot(...axw) < 1e-6) return; const axl = qrot(qi(Q0[b]), vn(axw)); lr[b] = nrm(qm(lr[b], qax(axl, d))); calc(); });
  const handTarget = h => { const f = S[h === S.L.hand ? 'L' : 'R'].fg; const fb = (f.middle[0] != null ? f.middle[0] : f.index[0]); if (fb != null) return pos(fb); const ch = (m.nodes[h].children || []).filter(c => W[c]); if (!ch.length) return null; return vsc(ch.map(pos).reduce(vadd), 1 / ch.length); };
  const fingers = (sd, cfg) => { const f = S[sd].fg; for (const k in cfg) curl(f[k], cfg[k]); };
  const spineTurn = (ax, deg) => sp.forEach(b => turn(b, ax, deg / sp.length));
  const headTurn = (ax, deg, neckShare = .4) => { if (S.neck >= 0) { turn(S.neck, ax, deg * neckShare); turn(S.head, ax, deg * (1 - neckShare)); } else turn(S.head, ax, deg); };
  const arm = (sd, sx, d) => {
    const o = S[sd]; if (d.sh) turn(o.sh, 'z', sx * d.sh);
    aim(o.up, o.low, C(sx * d.u[0], d.u[1], d.u[2])); aim(o.low, o.hand, C(sx * d.l[0], d.l[1], d.l[2]));
    const tp = handTarget(o.hand); if (tp) aimP(o.hand, tp, C(sx * d.h[0], d.h[1], d.h[2]));
    const nx = (m.nodes[o.hand].children || []).filter(c => W[c])[0]; const tgt = S[sd].fg.middle[0] != null ? S[sd].fg.middle[0] : S[sd].fg.index[0] != null ? S[sd].fg.index[0] : nx;
    if (d.p) palm(o.hand, tgt, C(sx * d.p[0], d.p[1], d.p[2]));
    if (d.f) fingers(sd, d.f);
  };

  if (id === 0) { // Preset 1: heart hands, malu, kepala miring
    spineTurn('x', 6); headTurn('x', 9); headTurn('y', -12, .35); headTurn('z', 10, .35);
    const F1 = { thumb: [8, 12, 8], index: [10, 22, 14], middle: [14, 26, 16], ring: [18, 28, 18], pinky: [22, 30, 20] };
    arm('L', 1, { u: [.70, -.50, .45], l: [-.80, .55, .22], h: [-.65, -.60, .46], p: [-.35, 0, -.94], f: F1 });
    arm('R', -1, { u: [.70, -.50, .45], l: [-.80, .55, .22], h: [-.65, -.60, .46], p: [-.35, 0, -.94], f: F1 });
  } else { // Preset 2: badan menoleh, satu tangan terentang, kepala menengadah
    turn(S.hips, 'y', 8); spineTurn('y', 24); spineTurn('x', -6); headTurn('x', -22, .3); headTurn('y', 12, .4); headTurn('z', -6, .4);
    const FO = { thumb: [4, 6, 4], index: [6, 8, 6], middle: [6, 8, 6], ring: [8, 10, 6], pinky: [10, 12, 8] }, FR = { thumb: [10, 12, 8], index: [14, 22, 14], middle: [16, 26, 16], ring: [18, 28, 18], pinky: [22, 30, 20] };
    arm('L', 1, { u: [.86, -.42, -.28], l: [.88, -.36, -.30], h: [.90, -.30, -.30], p: [0, -.80, .55], f: FO });
    arm('R', -1, { u: [.12, -.97, .12], l: [.35, -.88, .25], h: [.40, -.85, .25], p: [-.9, 0, .3], f: FR });
  }

  // --- selisih terhadap pose diam -> parameter sudut tulang (urutan Z·Y·X seperti pose()) ---
  const v = {}, deg = 180 / Math.PI;
  for (let i = 0; i < N; i++) {
    if (!W[i]) continue; const q = qm(qi(rest[i].r), lr[i]), [x, y, z, w] = q;
    const r20 = 2 * (x * z - y * w), r21 = 2 * (y * z + x * w), r22 = 1 - 2 * (x * x + y * y), r10 = 2 * (x * y + z * w), r00 = 1 - 2 * (y * y + z * z);
    const e = [Math.atan2(r21, r22) * deg, Math.asin(Math.max(-1, Math.min(1, -r20))) * deg, Math.atan2(r10, r00) * deg].map(a => Math.round(a * 100) / 100);
    if (Math.abs(e[0]) > .01 || Math.abs(e[1]) > .01 || Math.abs(e[2]) > .01) v[i] = e;
  }
  const missing = []; if (!sp.length) missing.push('badan'); if (S.head < 0) missing.push('kepala'); if (!S.L.fg.index.length && !S.L.fg.middle.length) missing.push('jari');
  return { v, missing };
}
ML.glbPreset = (L, id) => { const m = model(L); return m ? solvePreset(m, id) : null; };

function loadImgs(m) {
  (m.j.images || []).forEach((im, i) => {
    let p = null;
    if (im.bufferView != null) { const bv = m.j.bufferViews[im.bufferView]; p = Promise.resolve(new Blob([m.bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength)], { type: im.mimeType || 'image/png' })); }
    else if (im.uri && /^data:/.test(im.uri)) p = fetch(im.uri).then(r => r.blob());
    if (p) p.then(b => createImageBitmap(b, { premultiplyAlpha: 'none' })).then(b => { m.bm[i] = b; try { ML.player.seek(ML.player.t); } catch (e) { /* abaikan */ } }).catch(() => { });
  });
}
function init() {
  if (gl !== undefined) return !!gl;
  cv = document.createElement('canvas'); cv.width = cv.height = 512;
  gl = cv.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: true, depth: true }); if (!gl) return false;
  const mk = (t, src) => { const x = gl.createShader(t); gl.shaderSource(x, src); gl.compileShader(x); return x; };
  const hpf = gl.getShaderPrecisionFormat && gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT), FP = hpf && hpf.precision > 0 ? 'highp' : 'mediump';
  pg = gl.createProgram();
  gl.attachShader(pg, mk(gl.VERTEX_SHADER, 'attribute vec3 aP,aN;attribute vec2 aUV;attribute vec4 aC;uniform mat4 uM,uR,uO;varying float vH;varying vec3 vN;varying vec2 vUV;varying vec4 vC;void main(){vN=(uR*vec4(aN,0.)).xyz;vUV=aUV;vC=aC;vH=(uO*vec4(aP,1.)).y;gl_Position=uM*vec4(aP,1.);}'));
  gl.attachShader(pg, mk(gl.FRAGMENT_SHADER, 'precision ' + FP + ' float;varying vec3 vN;varying vec2 vUV;varying vec4 vC;uniform vec3 uL,uEm,uLC;uniform float uA,uTex,uRg,uMt,uCut,uOp,uFl,uFy,uFa,uFd,uRf,uRT,uLI,uRim,uSp,uEx,uRX;uniform vec3 uV,uZ,uHz,uGd;varying float vH;uniform vec4 uBase;uniform sampler2D uT;void main(){vec4 c=uBase*vC;if(uTex>.5)c*=texture2D(uT,vUV);if(uCut>=0.&&c.a<uCut)discard;float al=uOp>.5?1.:c.a;vec3 n=normalize(vN);if(!gl_FrontFacing)n=-n;vec3 L=normalize(uL);float d=max(dot(n,L),0.);vec3 h=normalize(L+vec3(0.,0.,1.));float sp=pow(max(dot(n,h),0.),mix(4.,64.,1.-uRg))*(1.-uRg)*.45;vec3 col=c.rgb*(uA+(1.-uA)*d)*(1.-uMt*.5)+vec3(sp)*mix(vec3(1.),c.rgb,uMt)+uEm;if(uRT>.5){vec3 Vv=normalize(uV);vec3 alb=pow(c.rgb,vec3(2.2));float ndl=dot(n,L);float wr=max((ndl+.35)/1.35,0.);vec3 hemi=mix(uGd*.7+.06,uZ*.7+.1,n.y*.5+.5)*uA*2.;vec3 df=alb*(1.-uMt)*(hemi+uLC*uLI*mix(max(ndl,0.),wr,.4));float rgh=clamp(uRg,.04,1.);vec3 Hh=normalize(L+Vv);float nh=max(dot(n,Hh),0.);float shp=2./(rgh*rgh*rgh)-2.;vec3 f0=mix(vec3(.04),alb,uMt);vec3 Fr=f0+(1.-f0)*pow(1.-max(dot(Hh,Vv),0.),5.);vec3 spc=Fr*pow(nh,min(shp,400.))*(shp+8.)/25.*max(ndl,0.)*uSp*uLC*uLI;float rm=pow(1.-max(dot(n,Vv),0.),3.)*clamp(.35-ndl*.5,0.,1.)*uRim*2.;vec3 lin=(df+spc+rm*uLC+pow(uEm,vec3(2.2)))*exp2(uEx);lin=clamp((lin*(2.51*lin+.03))/(lin*(2.43*lin+.59)+.14),0.,1.);col=pow(lin,vec3(1./2.2));}if(uRf>0.){vec3 V=normalize(uV);vec3 r=reflect(-V,n);vec3 e=mix(uGd,mix(uHz,uZ,smoothstep(0.,.7,r.y)),smoothstep(-.08,.08,r.y));e+=vec3(1.,.95,.85)*pow(max(dot(r,L),0.),60.)*1.2;vec3 f0=mix(vec3(.04),c.rgb,uMt);vec3 F=f0+(1.-f0)*pow(1.-max(dot(n,V),0.),5.);col+=e*F*uRf*(1.-uRg*.75);}if(uRX>0.){vec3 V2=normalize(uV);vec3 L2=normalize(uL);float ao=clamp(.5+.2*n.y+.35*smoothstep(-1.,.6,vH),0.,1.);float fr=pow(1.-max(dot(n,V2),0.),3.);vec3 rr=reflect(-V2,n);float sun=pow(max(dot(rr,L2),0.),48.)*(1.-uRg*.7);vec3 sky=mix(uGd,uZ,rr.y*.5+.5);vec3 bn=uGd*(.5-.5*n.y)*.6;col=col*ao+bn*c.rgb+sky*fr*(.25+.75*uMt)*(1.-uRg*.6)+vec3(1.,.93,.8)*sun*.8+uHz*fr*.15;col=col/(1.+col*.18)*1.15;}float fd=1.;if(uFl>.5){if(vH>uFy)discard;fd=uFa*exp(-(uFy-vH)*uFd);}gl_FragColor=vec4(col*al*fd,al*fd);}'));
  ['aP', 'aN', 'aUV', 'aC'].forEach((n, i) => gl.bindAttribLocation(pg, i, n)); gl.linkProgram(pg);
  lc = {}; ['uM', 'uR', 'uO', 'uL', 'uA', 'uBase', 'uTex', 'uT', 'uEm', 'uRg', 'uMt', 'uCut', 'uOp', 'uFl', 'uFy', 'uFa', 'uFd', 'uRf', 'uV', 'uZ', 'uHz', 'uGd', 'uRT', 'uLC', 'uLI', 'uRim', 'uSp', 'uEx', 'uRX'].forEach(n => lc[n] = gl.getUniformLocation(pg, n)); return true;
}
const buf = (arr, dyn) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, arr, dyn ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW); return b; };
const matPbr = mt => { if (!mt) return {}; if (mt.pbrMetallicRoughness) return mt.pbrMetallicRoughness; const sg = mt.extensions && mt.extensions.KHR_materials_pbrSpecularGlossiness; return sg ? { baseColorFactor: sg.diffuseFactor, baseColorTexture: sg.diffuseTexture, roughnessFactor: 1 - (sg.glossinessFactor == null ? 1 : sg.glossinessFactor), metallicFactor: 0 } : {}; };
const tex = (m, i) => {
  if (m.gt[i] !== undefined) return m.gt[i]; const bm = m.bm[i]; if (!bm) return null;
  const p2 = x => (x & (x - 1)) === 0; let src = bm;
  const cap = m.qk === 1 ? 512 : Math.min(4096, gl.getParameter(gl.MAX_TEXTURE_SIZE)); if (!p2(bm.width) || !p2(bm.height) || bm.width > cap || bm.height > cap) { const up = x => { let r = 1; while (r < x) r <<= 1; return Math.min(r, cap); }, c = document.createElement('canvas'); c.width = up(bm.width); c.height = up(bm.height); c.getContext('2d').drawImage(bm, 0, 0, c.width, c.height); src = c; }
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src); gl.generateMipmap(gl.TEXTURE_2D);
  const tx = (m.j.textures || []).find(x => x.source === i), sm = tx && tx.sampler != null && m.j.samplers ? m.j.samplers[tx.sampler] : null, wr = v => v === 33071 ? gl.CLAMP_TO_EDGE : v === 33648 ? gl.MIRRORED_REPEAT : gl.REPEAT;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wr(sm && sm.wrapS)); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wr(sm && sm.wrapT));
  return (m.gt[i] = t);
};
ML.glbCanvas = (L, lt) => {
  const m = model(L); if (!m || !init()) return null; fid++; { const qk = (L.glb.opt || {}).q | 0; if (m.qk !== qk) { if (m.qk !== undefined) Object.values(m.gt).forEach(t => t && gl.deleteTexture(t)); m.qk = qk; m.gt = {}; } } if (!m.loading) { m.loading = 1; loadImgs(m); }
  const mc = L.glb.map && L.glb.mod ? modelB(L.glb.mod.b64) : null; if (mc) { const qk = (L.glb.opt || {}).q | 0; if (mc.qk !== qk) { if (mc.qk !== undefined) Object.values(mc.gt || {}).forEach(t => t && gl.deleteTexture(t)); mc.qk = qk; mc.gt = {}; } if (!mc.loading) { mc.loading = 1; loadImgs(mc); } }
  const o = L.glb.opt || {}, j = m.j, v = k => ML.evalAnim(L.p[k], lt), d = Math.PI / 180, sc = v('ms') / 100, la = v('la') * d;
  const R = mul(rZ(v('rz') * d), mul(rY((v('ry') + v('spin') * lt) * d), rX(v('rx') * d)));
  const mp = !!L.glb.map, mp2 = mp, asp = mp ? L.bw / L.bh : 1, f = 1 / Math.tan((mp ? v('fov') : 40) * d / 2), nr = mp ? .01 : .1, fr = mp ? 100 : 20, Pm = [f / asp, 0, 0, 0, 0, f, 0, 0, 0, 0, (fr + nr) / (nr - fr), -1, 0, 0, 2 * fr * nr / (nr - fr), 0];
  const VW = mp ? mul(rX(-v('pitch') * d), mul(rY(-v('yaw') * d), [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -v('cx'), -v('cy'), -v('cz'), 1])) : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -3.2, 1];
  const PV = mul(Pm, mul(VW, mul(R, [sc, 0, 0, 0, 0, sc, 0, 0, 0, 0, sc, 0, 0, 0, 0, 1])));
  const k = m.k, NM = [k, 0, 0, 0, 0, k, 0, 0, 0, 0, k, 0, -m.ce[0] * k, -m.ce[1] * k, -m.ce[2] * k, 1], { W, vis, wts } = pose(m, o, lt + (L.trimIn || 0), o.pose === 1 ? (() => { const b = {}; for (const k in L.p) { const q = /^b(\d+)(x|y|z|px|py|pz|s)$/.exec(k); if (q) (b[q[1]] = b[q[1]] || [0, 0, 0, 0, 0, 0, 100])[['x', 'y', 'z', 'px', 'py', 'pz', 's'].indexOf(q[2])] = v(k); } return b; })() : null), va = o.variant === undefined ? -1 : o.variant;
  const vm = (k, dv) => L.p[k] ? v(k) : dv, CP = mc ? (() => {
    const oc = L.glb.mod.opt = L.glb.mod.opt || {}, bnn = oc.pose === 1 ? (() => { const b = {}; for (const kk in L.p) { const q = /^m_b(\d+)(x|y|z|px|py|pz|s)$/.exec(kk); if (q) (b[q[1]] = b[q[1]] || [0, 0, 0, 0, 0, 0, 100])[['x', 'y', 'z', 'px', 'py', 'pz', 's'].indexOf(q[2])] = v(kk); } return b; })() : null;
    const ps = pose(mc, oc, lt + (L.trimIn || 0), bnn), s = vm('m_ms', 12) / 100, kc = mc.k, Rc = mul(rZ(vm('m_rz', 0) * d), mul(rY((vm('m_ry', 0) + vm('m_spin', 0) * lt) * d), rX(vm('m_rx', 0) * d)));
    return { m: mc, W: ps.W, vis: ps.vis, wts: ps.wts, va: oc.variant === undefined ? -1 : oc.variant, NM: [kc, 0, 0, 0, 0, kc, 0, 0, 0, 0, kc, 0, -mc.ce[0] * kc, -mc.ce[1] * kc, -mc.ce[2] * kc, 1], B: mul([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, vm('m_x', 0), vm('m_y', 0), vm('m_z', 0), 1], mul(Rc, [s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1])), Rn: Rc };
  })() : null;
  { const mp = !!L.glb.map, hq = (o.hd ? 2 : 1) * (o.q === 1 ? .5 : 1.5), W0 = Math.round((mp ? 768 : 512) * hq), H0 = Math.round((mp ? Math.max(2, Math.round(768 * L.bh / L.bw)) : 512) * hq); if (cv.width !== W0 || cv.height !== H0) { cv.width = W0; cv.height = H0; } } gl.viewport(0, 0, cv.width, cv.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.useProgram(pg);
  const RT = !!o.rt, le = RT ? v('le') * d : Math.asin(.7 / Math.hypot(Math.sin(la), .7, Math.cos(la))), lw = RT ? v('lw') / 100 : 0, ce = Math.cos(le);gl.uniform3f(lc.uL, Math.sin(la) * ce, Math.sin(le), Math.cos(la) * ce); gl.uniform1f(lc.uA, v('amb') / 100); gl.uniform1i(lc.uT, 0);gl.uniform1f(lc.uRT, RT ? 1 : 0); gl.uniform3f(lc.uLC, lw >= 0 ? 1 : 1 + .3 * lw, lw >= 0 ? 1 - .18 * lw : 1 + .12 * lw, lw >= 0 ? 1 - .45 * lw : 1);gl.uniform1f(lc.uLI, RT ? v('li') / 100 * 2.2 : 1); gl.uniform1f(lc.uRim, RT ? v('rim') / 100 : 0); gl.uniform1f(lc.uSp, RT ? v('spc') / 100 : 1); gl.uniform1f(lc.uEx, RT ? v('ex') : 0); gl.uniform1f(lc.uRX, o.rx ? 1 : 0);
  const RF = o.rl ? v('rf') / 100 : 0, FF = o.rl ? v('ff') / 100 : 0, fyw = m.y0 + v('fy') * .01, MIR = [1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1, 0, 0, 2 * fyw, 0, 1];
  const EV = [[[.25, .5, .95], [.8, .9, 1], [.35, .32, .3]], [[.2, .25, .55], [1, .55, .3], [.15, .1, .1]], [[.02, .03, .1], [.1, .12, .25], [.02, .02, .03]], [[1, 1, 1], [.9, .9, .95], [.2, .2, .22]]][o.env || 0];
  const Vm = mp2 ? mul(rY(v('yaw') * d), rX(v('pitch') * d)) : null;
  gl.uniform1f(lc.uRf, RF); gl.uniform3f(lc.uV, Vm ? Vm[8] : 0, Vm ? Vm[9] : 0, Vm ? Vm[10] : 1); gl.uniform3fv(lc.uZ, EV[0]); gl.uniform3fv(lc.uHz, EV[1]); gl.uniform3fv(lc.uGd, EV[2]);
  gl.uniform1f(lc.uFy, fyw); gl.uniform1f(lc.uFa, FF); gl.uniform1f(lc.uFd, v('fd'));
  const objs = [{ m, W, vis, wts, va, NM, B: I4(), Rn: I4() }]; if (CP) objs.push(CP);
  objs.forEach(ob => {
    ob.list = [];
    for (const pr of ob.m.prims) {
      const sk = pr.skin != null; if (!sk && !(ob.W[pr.node] && ob.vis[pr.node])) continue; if (sk && !ob.vis[pr.node]) continue;
      let mi = pr.mat; if (ob.va >= 0) { const mp = pr.vm.find(x => x.variants.includes(ob.va)); if (mp) mi = mp.material; }
      const mt = mi != null && ob.m.j.materials ? ob.m.j.materials[mi] : null; ob.list.push({ pr, mt, bl: !!(mt && mt.alphaMode === 'BLEND') });
    }
  });
  [true, false].forEach(rfl => {
  if (rfl && !(FF > 0)) return; gl.uniform1f(lc.uFl, rfl ? 1 : 0); if (!rfl && FF > 0) gl.clear(gl.DEPTH_BUFFER_BIT);
  [false, true].forEach(pass => {
    gl.depthMask(!pass); if (pass || rfl) { gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); } else gl.disable(gl.BLEND);
    objs.forEach(ob => { const m = ob.m, j = m.j, W = ob.W, wts = ob.wts, NM = ob.NM;
    ob.list.filter(x => x.bl === pass).forEach(({ pr, mt }) => {
      const sk = pr.skin != null, NW = sk ? I4() : W[pr.node], pbr = matPbr(mt), ti = pbr.baseColorTexture ? j.textures[pbr.baseColorTexture.index].source : null, gt = ti != null ? tex(m, ti) : null;
      let bP, bN; const dm = deform(m, pr, W, wts, sk); if (dm) { bP = buf(dm[0], true); bN = buf(dm[1], true); } else { if (!pr.b) pr.b = { P: buf(pr.P), N: buf(pr.N), UV: pr.UV && buf(pr.UV), C: pr.C && buf(pr.C) }; bP = pr.b.P; bN = pr.b.N; }
      const att = (i, b, c) => { if (b) { gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, c, gl.FLOAT, false, 0, 0); } else { gl.disableVertexAttribArray(i); gl.vertexAttrib4f(i, 1, 1, 1, 1); } };
      att(0, bP, 3); att(1, bN, 3); att(2, gt && pr.UV ? (pr.b || (pr.b = { P: buf(pr.P), N: buf(pr.N), UV: pr.UV && buf(pr.UV), C: pr.C && buf(pr.C) })).UV : null, 2); att(3, pr.C ? (pr.b || (pr.b = { P: buf(pr.P), N: buf(pr.N), UV: pr.UV && buf(pr.UV), C: buf(pr.C) })).C || (pr.b.C = buf(pr.C)) : null, 4);
      if (gt) { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, gt); }
      const OB = mul(rfl ? MIR : I4(), mul(ob.B, mul(NM, NW))); gl.uniformMatrix4fv(lc.uM, false, mul(PV, OB)); gl.uniformMatrix4fv(lc.uO, false, OB); gl.uniformMatrix4fv(lc.uR, false, mul(R, mul(ob.Rn, rfl ? mul(MIR, NW) : NW)));
      gl.uniform4fv(lc.uBase, pbr.baseColorFactor || [1, 1, 1, 1]); gl.uniform1f(lc.uTex, gt && pr.UV ? 1 : 0); gl.uniform3fv(lc.uEm, (mt && mt.emissiveFactor) || [0, 0, 0]);
      gl.uniform1f(lc.uRg, pbr.roughnessFactor == null ? 1 : pbr.roughnessFactor); gl.uniform1f(lc.uMt, pbr.metallicFactor == null ? 0 : pbr.metallicFactor);
      gl.uniform1f(lc.uCut, mt && mt.alphaMode === 'MASK' ? (mt.alphaCutoff == null ? .5 : mt.alphaCutoff) : -1); gl.uniform1f(lc.uOp, !mt || mt.alphaMode == null || mt.alphaMode === 'OPAQUE' ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, pr.n);
      if (dm) { gl.deleteBuffer(bP); gl.deleteBuffer(bN); }
    });
    });
  });
  });
  gl.depthMask(true); return cv;
};
})();
