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
export const REQUEST_LAUNCH_MESSAGE_TYPE = "OTTERFUL_REQUEST_LAUNCH_SESSION";
export const GAME_WALLET_KEYS = {
  "shell-snag": "otterShellRushWallet",
  "otter-kart": "otterKartWallet",
};

/** Cross-origin parents allowed to deliver wallet sessions into game iframes. */
export const TRUSTED_EMBED_ORIGINS = Object.freeze([
  "https://grand-theft-otter.vercel.app",
  "https://www.grandtheftotter.com",
  "https://grandtheftotter.com",
  "https://otterfulotters.xyz",
  "https://www.otterfulotters.xyz",
]);

export function getTrustedEmbedOrigins(extraOrigin) {
  const set = new Set(TRUSTED_EMBED_ORIGINS);
  if (typeof extraOrigin === "string" && extraOrigin) set.add(extraOrigin);
  if (typeof window !== "undefined" && window.location?.origin) {
    set.add(window.location.origin);
  }
  return [...set];
}

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

/** Shell Snag / OtterKart read ?account= and optional ?session= for rewards identity. */
export function gameIframeSrc(path, wallet, sessionToken) {
  const w = wallet || getStoredWallet();
  const base = String(path || "").replace(/^\//, "");
  const params = new URLSearchParams();
  if (w) params.set("account", w);
  const token =
    typeof sessionToken === "string" && sessionToken.trim()
      ? sessionToken.trim()
      : getStoredSessionToken()?.sessionToken || "";
  if (token) params.set("session", token);
  const q = params.toString();
  return q ? `${base}?${q}` : base;
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

  const targetOrigin = opts.targetOrigin || "*";
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

  const gamePath = opts.gamePath;

  const wallet = getStoredWallet();
  if (wallet) syncWalletToAllGameKeys(wallet);

  // Games use the profile session; authentication prompts belong on the profile.

  const sessionToken = getStoredSessionToken()?.sessionToken || "";

  if (gamePath && !iframe.getAttribute("src")) {
    iframe.src = gameIframeSrc(gamePath, wallet, sessionToken);
  } else if (gamePath && (wallet || sessionToken)) {
    try {
      const current = new URL(iframe.src, window.location.origin);
      const needsAccount = wallet && !current.searchParams.get("account");
      const needsSession = sessionToken && !current.searchParams.get("session");
      if (needsAccount || needsSession) {
        iframe.src = gameIframeSrc(gamePath, wallet, sessionToken);
      }
    } catch {
      iframe.src = gameIframeSrc(gamePath, wallet, sessionToken);
    }
  }

  async function deliver() {
    // "*" so cross-origin embeds (e.g. GTO) still receive the session payload;
    // the iframe validates event.origin against TRUSTED_EMBED_ORIGINS.
    await deliverLaunchSessionToIframe(iframe, { targetOrigin: "*" });
  }

  iframe.addEventListener("load", () => {
    deliver().catch(() => {});
    setTimeout(() => deliver().catch(() => {}), 300);
    setTimeout(() => deliver().catch(() => {}), 1200);
  });

  window.addEventListener("message", (event) => {
    if (!event?.data || event.data.type !== REQUEST_LAUNCH_MESSAGE_TYPE || event.data.v !== 1) {
      return;
    }
    if (!iframe.contentWindow || event.source !== iframe.contentWindow) return;
    const allowed = new Set(getTrustedEmbedOrigins(opts.allowedChildOrigin));
    try {
      const childOrigin = new URL(iframe.src, window.location.origin).origin;
      allowed.add(childOrigin);
    } catch {
      // ignore
    }
    if (!allowed.has(event.origin)) return;
    deliver().catch(() => {});
  });

  deliver().catch(() => {});
}

/**
 * Pure helper for tests — validates incoming postMessage.
 * @param {MessageEvent} event
 * @param {string | string[]} allowedOrigin single origin or list (iframe origin + trusted parents)
 */
export function isTrustedLaunchMessage(event, allowedOrigin) {
  if (!event || typeof event.origin !== "string") return false;
  const allowed = Array.isArray(allowedOrigin)
    ? allowedOrigin
    : typeof allowedOrigin === "string" && allowedOrigin
      ? [allowedOrigin]
      : [];
  if (!allowed.includes(event.origin)) return false;
  const data = event.data;
  if (!data || data.type !== LAUNCH_MESSAGE_TYPE || data.v !== 1) return false;
  if (typeof data.sessionToken !== "string" || !data.sessionToken.trim()) return false;
  return true;
}

export { OTTERFUL_WALLET_KEY };
