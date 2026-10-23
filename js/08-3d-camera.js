'use strict';
/* 3D ringan (2.5D): posisi Z + kamera perspektif + Null object (parent) */
(function () {
const g0 = ML.geom, ml0 = ML.makeLayer, el0 = ML.ensureLayer;
ML.makeLayer = (...a) => { const L = ml0(...a); L.p.z = ML.A(0); L.p.rx3 = ML.A(0); L.p.ry3 = ML.A(0); return L; };
ML.ensureLayer = L => { el0(L); if (L.ph3 && ML.ph3Defaults) ML.ph3Defaults(L); if (!L.p.z) L.p.z = ML.A(0); if (!L.p.rx3) L.p.rx3 = ML.A(0); if (!L.p.ry3) L.p.ry3 = ML.A(0); if (L.k3 === 'camera' && !L.p.zoom) L.p.zoom = ML.A(100); if (L.glb) { const D = { rx: 0, ry: 0, rz: 0, ms: 100, spin: 0, la: 40, amb: 35, rf: 50, ff: 40, fy: 0, fd: 2, li: 100, le: 45, lw: 0, rim: 40, spc: 100, ex: 0 }; for (const k in D) if (!L.p[k]) L.p[k] = ML.A(D[k]); if (L.glb.map) { const D2 = { cx: 0, cy: 0, cz: 2.5, yaw: 0, pitch: 0, fov: 50 }; for (const k in D2) if (!L.p[k]) L.p[k] = ML.A(D2[k]); if (L.glb.mod) { const D3 = { m_x: 0, m_y: 0, m_z: 0, m_rx: 0, m_ry: 0, m_rz: 0, m_ms: 12, m_spin: 0 }; for (const k in D3) if (!L.p[k]) L.p[k] = ML.A(D3[k]); } } } };
ML.geom = function G(L, t, dp) {
  dp = dp || 0; const g = g0(L, t), P = ML.player && ML.player.proj; g.z = L.p.z ? ML.evalAnim(L.p.z, t - L.start) : 0;
  g.rx3 = L.p.rx3 ? ML.evalAnim(L.p.rx3, t - L.start) * Math.PI / 180 : 0; g.ry3 = L.p.ry3 ? ML.evalAnim(L.p.ry3, t - L.start) * Math.PI / 180 : 0;
  if (!P) return g;
  const par = L.parent && dp < 6 ? P.layers.find(x => x.id === L.parent) : null;
  if (par) {
    const a = G(par, t, dp + 1), b = G(par, par.start, dp + 1), dr = a.rot - b.rot, c = Math.cos(dr), sn = Math.sin(dr);
    const rx = b.sx ? a.sx / b.sx : 1, ry = b.sy ? a.sy / b.sy : 1, dx = (g.x - b.x) * rx, dy = (g.y - b.y) * ry;
    g.x = a.x + dx * c - dy * sn; g.y = a.y + dx * sn + dy * c; g.rot += dr; g.sx *= rx; g.sy *= ry; g.op *= a.op; g.z += a.z - b.z;
  }
  if ((L.d3 || g.z || g.rx3 || g.ry3) && !L.k3) {
    const cam = P.layers.find(x => x.k3 === 'camera' && !x.hidden && t >= x.start && t < x.start + x.dur);
    const cg = cam ? G(cam, t, 1) : null, zoom = cam ? Math.max(.05, ML.evalAnim(cam.p.zoom, t - cam.start) / 100) : 1, f = P.w * zoom;
    const den = f + g.z - (cg ? cg.z : 0);
    if (den < 1) { g.op = 0; return g; }
    const k = f / den; let px = g.x - (cg ? cg.x : P.w / 2), py = g.y - (cg ? cg.y : P.h / 2);
    if (cg && cg.rot) { const c = Math.cos(-cg.rot), sn = Math.sin(-cg.rot), qx = px * c - py * sn; py = px * sn + py * c; px = qx; g.rot -= cg.rot; }
    g.x = P.w / 2 + px * k; g.y = P.h / 2 + py * k; g.sx *= k; g.sy *= k;
  }
  return g;
};
})();
