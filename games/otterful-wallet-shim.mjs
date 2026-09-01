/**
 * Avoid redundant wallet popups when Otterful profile already connected.
 * Patches window.ethereum.request so eth_requestAccounts returns the stored wallet.
 */
import { getStoredWallet, OTTERFUL_WALLET_KEY } from "/otterful-wallet.mjs";
import { GAME_WALLET_KEYS } from "/otterful-game-launch.mjs";

export const OTTERFUL_WALLET_READY_EVENT = "otterful:wallet-ready";

function isEthAddress(addr) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(addr || "").trim());
}

function readAccountFromUrl() {
  try {
    const account = new URLSearchParams(window.location.search).get("account");
    if (account && isEthAddress(account)) {
      return account.trim().toLowerCase();
    }
  } catch {
    // ignore
  }
  return null;
}

function readInjectedWallet() {
  try {
    const w = window.__otterfulConnectedWallet;
    if (w && isEthAddress(w)) {
      return String(w).trim().toLowerCase();
    }
  } catch {
    // ignore
  }
  return null;
}

function readLegacyWallet() {
  try {
    for (const key of Object.values(GAME_WALLET_KEYS)) {
      const v = localStorage.getItem(key);
      if (v && /^0x[a-fA-F0-9]{40}$/.test(v.trim())) {
        return v.trim().toLowerCase();
      }
    }
  } catch {
    // ignore
  }
  return null;
}

export function resolveOtterfulWallet() {
  return getStoredWallet() || readLegacyWallet() || readInjectedWallet() || readAccountFromUrl();
}

/** Persist embed / URL wallet into shared Otterful storage keys. */
export function syncEmbedWallet(wallet) {
  const w = wallet ? String(wallet).trim().toLowerCase() : resolveOtterfulWallet();
  if (!w || !isEthAddress(w)) return null;
  try {
    localStorage.setItem(OTTERFUL_WALLET_KEY, w);
    for (const key of Object.values(GAME_WALLET_KEYS)) {
      localStorage.setItem(key, w);
    }
    window.__otterfulConnectedWallet = w;
  } catch {
    // ignore
  }
  return w;
}

let shimApplied = false;

export function applyOtterfulWalletShim() {
  const wallet = syncEmbedWallet() || resolveOtterfulWallet();
  if (!wallet) return null;

  try {
    window.__otterfulConnectedWallet = wallet;
  } catch {
    // ignore
  }

  const eth = typeof window !== "undefined" ? window.ethereum : null;
  if (eth && typeof eth.request === "function" && !eth.__otterfulShimmed) {
    const originalRequest = eth.request.bind(eth);
    eth.request = async (args) => {
      const method = args && typeof args === "object" ? args.method : args;
      if (method === "eth_requestAccounts" || method === "eth_accounts") {
        return [wallet];
      }
      return originalRequest(args);
    };
    eth.__otterfulShimmed = true;
  }

  if (!shimApplied) {
    shimApplied = true;
    try {
      window.dispatchEvent(
        new CustomEvent(OTTERFUL_WALLET_READY_EVENT, { detail: { wallet } }),
      );
    } catch {
      // ignore
    }
  }

  return wallet;
}

export { OTTERFUL_WALLET_KEY };
