'use strict';
/* 28-am-gh.js — "Server GitHub" untuk Link AM (khusus versi web).
   Masalah: di browser, mengunduh paket Alight Motion sering gagal (CORS / proxy publik tidak stabil).
   Solusi: paket diunduh oleh SERVER GITHUB (GitHub Actions di repo milik pengguna), bukan oleh browser/HP.
   Alur:  1) cek cache di branch "amcache"  2) kalau belum ada, picu workflow amfetch.yml (workflow_dispatch)
          3) tunggu hasil (r/<rid>.json)    4) unduh potongan ZIP (r/<rid>.pNNN) lalu gabungkan jadi satu Blob.
   Perlu: repo (disarankan privat) berisi folder "amserver" + token GitHub fine-grained
          (Actions: Read and write, Contents: Read-only, hanya untuk repo itu). Tersimpan di perangkat ini (ml.amgh).
   API: ML.amGh.ready() / fetch({input, ids}, say, job) -> {blob, meta} / settings(onClose) */
(function () {
if (!window.ML || ML.amGh) return;
const h = (...a) => ML.h(...a);
const LS = 'ml.amgh', API = 'https://api.github.com', BRANCH = 'amcache', WF = 'amfetch.yml';
const mb = n => (n / 1048576).toFixed(1);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const cancelErr = () => Object.assign(new Error('dibatalkan'), { cancel: true });

/** "https://github.com/user/repo.git" / "user/repo" -> "user/repo" ('' bila tidak valid) */
const normRepo = v => {
  const m = String(v || '').trim().replace(/^https?:\/\/(www\.)?github\.com\//i, '').replace(/\.git$/i, '').replace(/\/+$/, '').match(/^([\w.-]+)\/([\w.-]+)$/);
  return m ? m[1] + '/' + m[2] : '';
};
const cfgGet = () => { try { const o = JSON.parse(localStorage.getItem(LS) || 'null'); return o && normRepo(o.repo) && o.token ? { repo: normRepo(o.repo), token: String(o.token).trim() } : null; } catch (e) { return null; } };
const cfgSet = o => { try { o ? localStorage.setItem(LS, JSON.stringify(o)) : localStorage.removeItem(LS); } catch (e) { /* abaikan */ } };
const ready = () => !!cfgGet();
const rid16 = () => { const a = new Uint8Array(8); (window.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : a.forEach((_, i) => { a[i] = Math.random() * 256; }); return 's' + Array.from(a, x => x.toString(16).padStart(2, '0')).join(''); };

/** satu panggilan API GitHub (batal-able lewat job.abort) */
async function gh(cfg, path, init, J) {
  const ctl = new AbortController(); if (J) J.abort = () => ctl.abort();
  init = init || {};
  try {
    return await fetch(API + path, Object.assign({}, init, { signal: ctl.signal, cache: 'no-store', headers: Object.assign({ Authorization: 'Bearer ' + cfg.token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, init.headers || {}) }));
  } catch (e) {
    if (J && J.cancelled) throw cancelErr();
    throw new Error('Tidak bisa menghubungi GitHub (' + (e && e.message || 'jaringan') + '). Cek koneksi internet.');
  }
}
/** Response gagal -> Error dengan penjelasan yang bisa ditindaklanjuti */
async function explain(res, ctx) {
  let msg = ''; try { msg = (await res.clone().json()).message || ''; } catch (e) { /* bukan JSON */ }
  let t;
  if (res.status === 401) t = 'Token ditolak (salah atau kedaluwarsa). Buat token baru lalu isi ulang di pengaturan Server GitHub.';
  else if (res.status === 403 || res.status === 429) t = /rate limit|abuse|secondary/i.test(msg) ? 'Batas permintaan GitHub tercapai, tunggu sebentar lalu coba lagi.' : 'Token tidak punya izin. Perlu: Actions = Read and write, Contents = Read-only, dan akses ke repo ini.';
  else if (res.status === 404) t = 'Repo / workflow tidak ditemukan. Cek nama repo, file .github/workflows/' + WF + ', dan pastikan token punya akses ke repo itu.';
  else if (res.status === 422) t = 'GitHub menolak permintaan' + (msg ? ' (' + msg + ')' : '') + '. Pastikan workflow ' + WF + ' ada di branch utama dan memakai "workflow_dispatch".';
  else t = 'HTTP ' + res.status + (msg ? ' — ' + msg : '');
  return new Error((ctx ? ctx + ': ' : '') + t);
}

/** baca file hasil di branch amcache; null = belum ada. kind: 'json' | 'blob' (blob dibaca bertahap supaya progresnya terlihat) */
async function readFile(cfg, name, J, kind, onBytes) {
  const res = await gh(cfg, '/repos/' + cfg.repo + '/contents/r/' + name + '?ref=' + BRANCH + '&t=' + Date.now(), { headers: { Accept: 'application/vnd.github.raw+json' } }, J);
  if (res.status === 404) return null;
  if (!res.ok) throw await explain(res);
  if (kind === 'json') return res.json();
  if (!res.body || !res.body.getReader) return res.blob();
  const rd = res.body.getReader(), chunks = []; let n = 0;
  for (;;) { if (J && J.cancelled) throw cancelErr(); const { done, value } = await rd.read(); if (done) break; chunks.push(value); n += value.length; if (onBytes) onBytes(n); }
  return new Blob(chunks);
}

/** id run terbaru (untuk mengenali run milik kita setelah dispatch; id selalu naik) */
async function lastRunId(cfg, J) {
  try {
    const res = await gh(cfg, '/repos/' + cfg.repo + '/actions/workflows/' + WF + '/runs?per_page=1', {}, J);
    if (!res.ok) return 0;
    const j = await res.json(); return (j.workflow_runs && j.workflow_runs[0] && j.workflow_runs[0].id) || 0;
  } catch (e) { if (e && e.cancel) throw e; return 0; }
}
/** run milik kita yang sudah selesai TIDAK sukses -> alasan singkat; selain itu null */
async function runFailure(cfg, afterId, J) {
  try {
    const res = await gh(cfg, '/repos/' + cfg.repo + '/actions/workflows/' + WF + '/runs?per_page=5', {}, J);
    if (!res.ok) return null;
    const runs = ((await res.json()).workflow_runs || []).filter(r => r.id > afterId);
    const bad = runs.find(r => r.status === 'completed' && r.conclusion && r.conclusion !== 'success');
    if (bad && bad.conclusion === 'skipped') {
      let me = ''; try { const r = await gh(cfg, '/user', {}, J); if (r.ok) me = (await r.json()).login || ''; } catch (e) { if (e && e.cancel) throw e; }
      return 'Workflow dilewati GitHub: akun ' + (me ? '"' + me + '" ' : '') + 'belum terdaftar di variabel repo AM_USERS. Buka repo → Settings → Secrets and variables → Actions → Variables → New repository variable: nama AM_USERS, isi ' + (me || 'username GitHub yang dipakai token') + '.';
    }
    return bad ? 'Workflow di GitHub berhenti dengan status "' + bad.conclusion + '". Buka tab Actions di repo untuk melihat sebabnya: ' + (bad.html_url || '') : null;
  } catch (e) { if (e && e.cancel) throw e; return null; }
}

/** jalur 2 (akun berbeda dari pemilik repo): buat issue "AMFETCH <id>" di repo publik; workflow membacanya (hanya akun di variabel AM_USERS) */
async function createIssue(cfg, link, rid, J) {
  const res = await gh(cfg, '/repos/' + cfg.repo + '/issues', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'AMFETCH ' + rid, body: link }) }, J);
  if (res.status === 201) return;
  if (res.status === 403 || res.status === 404) throw new Error('Token ini tidak boleh menulis ke repo tersebut. Karena akunnya berbeda dari pemilik repo, buat token KLASIK (Tokens (classic)) dengan centang "public_repo".');
  if (res.status === 410) throw new Error('Fitur Issues dimatikan di repo (Settings → General → Features → centang Issues).');
  throw await explain(res, 'Membuat permintaan (issue)');
}
/** picu workflow. Kembalian: 'dispatch' (token punya hak tulis) atau 'issue' (akun lain, lewat issue) */
async function dispatch(cfg, link, rid, J) {
  let last = null, st = 0;
  for (const ref of ['main', 'master']) {
    const res = await gh(cfg, '/repos/' + cfg.repo + '/actions/workflows/' + WF + '/dispatches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ref, inputs: { link, rid } }) }, J);
    if (res.status === 204) return 'dispatch';
    st = res.status; last = await explain(res, 'Memicu workflow');
    if (res.status !== 404 && res.status !== 422) break; // salah branch? coba "master"
  }
  if (st === 403 || st === 404) { // tidak punya hak tulis (akun lain): jalur issue
    try { await createIssue(cfg, link, rid, J); return 'issue'; }
    catch (e) { if (e && e.cancel) throw e; throw new Error(e.message + ' (jalur langsung: ' + last.message + ')'); }
  }
  throw last;
}

async function download(cfg, info, say, J) {
  const pg = ML.amLink && ML.amLink._progress ? ML.amLink._progress(say, 'Mengunduh dari server GitHub…', info.size) : null;
  const parts = []; let done = 0;
  for (let i = 0; i < info.parts; i++) {
    if (J && J.cancelled) throw cancelErr();
    const b = await readFile(cfg, info.key + '.p' + String(i).padStart(3, '0'), J, 'blob', n => { if (pg) pg(done + n, info.size); else say('Mengunduh dari server GitHub… ' + mb(done + n) + ' / ' + mb(info.size) + ' MB'); });
    if (!b) throw new Error('Potongan ' + (i + 1) + '/' + info.parts + ' belum tersedia di repo (coba lagi sebentar lagi)');
    parts.push(b); done += b.size;
  }
  if (done !== info.size) throw new Error('Ukuran paket tidak cocok (' + done + ' ≠ ' + info.size + ' byte). Coba ulangi.');
  return { blob: new Blob(parts, { type: 'application/zip' }), meta: info.meta || null };
}

/** ambil paket lewat server GitHub -> { blob, meta } ; job = objek pekerjaan (cancelled/abort) milik 27-am-link.js */
async function fetchPkg({ input, ids }, say, J) {
  const cfg = cfgGet(); if (!cfg) throw new Error('Server GitHub belum diatur');
  const live = () => { if (J && J.cancelled) throw cancelErr(); };
  const rid = ids ? ids.uid + '_' + ids.pid : rid16();
  say('Memeriksa cache di server GitHub…');
  let info = await readFile(cfg, rid + '.json', J, 'json'); live();
  if (info && info.status === 'ok') { say('Paket sudah ada di server GitHub (cache), mengunduh…'); return download(cfg, info, say, J); }
  const prev = info ? info.created : null; // hasil error lama dari permintaan sebelumnya: diabaikan
  const before = await lastRunId(cfg, J); live();
  say('Mengirim permintaan ke server GitHub…');
  const mode = await dispatch(cfg, String(input || '').trim(), rid, J); live();
  say(mode === 'issue' ? 'Permintaan terkirim lewat issue (akun berbeda dari pemilik repo)…' : 'Permintaan terkirim ke server GitHub…');
  const t0 = Date.now(); let n = 0;
  for (;;) {
    live();
    const el = Math.round((Date.now() - t0) / 1000);
    if (el > 420) throw new Error('Server GitHub terlalu lama (lebih dari 7 menit). Cek tab Actions di repo.');
    say('Menunggu server GitHub mengunduh paket (biasanya 30–90 dtk)… ' + el + ' dtk');
    await sleep(el < 12 ? 5000 : 3000);
    info = await readFile(cfg, rid + '.json', J, 'json'); live();
    if (info && info.status === 'ok') break;
    if (info && info.status === 'error' && info.created !== prev) throw new Error(info.message || 'gagal di server');
    if (++n % 3 === 0) {
      const f = await runFailure(cfg, before, J); live();
      if (f) throw new Error(f);
    }
  }
  say('Paket siap, mengunduh dari server GitHub…');
  return download(cfg, info, say, J);
}

/** sheet pengaturan: repo + token + uji koneksi */
function settings(onClose) {
  return ML.sheet('Server GitHub (Link AM)', (b, close) => {
    const cur = cfgGet() || {};
    const repo = h('input', { class: 'txt', type: 'text', placeholder: 'username/nama-repo' });
    const tok = h('input', { class: 'txt', type: 'password', placeholder: 'Token (github_pat_…)', autocomplete: 'off' });
    repo.value = cur.repo || ''; tok.value = cur.token || '';
    const msg = h('p', { class: 'dlg-text', style: 'font-size:13px;min-height:18px', text: '' });
    const say = (t, bad) => { msg.textContent = t; msg.style.color = bad ? '#e0556b' : ''; };
    const read = () => ({ repo: normRepo(repo.value), token: tok.value.trim() });
    const finish = () => { close(); if (onClose) setTimeout(onClose, 200); };
    b.append(
      h('p', { class: 'dlg-text', html: 'Paket link AM diunduh oleh <b>server GitHub</b> (GitHub Actions), bukan oleh browser/HP, jadi bebas error CORS. Repo boleh publik dan boleh milik akun lain (pakai token klasik <b>public_repo</b> + variabel <b>AM_USERS</b>). Panduan: <b>README</b> folder <b>amserver</b>.' }),
      repo, tok, msg,
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn ghost', text: 'Uji koneksi', onclick: async () => {
          const c = read(); if (!c.repo) return say('Isi nama repo dengan format username/nama-repo', true); if (!c.token) return say('Isi token GitHub', true);
          say('Menguji…');
          try {
            const ur = await gh(c, '/user'); if (!ur.ok) throw await explain(ur);
            const me = (await ur.json()).login || '?';
            const rr = await gh(c, '/repos/' + c.repo); if (!rr.ok) throw await explain(rr);
            const R = await rr.json(), own = (R.owner && R.owner.login) || '?', canPush = !!(R.permissions && R.permissions.push);
            const wr = await gh(c, '/repos/' + c.repo + '/actions/workflows/' + WF); if (!wr.ok) throw await explain(wr);
            const w = await wr.json();
            if (w.state !== 'active') return say('Workflow ditemukan tetapi statusnya "' + w.state + '". Aktifkan di tab Actions.', true);
            if (canPush) return say('✓ Tersambung sebagai ' + me + '. Jalur: langsung (token punya hak tulis di repo ini).');
            if (R.has_issues === false) return say('Akun ' + me + ' bukan pemilik repo ' + own + ' dan fitur Issues di repo itu mati. Aktifkan Issues di Settings → General.', true);
            say('✓ Tersambung sebagai ' + me + ' (pemilik repo: ' + own + '). Jalur: issue. Pastikan variabel repo AM_USERS berisi: ' + me + ' dan token berjenis klasik dengan centang public_repo.');
          } catch (e) { say(e.message, true); }
        } }),
        h('button', { class: 'btn ghost', text: 'Hapus', onclick: () => { cfgSet(null); finish(); } }),
        h('button', { class: 'btn primary', text: 'Simpan', onclick: () => {
          const c = read(); if (!c.repo || !c.token) return say('Nama repo (username/nama-repo) dan token harus diisi', true);
          cfgSet(c); ML.toast('Server GitHub disimpan'); finish();
        } })));
  });
}

ML.amGh = { ready, fetch: fetchPkg, settings, _normRepo: normRepo };
})();
