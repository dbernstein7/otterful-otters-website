import { createPublicClient, http, custom } from 'https://esm.sh/viem@2.21.54';
import { apeChain, OTTER_CONTRACT, OTTER_MAX_ID } from './config.mjs';
import { fetchOtterMetadata } from './traits.mjs';

const ERC721_ENUMERABLE_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'tokenOfOwnerByIndex',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'index', type: 'uint256' },
    ],
    outputs: [{ type: 'uint256' }],
  },
];

/**
 * @param {import('viem').EIP1193Provider} provider
 */
export function publicClientFromProvider(provider) {
  return createPublicClient({
    chain: apeChain,
    transport: custom(provider),
  });
}

/**
 * @param {import('viem').PublicClient} client
 * @param {`0x${string}`} owner
 */
export async function fetchOwnedTokenIds(client, owner) {
  const balance = await client.readContract({
    address: OTTER_CONTRACT,
    abi: ERC721_ENUMERABLE_ABI,
    functionName: 'balanceOf',
    args: [owner],
  });
  const n = Number(balance);
  if (!n) return [];

  const ids = [];
  for (let i = 0; i < n; i += 1) {
    const tokenId = await client.readContract({
      address: OTTER_CONTRACT,
      abi: ERC721_ENUMERABLE_ABI,
      functionName: 'tokenOfOwnerByIndex',
      args: [owner, BigInt(i)],
    });
    const num = Number(tokenId);
    if (num >= 1 && num <= OTTER_MAX_ID) ids.push(num);
  }
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

export function httpPublicClient() {
  return createPublicClient({
    chain: apeChain,
    transport: http(apeChain.rpcUrls.default.http[0]),
  });
}
