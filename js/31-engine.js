'use strict';
/* 31-engine.js — pemuat mesin C++ (WebAssembly): engine/motionlyn_engine.wasm (sumber: native/engine.cpp).
   Dipakai untuk CRC-32 (ZIP/.ml/urutan gambar) dan encoder GIF. Bila file .wasm tidak ada atau gagal dimuat,
   semuanya otomatis memakai kode JS lama — aplikasi tetap jalan. ML.engine.ready = true bila mesin aktif. */
(function () {
if (!window.ML || ML.engine) return;
const E = ML.engine = { ready: false };
let X, mem;
const fn = n => X[n] || X['_' + n];
const view = (p, n) => new Uint8Array(mem.buffer, p, n); // selalu buat ulang: memori bisa tumbuh

E.crcBlob = async blob => {
  const CH = 4 << 20, p = fn('ml_alloc')(Math.min(CH, Math.max(blob.size, 1)));
  if (!p) throw new Error('memori mesin habis');
  try {
    let c = 0;
    for (let i = 0; i < blob.size; i += CH) {
      const b = new Uint8Array(await blob.slice(i, i + CH).arrayBuffer());
      view(p, b.length).set(b);
      c = fn('ml_crc32')(c, p, b.length) >>> 0;
    }
    return c >>> 0;
  } finally { fn('ml_free')(p); }
};

E.gif = (frames, W, H, delay, tr) => {
  const n = W * H * 4, p = fn('ml_alloc')(n);
  if (!p) throw new Error('memori mesin habis');
  try {
    fn('ml_gif_begin')(W, H, delay, tr ? 1 : 0);
    for (const f of frames) { view(p, n).set(f); fn('ml_gif_frame')(p); }
    fn('ml_gif_end')();
    const out = view(fn('ml_gif_data')(), fn('ml_gif_size')()).slice(); // salin keluar dari memori wasm
    return new Blob([out], { type: 'image/gif' });
  } finally { fn('ml_free')(p); fn('ml_gif_free')(); }
};

(async () => {
  try {
    const r = await fetch('engine/motionlyn_engine.wasm');
    if (!r.ok) return;
    const m = await WebAssembly.compile(await r.arrayBuffer()); // tanpa syarat MIME application/wasm
    const imp = {};
    for (const d of WebAssembly.Module.imports(m)) { if (!imp[d.module]) imp[d.module] = {}; if (d.kind === 'function') imp[d.module][d.name] = () => 0; }
    X = (await WebAssembly.instantiate(m, imp)).exports; mem = X.memory;
    if (X._initialize) X._initialize();
    const t = fn('ml_alloc')(9); view(t, 9).set([49, 50, 51, 52, 53, 54, 55, 56, 57]); // uji mandiri: CRC "123456789"
    const ok = (fn('ml_crc32')(0, t, 9) >>> 0) === 0xCBF43926; fn('ml_free')(t);
    if (ok) E.ready = true;
  } catch (e) { /* tetap memakai JS */ }
})();
})();
