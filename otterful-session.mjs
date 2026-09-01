/**
 * Client-side Otterful authenticated session (short-lived, signed once).
 */
export const SESSION_TOKEN_KEY = "otterfulSessionToken";
export const SESSION_EXPIRES_KEY = "otterfulSessionExpires";

function getEthereum() {
  const eth = typeof window !== "undefined" ? window.ethereum : null;
  return eth && typeof eth.request === "function" ? eth : null;
}

async function personalSign(message, address) {
  const eth = getEthereum();
  if (!eth) throw new Error("No browser wallet found.");
  const sig = await eth.request({
    method: "personal_sign",
    params: [message, address],
  });
  if (typeof sig !== "string" || !sig.startsWith("0x")) {
    throw new Error("Wallet signature was not returned.");
  }
  return sig;
}

export function getStoredSessionToken() {
  try {
    const token = sessionStorage.getItem(SESSION_TOKEN_KEY);
    const expires = Number(sessionStorage.getItem(SESSION_EXPIRES_KEY) || 0);
    if (!token || !Number.isFinite(expires) || expires <= Date.now()) {
      return null;
    }
    return { sessionToken: token, expiresAt: expires };
  } catch {
    return null;
  }
}

export function clearStoredSession() {
  try {
    sessionStorage.removeItem(SESSION_TOKEN_KEY);
    sessionStorage.removeItem(SESSION_EXPIRES_KEY);
  } catch {
    // ignore
  }
}

export function storeSession(sessionToken, expiresAt) {
  try {
    sessionStorage.setItem(SESSION_TOKEN_KEY, sessionToken);
    sessionStorage.setItem(SESSION_EXPIRES_KEY, String(expiresAt));
  } catch {
    // ignore
  }
}

export async function validateStoredSession() {
  const stored = getStoredSessionToken();
  if (!stored) return null;

  const res = await fetch("/api/session/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionToken: stored.sessionToken }),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok || !data.wallet) {
    clearStoredSession();
    return null;
  }
  return data;
}

/**
 * Ensure a signed, server-validated session exists for the wallet.
 * Skips signing when a valid session is already stored.
 */
export async function ensureAuthenticatedSession(wallet) {
  const w = String(wallet || "").trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(w)) {
    throw new Error("Valid wallet address required.");
  }

  const existing = await validateStoredSession();
  if (existing?.wallet === w) {
    return existing;
  }
  clearStoredSession();

  const nonceRes = await fetch("/api/session/nonce", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet: w }),
    cache: "no-store",
  });
  const nonceData = await nonceRes.json().catch(() => ({}));
  if (!nonceRes.ok || !nonceData?.ok || !nonceData.message) {
    throw new Error(nonceData?.message || "Could not start wallet session.");
  }

  const signature = await personalSign(nonceData.message, w);

  const verifyRes = await fetch("/api/session/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      wallet: w,
      nonce: nonceData.nonce,
      issuedAtSec: nonceData.issuedAtSec,
      signature,
    }),
    cache: "no-store",
  });
  const verifyData = await verifyRes.json().catch(() => ({}));
  if (!verifyRes.ok || !verifyData?.ok || !verifyData.sessionToken) {
    throw new Error(verifyData?.message || "Wallet session verification failed.");
  }

  storeSession(verifyData.sessionToken, verifyData.expiresAt);
  return verifyData;
}
