/**
 * Client-side Otterful authenticated session (persists with connected wallet).
 */
export const SESSION_TOKEN_KEY = "otterfulSessionToken";
export const SESSION_EXPIRES_KEY = "otterfulSessionExpires";
export const SESSION_WALLET_KEY = "otterfulSessionWallet";
export const OTTERFUL_SESSION_READY_EVENT = "otterful:session-ready";

function notifySessionReady() {
  try {
    window.dispatchEvent(new CustomEvent(OTTERFUL_SESSION_READY_EVENT));
  } catch {
    // ignore
  }
}

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

function readWalletFromStorage() {
  try {
    const w =
      localStorage.getItem("otterfulWallet") ||
      localStorage.getItem("otterKartWallet") ||
      localStorage.getItem("otterShellRushWallet");
    if (!w || !/^0x[a-fA-F0-9]{40}$/.test(w.trim())) return null;
    return w.trim().toLowerCase();
  } catch {
    return null;
  }
}

function migrateLegacySessionStorage() {
  try {
    const legacyToken = sessionStorage.getItem(SESSION_TOKEN_KEY);
    const legacyExpires = sessionStorage.getItem(SESSION_EXPIRES_KEY);
    if (!legacyToken || !legacyExpires) return;
    if (!localStorage.getItem(SESSION_TOKEN_KEY)) {
      localStorage.setItem(SESSION_TOKEN_KEY, legacyToken);
      localStorage.setItem(SESSION_EXPIRES_KEY, legacyExpires);
      const w = readWalletFromStorage();
      if (w) localStorage.setItem(SESSION_WALLET_KEY, w);
    }
    sessionStorage.removeItem(SESSION_TOKEN_KEY);
    sessionStorage.removeItem(SESSION_EXPIRES_KEY);
  } catch {
    // ignore
  }
}

function readStoredSessionRecord() {
  migrateLegacySessionStorage();
  try {
    const token = localStorage.getItem(SESSION_TOKEN_KEY);
    const expires = Number(localStorage.getItem(SESSION_EXPIRES_KEY) || 0);
    const sessionWallet = (localStorage.getItem(SESSION_WALLET_KEY) || "").trim().toLowerCase();
    const activeWallet = readWalletFromStorage();
    if (!token || !Number.isFinite(expires) || expires <= Date.now()) {
      return null;
    }
    if (sessionWallet && activeWallet && sessionWallet !== activeWallet) {
      return null;
    }
    return { sessionToken: token, expiresAt: expires, wallet: sessionWallet || activeWallet };
  } catch {
    return null;
  }
}

export function getStoredSessionToken() {
  const record = readStoredSessionRecord();
  if (!record) return null;
  return { sessionToken: record.sessionToken, expiresAt: record.expiresAt };
}

export function clearStoredSession() {
  try {
    localStorage.removeItem(SESSION_TOKEN_KEY);
    localStorage.removeItem(SESSION_EXPIRES_KEY);
    localStorage.removeItem(SESSION_WALLET_KEY);
    sessionStorage.removeItem(SESSION_TOKEN_KEY);
    sessionStorage.removeItem(SESSION_EXPIRES_KEY);
  } catch {
    // ignore
  }
}

export function storeSession(sessionToken, expiresAt, wallet) {
  try {
    localStorage.setItem(SESSION_TOKEN_KEY, sessionToken);
    localStorage.setItem(SESSION_EXPIRES_KEY, String(expiresAt));
    const w = wallet ? String(wallet).trim().toLowerCase() : readWalletFromStorage();
    if (w) localStorage.setItem(SESSION_WALLET_KEY, w);
    sessionStorage.removeItem(SESSION_TOKEN_KEY);
    sessionStorage.removeItem(SESSION_EXPIRES_KEY);
    notifySessionReady();
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
  if (typeof data.expiresAt === "number" && data.expiresAt > Date.now()) {
    storeSession(stored.sessionToken, data.expiresAt, data.wallet);
  }
  return data;
}

/**
 * Restore or create a session for the stored wallet (silent when still valid).
 */
export async function bootstrapWalletSession(wallet) {
  const w = String(wallet || readWalletFromStorage() || "").trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(w)) return null;
  try {
    return await ensureAuthenticatedSession(w);
  } catch {
    return null;
  }
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

  storeSession(verifyData.sessionToken, verifyData.expiresAt, w);
  return verifyData;
}
