/**
 * In-game iframe bridge: wallet + session sync for auto-credit rewards.
 */
import {
  LAUNCH_MESSAGE_TYPE,
  syncWalletToAllGameKeys,
  isTrustedLaunchMessage,
} from "/otterful-game-launch.mjs";
import { getStoredWallet, OTTERFUL_WALLET_KEY } from "/otterful-wallet.mjs";
import { applyOtterfulWalletShim } from "/games/otterful-wallet-shim.mjs";
import { initOtterfulAutoClaim } from "/games/otterful-auto-claim.mjs";
import { storeSession, bootstrapWalletSession } from "/otterful-session.mjs";

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

function bootstrapFromSharedStorage() {
  const wallet = getStoredWallet();
  if (wallet) syncWalletToAllGameKeys(wallet);
  applyOtterfulWalletShim();
  return wallet;
}

export function initOtterfulGameBridge() {
  bootstrapFromSharedStorage();
  initOtterfulAutoClaim();
  void bootstrapWalletSession();

  const allowedOrigin = window.location.origin;

  window.addEventListener("message", (event) => {
    if (!isTrustedLaunchMessage(event, allowedOrigin)) return;
    applySessionToken(event.data.sessionToken).catch(() => {});
  });

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
