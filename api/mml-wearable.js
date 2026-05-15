/**
 * Returns MML-ready wearable GLBs: accessory meshes with transforms relative to the
 * socket bone (per mml.io / Otherside — model origin attaches to socket).
 *
 * GET /api/mml-wearable?src=<encodeURIComponent(https://…glb)>&kind=hat|shirt|eyes
 */
const { bakeWearableGlbForMml } = require('../lib/mml-wearable-bake.cjs');

const BAKE_MS = 22000;
const BAKE_VERSION = '6';
const memCache = new Map();

function cacheKey(src, kind, raw) {
  return `${BAKE_VERSION}::${raw ? 'raw' : 'bake'}::${kind}::${src}`;
}

function truthyParam(v) {
  if (v == null || v === '') return false;
  const s = String(v).trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes';
}

async function bakeWithTimeout(buf, kind) {
  return Promise.race([
    bakeWearableGlbForMml(buf, kind),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Wearable bake timed out')), BAKE_MS);
    }),
  ]);
}

function getQueryParam(req, key) {
  const q = req.query && req.query[key];
  if (q != null && String(q).trim() !== '') return String(q).trim();
  try {
    const raw = String(req.url || '');
    const qIdx = raw.indexOf('?');
    const search = qIdx >= 0 ? raw.slice(qIdx + 1) : '';
    if (!search) return '';
    return (new URLSearchParams(search).get(key) || '').trim();
  } catch (_) {
    return '';
  }
}

function normalizeKind(raw) {
  const k = String(raw || 'other').toLowerCase();
  if (k === 'hat' || k === 'hats') return 'hat';
  if (k === 'shirt' || k === 'shirts') return 'shirt';
  if (k === 'eyes' || k === 'eye') return 'eyes';
  return 'other';
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).send('Method not allowed');

  const src = getQueryParam(req, 'src');
  if (!src || !/^https?:\/\//i.test(src)) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(400).send('Missing or invalid src (https GLB URL required).');
  }

  const kind = normalizeKind(getQueryParam(req, 'kind'));
  const rawOnly = truthyParam(getQueryParam(req, 'raw'));

  const key = cacheKey(src, kind, rawOnly);
  const hit = memCache.get(key);
  if (hit) {
    res.setHeader('Content-Type', 'model/gltf-binary');
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    res.setHeader('X-Otterful-Wearable-Bake', rawOnly ? 'raw-cache' : 'memory-cache');
    return res.status(200).send(hit);
  }

  try {
    const upstream = await fetch(src);
    if (!upstream.ok) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.status(502).send(`Failed to fetch source GLB: HTTP ${upstream.status}`);
    }
    const buf = Buffer.from(await upstream.arrayBuffer());
    if (rawOnly) {
      if (memCache.size < 200) memCache.set(key, buf);
      res.setHeader('Content-Type', 'model/gltf-binary');
      res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
      res.setHeader('X-Otterful-Wearable-Bake', 'raw');
      return res.status(200).send(buf);
    }
    const baked = await bakeWithTimeout(buf, kind);
    if (memCache.size < 200) memCache.set(key, baked);
    res.setHeader('Content-Type', 'model/gltf-binary');
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    res.setHeader('X-Otterful-Wearable-Bake', 'baked');
    return res.status(200).send(baked);
  } catch (e) {
    /* Fallback: serve source GLB so MML still loads (may float in viewer until bake is fixed). */
    try {
      const upstream = await fetch(src);
      if (upstream.ok) {
        const buf = Buffer.from(await upstream.arrayBuffer());
        res.setHeader('Content-Type', 'model/gltf-binary');
        res.setHeader('X-Otterful-Wearable-Bake', 'fallback-raw');
        return res.status(200).send(buf);
      }
    } catch (_) {
      /* ignore */
    }
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(500).send(e?.message || String(e));
  }
};
