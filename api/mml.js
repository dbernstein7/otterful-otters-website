/**
 * Vercel serverless: returns a static MML HTML document for an Otterful token,
 * using the same metadata paths and WEARABLES/... layout as AvatarBuilder.
 *
 * Env (optional — override default bone names on the fur rig):
 *   MML_SOCKET_HAT, MML_SOCKET_SHIRT, MML_SOCKET_EYES
 *   If unset, defaults are Mixamo-style: mixamorig:Head (hat, eyes), mixamorig:Spine2 (shirt).
 *   MML_BONE_SCHEME — `mixamo` (default: mixamorig:Head / mixamorig:Spine2) or `short` (Head / Spine2 / Head) if your rig omits the mixamorig: prefix
 *   WEARABLE_ASSET_ORIGIN — absolute base where GLBs are hosted (default: same host + /AvatarBuilder/)
 *   FIREBASE_STORAGE_BUCKET — if set, GLB URLs use Firebase REST form (see buildFirebaseDownloadUrl)
 *   FIREBASE_STORAGE_TOKEN — optional &token= for Firebase objects (same token only works if shared across objects)
 *   SITE_ORIGIN — fallback when Host header missing (default https://www.otterfulotters.xyz)
 */

function siteOriginFromRequest(req) {
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = (req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  if (host) return `${proto}://${host}`;
  return process.env.SITE_ORIGIN || 'https://www.otterfulotters.xyz';
}

function encodeWearablePath(folder, filename) {
  const folderParts = folder.split('/').map((part) => part.replace(/ /g, '%20'));
  const encodedFolder = folderParts.join('/');
  const encodedFilename = encodeURIComponent(filename);
  return `${encodedFolder}/${encodedFilename}`;
}

/** @param {string} storagePath e.g. WEARABLES/Furs/Robo-1.glb (slashes, not URL-encoded) */
function buildWearableUrl(origin, storagePath) {
  const bucket = process.env.FIREBASE_STORAGE_BUCKET;
  if (bucket) {
    const enc = encodeURIComponent(storagePath);
    const tok = process.env.FIREBASE_STORAGE_TOKEN || '';
    let u = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${enc}?alt=media`;
    if (tok) u += `&token=${encodeURIComponent(tok)}`;
    return u;
  }
  const base = (process.env.WEARABLE_ASSET_ORIGIN || `${origin.replace(/\/$/, '')}/AvatarBuilder`).replace(/\/$/, '');
  const i = storagePath.lastIndexOf('/');
  const folder = storagePath.slice(0, i);
  const file = storagePath.slice(i + 1);
  const sitePath = encodeWearablePath(folder, file);
  return `${base}/${sitePath}`;
}

function parseTraits(metadata) {
  const traits = {};
  const attrs = metadata.attributes;
  if (!Array.isArray(attrs)) return traits;
  for (const attr of attrs) {
    if (!attr.trait_type || attr.value == null) continue;
    const traitType = String(attr.trait_type).toLowerCase();
    const traitValue = String(attr.value).trim();
    if (!traitValue || traitValue.toLowerCase() === 'none') continue;
    if (traitType === 'fur') traits.fur = traitValue;
    else if (traitType === 'shirt') traits.shirt = traitValue;
    else if (traitType === 'eyes') traits.eyes = traitValue;
    else if (traitType === 'hats' || traitType === 'hat') traits.hat = traitValue;
  }
  return traits;
}

function escAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function defaultSockets() {
  const scheme = (process.env.MML_BONE_SCHEME || 'mixamo').toLowerCase();
  if (scheme === 'short' || scheme === 'head') {
    return {
      hat: process.env.MML_SOCKET_HAT || 'Head',
      shirt: process.env.MML_SOCKET_SHIRT || 'Spine2',
      eyes: process.env.MML_SOCKET_EYES || 'Head',
    };
  }
  return {
    hat: process.env.MML_SOCKET_HAT || 'mixamorig:Head',
    shirt: process.env.MML_SOCKET_SHIRT || 'mixamorig:Spine2',
    eyes: process.env.MML_SOCKET_EYES || 'mixamorig:Head',
  };
}

function buildHtml({ id, traits, urls, sockets }) {
  const parts = [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<!-- Otterful #${id} — MML from metadata / AvatarBuilder paths -->`,
    `<title>Otterful #${id}</title>`,
    '</head>',
    '<body>',
  ];

  parts.push('<m-character', ` id="otter-${id}"`, ` src="${escAttr(urls.fur)}"`, ' y="0"', ' ry="12"', ' anim-enabled="true"', ' anim-loop="true"', '>');

  if (urls.hat) {
    parts.push(`  <m-model src="${escAttr(urls.hat)}" socket="${escAttr(sockets.hat)}" />`);
  }
  if (urls.shirt) {
    parts.push(`  <m-model src="${escAttr(urls.shirt)}" socket="${escAttr(sockets.shirt)}" />`);
  }
  if (urls.eyes) {
    parts.push(`  <m-model src="${escAttr(urls.eyes)}" socket="${escAttr(sockets.eyes)}" />`);
  }

  parts.push('</m-character>', '</body>', '</html>');
  return parts.join('\n');
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).send('Method not allowed');

  const rawId = (req.query && (req.query.id || req.query.token)) || '';
  const id = parseInt(String(rawId), 10);
  if (!id || id < 1 || id > 2222) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(400).send('Missing or invalid id. Use ?id=1');
  }

  const origin = siteOriginFromRequest(req);
  const metaUrl = `${origin}/metadata/${id}.json`;

  let metadata;
  try {
    const r = await fetch(metaUrl);
    if (!r.ok) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.status(404).send(`Metadata not found: ${metaUrl}`);
    }
    metadata = await r.json();
  } catch (e) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(502).send(`Failed to fetch metadata: ${e.message || e}`);
  }

  const traits = parseTraits(metadata);
  if (!traits.fur) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(422).send('Metadata has no Fur trait (required for MML body).');
  }

  const urls = {
    fur: buildWearableUrl(origin, `WEARABLES/Furs/${traits.fur}.glb`),
  };
  if (traits.hat) urls.hat = buildWearableUrl(origin, `WEARABLES/Hats/${traits.hat}.glb`);
  if (traits.shirt) urls.shirt = buildWearableUrl(origin, `WEARABLES/Shirts/${traits.shirt}.glb`);
  if (traits.eyes) urls.eyes = buildWearableUrl(origin, `WEARABLES/Eyes/${traits.eyes}.glb`);

  const sockets = defaultSockets();

  const html = buildHtml({ id, traits, urls, sockets });

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(html);
};
