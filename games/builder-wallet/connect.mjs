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
 * Injected wallet (Glyph, MetaMask, Rabby, etc.)
 */
async function connectInjected() {
  const eth = window.ethereum;
  if (!eth) throw new Error('No browser wallet found. Use WalletConnect instead.');
  await ensureApeChain(eth);
  const accounts = await eth.request({ method: 'eth_requestAccounts' });
  if (!accounts?.length) throw new Error('Wallet connection was cancelled.');
  activeProvider = eth;
  activeAddress = accounts[0].toLowerCase();
  return { address: activeAddress, provider: eth, kind: 'injected' };
}

/**
 * WalletConnect v2 (supports mobile wallets, Glyph via WC, etc.)
 * @see https://docs.walletconnect.com/
 */
async function connectWalletConnect() {
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
