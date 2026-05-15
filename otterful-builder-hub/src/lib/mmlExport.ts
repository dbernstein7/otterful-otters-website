import type { EquippedMap } from '@/data/wearables';

/** Sent to `/api/mml` as `no_hat=1` / `no_shirt=1` / `no_glasses=1` to hide a slot (overrides NFT traits). */
export const MML_SLOT_OFF = '__off__';

/** Build canonical MML document URL for Otterful `/api/mml` (supports hat, shirt, glasses/eyes). */
export function buildMmlApiUrl(tokenId: number, equipped: EquippedMap, origin?: string): string {
  const o = (origin ?? (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/$/, '');
  const params = new URLSearchParams();
  params.set('id', String(tokenId));

  const hat = equipped.hats;
  if (hat === MML_SLOT_OFF) params.set('no_hat', '1');
  else if (hat) params.set('hat', hat);

  const shirt = equipped.tops;
  if (shirt === MML_SLOT_OFF) params.set('no_shirt', '1');
  else if (shirt) params.set('shirt', shirt);

  const glasses = equipped.glasses;
  if (glasses === MML_SLOT_OFF) params.set('no_glasses', '1');
  else if (glasses) params.set('glasses', glasses);

  /* Accessories are not a separate MML query on the server yet — omit or map later. */

  const qs = params.toString();
  return `${o}/api/mml?${qs}`;
}

export function buildMmlViewerOpenUrl(tokenId: number, equipped: EquippedMap, origin?: string): string {
  const o = (origin ?? (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/$/, '');
  const doc = encodeURIComponent(buildMmlApiUrl(tokenId, equipped, o));
  return `https://viewer.mml.io/main/v1/?url=${doc}`;
}
