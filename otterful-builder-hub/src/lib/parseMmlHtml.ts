export type MmlWearSlot = 'hats' | 'tops' | 'glasses';

export type MmlAnchorModel = {
  category: MmlWearSlot;
  socket: string;
  src: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  animEnabled?: boolean;
};

export type MmlDocumentPreview = {
  characterSrc: string | null;
  characterAnim?: string | null;
  /** Slot order matches `/api/mml` emission: hat, shirt, eyes. */
  models: MmlAnchorModel[];
};

function decodeHtmlAttr(s: string) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&#39;/g, "'");
}

function parseAttrBlob(blob: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([\w:-]+)="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(blob))) {
    out[m[1]] = decodeHtmlAttr(m[2]);
  }
  return out;
}

function num(attrs: Record<string, string>, key: string): number | undefined {
  const v = attrs[key];
  if (v == null || v === '') return undefined;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : undefined;
}

function toEulerRadians(rx: number | undefined, ry: number | undefined, rz: number | undefined): [number, number, number] | undefined {
  if (rx == null && ry == null && rz == null) return undefined;
  const x = rx ?? 0;
  const y = ry ?? 0;
  const z = rz ?? 0;
  const max = Math.max(Math.abs(x), Math.abs(y), Math.abs(z));
  const conv = (d: number) => ((max > 6.5 ? (d * Math.PI) / 180 : d) as number);
  return [conv(x), conv(y), conv(z)];
}

const SLOT_ORDER: MmlWearSlot[] = ['hats', 'tops', 'glasses'];

/**
 * Parse Otterful `/api/mml` HTML for `m-character` + child `m-model` tags (same structure `api/mml.js` emits).
 */
export function parseMmlHtml(html: string): MmlDocumentPreview {
  const charM = html.match(/<m-character\s+([^>]*)>/is);
  let characterSrc: string | null = null;
  let characterAnim: string | null = null;
  if (charM) {
    const a = parseAttrBlob(charM[1]);
    characterSrc = (a.src || '').trim() || null;
    characterAnim = (a.anim || '').trim() || null;
  }

  const models: MmlAnchorModel[] = [];
  const re = /<m-model\s+([^>]+)>/gi;
  let slot = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const attrs = parseAttrBlob(m[1]);
    const src = (attrs.src || '').trim();
    const socket = (attrs.socket || '').trim();
    if (!src || !socket) continue;
    if (slot >= SLOT_ORDER.length) continue;
    const category = SLOT_ORDER[slot];
    slot += 1;
    const x = num(attrs, 'x');
    const y = num(attrs, 'y');
    const z = num(attrs, 'z');
    const position =
      x != null || y != null || z != null ? ([x ?? 0, y ?? 0, z ?? 0] as [number, number, number]) : undefined;
    const rx = num(attrs, 'rx');
    const ry = num(attrs, 'ry');
    const rz = num(attrs, 'rz');
    const rotation = toEulerRadians(rx, ry, rz);
    const sx = num(attrs, 'sx');
    const sy = num(attrs, 'sy');
    const sz = num(attrs, 'sz');
    const scale =
      sx != null || sy != null || sz != null ? ([sx ?? 1, sy ?? 1, sz ?? 1] as [number, number, number]) : undefined;
    const animRaw = (attrs['anim-enabled'] ?? attrs.animEnabled ?? '').toLowerCase();
    const animEnabled = animRaw === '' ? undefined : animRaw !== 'false' && animRaw !== '0';
    models.push({ category, socket, src, position, rotation, scale, animEnabled });
  }

  return { characterSrc, characterAnim: characterAnim || null, models };
}
