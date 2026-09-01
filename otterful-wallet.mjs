/**
 * Shared Otterful site wallet storage (profile phase).
 * Reuses builder-wallet connect modal; games are not wired yet.
 */
import { initWalletModal } from "./games/builder-wallet/wallet-modal.mjs";
import { disconnectWallet } from "./games/builder-wallet/connect.mjs";
import { clearStoredSession } from "./otterful-session.mjs";

export const OTTERFUL_WALLET_KEY = "otterfulWallet";

const LEGACY_WALLET_KEYS = ["otterShellRushWallet", "otterKartWallet"];

export function isEthAddress(addr) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(addr || "").trim());
}

export function shortWallet(addr) {
  const w = String(addr || "").trim();
  if (!isEthAddress(w)) return "";
  return `${w.slice(0, 6)}…${w.slice(-4)}`;
}

export function getStoredWallet() {
  try {
    const primary = localStorage.getItem(OTTERFUL_WALLET_KEY);
    if (primary && isEthAddress(primary)) {
      return primary.trim().toLowerCase();
    }
    for (const key of LEGACY_WALLET_KEYS) {
      const legacy = localStorage.getItem(key);
      if (legacy && isEthAddress(legacy)) {
        const normalized = legacy.trim().toLowerCase();
        localStorage.setItem(OTTERFUL_WALLET_KEY, normalized);
        return normalized;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

export function setStoredWallet(addr) {
  const normalized = addr ? String(addr).trim().toLowerCase() : "";
  try {
    if (normalized && isEthAddress(normalized)) {
      localStorage.setItem(OTTERFUL_WALLET_KEY, normalized);
      return normalized;
    }
    localStorage.removeItem(OTTERFUL_WALLET_KEY);
  } catch {
    // ignore
  }
  return null;
}

export function clearStoredWallet() {
  setStoredWallet(null);
}

/**
 * @param {{ onConnected?: (wallet: string) => void | Promise<void>, onError?: (err: Error) => void }} [opts]
 */
export function initOtterfulWallet(opts = {}) {
  const modal = initWalletModal({
    onConnected: async ({ address }) => {
      const wallet = setStoredWallet(address);
      if (wallet && opts.onConnected) {
        await opts.onConnected(wallet);
      }
    },
    onError: (err) => {
      if (opts.onError) opts.onError(err);
    },
  });

  return {
    openConnect: () => modal.open(),
    closeConnect: () => modal.close(),
    async disconnect() {
      await disconnectWallet();
      clearStoredWallet();
      clearStoredSession();
      if (opts.onDisconnected) opts.onDisconnected();
    },
  };
}
