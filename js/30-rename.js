'use strict';
/* 30-rename.js — SEMUA aturan nama file MotionLyn ada di sini (web & app memakai file yang sama).
   Untuk mengganti awalan / pola / panjang kode, cukup ubah CONFIG di bawah.

   Pola:  <Awalan>-<NAMA>[<kode_acak>].<ekstensi>
     MotionLynV-NAMA_PROYEK[kode].mp4      video hasil ekspor (juga .webm)
     MotionLynML-NAMA_PROYEK[kode].ml      proyek MotionLyn (untuk dibagikan)
     MotionLynXML-NAMA_PROYEK[kode].xml    XML (Alight Motion & MotionLyn); bila dibungkus: .zip
     MotionLynPNG-… .png   MotionLynJPG-… .jpg   MotionLynGIF-… .gif
     MotionLynUGP-NAMA_PROYEK[kode].zip    urutan gambar PNG
     MotionLyn AIO-NAMA_ATAU_CAPTION[kode].mp3 / .mp4 / .png    downloader AIO

   API:
     ML.rename.make(nama, ext, tag)   -> nama file lengkap   (tag boleh kosong: ditebak dari ekstensi; 'AIO', 'UGP', 'XML', dst.)
     ML.exportFileName(proj, ext, tag)-> sama, memakai proj.name (dipertahankan agar kode lama tetap jalan)
     ML.rename.clean(teks, {caption})-> bagian NAMA yang aman untuk nama file
     ML.rename.parse(namaFile)        -> { prefix, tag, name, code, ext } atau null bila bukan nama MotionLyn
     ML.rename.stem(namaFile)         -> nama "bersih" tanpa awalan/kode/ekstensi (dipakai untuk nama layer/proyek saat impor)
     ML.rename.code()                 -> kode acak baru
   Dimuat setelah 01-core.js (butuh ML saja). */
(function () {
if (!window.ML) return;

const CONFIG = {
  brand: 'MotionLyn',
  aioLabel: 'MotionLyn AIO',              // awalan khusus downloader AIO (pakai spasi)
  sep: '-',                               // pemisah awalan dan nama
  codeLen: 6,                             // panjang kode acak
  codeAlphabet: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', // tanpa huruf/angka yang mirip (I, O, 0, 1)
  maxName: 60,                            // maksimum karakter bagian NAMA (emoji dihitung 1)
  fallbackName: 'Proyek',                 // dipakai bila nama kosong
  aioFallbackName: 'Media',               // idem, untuk AIO
  tags: { mp4: 'V', webm: 'V', mov: 'V', m4v: 'V', png: 'PNG', jpg: 'JPG', jpeg: 'JPG', ml: 'ML', xml: 'XML', gif: 'GIF' } // ekstensi -> kode jenis
};

const code = () => {
  const A = CONFIG.codeAlphabet, n = CONFIG.codeLen, r = new Uint8Array(n);
  try { crypto.getRandomValues(r); } catch (e) { for (let i = 0; i < n; i++) r[i] = Math.floor(Math.random() * 256); }
  return Array.from(r, b => A[b % A.length]).join('');
};

/** bagian NAMA yang aman: tanpa karakter terlarang, spasi -> "_", kurung siku -> kurung biasa (agar tidak bentrok dengan [kode]) */
function clean(raw, opt) {
  let s = String(raw == null ? '' : raw);
  if (opt && opt.caption) { // caption: ambil baris pertama yang berisi, buang link
    s = (s.split(/\r?\n/).map(x => x.trim()).find(Boolean) || '').replace(/https?:\/\/\S+/gi, ' ');
  }
  s = s.replace(/[\\/:*?"<>|\x00-\x1f]+/g, '_').replace(/\[/g, '(').replace(/\]/g, ')').replace(/\s+/g, '_').replace(/_{2,}/g, '_');
  const trim = t => t.replace(/^[._]+/, '').replace(/[._]+$/, '');
  s = trim(s);
  s = trim(Array.from(s).slice(0, CONFIG.maxName).join('')); // potong per karakter (emoji tidak terbelah)
  return s || (opt && opt.fallback) || CONFIG.fallbackName;
}

const extOf = ext => String(ext || '').toLowerCase().replace(/^\./, '');
const tagFor = (ext, tag) => String(tag || CONFIG.tags[extOf(ext)] || extOf(ext).toUpperCase()).toUpperCase();

/** nama file lengkap */
function make(name, ext, tag) {
  const E = extOf(ext), T = tagFor(E, tag), aio = T === 'AIO';
  const nm = clean(name, { caption: aio, fallback: aio ? CONFIG.aioFallbackName : CONFIG.fallbackName });
  return (aio ? CONFIG.aioLabel : CONFIG.brand + T) + CONFIG.sep + nm + '[' + code() + ']' + (E ? '.' + E : '');
}

/** kebalikannya: pecah nama file berpola MotionLyn */
const esc = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const RX = () => new RegExp('^(' + esc(CONFIG.aioLabel) + '|' + esc(CONFIG.brand) + '([A-Za-z]+))' + esc(CONFIG.sep) + '(.+?)\\[([A-Za-z0-9]{3,16})\\](?:\\.([A-Za-z0-9]{1,8}))?$', 'i');
function parse(fileName) {
  const m = String(fileName || '').trim().match(RX());
  if (!m) return null;
  return { prefix: m[1], tag: m[2] ? m[2].toUpperCase() : 'AIO', name: m[3], code: m[4], ext: (m[5] || '').toLowerCase() };
}
/** nama bersih untuk layer/proyek saat impor: "MotionLynPNG-Foto_Liburan[AB12CD].png" -> "Foto Liburan"; selain itu cukup buang ekstensi */
function stem(fileName) {
  const p = parse(fileName);
  return p ? p.name.replace(/_/g, ' ').trim() : String(fileName || '').replace(/\.[^.]+$/, '');
}

ML.rename = { config: CONFIG, make, clean, parse, stem, code, tagFor };
ML.exportCode = code;
ML.exportFileName = (proj, ext, tag) => make(proj && proj.name, ext, tag);
})();
