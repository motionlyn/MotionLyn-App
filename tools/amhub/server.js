const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const AdmZip = require('./zip-helper');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.wave': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.xml': 'application/xml',
  '.zip': 'application/zip'
};

function parseShareIds(input) {
  if (!input) return null;
  const trimmed = input.trim();
  
  // Match standard share URL: .../u/{uid}/p/{pid}
  const match = trimmed.match(/\/u\/([^\/\?#]+)\/p\/([^\/\?#]+)/);
  if (match) {
    return { uid: match[1], pid: match[2] };
  }
  
  // Match direct uid:pid format
  if (trimmed.includes(':') && !trimmed.startsWith('http')) {
    const parts = trimmed.split(':');
    return { uid: parts[0].trim(), pid: parts[1].trim() };
  }
  
  return null;
}

// In-memory cache for package downloads (buffer cache with TTL)
const packageBufferCache = new Map();
const mediaBufferCache = new Map();

// Relocate MP4 moov atom before mdat for instant web/mobile streaming playback (faststart)
function faststartMp4(data) {
  try {
    if (!Buffer.isBuffer(data) || data.length < 32) return data;
    let pos = 0;
    let moovPos = -1;
    let moovLen = 0;
    let mdatPos = -1;

    while (pos + 8 <= data.length) {
      const size = data.readUInt32BE(pos);
      const type = data.toString('ascii', pos + 4, pos + 8);
      const actualSize = (size === 0) ? (data.length - pos) : (size === 1 ? Number(data.readBigUInt64BE(pos + 8)) : size);

      if (actualSize <= 0 || pos + actualSize > data.length) break;

      if (type === 'moov') {
        moovPos = pos;
        moovLen = actualSize;
      } else if (type === 'mdat' && mdatPos === -1) {
        mdatPos = pos;
      }
      pos += actualSize;
    }

    if (moovPos === -1 || mdatPos === -1 || moovPos < mdatPos) {
      return data;
    }

    const moovBox = Buffer.from(data.subarray(moovPos, moovPos + moovLen));

    // Update 32-bit chunk offsets (stco)
    let p = 0;
    while (p + 4 <= moovBox.length) {
      const idx = moovBox.indexOf(Buffer.from('stco'), p);
      if (idx === -1 || idx + 12 > moovBox.length) break;
      const entryCount = moovBox.readUInt32BE(idx + 8);
      let cur = idx + 12;
      for (let i = 0; i < entryCount && cur + 4 <= moovBox.length; i++) {
        const oldOff = moovBox.readUInt32BE(cur);
        moovBox.writeUInt32BE(oldOff + moovLen, cur);
        cur += 4;
      }
      p = idx + 4;
    }

    // Update 64-bit chunk offsets (co64)
    p = 0;
    while (p + 4 <= moovBox.length) {
      const idx = moovBox.indexOf(Buffer.from('co64'), p);
      if (idx === -1 || idx + 12 > moovBox.length) break;
      const entryCount = moovBox.readUInt32BE(idx + 8);
      let cur = idx + 12;
      for (let i = 0; i < entryCount && cur + 8 <= moovBox.length; i++) {
        const oldOff = moovBox.readBigUInt64BE(cur);
        moovBox.writeBigUInt64BE(oldOff + BigInt(moovLen), cur);
        cur += 8;
      }
      p = idx + 4;
    }

    const headerBeforeMdat = data.subarray(0, mdatPos);
    const mdatAndBetween = data.subarray(mdatPos, moovPos);
    const rest = data.subarray(moovPos + moovLen);

    return Buffer.concat([headerBeforeMdat, moovBox, mdatAndBetween, rest]);
  } catch (e) {
    console.error('Faststart relink notice:', e.message);
    return data;
  }
}

async function getProjectZipBuffer(uid, pid) {
  const cacheKey = `${uid}:${pid}`;
  const cached = packageBufferCache.get(cacheKey);
  if (cached && Date.now() - cached.time < 600000) { // 10 min cache
    return cached.buffer;
  }

  // 1. Fetch metadata for projectfiles.zip to retrieve downloadToken
  const storagePath = `share/u/${uid}/p/${pid}/projectfiles.zip`;
  const metaUrl = `https://firebasestorage.googleapis.com/v0/b/alight-creative.appspot.com/o/${encodeURIComponent(storagePath)}`;
  const metaRes = await fetch(metaUrl);
  if (!metaRes.ok) {
    throw new Error(`Project package file not found (HTTP ${metaRes.status})`);
  }
  const metaJson = await metaRes.json();
  const token = metaJson.downloadTokens;
  if (!token) {
    throw new Error('No download token available for project package');
  }

  // 2. Fetch the actual zip bytes
  const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/alight-creative.appspot.com/o/${encodeURIComponent(storagePath)}?alt=media&token=${token}`;
  const zipRes = await fetch(downloadUrl);
  if (!zipRes.ok) {
    throw new Error(`Failed to download project zip (HTTP ${zipRes.status})`);
  }

  const arrayBuffer = await zipRes.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  packageBufferCache.set(cacheKey, { buffer, time: Date.now() });
  return buffer;
}

async function fetchProjectData(uid, pid) {
  // 1. Fetch Cloud Function getProjectMetadata
  let metaResult = null;
  let metaError = null;
  try {
    const res = await fetch('https://us-central1-alight-creative.cloudfunctions.net/getProjectMetadata', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { uid, pid } })
    });
    if (res.ok) {
      metaResult = await res.json();
    } else {
      metaError = `Metadata HTTP ${res.status}`;
    }
  } catch (err) {
    metaError = err.message;
  }

  // 2. Fetch HTML share page for OG tags and import URL
  let htmlInfo = {};
  try {
    const shareUrl = `https://alightcreative.com/am/share/u/${encodeURIComponent(uid)}/p/${encodeURIComponent(pid)}`;
    const pageRes = await fetch(shareUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36'
      }
    });
    if (pageRes.ok) {
      const html = await pageRes.text();
      const getMeta = (prop) => {
        const m = html.match(new RegExp(`<meta property="${prop}" content="([^"]*)"`));
        return m ? m[1] : null;
      };
      const titleMatch = html.match(/<title>([^<]*)<\/title>/);
      
      htmlInfo = {
        title: titleMatch ? titleMatch[1] : null,
        ogTitle: getMeta('og:title'),
        ogDescription: getMeta('og:description'),
        ogImage: getMeta('og:image'),
        ogUrl: getMeta('og:url'),
        importUrl: shareUrl
      };
    }
  } catch (err) {
    console.error('HTML fetch error:', err.message);
  }

  // 3. Check projectfiles.zip download token from Firebase Storage
  let packageDownloadUrl = null;
  try {
    const storagePath = `share/u/${uid}/p/${pid}/projectfiles.zip`;
    const metaUrl = `https://firebasestorage.googleapis.com/v0/b/alight-creative.appspot.com/o/${encodeURIComponent(storagePath)}`;
    const metaRes = await fetch(metaUrl);
    if (metaRes.ok) {
      const metaJson = await metaRes.json();
      if (metaJson.downloadTokens) {
        packageDownloadUrl = `/api/download-package?uid=${encodeURIComponent(uid)}&pid=${encodeURIComponent(pid)}`;
      }
    }
  } catch (err) {
    console.error('Package token error:', err.message);
  }

  const info = metaResult?.result?.info || {};
  const downloadPolicy = metaResult?.result?.download || null;
  const message = metaResult?.result?.message || null;
  const freeUserMaxDownloadSize = metaResult?.result?.freeUserMaxDownloadSize || 5242880;

  // Build deep link for Android intent
  const intentUri = `intent://alightcreative.com/am/share/u/${uid}/p/${pid}#Intent;scheme=https;package=com.alightcreative.motion;end`;

  // Gather media files from metadata or fallback to reading projectfiles.zip entries
  let rawMediaList = Array.isArray(info.mediaFiles) ? [...info.mediaFiles] : [];

  // Reconcile media files with projectfiles.zip and XML scene metadata
  if (packageDownloadUrl) {
    try {
      const zipBuf = await getProjectZipBuffer(uid, pid);
      const entries = AdmZip.readZipEntries(zipBuf);

      // Extract metadata from XML scene <media> tags (gives accurate durations, sizes, and formats)
      const xmlMediaMap = new Map();
      for (const entry of entries) {
        if (entry.fileName.endsWith('.xml')) {
          try {
            const xmlStr = AdmZip.extractEntryData(zipBuf, entry).toString('utf8');
            const mediaMatches = xmlStr.matchAll(/<media\s+([^>]+)\/?>/gi);
            for (const m of mediaMatches) {
              const attrs = m[1];
              const fnMatch = attrs.match(/filename="([^"]+)"/) || attrs.match(/uri="amproj:([^"]+)"/);
              const durMatch = attrs.match(/duration="(\d+)"/);
              const sizeMatch = attrs.match(/size="(\d+)"/);
              const typeMatch = attrs.match(/type="([^"]+)"/);
              if (fnMatch) {
                const fn = fnMatch[1];
                const durUs = durMatch ? parseInt(durMatch[1], 10) : null;
                xmlMediaMap.set(fn, {
                  durationSec: durUs ? (durUs / 1000000).toFixed(1) : null,
                  size: sizeMatch ? parseInt(sizeMatch[1], 10) : null,
                  mime: typeMatch ? typeMatch[1] : null
                });
              }
            }
          } catch (xe) {}
        }
      }

      // Merge all media and audio files found inside the zip archive
      for (const entry of entries) {
        const lowerName = entry.fileName.toLowerCase();
        if (lowerName.endsWith('.xml') || lowerName.endsWith('manifest.txt')) continue;
        const baseName = path.basename(entry.fileName);
        const ext = path.extname(lowerName);
        const isVid = ext === '.mp4' || ext === '.webm' || ext === '.mov';
        const isPic = ext === '.png' || ext === '.jpg' || ext === '.jpeg' || ext === '.webp';
        const isAud = ext === '.wav' || ext === '.wave' || ext === '.m4a' || ext === '.mp3' || ext === '.ogg' || ext === '.aac' || ext === '.flac';

        if (isVid || isPic || isAud) {
          const existing = rawMediaList.find(m => m.fileName === baseName || m.fileName === entry.fileName);
          const xmlMeta = xmlMediaMap.get(baseName) || xmlMediaMap.get(entry.fileName) || {};
          const uncompSize = entry.uncompSize || entry.compSize || xmlMeta.size || 0;

          if (existing) {
            // Enrich existing item with zip/xml size and duration if missing
            if (!existing.size || existing.size === 0) existing.size = uncompSize;
            if (xmlMeta.durationSec && (!existing.video?.duration && !existing.audio?.duration)) {
              if (isAud) {
                existing.audio = existing.audio || {};
                existing.audio.duration = parseFloat(xmlMeta.durationSec);
              }
            }
          } else {
            // Add missing media file (such as .wav audio) from zip package
            rawMediaList.push({
              fileName: baseName,
              mime: xmlMeta.mime || MIME_TYPES[ext] || 'application/octet-stream',
              size: uncompSize,
              video: isVid ? { size: uncompSize, duration: xmlMeta.durationSec ? parseFloat(xmlMeta.durationSec) : null } : null,
              image: isPic ? { size: uncompSize } : null,
              audio: isAud ? { size: uncompSize, duration: xmlMeta.durationSec ? parseFloat(xmlMeta.durationSec) : null, codec: ext.replace('.', '').toUpperCase() } : null
            });
          }
        }
      }
    } catch (e) {
      console.error('Zip & XML media merge error:', e.message);
    }
  }

  // Check if there is a primary video file
  const videoFile = rawMediaList.find(m => m.video || (m.fileName && (m.fileName.endsWith('.mp4') || m.fileName.endsWith('.webm'))));
  const videoStreamUrl = videoFile ? `/api/stream-media?uid=${encodeURIComponent(uid)}&pid=${encodeURIComponent(pid)}&file=${encodeURIComponent(videoFile.fileName)}` : null;
  const videoDownloadUrl = videoFile ? `/api/download-media?uid=${encodeURIComponent(uid)}&pid=${encodeURIComponent(pid)}&file=${encodeURIComponent(videoFile.fileName)}` : null;

  // Process all media files with full audio, video, image categorization & metadata
  const mediaFiles = rawMediaList.map(m => {
    const ext = path.extname(m.fileName || '').toLowerCase();
    const isVideo = !!m.video || ext === '.mp4' || ext === '.webm' || ext === '.mov';
    const isImg = !!m.image || ext === '.png' || ext === '.jpg' || ext === '.jpeg' || ext === '.webp' || ext === '.gif';
    const isAudio = !!m.audio || ext === '.wav' || ext === '.wave' || ext === '.m4a' || ext === '.mp3' || ext === '.ogg' || ext === '.aac' || ext === '.flac';

    const size = m.video?.size || m.image?.size || m.audio?.size || m.size || 0;
    const type = isVideo ? 'video' : (isImg ? 'image' : (isAudio ? 'audio' : 'file'));
    const downloadUrl = `/api/download-media?uid=${encodeURIComponent(uid)}&pid=${encodeURIComponent(pid)}&file=${encodeURIComponent(m.fileName)}`;
    const streamUrl = `/api/stream-media?uid=${encodeURIComponent(uid)}&pid=${encodeURIComponent(pid)}&file=${encodeURIComponent(m.fileName)}`;
    const previewUrl = (isVideo || isAudio || isImg) ? streamUrl : null;

    let details = null;
    if (isVideo && m.video) {
      details = {
        codec: (m.video.codec || 'H.264').toUpperCase(),
        width: m.video.width,
        height: m.video.height,
        fps: Math.round(m.video.fps || 0),
        duration: m.video.duration ? `${m.video.duration}s` : null,
        bitrate: m.video.bitRate ? `${Math.round(m.video.bitRate / 1000)} kbps` : null
      };
    } else if (isImg && m.image) {
      details = {
        width: m.image.width,
        height: m.image.height
      };
    } else if (isAudio) {
      const durSec = m.audio?.duration ? (typeof m.audio.duration === 'number' ? `${m.audio.duration.toFixed(1)}s` : `${m.audio.duration}`) : null;
      details = {
        codec: (m.audio?.codec || ext.replace('.', '')).toUpperCase(),
        duration: durSec,
        bitrate: m.audio?.bitRate ? `${Math.round(m.audio.bitRate / 1000)} kbps` : null
      };
    }

    return {
      fileName: m.fileName,
      mime: m.mime || MIME_TYPES[ext] || 'application/octet-stream',
      hash: m.hash || null,
      size,
      sizeFormatted: formatBytes(size),
      type,
      downloadUrl,
      previewUrl,
      details
    };
  });

  // Check if there is an audio track
  const audioFile = mediaFiles.find(m => m.type === 'audio');
  const audioStreamUrl = audioFile ? audioFile.previewUrl : null;

  return {
    ok: true,
    uid,
    pid,
    shareUrl: `https://alightcreative.com/am/share/u/${uid}/p/${pid}`,
    intentUri,
    title: info.title || htmlInfo.ogTitle || 'Untitled Project',
    packageSize: info.size || 0,
    packageSizeFormatted: formatBytes(info.size || 0),
    shareDate: info.shareDate?._seconds ? new Date(info.shareDate._seconds * 1000).toISOString() : null,
    downloadsCount: info.downloads || 0,
    platform: info.amPlatform || 'Android/iOS',
    appVersion: info.amVersionString || info.amPackageVersion || 'Latest',
    downloadPolicy: {
      status: downloadPolicy,
      message,
      isFreeEligible: (info.size || 0) <= freeUserMaxDownloadSize,
      maxFreeSize: freeUserMaxDownloadSize,
      maxFreeSizeFormatted: formatBytes(freeUserMaxDownloadSize)
    },
    packageDownloadUrl, // Direct full ZIP download
    videoStreamUrl,     // Direct HTML5 Video Player stream URL
    videoDownloadUrl,   // Direct MP4 attachment download URL
    hasVideo: !!videoFile,
    videoDetails: videoFile?.video ? {
      fileName: videoFile.fileName,
      width: videoFile.video.width,
      height: videoFile.video.height,
      fps: Math.round(videoFile.video.fps || 0),
      duration: videoFile.video.duration ? `${videoFile.video.duration.toFixed(1)}s` : null,
      codec: (videoFile.video.codec || 'H.264').toUpperCase(),
      bitrate: videoFile.video.bitRate ? `${Math.round(videoFile.video.bitRate / 1000)} kbps` : null,
      sizeFormatted: formatBytes(videoFile.video.size || 0)
    } : null,
    hasAudio: !!audioFile,
    audioStreamUrl,
    audioDetails: audioFile ? {
      fileName: audioFile.fileName,
      sizeFormatted: audioFile.sizeFormatted,
      details: audioFile.details
    } : null,
    scenes: (info.projects || []).map((p, idx) => ({
      title: p.title,
      type: p.type || 'scene',
      size: p.size,
      sizeFormatted: formatBytes(p.size),
      downloadUrl: `/api/download-media?uid=${encodeURIComponent(uid)}&pid=${encodeURIComponent(pid)}&sceneIndex=${idx}&ext=.xml`
    })),
    mediaFiles,
    requiredEffects: (info.requiredEffects || []).map(e => ({
      raw: e,
      name: e.replace('com.alightcreative.effects.', '').replace('com.alightcreative.internal.', '')
    })),
    thumbnails: {
      tiny: info.tinyThumbUrl || null,
      small: info.smallThumbUrl || htmlInfo.ogImage || null,
      medium: info.medThumbUrl || null,
      large: info.largeThumbUrl || null
    },
    rawMetadata: metaResult?.result || null
  };
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Disposition');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // API: Inspect
  if (pathname === '/api/inspect' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        let uid = payload.uid;
        let pid = payload.pid;

        if ((!uid || !pid) && payload.url) {
          const parsed = parseShareIds(payload.url);
          if (parsed) {
            uid = parsed.uid;
            pid = parsed.pid;
          }
        }

        if (!uid || !pid) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            ok: false,
            error: 'Invalid URL or ID format. Expected an Alight Motion share link containing /u/{uid}/p/{pid}'
          }));
          return;
        }

        const data = await fetchProjectData(uid, pid);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      } catch (err) {
        console.error('Inspect API error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  // API: Get XML string for live in-browser preview / copying
  if (pathname === '/api/get-xml' && (req.method === 'GET' || req.method === 'HEAD')) {
    const { uid, pid, sceneIndex } = parsedUrl.query;
    if (!uid || !pid) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing uid or pid' }));
      return;
    }
    try {
      const zipBuffer = await getProjectZipBuffer(uid, pid);
      const entries = AdmZip.readZipEntries(zipBuffer);
      const xmlEntries = entries.filter(e => e.fileName.endsWith('.xml'));
      const idx = parseInt(sceneIndex || '0', 10);
      const target = xmlEntries[idx] || xmlEntries[0];

      if (!target) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'No XML scene found in package' }));
        return;
      }

      const xmlBytes = AdmZip.extractEntryData(zipBuffer, target);
      const xmlString = xmlBytes.toString('utf8');

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        fileName: path.basename(target.fileName),
        xml: xmlString,
        scenesCount: xmlEntries.length,
        size: xmlBytes.length
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // API: Video & Media Streaming with HTTP 206 Partial Content support
  if ((pathname === '/api/stream-media' || pathname === '/api/download-media') && (req.method === 'GET' || req.method === 'HEAD')) {
    const { uid, pid, file, sceneIndex } = parsedUrl.query;
    if (!uid || !pid) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Missing uid or pid');
      return;
    }

    try {
      const zipBuffer = await getProjectZipBuffer(uid, pid);
      const entries = AdmZip.readZipEntries(zipBuffer);

      let targetEntry = null;

      if (file) {
        targetEntry = entries.find(e => e.fileName === file || e.fileName.endsWith('/' + file));
      } else if (sceneIndex !== undefined) {
        const xmlEntries = entries.filter(e => e.fileName.endsWith('.xml'));
        const idx = parseInt(sceneIndex, 10);
        targetEntry = xmlEntries[idx] || xmlEntries[0];
      } else {
        // Default to first video or media
        targetEntry = entries.find(e => e.fileName.endsWith('.mp4')) || entries[0];
      }

      if (!targetEntry) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end(`File "${file || 'asset'}" not found in project archive`);
        return;
      }

      const ext = path.extname(targetEntry.fileName).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      const safeName = path.basename(targetEntry.fileName);

      // Fast, cached buffer extraction with automatic MP4 faststart for instant streaming
      const cacheKey = `${uid}:${pid}:${targetEntry.fileName}`;
      let fileData = mediaBufferCache.get(cacheKey);
      if (!fileData) {
        fileData = AdmZip.extractEntryData(zipBuffer, targetEntry);
        if (ext === '.mp4') {
          fileData = faststartMp4(fileData);
        }
        if (fileData.length < 80 * 1024 * 1024) {
          mediaBufferCache.set(cacheKey, fileData);
          if (mediaBufferCache.size > 20) {
            const firstKey = mediaBufferCache.keys().next().value;
            mediaBufferCache.delete(firstKey);
          }
        }
      }

      const totalSize = fileData.length;

      // Handle HTTP Range Requests for video player seeking (RFC 7233 compliant)
      const range = req.headers.range;
      if (range && range.startsWith('bytes=')) {
        const rangeSpec = range.replace(/bytes=/, '').trim();
        let start, end;

        if (rangeSpec.startsWith('-')) {
          // Suffix byte range: e.g. -500 (last 500 bytes)
          const suffix = parseInt(rangeSpec.substring(1), 10);
          if (isNaN(suffix) || suffix <= 0) {
            res.writeHead(416, { 'Content-Range': `bytes */${totalSize}` });
            res.end();
            return;
          }
          start = Math.max(0, totalSize - suffix);
          end = totalSize - 1;
        } else {
          const parts = rangeSpec.split('-');
          start = parseInt(parts[0], 10);
          end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;

          if (isNaN(start) || start < 0) start = 0;
          if (isNaN(end) || end >= totalSize) end = totalSize - 1;
        }

        if (start > end || start >= totalSize) {
          res.writeHead(416, {
            'Content-Range': `bytes */${totalSize}`,
            'Content-Type': 'text/plain'
          });
          res.end('Requested range not satisfiable');
          return;
        }

        const chunkSize = (end - start) + 1;
        const slice = fileData.subarray(start, end + 1);

        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${totalSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize,
          'Content-Type': contentType,
          'Content-Disposition': pathname === '/api/download-media' ? `attachment; filename="${encodeURIComponent(safeName)}"` : 'inline'
        });
        if (req.method === 'HEAD') {
          res.end();
        } else {
          res.end(slice);
        }
        return;
      }

      // Full response (200 OK)
      res.writeHead(200, {
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Content-Disposition': pathname === '/api/download-media' ? `attachment; filename="${encodeURIComponent(safeName)}"` : 'inline',
        'Content-Length': totalSize
      });
      if (req.method === 'HEAD') {
        res.end();
      } else {
        res.end(fileData);
      }
    } catch (err) {
      console.error('Stream/Download media error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // API: Download Full Package ZIP
  if (pathname === '/api/download-package' && (req.method === 'GET' || req.method === 'HEAD')) {
    const { uid, pid } = parsedUrl.query;
    if (!uid || !pid) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Missing uid or pid');
      return;
    }
    try {
      const zipBuffer = await getProjectZipBuffer(uid, pid);
      res.writeHead(200, {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="alight-motion-${pid}.zip"`,
        'Content-Length': zipBuffer.length
      });
      res.end(zipBuffer);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // API: Sample data
  if (pathname === '/api/sample' && req.method === 'GET') {
    try {
      const data = await fetchProjectData('tqgrSWDSUAgKiJswywf7UqFNmyS2', 'VTbVKb5F6c-3b25a2ace9f41581');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
    return;
  }

  // Serve static files from public/
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      filePath = path.join(PUBLIC_DIR, 'index.html');
    }
    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
        return;
      }
      const contentType = MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    });
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Alight Motion Project Web App running at http://localhost:${PORT}`);
});
