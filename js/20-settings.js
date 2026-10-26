'use strict';
/* Pengaturan: drawer kiri (pratinjau, durasi layer bawaan, kualitas audio, tema, tampilan, tentang, dukungan) */
ML.settings = (() => {
  const h = ML.h, WA = 'https://whatsapp.com/channel/0029Vb962bxBadmU9RSkup1R';
  const seg = (opts, get, set) => { const b = h('div', { class: 'seg' }); const dr = () => b.replaceChildren(...opts.map(([v, l]) => h('button', { class: get() == v ? 'on' : '', text: l, onclick: () => { set(v); dr(); } }))); dr(); return b; };
  const tog = (get, set) => { const s = h('button', { class: 'sw' + (get() ? ' on' : ''), onclick: () => { set(!get()); s.classList.toggle('on', get()); } }); return s; };
  const row = (t, right, cls) => h('div', { class: 'dr-row ' + (cls || '') }, h('span', { text: t }), right || '');
  const link = (t, fn) => h('button', { class: 'dr-row', onclick: fn }, h('span', { text: t }), h('span', { text: '›', style: 'font-size:26px;color:#8a6f8f' }));
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
        row('Durasi Layer Bawaan', sel, 'b'),
        h('div', { class: 'lbl', text: 'Pengambilan Ulang Audio (ekspor)' }),
        seg([[22050, 'RENDAH'], [44100, 'TINGGI'], [48000, 'ULTRA']], () => +(ML.lsGet('ml.asr') || 48000), v => ML.lsSet('ml.asr', v)),
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
