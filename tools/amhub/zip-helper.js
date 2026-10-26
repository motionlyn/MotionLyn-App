const zlib = require('zlib');

function readZipEntries(buf) {
  let eocdOffset = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) {
    throw new Error('Not a valid zip archive (EOCD missing)');
  }

  const totalEntries = buf.readUInt16LE(eocdOffset + 10);
  const cdOffset = buf.readUInt32LE(eocdOffset + 16);

  const entries = [];
  let cur = cdOffset;
  for (let i = 0; i < totalEntries; i++) {
    if (cur + 46 > buf.length) break;
    const sig = buf.readUInt32LE(cur);
    if (sig !== 0x02014b50) break;

    const method = buf.readUInt16LE(cur + 10);
    const compSize = buf.readUInt32LE(cur + 20);
    const uncompSize = buf.readUInt32LE(cur + 24);
    const nameLen = buf.readUInt16LE(cur + 28);
    const extraLen = buf.readUInt16LE(cur + 30);
    const commentLen = buf.readUInt16LE(cur + 32);
    const localHeaderOffset = buf.readUInt32LE(cur + 42);
    const fileName = buf.toString('utf8', cur + 46, cur + 46 + nameLen);

    if (localHeaderOffset + 30 <= buf.length) {
      const localNameLen = buf.readUInt16LE(localHeaderOffset + 26);
      const localExtraLen = buf.readUInt16LE(localHeaderOffset + 28);
      const dataOffset = localHeaderOffset + 30 + localNameLen + localExtraLen;

      entries.push({
        fileName,
        method,
        compSize,
        uncompSize,
        dataOffset
      });
    }

    cur += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function extractEntryData(buf, entry) {
  const rawData = buf.subarray(entry.dataOffset, entry.dataOffset + entry.compSize);
  if (entry.method === 0) {
    return rawData; // Store (uncompressed)
  } else if (entry.method === 8) {
    return zlib.inflateRawSync(rawData); // Deflate
  } else {
    throw new Error(`Unsupported compression method ${entry.method}`);
  }
}

module.exports = {
  readZipEntries,
  extractEntryData
};
