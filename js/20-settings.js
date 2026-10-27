'use strict';
/* Pengaturan: drawer kiri (pratinjau, durasi layer bawaan, kualitas audio, tema, tampilan, tentang, dukungan) */
ML.settings = (() => {
  const h = ML.h, WA = 'https://whatsapp.com/channel/0029Vb962bxBadmU9RSkup1R';
  const seg = (opts, get, set) => { const b = h('div', { class: 'seg' }); const dr = () => b.replaceChildren(...opts.map(([v, l]) => h('button', { class: get() == v ? 'on' : '', text: l, onclick: () => { set(v); dr(); } }))); dr(); return b; };
  const tog = (get, set) => { const s = h('button', { class: 'sw' + (get() ? ' on' : ''), onclick: () => { set(!get()); s.classList.toggle('on', get()); } }); return s; };
  const row = (t, right, cls) => h('div', { class: 'dr-row ' + (cls || '') }, h('span', { text: t }), right || '');
  const link = (t, fn) => h('button', { class: 'dr-row', onclick: fn }, h('span', { text: t }), h('span', { text: '›', style: 'font-size:26px;color:#8a6f8f' }));
  /** v0.5.1: baris pengaturan folder simpan (app: Download/MotionLynApp; web: Download/MotionLynWeb bila browser mendukung) */
  function saveFolderRow() {
    const S = ML.saveDir, box = h('div', { style: 'padding:2px 2px 10px;font-size:13px;line-height:1.45' });
    const note = t => h('div', { style: 'opacity:.8', text: t });
    async function draw() {
      if (!S) { box.replaceChildren(note('Folder simpan: Download')); return; }
      if (ML.isApp) { box.replaceChildren(note('App menyimpan ke Download/MotionLynApp.')); return; }
      if (!S.supported) { box.replaceChildren(note('Browser ini menyimpan ke folder Download bawaan (nama file diawali “MotionLyn…”). Folder Download/MotionLynWeb hanya bisa di Chrome/Edge desktop.')); return; }
      const hd = await S.handle(), msg = h('div', { style: 'margin-top:6px;color:#e0556b' });
      const btn = (t, fn) => h('button', { class: 'btn soft', style: 'margin:6px 6px 0 0', text: t, onclick: fn });
      box.replaceChildren(note(hd ? 'Menyimpan ke: ' + (hd.name || '…') + '/' + S.SUB : 'Belum dipilih: unduhan masuk folder Download bawaan browser. Pilih folder induk (mis. Download) agar file masuk ke ' + S.path() + '.'),
        btn(hd ? 'Ganti folder' : 'Pilih folder', async () => { try { await S.pick(); ML.toast('Folder diatur: ' + S.SUB); draw(); } catch (e) { if (!e.cancel) { msg.textContent = e.message; box.append(msg); } } }),
        hd ? btn('Hapus', async () => { await S.clear(); draw(); }) : '');
    }
    draw(); return box;
  }
  function open() {
    const back = h('div', { class: 'dr-back' }), dr = h('div', { class: 'dr' });
    const bh = () => { close(); return true; };
    const close = () => { ML.popBack(bh); back.classList.remove('on'); dr.classList.remove('on'); setTimeout(() => { back.remove(); dr.remove(); }, 230); };
    ML.pushBack(bh);
    back.onclick = close;
    const sel = h('select', { class: 'sel', onchange: e => ML.lsSet('ml.defdur', e.target.value) }, ...[1, 2, 3, 5, 10].map(s => h('option', { value: s, text: s + 's' })));
    sel.value = ML.lsGet('ml.defdur') || 5;
    dr.append(h('h2', { text: 'Pengaturan' }),
      h('div', { class: 'dr-card' },
        row('Pratinjau Kualitas Rendah', tog(() => ML.previewMax() <= 480, v => ML.lsSet('ml.pv', v ? 480 : 720)), 'b'),
        row('Mode Hyper (performa maksimal)', tog(() => ML.hyper && ML.hyper.enabled(), v => { if (ML.hyper) v ? ML.hyper.on() : ML.hyper.off(); }), 'b'),
        row('Durasi Layer Bawaan', sel, 'b'),
        h('div', { class: 'lbl', text: 'Pengambilan Ulang Audio (ekspor)' }),
        seg([[22050, 'RENDAH'], [44100, 'TINGGI'], [48000, 'ULTRA']], () => +(ML.lsGet('ml.asr') || 48000), v => ML.lsSet('ml.asr', v)),
        h('div', { class: 'lbl', text: 'Folder simpan hasil unduhan' }), saveFolderRow(),
        h('div', { class: 'lbl', text: 'Tema' }), seg([['light', 'CERAH'], ['dark', 'GELAP']], () => ML.themeNow(), v => ML.setTheme(v)),
        h('div', { class: 'lbl', text: 'Ukuran UI' }), seg([['compact', 'RINGKAS'], ['normal', 'NORMAL']], () => ML.densityNow(), v => ML.setDensity(v)),
        h('div', { class: 'lbl', text: 'Tampilan editor' }), seg([['mobile', 'MOBILE'], ['desk', 'DESKTOP']], () => ML.uiMode(), v => ML.setUi(v))),
      h('div', { class: 'dr-card' }, link('Tentang', () => { close(); ML.guide(); })),
      h('div', { class: 'dr-card' }, link('Dapatkan Dukungan', () => window.open(WA, '_blank'))),
      h('div', { class: 'dr-card' }, h('div', { class: 'lbl', text: 'Ikuti kami' }), link('WhatsApp Channel', () => window.open(WA, '_blank'))));
    ML.$('#overlays').append(back, dr); requestAnimationFrame(() => { back.classList.add('on'); dr.classList.add('on'); });
  }
  return { open };
})();
