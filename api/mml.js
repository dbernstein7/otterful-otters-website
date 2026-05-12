/**
 * Vercel serverless: returns a static MML HTML document for an Otterful token,
 * using metadata traits and GLB URLs (site /AvatarBuilder paths or Firebase Storage).
 *
 * Env (optional — override default bone names on the fur rig):
 *   MML_SOCKET_HAT, MML_SOCKET_SHIRT, MML_SOCKET_EYES
 *   If unset, defaults are Mixamo-style: mixamorig:Head (hat, eyes), mixamorig:Spine2 (shirt).
 *   Set MML_SOCKET_HAT vs MML_SOCKET_EYES to different bone names when hats attach to the head and eyes to a face bone on your rig.
 *   MML_BONE_SCHEME — `mixamo` (default: mixamorig:Head / mixamorig:Spine2) or `short` (Head / Spine2 / Head) if your rig omits the mixamorig: prefix
 *   MML_WEARABLE_PREFIX — folder segment for legacy layout (default `WEARABLES` → …/WEARABLES/Furs/…). Used when MML_*_STORAGE_PATH overrides are not set.
 *   MML_FUR_STORAGE_PATH — Firebase (or site) object folder for body GLBs, no leading slash (e.g. `Furs` → `Furs/OG.glb`). When unset, fur uses `${MML_WEARABLE_PREFIX}/Furs/<Fur trait>.glb`.
 *   MML_HAT_STORAGE_PATH, MML_SHIRT_STORAGE_PATH, MML_EYES_STORAGE_PATH — same pattern (e.g. `Hats`, `Shirts`, `Eyes`) when those assets live at bucket root.
 *   MML_SKIP_SHIRT — if `1` or `true`, do not emit an m-model for shirt (use when the shirt is baked into the body GLB or you only want fur/hat/eyes).
 *   MML_SHIRT_OVERRIDE — if set (e.g. `Business`), always load that shirt filename and ignore the shirt trait (ignored when MML_SKIP_SHIRT is true).
 *   WEARABLE_ASSET_ORIGIN — absolute base for all GLBs when set; otherwise base follows prefix (WEARABLES → /AvatarBuilder, else site origin). Ignored when FIREBASE_STORAGE_BUCKET is set (Firebase URLs are absolute).
 *   FIREBASE_STORAGE_BUCKET — required for Firebase URLs: bucket id (e.g. `otterful-otters.firebasestorage.app` or `project.appspot.com`). GLB paths are encoded as Storage object paths.
 *   FIREBASE_STORAGE_TOKEN — optional `&token=` for download URLs (Firebase file tokens). Omit if rules allow public read on those objects.
 *   If downloads return 403: add Storage rules allowing read for `Furs/` (and other folders) or use tokens — see `firebase-storage.rules.example` in the repo root.
 *   MML_CHARACTER_RY — optional rotation on m-character (degrees). Omitted when unset (viewer uses default 0).
 *   SITE_ORIGIN — fallback when Host header missing (default https://www.otterfulotters.xyz)
 *
 * Optional separate animation file (body GLB + linked anim GLB):
 *   ?anim= on this endpoint — full https://…glb or a wearable path (e.g. WEARABLES/Animations/Walk.glb). Easiest way to try walk/run/idle without editing metadata.
 *   MML_CHARACTER_ANIM — same as above when ?anim= is absent.
 *   Metadata trait "MML Anim" / "MML_Anim" — same; used when ?anim= is absent.
 *   Priority: ?anim= > trait > MML_CHARACTER_ANIM.
 */

function siteOriginFromRequest(req) {
  let proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = (req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  const hostOnly = host.split(':')[0];
  /* Avoid http:// document URLs in MML (mixed content / wrong links) when the site is served behind TLS. */
  if (hostOnly && /(^|\.)otterfulotters\.xyz$/i.test(hostOnly) && proto === 'http') {
    proto = 'https';
  }
  if (host) return `${proto}://${host}`;
  return process.env.SITE_ORIGIN || 'https://www.otterfulotters.xyz';
}

function encodeWearablePath(folder, filename) {
  const folderParts = folder.split('/').map((part) => part.replace(/ /g, '%20'));
  const encodedFolder = folderParts.join('/');
  const encodedFilename = encodeURIComponent(filename);
  return `${encodedFolder}/${encodedFilename}`;
}

function wearablesAssetBase(siteOrigin) {
  if (process.env.WEARABLE_ASSET_ORIGIN) {
    return String(process.env.WEARABLE_ASSET_ORIGIN).replace(/\/$/, '');
  }
  const prefix = wearablePrefix();
  if (prefix === 'WEARABLES') {
    return `${siteOrigin.replace(/\/$/, '')}/AvatarBuilder`;
  }
  return siteOrigin.replace(/\/$/, '');
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
  const base = wearablesAssetBase(origin);
  const i = storagePath.lastIndexOf('/');
  const folder = storagePath.slice(0, i);
  const file = storagePath.slice(i + 1);
  const sitePath = encodeWearablePath(folder, file);
  return `${base}/${sitePath}`;
}

/** When the wearable prefix has no Eyes/ folder, load eyes from legacy AvatarBuilder/WEARABLES/Eyes. */
function buildEyesWearableUrl(siteOrigin, eyeTraitName) {
  const bucket = process.env.FIREBASE_STORAGE_BUCKET;
  const path = `WEARABLES/Eyes/${eyeTraitName}.glb`;
  if (bucket) {
    const enc = encodeURIComponent(path);
    const tok = process.env.FIREBASE_STORAGE_TOKEN || '';
    let u = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${enc}?alt=media`;
    if (tok) u += `&token=${encodeURIComponent(tok)}`;
    return u;
  }
  const base = `${siteOrigin.replace(/\/$/, '')}/AvatarBuilder`;
  const sitePath = encodeWearablePath('WEARABLES/Eyes', `${eyeTraitName}.glb`);
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
    else if (traitType === 'mml anim' || traitType === 'mml_anim') traits.mmlAnim = traitValue;
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

function truthyEnv(v) {
  if (v == null || v === '') return false;
  const s = String(v).trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes';
}

function wearablePrefix() {
  const raw = process.env.MML_WEARABLE_PREFIX;
  if (raw === '' || raw === undefined || raw === null) {
    return 'WEARABLES';
  }
  const p = String(raw).replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  return p || 'WEARABLES';
}

/** Trim env folder like `Furs` or `wearables/furs` → no leading/trailing slashes. */
function storageFolderFromEnv(key) {
  const v = process.env[key];
  if (v == null || String(v).trim() === '') return '';
  return String(v).trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

/**
 * Object path inside the bucket or site mirror: either `folderFromEnv/trait.glb` or legacy `wp/Segment/trait.glb`.
 * @param {string} envKey e.g. MML_FUR_STORAGE_PATH
 * @param {string} wp wearablePrefix()
 * @param {string} segment e.g. Furs, Hats
 * @param {string} traitValue filename stem from metadata
 */
function glbObjectPath(envKey, wp, segment, traitValue) {
  const folder = storageFolderFromEnv(envKey);
  if (folder) return `${folder}/${traitValue}.glb`;
  return `${wp}/${segment}/${traitValue}.glb`;
}

/** Full https URL as-is, otherwise treat as Firebase/site storage path for buildWearableUrl. */
function resolveLinkedAssetUrl(origin, raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  return buildWearableUrl(origin, s.replace(/^\/+/, ''));
}

function getQueryParam(req, key) {
  const q = req.query && req.query[key];
  if (q != null && String(q).trim() !== '') return String(q).trim();
  try {
    const raw = String(req.url || '');
    const qIdx = raw.indexOf('?');
    const search = qIdx >= 0 ? raw.slice(qIdx + 1) : '';
    if (!search) return '';
    const sp = new URLSearchParams(search);
    return (sp.get(key) || '').trim();
  } catch (_) {
    return '';
  }
}

function buildHtml({ id, traits, urls, sockets }) {
  const parts = [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>Otterful #${id}</title>`,
    '</head>',
    '<body>',
  ];

  const ry = (process.env.MML_CHARACTER_RY || '').trim();
  parts.push('<m-character');
  parts.push(`  id="otter-${id}"`);
  parts.push(`  name="Otterful #${id}"`);
  parts.push(`  src="${escAttr(urls.fur)}"`);
  if (urls.anim) parts.push(`  anim="${escAttr(urls.anim)}"`);
  if (ry) parts.push(`  ry="${escAttr(ry)}"`);
  parts.push('>');

  if (urls.hat) {
    parts.push(`  <m-model class="hat" src="${escAttr(urls.hat)}" socket="${escAttr(sockets.hat)}" />`);
  }
  if (urls.shirt) {
    parts.push(`  <m-model class="shirt" src="${escAttr(urls.shirt)}" socket="${escAttr(sockets.shirt)}" />`);
  }
  if (urls.eyes) {
    parts.push(`  <m-model class="eyes" src="${escAttr(urls.eyes)}" socket="${escAttr(sockets.eyes)}" />`);
  }

  parts.push('</m-character>', '</body>', '</html>');
  return parts.join('\n');
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).send('Method not allowed');

  const rawId = getQueryParam(req, 'id') || getQueryParam(req, 'token');
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

  const wp = wearablePrefix();
  const urls = {
    fur: buildWearableUrl(origin, glbObjectPath('MML_FUR_STORAGE_PATH', wp, 'Furs', traits.fur)),
  };
  if (traits.hat) {
    urls.hat = buildWearableUrl(origin, glbObjectPath('MML_HAT_STORAGE_PATH', wp, 'Hats', traits.hat));
  }
  const skipShirt = truthyEnv(process.env.MML_SKIP_SHIRT);
  const shirtOverride = (process.env.MML_SHIRT_OVERRIDE || '').trim();
  if (!skipShirt) {
    const shirtName = shirtOverride || traits.shirt;
    if (shirtName) {
      urls.shirt = buildWearableUrl(origin, glbObjectPath('MML_SHIRT_STORAGE_PATH', wp, 'Shirts', shirtName));
    }
  }
  if (traits.eyes) {
    const eyesFolder = storageFolderFromEnv('MML_EYES_STORAGE_PATH');
    if (eyesFolder) {
      urls.eyes = buildWearableUrl(origin, `${eyesFolder}/${traits.eyes}.glb`);
    } else if (wp !== 'WEARABLES') {
      urls.eyes = buildEyesWearableUrl(origin, traits.eyes);
    } else {
      urls.eyes = buildWearableUrl(origin, `${wp}/Eyes/${traits.eyes}.glb`);
    }
  }

  const animQuery = getQueryParam(req, 'anim');
  let animResolved = '';
  if (animQuery) {
    const uq = resolveLinkedAssetUrl(origin, animQuery.trim());
    if (uq) animResolved = uq;
  }
  if (!animResolved) {
    const animRaw = (traits.mmlAnim || process.env.MML_CHARACTER_ANIM || '').trim();
    if (animRaw) animResolved = resolveLinkedAssetUrl(origin, animRaw) || '';
  }
  if (animResolved) urls.anim = animResolved;

  const sockets = defaultSockets();

  const html = buildHtml({ id, traits, urls, sockets });

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(html);
};
