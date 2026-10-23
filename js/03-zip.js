'use strict';
/* Pembuat/pembaca ZIP (mode STORE) untuk format proyek .ml */
ML.zip = (() => {
  const T = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; T[n] = c >>> 0; }
  async function crcBlob(blob) {
    let c = 0xFFFFFFFF; const CH = 4 << 20;
    for (let i = 0; i < blob.size; i += CH) {
      const b = new Uint8Array(await blob.slice(i, i + CH).arrayBuffer());
      for (let j = 0; j < b.length; j++) c = T[(c ^ b[j]) & 255] ^ (c >>> 8);
    }
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  const enc = new TextEncoder();
  function u16(v, n) { v.push(n & 255, (n >> 8) & 255); }
  function u32(v, n) { v.push(n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255); }

  /** entries: [{name, blob}] atau [{name, text}] -> Blob */
  async function build(entries) {
    const parts = [], central = []; let off = 0;
    const d = new Date();
    const dt = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF;
    const dd = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
    for (const e of entries) {
      const blob = e.blob || new Blob([e.text], { type: 'text/plain' });
      const name = enc.encode(e.name), crc = await crcBlob(blob), size = blob.size;
      const lh = [];
      u32(lh, 0x04034b50); u16(lh, 20); u16(lh, 0x0800); u16(lh, 0); u16(lh, dt); u16(lh, dd);
      u32(lh, crc); u32(lh, size); u32(lh, size); u16(lh, name.length); u16(lh, 0);
      parts.push(new Uint8Array(lh), name, blob);
      const ch = [];
      u32(ch, 0x02014b50); u16(ch, 20); u16(ch, 20); u16(ch, 0x0800); u16(ch, 0); u16(ch, dt); u16(ch, dd);
      u32(ch, crc); u32(ch, size); u32(ch, size); u16(ch, name.length); u16(ch, 0); u16(ch, 0); u16(ch, 0); u16(ch, 0);
      u32(ch, 0); u32(ch, off);
      central.push(new Uint8Array(ch), name);
      off += lh.length + name.length + size;
    }
    let cdSize = 0; central.forEach(c => cdSize += c.length);
    const end = [];
    u32(end, 0x06054b50); u16(end, 0); u16(end, 0); u16(end, entries.length); u16(end, entries.length);
    u32(end, cdSize); u32(end, off); u16(end, 0);
    return new Blob([...parts, ...central, new Uint8Array(end)], { type: 'application/octet-stream' });
  }

  /** -> { names:[...], get(name) -> Promise<Blob> } */
  async function read(blob) {
    const tail = new DataView(await blob.slice(Math.max(0, blob.size - 66000)).arrayBuffer());
    let p = tail.byteLength - 22;
    while (p >= 0 && tail.getUint32(p, true) !== 0x06054b50) p--;
    if (p < 0) throw new Error('Bukan file .ml yang valid');
    const count = tail.getUint16(p + 10, true), cdSize = tail.getUint32(p + 12, true), cdOff = tail.getUint32(p + 16, true);
    const cd = new DataView(await blob.slice(cdOff, cdOff + cdSize).arrayBuffer());
    const dec = new TextDecoder(), files = {}; let q = 0;
    for (let i = 0; i < count; i++) {
      if (cd.getUint32(q, true) !== 0x02014b50) throw new Error('ZIP rusak');
      const method = cd.getUint16(q + 10, true), csize = cd.getUint32(q + 20, true);
      const nl = cd.getUint16(q + 28, true), el = cd.getUint16(q + 30, true), cl = cd.getUint16(q + 32, true), lo = cd.getUint32(q + 42, true);
      files[dec.decode(new Uint8Array(cd.buffer, q + 46, nl))] = { method, csize, lo };
      q += 46 + nl + el + cl;
    }
    return {
      names: Object.keys(files),
      async get(name) {
        const f = files[name]; if (!f) return null;
        const lh = new DataView(await blob.slice(f.lo, f.lo + 30).arrayBuffer());
        const start = f.lo + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
        const raw = blob.slice(start, start + f.csize);
        if (f.method === 0) return raw;
        if (f.method === 8 && window.DecompressionStream)
          return new Response(raw.stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob();
        throw new Error('Kompresi ZIP tidak didukung');
      }
    };
  }
  return { build, read };
})();

