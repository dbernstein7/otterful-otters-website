/**
 * In-game iframe bridge: wallet + session sync for auto-credit rewards.
 */
import {
  LAUNCH_MESSAGE_TYPE,
  REQUEST_LAUNCH_MESSAGE_TYPE,
  syncWalletToAllGameKeys,
  isTrustedLaunchMessage,
  getTrustedEmbedOrigins,
} from "/otterful-game-launch.mjs";
import { getStoredWallet, OTTERFUL_WALLET_KEY } from "/otterful-wallet.mjs";
import { applyOtterfulWalletShim } from "/games/otterful-wallet-shim.mjs";
import { initOtterfulAutoClaim, ensureRewardSessionReady } from "/games/otterful-auto-claim.mjs";
import { storeSession } from "/otterful-session.mjs";

async function applySessionToken(sessionToken) {
  const res = await fetch("/api/session/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionToken }),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok || !data.wallet) return null;
  syncWalletToAllGameKeys(data.wallet);
  if (typeof data.expiresAt === "number" && data.expiresAt > Date.now()) {
    storeSession(sessionToken, data.expiresAt, data.wallet);
  } else {
    storeSession(sessionToken, Date.now() + 604800000, data.wallet);
  }
  applyOtterfulWalletShim();
  return data.wallet;
}

function readSessionFromUrl() {
  try {
    if (typeof window.__otterfulLaunchSession === "string" && window.__otterfulLaunchSession.trim()) {
      return window.__otterfulLaunchSession.trim();
    }
    const params = new URLSearchParams(window.location.search);
    const token =
      params.get("session") ||
      params.get("sessionToken") ||
      params.get("otterfulSession");
    if (typeof token === "string" && token.trim()) return token.trim();
  } catch {
    // ignore
  }
  return null;
}

function bootstrapFromSharedStorage() {
  const wallet = getStoredWallet();
  if (wallet) syncWalletToAllGameKeys(wallet);
  applyOtterfulWalletShim();
  return wallet;
}

function requestSessionFromParent() {
  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: REQUEST_LAUNCH_MESSAGE_TYPE, v: 1 }, "*");
    }
  } catch {
    // ignore cross-origin access errors
  }
}

export function initOtterfulGameBridge() {
  bootstrapFromSharedStorage();
  initOtterfulAutoClaim();

  const urlSession = readSessionFromUrl();
  if (urlSession) {
    applySessionToken(urlSession)
      .then(() => ensureRewardSessionReady())
      .catch(() => {
        void ensureRewardSessionReady();
      });
  } else {
    void ensureRewardSessionReady();
  }

  const allowedOrigins = getTrustedEmbedOrigins(window.location.origin);

  window.addEventListener("message", (event) => {
    if (!isTrustedLaunchMessage(event, allowedOrigins)) return;
    applySessionToken(event.data.sessionToken)
      .then(() => ensureRewardSessionReady())
      .catch(() => {});
  });

  requestSessionFromParent();
  for (const delay of [400, 1500, 3500]) {
    window.setTimeout(requestSessionFromParent, delay);
  }

  window.addEventListener("storage", (event) => {
    if (
      event.key === OTTERFUL_WALLET_KEY ||
      event.key === "otterShellRushWallet" ||
      event.key === "otterKartWallet"
    ) {
      bootstrapFromSharedStorage();
    }
  });
}

if (typeof window !== "undefined") {
  initOtterfulGameBridge();
}

export { LAUNCH_MESSAGE_TYPE, OTTERFUL_WALLET_KEY };
