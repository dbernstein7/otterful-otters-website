import { apeChain } from './config.mjs';
import { connectCrossAppProvider } from './connect.mjs';

/** Glyph production Privy app id (@use-glyph/sdk-react GLYPH_PRIVY_APP_ID) */
export const GLYPH_PRIVY_APP_ID = 'cly38x0w10ac945q9yg9sm71i';

let glyphProviderModulePromise = null;

function loadGlyphProviderModule() {
  if (!glyphProviderModulePromise) {
    glyphProviderModulePromise = import(
      'https://esm.sh/@privy-io/cross-app-connect@0.5.8?target=es2022'
    );
  }
  return glyphProviderModulePromise;
}

async function apeChainViem() {
  const { defineChain } = await import('https://esm.sh/viem@2.47.12?target=es2022');
  return defineChain({
    id: apeChain.id,
    name: apeChain.name,
    nativeCurrency: apeChain.nativeCurrency,
    rpcUrls: apeChain.rpcUrls,
    blockExplorers: apeChain.blockExplorers,
  });
}

/**
 * Opens the Glyph Privy approval popup (privy.useglyph.io), then connects on ApeChain
 * and returns the wallet address for loading Otterful otters via /api/wallet-otters.
 */
export async function connectGlyphWallet() {
  const [{ toPrivyWalletProvider }, chain] = await Promise.all([
    loadGlyphProviderModule(),
    apeChainViem(),
  ]);

  const provider = toPrivyWalletProvider({
    providerAppId: GLYPH_PRIVY_APP_ID,
    chains: [chain],
    chainId: apeChain.id,
    defaultPopupTimeout: 120_000,
  });

  return connectCrossAppProvider(provider, { kind: 'glyph' });
}
