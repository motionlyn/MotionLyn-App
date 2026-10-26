'use strict';
/* v3.89: Impor langsung dari LINK BAGIKAN Alight Motion (alightcreative.com/am/share/u/<uid>/p/<pid>).
   Paket link AM = file projectfiles.zip di penyimpanan Firebase AM berisi <scene>.xml (satu per proyek) + media.
   Alur: link -> ambil token (metadata) -> unduh ZIP -> buka -> kirim XML + media ke ML.importAMXML (engine impor yang sudah ada).
   Jalur jaringan dicoba berurutan: langsung -> proxy se-origin (/amfb/, lihat _redirects) -> proxy CORS publik. */
(function () {
const BUCKET = 'alight-creative.appspot.com';
const FB = 'https://firebasestorage.googleapis.com';
const CF = 'https://us-central1-alight-creative.cloudfunctions.net';
const PROXIES = [
  u => u.startsWith(FB) ? '/amfb' + u.slice(FB.length) : u.startsWith(CF) ? '/amcf' + u.slice(CF.length) : null,   // Netlify (_redirects): paling andal
  u => 'https://corsproxy.io/?' + encodeURIComponent(u),
  u => 'https://api.codetabs.com/v1/proxy/?quest=' + encodeURIComponent(u),
  u => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u),
  (u, init) => { // proxy NATIVE di app Android (AmNet.java): tanpa CORS
    let q = '/amnet/?u=' + encodeURIComponent(u);
    if (init && init.method === 'POST') q += '&m=POST&b=' + btoa(unescape(encodeURIComponent(String(init.body || '')))).replace(/\+/g, '-').replace(/\//g, '_');
    return q;
  }
];
const NAMES = ['langsung', 'situs sendiri (/amfb)', 'corsproxy', 'codetabs', 'allorigins', 'native app (/amnet)'];
const IS_APP = () => !!window.AndroidBridge || location.hostname === 'appassets.androidplatform.net';
const h = (...a) => ML.h(...a);
const mb = n => (n / 1048576).toFixed(1);
const clr = () => ML.toast('', 1);
const hubGet = () => { try { return (localStorage.getItem('ml.amhub') || '').trim().replace(/\/+$/, ''); } catch (e) { return ''; } };
const hubSet = v => { try { v ? localStorage.setItem('ml.amhub', v) : localStorage.removeItem('ml.amhub'); } catch (e) { /* abaikan */ } };
let route = -2;   // -2 = belum diuji, -1 = langsung, >=0 = indeks PROXIES yang berhasil

/** teks apa pun (link penuh / uid:pid) -> {uid, pid} atau null */
function parseLink(s) {
  s = String(s || '').trim();
  let m = s.match(/\/u\/([^\/?#\s]+)\/p\/([^\/?#\s]+)/); if (m) return { uid: decodeURIComponent(m[1]), pid: decodeURIComponent(m[2]) };
  m = s.match(/^([A-Za-z0-9]{20,40}):([A-Za-z0-9_-]{10,60})$/); if (m) return { uid: m[1], pid: m[2] };
  return null;
}
const isLink = s => !!parseLink(s) || /^(https?:\/\/)?(www\.)?alight\.link\//i.test(String(s || '').trim()) || /alightcreative\.com\/am\/share/i.test(String(s || ''));

async function tryFetch(url, kind, onProg, init) {
  let order = route === -2 ? [-1, 0, 1, 2, 3] : [route];
  if (init && init.method === 'POST') order = [-1, 0]; // proxy publik hanya GET
  if (IS_APP()) order = (init && init.method === 'POST') ? [4] : [4, -1]; // di app: jalur native dulu
  let lastErr = null; const log = [];
  for (const r of order) {
    const u = r < 0 ? url : PROXIES[r](url, init); if (!u) continue;
    try {
      const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), kind === 'json' ? 15000 : 300000);
      const res = await fetch(u, Object.assign({ signal: ctl.signal, cache: 'no-store' }, init || {}));
      if (!res.ok) { clearTimeout(to); lastErr = new Error('HTTP ' + res.status); log.push(NAMES[r + 1] + ': HTTP ' + res.status + (r === 4 && res.status === 404 ? ' (APK lama? perbarui app ke versi yang punya AmNet)' : '')); continue; }
      if (/text\/html/i.test(res.headers.get('content-type') || '')) { clearTimeout(to); log.push(NAMES[r + 1] + ': balasan HTML (bukan data; _redirects belum aktif?)'); continue; }
      if (kind === 'json') { const j = await res.json(); clearTimeout(to); if (!(init && init.method === 'POST')) route = r; return j; }
      const total = +res.headers.get('content-length') || 0;
      let blob;
      if (res.body && res.body.getReader) {
        const rd = res.body.getReader(), parts = []; let got = 0;
        for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); got += value.length; if (onProg) onProg(got, total); }
        blob = new Blob(parts);
      } else blob = await res.blob();
      clearTimeout(to);
      if (blob.size < 100) throw new Error('respons kosong');
      route = r; return blob;
    } catch (e) { lastErr = e; log.push(NAMES[r + 1] + ': ' + e.message); }
  }
  route = -2;
  throw new Error('Tidak bisa terhubung ke server Alight Motion. Rincian: ' + log.join(' | '));
}

/** getProjectMetadata (cloud function AM) -> {title,size,free,scenes[],effects[]} atau null (opsional, boleh gagal) */
async function fetchMeta({ uid, pid }) {
  try {
    const j = await tryFetch(CF + '/getProjectMetadata', 'json', null, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: { uid, pid } }) });
    const r = j && j.result, i = r && r.info; if (!i) return null;
    const max = r.freeUserMaxDownloadSize || 5242880;
    return { title: i.title || '', size: +i.size || 0, free: (+i.size || 0) <= max, max, downloads: i.downloads || 0,
      scenes: (i.projects || []).map(p => ({ title: p.title || '', size: +p.size || 0 })),
      effects: (i.requiredEffects || []).map(e => String(e).replace(/^com\.alightcreative\.(effects|internal)\./, '')) };
  } catch (e) { return null; }
}
async function viaHub(base, { uid, pid }, status) {
  status('Mengunduh lewat server AM-HUB…');
  const res = await fetch(base + '/api/download-package?uid=' + encodeURIComponent(uid) + '&pid=' + encodeURIComponent(pid), { cache: 'no-store' });
  if (!res.ok) { let m = ''; try { m = (await res.json()).error || ''; } catch (e) { /* abaikan */ } throw new Error('HTTP ' + res.status + (m ? ' ' + m : '')); }
  const total = +res.headers.get('content-length') || 0, rd = res.body.getReader(), parts = []; let got = 0;
  for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); got += value.length; status('Mengunduh (AM-HUB)… ' + mb(got) + (total ? ' / ' + mb(total) : '') + ' MB'); }
  return new Blob(parts);
}
async function fetchPackage({ uid, pid }, status) {
  const hub = hubGet(); let hubErr = '';
  if (hub) { try { return await viaHub(hub, { uid, pid }, status); } catch (e) { hubErr = 'server AM-HUB (' + hub + '): ' + e.message; status('Server AM-HUB gagal, mencoba jalur lain…'); } }
  try { return await fetchDirect({ uid, pid }, status); }
  catch (e) { throw new Error(e.message + (hubErr ? ' | ' + hubErr : '')); }
}
async function fetchDirect({ uid, pid }, status) {
  const path = encodeURIComponent('share/u/' + uid + '/p/' + pid + '/projectfiles.zip');
  const base = FB + '/v0/b/' + BUCKET + '/o/' + path;
  status('Membaca info paket…');
  const meta = await tryFetch(base, 'json');
  const tok = meta && meta.downloadTokens && String(meta.downloadTokens).split(',')[0];
  if (!tok) throw new Error('Paket ini tidak punya token unduhan (mungkin privat atau bukan paket proyek)');
  const blob = await tryFetch(base + '?alt=media&token=' + tok, 'blob', (g, t) => status('Mengunduh paket… ' + mb(g) + (t ? ' / ' + mb(t) : '') + ' MB'));
  return blob;
}

/** ZIP -> { xmls:[File], media:[File] } */
async function unpack(zipBlob) {
  const z = await ML.zip.read(zipBlob), xmls = [], media = [];
  for (const n of z.names) {
    if (/\/$/.test(n) || /(^|\/)(__MACOSX|\.)/.test(n)) continue;
    const nm = n.split('/').pop(); if (!nm || /manifest\.txt$/i.test(nm)) continue;
    const b = await z.get(n); if (!b) continue;
    const f = new File([b], nm, { type: /\.xml$/i.test(nm) ? 'text/xml' : (b.type || '') });
    (/\.xml$/i.test(nm) ? xmls : media).push(f);
  }
  return { xmls, media };
}

async function run(input, opt = {}) {
  let ids = parseLink(input);
  const toastS = m => ML.toast(m, 60000);
  try {
    if (!ids) { // link pendek alight.link: coba ikuti pengalihan
      toastS('Membuka link pendek…');
      const u = String(input).trim().replace(/^(?!https?:)/, 'https://');
      for (const r of (IS_APP() ? [4] : [-1, 1, 2])) { try { const res = await fetch(r < 0 ? u : PROXIES[r](u)); ids = parseLink(res.headers.get('x-final-url') || '') || parseLink(res.url) || parseLink(await res.text()); if (ids) break; } catch (e) { /* lanjut */ } }
      if (!ids) throw new Error('Link pendek tidak bisa dibuka dari sini. Buka link itu di browser, lalu salin link panjangnya (…/am/share/u/…/p/…)');
    }
    toastS('Membaca info paket…');
    const meta = await fetchMeta(ids);
    if (meta && !meta.free) ML.toast('Paket ' + mb(meta.size) + ' MB (di AM = PRO). Tetap dicoba…', 3000);
    const zipBlob = await fetchPackage(ids, toastS);
    toastS('Membuka paket (' + mb(zipBlob.size) + ' MB)…');
    const { xmls, media } = await unpack(zipBlob);
    if (!xmls.length) throw new Error('Tidak ada file XML proyek di dalam paket');
    clr();
    let pick = xmls;
    if (xmls.length > 1 && !opt.all) pick = await choose(xmls, media, meta);
    if (!pick || !pick.length) return null;
    if (ML.editVer() !== 'am') ML.setEditVer('am');
    const reps = [];
    for (let i = 0; i < pick.length; i++) {
      toastS('Mengimpor ' + (i + 1) + '/' + pick.length + ': ' + pick[i].name + '…');
      try { reps.push(await ML.importAMXML([pick[i], ...media])); }
      catch (e) { reps.push({ name: pick[i].name, error: e.message, layers: 0, missingMedia: [], fxSkipped: [], skipped: [] }); }
    }
    clr();
    if (ML.home && ML.home.show) await ML.home.show();
    const ok = reps.filter(r => r.id);
    if (!ok.length) throw new Error(reps[0] && reps[0].error || 'Impor gagal');
    ML.amLast = ok[ok.length - 1].id;
    const bad = r => r.missingMedia.length || r.fxSkipped.length || r.skipped.length || r.shapeUnknown || (r.groups && r.groups.length);
    if (ok.length === 1 && reps.length === 1) {
      ML.toast('Proyek “' + ok[0].name + '” diimpor dari link');
      if (bad(ok[0])) ML.amReportSheet('Hasil impor dari link', ok[0], true); else ML.openEditor(ok[0].id);
    } else summary(reps, bad);
    return ok;
  } catch (e) {
    clr();
    ML.dialog({ title: 'Gagal impor dari link AM', text: e.message + (/terhubung/.test(e.message) ? ' — Solusi: jalankan server AM-HUB (folder tools/amhub), lalu isi alamatnya di Link AM > Server AM-HUB. Atau unduh paket ZIP-nya dan pakai “Impor XML (AM)”.' : ''), ok: 'OK', cancel: null });
    return null;
  }
}

function choose(xmls, media, meta) {
  const ttl = i => (meta && meta.scenes.length === xmls.length && meta.scenes[i] && meta.scenes[i].title) || '';
  return new Promise(res => {
    let done = false; const fin = v => { if (!done) { done = true; res(v); } };
    ML.sheet('Paket berisi ' + xmls.length + ' proyek', (b, close) => {
      b.append(h('p', { class: 'dlg-text', text: (meta && meta.title ? meta.title + ' · ' : '') + 'Media: ' + media.length + ' file' + (meta && meta.effects.length ? ' · Efek dipakai: ' + meta.effects.length : '') + '. Pilih proyek yang mau diimpor.' }));
      b.append(h('button', { class: 'row-btn on', text: 'Impor semua (' + xmls.length + ')', onclick: () => { fin(xmls); close(); } }));
      xmls.forEach((f, i) => b.append(h('button', { class: 'row-btn', text: (ttl(i) || f.name.replace(/\.xml$/i, '')) + ' · ' + mb(f.size) + ' MB', onclick: () => { fin([f]); close(); } })));
    }, { onClose: () => fin(null) });
  });
}

function summary(reps, bad) {
  ML.sheet('Hasil impor dari link', (b, close) => {
    reps.forEach(r => {
      const note = r.error ? 'gagal: ' + r.error : r.layers + ' layer' + (bad(r) ? ' · ada catatan (media/efek)' : '');
      b.append(h('p', { class: 'dlg-text', text: (r.name || '?') + ' — ' + note }));
      if (r.id) b.append(h('div', { class: 'btn-row' },
        h('button', { class: 'btn soft', text: 'Buka', onclick: () => { close(); ML.openEditor(r.id); } }),
        h('button', { class: 'btn primary', text: 'Editor Template', onclick: () => { close(); ML.tpl && ML.tpl.open(r.id); } }),
        bad(r) ? h('button', { class: 'btn ghost', text: 'Catatan', onclick: () => ML.amReportSheet('Hasil impor: ' + r.name, r, true) }) : null));
    });
  });
}

ML.amLink = {
  isLink, parseLink, run,
  hubGet, hubSet,
  /** sheet tempel link -> impor */
  open: () => ML.sheet('Impor dari link Alight Motion', (b, close) => {
    const inp = h('input', { class: 'txt', type: 'text', placeholder: 'https://alightcreative.com/am/share/u/…/p/…' });
    const hubTxt = () => hubGet() ? 'Server AM-HUB: ' + hubGet() : 'Server AM-HUB: tidak dipakai';
    const hubBtn = h('button', { class: 'btn ghost', text: hubTxt(), onclick: async () => {
      const v = await ML.dialog({ title: 'Server AM-HUB', text: 'Alamat server AM-HUB (jalur cadangan, mis. http://localhost:3000). Kosongkan untuk tidak memakai. Server ada di folder tools/amhub.', input: true, value: hubGet(), ok: 'Simpan' });
      if (v !== null) { hubSet(v); hubBtn.textContent = hubTxt(); }
    } });
    b.append(h('p', { class: 'dlg-text', text: 'Tempel link bagikan AM. Isi paket (XML + media) langsung diimpor; tinggal ganti media lewat Editor Template.' }), inp,
      h('div', { class: 'btn-row' }, hubBtn, h('button', { class: 'btn primary', text: 'Impor', onclick: () => { const v = inp.value.trim(); if (!v) return; close(); run(v); } })));
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { const v = inp.value.trim(); if (v) { close(); run(v); } } });
    setTimeout(() => inp.focus(), 250);
  })
};
})();
