/**
 * Parse Otterful metadata attributes into builder traits.
 * @param {import('./traits.mjs').OtterMetadata | null | undefined} metadata
 */
export function parseOtterTraits(metadata) {
  const traits = { fur: null, hat: null, shirt: null, eyes: null };
  if (!metadata?.attributes?.length) return traits;

  for (const attr of metadata.attributes) {
    if (!attr?.trait_type || attr.value == null) continue;
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

/**
 * Union trait values across all wallet otters (for equippable gallery).
 * @param {Array<{ metadata: import('./traits.mjs').OtterMetadata }>} otters
 */
export function aggregateWalletTraits(otters) {
  const sets = { fur: new Set(), hat: new Set(), shirt: new Set(), eyes: new Set() };
  for (const o of otters) {
    const t = parseOtterTraits(o.metadata);
    if (t.fur) sets.fur.add(t.fur);
    if (t.hat) sets.hat.add(t.hat);
    if (t.shirt) sets.shirt.add(t.shirt);
    if (t.eyes) sets.eyes.add(t.eyes);
  }
  return {
    fur: [...sets.fur],
    hat: [...sets.hat],
    shirt: [...sets.shirt],
    eyes: [...sets.eyes],
  };
}

/**
 * @param {string} origin
 * @param {number} tokenId
 * @param {{ fur?: string|null, hat?: string|null, shirt?: string|null, eyes?: string|null }} traits
 */
export function buildMmlApiUrl(origin, tokenId, traits = {}) {
  const base = (origin || '').replace(/\/$/, '');
  const u = new URL(`${base}/api/mml`);
  u.searchParams.set('id', String(tokenId));
  u.searchParams.set('v', '2');
  if (traits.fur) u.searchParams.set('fur', traits.fur);
  if (traits.hat) u.searchParams.set('hat', traits.hat);
  else if (traits.hat === null) u.searchParams.set('hat', 'none');
  if (traits.shirt) u.searchParams.set('shirt', traits.shirt);
  else if (traits.shirt === null) u.searchParams.set('shirt', 'none');
  if (traits.eyes) u.searchParams.set('eyes', traits.eyes);
  else if (traits.eyes === null) u.searchParams.set('eyes', 'none');
  return u.toString();
}

export async function fetchOtterMetadata(tokenId) {
  const r = await fetch(`/metadata/${tokenId}.json`, { cache: 'force-cache' });
  if (!r.ok) throw new Error(`Metadata #${tokenId} not found`);
  return r.json();
}

export function otterImageUrl(tokenId) {
  return `images_compressed/${tokenId}.png`;
}
