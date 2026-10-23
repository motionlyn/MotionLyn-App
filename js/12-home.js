'use strict';
/* Beranda + daftar proyek + dialog proyek baru */
ML.home = (() => {
  const h = ML.h, I = ML.icon;
  let tab = 'home', sortBy = ML.lsGet('ml.sort') || 'date', projects = [];
  const root = () => ML.$('#app');

  async function show(t) {
    if (t) tab = t;
    projects = (await ML.db.allProjects()).sort((a, b) => sortBy === 'name' ? a.name.localeCompare(b.name) : b.updatedAt - a.updatedAt);
    render();
  }

  function card(p) {
    const thumb = h('div', { class: 'pthumb' }, p.thumb ? h('img', { src: p.thumb }) : null, h('span', { class: 'pdur', text: ML.fmt(p.dur || 0, p.fps) }));
    const meta = (ic, txt) => h('span', { class: 'pm' }, h('i', { html: I(ic) }), txt);
    return h('div', { class: 'pcard', onclick: () => open(p.id) }, thumb,
      h('div', { class: 'pinfo' }, h('div', { class: 'pname', text: p.name }),
        h('div', { class: 'pmeta' }, meta('expand', p.ratio), meta('film', p.resLabel), meta('import', ML.fmtSize(p.size || 0)), meta('play', p.fps + 'fps'))),
      h('button', { class: 'icon-btn dark', html: I('more'), onclick: e => { e.stopPropagation(); menu(p); } }));
  }

  function groups(list) {
    const out = []; let last = '';
    list.forEach(p => {
      const d = sortBy === 'name' ? '' : new Date(p.updatedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
      if (d !== last) { last = d; if (d) out.push(h('div', { class: 'gdate', text: d })); }
      out.push(card(p));
    });
    return out;
  }

  function render() {
    const importCard = h('div', { class: 'card imp' }, h('i', { html: I('import') }), h('div', { class: 'imp-t', text: 'Impor file .ml' }),
      h('button', { class: 'btn soft', text: 'Impor', onclick: importML }), h('button', { class: 'btn soft', text: 'Dari link', onclick: () => ML.share.import() }), h('button', { class: 'btn soft', text: 'Dari Drive', onclick: () => ML.gdrive.import() }));
    const page = h('div', { class: 'home' },
      h('header', { class: 'home-top' }, h('button', { class: 'icon-btn dark', html: I('menu'), title: 'Panduan & tentang', onclick: () => ML.guide() }),
        h('div', { class: 'brand' }, 'MotionLyn', h('sup', { text: 'beta' })), h('button', { class: 'icon-btn dark', title: 'AI Chat', 'aria-label': 'AI Chat', html: ML.icon('fx'), onclick: () => ML.aichat.open() }), h('button', { class: 'icon-btn dark', title: 'Download AIO', 'aria-label': 'Download AIO', html: I('import'), onclick: () => ML.aio.open() }), h('button', { class: 'icon-btn dark', title: 'Chat Global (beta)', 'aria-label': 'Chat Global (beta)', html: I('chat'), onclick: () => ML.chat.open() }), h('button', { class: 'icon-btn dark', html: I('gear'), title: 'Pengaturan', 'aria-label': 'Pengaturan', onclick: () => ML.settings.open() }), h('img', { class: 'avatar', onclick: () => ML.srcTap(), src: 'img/Icon.png' })),
      h('div', { class: 'home-scroll' }, importCard,
        tab === 'home' ? [
          h('div', { class: 'sec' }, h('h2', { text: 'Proyek terbaru' }), h('a', { text: 'Lihat semua', onclick: () => show('projects') })),
          h('div', { class: 'newcard', onclick: newProject }, h('span', { class: 'plus', html: I('plus') }), h('b', { text: 'Buat Proyek Baru' })),
          projects.slice(0, 5).map(card),
          projects.length ? null : h('p', { class: 'empty', text: 'Belum ada proyek. Ketuk tombol + untuk mulai mengedit.' })
        ] : [
          h('div', { class: 'sec' }, h('h2', { text: 'Proyek Anda' }),
            h('a', { class: 'sort', html: (sortBy === 'name' ? 'Urutkan menurut Nama' : 'Urutkan menurut Tanggal') + I('chevd'), onclick: sortSheet })),
          groups(projects),
          projects.length ? null : h('p', { class: 'empty', text: 'Belum ada proyek.' })
        ]),
      h('nav', { class: 'bnav' },
        h('button', { class: tab === 'home' ? 'on' : '', html: I('home') + '<span>Beranda</span>', onclick: () => show('home') }),
        h('span', { class: 'bsp' }),
        h('button', { class: tab === 'projects' ? 'on' : '', html: I('film') + '<span>Proyek</span>', onclick: () => show('projects') }),
        h('button', { class: 'fab-main', html: I('plus'), onclick: newProject })));
    root().replaceChildren(page);
  }

  async function open(id) { ML.openEditor(id); }

  async function importML() {
    const f = (await ML.pickFiles('', false))[0]; if (!f) return;
    ML.toast('Mengimpor proyek…');
    try { const id = await ML.importML(f); await show(); ML.toast('Proyek diimpor'); open(id); }
    catch (e) { ML.toast('Gagal impor: ' + e.message, 3500); }
  }

  function sortSheet() {
    ML.sheet('Urutkan', (b, close) => b.append(...[['date', 'Tanggal terbaru'], ['name', 'Nama (A-Z)']].map(([k, l]) =>
      h('button', { class: 'row-btn' + (sortBy === k ? ' on' : ''), html: l + (sortBy === k ? I('check') : ''), onclick: () => { sortBy = k; ML.lsSet('ml.sort', k); close(); show(); } }))));
  }

  function about() {
    ML.sheet('MotionLyn', b => b.append(
      h('p', { class: 'dlg-text', html: '<b>Versi ' + ML.LABEL + '</b><br>Editor video &amp; motion untuk Android. Proyek tersimpan otomatis di perangkat.' }),
      h('p', { class: 'dlg-text', html: '<b>Cara cepat</b><br>• Geser timeline untuk scrub; playhead ada di tengah.<br>• Cubit dua jari untuk zoom timeline.<br>• Ketuk layer untuk memilih, lalu seret untuk memindah atau tarik tepinya untuk memotong.<br>• Tombol ◆ di panel properti membuat keyframe; buka tab Keyframe untuk mengatur kurva.<br>• Ekspor proyek (.ml) menyimpan foto, audio, video, dan data edit dalam satu file.' })));
  }

  async function menu(p) {
    ML.sheet(p.name, (b, close) => {
      const act = (ic, label, fn, cls) => b.append(h('button', { class: 'row-btn ' + (cls || ''), html: I(ic) + label, onclick: async () => { close(); await fn(); } }));
      act('film', 'Buka', () => open(p.id));
      act('text', 'Ganti nama', async () => { const n = await ML.dialog({ title: 'Ganti nama', input: true, value: p.name, ok: 'Simpan' }); if (n) { p.name = n; await ML.db.putProject(p); show(); } });
      act('copy', 'Duplikat', async () => {
        const np = ML.clone(p); np.id = ML.uid() + ML.uid(); np.name = p.name + ' (salinan)'; np.createdAt = np.updatedAt = Date.now();
        for (const m of await ML.db.mediaOf(p.id)) await ML.db.putMedia(Object.assign({}, m, { pid: np.id }));
        await ML.db.putProject(np); show(); ML.toast('Proyek diduplikat');
      });
      act('export', 'Ekspor proyek (.ml)', async () => {
        ML.toast('Menyiapkan file .ml…');
        try { const blob = await ML.buildML(p); const loc = await ML.saveBlob(blob, ML.exportFileName(p, 'ml'), 'application/octet-stream'); ML.toast('Tersimpan: ' + loc, 4000); }
        catch (e) { ML.toast('Gagal ekspor: ' + e.message, 3500); }
      });
      act('export', 'Bagikan via link (maks 6 MB)', () => ML.share.export(p));
      act('export', 'Ekspor ke Google Drive', () => ML.gdrive.export(p));
      act('trash', 'Hapus', async () => { if (await ML.dialog({ title: 'Hapus proyek?', text: '“' + p.name + '” beserta medianya akan dihapus permanen.', ok: 'Hapus', danger: true })) { await ML.db.delProject(p.id); show(); } }, 'danger');
    });
  }

  /* ---------- proyek baru ---------- */
  function chips(opts, get, set, extra) {
    const box = h('div', { class: 'chips' });
    const draw = () => { box.replaceChildren(...opts.map(([v, l]) => h('button', { class: 'chip' + (get() === v ? ' on' : ''), text: l, onclick: () => { set(v); draw(); extra && extra(); } }))); };
    draw(); return box;
  }

  function newProject() {
    const n = (+ML.lsGet('ml.n') || 0) + 1;
    const S = { name: 'Proyek Baru ' + n, ratio: '9:16', cw: 9, ch: 16, res: '1080p', cshort: 1080, fps: 30, cfps: 30, bg: '#000000' };
    ML.sheet('Proyek baru', (body, close) => {
      const nameIn = h('input', { class: 'txt', type: 'text', value: S.name });
      const info = h('div', { class: 'info' }), warn = h('div', { class: 'warn' });
      const num = (v, min, max, on) => h('input', { class: 'txt num', type: 'number', min, max, value: v, oninput: e => on(+e.target.value) });
      const ratio = () => S.ratio === 'custom' ? [Math.max(1, S.cw), Math.max(1, S.ch)] : S.ratio.split(':').map(Number);
      const short = () => S.res === 'custom' ? ML.clamp(Math.round(S.cshort) || 720, 120, 4320) : ML.RES[S.res];
      const upd = () => {
        const [rw, rh] = ratio(), [w, hh] = ML.calcSize(rw, rh, short()), fps = S.fps === 'custom' ? ML.clamp(Math.round(S.cfps) || 30, 1, 480) : S.fps;
        info.textContent = 'Ukuran komposisi: ' + w + ' × ' + hh + ' • ' + fps + ' fps';
        warn.textContent = (short() >= 2160 || fps >= 120 || w * hh > 4e6) ? 'Resolusi/fps tinggi berat di HP. Preview tetap diturunkan resolusinya, tetapi ekspor bisa lambat.' : '';
      };
      const rCustom = h('div', { class: 'cust' }, num(S.cw, 1, 99, v => { S.cw = v; upd(); }), h('span', { text: ':' }), num(S.ch, 1, 99, v => { S.ch = v; upd(); }));
      const sCustom = h('div', { class: 'cust' }, num(S.cshort, 120, 4320, v => { S.cshort = v; upd(); }), h('span', { text: 'px (sisi pendek)' }));
      const fCustom = h('div', { class: 'cust' }, num(S.cfps, 1, 480, v => { S.cfps = v; upd(); }), h('span', { text: 'fps' }));
      const vis = () => { rCustom.hidden = S.ratio !== 'custom'; sCustom.hidden = S.res !== 'custom'; fCustom.hidden = S.fps !== 'custom'; upd(); };
      const bgBtn = h('button', { class: 'bgbtn', onclick: () => ML.colorPicker(S.bg, c => { S.bg = c; sw.style.background = c; txt.textContent = c; }, 'Warna latar') });
      const sw = h('i', { class: 'swatch', style: { background: S.bg } }), txt = h('span', { text: S.bg }); bgBtn.append(sw, txt, h('i', { html: I('chevd') }));
      body.append(nameIn,
        h('div', { class: 'lbl', text: 'Rasio' }), chips([...ML.RATIOS.map(r => [r, r]), ['custom', 'Kustom']], () => S.ratio, v => S.ratio = v, vis), rCustom,
        h('div', { class: 'lbl', text: 'Resolusi' }), chips([...Object.keys(ML.RES).map(r => [r, r]), ['custom', 'Kustom']], () => S.res, v => S.res = v, vis), sCustom,
        h('div', { class: 'lbl', text: 'Frame rate' }), chips([...ML.FPS.map(f => [f, f + ' fps']), ['custom', 'Kustom']], () => S.fps, v => S.fps = v, vis), fCustom,
        h('div', { class: 'lbl', text: 'Latar belakang' }), bgBtn, info, warn,
        h('button', { class: 'btn primary wide', text: 'BUAT PROYEK', onclick: async () => {
          const [rw, rh] = ratio(), fps = S.fps === 'custom' ? ML.clamp(Math.round(S.cfps) || 30, 1, 480) : S.fps;
          const p = ML.newProject({ name: nameIn.value.trim() || S.name, rw, rh, short: short(), fps, ratio: S.ratio === 'custom' ? rw + ':' + rh : S.ratio, resLabel: S.res === 'custom' ? short() + 'p' : S.res, bg: S.bg });
          ML.lsSet('ml.n', n); await ML.db.putProject(p); close(); open(p.id);
        } }));
      vis();
    }, { cls: 'newp' });
  }

  return { show, newProject, back: () => { if (tab !== 'home') { show('home'); return true; } return false; } };
})();

