import { APECHAIN_SWITCH, apeChain } from './config.mjs';

let wcProvider = null;
let activeProvider = null;
let activeAddress = null;

async function fetchWalletConnectProjectId() {
  try {
    const r = await fetch('/api/wallet-config', { cache: 'no-store' });
    if (!r.ok) return '';
    const data = await r.json();
    return String(data.projectId || '').trim();
  } catch {
    return '';
  }
}

async function ensureApeChain(provider) {
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: APECHAIN_SWITCH.chainId }],
    });
  } catch (err) {
    const code = err?.code;
    if (code === 4902) {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [APECHAIN_SWITCH],
      });
      return;
    }
    throw err;
  }
}

/**
 * Connect via a specific injected provider (MetaMask, Glyph extension, etc.)
 * @param {import('viem').EIP1193Provider} provider
 */
export async function connectWithProvider(provider) {
  if (!provider) throw new Error('No wallet provider selected.');
  await ensureApeChain(provider);
  const accounts = await provider.request({ method: 'eth_requestAccounts' });
  if (!accounts?.length) throw new Error('Wallet connection was cancelled.');
  activeProvider = provider;
  activeAddress = accounts[0].toLowerCase();
  return { address: activeAddress, provider, kind: 'injected' };
}

/**
 * Privy cross-app wallets (Glyph): eth_requestAccounts opens the approval popup and
 * may return undefined; accounts are available via eth_accounts after approval.
 * @param {import('viem').EIP1193Provider} provider
 * @param {{ kind?: string }} [opts]
 */
export async function connectCrossAppProvider(provider, opts = {}) {
  if (!provider) throw new Error('No wallet provider selected.');

  await provider.request({ method: 'eth_requestAccounts' });

  let accounts = await provider.request({ method: 'eth_accounts' });
  if (!accounts?.length) {
    accounts = await provider.request({ method: 'eth_requestAccounts' });
  }
  if (!accounts?.length) {
    throw new Error('Wallet connection was cancelled.');
  }

  const address = String(accounts[0]).toLowerCase();

  try {
    await ensureApeChain(provider);
  } catch (err) {
    const code = err?.code;
    if (code === 4001) throw new Error('Wallet connection was cancelled.');
    console.warn('ApeChain switch after Glyph connect:', err);
  }

  activeProvider = provider;
  activeAddress = address;
  return { address, provider, kind: opts.kind || 'glyph-cross-app' };
}

/**
 * Injected wallet (Glyph, MetaMask, Rabby, etc.)
 */
async function connectInjected() {
  const eth = window.ethereum;
  if (!eth) throw new Error('No browser wallet found. Use WalletConnect instead.');
  return connectWithProvider(eth);
}

/**
 * WalletConnect v2 (supports mobile wallets, Glyph via WC, etc.)
 * @see https://docs.walletconnect.com/
 */
export async function connectWalletConnect() {
  const projectId = await fetchWalletConnectProjectId();
  if (!projectId) {
    throw new Error(
      'WalletConnect is not configured on this site. Use a browser extension wallet (MetaMask, Glyph) or ask the team to set REOWN_PROJECT_ID on Vercel.'
    );
  }

  const { EthereumProvider } = await import(
    'https://esm.sh/@walletconnect/ethereum-provider@2.17.4'
  );

  if (wcProvider) {
    try {
      await wcProvider.disconnect();
    } catch {
      /* ignore */
    }
    wcProvider = null;
  }

  wcProvider = await EthereumProvider.init({
    projectId,
    chains: [apeChain.id],
    optionalChains: [apeChain.id],
    showQrModal: true,
    metadata: {
      name: 'Otterful 3D Builder',
      description: 'Customize your Otterful Otter NFT',
      url: window.location.origin,
      icons: [`${window.location.origin}/otterre.png`],
    },
  });

  await wcProvider.enable();
  const accounts = wcProvider.accounts || [];
  if (!accounts.length) throw new Error('WalletConnect did not return an account.');

  activeProvider = wcProvider;
  activeAddress = accounts[0].toLowerCase();
  return { address: activeAddress, provider: wcProvider, kind: 'walletconnect' };
}

/**
 * Prefer injected; fall back to WalletConnect modal.
 */
export async function connectWallet({ preferWalletConnect = false } = {}) {
  if (!preferWalletConnect && window.ethereum) {
    return connectInjected();
  }
  if (window.ethereum && !preferWalletConnect) {
    return connectInjected();
  }
  return connectWalletConnect();
}

export async function openWalletConnectModal() {
  return connectWallet({ preferWalletConnect: true });
}

export function getActiveSession() {
  if (!activeProvider || !activeAddress) return null;
  return { address: activeAddress, provider: activeProvider };
}

export async function disconnectWallet() {
  if (wcProvider) {
    try {
      await wcProvider.disconnect();
    } catch {
      /* ignore */
    }
  }
  wcProvider = null;
  activeProvider = null;
  activeAddress = null;
}
