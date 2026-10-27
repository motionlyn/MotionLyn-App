'use strict';
/* 29-save-dir.js — folder simpan hasil unduhan/ekspor (v0.5.1).
   App (APK)  : Download/MotionLynApp  (ditulis oleh kode native Android).
   Web        : Download/MotionLynWeb. Halaman web tidak boleh membuat subfolder lewat unduhan biasa, jadi:
                - browser dengan File System Access API (Chrome/Edge desktop): pengguna memilih folder induk SEKALI
                  (mis. Download); file ditulis ke <induk>/MotionLynWeb/.
                - browser lain (Chrome Android, Safari, Firefox): unduhan biasa ke folder Download bawaan;
                  nama file tetap diawali "MotionLyn…" agar mudah dicari. */
(function () {
if (!window.ML || ML.saveDir) return;
const SUB = ML.isApp ? 'MotionLynApp' : 'MotionLynWeb';
const supported = !ML.isApp && typeof window.showDirectoryPicker === 'function';
const DB = 'ml-fs', ST = 'h', KEY = 'dir';
const idb = () => new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(ST); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const idbGet = async () => { const d = await idb(); return new Promise(res => { const q = d.transaction(ST).objectStore(ST).get(KEY); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); }); };
const idbSet = async v => { const d = await idb(); return new Promise((res, rej) => { const t = d.transaction(ST, 'readwrite'); if (v) t.objectStore(ST).put(v, KEY); else t.objectStore(ST).delete(KEY); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); };
let cache = null, loaded = false;
async function handle() { if (!loaded) { try { cache = await idbGet(); } catch (e) { cache = null; } loaded = true; } return cache; }
async function perm(h, ask) {
  try { let p = await h.queryPermission({ mode: 'readwrite' }); if (p !== 'granted' && ask) p = await h.requestPermission({ mode: 'readwrite' }); return p === 'granted'; }
  catch (e) { return false; }
}
/** pilih folder induk (harus dipanggil dari tap pengguna) */
async function pick() {
  let h;
  try { h = await window.showDirectoryPicker({ id: 'motionlyn', mode: 'readwrite', startIn: 'downloads' }); }
  catch (e) {
    if (e && e.name === 'AbortError') throw Object.assign(new Error('dibatalkan'), { cancel: true });
    throw new Error('Folder ini tidak bisa dipakai browser (mungkin folder sistem). Pilih folder lain, mis. buat folder baru di Download.');
  }
  if (!(await perm(h, true))) throw new Error('Izin menulis ke folder ditolak');
  cache = h; loaded = true; await idbSet(h); return h;
}
async function clear() { cache = null; loaded = true; try { await idbSet(null); } catch (e) { /* abaikan */ } }
/** tulis ke <folder induk>/MotionLynWeb/<nama>. Kembalian: teks lokasi, atau null (belum diatur / izin habis / gagal) -> pemanggil memakai unduhan biasa */
async function write(blob, name) {
  if (!supported) return null;
  const h = await handle(); if (!h) return null;
  if (!(await perm(h, false))) return null;
  try {
    const dir = await h.getDirectoryHandle(SUB, { create: true });
    const w = await (await dir.getFileHandle(name, { create: true })).createWritable();
    await w.write(blob); await w.close();
    return (h.name || '…') + '/' + SUB + '/' + name;
  } catch (e) { return null; }
}
ML.saveDir = { SUB, supported, pick, clear, write, handle, path: () => 'Download/' + SUB };
})();
