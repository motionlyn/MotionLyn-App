'use strict';
/* Penyimpanan lokal (IndexedDB): proyek + media (foto/audio/video) */
const idbApi = (() => {
  let dbp;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open('motionlyn', 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore('projects', { keyPath: 'id' });
      const m = d.createObjectStore('media', { keyPath: 'key' });
      m.createIndex('pid', 'pid');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
  const run = async (store, mode, fn) => {
    const d = await open();
    return new Promise((res, rej) => {
      const t = d.transaction(store, mode), s = t.objectStore(store);
      let out; const rq = fn(s); if (rq) rq.onsuccess = () => { out = rq.result; };
      t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    });
  };
  return {
    putProject: p => run('projects', 'readwrite', s => s.put(p)),
    getProject: id => run('projects', 'readonly', s => s.get(id)),
    allProjects: () => run('projects', 'readonly', s => s.getAll()),
    putMedia: rec => run('media', 'readwrite', s => s.put(Object.assign({}, rec, { key: rec.pid + '/' + rec.id }))),
    getMedia: (pid, id) => run('media', 'readonly', s => s.get(pid + '/' + id)),
    setPeaks: (pid, id, peaks, lv) => run('media', 'readwrite', s => { const g = s.get(pid + '/' + id); g.onsuccess = () => { const r = g.result; if (r) { r.peaks = peaks; r.peaksLv = lv || 1; s.put(r); } }; return g; }),
    mediaOf: pid => run('media', 'readonly', s => s.index('pid').getAll(pid)),
    async delProject(id) {
      await run('projects', 'readwrite', s => s.delete(id));
      const d = await open();
      await new Promise((res, rej) => {
        const t = d.transaction('media', 'readwrite'), s = t.objectStore('media');
        const rq = s.index('pid').openKeyCursor(IDBKeyRange.only(id));
        rq.onsuccess = () => { const c = rq.result; if (c) { s.delete(c.primaryKey); c.continue(); } };
        t.oncomplete = res; t.onerror = () => rej(t.error);
      });
    }
  };
})();

/* Cadangan: bila IndexedDB tidak tersedia (mis. mode privat/sandbox), data disimpan di memori selama halaman terbuka. */
const memApi = (() => {
  const P = new Map(), M = new Map(), cl = o => JSON.parse(JSON.stringify(o));
  return {
    async putProject(p) { P.set(p.id, cl(p)); },
    async getProject(id) { return P.has(id) ? cl(P.get(id)) : undefined; },
    async allProjects() { return [...P.values()].map(cl); },
    async putMedia(rec) { M.set(rec.pid + '/' + rec.id, Object.assign({}, rec, { key: rec.pid + '/' + rec.id })); },
    async getMedia(pid, id) { return M.get(pid + '/' + id); },
    async setPeaks(pid, id, peaks, lv) { const r = M.get(pid + '/' + id); if (r) { r.peaks = peaks; r.peaksLv = lv || 1; } },
    async mediaOf(pid) { return [...M.values()].filter(m => m.pid === pid); },
    async delProject(id) { P.delete(id); [...M.keys()].forEach(k => { if (M.get(k).pid === id) M.delete(k); }); }
  };
})();
let useMem = null;
async function pickApi() {
  if (useMem === null) {
    try { await idbApi.allProjects(); useMem = false; }
    catch (e) { useMem = true; if (ML.toast) ML.toast('Penyimpanan browser tidak tersedia: proyek hanya bertahan selama halaman ini terbuka. Ekspor .ml untuk menyimpan.', 6000); }
  }
  return useMem ? memApi : idbApi;
}
ML.db = {};
['putProject', 'getProject', 'allProjects', 'putMedia', 'getMedia', 'setPeaks', 'mediaOf', 'delProject'].forEach(n => { ML.db[n] = async (...a) => (await pickApi())[n](...a); });

