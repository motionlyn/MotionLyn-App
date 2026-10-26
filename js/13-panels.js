'use strict';
/* Toolbar, panel, menu, dan Browser Efek bergaya Alight Motion.
   Setiap panel punya "rail" di kiri: kembali, keyframe (◆+), kurva, dan menu lainnya. */
ML.Panels = function (E) {
  const h = ML.h, I = ML.icon, P = E.P, ST = E.ST, proj = E.proj, clamp = ML.clamp;
  const ltOf = L => clamp(P.t - L.start, 0, L.dur);
  const isMedia = L => L.type === 'image' || L.type === 'video' || L.type === 'audio';
  const sec = t => h('div', { class: 'psec', text: t });
  const TITLES = { xform: 'Move & Transform', blend: 'Blending & Opacity', color: 'Color & Fill', border: 'Border & Bayangan', edit: 'Edit', media: 'Ganti Media', presets: 'Presets', fx: 'Efek', volume: 'Volume' };

  /* ================= kontrol dasar ================= */
  const toggleChips = (opts, get, set) => {
    const box = h('div', { class: 'chips sm' });
    const draw1 = () => box.replaceChildren(...opts.map(([v, l]) => h('button', { class: 'chip' + (get() === v ? ' on' : ''), text: l, onclick: () => { E.cp(); set(v); E.changed(); draw1(); } })));
    draw1(); return box;
  };
  const SW = ['#ffffff', '#000000', '#ff3b5c', '#ff7a45', '#ffc53d', '#7be495', '#00f5a0', '#22d3ee', '#4f8cff', '#8b5cf6', '#d946ef', '#ff7eb6'];
  const colorBtn = (get, set) => {
    const sw = h('i', { class: 'swatch', style: { background: get() } });
    return h('button', { class: 'bgbtn', onclick: () => ML.colorPicker(get(), c => { E.cp('col'); set(c); sw.style.background = c; E.changed(); }) }, sw, h('span', { text: get() }));
  };
  const inlineColor = (get, set) => {
    const box = h('div', { class: 'swgrid' });
    const draw1 = () => box.replaceChildren(
      ...SW.map(c => h('button', { class: 'sw' + (String(get()).toLowerCase() === c ? ' on' : ''), style: { background: c }, onclick: () => { E.cp('col'); set(c); E.changed(); draw1(); } })),
      h('button', { class: 'sw more', html: I('plus'), onclick: () => ML.colorPicker(get(), c => { E.cp('col'); set(c); E.changed(); draw1(); }) }));
    draw1(); return box;
  };
  const plain = (label, get, set, min, max, step = 1) => {
    const sl = h('input', { class: 'sld', type: 'range', min, max, step }), num = h('input', { class: 'txt num', type: 'number', step });
    const sync = () => { sl.value = get(); if (document.activeElement !== num) num.value = Math.round(get() * 100) / 100; };
    const on = v => { if (!isFinite(v)) return; E.cp('pl' + label); set(v); E.changed(); sync(); };
    sl.addEventListener('input', () => on(+sl.value)); num.addEventListener('input', () => on(parseFloat(num.value)));
    sync(); return h('div', { class: 'prow' }, h('span', { class: 'plab', text: label }), sl, num, h('i', { class: 'kfb ph' }));
  };
  /** baris parameter: slider + angka + tombol keyframe */
  function paramRow(L, anim, d, label, ck, after) {
    const lt = () => ltOf(L), eps = () => E.eps(), dec = (d.step || 1) < 1 ? 2 : 0;
    const row = h('div', { class: 'prow' });
    const lab = h('span', { class: 'plab', text: label + (d.unit ? ' (' + d.unit + ')' : '') });
    if (d.type === 'sel') {
      const draw1 = () => row.replaceChildren(lab, h('div', { class: 'chips sm' }, d.opts.map((o, i) => h('button', { class: 'chip' + (anim.v === i ? ' on' : ''), text: o, onclick: () => { E.cp(ck); anim.v = i; E.changed(); draw1(); } }))));
      draw1(); return row;
    }
    const sl = h('input', { class: 'sld', type: 'range', min: d.min, max: d.max, step: d.step || 1 });
    const num = h('input', { class: 'txt num', type: 'number', step: d.step || 1 });
    const dia = h('button', { class: 'kfb', html: I('diamond') });
    const setv = v => { E.cp(ck); const ins = ML.setAnim(anim, lt(), v, eps()); if (after) after(v); E.changed(ins); upd(); };
    sl.addEventListener('input', () => setv(+sl.value));
    num.addEventListener('input', () => { const v = parseFloat(num.value); if (isFinite(v)) setv(clamp(v, -1e5, 1e5)); });
    dia.addEventListener('click', () => {
      if (P.t < L.start - 1e-6 || P.t > L.start + L.dur + 1e-6) { ML.toast('Geser playhead ke dalam durasi layer untuk membuat keyframe'); return; }
      E.cp(); ML.toggleKey(anim, lt(), eps(), ML.evalAnim(anim, lt())); E.changed(true); upd();
    });
    function upd() {
      const v = ML.evalAnim(anim, lt());
      const rr = (d.step || 1) < 0.01 ? 1000 : 100; if (document.activeElement !== num) num.value = Math.round(v * rr) / rr;
      sl.value = v;
      dia.className = 'kfb' + (anim.k.length ? (ML.keyIndexAt(anim, lt(), eps()) >= 0 ? ' on' : ' has') : '');
    }
    ST.panel.upd.push(upd);
    row.append(lab, sl, num, dia); return row;
  }

  /** menu isi model .glb: animasi, varian, scene, bagian */
  function glbMenu(L, sub) {
    const g = L.glb, inf = ML.glbInfo(L); if (!inf) return []; const o = g.opt = g.opt || {}, out = [], hd = t => h('div', { class: 'psec', text: t });
    if (g.map) out.push(hd('Kamera map (keyframe + kurva)'), ...[['cx', 'Kamera X', -5, 5, 0.01, ''], ['cy', 'Kamera Y', -5, 5, 0.01, ''], ['cz', 'Kamera Z', -8, 8, 0.01, ''], ['yaw', 'Yaw (putar kiri/kanan)', -360, 360, 1, '°'], ['pitch', 'Pitch (lihat atas/bawah)', -89, 89, 1, '°'], ['fov', 'FOV', 10, 120, 1, '°']].map(([k, l, mn, mx, st, u]) => paramRow(L, L.p[k], { min: mn, max: mx, step: st, unit: u }, l, 'pm' + k + L.id)));
    const bn = inf.bones || { joints: [], all: [] }, pw = h('div'), bx = h('div'), gr = ML.boneGroups(bn.joints.length ? bn.joints : bn.all);
    pw.hidden = (o.pose || 0) !== 1; if (o.bsel == null && bn.all.length) o.bsel = (bn.joints[0] || bn.all[0]).i;
    const rowsFor = (i, full) => {
      const b = bn.all.find(x => x.i === i) || { name: '?', t: 0 }, R = Math.max(.5, +(b.t * 2).toPrecision(2)), D = [['x', 'Putar X (tekuk)', -180, 180, 1, '°'], ['y', 'Putar Y (puntir)', -180, 180, 1, '°'], ['z', 'Putar Z (miring)', -180, 180, 1, '°']];
      if (full) D.push(['px', 'Geser X', -R, R, R / 200, ''], ['py', 'Geser Y', -R, R, R / 200, ''], ['pz', 'Geser Z', -R, R, R / 200, ''], ['s', 'Skala', 1, 300, 1, '%']);
      return [h('div', { class: 'lbl', text: 'Dipilih: ' + b.name })].concat(D.map(([a, t, mn, mx, st, u]) => { const k = 'b' + i + a; if (!L.p[k]) L.p[k] = ML.A(a === 's' ? 100 : 0); return paramRow(L, L.p[k], { min: mn, max: mx, step: st, unit: u }, t, 'pb' + k + L.id); }));
    };
    const drawAll = () => {
      const kids = [];
      if ((o.bmode || 0) === 0) {
        if (!gr.length) kids.push(h('div', { class: 'warn', text: 'Rig tidak dikenali otomatis. Pakai mode Lengkap.' }));
        else {
          const gi = Math.min(o.bgrp || 0, gr.length - 1), G = gr[gi]; if (!G.segs.some(s => s.i === o.bsel)) o.bsel = G.segs[0].i;
          kids.push(h('div', { class: 'chips' }, gr.map((x, n) => h('button', { class: 'chip' + (n === gi ? ' on' : ''), text: x.label, onclick: () => { o.bgrp = n; drawAll(); } }))),
            h('div', { class: 'info', text: 'Pilih bagian. Bagian di bawahnya ikut bergerak (tersambung).' }),
            h('div', { class: 'chips sm' }, G.segs.map(s => h('button', { class: 'chip' + (s.i === o.bsel ? ' on' : ''), text: s.label, onclick: () => { o.bsel = s.i; drawAll(); } }))), ...rowsFor(o.bsel, false));
        }
      } else {
        const inp = h('input', { class: 'txt' }), lst = h('div', { class: 'chips sm' }), pr = h('div'); inp.placeholder = 'Cari objek / tulang…'; inp.value = o.bq || ''; lst.style.cssText = 'max-height:200px;overflow:auto';
        const drawR = () => pr.replaceChildren(...rowsFor(o.bsel, true)), drawL = () => { const q = (o.bq || '').toLowerCase(); lst.replaceChildren(...bn.all.filter(b => !q || b.name.toLowerCase().includes(q)).slice(0, 300).map(b => h('button', { class: 'chip' + (b.i === o.bsel ? ' on' : ''), text: b.name, onclick: () => { o.bsel = b.i; drawL(); drawR(); } }))); };
        inp.oninput = () => { o.bq = inp.value; drawL(); }; drawL(); drawR(); kids.push(inp, lst, pr);
      }
      bx.replaceChildren(...kids);
    };
    pw.append(hd('Gerakkan badan: pilih bagian, lalu keyframe + kurva'), toggleChips([[0, 'Simple (6 bagian)'], [1, 'Lengkap (semua objek)']], () => o.bmode || 0, v => { o.bmode = v; drawAll(); }), bx); drawAll();
    const applyPreset = id => {
      const r = id < 0 ? { v: {}, missing: [] } : ML.glbPreset(L, id);
      if (!r) { ML.toast('Preset butuh rig humanoid (tulang lengan, siku, tangan) bernama standar. Rig model ini tidak dikenali.', 4500); return; }
      E.cp(); o.pose = 1;
      for (const k in L.p) if (/^b\d+(x|y|z)$/.test(k)) { L.p[k].v = 0; L.p[k].k = []; }
      for (const i in r.v) ['x', 'y', 'z'].forEach((a, n) => { const k = 'b' + i + a; if (!L.p[k]) L.p[k] = ML.A(0); L.p[k].v = r.v[i][n]; L.p[k].k = []; });
      E.changed(true); rebuild();
      ML.toast(id < 0 ? 'Pose dikembalikan ke posisi awal' : 'Preset diterapkan' + (r.missing.length ? ' (tidak ditemukan: ' + r.missing.join(', ') + ')' : '') + '. Bisa disesuaikan lagi di bawah.', 3500);
    };
    out.push(hd('Mode pose'), toggleChips([[0, 'Lock pose (gerakan bawaan)'], [1, 'Manual pose (gerakkan sendiri)']], () => o.pose || 0, v => { o.pose = v; pw.hidden = v !== 1; }),
      hd('Preset pose'), h('div', { class: 'chips sm' }, [['Pose preset 1 (tahap uji coba)', 0], ['Pose preset 2 (tahap uji coba)', 1], ['Reset pose', -1]].map(([t, id]) => h('button', { class: 'chip', text: t, onclick: () => applyPreset(id) }))),
      h('div', { class: 'info', text: 'Preset otomatis menyesuaikan ke rig humanoid (Mixamo, VRM, Blender). Memilih preset memakai Manual pose; hasilnya bisa diubah per bagian.' }), pw, ...(sub ? [] : [hd('Kualitas render'), toggleChips([[0, 'Asli (experimental)'], [1, 'Ringan (experimental)']], () => o.q || 0, v => { o.q = v; }), hd('Ray tracing MotionLyn'), toggleChips([[0, 'Mati'], [1, 'RT MotionLyn']], () => o.rx || 0, v => { o.rx = v; })])); if (inf.anims.length) out.push(hd('Animasi bawaan'), toggleChips([[-2, 'Gabung semua'], [-1, 'Mati']].concat(inf.anims.map((n, i) => [i, n])), () => (o.anim === undefined ? -2 : o.anim), v => { o.anim = v; }),
      toggleChips([[0.5, '0.5x'], [1, '1x'], [2, '2x']], () => o.speed || 1, v => { o.speed = v; }), toggleChips([[1, 'Ulang'], [0, 'Sekali']], () => (o.loop === 0 ? 0 : 1), v => { o.loop = v; }));
    if (inf.morphs) out.push(h('p', { class: 'empty', text: 'Model punya ' + inf.morphs + ' morph target (bentuk mulut/wajah); digerakkan oleh animasi bawaan di atas.' }));
    if (inf.variants.length) out.push(hd('Varian material'), toggleChips([[-1, 'Asli']].concat(inf.variants.map((n, i) => [i, n])), () => (o.variant === undefined ? -1 : o.variant), v => { o.variant = v; }));
    if (inf.scenes > 1) out.push(hd('Scene'), toggleChips(Array.from({ length: inf.scenes }, (_, i) => [i, 'Scene ' + (i + 1)]), () => o.scene || 0, v => { o.scene = v; }));
    if (!sub) out.push(hd('Pencahayaan realistis'), toggleChips([[0, 'Mati'], [1, 'Hidup']], () => (o.rt ? 1 : 0), v => { o.rt = !!v; }),
      ...[['li', 'Intensitas cahaya', 0, 300, 1, '%'], ['le', 'Ketinggian cahaya', -10, 90, 1, '°'], ['lw', 'Suhu warna (dingin ← → hangat)', -100, 100, 1, ''], ['rim', 'Cahaya tepi (rim)', 0, 200, 1, '%'], ['spc', 'Kilap spekular', 0, 300, 1, '%'], ['ex', 'Eksposur (EV)', -3, 3, 0.05, '']].map(([k, l, mn, mx, st, u]) => paramRow(L, L.p[k], { min: mn, max: mx, step: st, unit: u }, l, 'pl' + k + L.id)));
    if (!sub) out.push(hd('Refleksi RL HD'), toggleChips([[0, 'Mati'], [1, 'Hidup']], () => (o.rl ? 1 : 0), v => { o.rl = !!v; }),
      toggleChips([[0, 'Siang'], [1, 'Senja'], [2, 'Malam'], [3, 'Studio']], () => o.env || 0, v => { o.env = v; }),
      toggleChips([[0, 'Normal'], [1, 'HD 2x']], () => (o.hd ? 1 : 0), v => { o.hd = !!v; }),
      ...[['rf', 'Refleksi permukaan', 0, 100, '%'], ['ff', 'Refleksi lantai', 0, 100, '%'], ['fy', 'Tinggi lantai', -100, 100, ''], ['fd', 'Pudar refleksi', 0, 10, '']].map(([k, l, mn, mx, u]) => paramRow(L, L.p[k], { min: mn, max: mx, step: 1, unit: u }, l, 'pr' + k + L.id)));
    out.push(hd('Bagian model (ketuk untuk tampil/sembunyi)'), h('div', { class: 'chips sm' }, inf.parts.map(p => h('button', { class: 'chip' + (o.hide && o.hide[p.i] ? '' : ' on'), text: p.name,
      onclick: e => { E.cp(); o.hide = o.hide || {}; o.hide[p.i] = !o.hide[p.i]; e.currentTarget.classList.toggle('on', !o.hide[p.i]); E.changed(); } }))));
    if (g.map && !sub) out.push(...compMenu(L));
    return out;
  }

  /** layer bayangan untuk model pendamping: parameter 'm_xxx' di L.p tampil sebagai 'xxx' sehingga menu model biasa bisa dipakai ulang */
  function compLayer(L) {
    const PL = Object.create(L); PL.id = L.id + 'm'; PL.glb = L.glb.mod;
    PL.p = new Proxy(L.p, {
      get: (t, k) => typeof k === 'string' ? t['m_' + k] : undefined, set: (t, k, v) => { t['m_' + k] = v; return true; }, has: (t, k) => typeof k === 'string' && ('m_' + k) in t,
      ownKeys: t => Object.keys(t).filter(k => k.startsWith('m_')).map(k => k.slice(2)),
      getOwnPropertyDescriptor: (t, k) => (typeof k === 'string' && ('m_' + k) in t) ? { value: t['m_' + k], writable: true, enumerable: true, configurable: true } : undefined
    });
    return PL;
  }
  /** menu Model + Map 3D (experimental): model berada di dalam adegan map (satu kamera, satu depth buffer) */
  function compMenu(L) {
    const g = L.glb, out = [], hd = t => h('div', { class: 'psec', text: t });
    const setMod = async () => {
      try {
        ML.toast('Pilih file MODEL (.glb / .gltf)', 2500); const r = await ML.pickFiles('', true); if (!r || !r.length) return;
        const f = r.find(x => /\.(glb|gltf|fbx|usdz)$/i.test(x.name)) || r[0], buf = await ML.modelToGlb(f, r); ML.glbParse(buf);
        E.cp(); g.mod = { name: f.name, b64: ML.glbB64(buf), opt: {} }; ML.ensureLayer(L); ML.glbFloor(L); E.changed(true); rebuild(); ML.toast('Model ditambahkan ke map', 2500);
      } catch (e) { ML.toast('Gagal membuka model: ' + e.message, 3500); }
    };
    out.push(hd('Model di dalam map (experimental)'));
    if (!g.mod) { out.push(h('button', { class: 'row-btn', text: 'Tambah model ke map ini', onclick: setMod }), h('div', { class: 'info', text: 'Model dan map dirender dalam satu adegan: satu kamera, kedalaman benar (model bisa terhalang bangunan), cahaya dan refleksi map ikut ke model.' })); return out; }
    out.push(h('div', { class: 'info', text: 'Model: ' + g.mod.name }),
      h('div', { class: 'chips sm' }, [h('button', { class: 'chip', text: 'Ganti model', onclick: setMod }), h('button', { class: 'chip', text: 'Taruh di lantai map', onclick: () => { E.cp(); ML.glbFloor(L); E.changed(); rebuild(); } }),
        h('button', { class: 'chip', text: 'Hapus model', onclick: () => { E.cp(); delete g.mod; for (const k of Object.keys(L.p)) if (k.startsWith('m_')) delete L.p[k]; E.changed(true); rebuild(); } })]),
      ...[['m_x', 'Posisi model X', -3, 3, .005, ''], ['m_y', 'Posisi model Y', -3, 3, .005, ''], ['m_z', 'Posisi model Z', -3, 3, .005, ''], ['m_rx', 'Rotasi model X', -360, 360, 1, '°'], ['m_ry', 'Rotasi model Y', -360, 360, 1, '°'], ['m_rz', 'Rotasi model Z', -360, 360, 1, '°'], ['m_ms', 'Skala model', 1, 400, .5, '%'], ['m_spin', 'Auto-putar model', -360, 360, 1, '°/dtk']].map(([k, l, mn, mx, st, u]) => paramRow(L, L.p[k], { min: mn, max: mx, step: st, unit: u }, l, 'pc' + k + L.id)),
      hd('Gerakan & pose model di dalam map'), ...glbMenu(compLayer(L), true));
    return out;
  }

  /* ================= keyframe grup + kurva ================= */
  function groupKeyState(L, group) {
    let n = 0; const t = ltOf(L);
    group.forEach(a => { if (ML.keyIndexAt(a, t, E.eps()) >= 0) n++; });
    return !n ? 0 : n === group.length ? 2 : 1;
  }
  function toggleGroupKey(L, group) {
    if (!group.length) { ML.toast('Tidak ada parameter yang bisa dianimasikan di panel ini'); return; }
    if (P.t < L.start - 1e-6 || P.t > L.start + L.dur + 1e-6) { ML.toast('Geser playhead ke dalam durasi layer untuk membuat keyframe'); return; }
    const t = ltOf(L), st = groupKeyState(L, group);
    E.cp();
    group.forEach(a => {
      const cur = ML.evalAnim(a, t), i = ML.keyIndexAt(a, t, E.eps());
      if (st === 2) { if (i >= 0) { a.k.splice(i, 1); if (!a.k.length) a.v = cur; } }
      else if (i < 0) ML.addKey(a, t, cur);
    });
    E.changed(true); refresh();
  }
  const PRE_CURVE = [['Linear', [0, 0, 1, 1]], ['Mudah masuk', [0.42, 0, 1, 1]], ['Mudah keluar', [0, 0, 0.58, 1]], ['Masuk-keluar', [0.42, 0, 0.58, 1]], ['Overshoot', [0.34, 1.56, 0.64, 1]], ['Cepat-lambat', [0.05, 0.85, 0.15, 1]]];

  function curveEditor(k, onEdit, onPreset, S = 170) {
    const pad = 20, dpr = window.devicePixelRatio || 1;
    const c = h('canvas', { class: 'bz', width: S * dpr, height: S * dpr, style: { width: S + 'px', height: S + 'px' } });
    const X = x => pad + x * (S - 2 * pad), Y = y => S - pad - (y + 0.5) / 2 * (S - 2 * pad);
    const cur = () => Array.isArray(k.e) ? k.e : [0, 0, 1, 1], named = () => typeof k.e === 'string' && k.e !== 'hold';
    function redraw() {
      const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, S, S);
      g.strokeStyle = '#33385a'; g.lineWidth = 1; g.strokeRect(X(0), Y(1), X(1) - X(0), Y(0) - Y(1));
      g.beginPath(); g.moveTo(X(0), Y(0)); g.lineTo(X(1), Y(1)); g.setLineDash([4, 4]); g.stroke(); g.setLineDash([]);
      const e = cur();
      g.strokeStyle = '#ff3fb0'; g.lineWidth = 3; g.beginPath();
      if (k.e === 'hold') { g.moveTo(X(0), Y(0)); g.lineTo(X(1), Y(0)); g.lineTo(X(1), Y(1)); }
      else if (named()) { const f = ML.easeNamed(k.e); for (let i = 0; i <= 80; i++) { const u = i / 80; g[i ? 'lineTo' : 'moveTo'](X(u), Y(f(u))); } }
      else { const f = ML.cubic(e[0], e[1], e[2], e[3]); for (let i = 0; i <= 60; i++) { const u = i / 60; g[i ? 'lineTo' : 'moveTo'](X(u), Y(f(u))); } }
      g.stroke();
      if (k.e !== 'hold' && !named()) {
        g.strokeStyle = '#b896bf'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(X(0), Y(0)); g.lineTo(X(e[0]), Y(e[1])); g.moveTo(X(1), Y(1)); g.lineTo(X(e[2]), Y(e[3])); g.stroke();
        g.fillStyle = '#fff'; [[e[0], e[1]], [e[2], e[3]]].forEach(([x, y]) => { g.beginPath(); g.arc(X(x), Y(y), 8, 0, 7); g.fill(); });
      }
    }
    let hd = -1;
    c.addEventListener('pointerdown', ev => {
      if (k.e === 'hold' || named()) return; c.setPointerCapture(ev.pointerId);
      const r = c.getBoundingClientRect(), px = ev.clientX - r.left, py = ev.clientY - r.top, e = cur();
      const d0 = Math.hypot(px - X(e[0]), py - Y(e[1])), d1 = Math.hypot(px - X(e[2]), py - Y(e[3]));
      hd = Math.min(d0, d1) < 30 ? (d0 <= d1 ? 0 : 1) : -1;
    });
    c.addEventListener('pointermove', ev => {
      if (hd < 0) return; const r = c.getBoundingClientRect();
      const x = clamp((ev.clientX - r.left - pad) / (S - 2 * pad), 0, 1), y = clamp(((S - pad - (ev.clientY - r.top)) / (S - 2 * pad)) * 2 - 0.5, -0.5, 1.5);
      const e = cur().slice(); e[hd * 2] = Math.round(x * 100) / 100; e[hd * 2 + 1] = Math.round(y * 100) / 100; k.e = e; onEdit(); redraw(); onPreset();
    });
    c.addEventListener('pointerup', () => { hd = -1; });
    redraw(); return { el: c, redraw };
  }

  /** editor kurva untuk semua parameter di grup panel (segmen yang dimulai di keyframe pada/ sebelum playhead) */
  function curveView(L, main, group) {
    const t0 = ltOf(L), eps = E.eps();
    const segs = group.map(a => { let i = -1; a.k.forEach((k, j) => { if (k.t <= t0 + eps) i = j; }); return (i >= 0 && i < a.k.length - 1) ? { a, i } : null; }).filter(Boolean);
    const back = h('button', { class: 'btn soft', text: 'Kembali', onclick: () => { ST.panel.curve = false; rebuild(); } });
    if (!segs.length) {
      main.append(h('p', { class: 'empty', text: 'Belum ada segmen keyframe di posisi playhead. Tambahkan keyframe (◆) di dua waktu berbeda, lalu letakkan playhead pada atau setelah keyframe pertama.' }), h('div', { class: 'btn-row left' }, back));
      return;
    }
    const ref = segs[0].a.k[segs[0].i], next = segs[0].a.k[segs[0].i + 1];
    const kp = { get e() { return ref.e; }, set e(v) { segs.forEach(s => { s.a.k[s.i].e = Array.isArray(v) ? v.slice() : v; }); } };
    const pre = h('div', { class: 'kfpre' });
    const curve = curveEditor(kp, () => { E.cp('curve'); E.changed(); }, () => drawPre());
    /* presisi kurva: geser titik kontrol per 0,01 (tombol − / +, slider, atau ketik angka) */
    const prec = h('div', { class: 'kfprec', style: 'margin-top:8px' });
    const PL = ['Titik 1 · X', 'Titik 1 · Y', 'Titik 2 · X', 'Titik 2 · Y'], pin = [];
    const isBz = () => ref.e == null || Array.isArray(ref.e), curE = () => (Array.isArray(ref.e) ? ref.e : [0, 0, 1, 1]).slice();
    const setC = (i, v) => { if (!isBz() || !isFinite(v)) return; const c = curE(); c[i] = Math.round(clamp(v, i % 2 ? -0.5 : 0, i % 2 ? 1.5 : 1) * 100) / 100; E.cp('crvp' + i); kp.e = c; curve.redraw(); E.changed(); drawPre(); };
    PL.forEach((lb, i) => {
      const mn = i % 2 ? -0.5 : 0, mx = i % 2 ? 1.5 : 1, sb = h('button', { class: 'btn soft', style: 'width:34px;min-width:34px;margin:0;padding:0', text: '−', onclick: () => setC(i, curE()[i] - 0.01) }), pb = h('button', { class: 'btn soft', style: 'width:34px;min-width:34px;margin:0;padding:0', text: '+', onclick: () => setC(i, curE()[i] + 0.01) });
      const sl = h('input', { class: 'sld', type: 'range', min: mn, max: mx, step: 0.01, style: 'flex:1;min-width:0' }), nu = h('input', { class: 'txt num', type: 'number', step: 0.01, style: 'width:62px' });
      sl.addEventListener('input', () => setC(i, +sl.value)); nu.addEventListener('input', () => setC(i, parseFloat(nu.value)));
      pin.push({ sl, nu, sb, pb }); prec.append(h('div', { class: 'prow', style: 'gap:6px;align-items:center' }, h('span', { class: 'plab', style: 'min-width:74px;font-size:12px', text: lb }), sb, sl, pb, nu));
    });
    const precNote = h('p', { class: 'dlg-text', style: 'margin:4px 0 0;font-size:12px;opacity:.7', text: 'Pilih preset bezier (mis. Linear) untuk menggeser kurva.' }); prec.append(precNote);
    function syncPrec() {
      const ok = isBz(), e = curE(); precNote.hidden = ok;
      pin.forEach((o, i) => { o.sl.value = e[i]; if (document.activeElement !== o.nu) o.nu.value = e[i].toFixed(2); [o.sl, o.nu, o.sb, o.pb].forEach(x => { x.disabled = !ok; }); });
    }
    function drawPre() {
      pre.replaceChildren(...PRE_CURVE.map(([n, e]) => h('button', { class: 'chip' + (Array.isArray(ref.e) ? (ref.e.every((v, j) => Math.abs(v - e[j]) < 1e-3) ? ' on' : '') : (!ref.e && n === 'Linear' ? ' on' : '')), text: n, onclick: () => { E.cp(); kp.e = n === 'Linear' ? null : e.slice(); curve.redraw(); E.changed(); drawPre(); } })),
        h('button', { class: 'chip' + (ref.e === 'hold' ? ' on' : ''), text: 'Tahan', onclick: () => { E.cp(); kp.e = 'hold'; curve.redraw(); E.changed(); drawPre(); } }),
        ...(ML.editVer() === 'am' ? Object.keys(ML.EASE).map(n => h('button', { class: 'chip' + (ref.e === n ? ' on' : ''), text: n, onclick: () => { E.cp(); kp.e = n; curve.redraw(); E.changed(); drawPre(); } })) : []));
      syncPrec();
    }
    drawPre();
    main.append(h('div', { class: 'kfedit' }, curve.el, h('div', { class: 'kfside' },
      h('div', { class: 'psec', text: 'Kurva ' + ML.fmt(L.start + ref.t, proj.fps) + ' → ' + ML.fmt(L.start + next.t, proj.fps) + (segs.length > 1 ? ' (' + segs.length + ' parameter)' : '') }), pre, prec, back)));
  }

  /* ================= kerangka panel (rail + isi) ================= */
  function frame(L, groupFn, buildMain, right) {
    const pf = E.pframe, group = () => (groupFn ? groupFn() : []).filter(Boolean);
    const rbtn = (ic, title, fn) => h('button', { class: 'rbtn', title, 'aria-label': title, html: I(ic), onclick: fn });
    const dia = rbtn('diamondPlus', 'Keyframe', () => toggleGroupKey(L, group()));
    const crv = rbtn('curveBox', 'Kurva animasi', () => {
      if (!group().length) { ML.toast('Tidak ada parameter yang bisa dianimasikan di panel ini'); return; }
      ST.panel.curve = !ST.panel.curve; rebuild();
    });
    const more = rbtn('more', 'Lainnya', () => panelMenu(L, group()));
    const rail = h('div', { class: 'rail' }, rbtn('back', 'Kembali', closePanel), dia, crv, more);
    const main = h('div', { class: 'pmain' });
    pf.append(rail, main);
    ST.panel.upd.push(() => {
      const s = groupKeyState(L, group()), none = !group().length;
      dia.classList.toggle('on', s === 2); dia.classList.toggle('half', s === 1); dia.classList.toggle('dis', none);
      crv.classList.toggle('dis', none); crv.classList.toggle('on', !!ST.panel.curve);
    });
    if (ST.panel.curve && group().length) curveView(L, main, group());
    else { buildMain(main); if (right) pf.append(right); }
  }
  function panelMenu(L, group) {
    popMenu([
      ['Hapus keyframe di posisi playhead', () => { const t = ltOf(L); E.cp(); group.forEach(a => { const i = ML.keyIndexAt(a, t, E.eps()); if (i >= 0) { const cur = a.k[i].v; a.k.splice(i, 1); if (!a.k.length) a.v = cur; } }); E.changed(true); rebuild(); }],
      ['Hapus semua keyframe di panel ini', () => { E.cp(); group.forEach(a => { if (a.k.length) { a.v = ML.evalAnim(a, ltOf(L)); a.k = []; } }); E.changed(true); rebuild(); }]
    ]);
  }

  /* ================= panel-panel ================= */
  const BUILD = {
    xform(L) {
      const m = ST.panel.mode;
      const spec = { move: [['x', 'X'], ['y', 'Y']], rot: [['rot', 'Derajat']], scale: [['sx', 'Lebar %'], ['sy', 'Tinggi %']], skew: [['skx', 'Miring X°'], ['sky', 'Miring Y°']], anchor: [['ax', 'Jangkar X'], ['ay', 'Jangkar Y']], z: [['z', 'Z']] }[m];
      const modes = [['move', 'move', 'Geser'], ['rot', 'rotate', 'Putar'], ['scale', 'scale', 'Skala'], ['skew', 'skew', 'Miring']].concat(ML.editVer() === 'am' ? [['anchor', 'plus', 'Titik jangkar']] : [], [['z', 'layers', '3D / Z']]);
      const right = h('div', { class: 'mrail' }, modes.map(([k, ic, t]) => h('button', { class: 'mbtn' + (m === k ? ' on' : ''), title: t, 'aria-label': t, html: I(ic), onclick: () => { ST.panel.mode = k; ST.panel.curve = false; rebuild(); } })));
      frame(L, () => spec.map(([k]) => L.p[k]).concat(m === 'z' && L.glb ? ['rx', 'ry', 'rz', 'ms', 'spin', 'la', 'amb', 'rf', 'ff', 'fy', 'fd', 'li', 'le', 'lw', 'rim', 'spc', 'ex'].concat(L.glb.map ? ['cx', 'cy', 'cz', 'yaw', 'pitch', 'fov'] : []).concat(L.glb.mod ? ['m_x', 'm_y', 'm_z', 'm_rx', 'm_ry', 'm_rz', 'm_ms', 'm_spin'] : []).concat(Object.keys(L.p).filter(k => /^(m_)?b\d+(x|y|z|px|py|pz|s)$/.test(k))).map(k => L.p[k]) : []), main => {
        const boxes = h('div', { class: 'nboxes' });
        spec.forEach(([k, lab]) => {
          const inp = h('input', { class: 'nin', type: 'number', step: 0.5 });
          inp.addEventListener('input', () => { const v = parseFloat(inp.value); if (!isFinite(v)) return; E.cp('nb' + k + L.id); const ins = ML.setAnim(L.p[k], ltOf(L), v, E.eps()); E.changed(ins); });
          ST.panel.upd.push(() => { if (document.activeElement !== inp) inp.value = Math.round(ML.evalAnim(L.p[k], ltOf(L)) * 100) / 100; });
          boxes.append(h('label', { class: 'nbox' }, inp, h('span', { text: lab })));
        });
        if (m === 'z') {
          const lays = proj.layers.filter(x => x.id !== L.id);
          main.append(boxes, h('div', { class: 'psec', text: 'Mode 3D (Z memakai kamera perspektif)' }),
            toggleChips([[0, '3D mati'], [1, '3D hidup']], () => (L.d3 ? 1 : 0), v => { L.d3 = !!v; }),
            h('p', { class: 'dlg-text', style: 'margin:2px 0 6px;font-size:12px;opacity:.75', text: 'Putar 3D X/Y memutar layer secara 3D sungguhan (perspektif, sisi dekat membesar, sisi jauh mengecil). Posisi Z memindahkan jarak ke kamera; Skala tetap terpisah.' }),
            paramRow(L, L.p.z, { min: -2000, max: 2000, step: 1 }, 'Posisi Z', 'pz' + L.id),
            paramRow(L, L.p.rx3, { min: -360, max: 360, step: 1, unit: '°' }, 'Putar 3D sumbu X (jungkit)', 'prx3' + L.id),
            paramRow(L, L.p.ry3, { min: -360, max: 360, step: 1, unit: '°' }, 'Putar 3D sumbu Y (engsel)', 'pry3' + L.id),
            L.k3 === 'camera' ? paramRow(L, L.p.zoom, { min: 10, max: 400, step: 1, unit: '%' }, 'Zoom kamera', 'pzm' + L.id) : null,
            h('div', { class: 'psec', text: 'Sambung ke Null / layer lain (ikut gerakannya)' }),
            toggleChips([['', 'Tidak ada']].concat(lays.map(x => [x.id, x.name])), () => L.parent || '', v => { L.parent = v || null; }),
            ...(L.ph3 ? [h('div', { class: 'psec', text: 'Foto 3D (experimental): mode kedalaman' }), toggleChips([[0, 'Datar'], [1, 'Terang = dekat'], [2, 'Gelap = dekat']], () => L.ph3.mode | 0, v => { L.ph3.mode = v; }), h('div', { class: 'psec', text: 'Posisi & putar foto' })].concat(ML.PH3A.map(([k, lab, mn, mx, u, st]) => paramRow(L, L.p[k], { min: mn, max: mx, step: st, unit: u }, lab, 'p3' + k + L.id)), [h('div', { class: 'psec', text: 'Kamera 3D' })], ML.PH3C.map(([k, lab, mn, mx, u, st]) => paramRow(L, L.p[k], { min: mn, max: mx, step: st, unit: u }, lab, 'p3' + k + L.id))) : []), ...(L.glb ? [h('div', { class: 'psec', text: 'Model 3D (beta)' })].concat([['rx', 'Rotasi X', -360, 360, '°'], ['ry', 'Rotasi Y', -360, 360, '°'], ['rz', 'Rotasi Z', -360, 360, '°'], ['ms', 'Skala model', 5, 300, '%'], ['spin', 'Auto-putar Y', -360, 360, '°/dtk'], ['la', 'Sudut cahaya', -180, 180, '°'], ['amb', 'Cahaya sekitar', 0, 100, '%']].map(([k, lab, mn, mx, u]) => paramRow(L, L.p[k], { min: mn, max: mx, step: 1, unit: u }, lab, 'pg' + k + L.id))) : []), ...(L.glb ? glbMenu(L) : []));
        } else main.append(boxes, pad(L, m, spec), ...(ML.editVer() === 'am' && m === 'scale' ? [h('div', { class: 'prow' }, h('span', { class: 'plab', text: 'Balik' }), h('div', { class: 'grp' }, ...[['sx', 'Horizontal'], ['sy', 'Vertikal']].map(([k, n]) => h('button', { class: 'btn soft', style: 'width:auto;margin:0 6px 0 0;padding:0 12px', text: n, onclick: () => { E.cp(); const a = L.p[k]; a.v = -a.v; a.k.forEach(q => { q.v = -q.v; }); E.changed(true); rebuild(); } }))))] : []));
      }, right);
    },
    blend(L) {
      frame(L, () => [L.p.op], main => main.append(
        paramRow(L, L.p.op, { min: 0, max: 100, step: 1, unit: '%' }, 'Opasitas', 'po' + L.id),
        sec('Campuran (blend)'), toggleChips(ML.BLENDS.map(b => [b[0], b[1]]), () => L.blend, v => { L.blend = v; })));
    },
    color(L) {
      frame(L, null, main => {
        if (L.type === 'shape') {
          const s = L.shape;
          main.append(sec('Warna isi'), inlineColor(() => s.fill, c => { s.fill = c; s.noFill = false; }),
            toggleChips([[false, 'Berisi'], [true, 'Tanpa isi (outline)']], () => !!s.noFill, v => { s.noFill = v; if (v && s.strokeW < 4) s.strokeW = 6; if (v) s.strokeColor = s.strokeColor || s.fill; }));
          // isi bentuk dengan foto: bentuk tetap, fotonya dipotong mengikuti bentuk
          const fm = s.fillMedia, fit = fm && ML.media.items.get(fm.mediaId);
          const setFm = it2 => { if (it2.kind !== 'image') { ML.toast('Pilih foto (bukan video/audio)'); return; } E.cp(); s.fillMedia = { mediaId: it2.id, mode: (s.fillMedia && s.fillMedia.mode) || 'fill' }; s.noFill = false; E.changed(true); if (ST.panel) rebuild(); ML.toast('Bentuk diisi foto'); };
          const fromDevice = async () => { if (!E.guard(L)) return; const fs = await ML.pickFiles('image/*', false); if (!fs[0]) return; try { setFm(await ML.media.importFile(proj, fs[0])); } catch (e) { ML.toast(e.message, 3500); } };
          const fromProject = () => { const its = [...ML.media.items.values()].filter(q => q.kind === 'image'); ML.sheet('Foto di proyek ini', (body, close) => { if (!its.length) { body.append(h('p', { class: 'empty', text: 'Belum ada foto di proyek ini. Pilih dari perangkat.' })); return; } const grid = h('div', { class: 'mgrid' }); its.forEach(q => { const th = h('div', { class: 'mth' }); th.style.backgroundImage = 'url(' + q.url + ')'; grid.append(h('button', { class: 'mitem', onclick: () => { close(); setFm(q); } }, th, h('span', { text: q.name }))); }); body.append(grid); }); };
          main.append(sec('Isi dengan foto'), h('div', { class: 'minfo' }, h('b', { text: fm ? (fit ? fit.name : '(foto hilang)') : 'Belum ada foto: bentuk berisi warna' }), h('small', { text: 'Bentuk tidak berubah, foto dipotong mengikuti bentuk' })),
            h('div', { class: 'btn-row left' }, h('button', { class: 'btn soft', html: I('import') + '<span>Dari perangkat</span>', onclick: fromDevice }), h('button', { class: 'btn soft', html: I('film') + '<span>Dari media proyek</span>', onclick: fromProject })),
            fm ? toggleChips([['fill', 'Isi (potong)'], ['fit', 'Pas'], ['stretch', 'Regangkan']], () => s.fillMedia.mode || 'fill', v => { s.fillMedia.mode = v; }) : null,
            fm ? h('button', { class: 'btn soft', text: 'Hapus foto (kembali ke warna)', onclick: () => { E.cp(); delete s.fillMedia; E.changed(true); if (ST.panel) rebuild(); } }) : null);
        } else if (L.type === 'text') {
          const t = L.text;
          main.append(sec('Warna teks'), inlineColor(() => t.color, c => { t.color = c; t.noFill = false; }),
            toggleChips([[false, 'Berisi'], [true, 'Tanpa isi (outline)']], () => !!t.noFill, v => { t.noFill = v; if (v && t.strokeW < 3) t.strokeW = 4; }));
        }
      });
    },
    border(L) {
      frame(L, null, main => {
        const sd = L.shadow;
        if (L.type === 'shape' || L.type === 'text') {
          const o = L.type === 'shape' ? L.shape : L.text;
          main.append(sec('Border'), plain('Tebal', () => o.strokeW, v => { o.strokeW = clamp(v, 0, 80); }, 0, 40),
            h('div', { class: 'prow' }, h('span', { class: 'plab', text: 'Warna' }), inlineColor(() => o.strokeColor, c => { o.strokeColor = c; })));
        }
        main.append(sec('Bayangan'), toggleChips([[false, 'Mati'], [true, 'Hidup']], () => !!sd.on, v => { sd.on = v; }),
          h('div', { class: 'prow' }, h('span', { class: 'plab', text: 'Warna' }), inlineColor(() => sd.c, c => { sd.c = c; })),
          plain('Opasitas', () => sd.a, v => { sd.a = clamp(v, 0, 100); sd.on = true; }, 0, 100),
          plain('Buram', () => sd.b, v => { sd.b = clamp(v, 0, 200); sd.on = true; }, 0, 80),
          plain('Geser X', () => sd.x, v => { sd.x = v; sd.on = true; }, -100, 100),
          plain('Geser Y', () => sd.y, v => { sd.y = v; sd.on = true; }, -100, 100));
      });
    },
    edit(L) {
      frame(L, null, main => {
        if (L.type === 'text') {
          const t = L.text, ta = h('textarea', { class: 'txt', rows: 2, oninput: () => { E.cp('txt'); t.text = ta.value; L.name = (ta.value.split('\n')[0] || 'Teks').slice(0, 24); E.changed(); } });
          ta.value = t.text;
          main.append(ta, h('div', { class: 'prow' }, h('span', { class: 'plab', text: 'Font' }), toggleChips([['sans-serif', 'Sans'], ['serif', 'Serif'], ['monospace', 'Mono'], ['cursive', 'Tulis'], ['fantasy', 'Dekor']], () => t.font, v => { t.font = v; })),
            plain('Ukuran', () => t.size, v => { t.size = clamp(v, 8, 800); }, 8, 600),
            h('div', { class: 'prow' }, h('span', { class: 'plab', text: 'Gaya' }), h('div', { class: 'grp' }, toggleChips([[1, 'Tebal'], [0, 'Normal']], () => t.bold ? 1 : 0, v => { t.bold = !!v; }), toggleChips([[1, 'Miring'], [0, 'Tegak']], () => t.italic ? 1 : 0, v => { t.italic = !!v; }))),
            h('div', { class: 'prow' }, h('span', { class: 'plab', text: 'Rata' }), toggleChips([['left', 'Kiri'], ['center', 'Tengah'], ['right', 'Kanan']], () => t.align, v => { t.align = v; })));
        } else if (L.type === 'shape') {
          const s = L.shape;
          main.append(h('div', { class: 'prow' }, h('span', { class: 'plab', text: 'Jenis' }), toggleChips([['rect', 'Persegi'], ['ellipse', 'Lingkaran'], ['triangle', 'Segitiga'], ['star', 'Bintang']], () => s.kind, v => { s.kind = v; })),
            plain('Lebar', () => L.bw, v => { L.bw = Math.max(1, v); }, 1, proj.w * 2), plain('Tinggi', () => L.bh, v => { L.bh = Math.max(1, v); }, 1, proj.h * 2),
            plain('Sudut bulat', () => s.radius, v => { s.radius = Math.max(0, v); }, 0, Math.round(Math.min(L.bw, L.bh) / 2)), ...(ML.amShapeRows(L, plain, h, rebuild) || []));
        }
      });
    },
    media(L) { frame(L, null, main => mediaControls(L, main)); },
    volume(L) {
      frame(L, null, main => main.append(plain('Volume (%)', () => L.volume, v => { L.volume = clamp(v, 0, 200); ML.audio.setVolume(ML.media.el(L), L); }, 0, 200),
        h('div', { class: 'prow' }, h('span', { class: 'plab', text: 'Suara' }), toggleChips([[false, 'Hidup'], [true, 'Bisu']], () => !!L.muted, v => { L.muted = v; ML.audio.setVolume(ML.media.el(L), L); E.renderBar(); }))));
    },
    presets(L) {
      frame(L, null, main => main.append(h('div', { class: 'pregrid' }, PRESETS.map(([name, ic, fn]) =>
        h('button', { class: 'pre', html: I(ic) + '<span>' + name + '</span>', onclick: () => { E.cp(); fn(L, Math.min(0.6, L.dur / 2)); E.changed(true); P.seek(L.start); ML.toast('Preset “' + name + '” diterapkan'); } })))));
    },
    fx(L) {
      frame(L, () => { const e = L.fx.find(x => x.id === ST.panel.fxSel); return e ? Object.values(e.p) : []; }, main => {
        if (!E.rend.fx.ok) main.append(h('p', { class: 'warn', text: 'WebGL tidak tersedia, efek dinonaktifkan di perangkat ini.' }));
        main.append(h('button', { class: 'addfx', html: I('plus') + '<span>Tambahkan Efek</span>', onclick: () => effectBrowser(L) }),
          h('div', { class: 'fxact' },
            h('button', { class: 'btn', html: I('copyAll') + '<span>Salin semua efek</span>', onclick: () => fxCopy(L) }),
            h('button', { class: 'btn', html: I('paste') + '<span>Tempel efek' + (ML.fxClip ? ' (' + ML.fxClip.fx.length + ')' : '') + '</span>', onclick: () => fxPaste(L) })));
        L.fx.forEach((e, i) => {
          const d = ML.FXDEF[e.type], open = ST.panel.fxSel === e.id;
          const head = h('div', { class: 'fx-head' },
            h('button', { class: 'fx-title', html: I(d.icon) + '<span></span>', onclick: () => { ST.panel.fxSel = open ? null : e.id; ST.panel.curve = false; rebuild(); } }),
            h('button', { class: 'icon-btn sm' + (e.on ? ' act' : ''), html: I(e.on ? 'eye' : 'eyeoff'), onclick: () => { E.cp(); e.on = !e.on; E.changed(); rebuild(); } }),
            h('button', { class: 'icon-btn sm', html: I('up'), onclick: () => { if (i > 0) { E.cp(); L.fx.splice(i, 1); L.fx.splice(i - 1, 0, e); E.changed(); rebuild(); } } }),
            h('button', { class: 'icon-btn sm', html: I('down'), onclick: () => { if (i < L.fx.length - 1) { E.cp(); L.fx.splice(i, 1); L.fx.splice(i + 1, 0, e); E.changed(); rebuild(); } } }),
            h('button', { class: 'icon-btn sm', html: I('trash'), onclick: () => { E.cp(); L.fx.splice(i, 1); if (ST.panel.fxSel === e.id) ST.panel.fxSel = null; E.changed(true); rebuild(); } }));
          head.querySelector('.fx-title span').textContent = (i + 1) + '. ' + d.name;
          const card = h('div', { class: 'fx-card' + (e.on ? '' : ' off') + (open ? ' open' : '') }, head);
          if (open) { card.append(h('div', { class: 'chips sm' }, h('button', { class: 'chip', html: '⧉ Salin efek ini', onclick: () => fxCopy(L, e) }))); d.params.forEach(pd => card.append(paramRow(L, e.p[pd.k], pd, pd.l, 'fx' + e.id + pd.k))); }
          main.append(card);
        });
        if (!L.fx.length) main.append(h('p', { class: 'empty', text: 'Belum ada efek. Ketuk “Tambahkan Efek” untuk membuka Browser Efek.' }));
      });
    }
  };

  /** area geser (touchpad) untuk memindahkan / memutar / menskala / memiringkan layer */
  function pad(L, m, spec) {
    const txt = { move: 'Geser ke sini untuk memindahkan layer', rot: 'Geser kiri/kanan untuk memutar layer', scale: 'Geser kiri/kanan untuk mengubah skala', skew: 'Geser untuk memiringkan layer', anchor: 'Geser untuk memindahkan titik jangkar (pivot putar & skala)' }[m];
    const el = h('div', { class: 'pad' }, h('span', { text: txt }));
    let st = null;
    el.addEventListener('pointerdown', e => { el.setPointerCapture(e.pointerId); st = { x: e.clientX, y: e.clientY, b: spec.map(([k]) => ML.evalAnim(L.p[k], ltOf(L))) }; });
    el.addEventListener('pointermove', e => {
      if (!st) return; const dx = e.clientX - st.x, dy = e.clientY - st.y; let vals;
      const kx = proj.w / (E.box.clientWidth || 1);
      if (m === 'move') vals = [st.b[0] + dx * kx, st.b[1] + dy * kx];
      else if (m === 'rot') vals = [st.b[0] + dx * 0.5];
      else if (m === 'scale') { const f = Math.exp(dx * 0.006); vals = ST.link ? [st.b[0] * f, st.b[1] * f] : [st.b[0] * f, st.b[1] * Math.exp(-dy * 0.006)]; }
      else if (m === 'anchor') vals = [st.b[0] + dx * kx, st.b[1] + dy * kx];
      else vals = [st.b[0] + dx * 0.25, st.b[1] + dy * 0.25];
      E.cp('pad' + m + L.id); let ins = false;
      spec.forEach(([k], i) => { if (ML.setAnim(L.p[k], ltOf(L), vals[i], E.eps())) ins = true; });
      E.changed(ins); refresh();
    });
    const end = () => { st = null; };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
    return el;
  }

  /* ================= ganti media + sesuaikan/isi/regangkan ================= */
  function fitNow(L, mode) {
    if (!E.guard(L)) return;
    const it = ML.media.items.get(L.mediaId);
    E.cp(); ML.fitLayer(proj, L, mode, it && it.w, it && it.h); ST.fitMode = mode;
    E.changed(true); if (ST.panel) rebuild();
    ML.toast({ fit: 'Disesuaikan dengan area komposisi', fill: 'Mengisi area komposisi', stretch: 'Diregangkan ke area komposisi' }[mode]);
  }
  function fitTiles(L, after) {
    const defs = [['fit', 'fitIcon', 'Sesuaikan'], ['fill', 'fillIcon', 'Isi'], ['stretch', 'stretchIcon', 'Regangkan']];
    return h('div', { class: 'fitgrid' }, defs.map(([m, ic, t]) => h('button', { class: 'fitbtn' + (L.fit === m ? ' on' : ''), html: I(ic) + '<span>' + t + '</span>', onclick: () => { fitNow(L, m); if (after) after(); } })));
  }
  function applyMedia(L, it) {
    const wasTimed = L.type === 'video' || L.type === 'audio';
    if (L.type === 'audio' ? it.kind !== 'audio' : it.kind === 'audio') { ML.toast(L.type === 'audio' ? 'Pilih file audio' : 'Pilih foto atau video'); return false; }
    const old = ML.media.items.get(L.mediaId), stem = n => (n || '').replace(/\.[^.]+$/, '');
    E.cp(); ML.media.dropEl(L.id);
    if (!old || L.name === stem(old.name)) L.name = stem(it.name);
    L.mediaId = it.id; L.type = it.kind; L.trimIn = 0; L.srcDur = it.dur || 0;
    if (it.kind !== 'image') L.dur = wasTimed ? Math.max(0.1, Math.min(L.dur, it.dur)) : Math.max(0.1, it.dur);
    if (L.type !== 'audio') ML.fitLayer(proj, L, ST.fitMode || 'fit', it.w, it.h, true);
    P.syncMedia(false); E.changed(true); E.renderBar(); if (ST.panel) rebuild();
    ML.toast('Media diganti'); return true;
  }
  async function replaceFromDevice(L, done) {
    if (!E.guard(L)) return;
    const files = await ML.pickFiles(L.type === 'audio' ? '' : 'image/*,video/*', false);
    if (!files[0]) return;
    ML.toast('Mengimpor ' + files[0].name, 1500);
    try { const it = await ML.media.importFile(proj, files[0], L.type === 'audio' ? 'audio' : undefined); if (applyMedia(L, it) && done) done(); }
    catch (e) { ML.toast(e.message, 3500); }
  }
  function replaceFromProject(L, done) {
    const want = L.type === 'audio' ? ['audio'] : ['image', 'video'];
    const items = [...ML.media.items.values()].filter(it => want.includes(it.kind) && it.id !== L.mediaId);
    ML.sheet('Media di proyek ini', (body, close) => {
      if (!items.length) { body.append(h('p', { class: 'empty', text: 'Belum ada media lain di proyek ini. Pilih dari perangkat.' })); return; }
      const grid = h('div', { class: 'mgrid' });
      items.forEach(it => {
        const th = h('div', { class: 'mth' });
        if (it.kind === 'image') th.style.backgroundImage = 'url(' + it.url + ')';
        else if (it.kind === 'video') ML.media.thumb(it).then(u => { if (u) th.style.backgroundImage = 'url(' + u + ')'; });
        else th.innerHTML = I('audio');
        grid.append(h('button', { class: 'mitem', onclick: () => { close(); if (applyMedia(L, it) && done) done(); } }, th, h('span', { text: it.name })));
      });
      body.append(grid);
    });
  }
  function mediaControls(L, host, done) {
    const it = ML.media.items.get(L.mediaId);
    host.append(
      h('div', { class: 'minfo' }, h('b', { text: it ? it.name : '(media tidak ditemukan)' }), h('small', { text: it ? [it.kind, it.w ? it.w + '×' + it.h : null, it.dur ? ML.fmt(it.dur, proj.fps) : null, ML.fmtSize(it.size || 0)].filter(Boolean).join(' • ') : '' })),
      h('div', { class: 'btn-row left' },
        h('button', { class: 'btn soft', html: I('import') + '<span>Dari perangkat</span>', onclick: () => replaceFromDevice(L, done) }),
        h('button', { class: 'btn soft', html: I('film') + '<span>Dari media proyek</span>', onclick: () => replaceFromProject(L, done) })));
    if (L.type !== 'audio') host.append(sec('Sesuaikan ke area komposisi'), fitTiles(L, done));
  }
  function replaceSheet(L) {
    if (!isMedia(L) || !E.guard(L)) return;
    ML.sheet('Ganti media', (body, close) => mediaControls(L, body, close));
  }
  function mediaInfo(L) {
    const it = ML.media.items.get(L.mediaId); if (!it) { ML.toast('Layer ini tidak memakai media'); return; }
    const row = (a, b) => h('div', { class: 'irow' }, h('span', { text: a }), h('b', { text: b }));
    ML.sheet('Info Media', body => body.append(row('Nama', it.name), row('Jenis', it.kind + (it.mime ? ' (' + it.mime + ')' : '')), row('Ukuran file', ML.fmtSize(it.size || 0)),
      it.w ? row('Resolusi', it.w + ' × ' + it.h) : null, it.dur ? row('Durasi', ML.fmt(it.dur, proj.fps) + ' (' + it.dur.toFixed(2) + ' dtk)') : null,
      L.fit ? row('Penyesuaian', { fit: 'Sesuaikan', fill: 'Isi', stretch: 'Regangkan' }[L.fit]) : null));
  }

  /* ================= preset animasi ================= */
  const keyset = (a, arr) => { a.k = arr.map(([t, v, e]) => ({ t, v, e: e || null })); };
  const base = a => a.k.length ? a.k[a.k.length - 1].v : a.v;
  const OUT = [0.16, 0.84, 0.3, 1], OVER = [0.34, 1.56, 0.64, 1], IO = [0.42, 0, 0.58, 1];
  const PRESETS = [
    ['Fade masuk', 'eye', (L, d) => keyset(L.p.op, [[0, 0, OUT], [d, base(L.p.op)]])],
    ['Fade keluar', 'eyeoff', (L, d) => { const b = base(L.p.op); keyset(L.p.op, [[Math.max(0, L.dur - d), b, IO], [L.dur, 0]]); }],
    ['Zoom masuk', 'zoomin', (L, d) => ['sx', 'sy'].forEach(k => keyset(L.p[k], [[0, 0, OVER], [d, base(L.p[k])]]))],
    ['Pop', 'star', (L, d) => ['sx', 'sy'].forEach(k => { const b = base(L.p[k]); keyset(L.p[k], [[0, 0, OUT], [d * 0.6, b * 1.18, IO], [d, b]]); })],
    ['Geser dari kiri', 'back', (L, d) => { const b = base(L.p.x); keyset(L.p.x, [[0, b - proj.w, OUT], [d, b]]); }],
    ['Geser dari kanan', 'next', (L, d) => { const b = base(L.p.x); keyset(L.p.x, [[0, b + proj.w, OUT], [d, b]]); }],
    ['Putar masuk', 'rotate', (L, d) => { const b = base(L.p.rot), o = base(L.p.op); keyset(L.p.rot, [[0, b - 90, OUT], [d, b]]); keyset(L.p.op, [[0, 0, OUT], [d, o]]); }],
    ['Goyang', 'curve', (L) => { const b = base(L.p.rot), n = L.dur; keyset(L.p.rot, [[0, b, IO], [n * .25, b + 8, IO], [n * .5, b, IO], [n * .75, b - 8, IO], [n, b]]); }]
  ];

  /* ================= operasi layer (menu ⋯) ================= */
  function flip(L, k) {
    if (!E.guard(L)) return; E.cp(); const a = L.p[k]; a.v = -a.v; a.k.forEach(x => { x.v = -x.v; }); E.changed(true);
    if (ST.panel) rebuild();
  }
  function toOutline(L) {
    if (!E.guard(L)) return; const o = L.type === 'shape' ? L.shape : L.text; if (!o) return; E.cp();
    if (!o.noFill) { o.noFill = true; if (L.type === 'shape') { o.strokeColor = o.fill; o.strokeW = Math.max(o.strokeW, 8); } else { o.strokeColor = o.color; o.strokeW = Math.max(o.strokeW, 4); } }
    else { o.noFill = false; }
    E.changed(true); if (ST.panel) rebuild();
  }
  function clearKeys(L) {
    if (!E.guard(L)) return; E.cp();
    const clr = a => { if (a.k.length) { a.v = ML.evalAnim(a, ltOf(L)); a.k = []; } };
    Object.values(L.p).forEach(clr); L.fx.forEach(e => Object.values(e.p).forEach(clr)); E.changed(true); if (ST.panel) rebuild(); ML.toast('Semua keyframe layer dihapus');
  }
  const TAGS = ['#ff3b1f', '#e0365a', '#f0914f', '#f7e07a', '#d96bff', '#3aa8f0'];
  function layerMenu() {
    const L = E.sel(); if (!L) return;
    const items = [], vis = L.type !== 'audio', fittable = L.type === 'image' || L.type === 'video' || L.type === 'shape';
    if (L.type === 'group') items.push(['Buka grup', () => E.openGroup(L.id)], ['Bubarkan grup (batalkan group)', () => E.ungroupSel()]);
    else if (vis) items.push(['Grupkan layer ini', () => E.groupSel()]);
    items.push(['Pilih banyak layer', () => E.multiMode(true, L.id)], ['Pilih semua layer', () => E.selectAll()]);
    if (vis) items.push(['Balik secara Horizontal', () => flip(L, 'sx')], ['Balik secara Vertikal', () => flip(L, 'sy')]);
    if (fittable) items.push(['Sesuaikan Area Komposisi', () => fitNow(L, 'fit')], ['Isi Area Komposisi', () => fitNow(L, 'fill')], ['Regangkan ke Area Komposisi', () => fitNow(L, 'stretch')]);
    if (isMedia(L)) items.push(['Ganti Media', () => replaceSheet(L)]);
    if (L.type === 'shape') items.push(['Isi dengan Foto', () => openPanel('color')]);
    if (L.type === 'shape' || L.type === 'text') items.push([(L.shape || L.text).noFill ? 'Kembalikan Isi' : 'Ubah ke Outline', () => toOutline(L)]);
    if (L.type === 'video' || L.type === 'audio') items.push(['Volume', () => openPanel('volume')]);
    if (isMedia(L)) items.push(['Info Media', () => mediaInfo(L)]);
    if (L.type === 'video') items.push(['3D Tracking (lacak gerakan)', () => ML.track3d(E, L)]);
    items.push(['Naikkan Urutan Layer', () => E.moveSel(1)], ['Turunkan Urutan Layer', () => E.moveSel(-1)], ['Hapus semua keyframe layer', () => clearKeys(L)]);
    popMenu(items, close => h('div', { class: 'pm-tags' },
      h('button', { class: 'tagbtn none' + (!L.tag ? ' on' : ''), html: I('x'), title: 'Tanpa label', onclick: () => { E.cp(); L.tag = null; E.changed(true); close(); } }),
      ...TAGS.map(c => h('button', { class: 'tagbtn' + (L.tag === c ? ' on' : ''), style: { background: c }, onclick: () => { E.cp(); L.tag = c; E.changed(true); close(); } }))));
  }
  function popMenu(items, tagsFn) {
    const back = h('div', { class: 'popback' }), menu = h('div', { class: 'popmenu' }); let closed = false;
    const handler = () => { close(); return true; };
    function close() { if (closed) return; closed = true; ML.popBack(handler); back.remove(); }
    items.forEach(([label, fn]) => menu.append(h('button', { class: 'pm-item', text: label, onclick: () => { close(); fn(); } })));
    if (tagsFn) menu.append(tagsFn(close));
    back.append(menu); back.addEventListener('pointerdown', e => { if (e.target === back) close(); });
    ML.$('#overlays').append(back); ML.pushBack(handler);
  }

  /* ================= Browser Efek ================= */
  const CATS = [['Blur', ['motionblur', 'lensblur', 'streaks'], '#2b4a7a,#1d2b4d'], ['Distorsi/Warp', ['wave', 'mirror', 'mirror2', 'squeeze', 'randdisp', 'randdispv2', 'wavev2', 'pagecurl'], '#1d6a7a,#14334a'], ['Move/Transform', ['oscillate', 'swing', 'swingv2', 'spin', 'offset', 'transform', 'flip3'], '#3d3a7a,#1b1d3d'],
    ['Ulangi', ['tiles', 'tiles2', 'tiles3'], '#7a2e6a,#2e1540'], ['Matte/Mask/Key', ['lumakey', 'lumakeyv2', 'chroma', 'chromav2', 'chromakeyadv', 'wipe2'], '#6a4a2a,#2a1d14'], ['Warna', ['solidcolor', 'gradoverlay', 'expgamma', 'exposurev2'], '#7a3a2a,#3a1520'], ['Lainnya', ['copybg', 'cchd', 'blink'], '#3a4a5a,#161d28']];
  ML.FX_CATS = CATS;
  ML.xmlOn = () => ML.editVer() === 'am';
  ML.setXmlOn = v => { ML.lsSet('ml.xmlfx', v ? '1' : '0'); ML.fxThumbCache = null; };
  const fxShown = t => ML.xmlOn() || !ML.FXDEF[t].xml;
  ML.FX_SAMPLES = Array.from({ length: 12 }, (_, i) => 'img/sample' + (i + 1) + '.png');
  async function fxThumbs() {
    if (ML.fxThumbCache) return ML.fxThumbCache;
    const out = {};
    try {
      const imgs = (await Promise.all(ML.FX_SAMPLES.map(u => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = u; })))).filter(Boolean);
      const fx = new ML.FX(), S = 96;
      if (fx.ok && imgs.length) {
        const srcs = imgs.map(im => { const c = document.createElement('canvas'); c.width = c.height = S; const q = Math.min(im.width, im.height); c.getContext('2d').drawImage(im, (im.width - q) / 2, (im.height - q) / 2, q, q, 0, 0, S, S); return c; });
        for (const [n, t] of ML.FX_ORDER.entries()) {
          if (!fxShown(t)) continue;
          const src = srcs[n % srcs.length];
          const d = ML.FXDEF[t]; if (d.thumbFile) { out[t] = 'effects/thumb/' + d.thumbFile; continue; }
          const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
          if (d.special) { g.globalAlpha = 0.28; for (let i = -2; i <= 2; i++) g.drawImage(src, i * 4, 0, S, S); }
          else { const vals = {}; d.params.forEach(p => { vals[p.k] = (d.thumb && p.k in d.thumb) ? d.thumb[p.k] : p.def; }); g.drawImage(fx.run(src, src, [{ type: t, vals }], 0.3), 0, 0); }
          out[t] = c.toDataURL('image/jpeg', 0.7);
        }
        fx.dispose();
      }
    } catch (e) { /* tanpa thumbnail */ }
    return (ML.fxThumbCache = out);
  }
  function addFx(L, t) {
    if (!E.guard(L)) return; E.cp(); const e = ML.makeEffect(t); L.fx.push(e);
    if (ST.panel && ST.panel.kind === 'fx') ST.panel.fxSel = e.id;
    E.changed(true); rebuild();
  }
  function fxCopy(L, e) {
    const list = e ? [e] : (L ? L.fx : []);
    if (!L || !list.length) { ML.toast('Layer belum punya efek'); return; }
    ML.fxClip = { dur: L.dur, fx: ML.clone(list) };
    ML.toast(e ? 'Efek “' + ML.FXDEF[e.type].name.split(' (')[0] + '” disalin' : 'Semua efek disalin (' + list.length + ')');
    if (ST.panel && ST.panel.kind === 'fx') rebuild();
  }
  function fxPaste(L) {
    const c = ML.fxClip; if (!L || !c) { ML.toast('Belum ada efek yang disalin'); return; }
    if (!E.guard(L)) return; E.cp(); const r = L.dur / (c.dur || 1);
    c.fx.forEach(f => { const e = ML.clone(f); e.id = ML.uid(); for (const k in e.p) (e.p[k].k || []).forEach(q => { q.t *= r; }); L.fx.push(e); });
    E.changed(true); rebuild(); ML.toast('Efek ditempel, keyframe menyesuaikan panjang layer');
  }
  function effectBrowser(L) {
    const ov = h('div', { class: 'ebrowser' }); let cat = null, q = '', searching = false, closed = false, thumbs = {};
    const handler = () => { if (cat !== null || searching) { cat = null; searching = false; q = ''; draw(); } else close(); return true; };
    function close() { if (closed) return; closed = true; ML.popBack(handler); ov.remove(); }
    const th = t => { const d = h('div', { class: 'eth' }); if (thumbs[t]) d.style.backgroundImage = 'url(' + thumbs[t] + ')'; return d; };
    const pick = t => { close(); addFx(L, t); ML.toast('Efek “' + ML.FXDEF[t].name.split(' (')[0] + '” ditambahkan'); };
    function draw() {
      const title = searching ? null : (cat !== null ? CATS[cat][0] : 'Browser Efek');
      const sIn = h('input', { class: 'eb-search', type: 'text', placeholder: 'Cari efek…', value: q, oninput: e => { q = e.target.value; drawBody(); } });
      const head = h('div', { class: 'eb-head' }, h('button', { class: 'icon-btn', html: I(cat !== null || searching ? 'back' : 'x'), onclick: handler }),
        searching ? sIn : h('div', { class: 'eb-title', text: title }),
        h('button', { class: 'icon-btn', html: I('search'), onclick: () => { searching = !searching; q = ''; draw(); if (searching) setTimeout(() => ov.querySelector('.eb-search') && ov.querySelector('.eb-search').focus(), 50); } }));
      const body = h('div', { class: 'eb-body' });
      ov.replaceChildren(head, body); drawBody();
      function drawBody() {
        body.replaceChildren();
        const row = t => h('button', { class: 'ebrow', onclick: () => pick(t) }, th(t), h('div', {}, h('b', { text: ML.FXDEF[t].name }), h('small', { text: ML.FXDEF[t].params.length + ' parameter' })));
        if (searching || cat !== null) {
          const list = (searching ? ML.FX_ORDER.filter(t => fxShown(t) && ML.FXDEF[t].name.toLowerCase().includes(q.trim().toLowerCase())) : CATS[cat][1]);
          body.append(...(list.length ? list.map(row) : [h('p', { class: 'empty', text: 'Efek tidak ditemukan.' })]));
        } else {
          body.append(h('div', { class: 'eb-feat' }, ML.FX_ORDER.filter(t => !ML.FXDEF[t].xml).map(t => h('button', { class: 'ebf', onclick: () => pick(t) }, th(t), h('span', { text: ML.FXDEF[t].name.split(' (')[0] })))),
            h('div', { class: 'eb-cats' }, CATS.map(([n, l, g], i) => [n, l, g, i]).filter(c => ML.xmlOn() || !String(c[0]).startsWith('XML · ')).map(([n, , g, i]) => h('button', { class: 'ebc', style: { background: 'linear-gradient(135deg,' + g + ')' }, text: n, onclick: () => { cat = i; draw(); } }))));
        }
      }
    }
    ML.$('#overlays').append(ov); ML.pushBack(handler); draw();
    fxThumbs().then(m => { thumbs = m; if (!closed) draw(); });
  }

  /* ================= top bar, tool grid, buka/tutup panel ================= */
  function renderTop() {
    const L = E.sel(), top = E.top, ib = (ic, title, fn) => h('button', { class: 'icon-btn', title, 'aria-label': title, html: I(ic), onclick: fn });
    top.replaceChildren();
    if (ST.panel) {
      top.append(ib('back', 'Kembali', closePanel), h('div', { class: 'top-title', text: TITLES[ST.panel.kind] }));
      if (ST.panel.kind === 'fx') top.append(ib('plus', 'Tambahkan efek', () => effectBrowser(E.sel())), ib('copyAll', 'Salin semua efek', () => fxCopy(E.sel())), ib('paste', 'Tempel efek', () => fxPaste(E.sel())));
      if (ML.uiMode() === 'desk') top.append(ML.uiSwitch());
      return;
    }
    if (L) {
      const nm = h('input', { class: 'ed-name', type: 'text', value: L.name, oninput: e => { E.cp('nm' + L.id); L.name = e.target.value; E.scheduleSave(); }, onchange: () => E.buildLanes() });
      top.append(ib('back', 'Batal pilih layer', () => E.select(null)), nm, ib('copy', 'Duplikat layer', E.dupSel), ib('trash', 'Hapus layer', E.delSel), ib('more', 'Menu layer', layerMenu));
      if (ML.uiMode() === 'desk') top.append(ML.uiSwitch());
      return;
    }
    top.append(ib('back', ST.grp ? 'Keluar grup' : 'Kembali', ST.grp ? E.exitGroup : E.exit), E.nameIn, ib('check', 'Pilih banyak layer', () => E.multiMode(true)), ML.uiSwitch(), ib('film', 'Editor Template (ganti foto/video/teks)', () => ML.tpl && ML.tpl.openEd(E)), ib('gear', 'Pengaturan', E.settingsSheet), ib('export', 'Ekspor', E.exportSheet));
  }
  function renderTools() {
    const L = E.sel(), host = E.tools; host.replaceChildren();
    host.hidden = !L || !!ST.panel; if (host.hidden) return;
    const tb = (ic, title, fn, on) => h('button', { class: 'tb' + (on ? ' on' : ''), title, 'aria-label': title, html: I(ic), onclick: fn });
    const tt = (ic, label, fn, dis) => h('button', { class: 'tt' + (dis ? ' dis' : ''), html: I(ic) + '<span>' + label + '</span>', onclick: dis ? () => ML.toast(dis) : fn });
    const timed = L.type === 'video' || L.type === 'audio';
    host.append(h('div', { class: 'trow r5' },
      tb('trimL', 'Pangkas bagian kiri sampai playhead', E.trimStart), tb('scissors', 'Potong di playhead', E.splitSel), tb('trimR', 'Pangkas bagian kanan dari playhead', E.trimEnd),
      tb(L.locked ? 'unlock' : 'lock', L.locked ? 'Buka kunci' : 'Kunci layer', E.toggleLock, L.locked),
      timed ? tb(L.muted ? 'mute' : 'volume', L.muted ? 'Bunyikan' : 'Bisukan', E.toggleMute, L.muted) : tb(L.hidden ? 'eyeoff' : 'eye', L.hidden ? 'Tampilkan' : 'Sembunyikan', E.toggleHide, L.hidden)));
    if (L.type === 'audio') {
      host.append(h('div', { class: 'trow r4' }, tt('volume', 'Volume', () => openPanel('volume')), tt('swap', 'Ganti Media', () => openPanel('media')), tt('mic', 'Ubah Suara', () => E.voiceFemale(L)), tt('info', 'Info Media', () => mediaInfo(L))));
      return;
    }
    const styled = L.type === 'shape' || L.type === 'text';
    host.append(h('div', { class: 'trow r3' }, tt('fill', 'Color & Fill', () => openPanel('color'), styled ? null : 'Warna isi hanya untuk bentuk dan teks'),
      tt('border', 'Border & Bayangan', () => openPanel('border')), tt('layers', 'Blending & Opacity', () => openPanel('blend'))),
    h('div', { class: 'trow r4' }, tt('move', 'Move & Transform', () => openPanel('xform')),
      L.type === 'shape' ? tt('shape', 'Edit Bentuk', () => openPanel('edit')) : L.type === 'text' ? tt('text', 'Edit Teks', () => openPanel('edit')) : tt('swap', 'Ganti Media', () => openPanel('media')),
      tt('star', 'Presets', () => openPanel('presets')), tt('fx', 'Efek', () => openPanel('fx'))));
  }
  function openPanel(kind, extra) {
    const L = E.sel(); if (!L || !E.guard(L)) return;
    ST.panel = Object.assign({ kind, upd: [], mode: 'move', curve: false, fxSel: (L.fx[0] || {}).id || null }, extra);
    E.tools.hidden = true; E.pframe.hidden = false; E.pframe.classList.remove('tabin'); void E.pframe.offsetWidth; E.pframe.classList.add('tabin'); renderTop(); rebuild(); E.relayout();
  }
  function closePanel() {
    if (!ST.panel) return;
    ST.panel = null; E.pframe.hidden = true; E.pframe.replaceChildren(); E.renderBar(); E.relayout();
  }
  function refresh() { if (ST.panel) ST.panel.upd.forEach(f => f()); }
  function rebuild() {
    if (!ST.panel) return; const L = E.sel(); if (!L) return closePanel();
    ST.panel.upd = []; E.pframe.replaceChildren(); BUILD[ST.panel.kind](L); refresh();
  }

  return { renderTop, renderTools, openPanel, closePanel, rebuild, refresh, layerMenu, replaceSheet, mediaInfo, toggleChips, colorBtn, sec, effectBrowser };
};

