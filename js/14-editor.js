'use strict';
/* Editor: preview, timeline (playhead di tengah), toolbar layer, panel properti/efek/keyframe */
ML.openEditor = async function (pid) {
  const proj = await ML.db.getProject(pid);
  if (!proj) { ML.toast('Proyek tidak ditemukan'); return; }
  try { await ML.media.load(proj); } catch (e) { ML.toast('Sebagian media gagal dimuat'); }
  ML.editor = ML.Editor(proj);
};

ML.Editor = function (proj) {
  const h = ML.h, I = ML.icon, P = ML.player, clamp = ML.clamp;
  P.init(proj); proj.layers.forEach(ML.ensureLayer);
  const rend = new ML.Renderer();
  const ST = { sel: null, pps: 90, panel: null, snap: ML.lsGet('ml.snap') !== '0', pvH: Math.round(innerHeight * (ML.uiMode() === 'desk' ? 0.5 : 0.34)), desk: ML.uiMode() === 'desk', big: false, kf: null, link: true, openFx: new Set() };
  const undo = [], redo = []; let lastKey = null, lastTime = 0, dirty = false, saveT = 0, updT = 0;
  const sel = () => proj.layers.find(l => l.id === ST.sel) || null;
  const eps = () => 0.5 / proj.fps;
  const isMedia = L => L.type === 'video' || L.type === 'audio';
  const inRange = (L, t = P.t) => t >= L.start && t < L.start + L.dur;

  /* ================= DOM ================= */
  const cv = h('canvas', { class: 'pv-cv' }), ov = h('canvas', { class: 'pv-ov' });
  const box = h('div', { class: 'pv-box' }, cv, ov), pv = h('div', { class: 'pv' }, box);
  const nameIn = h('input', { class: 'ed-name', type: 'text', value: proj.name, oninput: () => { dirty = true; scheduleSave(); } });
  const btn = (ic, cls, fn) => h('button', { class: 'icon-btn ' + (cls || ''), html: I(ic), onclick: fn });
  const bUndo = btn('undo', '', () => doUndo()), bRedo = btn('redo', '', () => doRedo());
  const bPlay = btn('play', 'play', () => togglePlay());
  const top = h('header', { class: 'ed-top' });
  const splitter = h('div', { class: 'splitter' }, h('i'));
  const bFlag = btn('flag', '', () => addMarker());
  const flagUpd = () => bFlag.classList.toggle('act', proj.markers.some(m => Math.abs(m.t - P.t) < 1 / proj.fps));
  const transport = h('div', { class: 'transport' }, bUndo, bRedo, btn('prev', '', () => gotoMarker(-1)), bPlay, btn('next', '', () => gotoMarker(1)), bFlag, h('button', { class: 'icon-btn', title: 'Keyframe sebelumnya', text: '◀◆', onclick: () => gotoKey(-1) }), h('button', { class: 'icon-btn', title: 'Keyframe berikutnya', text: '◆▶', onclick: () => gotoKey(1) }), btn('expand', '', () => { ST.big = !ST.big; ST.pvH = Math.round(innerHeight * (ST.big ? (ST.desk ? 0.65 : 0.55) : (ST.desk ? 0.5 : 0.34))); layoutPv(); }));
  const ruler = h('canvas', { class: 'ruler' }), inner = h('div', { class: 'tl-inner' }), lheads = h('div', { class: 'lheads' }), lanes = h('div', { class: 'lanes' }, inner, lheads);
  const chip = h('div', { class: 'ph-chip' }), phLine = h('div', { class: 'ph-line' });
  const hint = h('div', { class: 'tl-hint', text: 'Ketuk + untuk menambah video, foto, audio, teks, atau bentuk' });
  const fab = h('button', { class: 'fab', html: I('plus'), onclick: () => addSheet() });
  const tl = h('div', { class: 'tl' }, ruler, lanes, phLine, chip, hint, fab);
  const tools = h('div', { class: 'tools' }); tools.hidden = true;
  const pframe = h('div', { class: 'pframe' }); pframe.hidden = true;
  const sideEmpty = h('div', { class: 'side-empty', text: 'Pilih layer di timeline untuk mengatur Move & Transform, efek, warna, dan lainnya.' });
  const edEl = h('div', { class: 'editor' + (ST.desk ? ' desk' : '') }, top, pv, splitter, transport, tl, sideEmpty, tools, pframe);
  ML.$('#app').replaceChildren(edEl);
  { const edT = h('span', { class: 'edtime' }); transport.append(edT); proj.editSecs = proj.editSecs || 0;
    const fmtT = n => [Math.floor(n / 3600), Math.floor(n / 60) % 60, n % 60].map(x => String(x).padStart(2, '0')).join(':');
    const tmr = setInterval(() => { if (!document.body.contains(edT)) { clearInterval(tmr); return; }
      if (!document.hidden) { proj.editSecs++; if (proj.editSecs % 30 === 0) { try { ML.editor.changed(); } catch (e) { /* abaikan */ } } }
      edT.textContent = '⏱ ' + fmtT(proj.editSecs); }, 1000); edT.textContent = '⏱ ' + fmtT(proj.editSecs); }

  /* ================= undo / redo / simpan ================= */
  function cp(key) {
    const now = performance.now();
    if (key && key === lastKey && now - lastTime < 900) { lastTime = now; return; }
    undo.push(ML.snapshot(proj)); if (undo.length > 80) undo.shift();
    redo.length = 0; lastKey = key; lastTime = now; updHist();
  }
  function updHist() { bUndo.disabled = !undo.length; bRedo.disabled = !redo.length; }
  function afterRestore() {
    if (ST.sel && !sel()) ST.sel = null;
    ST.kf = null; P.t = clamp(P.t, 0, P.dur()); lastKey = null;
    scheduleSave(); layoutPv(); buildLanes(); renderBar(); PN.rebuild(); draw(); updHist();
  }
  function doUndo() { if (!undo.length) return; redo.push(ML.snapshot(proj)); ML.restore(proj, undo.pop()); afterRestore(); }
  function doRedo() { if (!redo.length) return; undo.push(ML.snapshot(proj)); ML.restore(proj, redo.pop()); afterRestore(); }
  function scheduleSave() { dirty = true; clearTimeout(saveT); saveT = setTimeout(() => save(false), 700); }
  async function save(thumb) {
    if (!dirty && !thumb) return; dirty = false;
    proj.name = nameIn.value.trim() || proj.name; proj.updatedAt = Date.now(); proj.dur = P.dur();
    proj.size = ML.media.total() + JSON.stringify(proj.layers).length;
    if (thumb) {
      const k = 256 / Math.max(cv.width, cv.height), c = document.createElement('canvas');
      c.width = Math.max(2, Math.round(cv.width * k)); c.height = Math.max(2, Math.round(cv.height * k));
      c.getContext('2d').drawImage(cv, 0, 0, c.width, c.height); proj.thumb = c.toDataURL('image/jpeg', 0.7);
    }
    await ML.db.putProject(proj);
  }
  function changed(structure) { scheduleSave(); if (structure) buildLanes(); if (!P.playing) draw(); }
  function guard(L) { if (L && L.locked) { ML.toast('Layer terkunci'); return false; } return true; }

  /* ================= preview ================= */
  function layoutPv() {
    const bottom = ST.desk ? 0 : (!pframe.hidden ? pframe.offsetHeight : (!tools.hidden ? tools.offsetHeight : 0));
    const pvh = clamp(ST.pvH, 110, Math.max(120, innerHeight - 52 - 16 - 54 - bottom - 150)); ST.pvEff = pvh;
    pv.style.height = pvh + 'px';
    const aw = pv.clientWidth - 16, ah = pvh - 12, ar = proj.w / proj.h;
    let w = aw, hh = w / ar; if (hh > ah) { hh = ah; w = hh * ar; }
    box.style.width = w + 'px'; box.style.height = hh + 'px';
    const sc = Math.min(1, ML.previewMax() / Math.max(proj.w, proj.h));
    const cw = Math.max(2, Math.round(proj.w * sc)), ch = Math.max(2, Math.round(proj.h * sc));
    if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
    const dpr = window.devicePixelRatio || 1; ov.width = Math.round(w * dpr); ov.height = Math.round(hh * dpr);
    draw(); drawRuler();
  }
  function draw(t = P.t) {
    const dur = P.dur(), rt = Math.min(t, Math.max(0, dur - 0.001));
    rend.render(cv, proj, rt, { maxSamples: 5 });
    drawOverlay(rt); updateTime(t);
  }
  function drawOverlay(t) {
    const g = ov.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, ov.width, ov.height);
    const L = sel(); if (!L || L.type === 'audio' || !inRange(L, t)) return;
    const q = ML.geom(L, t), k = ov.width / proj.w, dpr = window.devicePixelRatio || 1;
    const hw = q.w * q.sx * k / 2, hh = q.h * q.sy * k / 2;
    g.save(); g.translate(q.x * k, q.y * k); g.rotate(q.rot);
    g.strokeStyle = L.locked ? '#ff7a45' : '#ff3fb0'; g.lineWidth = 2 * dpr; g.strokeRect(-hw, -hh, 2 * hw, 2 * hh);
    if (!L.locked) { g.fillStyle = '#1d0f26'; g.beginPath(); g.arc(hw, hh, 9 * dpr, 0, Math.PI * 2); g.fill(); g.stroke(); }
    g.restore();
  }
  const toComp = e => { const r = ov.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * proj.w, y: (e.clientY - r.top) / r.height * proj.h, k: r.width / proj.w }; };
  const ptrs = new Map(); let pm = null;
  ov.addEventListener('pointerdown', e => {
    ov.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const L = sel();
    if (ptrs.size === 2 && L && !L.locked && inRange(L)) {
      const [a, b] = [...ptrs.values()], q = ML.geom(L, P.t);
      pm = { mode: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), a0: Math.atan2(b.y - a.y, b.x - a.x), sx: q.sx * 100, sy: q.sy * 100, rot: q.rot * 180 / Math.PI }; return;
    }
    const c = toComp(e);
    if (L && !L.locked && L.type !== 'audio' && inRange(L)) {
      const q = ML.geom(L, P.t), cs = Math.cos(q.rot), sn = Math.sin(q.rot);
      const hx = q.x + (q.w * q.sx / 2) * cs - (q.h * q.sy / 2) * sn, hy = q.y + (q.w * q.sx / 2) * sn + (q.h * q.sy / 2) * cs;
      if (Math.hypot(c.x - hx, c.y - hy) * c.k < 20) {
        pm = { mode: 'handle', cx: q.x, cy: q.y, r0: Math.hypot(c.x - q.x, c.y - q.y) || 1, a0: Math.atan2(c.y - q.y, c.x - q.x), sx: q.sx * 100, sy: q.sy * 100, rot: q.rot * 180 / Math.PI }; return;
      }
    }
    let target = null;
    if (L && L.type !== 'audio' && !L.hidden && inRange(L) && ML.hit(L, P.t, c.x, c.y)) target = L;
    else for (let i = proj.layers.length - 1; i >= 0; i--) { const q = proj.layers[i]; if (q.type !== 'audio' && !q.hidden && inRange(q) && ML.hit(q, P.t, c.x, c.y)) { target = q; break; } }
    if (target) {
      if (target.id !== ST.sel) select(target.id);
      const g = ML.geom(target, P.t);
      pm = { mode: target.locked ? 'locked' : 'move', c0: c, x: g.x, y: g.y, moved: false, L: target };
    } else pm = { mode: 'empty', c0: c, moved: false };
  });
  ov.addEventListener('pointermove', e => {
    if (!ptrs.has(e.pointerId)) return; ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const L = sel(); if (!pm) return;
    if (pm.mode === 'pinch' && ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()], f = Math.hypot(a.x - b.x, a.y - b.y) / pm.d0, ang = Math.atan2(b.y - a.y, b.x - a.x);
      cp('pinch' + L.id); setProp(L, 'sx', pm.sx * f); setProp(L, 'sy', pm.sy * f); setProp(L, 'rot', pm.rot + (ang - pm.a0) * 180 / Math.PI); changed(); refreshPanel(); return;
    }
    const c = toComp(e);
    if (pm.mode === 'handle') {
      const f = (Math.hypot(c.x - pm.cx, c.y - pm.cy) || 1) / pm.r0, da = Math.atan2(c.y - pm.cy, c.x - pm.cx) - pm.a0;
      cp('handle' + L.id); setProp(L, 'sx', pm.sx * f); setProp(L, 'sy', pm.sy * f); setProp(L, 'rot', pm.rot + da * 180 / Math.PI); changed(); refreshPanel();
    } else if (pm.mode === 'move') {
      const dx = c.x - pm.c0.x, dy = c.y - pm.c0.y;
      if (!pm.moved && Math.hypot(dx, dy) * c.k < 4) return; pm.moved = true;
      cp('move' + pm.L.id); setProp(pm.L, 'x', pm.x + dx); setProp(pm.L, 'y', pm.y + dy); changed(); refreshPanel();
    } else if (pm.mode === 'empty' && Math.hypot(c.x - pm.c0.x, c.y - pm.c0.y) * c.k > 4) pm.moved = true;
  });
  const pvUp = e => {
    ptrs.delete(e.pointerId);
    if (pm && pm.mode === 'empty' && !pm.moved && ptrs.size === 0) select(null);
    if (pm && pm.mode === 'locked') ML.toast('Layer terkunci');
    if (ptrs.size === 0) pm = null; else if (pm && pm.mode === 'pinch') pm = null;
  };
  ov.addEventListener('pointerup', pvUp); ov.addEventListener('pointercancel', pvUp);

  function setProp(L, key, v) { ML.setAnim(L.p[key], clamp(P.t - L.start, 0, L.dur), v, eps()); }

  splitter.addEventListener('pointerdown', e => {
    splitter.setPointerCapture(e.pointerId); const y0 = e.clientY, h0 = ST.pvEff || ST.pvH;
    const mv = ev => { ST.pvH = clamp(h0 + ev.clientY - y0, 110, innerHeight * 0.66); layoutPv(); buildLanes(); };
    const up = () => { splitter.removeEventListener('pointermove', mv); splitter.removeEventListener('pointerup', up); };
    splitter.addEventListener('pointermove', mv); splitter.addEventListener('pointerup', up);
  });

  /* ================= timeline ================= */
  const esc = s => s;
  function positionInner() { inner.style.transform = 'translateX(' + (lanes.clientWidth / 2 - P.t * ST.pps) + 'px)'; }
  function kfTimes(L) {
    const s = new Set(), add = a => a.k.forEach(k => s.add(Math.round(k.t * 1000) / 1000));
    Object.values(L.p).forEach(add); L.fx.forEach(e => Object.values(e.p).forEach(add)); return [...s];
  }
  function buildLanes() {
    const pps = ST.pps, dur = Math.max(P.dur(), 6);
    inner.style.width = (dur * pps + lanes.clientWidth) + 'px';
    inner.replaceChildren();
    proj.markers.forEach(m => inner.append(h('div', { class: 'mk-line', style: { left: m.t * pps + 'px' } })));
    for (let i = proj.layers.length - 1; i >= 0; i--) inner.append(rowEl(proj.layers[i]));
    lheads.replaceChildren(...proj.layers.slice().reverse().map(headEl));
    hint.hidden = proj.layers.length > 0;
    positionInner(); drawRuler();
  }
  function headEl(L) {
    const it = ML.media.items.get(L.mediaId), th = h('div', { class: 'lh-th' });
    if (L.type === 'image' && it) th.style.backgroundImage = 'url(' + it.url + ')';
    else if (L.type === 'video' && it) { if (it.thumb) th.style.backgroundImage = 'url(' + it.thumb + ')'; else ML.media.thumb(it).then(u => { if (u && th.isConnected) th.style.backgroundImage = 'url(' + u + ')'; }); }
    else th.innerHTML = I(L.type === 'audio' ? 'audio' : L.type === 'text' ? 'text' : 'shape');
    return h('div', { class: 'lh' + (L.id === ST.sel ? ' sel' : '') + (L.hidden ? ' off' : ''), style: L.tag ? { borderColor: L.tag } : null },
      h('button', { class: 'lh-eye', title: L.hidden ? 'Tampilkan layer' : 'Sembunyikan layer', html: I(L.hidden ? 'eyeoff' : 'eye'), onclick: () => { cp(); L.hidden = !L.hidden; P.syncMedia(false); buildLanes(); draw(); scheduleSave(); } }), th);
  }
  function rowEl(L) {
    const pps = ST.pps, on = L.id === ST.sel;
    const clip = h('div', { class: 'clip ' + L.type + (on ? ' sel' : '') + (L.locked ? ' locked' : '') + (L.hidden ? ' hid' : ''), style: { left: L.start * pps + 'px', width: Math.max(6, L.dur * pps) + 'px' } });
    clip.dataset.id = L.id;
    if (L.tag) { clip.dataset.tag = '1'; clip.style.setProperty('--tag', L.tag); }
    const it = ML.media.items.get(L.mediaId);
    if (L.type === 'image' && it) clip.style.backgroundImage = 'url(' + it.url + ')';
    else if (L.type === 'video' && it) {
      if (it.thumb) clip.style.backgroundImage = 'url(' + it.thumb + ')';
      else ML.media.thumb(it).then(u => { if (u && clip.isConnected) clip.style.backgroundImage = 'url(' + u + ')'; });
    } else if (L.type === 'audio' && it) {
      const c = h('canvas', { class: 'wave' }); clip.append(c);
      ML.media.peaks(it).then(pk => { if (pk) drawWave(c, pk, L, it); });
    }
    clip.append(h('span', { class: 'clip-name' }, L.locked ? h('i', { html: I('lock') }) : null, L.name));
    if (on && !L.locked) clip.append(h('i', { class: 'hdl l' }), h('i', { class: 'hdl r' }));
    if (on && !L.locked && (L.type === 'image' || L.type === 'video' || L.type === 'audio') && L.dur * pps >= 110) clip.append(h('button', { class: 'clip-act', title: 'Ganti media', html: I('swap') + '<span>Ganti</span>', onclick: e => { e.stopPropagation(); PN.replaceSheet(L); } }));
    if (on) kfTimes(L).forEach(t => { const d = h('i', { class: 'kfd', html: I('diamond'), style: { left: t * pps - 6 + 'px' } }); d.dataset.t = t; clip.append(d); });
    return h('div', { class: 'row' }, clip);
  }
  function drawWave(c, pk, L, it) {
    const w = clamp(Math.round(L.dur * ST.pps), 4, 4000), hh = 40; c.width = w; c.height = hh;
    const g = c.getContext('2d'); g.fillStyle = 'rgba(255,255,255,.75)';
    const sd = it.dur || L.srcDur || L.dur;
    for (let x = 0; x < w; x++) {
      const i = clamp(Math.floor((L.trimIn + x / w * L.dur) / sd * pk.length), 0, pk.length - 1), a = Math.max(1, pk[i] * hh * 0.9);
      g.fillRect(x, (hh - a) / 2, 1, a);
    }
  }
  function drawRuler() {
    const W = tl.clientWidth, dpr = window.devicePixelRatio || 1, H = 32;
    if (!W) return;
    if (ruler.width !== Math.round(W * dpr)) { ruler.width = Math.round(W * dpr); ruler.height = H * dpr; ruler.style.height = H + 'px'; }
    const g = ruler.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    const pps = ST.pps, t0 = P.t - W / 2 / pps, t1 = P.t + W / 2 / pps;
    const steps = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600], step = steps.find(s => s * pps >= 64) || 600;
    g.fillStyle = '#b896bf'; g.strokeStyle = '#4a4f6e'; g.font = '10px sans-serif'; g.lineWidth = 1;
    for (let i = Math.floor(t0 / step); i * step <= t1; i++) {
      const t = i * step; if (t < -1e-9) continue;
      const x = Math.round(W / 2 + (t - P.t) * pps) + 0.5;
      g.beginPath(); g.moveTo(x, 18); g.lineTo(x, H); g.stroke();
      for (let j = 1; j < 4; j++) { const xs = Math.round(W / 2 + (t + step * j / 4 - P.t) * pps) + 0.5; g.beginPath(); g.moveTo(xs, 26); g.lineTo(xs, H); g.stroke(); }
      const m = Math.floor(t / 60), s = t - m * 60;
      g.fillText(step < 1 ? m + ':' + ML.pad(Math.floor(s)) + '.' + String(Math.round((s % 1) * 100)).padStart(2, '0') : m + ':' + ML.pad(Math.round(s)), x + 3, 11);
    }
    g.fillStyle = '#ff3fb0';
    proj.markers.forEach(m => { const x = W / 2 + (m.t - P.t) * pps; if (x < -10 || x > W + 10) return; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 9, 5); g.lineTo(x, 10); g.closePath(); g.fillRect(x - 1, 0, 2, H); g.fill(); });
  }
  /* v3.49: playhead putih = belum pas; pink/magenta = tepat di penanda (toleransi setengah frame, sama dengan tombol penanda berikutnya/sebelumnya) */
  let phHit = false;
  function markerHit(t) { const e = 0.5 / proj.fps + 1e-6; return proj.markers.some(m => Math.abs(m.t - t) <= e); }
  function updateTime(t) {
    const s = ML.fmt(t, proj.fps); if (chip.textContent !== s) chip.textContent = s;
    const hit = markerHit(t); if (hit !== phHit) { phHit = hit; phLine.classList.toggle('hit', hit); chip.classList.toggle('hit', hit); }
    positionInner(); drawRuler();
    const now = performance.now(); if (now - updT > 90) { updT = now; refreshPanel(); }
  }

  /* --- gestur timeline --- */
  const tp = new Map(); let drag = null;
  const snapPts = L => { const a = [P.t, 0]; proj.markers.forEach(m => a.push(m.t)); proj.layers.forEach(o => { if (o !== L) a.push(o.start, o.start + o.dur); }); return a; };
  function snapMove(L, s) {
    if (!ST.snap) return s; const thr = 9 / ST.pps; let best = null;
    for (const p of snapPts(L)) for (const edge of [s, s + L.dur]) { const d = p - edge; if (Math.abs(d) < thr && (best === null || Math.abs(d) < Math.abs(best))) best = d; }
    return best === null ? s : s + best;
  }
  function snapEdge(L, t) {
    if (!ST.snap) return t; const thr = 9 / ST.pps; let best = t, bd = thr;
    for (const p of snapPts(L)) if (Math.abs(p - t) < bd) { bd = Math.abs(p - t); best = p; }
    return best;
  }
  tl.addEventListener('pointerdown', e => {
    if (e.target.closest('.fab,.clip-act,.lh')) return;
    tl.setPointerCapture(e.pointerId); tp.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (tp.size === 2) { const [a, b] = [...tp.values()]; drag = { mode: 'zoom', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, pps0: ST.pps }; return; }
    const clip = e.target.closest('.clip'), L = clip && proj.layers.find(l => l.id === clip.dataset.id);
    drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: P.t, moved: false, L, mode: 'scrub', onRuler: e.target === ruler, kfd: e.target.closest('.kfd') };
    if (L && L.id === ST.sel && !L.locked && !drag.kfd) {
      drag.mode = e.target.classList.contains('hdl') ? (e.target.classList.contains('l') ? 'trimL' : 'trimR') : 'move';
      drag.s0 = L.start; drag.d0 = L.dur; drag.tr0 = L.trimIn;
    }
  });
  tl.addEventListener('pointermove', e => {
    if (!tp.has(e.pointerId)) return; tp.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!drag) return;
    if (drag.mode === 'zoom') {
      if (tp.size < 2) return; const [a, b] = [...tp.values()];
      ST.pps = clamp(drag.pps0 * (Math.hypot(a.x - b.x, a.y - b.y) / drag.d0), 8, 1500); buildLanes(); return;
    }
    if (drag.id !== e.pointerId) return;
    const dx = e.clientX - drag.x0;
    if (!drag.moved && Math.abs(dx) < 6 && Math.abs(e.clientY - drag.y0) < 6) return;
    if (!drag.moved) { drag.moved = true; if (drag.mode === 'scrub' && P.playing) P.pause(); }
    const L = drag.L, d = dx / ST.pps;
    if (drag.mode === 'scrub') P.seek(drag.t0 - d);
    else if (drag.mode === 'move') { cp('mv' + L.id); L.start = Math.max(0, snapMove(L, Math.max(0, drag.s0 + d)));  buildLanes(); P.syncMedia(false); draw(); scheduleSave(); }
    else if (drag.mode === 'trimL') {
      cp('tl' + L.id);
      let s = snapEdge(L, drag.s0 + d), delta = s - drag.s0;
      delta = clamp(delta, isMedia(L) ? -Math.min(drag.s0, drag.tr0) : -drag.s0, drag.d0 - 0.05);
      L.start = drag.s0 + delta; L.dur = drag.d0 - delta; if (isMedia(L)) L.trimIn = drag.tr0 + delta;
      buildLanes(); P.syncMedia(false); draw(); scheduleSave();
    } else if (drag.mode === 'trimR') {
      cp('tr' + L.id);
      let end = snapEdge(L, drag.s0 + drag.d0 + d), nd = Math.max(0.05, end - drag.s0);
      if (isMedia(L) && L.srcDur) nd = Math.min(nd, L.srcDur - L.trimIn);
      L.dur = nd; buildLanes(); draw(); scheduleSave();
    }
  });
  const tlUp = e => {
    tp.delete(e.pointerId);
    if (!drag) return;
    if (drag.mode === 'zoom') { if (tp.size === 0) drag = null; return; }
    if (drag.id !== e.pointerId) return;
    const dd = drag; drag = null;
    if (!dd.moved && e.type === 'pointerup') {
      if (dd.kfd) { P.seek((dd.L ? dd.L.start : 0) + +dd.kfd.dataset.t); return; }
      if (dd.onRuler) { const r = ruler.getBoundingClientRect(), t = P.t + (e.clientX - r.left - r.width / 2) / ST.pps, m = proj.markers.find(k => Math.abs(k.t - t) < 14 / ST.pps); if (m) { markersSheet(); return; } P.seek(t); return; }
      if (dd.L) { if (dd.L.id !== ST.sel) select(dd.L.id); } else select(null);
    } else if (dd.moved) { buildLanes(); }
  };
  tl.addEventListener('pointerup', tlUp); tl.addEventListener('pointercancel', tlUp);

  /* ================= seleksi / toolbar ================= */
  function select(id) {
    ST.sel = id; ST.kf = null; buildLanes();
    if (ST.panel) { if (!id) PN.closePanel(); else { PN.renderTop(); PN.rebuild(); } }
    renderBar(); draw();
  }
  function renderBar() { PN.renderTop(); PN.renderTools(); fab.hidden = !!ST.sel; layoutPv(); }
  function toggleLock() { const L = sel(); if (!L) return; cp(); L.locked = !L.locked; if (L.locked && ST.panel) PN.closePanel(); buildLanes(); renderBar(); draw(); scheduleSave(); }
  function toggleHide() { const L = sel(); if (!L || !guard(L)) return; cp(); L.hidden = !L.hidden; P.syncMedia(false); buildLanes(); renderBar(); draw(); scheduleSave(); }
  function toggleMute() { const L = sel(); if (!L || !guard(L)) return; cp(); L.muted = !L.muted; ML.audio.setVolume(ML.media.el(L), L); renderBar(); scheduleSave(); }
  function trimStart() {
    const L = sel(); if (!L || !guard(L)) return; const d = P.t - L.start;
    if (d < 0.02 || L.dur - d < 0.05) { ML.toast('Geser playhead ke dalam layer untuk memangkas'); return; }
    cp(); L.start = P.t; L.dur -= d; if (isMedia(L)) L.trimIn += d; P.syncMedia(false); changed(true);
  }
  function trimEnd() {
    const L = sel(); if (!L || !guard(L)) return; const d = P.t - L.start;
    if (d < 0.05 || L.dur - d < 0.02) { ML.toast('Geser playhead ke dalam layer untuk memangkas'); return; }
    cp(); L.dur = d; P.syncMedia(false); changed(true);
  }
  function splitSel() {
    const L = sel(); if (!L || !guard(L)) return;
    if (P.t - L.start < 0.02 || L.start + L.dur - P.t < 0.02) { ML.toast('Geser playhead ke dalam layer untuk memotong'); return; }
    cp(); ML.splitLayer(proj, L, P.t); P.syncMedia(false); changed(true); ML.toast('Layer dipotong');
  }
  function dupSel() { const L = sel(); if (!L) return; cp(); const C = ML.duplicateLayer(proj, L); select(C.id); scheduleSave(); }
  function moveSel(d) {
    const L = sel(); if (!L || !guard(L)) return; const i = proj.layers.indexOf(L), j = i + d;
    if (j < 0 || j >= proj.layers.length) return; cp(); proj.layers.splice(i, 1); proj.layers.splice(j, 0, L); changed(true);
  }
  async function delSel() {
    const L = sel(); if (!L || !guard(L)) return;
    cp(); const e = ML.media.els.get(L.id); if (e) e.pause();
    proj.layers.splice(proj.layers.indexOf(L), 1); ST.sel = null; PN.closePanel(); renderBar(); P.t = clamp(P.t, 0, P.dur()); changed(true);
  }

  /* ================= transport ================= */
  function togglePlay() { if (P.playing) P.pause(); else if (!P.dur()) ML.toast('Tambahkan layer dulu'); else P.play(); }
  P.onstate = on => { bPlay.innerHTML = I(on ? 'pause' : 'play'); };
  P.onframe = t => { draw(t); flagUpd(); };
  function gotoMarker(dir) {
    const t = P.t, e = 0.5 / proj.fps, d = P.dur(), ms = proj.markers.map(m => m.t);
    P.seek(dir < 0 ? (ms.filter(m => m < t - e).pop() ?? 0) : (ms.find(m => m > t + e) ?? d));
  }
  function gotoKey(dir) {
    const L = sel(); if (!L) { ML.toast('Pilih layer dulu'); return; }
    const ts = new Set(), add = a => a && a.k && a.k.forEach(q => ts.add(+(L.start + q.t).toFixed(4)));
    for (const k in L.p) add(L.p[k]); (L.fx || []).forEach(e => { for (const k in e.p) add(e.p[k]); });
    const a = [...ts].sort((x, y) => x - y), t = P.t, e = 0.5 / proj.fps, n = dir < 0 ? a.filter(x => x < t - e).pop() : a.find(x => x > t + e);
    if (n === undefined) { ML.toast('Tidak ada keyframe lagi'); return; } P.seek(n);
  }
  function addMarker() {
    const t = P.t, i = proj.markers.findIndex(m => Math.abs(m.t - t) < 1 / proj.fps); cp();
    if (i >= 0) { proj.markers.splice(i, 1); ML.toast('Penanda dihapus'); }
    else { proj.markers.push({ id: ML.uid(), t, name: 'Penanda ' + (proj.markers.length + 1) }); proj.markers.sort((a, b) => a.t - b.t); ML.toast('Penanda ditambahkan'); }
    changed(true); flagUpd();
  }
  function markersSheet() {
    ML.sheet('Penanda', (body, close) => {
      const draw1 = () => {
        body.replaceChildren(...(proj.markers.length ? proj.markers.map(m => h('div', { class: 'mrow' },
          h('button', { class: 'row-btn', html: I('flag') + '<b>' + m.name.replace(/</g, '&lt;') + '</b><small>' + ML.fmt(m.t, proj.fps) + '</small>', onclick: () => { P.seek(m.t); close(); } }),
          h('button', { class: 'icon-btn dark', html: I('text'), onclick: async () => { const n = await ML.dialog({ title: 'Nama penanda', input: true, value: m.name, ok: 'Simpan' }); if (n) { cp(); m.name = n; scheduleSave(); draw1(); } } }),
          h('button', { class: 'icon-btn dark', html: I('trash'), onclick: () => { cp(); proj.markers.splice(proj.markers.indexOf(m), 1); changed(true); flagUpd(); draw1(); } })))
          : [h('p', { class: 'empty', text: 'Belum ada penanda. Ketuk ikon bendera di bar kontrol untuk menambah di posisi playhead.' })]));
      };
      draw1();
    });
  }

  /* ================= tambah layer ================= */
  function addSheet() {
    ML.sheet('Tambah layer', (body, close) => {
      const o = (ic, label, fn) => h('button', { class: 'add-btn', html: I(ic) + '<span>' + label + '</span>', onclick: () => { close(); fn(); } });
      body.append(h('div', { class: 'add-grid' },
        o('video', 'Video', () => addMedia('video/*', 'video')), o('image', 'Foto', () => addMedia('image/*', 'image')), o('audio', 'Audio', () => addMedia('', 'audio')), o('mic', 'Rekam audio', () => ML.recorder(addRecorded)),
        o('text', 'Teks', addText), o('shape', 'Bentuk', shapeSheet), o('film', 'Latar warna', () => addShape('rect', true)),
        o('copy', 'Salin latar (penyesuaian)', addAdjust), o('layers', 'Null object', () => addK3('null')), o('film', 'Kamera', () => addK3('camera')), o('image', 'Foto 3D (experimental)', addPhoto3d), o('layers', 'Model 3D (beta)', addGlb), o('film', 'Map 3D (beta)', () => addGlb(true)), o('layers', 'Model + Map 3D (experimental)', addCombo)));
    });
  }
  /** Foto 3D (experimental): foto datar dijadikan relief 3D + kamera 3D bebas */
  async function addPhoto3d() {
    const files = await ML.pickFiles('image/*', false); const f = files && files[0]; if (!f) return;
    try {
      ML.toast('Mengimpor ' + f.name, 1500);
      const it = await ML.media.importFile(proj, f, 'image'); if (it.kind !== 'image') throw new Error('Pilih file foto');
      const L = ML.makeLayer(proj, 'image', { name: f.name.replace(/\.[^.]+$/, '') + ' (3D)', mediaId: it.id, start: P.t, dur: 5 });
      L.bw = proj.w; L.bh = proj.h; L.ph3 = { mode: 1 }; ML.ensureLayer(L);
      L.p.cam_z = ML.A(+ML.ph3FitZ(it.w / it.h, proj.w / proj.h, 50).toFixed(2));
      pushLayer(L);
      ML.toast('Foto 3D ditambahkan. Atur posisi foto & kamera di Move & Transform → 3D / Z (geser X, Y, Z, sudut kamera; ◆ untuk keyframe)', 4200);
    } catch (e) { ML.toast('Gagal impor foto 3D: ' + e.message, 3500); }
  }
  async function addGlb(isMap, isSet) {
    const r = await ML.pickFiles('', true); if (!r || !r.length) return; const f = r.find(x => /\.(glb|gltf|fbx|usdz)$/i.test(x.name)) || r[0];
    try {
      const buf = await ML.modelToGlb(f, r); ML.glbParse(buf); const S = Math.round(Math.min(proj.w, proj.h) * 0.6);
      const L = ML.makeLayer(proj, 'shape', { name: (isSet ? 'Set ' : '') + f.name.replace(/\.(glb|gltf)$/i, ''), start: isMap ? 0 : Math.max(0, P.t), dur: isMap ? Math.max(P.dur(), 5) : 5, bw: isMap ? proj.w : S, bh: isMap ? proj.h : S });
      L.glb = { name: f.name, b64: ML.glbB64(buf), map: !!isMap }; L.shape.noFill = true; L.shape.strokeW = 0; ML.ensureLayer(L);
      pushLayer(L); if (isMap) { proj.layers.splice(proj.layers.indexOf(L), 1); proj.layers.unshift(L); renderBar(); changed(true); }
      ML.toast(isSet ? 'Set map + model 3D ditambahkan (1 file, satu adegan, satu kamera). Atur kamera di Move & Transform → 3D / Z; tampil/sembunyi bagian ada di menu 3D' : isMap ? 'Map 3D ditambahkan di paling bawah. Atur kamera di Move & Transform → 3D / Z' : 'Model 3D ditambahkan. Atur rotasi & cahaya di Move & Transform → 3D / Z', 3200);
    } catch (e) { ML.toast('Gagal membuka .glb: ' + e.message, 3500); }
  }
  /** Model + Map 3D (experimental): pilih mode impor */
  function addCombo() {
    ML.sheet('Model + Map 3D (experimental)', (body, close) => body.append(
      h('p', { class: 'dlg-text', text: 'Pilih cara impor:' }),
      h('button', { class: 'row-btn', html: I('layers') + '<span>Set map + model 3D (test)</span>', onclick: () => { close(); addSet(); } }),
      h('p', { class: 'dlg-text', text: '1 file saja: map dan model sudah jadi satu di dalam file (.glb / .gltf). Dirender sebagai satu adegan.' }),
      h('button', { class: 'row-btn', html: I('film') + '<span>Map & model 3D pisah (beta)</span>', onclick: () => { close(); addSplit(); } }),
      h('p', { class: 'dlg-text', text: '2 file: satu file map dan satu file model terpisah. Model bisa digeser, diputar, diskala, dan diganti di dalam map.' })));
  }
  /** Mode 1: Set map + model (test) — 1 file, jadi satu adegan layar penuh */
  function addSet() { addGlb(true, true); }
  /** Mode 2: Map & model pisah (beta) — 2 file; model ditaruh di dalam adegan map (satu kamera, satu depth buffer) */
  function addSplit() {
    const pk = async () => { const r = await ML.pickFiles('', true); if (!r || !r.length) return null; const f = r.find(x => /\.(glb|gltf|fbx|usdz)$/i.test(x.name)) || r[0], buf = await ML.modelToGlb(f, r); ML.glbParse(buf); return { f, buf }; };
    const strip = n => n.replace(/\.(glb|gltf|fbx|usdz)$/i, '');
    let A = null, B = null;
    ML.sheet('Map & model 3D pisah (beta)', (body, close) => {
      const info = h('p', { class: 'dlg-text' }), go = h('button', { class: 'btn primary wide', text: 'Tambahkan ke proyek' });
      const draw = () => { info.textContent = 'Map: ' + (A ? A.f.name : 'belum dipilih') + '\nModel: ' + (B ? B.f.name : 'belum dipilih'); info.style.whiteSpace = 'pre-line'; go.disabled = !(A && B); go.style.opacity = A && B ? '1' : '.4'; };
      const pick = which => async () => {
        try { const x = await pk(); if (!x) return; if (which === 'a') A = x; else B = x; draw(); } catch (e) { ML.toast('Gagal membuka file: ' + e.message, 3500); }
      };
      go.onclick = () => {
        if (!A || !B) return;
        try {
          const L = ML.makeLayer(proj, 'shape', { name: strip(A.f.name) + ' + ' + strip(B.f.name), start: 0, dur: Math.max(P.dur(), 5), bw: proj.w, bh: proj.h });
          L.glb = { name: A.f.name, b64: ML.glbB64(A.buf), map: true, mod: { name: B.f.name, b64: ML.glbB64(B.buf), opt: {} } }; L.shape.noFill = true; L.shape.strokeW = 0; ML.ensureLayer(L); ML.glbFloor(L);
          close(); pushLayer(L); proj.layers.splice(proj.layers.indexOf(L), 1); proj.layers.unshift(L); renderBar(); changed(true);
          ML.toast('Map & model 3D ditambahkan. Atur posisi model di Move & Transform → 3D / Z', 4000);
        } catch (e) { ML.toast('Gagal: ' + e.message, 3500); }
      };
      body.append(info, h('button', { class: 'row-btn', html: I('film') + '<span>Pilih file MAP</span>', onclick: pick('a') }), h('button', { class: 'row-btn', html: I('layers') + '<span>Pilih file MODEL</span>', onclick: pick('b') }), go);
      draw();
    });
  }
  function addK3(kind) {
    const L = ML.makeLayer(proj, 'shape', { name: kind === 'null' ? 'Null' : 'Kamera', start: 0, dur: Math.max(P.dur(), 5), bw: 120, bh: 120 });
    L.k3 = kind; L.shape.noFill = true; L.shape.strokeW = 0; if (kind === 'camera') L.p.zoom = ML.A(100);
    pushLayer(L); ML.toast(kind === 'null' ? 'Null object dibuat. Sambungkan layer lain lewat Move & Transform → 3D' : 'Kamera dibuat. Aktifkan mode 3D di layer lain agar ikut kamera');
  }
  function pushLayer(L) { cp(); proj.layers.push(L); ST.sel = L.id; ST.kf = null; renderBar(); changed(true); }
  async function addMedia(accept, want) {
    const files = await ML.pickFiles(accept, true);
    for (const f of files) {
      try {
        ML.toast('Mengimpor ' + f.name, 1500);
        const it = await ML.media.importFile(proj, f, want);
        const L = ML.makeLayer(proj, it.kind, { name: f.name.replace(/\.[^.]+$/, ''), mediaId: it.id, start: P.t, dur: it.kind === 'image' ? 5 : Math.max(0.1, it.dur), srcDur: it.dur });
        if (it.kind !== 'audio') [L.bw, L.bh] = ML.fitBox(it.w, it.h, proj);
        pushLayer(L);
      } catch (e) { ML.toast(e.message, 3500); }
    }
  }
  async function addRecorded(f) {
    try {
      const it = await ML.media.importFile(proj, f, 'audio');
      pushLayer(ML.makeLayer(proj, 'audio', { name: f.name.replace(/\.[^.]+$/, ''), mediaId: it.id, start: P.t, dur: Math.max(0.1, it.dur), srcDur: it.dur }));
    } catch (e) { ML.toast(e.message, 3500); }
  }
  /** ubah suara layer audio terpilih jadi cewek (layer baru, layer asli dibisukan) */
  function voiceFemale(L) {
    const it = ML.media.items.get(L.mediaId); if (!it) { ML.toast('Media tidak ditemukan'); return; }
    ML.sheet('Ubah suara', (body, close) => {
      const st = h('div', { class: 'info', text: 'Pilih preset atau atur manual, lalu ubah. Layer baru dibuat di posisi yang sama, layer asli dibisukan.' });
      const go = h('button', { class: 'btn primary wide', text: 'Ubah suara' }), pk = ML.voice.picker(() => { }, 'oneesan');
      go.onclick = async () => {
        go.disabled = true; st.textContent = 'Mengubah suara… 0%';
        try {
          const buf = await ML.voice.decode(it.blob), x = ML.voice.mono(buf, L.trimIn || 0, (L.trimIn || 0) + L.dur);
          const y = await ML.voice.process(x, buf.sampleRate, pk.get(), p => { st.textContent = 'Mengubah suara… ' + Math.round(p * 100) + '%'; }), nm = L.name + ' (' + pk.label() + ')';
          const f = new File([ML.voice.wav(y, buf.sampleRate)], nm + '.wav', { type: 'audio/wav' }), m = await ML.media.importFile(proj, f, 'audio');
          cp(); L.muted = true; ML.audio.setVolume(ML.media.el(L), L);
          const N = ML.makeLayer(proj, 'audio', { name: nm, mediaId: m.id, start: L.start, dur: Math.max(0.1, m.dur), srcDur: m.dur }); N.volume = L.volume;
          proj.layers.push(N); ST.sel = N.id; renderBar(); changed(true); close(); ML.toast('Suara diubah. Layer asli dibisukan.', 3000);
        } catch (e) { st.textContent = 'Gagal: ' + e.message; go.disabled = false; }
      };
      body.append(st, pk.el, go);
    });
  }
  function addText() { const L = ML.makeLayer(proj, 'text', { name: 'Teks', start: P.t }); ML.textCanvas(L); pushLayer(L); PN.openPanel('edit'); }
  function shapeSheet() {
    ML.sheet('Bentuk', (body, close) => body.append(h('div', { class: 'add-grid' }, [['rect', 'Persegi'], ['ellipse', 'Lingkaran'], ['triangle', 'Segitiga'], ['star', 'Bintang']].map(([k, l]) =>
      h('button', { class: 'add-btn', html: I('shape') + '<span>' + l + '</span>', onclick: () => { close(); addShape(k); } })))));
  }
  function addShape(kind, full) {
    const L = ML.makeLayer(proj, 'shape', { name: full ? 'Latar warna' : 'Bentuk', start: P.t });
    L.shape.kind = kind; if (full) { L.bw = proj.w; L.bh = proj.h; L.shape.fill = '#3b3f8f'; } pushLayer(L);
  }
  function addAdjust() {
    if (!rend.fx.ok) { ML.toast('WebGL tidak tersedia di perangkat ini'); return; }
    const L = ML.makeLayer(proj, 'shape', { name: 'Salin latar', start: P.t }); L.bw = proj.w; L.bh = proj.h; L.shape.fill = '#ffffff';
    L.fx.push(ML.makeEffect('copybg')); pushLayer(L); PN.openPanel('fx');
  }

  function refreshPanel() { PN.refresh(); }

  /* ================= pengaturan & ekspor ================= */
  /** ganti rasio / resolusi / fps proyek kapan saja (Undo tersedia) */
  function formatBlock(close) {
    const rp = String(proj.ratio || '').split(':').map(Number), shortNow = Math.min(proj.w, proj.h);
    const cur = { ratio: ML.RATIOS.includes(proj.ratio) ? proj.ratio : 'custom', cw: rp[0] || 16, ch: rp[1] || 9,
      res: Object.keys(ML.RES).find(k => ML.RES[k] === shortNow) || 'custom', cshort: shortNow, fps: ML.FPS.includes(proj.fps) ? proj.fps : 'custom', cfps: proj.fps };
    const ratioV = () => cur.ratio === 'custom' ? [Math.max(1, cur.cw), Math.max(1, cur.ch)] : cur.ratio.split(':').map(Number);
    const shortV = () => cur.res === 'custom' ? clamp(Math.round(cur.cshort) || 720, 120, 4320) : ML.RES[cur.res];
    const fpsV = () => cur.fps === 'custom' ? clamp(Math.round(cur.cfps) || 30, 1, 480) : cur.fps;
    const info = h('div', { class: 'info' }), warn = h('div', { class: 'warn' });
    const num = (v, min, max, on) => h('input', { class: 'txt num', type: 'number', min, max, value: v, oninput: e => { on(+e.target.value); upd(); } });
    const rC = h('div', { class: 'cust' }, num(cur.cw, 1, 99, v => { cur.cw = v; }), h('span', { text: ':' }), num(cur.ch, 1, 99, v => { cur.ch = v; }));
    const sC = h('div', { class: 'cust' }, num(cur.cshort, 120, 4320, v => { cur.cshort = v; }), h('span', { text: 'px (sisi pendek)' }));
    const fC = h('div', { class: 'cust' }, num(cur.cfps, 1, 480, v => { cur.cfps = v; }), h('span', { text: 'fps' }));
    const chips = (opts, get, set) => { const box = h('div', { class: 'chips sm' }); const dr = () => box.replaceChildren(...opts.map(([v, l]) => h('button', { class: 'chip' + (get() === v ? ' on' : ''), text: l, onclick: () => { set(v); dr(); vis(); } }))); dr(); return box; };
    function upd() {
      const [rw, rh] = ratioV(), [w, hh] = ML.calcSize(rw, rh, shortV()), fps = fpsV();
      info.textContent = 'Hasil: ' + w + ' × ' + hh + ' • ' + fps + ' fps';
      warn.textContent = (w !== proj.w || hh !== proj.h) ? 'Posisi & ukuran layer disesuaikan otomatis. Bisa dibatalkan dengan Undo.' : ((shortV() >= 2160 || fps >= 120) ? 'Resolusi/fps tinggi berat di HP.' : '');
    }
    function vis() { rC.hidden = cur.ratio !== 'custom'; sC.hidden = cur.res !== 'custom'; fC.hidden = cur.fps !== 'custom'; upd(); }
    const go = h('button', { class: 'btn primary wide', text: 'Terapkan format', onclick: () => {
      const [rw, rh] = ratioV(), [w, hh] = ML.calcSize(rw, rh, shortV()), fps = fpsV();
      if (w === proj.w && hh === proj.h && fps === proj.fps) { ML.toast('Tidak ada perubahan'); return; }
      P.pause(); cp(); ML.resizeProject(proj, w, hh); proj.fps = fps;
      proj.ratio = cur.ratio === 'custom' ? rw + ':' + rh : cur.ratio; proj.resLabel = cur.res === 'custom' ? shortV() + 'p' : cur.res;
      P.t = clamp(P.t, 0, P.dur()); close(); layoutPv(); buildLanes(); renderBar(); PN.rebuild(); draw(); scheduleSave();
      ML.toast('Format diubah: ' + w + '×' + hh + ' • ' + fps + ' fps', 3000);
    } });
    const out = h('div', {}, PN.sec('Rasio'), chips([...ML.RATIOS.map(r => [r, r]), ['custom', 'Kustom']], () => cur.ratio, v => { cur.ratio = v; }), rC,
      PN.sec('Resolusi'), chips([...Object.keys(ML.RES).map(r => [r, r]), ['custom', 'Kustom']], () => cur.res, v => { cur.res = v; }), sC,
      PN.sec('Frame rate'), chips([...ML.FPS.map(f => [f, f + ' fps']), ['custom', 'Kustom']], () => cur.fps, v => { cur.fps = v; }), fC, info, warn, go);
    vis(); return out;
  }
  function settingsSheet() {
    ML.sheet('Pengaturan proyek', (body, close) => {
      const bgBtn = PN.colorBtn(() => proj.bg === 'transparent' ? (proj._bgS || '#000000') : proj.bg, c => { proj.bg = c; proj._bgS = c; });
      body.append(PN.sec('Nama proyek'), h('input', { class: 'txt', type: 'text', value: proj.name, oninput: e => { nameIn.value = e.target.value; dirty = true; scheduleSave(); } }),
        PN.sec('Warna latar'), bgBtn, PN.toggleChips([[false, 'Warna'], [true, 'Transparan']], () => proj.bg === 'transparent', v => { cp(); if (v) { proj._bgS = proj.bg; proj.bg = 'transparent'; } else proj.bg = proj._bgS || '#000000'; draw(); scheduleSave(); }),
        PN.sec('Kualitas preview (makin rendah makin lancar)'), PN.toggleChips(ML.PREVIEW_Q.map(([v, l]) => [v, l]), () => ML.previewMax(), v => { ML.lsSet('ml.pv', v); layoutPv(); }),
        PN.sec('Snap (magnet) ke playhead, penanda, dan tepi layer'), PN.toggleChips([[true, 'Hidup'], [false, 'Mati']], () => ST.snap, v => { ST.snap = v; ML.lsSet('ml.snap', v ? '1' : '0'); }),
        h('button', { class: 'row-btn', html: I('flag') + 'Daftar penanda', onclick: () => { close(); markersSheet(); } }),
        formatBlock(close), h('p', { class: 'dlg-text', text: 'Sekarang: ' + proj.w + ' × ' + proj.h + ' • ' + proj.fps + ' fps • rasio ' + proj.ratio + ' • durasi ' + ML.fmt(P.dur(), proj.fps) }));
    });
  }
  const EXP = { short: 0, fps: 0 };
  /** pilihan resolusi & fps untuk ekspor video (tidak mengubah proyek) */
  function exportOpts(close) {
    const info = h('div', { class: 'info' }), warn = h('div', { class: 'warn' });
    const dims = () => EXP.short ? ML.calcSize(proj.w, proj.h, EXP.short) : [proj.w & ~1, proj.h & ~1];
    const upd = () => { const [w, hh] = dims(), f = EXP.fps || proj.fps; info.textContent = 'Hasil: ' + w + ' × ' + hh + ' • ' + f + ' fps'; warn.textContent = (EXP.short >= 2160 || f >= 120 || w * hh * f > 2.5e8) ? 'Resolusi/fps tinggi: ekspor bisa lama dan berat di HP.' : (w > proj.w ? 'Di atas resolusi proyek: ukuran bertambah, detail media tidak.' : ''); };
    const chips = (opts, get, set) => { const box = h('div', { class: 'chips sm' }); const dr = () => box.replaceChildren(...opts.map(([v, l]) => h('button', { class: 'chip' + (get() === v ? ' on' : ''), text: l, onclick: () => { set(v); dr(); upd(); } }))); dr(); return box; };
    const go = h('button', { class: 'btn primary wide', html: I('video') + 'Ekspor video', onclick: () => { const [w, hh] = dims(); close(); exportVideo({ w, h: hh, fps: EXP.fps || proj.fps }); } });
    upd();
    return h('div', {}, PN.sec('Resolusi ekspor'), chips([[0, 'Sama proyek (' + Math.min(proj.w, proj.h) + 'p)'], [480, '480p'], [720, '720p'], [1080, '1080p'], [1440, '2K'], [2160, '4K']], () => EXP.short, v => { EXP.short = v; }),
      PN.sec('Frame rate ekspor'), chips([[0, 'Sama proyek (' + proj.fps + ')'], [24, '24'], [30, '30'], [60, '60'], [120, '120']], () => EXP.fps, v => { EXP.fps = v; }), info, warn, go);
  }
  function exportSheet() { ML.exportScreen({ proj, P, save, exportVideo, draw }); }
  async function exportVideo(o = {}) {
    if (!P.dur()) { ML.toast('Proyek masih kosong'); return; }
    P.pause(); const ctl = {}; let running = true; ML.exportChecker = !o.alpha;
    const fill = h('i'), txt = h('div', { class: 'dlg-text', text: 'Menyiapkan…' });
    const sh = ML.sheet('Mengekspor video', body => body.append(txt, h('div', { class: 'prog' }, fill),
      h('div', { class: 'btn-row' }, h('button', { class: 'btn ghost', text: 'Batal', onclick: () => ctl.cancel && ctl.cancel() }))), { onClose: () => { if (running && ctl.cancel) ctl.cancel(); } });
    try {
      const r = await (o.alpha ? ML.exportWebmAlpha : ML.exportVideo)(proj, { fps: o.fps || proj.fps, w: o.w, h: o.h, audio: o.audio }, (p, info) => { fill.style.width = (p * 100).toFixed(1) + '%'; txt.textContent = Math.round(p * 100) + '% • ' + (info || 'jangan tutup aplikasi'); }, ctl);
      running = false; sh.close();
      if (!r) { ML.exportChecker = false; ML.toast('Ekspor dibatalkan'); return; }
      ML.toast('Menyimpan video…'); const loc = await ML.saveBlob(r.blob, ML.exportFileName(proj, r.ext), r.mime);
      ML.toast('Video tersimpan: ' + loc + (r.note ? ' — ' + r.note : ''), r.note ? 7000 : 5000);
    } catch (e) { running = false; sh.close(); ML.toast('Gagal ekspor: ' + e.message, 4500); }
    ML.exportChecker = false; draw();
  }

  /* ================= keluar & siklus hidup ================= */
  async function exit() {
    P.pause(); P.onframe = null; P.onstate = null; clearTimeout(saveT);
    window.removeEventListener('resize', onResize); window.removeEventListener('keydown', onKey);
    try { await save(true); } catch (e) { /* abaikan */ }
    rend.dispose(); ML.media.dispose(); ML.editor = null; ML.onRootBack = ML.homeBack;
    ML.home.show();
  }
  function setUi() {
    const d = ML.uiMode() === 'desk'; ST.desk = d; edEl.classList.toggle('desk', d);
    ST.pvH = Math.round(innerHeight * (d ? 0.5 : 0.34));
    renderBar(); layoutPv(); buildLanes(); if (ST.panel) PN.rebuild();
  }
  /* pintasan keyboard (mode Desktop): Spasi = play/pause, Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z, Delete = hapus layer */
  const onKey = e => {
    if (!document.body.contains(tl)) { window.removeEventListener('keydown', onKey); return; }
    if (!ST.desk) return;
    const t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (document.querySelector('.backdrop.open,.ebrowser,.ml-guide')) return;
    const k = (e.key || '').toLowerCase(), ctl = e.ctrlKey || e.metaKey;
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    else if (ctl && k === 'z') { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); }
    else if (ctl && k === 'y') { e.preventDefault(); doRedo(); }
    else if (e.key === 'Delete' && sel()) { e.preventDefault(); delSel(); }
  };
  window.addEventListener('keydown', onKey);
  const onResize = () => { ST.pvH = Math.min(ST.pvH, innerHeight * 0.66); layoutPv(); buildLanes(); };
  window.addEventListener('resize', onResize);
  ML.onRootBack = () => { if (ST.panel) { PN.closePanel(); return true; } if (ST.sel) { select(null); return true; } return ML.confirmTap('Ketuk sekali lagi untuk keluar ke beranda', exit); };

  const E = { proj, P, ST, rend, box, top, tools, pframe, nameIn, sel, select, cp, changed, scheduleSave, guard, eps, buildLanes, draw, exit, settingsSheet, exportSheet,
    dupSel, delSel, splitSel, trimStart, trimEnd, toggleLock, toggleMute, toggleHide, voiceFemale, moveSel, renderBar, setUi, relayout: () => { layoutPv(); buildLanes(); } };
  const PN = ML.Panels(E);

  updHist(); layoutPv(); buildLanes(); renderBar(); draw();
  return { exit, setUi, proj, state: ST, player: P, select, openPanel: PN.openPanel, panels: PN, addShape, addText };
};

