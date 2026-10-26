'use strict';
/* Editor Template: ganti foto / video / audio / teks tiap "slot" tanpa menyentuh posisi, ukuran, gerakan, dan efeknya.
   Slot = layer media (foto, video, audio), slot kosong hasil impor XML (kotak abu-abu ⚠, memegang ph = {kind,file,uri,...}), dan layer teks.
   Cara pakai: Proyek (menu ⋯) → "Editor Template", atau tombol film di bar atas editor, atau tombol di laporan impor XML. */
(function () {
const h = ML.h, I = ML.icon;
const stem = n => String(n || '').replace(/\.[^.]+$/, '');
const norm = n => stem(n).toLowerCase().replace(/[^a-z0-9]+/g, '');
const FIT = [['fill', 'Isi slot'], ['fit', 'Pas dalam slot'], ['comp', 'Penuh layar']];

const mid = L => (L.shape && L.shape.fillMedia) ? L.shape.fillMedia.mediaId : L.mediaId;
function slotsOf(proj) {
  const media = [], text = [];
  proj.layers.forEach(L => {
    if (L.k3 || L.glb) return;
    if (L.ph) media.push({ L, ph: true });
    else if (L.type === 'image' || L.type === 'video' || L.type === 'audio') media.push({ L, ph: false });
    else if (L.type === 'shape' && L.shape && L.shape.fillMedia) media.push({ L, ph: false }); // bentuk berisi foto
    else if (L.type === 'text') text.push({ L });
  });
  const by = (a, b) => a.L.start - b.L.start;
  return { media: media.sort(by), text: text.sort(by) };
}
const slotKind = s => s.ph ? s.L.ph.kind : (s.L.type === 'shape' ? 'image' : s.L.type); // image | video | audio

/** isi satu slot dengan item media (hasil ML.media.importFile). mode: fill | fit | comp */
function fill(proj, L, it, mode) {
  if (L.type === 'shape' && (L.ph ? L.ph.keepShape : L.shape && L.shape.fillMedia)) { // slot bentuk: bentuk tetap, hanya isi fotonya
    if (it.kind !== 'image') throw new Error('Slot bentuk butuh foto');
    const ph0 = L.ph; ML.media.dropEl(L.id);
    if (ph0) { L.name = ph0.label || String(L.name).replace(/^⚠\s*/, ''); L.slot = { label: L.name, file: ph0.file }; delete L.ph; }
    L.shape.fillMedia = { mediaId: it.id, mode: mode === 'fit' ? 'fit' : 'fill' }; L.shape.noFill = false; ML.ensureLayer(L); return;
  }
  const ph = L.ph, want = ph ? ph.kind : L.type;
  if ((want === 'audio') !== (it.kind === 'audio')) throw new Error(want === 'audio' ? 'Slot ini butuh file audio' : 'Slot ini butuh foto atau video');
  ML.media.dropEl(L.id);
  const old = ML.media.items.get(L.mediaId), box = L.frame ? [L.frame.w, L.frame.h] : [L.bw || proj.w, L.bh || proj.h]; // kotak slot (bingkai) dari template
  if (ph) {
    L.name = ph.label || String(L.name).replace(/^⚠\s*/, '');
    if (ph.hid) L.hidden = false;
    L.slot = { label: ph.label || L.name, file: ph.file };
    L.trimIn = it.kind === 'image' ? 0 : Math.min(ph.inTime || 0, Math.max(0, (it.dur || 0) - 0.1));
    delete L.shape; delete L.ph;
  } else {
    if (!old || L.name === stem(old.name)) L.name = stem(it.name);
    if (!L.slot && old) L.slot = { label: L.name, file: old.name };
    L.trimIn = 0;
  }
  L.mediaId = it.id; L.type = it.kind; L.srcDur = it.dur || 0;
  if (it.kind !== 'image') L.dur = Math.max(0.1, Math.min(L.dur, (it.dur || L.dur) - (L.trimIn || 0))); // durasi slot dijaga sesuai template
  if (it.kind !== 'audio' && it.w && it.h) {
    if (mode === 'comp') { delete L.frame; ML.fitLayer(proj, L, 'fill', it.w, it.h, true); }
    else { const s = (mode === 'fit' ? Math.min : Math.max)(box[0] / it.w, box[1] / it.h); L.bw = it.w * s; L.bh = it.h * s; L.fit = mode; if (mode === 'fill') L.frame = { w: box[0], h: box[1] }; else delete L.frame; } // Isi slot = potong sesuai bingkai (seperti mediaFillMode=fill di Alight Motion)
  }
  ML.ensureLayer(L);
}

/* kelompok slot berbagi nama file asli yang sama (slot kosong: ph.file; slot terisi: slot.file) */
/* v0.4.8: slot terisi hasil impor (mis. Link AM) belum punya L.slot -> pakai nama file media-nya, jadi "Ganti semua" tetap muncul untuk foto/video/audio yang dipakai berulang */
const fileOf = s => { if (s.ph) return s.L.ph.file; if (s.L.slot && s.L.slot.file) return s.L.slot.file; const it = ML.media.items.get(mid(s.L)); return it && it.name || null; };
function groupsOf(list) {
  const m = new Map();
  list.forEach(s => { const f = fileOf(s); if (!f) return; const key = norm(f) + '|' + slotKind(s); if (!m.has(key)) m.set(key, { file: f, kind: slotKind(s), slots: [] }); m.get(key).slots.push(s); });
  return [...m.values()].filter(g => g.slots.length >= 2);
}

/** ctx: { proj, before(), after(structure), close?() } */
function ui(ctx) {
  const proj = ctx.proj;
  let mode = ML.lsGet('ml.tplfit') || 'fill'; if (!FIT.some(f => f[0] === mode)) mode = 'fill';
  let host = null, busy = false;

  const thumb = (L, ph) => {
    const th = h('div', { class: 'tpl-th' + (ph ? ' ph' : '') });
    const it = ML.media.items.get(mid(L));
    if (ph) th.append(h('span', { text: '⚠' }), h('i', { html: I(L.ph.kind === 'audio' ? 'audio' : L.ph.kind === 'video' ? 'film' : 'image') }));
    else if (it && it.kind === 'image') th.style.backgroundImage = 'url(' + it.url + ')';
    else if (it && it.kind === 'video') { th.innerHTML = I('film'); ML.media.thumb(it).then(u => { if (u) { th.innerHTML = ''; th.style.backgroundImage = 'url(' + u + ')'; } }); }
    else th.innerHTML = I(L.type === 'audio' ? 'audio' : 'image');
    return th;
  };
  async function pickInto(s) {
    const k = slotKind(s), files = await ML.pickFiles(k === 'audio' ? 'audio/*,.mp3,.m4a,.wav,.ogg,.opus,.flac,.aac' : 'image/*,video/*', false);
    if (!files[0]) return;
    await apply(s, files[0]);
  }
  async function apply(s, file) {
    if (busy) return; busy = true;
    try {
      ML.toast('Mengimpor ' + file.name, 1500);
      const it = await ML.media.importFile(proj, file, slotKind(s) === 'audio' ? 'audio' : undefined);
      ctx.before(); fill(proj, s.L, it, mode); ctx.after(true); render();
    } catch (e) { ML.toast(e.message || 'Gagal mengganti media', 3500); }
    finally { busy = false; }
  }
  async function autoFill() {
    let files = await ML.pickFiles('image/*,video/*,audio/*,.mp3,.m4a,.wav,.ogg,.opus,.flac,.aac', true); if (!files.length) return;
    files = files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    const slots = slotsOf(proj).media, taken = new Set(), todo = [];
    const compat = (s, f) => (slotKind(s) === 'audio') === (ML.kindOf(f) === 'audio');
    const rest = [];
    for (const f of files) { // 1) cocokkan nama file dengan slot kosong
      const m = slots.find(s => s.ph && !taken.has(s) && norm(s.L.ph.file) === norm(f.name) && compat(s, f));
      if (m) { taken.add(m); todo.push([m, f]); } else rest.push(f);
    }
    for (const f of rest) { // 2) sisanya berurutan: slot kosong dulu, lalu slot terisi
      const pool = slots.filter(s => !taken.has(s) && compat(s, f)), m = pool.find(s => s.ph) || pool[0];
      if (m) { taken.add(m); todo.push([m, f]); }
    }
    if (!todo.length) { ML.toast('Tidak ada slot yang cocok dengan file itu'); return; }
    busy = true; let ok = 0, bad = 0;
    for (let i = 0; i < todo.length; i++) {
      const [s, f] = todo[i]; ML.toast('Mengisi ' + (i + 1) + '/' + todo.length + '…', 1200);
      try { const it = await ML.media.importFile(proj, f, slotKind(s) === 'audio' ? 'audio' : undefined); if (i === 0) ctx.before(); fill(proj, s.L, it, mode); ok++; }
      catch (e) { bad++; }
    }
    busy = false; ctx.after(true); render();
    ML.toast(ok + ' slot terisi' + (bad ? ', ' + bad + ' gagal' : '') + (files.length > todo.length ? ', ' + (files.length - todo.length) + ' file tak terpakai' : ''), 3000);
  }

  async function pickIntoAll(g) {
    if (busy) return;
    const files = await ML.pickFiles(g.kind === 'audio' ? 'audio/*,.mp3,.m4a,.wav,.ogg,.opus,.flac,.aac' : 'image/*,video/*', false);
    if (!files[0]) return;
    busy = true; let ok = 0, bad = 0;
    try {
      ML.toast('Mengimpor ' + files[0].name, 1500);
      const it = await ML.media.importFile(proj, files[0], g.kind === 'audio' ? 'audio' : undefined); // diimpor SEKALI, dipakai semua slot kelompok
      ctx.before();
      for (const s of g.slots) { try { fill(proj, s.L, it, mode); ok++; } catch (e) { bad++; } }
      ctx.after(true); render();
      ML.toast(ok + ' slot terisi' + (bad ? ', ' + bad + ' gagal (jenis media tidak cocok)' : ''), 3000);
    } catch (e) { ML.toast(e.message || 'Gagal mengisi slot', 3500); }
    finally { busy = false; }
  }
  function groupCard(g) {
    const empty = g.slots.filter(s => s.ph).length, name = stem(g.file);
    return h('div', { class: 'tpl-grp' },
      h('div', { class: 'tpl-grp-head' },
        h('div', { class: 'tpl-info' }, h('b', { text: name }), h('small', { text: g.slots.length + ' slot memakai file yang sama' + (empty ? ' • ' + empty + ' kosong' : '') })),
        h('button', { class: 'btn ' + (empty ? 'primary' : 'soft'), text: empty ? 'Isi semua' : 'Ganti semua', onclick: () => pickIntoAll(g) })),
      ...g.slots.map(mediaRow));
  }
  function mediaRow(s) {
    const L = s.L, it = ML.media.items.get(mid(L)), k = slotKind(s);
    const sub = s.ph ? 'Slot kosong • ' + ({ image: 'foto', video: 'video', audio: 'audio' }[k]) + ' asli: ' + L.ph.file
      : [({ image: 'Foto', video: 'Video', audio: 'Audio' }[k]), it ? it.name : '(media hilang)', L.slot && L.slot.file ? 'slot asal: ' + L.slot.file : null].filter(Boolean).join(' • ');
    return h('div', { class: 'tpl-row' + (s.ph ? ' empty' : '') }, thumb(L, s.ph),
      h('div', { class: 'tpl-info' }, h('b', { text: s.ph ? L.ph.label : L.name }), h('small', { text: sub }),
        h('small', { text: ML.fmt ? ML.fmt(L.start, proj.fps) + ' → ' + ML.fmt(L.start + L.dur, proj.fps) : '' })),
      h('button', { class: 'btn ' + (s.ph ? 'primary' : 'soft'), text: s.ph ? 'Isi' : 'Ganti', onclick: () => pickInto(s) }));
  }
  function textRow(s) {
    const L = s.L; let t = 0;
    const inp = h('textarea', { class: 'txt tpl-txt', rows: 1, value: L.text.text, oninput: () => {
      ctx.before('tx' + L.id); L.text.text = inp.value; clearTimeout(t); t = setTimeout(() => ctx.after(false), 250);
      inp.style.height = 'auto'; inp.style.height = Math.min(160, inp.scrollHeight) + 'px';
    } });
    inp.value = L.text.text;
    return h('div', { class: 'tpl-row txt' }, h('div', { class: 'tpl-th t', text: 'T' }), h('div', { class: 'tpl-info' }, h('small', { text: L.name }), inp));
  }

  function render() {
    if (!host) return;
    const S = slotsOf(proj), empty = S.media.filter(s => s.ph).length;
    host.replaceChildren(...[
      h('p', { class: 'dlg-text', html: '<b>' + S.media.length + '</b> slot media' + (empty ? ' (<b>' + empty + '</b> masih kosong)' : '') + ' • <b>' + S.text.length + '</b> teks. Posisi, ukuran, gerakan, dan efek slot tidak berubah.' }),
      h('div', { class: 'chips sm tpl-chips' }, ...FIT.map(f => h('button', { class: 'chip' + (mode === f[0] ? ' on' : ''), text: f[1], onclick: () => { mode = f[0]; ML.lsSet('ml.tplfit', mode); render(); } }))),
      S.media.length ? h('button', { class: 'btn soft wide', html: I('import') + '<span>Isi otomatis dari banyak file</span>', onclick: autoFill }) : null,
      (() => { const gs = groupsOf(S.media), inG = new Set(); gs.forEach(g => g.slots.forEach(x => inG.add(x))); const single = S.media.filter(x => !inG.has(x));
        return [gs.length ? h('div', { class: 'tpl-sec', text: 'Media yang sama (isi sekaligus atau satu-satu)' }) : null, ...gs.map(groupCard),
          single.length ? h('div', { class: 'tpl-sec', text: gs.length ? 'Media lainnya' : 'Media' }) : null, ...single.map(mediaRow)]; })(),
      S.text.length ? h('div', { class: 'tpl-sec', text: 'Teks' }) : null, ...S.text.map(textRow),
      !S.media.length && !S.text.length ? h('p', { class: 'empty', text: 'Proyek ini belum punya layer media atau teks.' }) : null].flat().filter(Boolean));
    host.querySelectorAll('.tpl-txt').forEach(e => { e.style.height = 'auto'; e.style.height = Math.min(160, e.scrollHeight) + 'px'; });
  }
  ML.sheet('Editor Template', body => { host = body; render(); }, { cls: 'tpl', onClose: () => { host = null; if (ctx.close) ctx.close(); } });
}

ML.tpl = {
  slotsOf, fill, _groups: proj => groupsOf(slotsOf(proj).media),
  /** dari beranda / laporan impor: muat proyek sendiri, simpan otomatis */
  async open(pid) {
    if (ML.editor && ML.editor.proj && ML.editor.proj.id === pid) return ML.tpl.openEd(ML.editor.E);
    const proj = await ML.db.getProject(pid); if (!proj) { ML.toast('Proyek tidak ditemukan'); return; }
    try { await ML.media.load(proj); } catch (e) { ML.toast('Sebagian media gagal dimuat'); }
    proj.layers.forEach(ML.ensureLayer);
    let st = 0;
    const save = async () => { clearTimeout(st); proj.updatedAt = Date.now(); proj.dur = ML.duration(proj); proj.size = ML.media.total() + JSON.stringify(proj.layers).length; await ML.db.putProject(proj); };
    ui({ proj, before() { /* tanpa undo di luar editor */ }, after() { clearTimeout(st); st = setTimeout(save, 400); },
      async close() { await save(); ML.media.dispose(); if (ML.home && ML.home.show) ML.home.show(); } });
  },
  /** dari dalam editor: undo/redo + render ulang ikut editor */
  openEd(E) {
    if (!E) { ML.toast('Editor belum siap'); return; }
    const P = E.P;
    ui({ proj: E.proj, before(key) { E.cp(key); },
      after(structure) { P.syncMedia(false); E.changed(!!structure); if (E.renderBar) E.renderBar(); if (E.ST.panel && ML.editor && ML.editor.panels) ML.editor.panels.rebuild(); } });
  }
};
})();
