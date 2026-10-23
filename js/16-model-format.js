'use strict';
/* Format model (.glb/.gltf) + hit box mengikuti siluet model */
(function () {
ML.modelToGlb = async (f, all) => {
  const buf = await f.arrayBuffer(), ext = ((f.name.match(/\.(\w+)$/) || [])[1] || '').toLowerCase();
  if (ext === 'glb') return buf;
  if (ext !== 'gltf') throw new Error('format .' + ext + ' belum didukung, pakai .glb atau .gltf');
  const j = JSON.parse(new TextDecoder().decode(buf)), parts = [], files = {}; let off = 0;
  for (const x of all) files[x.name.toLowerCase()] = x;
  const getU = async uri => { if (/^data:/.test(uri)) return new Uint8Array(await (await fetch(uri)).arrayBuffer()); const x = files[decodeURIComponent(uri).split('/').pop().toLowerCase()]; if (!x) throw new Error('file pendamping belum dipilih: ' + uri); return new Uint8Array(await x.arrayBuffer()); };
  const push = u => { const o = off; parts.push(u); off += u.length; const pad = (4 - off % 4) % 4; if (pad) { parts.push(new Uint8Array(pad)); off += pad; } return o; };
  const base = []; for (const b of j.buffers || []) base.push(push(await getU(b.uri)));
  (j.bufferViews || []).forEach(v => { v.byteOffset = (v.byteOffset || 0) + base[v.buffer]; v.buffer = 0; });
  for (const im of j.images || []) if (im.uri && !/^data:/.test(im.uri)) { const u = await getU(im.uri), o = push(u); j.bufferViews = j.bufferViews || []; im.bufferView = j.bufferViews.push({ buffer: 0, byteOffset: o, byteLength: u.length }) - 1; im.mimeType = /\.png$/i.test(im.uri) ? 'image/png' : /\.webp$/i.test(im.uri) ? 'image/webp' : 'image/jpeg'; delete im.uri; }
  j.buffers = [{ byteLength: off }];
  const js = new TextEncoder().encode(JSON.stringify(j)), jp = js.length + (4 - js.length % 4) % 4, tot = 28 + jp + off, out = new Uint8Array(tot), dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546C67, true); dv.setUint32(4, 2, true); dv.setUint32(8, tot, true); dv.setUint32(12, jp, true); dv.setUint32(16, 0x4E4F534A, true);
  out.set(js, 20); out.fill(32, 20 + js.length, 20 + jp);
  let p = 20 + jp; dv.setUint32(p, off, true); dv.setUint32(p + 4, 0x004E4942, true); p += 8; parts.forEach(u => { out.set(u, p); p += u.length; });
  return out.buffer;
};
const h0 = ML.hit, sc = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
ML.hit = (L, t, px, py) => {
  if (!h0(L, t, px, py)) return false; if (!L.glb) return true;
  try {
    const g = ML.geom(L, t), dx = px - g.x, dy = py - g.y, c = Math.cos(g.rot), s = Math.sin(g.rot), u = (dx * c + dy * s) / (g.w * g.sx) + .5, v = (-dx * s + dy * c) / (g.h * g.sy) + .5;
    const cv = ML.glbCanvas(L, t - L.start); if (!cv) return true;
    const R = 6, n = R * 2 + 1; sc.canvas.width = sc.canvas.height = n; sc.clearRect(0, 0, n, n); sc.drawImage(cv, Math.round(u * cv.width) - R, Math.round(v * cv.height) - R, n, n, 0, 0, n, n);
    const d = sc.getImageData(0, 0, n, n).data; for (let i = 3; i < d.length; i += 4) if (d[i] > 24) return true; return false;
  } catch (e) { return true; }
};
})();
