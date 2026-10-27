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
let job = null; // pekerjaan impor yang sedang berjalan (untuk batal + status)
const cancelErr = () => Object.assign(new Error('dibatalkan'), { cancel: true });
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
    if (job && job.cancelled) throw cancelErr();
    const u = r < 0 ? url : PROXIES[r](url, init); if (!u) continue;
    if (job && job.say) job.say('Menyambung ke server Alight Motion (jalur: ' + NAMES[r + 1] + ')…' + (log.length ? ' jalur sebelumnya gagal, mencoba yang lain' : ''));
    try {
      const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), kind === 'json' ? 15000 : 300000);
      if (job) job.abort = () => ctl.abort();
      const res = await fetch(u, Object.assign({ signal: ctl.signal, cache: 'no-store' }, init || {}));
      if (!res.ok) { clearTimeout(to); lastErr = new Error('HTTP ' + res.status); log.push(NAMES[r + 1] + ': HTTP ' + res.status + (r === 4 && res.status === 404 ? ' (APK lama? perbarui app)' : '')); continue; }
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
    } catch (e) { if (job && job.cancelled) throw cancelErr(); lastErr = e; log.push(NAMES[r + 1] + ': ' + e.message); }
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
/** teks progres unduhan: "12.3 / 29.8 MB (41%) · 2.1 MB/dtk · sisa ±8 dtk" (total cadangan = ukuran dari info paket) */
function progress(say, label, expected) {
  const t0 = Date.now();
  return (g, t) => {
    const tot = t || expected || 0, sec = Math.max(0.3, (Date.now() - t0) / 1000), sp = g / sec;
    let m = label + ' ' + mb(g) + (tot ? ' / ' + mb(Math.max(tot, g)) : '') + ' MB';
    if (tot) m += ' (' + Math.min(t ? 100 : 99, Math.round(g / tot * 100)) + '%)';
    if (g > 262144) m += ' · ' + (sp / 1048576).toFixed(1) + ' MB/dtk' + (tot && sp > 0 && tot > g ? ' · sisa ±' + Math.ceil((tot - g) / sp) + ' dtk' : '');
    say(m);
  };
}
async function viaHub(base, { uid, pid }, status, expected) {
  status('Mengunduh lewat server AM-HUB…');
  const res = await fetch(base + '/api/download-package?uid=' + encodeURIComponent(uid) + '&pid=' + encodeURIComponent(pid), { cache: 'no-store' });
  if (!res.ok) { let m = ''; try { m = (await res.json()).error || ''; } catch (e) { /* abaikan */ } throw new Error('HTTP ' + res.status + (m ? ' ' + m : '')); }
  const total = +res.headers.get('content-length') || 0, rd = res.body.getReader(), parts = [], pg = progress(status, 'Mengunduh (AM-HUB)…', expected); let got = 0;
  for (;;) { if (job && job.cancelled) throw cancelErr(); const { done, value } = await rd.read(); if (done) break; parts.push(value); got += value.length; pg(got, total); }
  return new Blob(parts);
}
async function fetchPackage({ uid, pid }, status, expected) {
  const hub = hubGet(); let hubErr = '';
  if (hub) { try { return await viaHub(hub, { uid, pid }, status, expected); } catch (e) { hubErr = 'server AM-HUB (' + hub + '): ' + e.message; status('Server AM-HUB gagal, mencoba jalur lain…'); } }
  try { return await fetchDirect({ uid, pid }, status, expected); }
  catch (e) { throw new Error(e.message + (hubErr ? ' | ' + hubErr : '')); }
}
async function fetchDirect({ uid, pid }, status, expected) {
  const path = encodeURIComponent('share/u/' + uid + '/p/' + pid + '/projectfiles.zip');
  const base = FB + '/v0/b/' + BUCKET + '/o/' + path;
  status('Membaca info paket…');
  const meta = await tryFetch(base, 'json');
  const tok = meta && meta.downloadTokens && String(meta.downloadTokens).split(',')[0];
  if (!tok) throw new Error('Paket ini tidak punya token unduhan (mungkin privat atau bukan paket proyek)');
  const blob = await tryFetch(base + '?alt=media&token=' + tok, 'blob', progress(status, 'Mengunduh paket…', expected));
  return blob;
}

/** v3.92: tebak ekstensi dari isi file (media di paket kadang tanpa ekstensi / ekstensi aneh) */
const KNOWN_EXT = /\.(png|jpe?g|webp|gif|bmp|heic|avif|mp4|m4v|mov|webm|mkv|3gp|mp3|m4a|aac|wav|ogg|opus|flac)$/i;
async function sniffExt(b) {
  try {
    const u = new Uint8Array(await b.slice(0, 32).arrayBuffer()), s = (n, o) => String.fromCharCode(...u.slice(o || 0, (o || 0) + n));
    if (u[0] === 0x89 && s(3, 1) === 'PNG') return 'png';
    if (u[0] === 0xFF && u[1] === 0xD8) return 'jpg';
    if (s(3) === 'GIF') return 'gif';
    if (s(4) === 'RIFF' && s(4, 8) === 'WEBP') return 'webp';
    if (s(4) === 'RIFF' && s(4, 8) === 'WAVE') return 'wav';
    if (s(4, 4) === 'ftyp') { const br = s(4, 8); return /^M4[ABP]/.test(br) ? 'm4a' : br === 'qt  ' ? 'mov' : 'mp4'; }
    if (u[0] === 0x1A && u[1] === 0x45 && u[2] === 0xDF && u[3] === 0xA3) return 'webm';
    if (s(3) === 'ID3') return 'mp3';
    if (u[0] === 0xFF && (u[1] & 0xE0) === 0xE0) return (u[1] & 0x06) === 0 ? 'aac' : 'mp3';
    if (s(4) === 'OggS') return 'ogg';
    if (s(4) === 'fLaC') return 'flac';
  } catch (e) { /* abaikan */ }
  return '';
}

/** ZIP -> { xmls:[File], media:[File], bad:[string] } ; satu entri rusak tidak menggagalkan seluruh paket */
async function unpack(zipBlob) {
  const z = await ML.zip.read(zipBlob), xmls = [], media = [], bad = [];
  for (const n of z.names) {
    if (/\/$/.test(n) || /(^|\/)(__MACOSX|\.)/.test(n)) continue;
    const nm = n.split('/').pop(); if (!nm || /manifest\.txt$/i.test(nm)) continue;
    let b = null; try { b = await z.get(n); } catch (e) { bad.push(nm + ' — ' + e.message); continue; }
    if (!b) { bad.push(nm + ' — kosong'); continue; }
    if (/\.xml$/i.test(nm)) { xmls.push(new File([b], nm, { type: 'text/xml' })); continue; }
    let name = nm;
    if (!KNOWN_EXT.test(nm)) { const ex = await sniffExt(b); if (ex) name = nm + '.' + ex; }
    media.push(new File([b], name, { type: b.type || '' }));
  }
  return { xmls, media, bad };
}

/** v3.92: layar tunggu impor link: spinner, langkah, status, bar unduhan, hitung waktu, tombol batal (supaya proses lama tidak dikira error) */
const STEPS = ['Membaca info paket', 'Mengunduh paket', 'Membuka paket', 'Mengimpor proyek & media'];
function waitUi(onCancel) {
  const back = h('div', { class: 'backdrop' }), box = h('div', { class: 'sheet dlg' }), body = h('div', { class: 'sheet-body' });
  const mid = (t, st) => h('p', { class: 'dlg-text', style: 'text-align:center;' + (st || ''), text: t });
  const stepEls = STEPS.map(t => h('div', { class: 'amw-step', text: t }));
  const pct = h('div', { class: 'amw-pct', style: 'text-align:center;font-weight:800;font-size:22px;margin:4px 0;display:none' }), status = mid('Menyiapkan…', 'font-size:13px'), time = mid('', 'font-size:12px;opacity:.7;margin-top:2px'), bar = h('i'), prog = h('div', { class: 'prog amw-ind' }, bar);
  const hint = mid('Masih berjalan, bukan macet. Paket besar atau koneksi lambat memang butuh waktu. Mohon tunggu, jangan tutup halaman.', 'font-size:13px'); hint.style.display = 'none';
  let closed = false, t0 = Date.now(), cur = 0;
  const iv = setInterval(() => { const sec = Math.round((Date.now() - t0) / 1000); time.textContent = 'Berjalan ' + sec + ' dtk'; if (sec >= 8) hint.style.display = ''; }, 1000);
  const handler = () => { ML.confirmTap('Tekan kembali sekali lagi untuk membatalkan impor', () => onCancel()); return true; };
  function close() { if (closed) return; closed = true; clearInterval(iv); ML.popBack(handler); back.classList.remove('open'); setTimeout(() => back.remove(), 180); }
  function step(i) { cur = i; pct.style.display = 'none'; stepEls.forEach((e, k) => { e.className = 'amw-step' + (k < i ? ' done' : k === i ? ' now' : ''); }); prog.classList.add('amw-ind'); bar.style.width = ''; }
  function say(m) {
    status.textContent = m;
    const x = String(m).match(/([\d.]+)\s*\/\s*([\d.]+)\s*MB/);
    if (x && +x[2] > 0) { const p = Math.min(100, +x[1] / +x[2] * 100); prog.classList.remove('amw-ind'); bar.style.width = p.toFixed(1) + '%'; pct.style.display = ''; pct.textContent = Math.round(p) + '%'; }
    else { pct.style.display = 'none'; if (/Mengunduh/.test(m) && cur === 1) prog.classList.add('amw-ind'); }
  }
  box.append(h('div', { class: 'sheet-head' }, h('span', { class: 'sheet-title', text: 'Mengimpor dari link AM' })), body);
  body.append(h('div', { class: 'amw-spin' }), mid('Mohon tunggu sebentar…', 'font-weight:700;font-size:16px'),
    mid('Sedang mendapatkan data dari link. Proses ini normal dan bisa makan waktu beberapa saat.'),
    h('div', { class: 'amw-steps' }, ...stepEls), pct, prog, status, time, hint,
    h('div', { class: 'btn-row' }, h('button', { class: 'btn ghost', text: 'Batalkan', onclick: () => onCancel() })));
  back.append(box); ML.$('#overlays').append(back); requestAnimationFrame(() => back.classList.add('open')); ML.pushBack(handler);
  step(0);
  return { say, step, close };
}

async function run(input, opt = {}) {
  let ids = parseLink(input), ui = null, meta = null, zipBlob = null, ghErr = '';
  job = { cancelled: false, abort: null, say: null };
  const J = job;
  const cancel = () => { J.cancelled = true; try { if (J.abort) J.abort(); } catch (e) { /* abaikan */ } if (ui) ui.close(); ui = null; ML.toast('Impor dibatalkan', 1800); };
  const show = i => { ui = waitUi(cancel); J.say = ui.say; ui.step(i); };
  const say = m => { if (ui) ui.say(m); }, clr = () => { if (ui) ui.close(); ui = null; };
  const live = () => { if (J.cancelled) throw cancelErr(); };
  show(0);
  try {
    if (ML.amGh && ML.amGh.ready()) { // v3.96: server GitHub yang mengunduh paketnya (bukan browser/HP), bebas CORS
      ui.step(1);
      try { const r = await ML.amGh.fetch({ input, ids }, say, J); live(); zipBlob = r.blob; meta = r.meta || null; }
      catch (e) { if ((e && e.cancel) || J.cancelled) throw e; ghErr = e.message; say('Server GitHub gagal. Mencoba jalur langsung…'); ui.step(0); }
    }
    if (!zipBlob) {
      if (!ids) { // link pendek alight.link: coba ikuti pengalihan
        say('Membuka link pendek…');
        const u = String(input).trim().replace(/^(?!https?:)/, 'https://');
        for (const r of (IS_APP() ? [4] : [-1, 1, 2])) { live(); try { const res = await fetch(r < 0 ? u : PROXIES[r](u)); ids = parseLink(res.headers.get('x-final-url') || '') || parseLink(res.url) || parseLink(await res.text()); if (ids) break; } catch (e) { /* lanjut */ } }
        live();
        if (!ids) throw new Error('Link pendek tidak bisa dibuka dari sini. Buka link itu di browser, lalu salin link panjangnya (…/am/share/u/…/p/…)');
      }
      say('Membaca info paket…');
      meta = await fetchMeta(ids); live();
      if (meta && !meta.free) say('Paket besar (' + mb(meta.size) + ' MB, di AM = PRO). Tetap dicoba…');
      ui.step(1);
      zipBlob = await fetchPackage(ids, say, meta && meta.size); live();
    }
    ui.step(2); say('Membuka paket (' + mb(zipBlob.size) + ' MB)…');
    const { xmls, media, bad: badEntries } = await unpack(zipBlob); live();
    if (badEntries.length) ML.toast(badEntries.length + ' file di paket tidak bisa dibuka: ' + badEntries.slice(0, 2).join('; '), 6000);
    if (!xmls.length) throw new Error('Tidak ada file XML proyek di dalam paket');
    clr();
    let pick = xmls;
    if (xmls.length > 1 && !opt.all) pick = await choose(xmls, media, meta);
    if (!pick || !pick.length) return null;
    if (J.cancelled) return null;
    if (ML.editVer() !== 'am') ML.setEditVer('am');
    show(3);
    const reps = [];
    for (let i = 0; i < pick.length; i++) {
      live(); say('Mengimpor ' + (i + 1) + '/' + pick.length + ': ' + pick[i].name + ' (' + media.length + ' media; video besar bisa lebih lama)…');
      try { reps.push(await ML.importAMXML([pick[i], ...media])); }
      catch (e) { reps.push({ name: pick[i].name, error: e.message, layers: 0, missingMedia: [], fxSkipped: [], skipped: [] }); }
    }
    clr();
    if (ML.home && ML.home.show) await ML.home.show();
    const ok = reps.filter(r => r.id);
    if (!ok.length) throw new Error(reps[0] && reps[0].error || 'Impor gagal');
    ML.amLast = ok[ok.length - 1].id;
    const bad = r => r.missingMedia.length || (r.unreadable && r.unreadable.length) || (r.unused && r.unused.length) || r.fxSkipped.length || r.skipped.length || r.shapeUnknown || (r.groups && r.groups.length);
    if (ok.length === 1 && reps.length === 1) {
      ML.toast('Proyek “' + ok[0].name + '” diimpor dari link');
      if (bad(ok[0])) ML.amReportSheet('Hasil impor dari link', ok[0], true); else ML.openEditor(ok[0].id);
    } else summary(reps, bad);
    return ok;
  } catch (e) {
    clr();
    if ((e && e.cancel) || J.cancelled) return null;
    ML.dialog({ title: 'Gagal impor dari link AM', text: e.message + (ghErr ? '\n\nServer GitHub: ' + ghErr : '') + (/terhubung/.test(e.message) ? ' — Solusi: jalankan server AM-HUB (folder tools/amhub), lalu isi alamatnya di Link AM > Server AM-HUB. Atau unduh paket ZIP-nya dan pakai “Impor XML (AM)”.' : ''), ok: 'OK', cancel: null });
    return null;
  } finally { if (job === J) job = null; }
}

function choose(xmls, media, meta) {
  const ttl = i => (meta && meta.scenes.length === xmls.length && meta.scenes[i] && meta.scenes[i].title) || '';
  return new Promise(res => {
    let done = false; const fin = v => { if (!done) { done = true; res(v); } };
    ML.sheet('Paket berisi ' + xmls.length + ' proyek', (b, close) => {
      b.append(h('p', { class: 'dlg-text', text: (meta && meta.title ? meta.title + ' · ' : '') + 'XML: ' + xmls.length + ' · Media: ' + media.length + ' file' + (meta && meta.effects.length ? ' · Efek dipakai: ' + meta.effects.length : '') + '. Pilih proyek yang mau diimpor.' }));
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
  isLink, parseLink, run, _progress: progress,
  hubGet, hubSet,
  /** sheet tempel link -> impor */
  open: () => ML.sheet('Impor dari link Alight Motion', (b, close) => {
    const inp = h('input', { class: 'txt', type: 'text', placeholder: 'https://alightcreative.com/am/share/u/…/p/…' });
    const hubTxt = () => hubGet() ? 'Server AM-HUB: ' + hubGet() : 'Server AM-HUB: tidak dipakai';
    const hubBtn = h('button', { class: 'btn ghost', text: hubTxt(), onclick: async () => {
      const v = await ML.dialog({ title: 'Server AM-HUB', text: 'Alamat server AM-HUB (jalur cadangan, mis. http://localhost:3000). Kosongkan untuk tidak memakai. Server ada di folder tools/amhub.', input: true, value: hubGet(), ok: 'Simpan' });
      if (v !== null) { hubSet(v); hubBtn.textContent = hubTxt(); }
    } });
    const ghTxt = () => ML.amGh && ML.amGh.ready() ? 'Server GitHub: aktif' : 'Server GitHub: belum diatur';
    const ghBtn = h('button', { class: 'btn ghost', text: ghTxt(), onclick: () => { close(); ML.amGh.settings(() => ML.amLink.open()); } });
    b.append(h('p', { class: 'dlg-text', text: 'Tempel link bagikan AM. Isi paket (XML + media) langsung diimpor; tinggal ganti media lewat Editor Template.' }), inp,
      h('div', { class: 'btn-row' }, ghBtn, hubBtn, h('button', { class: 'btn primary', text: 'Impor', onclick: () => { const v = inp.value.trim(); if (!v) return; close(); run(v); } })));
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { const v = inp.value.trim(); if (v) { close(); run(v); } } });
    setTimeout(() => inp.focus(), 250);
  })
};
})();
