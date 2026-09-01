/**
 * Otter Kart — wallet connect, Drip rewards check, and shell claim.
 * Server: /api/otter-kart/rewards/* (separate from Shell Rush /api/rewards/*).
 */
import { getStoredSessionToken } from "/otterful-session.mjs";
import {
  applySessionToRewardBody,
  formatClamCreditMessage,
  hasOtterfulRewardSession,
} from "/games/otterful-rewards-client.mjs";
import { resolveOtterfulWallet } from "/games/otterful-wallet-shim.mjs";

const MAX_SHELLS_PER_CLAIM = 50000;
const WALLET_STORAGE_KEY = "otterKartWallet";
const OTTERFUL_WALLET_KEY = "otterfulWallet";
const CHECK_URL = "/api/rewards/check";
const AWARD_URL = "/api/rewards/award";
const GAME_ID = "otter-kart";

/** @type {string | null} */
let connectedWallet = null;

export function getConnectedWallet() {
  if (connectedWallet) return connectedWallet;
  const resolved = resolveOtterfulWallet();
  if (resolved) {
    setConnectedWallet(resolved);
    return connectedWallet;
  }
  try {
    const shared = localStorage.getItem(OTTERFUL_WALLET_KEY);
    if (shared && isEthAddress(shared)) {
      setConnectedWallet(shared.trim().toLowerCase());
      return connectedWallet;
    }
    const s = localStorage.getItem(WALLET_STORAGE_KEY);
    if (s && isEthAddress(s)) {
      const normalized = s.trim().toLowerCase();
      connectedWallet = normalized;
      try {
        localStorage.setItem(OTTERFUL_WALLET_KEY, normalized);
      } catch {
        // ignore
      }
      return normalized;
    }
  } catch {
    // ignore
  }
  return null;
}

function setConnectedWallet(addr) {
  connectedWallet = addr ? String(addr).trim().toLowerCase() : null;
  try {
    if (connectedWallet) {
      localStorage.setItem(WALLET_STORAGE_KEY, connectedWallet);
      localStorage.setItem(OTTERFUL_WALLET_KEY, connectedWallet);
    } else {
      localStorage.removeItem(WALLET_STORAGE_KEY);
    }
  } catch {
    // ignore
  }
}

export function isEthAddress(addr) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(addr || "").trim());
}

export function shortWallet(addr) {
  const w = String(addr || "").trim();
  if (!isEthAddress(w)) return "";
  return `${w.slice(0, 6)}…${w.slice(-4)}`;
}

function getEthereum() {
  const eth = typeof window !== "undefined" ? window.ethereum : null;
  return eth && typeof eth.request === "function" ? eth : null;
}

export async function requestWalletAccounts() {
  const eth = getEthereum();
  if (!eth) return null;
  try {
    const accounts = await eth.request({ method: "eth_requestAccounts" });
    return Array.isArray(accounts) ? accounts : null;
  } catch {
    return null;
  }
}

async function personalSign(message, address) {
  const eth = getEthereum();
  if (!eth) return null;
  try {
    const sig = await eth.request({
      method: "personal_sign",
      params: [message, address],
    });
    return typeof sig === "string" ? sig : null;
  } catch {
    return null;
  }
}

function attestationMessage(wallet, shells, runId, issuedAtSec) {
  return [
    "Otter Kart - Shells Collected",
    "v1",
    `wallet:${wallet.toLowerCase()}`,
    `shells:${shells}`,
    `runId:${runId}`,
    `issuedAt:${issuedAtSec}`,
  ].join("\n");
}

function checkMessage(wallet, issuedAtSec) {
  return [
    "Otter Kart - Rewards Check",
    "v1",
    `wallet:${wallet.toLowerCase()}`,
    `issuedAt:${issuedAtSec}`,
  ].join("\n");
}

async function resolveActiveWallet(preferred, opts = {}) {
  const skipAccountRequest = !!opts.skipAccountRequest;
  let wallet = typeof preferred === "string" ? preferred.trim() : "";
  if (!wallet) wallet = getConnectedWallet() || "";
  if (!skipAccountRequest) {
    const accounts = await requestWalletAccounts();
    if (accounts?.length) wallet = String(accounts[0] || "").trim();
  }
  if (wallet && isEthAddress(wallet)) {
    setConnectedWallet(wallet);
    return wallet;
  }
  return null;
}

export async function connectAndCheckRewards(preferredWallet) {
  const eth = getEthereum();
  if (!eth) {
    return {
      ok: false,
      tone: "bad",
      text: "No browser wallet found. Install MetaMask or Glyph, then try again.",
    };
  }

  const wallet = await resolveActiveWallet(preferredWallet || getConnectedWallet() || "", {
    skipAccountRequest: !!getConnectedWallet() || hasOtterfulRewardSession(),
  });
  if (!wallet) {
    return {
      ok: false,
      tone: "warn",
      text: "Wallet connection was cancelled or no account was returned.",
    };
  }

  const check = await checkRewardsStatus(wallet, { skipAccountRequest: true });
  const msg = formatCheckResult(check);
  return {
    ok: check.kind === "ok",
    tone: msg.tone,
    text: msg.text,
    wallet,
  };
}

export async function checkRewardsStatus(preferredWallet, opts = {}) {
  const skipAccountRequest = !!opts.skipAccountRequest;
  const walletRaw = typeof preferredWallet === "string" ? preferredWallet.trim() : "";
  if (!walletRaw) return { kind: "no_identity" };

  const issuedAtSec = Math.floor(Date.now() / 1000);
  let wallet = walletRaw;
  const session = getStoredSessionToken();
  if (!skipAccountRequest && !session?.sessionToken) {
    const accounts = await requestWalletAccounts();
    if (accounts?.length) wallet = String(accounts[0] || "").trim();
  }

  if (!wallet || !isEthAddress(wallet)) return { kind: "no_signature" };

  let body = { game: GAME_ID, wallet, issuedAtSec };
  if (session?.sessionToken) {
    body = applySessionToRewardBody(body);
  } else {
    const message = checkMessage(wallet, issuedAtSec);
    const signature = await personalSign(message, wallet);
    if (!signature) return { kind: "no_signature" };
    body.signature = signature;
  }

  const res = await fetch(CHECK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));

  if (data?.ok === true && data?.skipped === "not_configured") {
    return { kind: "not_configured" };
  }
  if (data?.ok === false && data?.code === "invalid_signature") {
    return { kind: "error", message: "Invalid or expired signature." };
  }
  if (!res.ok && typeof data?.message === "string") {
    return { kind: "error", message: data.message };
  }
  if (data?.ok === false && typeof data?.message === "string") {
    return { kind: "error", message: data.message };
  }
  if (data?.ok === true && data?.found === false) return { kind: "not_found" };
  if (
    data?.ok === true &&
    data?.found === true &&
    typeof data.dripId === "string" &&
    (data.balance === null || typeof data.balance === "number")
  ) {
    setConnectedWallet(wallet);
    return {
      kind: "ok",
      dripId: data.dripId,
      balance: data.balance === null ? null : data.balance,
    };
  }
  return { kind: "error", message: "Unexpected response from rewards check." };
}

export function formatCheckResult(result) {
  switch (result.kind) {
    case "not_configured":
      return {
        text: "Otter Kart rewards are not configured on the server yet.",
        tone: "warn",
      };
    case "no_identity":
      return {
        text: "Connect with your wallet to earn Otter Kart drip points.",
        tone: "warn",
      };
    case "no_signature":
      return {
        text: "Approve the wallet signature prompt to verify rewards. If nothing appears, unlock your wallet extension.",
        tone: "warn",
      };
    case "not_found":
      return {
        text: "No Otter Kart rewards profile found for this wallet. Join the Otter Army program first.",
        tone: "bad",
      };
    case "ok":
      return {
        text:
          result.balance === null
            ? "You're linked for Otter Kart rewards. Session shells can be claimed to drip points."
            : `You're linked for Otter Kart rewards. Current drip points: ${result.balance}.`,
        tone: "ok",
      };
    case "error":
      return { text: result.message, tone: "bad" };
    default:
      return { text: "Could not verify rewards.", tone: "bad" };
  }
}

function isClamAwardSuccess(data) {
  if (!data || typeof data.clamBalance !== "number") return false;
  return (
    data.ok === true ||
    data.clamCredited === true ||
    data.alreadyCredited === true ||
    data.clamStatus === "credited" ||
    data.clamStatus === "duplicate"
  );
}

function buildClaimSuccess(capped, data) {
  return {
    ok: true,
    tone: "ok",
    text: formatClamCreditMessage(capped, data),
    balance: typeof data.balance === "number" ? data.balance : undefined,
    dripId: typeof data.dripId === "string" ? data.dripId : undefined,
    clamBalance: data.clamBalance,
    clamTxId: data.clamTxId,
    shells: capped,
    alreadyCredited: data.alreadyCredited === true,
  };
}

export async function claimSessionShells(shells, runId, score) {
  const wallet =
    getConnectedWallet() ||
    (await resolveActiveWallet("", {
      skipAccountRequest: !!getConnectedWallet() || hasOtterfulRewardSession(),
    }));
  if (!wallet) {
    return {
      ok: false,
      tone: "warn",
      text: "Connect your wallet on the profile page first.",
    };
  }

  const capped = Math.min(Math.max(0, Math.floor(shells)), MAX_SHELLS_PER_CLAIM);
  if (capped <= 0) {
    return {
      ok: false,
      tone: "warn",
      text: "No shells to claim yet. Play a race and collect shells first.",
    };
  }

  const issuedAtSec = Math.floor(Date.now() / 1000);
  const id =
    typeof runId === "string" && runId.trim()
      ? runId.trim()
      : `otterkart-${issuedAtSec}-${Math.random().toString(36).slice(2, 10)}`;

  const session = getStoredSessionToken();
  let body = { game: GAME_ID, wallet, shells: capped, runId: id, issuedAtSec };
  if (typeof score === "number" && Number.isFinite(score)) {
    body.score = Math.max(0, Math.floor(score));
  }

  if (session?.sessionToken) {
    body = applySessionToRewardBody(body);
  } else {
    const message = attestationMessage(wallet, capped, id, issuedAtSec);
    const signature = await personalSign(message, wallet);
    if (!signature) {
      return {
        ok: false,
        tone: "warn",
        text: "No wallet signature detected. Unlock your wallet and try again.",
      };
    }
    body.signature = signature;
  }

  const res = await fetch(AWARD_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));

  if (isClamAwardSuccess(data)) {
    return buildClaimSuccess(capped, data);
  }

  if (!res.ok) {
    return {
      ok: false,
      tone: "bad",
      text: String(data.message ?? res.statusText ?? "Request failed"),
    };
  }

  if (data?.ok === true && data?.skipped === "not_configured") {
    return {
      ok: false,
      tone: "warn",
      text: "Otter Kart rewards are not configured on the server yet.",
    };
  }
  if (data?.ok === true && data?.skipped === "no_member") {
    return {
      ok: false,
      tone: "bad",
      text: "This wallet is not enrolled for Otter Kart rewards yet (no member found).",
    };
  }
  if (data?.ok === false && data?.code === "invalid_signature") {
    return {
      ok: false,
      tone: "bad",
      text: "Invalid or expired signature.",
    };
  }
  if (data?.ok === false && typeof data.code === "string") {
    return {
      ok: false,
      tone: "bad",
      text: String(data.message ?? "Rewards request failed"),
    };
  }

  return {
    ok: false,
    tone: "bad",
    text: "Unexpected response from rewards server.",
  };
}
