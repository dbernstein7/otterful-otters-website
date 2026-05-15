import type { EquippedMap } from '@/store/builderStore';

/** Build canonical MML document URL for Otterful `/api/mml` (supports hat, shirt, glasses/eyes). */
export function buildMmlApiUrl(tokenId: number, equipped: EquippedMap, origin?: string): string {
  const o = (origin ?? (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/$/, '');
  const params = new URLSearchParams();
  params.set('id', String(tokenId));

  const hat = equipped.hats;
  if (hat) params.set('hat', hat);

  const shirt = equipped.tops;
  if (shirt) params.set('shirt', shirt);

  const glasses = equipped.glasses;
  if (glasses) params.set('glasses', glasses);

  /* Accessories are not a separate MML query on the server yet — omit or map later. */

  const qs = params.toString();
  return `${o}/api/mml?${qs}`;
}

export function buildMmlViewerOpenUrl(tokenId: number, equipped: EquippedMap, origin?: string): string {
  const o = (origin ?? (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/$/, '');
  const doc = encodeURIComponent(buildMmlApiUrl(tokenId, equipped, o));
  return `https://viewer.mml.io/main/v1/?url=${doc}`;
}
