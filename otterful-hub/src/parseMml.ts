/**
 * Parses Otterful MML HTML (same shape as /api/mml and /mml/&lt;id&gt;.mml).
 * Source of truth is the MML document — no trait/metadata rebuild.
 */
export type MmlWearable = { socket: string; src: string };

export type ParsedMml = {
  bodySrc: string;
  animSrc: string | null;
  wearables: MmlWearable[];
};

export function parseMmlHtml(html: string): ParsedMml {
  const m = html.match(/<m-character\b[^>]*>/i);
  if (!m) throw new Error('No <m-character> in MML document.');
  const openTag = m[0];
  const srcMatch = openTag.match(/\bsrc="([^"]+)"/i);
  if (!srcMatch) throw new Error('m-character has no src (body GLB).');
  const animMatch = openTag.match(/\banim\s*=\s*["']([^"']+)["']/i);
  const bodySrc = srcMatch[1].trim();
  const animSrc = animMatch ? animMatch[1].trim() : null;

  const wearables: MmlWearable[] = [];
  const blockRe = /<m-character\b[^>]*>([\s\S]*?)<\/m-character>/i;
  const block = html.match(blockRe);
  const inner = block ? block[1] : html;
  const modelRe = /<m-model\b([^>]*)>(?:\s*<\/m-model>)?/gi;
  let mm: RegExpExecArray | null;
  while ((mm = modelRe.exec(inner))) {
    const attrs = mm[1] || '';
    const sock = attrs.match(/\bsocket="([^"]+)"/i);
    const src = attrs.match(/\bsrc="([^"]+)"/i);
    if (sock && src) wearables.push({ socket: sock[1].trim(), src: src[1].trim() });
  }
  return { bodySrc, animSrc, wearables };
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
