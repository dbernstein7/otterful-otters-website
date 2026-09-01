/**
 * Sync Otterful wallet + session context into game pages/iframes.
 */
import { getStoredWallet, setStoredWallet, OTTERFUL_WALLET_KEY } from "./otterful-wallet.mjs";
import {
  ensureAuthenticatedSession,
  getStoredSessionToken,
  validateStoredSession,
  bootstrapWalletSession,
} from "./otterful-session.mjs";

export const LAUNCH_MESSAGE_TYPE = "OTTERFUL_LAUNCH_SESSION";
export const GAME_WALLET_KEYS = {
  "shell-snag": "otterShellRushWallet",
  "otter-kart": "otterKartWallet",
};

export function syncWalletToGameKeys(wallet, game) {
  const normalized = setStoredWallet(wallet);
  if (!normalized) return null;

  const legacyKey = GAME_WALLET_KEYS[game];
  if (legacyKey) {
    try {
      localStorage.setItem(legacyKey, normalized);
    } catch {
      // ignore
    }
  }
  return normalized;
}

export function syncWalletToAllGameKeys(wallet) {
  const normalized = setStoredWallet(wallet);
  if (!normalized) return null;
  for (const key of Object.values(GAME_WALLET_KEYS)) {
    try {
      localStorage.setItem(key, normalized);
    } catch {
      // ignore
    }
  }
  return normalized;
}

/**
 * Prepare profile → game launch (session + wallet sync).
 */
export async function prepareGameLaunch(game, wallet) {
  const w = wallet || getStoredWallet();
  if (!w) throw new Error("Connect your wallet first.");

  const session = await ensureAuthenticatedSession(w);
  syncWalletToGameKeys(w, game);
  return { wallet: w, session };
}

export function gameLaunchUrl(path) {
  return path;
}

/** Shell Snag reads ?account= for multiplayer + rewards identity. */
export function gameIframeSrc(path, wallet) {
  const w = wallet || getStoredWallet();
  const base = String(path || "").replace(/^\//, "");
  if (!w) return base;
  return `${base}?account=${encodeURIComponent(w)}`;
}

export function applyGameIframeSrc(iframeId, path, wallet) {
  const iframe = document.getElementById(iframeId);
  if (!iframe) return null;
  iframe.src = gameIframeSrc(path, wallet);
  return iframe.src;
}

/**
 * Parent embed page: validate session and postMessage token to iframe.
 */
export async function deliverLaunchSessionToIframe(iframe, opts = {}) {
  if (!iframe?.contentWindow) return { ok: false, reason: "no_iframe" };

  const stored = getStoredSessionToken();
  if (!stored?.sessionToken) {
    const wallet = getStoredWallet();
    if (wallet) syncWalletToAllGameKeys(wallet);
    return { ok: false, reason: "no_session", wallet: wallet || null };
  }

  const validated = await validateStoredSession();
  if (!validated?.wallet) {
    return { ok: false, reason: "invalid_session" };
  }

  syncWalletToAllGameKeys(validated.wallet);

  const targetOrigin = opts.targetOrigin || window.location.origin;
  iframe.contentWindow.postMessage(
    {
      type: LAUNCH_MESSAGE_TYPE,
      v: 1,
      sessionToken: stored.sessionToken,
    },
    targetOrigin,
  );

  return { ok: true, wallet: validated.wallet };
}

export function initEmbedLaunchBridge(iframeId, opts = {}) {
  const iframe = document.getElementById(iframeId);
  if (!iframe) return;

  const targetOrigin = window.location.origin;
  const gamePath = opts.gamePath;

  const wallet = getStoredWallet();
  if (wallet) syncWalletToAllGameKeys(wallet);

  void bootstrapWalletSession(wallet);

  if (gamePath && !iframe.getAttribute("src")) {
    iframe.src = gameIframeSrc(gamePath, wallet);
  } else if (gamePath && wallet) {
    try {
      const current = new URL(iframe.src, window.location.origin);
      if (!current.searchParams.get("account")) {
        iframe.src = gameIframeSrc(gamePath, wallet);
      }
    } catch {
      iframe.src = gameIframeSrc(gamePath, wallet);
    }
  }

  async function deliver() {
    await deliverLaunchSessionToIframe(iframe, { targetOrigin });
  }

  iframe.addEventListener("load", () => {
    deliver().catch(() => {});
    setTimeout(() => deliver().catch(() => {}), 300);
    setTimeout(() => deliver().catch(() => {}), 1200);
  });

  deliver().catch(() => {});
}

/**
 * Pure helper for tests — validates incoming postMessage.
 */
export function isTrustedLaunchMessage(event, allowedOrigin) {
  if (!event || typeof event.origin !== "string") return false;
  if (event.origin !== allowedOrigin) return false;
  const data = event.data;
  if (!data || data.type !== LAUNCH_MESSAGE_TYPE || data.v !== 1) return false;
  if (typeof data.sessionToken !== "string" || !data.sessionToken.trim()) return false;
  return true;
}

export { OTTERFUL_WALLET_KEY };
