'use strict';
/* Mode AM (eksperimen): bentuk parametrik dari am/shapes/*.xml. Folder am/ boleh tidak ada (versi ML murni). */
(function () {
ML.AM_SHAPES = {};
const num = (v, d) => { const n = parseFloat(v); return isFinite(n) ? n : d; };
function parse(raw, file) {
  const doc = new DOMParser().parseFromString(raw, 'text/xml'), root = doc.documentElement; if (!root || root.nodeName !== 'shape') return;
  const params = []; const ps = root.querySelector('params');
  if (ps) [...ps.children].forEach(e => {
    const id = e.getAttribute('id'); if (!id) return; const t = e.nodeName, d = e.getAttribute('default') || '0';
    if (t === 'point') { const [x, y] = d.split(',').map(Number); params.push({ id, pt: true, def: { x: x || 0, y: y || 0 }, min: 0, max: 4000 }); }
    else params.push({ id, def: num(d, 0), min: num(e.getAttribute('min'), 0), max: num(e.getAttribute('max'), 4000), step: num(e.getAttribute('step'), 1) });
  });
  const sc = root.querySelector('script'); if (!sc) return;
  let fn; try { fn = new Function(sc.textContent + '\n;return getPath;')(); } catch (e) { return; }
  const key = file.replace(/\.xml$/, '');
  ML.AM_SHAPES[key] = { key, name: key.charAt(0).toUpperCase() + key.slice(1), params, fn };
}
async function load() {
  let list; try { const r = await fetch('am/shapes/index.json'); if (!r.ok) return; list = await r.json(); } catch (e) { return; }
  for (const f of list) { try { const r = await fetch('am/shapes/' + f); if (r.ok) parse(await r.text(), f); } catch (e) { /* lewati */ } }
}
const defaults = def => { const o = {}; def.params.forEach(p => { o[p.id] = p.pt ? { x: p.def.x, y: p.def.y } : p.def; }); return o; };
/* bangun Path2D dari hasil getPath, lalu skala agar pas dengan kotak layer w x h */
ML.amShapePath = (sh, w, h) => {
  const d = ML.AM_SHAPES[sh.am.id]; if (!d) return null;
  let pts; try { pts = d.fn(sh.am.p); } catch (e) { return null; } if (!Array.isArray(pts)) return null;
  const P = new Path2D(); let first = null, prev = null, open = false, x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  const bb = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
  const ops = [];
  pts.forEach(q => {
    if (Array.isArray(q)) { bb(q[0], q[1]); ops.push(['pt', { p: q }]); }
    else if (q && q.p) { bb(q.p[0], q.p[1]); if (q.in) bb(q.in[0], q.in[1]); if (q.out) bb(q.out[0], q.out[1]); ops.push(['pt', q]); }
    else if (q && q.closed) ops.push(['close']);
  });
  const bw = (x1 - x0) || 1, bh = (y1 - y0) || 1, sx = w / bw, sy = h / bh, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const T = a => [(a[0] - cx) * sx, (a[1] - cy) * sy];
  ops.forEach(([k, q]) => {
    if (k === 'close') { if (open && first) { if (prev && prev.out && first.in) { const o = T(prev.out), i = T(first.in), e = T(first.p); P.bezierCurveTo(o[0], o[1], i[0], i[1], e[0], e[1]); } P.closePath(); } first = prev = null; open = false; return; }
    const p = T(q.p);
    if (!open) { P.moveTo(p[0], p[1]); first = q; open = true; }
    else if (prev && (prev.out || q.in)) { const o = T(prev.out || prev.p), i = T(q.in || q.p); P.bezierCurveTo(o[0], o[1], i[0], i[1], p[0], p[1]); }
    else P.lineTo(p[0], p[1]);
    prev = q;
  });
  if (open) P.closePath();
  return P;
};
/* baris UI di panel bentuk (hanya mode AM) */
ML.amShapeRows = (L, plain, h, rebuild) => {
  if (ML.editVer() !== 'am' || !Object.keys(ML.AM_SHAPES).length) return null;
  const s = L.shape, rows = [h('div', { class: 'prow' }, h('span', { class: 'plab', text: 'Bentuk AM' }),
    h('div', { class: 'grp' }, h('button', { class: 'btn soft', style: 'width:auto;margin:0 6px 0 0;padding:0 12px', text: s.am ? ML.AM_SHAPES[s.am.id].name : 'Pilih…', onclick: () => ML.sheet('Bentuk AM', (b, close) => {
      b.append(h('button', { class: 'row-btn', text: 'Bentuk standar', onclick: () => { s.am = null; close(); rebuild(); } }),
        ...Object.values(ML.AM_SHAPES).map(d => h('button', { class: 'row-btn' + (s.am && s.am.id === d.key ? ' on' : ''), text: d.name, onclick: () => { s.am = { id: d.key, p: defaults(d) }; close(); rebuild(); } })));
    }) })))];
  if (s.am && ML.AM_SHAPES[s.am.id]) ML.AM_SHAPES[s.am.id].params.forEach(p => {
    if (p.pt) { rows.push(plain(p.id + ' X', () => s.am.p[p.id].x, v => { s.am.p[p.id].x = Math.max(1, v); }, 1, 2000), plain(p.id + ' Y', () => s.am.p[p.id].y, v => { s.am.p[p.id].y = Math.max(1, v); }, 1, 2000)); }
    else rows.push(plain(p.id, () => s.am.p[p.id], v => { s.am.p[p.id] = v; }, p.min, p.max));
  });
  return rows;
};
setTimeout(load, 300);
})();
