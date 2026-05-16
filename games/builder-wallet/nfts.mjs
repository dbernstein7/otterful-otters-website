import { OTTER_MAX_ID } from './config.mjs';
import { fetchOtterMetadata } from './traits.mjs';

/**
 * Load owned token IDs via site API (OpenSea / Reservoir).
 * On-chain tokenOfOwnerByIndex is not available on this contract.
 * @param {string} wallet 0x… address
 */
export async function fetchOwnedTokenIds(wallet) {
  const addr = String(wallet || '').trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(addr)) {
    throw new Error('Invalid wallet address.');
  }

  const r = await fetch(`/api/wallet-otters?wallet=${encodeURIComponent(addr)}`, {
    cache: 'no-store',
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(data.error || `Could not load wallet otters (${r.status})`);
  }

  const ids = Array.isArray(data.tokenIds)
    ? data.tokenIds
        .map((id) => parseInt(String(id), 10))
        .filter((id) => id >= 1 && id <= OTTER_MAX_ID)
    : [];

  return [...new Set(ids)].sort((a, b) => a - b);
}

/**
 * @param {number[]} tokenIds
 * @param {(done: number, total: number) => void} [onProgress]
 */
export async function loadWalletOtters(tokenIds, onProgress) {
  const total = tokenIds.length;
  const out = [];
  let done = 0;
  const batchSize = 8;

  for (let i = 0; i < tokenIds.length; i += batchSize) {
    const chunk = tokenIds.slice(i, i + batchSize);
    const metas = await Promise.all(
      chunk.map(async (id) => {
        try {
          const metadata = await fetchOtterMetadata(id);
          return { id, metadata };
        } catch {
          return { id, metadata: null };
        }
      })
    );
    out.push(...metas);
    done += chunk.length;
    onProgress?.(done, total);
  }
  return out;
}
