/**
 * In-game iframe bridge: accept validated Otterful launch sessions.
 * Rewards still require their own signed attestations.
 */
import {
  LAUNCH_MESSAGE_TYPE,
  syncWalletToAllGameKeys,
  isTrustedLaunchMessage,
} from "/otterful-game-launch.mjs";
import { getStoredWallet, OTTERFUL_WALLET_KEY } from "/otterful-wallet.mjs";

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
  return data.wallet;
}

function bootstrapFromSharedStorage() {
  const wallet = getStoredWallet();
  if (wallet) syncWalletToAllGameKeys(wallet);
  return wallet;
}

export function initOtterfulGameBridge() {
  bootstrapFromSharedStorage();

  const allowedOrigin = window.location.origin;

  window.addEventListener("message", (event) => {
    if (!isTrustedLaunchMessage(event, allowedOrigin)) return;
    applySessionToken(event.data.sessionToken).catch(() => {});
  });
}

if (typeof window !== "undefined") {
  initOtterfulGameBridge();
}

export { LAUNCH_MESSAGE_TYPE, OTTERFUL_WALLET_KEY };
