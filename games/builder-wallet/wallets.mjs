/** Wallet registry + EIP-6963 discovery */
const WC_ASSETS = 'https://raw.githubusercontent.com/walletconnect/walletconnect-assets/master/wallets';

/** @type {Array<{ id: string, name: string, section: 'installed'|'popular'|'glyph', icon: string, rdns?: string, match?: RegExp, isWalletConnect?: boolean, downloadUrl?: string }>} */
export const WALLET_CATALOG = [
  {
    id: 'metamask',
    name: 'MetaMask',
    section: 'popular',
    icon: `${WC_ASSETS}/metamask.png`,
    rdns: 'io.metamask',
    match: /metamask/i,
    downloadUrl: 'https://metamask.io/download/',
  },
  {
    id: 'walletconnect',
    name: 'WalletConnect',
    section: 'popular',
    icon: `${WC_ASSETS}/walletconnect.png`,
    isWalletConnect: true,
  },
  {
    id: 'rainbow',
    name: 'Rainbow',
    section: 'popular',
    icon: `${WC_ASSETS}/rainbow.png`,
    rdns: 'me.rainbow',
    match: /rainbow/i,
    downloadUrl: 'https://rainbow.me/download',
  },
  {
    id: 'trust',
    name: 'Trust Wallet',
    section: 'popular',
    icon: `${WC_ASSETS}/trust.png`,
    rdns: 'com.trustwallet.app',
    match: /trust/i,
    downloadUrl: 'https://trustwallet.com/download',
  },
  {
    id: 'coinbase',
    name: 'Coinbase Wallet',
    section: 'popular',
    icon: `${WC_ASSETS}/coinbase.png`,
    rdns: 'com.coinbase.wallet',
    match: /coinbase/i,
    downloadUrl: 'https://www.coinbase.com/wallet/downloads',
  },
  {
    id: 'bitget',
    name: 'Bitget Wallet',
    section: 'popular',
    icon: `${WC_ASSETS}/bitget.png`,
    rdns: 'com.bitget.web3',
    match: /bitget|bitkeep/i,
    downloadUrl: 'https://web3.bitget.com/en/wallet-download',
  },
  {
    id: 'glyph',
    name: 'Glyph',
    section: 'glyph',
    icon: 'https://www.otterfulotters.xyz/otterre.png',
    rdns: 'com.glyph.wallet',
    match: /glyph/i,
    downloadUrl: 'https://www.glyph.tech/',
  },
  {
    id: 'phantom',
    name: 'Phantom',
    section: 'popular',
    icon: `${WC_ASSETS}/phantom.png`,
    rdns: 'app.phantom',
    match: /phantom/i,
    downloadUrl: 'https://phantom.app/download',
    hiddenUnlessInstalled: true,
  },
];

/**
 * @returns {Promise<Map<string, { info: object, provider: object }>>}
 */
export function discoverEip6963Providers(timeoutMs = 400) {
  return new Promise((resolve) => {
    /** @type {Map<string, { info: object, provider: object }>} */
    const byRdns = new Map();

    function onAnnounce(event) {
      const detail = event.detail;
      if (!detail?.info || !detail?.provider) return;
      const rdns = detail.info.rdns || detail.info.uuid || detail.info.name;
      if (rdns) byRdns.set(String(rdns), detail);
    }

    window.addEventListener('eip6963:announceProvider', onAnnounce);
    window.dispatchEvent(new Event('eip6963:requestProvider'));

    setTimeout(() => {
      window.removeEventListener('eip6963:announceProvider', onAnnounce);
      resolve(byRdns);
    }, timeoutMs);
  });
}

/**
 * @param {Map<string, { info: object, provider: object }>} announced
 */
export function resolveWalletProviders(announced) {
  const eth = window.ethereum;
  const legacyProviders = eth?.providers && Array.isArray(eth.providers) ? eth.providers : eth ? [eth] : [];

  return WALLET_CATALOG.map((def) => {
    let provider = null;
    let installed = false;
    let icon = def.icon;
    let name = def.name;

    if (def.isWalletConnect) {
      return { ...def, provider: null, installed: true, icon, name };
    }

    for (const [, detail] of announced) {
      const info = detail.info || {};
      if (def.rdns && info.rdns === def.rdns) {
        provider = detail.provider;
        installed = true;
        if (info.icon) icon = info.icon;
        if (info.name) name = info.name;
        break;
      }
      if (def.match && def.match.test(String(info.name || ''))) {
        provider = detail.provider;
        installed = true;
        if (info.icon) icon = info.icon;
        if (info.name) name = info.name;
        break;
      }
    }

    if (!provider) {
      for (const p of legacyProviders) {
        if (def.id === 'metamask' && p.isMetaMask && !p.isBraveWallet) {
          provider = p;
          installed = true;
          break;
        }
        if (def.id === 'coinbase' && p.isCoinbaseWallet) {
          provider = p;
          installed = true;
          break;
        }
        if (def.id === 'rainbow' && p.isRainbow) {
          provider = p;
          installed = true;
          break;
        }
        if (def.id === 'trust' && p.isTrust) {
          provider = p;
          installed = true;
          break;
        }
        if (def.id === 'bitget' && (p.isBitKeep || p.isBitget)) {
          provider = p;
          installed = true;
          break;
        }
        if (def.id === 'glyph' && (p.isGlyph || p.isApeWallet)) {
          provider = p;
          installed = true;
          break;
        }
        if (def.id === 'phantom' && p.isPhantom) {
          provider = p;
          installed = true;
          break;
        }
      }
    }

    if (!provider && def.id === 'glyph' && window.glyph?.ethereum) {
      provider = window.glyph.ethereum;
      installed = true;
    }

    return { ...def, provider, installed, icon, name };
  });
}
