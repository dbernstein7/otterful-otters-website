/**
 * Otterful MML HTML — `<m-character>` / `<m-model>` as emitted by `/api/mml` and `/mml/<id>.mml`.
 * Supports multiline tags and flexible attribute order (MML-shaped markup).
 */
export type MmlWearable = { socket: string; src: string };

export type ParsedMml = {
  /** Absolute URL of the fetched MML document (resolves relative `src` values). */
  documentUrl: string;
  bodySrc: string;
  animSrc: string | null;
  wearables: MmlWearable[];
};

function resolveMmlAssetUrl(documentBaseUrl: string, ref: string): string {
  const s = ref.trim();
  if (!s) return s;
  if (/^https?:\/\//i.test(s)) return s;
  try {
    return new URL(s, documentBaseUrl).href;
  } catch {
    return s;
  }
}

/** `/api/mml` uses HTML attribute escaping (`&` → `&amp;`). Regex parsing leaves entities intact — decode before fetch. */
function decodeHtmlAttributeValue(raw: string): string {
  return raw
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&');
}

/** Read `name="..."` or `name='...'` from an attribute block (may include newlines). */
function readMmlAttr(attrs: string, name: string): string | null {
  const re = new RegExp(`(?:^|[\\s])${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i');
  const m = attrs.match(re);
  if (!m) return null;
  const inner = m[2].trim().replace(/\s+/g, ' ');
  return decodeHtmlAttributeValue(inner);
}

/**
 * @param html Raw HTML of the MML document
 * @param documentBaseUrl Absolute URL of that document (for relative `src` values)
 */
export function parseMmlHtml(html: string, documentBaseUrl: string): ParsedMml {
  const charOpen = html.match(/<\s*m-character\b([\s\S]*?)>/i);
  if (!charOpen) throw new Error('No <m-character> in MML document.');
  const attrBlock = charOpen[1];

  const bodyRaw = readMmlAttr(attrBlock, 'src');
  if (!bodyRaw) throw new Error('m-character has no src (body GLB).');
  const bodySrc = resolveMmlAssetUrl(documentBaseUrl, bodyRaw);

  const animRaw = readMmlAttr(attrBlock, 'anim');
  const animSrc = animRaw ? resolveMmlAssetUrl(documentBaseUrl, animRaw) : null;

  const wearables: MmlWearable[] = [];
  const block = html.match(/<\s*m-character\b[\s\S]*?>([\s\S]*?)<\/\s*m-character\s*>/i);
  const inner = block ? block[1] : html;

  const modelRe = /<\s*m-model\b([\s\S]*?)(?:\/>|>[\s\S]*?<\/\s*m-model\s*>)/gi;
  let mm: RegExpExecArray | null;
  while ((mm = modelRe.exec(inner))) {
    const a = mm[1];
    const socket = readMmlAttr(a, 'socket');
    const srcRaw = readMmlAttr(a, 'src');
    if (socket && srcRaw) {
      wearables.push({ socket: socket.trim(), src: resolveMmlAssetUrl(documentBaseUrl, srcRaw) });
    }
  }

  return { documentUrl: documentBaseUrl, bodySrc, animSrc, wearables };
}

export function tokenIdFromMmlUrl(mmlUrl: string): string | null {
  try {
    const u = new URL(mmlUrl, 'https://www.otterfulotters.xyz');
    const id = u.searchParams.get('id');
    if (id && /^\d+$/.test(id)) return id;
    const path = u.pathname;
    const m = path.match(/\/mml\/(\d+)\.mml$/i);
    if (m) return m[1];
    return null;
  } catch {
    return null;
  }
}
