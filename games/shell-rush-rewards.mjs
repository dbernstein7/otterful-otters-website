/**
 * Shell Rush / Snag Drip rewards — wallet connect, status check, and claim.
 * Matches the embedded Shell Snag game API (/api/rewards/check, /api/rewards/award).
 */

const MAX_SHELLS_PER_CLAIM = 50000;
const WALLET_STORAGE_KEY = "otterShellRushWallet";
const OTTERFUL_WALLET_KEY = "otterfulWallet";

/** @type {string | null} */
let connectedWallet = null;

export function getConnectedWallet() {
  if (connectedWallet) return connectedWallet;
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
    "Otter Shell Rush — shells collected attestation",
    "v1",
    `wallet:${wallet.toLowerCase()}`,
    `shells:${shells}`,
    `runId:${runId}`,
    `issuedAt:${issuedAtSec}`,
  ].join("\n");
}

function checkMessage(wallet, issuedAtSec) {
  return [
    "Otter Shell Rush — rewards status check",
    "v1",
    `wallet:${wallet.toLowerCase()}`,
    `issuedAt:${issuedAtSec}`,
  ].join("\n");
}

async function resolveActiveWallet(preferred) {
  let wallet = typeof preferred === "string" ? preferred.trim() : "";
  const accounts = await requestWalletAccounts();
  if (accounts?.length) wallet = String(accounts[0] || "").trim();
  if (wallet && isEthAddress(wallet)) {
    setConnectedWallet(wallet);
    return wallet;
  }
  return null;
}

/**
 * Connect wallet and verify Snag Drip rewards enrollment (same as Shell Snag “Check rewards status”).
 * @returns {Promise<{ ok: boolean, text: string, tone: 'ok' | 'warn' | 'bad', wallet?: string }>}
 */
export async function connectAndCheckRewards(preferredWallet) {
  const eth = getEthereum();
  if (!eth) {
    return {
      ok: false,
      tone: "bad",
      text: "No browser wallet found. Install MetaMask or Glyph, then try again.",
    };
  }

  const wallet = await resolveActiveWallet(preferredWallet || getConnectedWallet() || "");
  if (!wallet) {
    return {
      ok: false,
      tone: "warn",
      text: "Wallet connection was cancelled or no account was returned.",
    };
  }

  const check = await checkRewardsStatus(wallet);
  const msg = formatCheckResult(check);
  return {
    ok: check.kind === "ok",
    tone: msg.tone,
    text: msg.text,
    wallet,
  };
}

/**
 * @returns {Promise<
 *   | { kind: 'not_configured' }
 *   | { kind: 'no_identity' }
 *   | { kind: 'no_signature' }
 *   | { kind: 'not_found' }
 *   | { kind: 'ok', dripId: string, balance: number | null }
 *   | { kind: 'error', message: string }
 * >}
 */
export async function checkRewardsStatus(preferredWallet) {
  const walletRaw = typeof preferredWallet === "string" ? preferredWallet.trim() : "";
  if (!walletRaw) return { kind: "no_identity" };

  const issuedAtSec = Math.floor(Date.now() / 1000);
  let wallet = walletRaw;
  const accounts = await requestWalletAccounts();
  if (accounts?.length) wallet = String(accounts[0] || "").trim();

  if (!wallet || !isEthAddress(wallet)) return { kind: "no_signature" };

  const message = checkMessage(wallet, issuedAtSec);
  const signature = await personalSign(message, wallet);
  if (!signature) return { kind: "no_signature" };

  const body = { wallet, issuedAtSec, signature };
  const res = await fetch("/api/rewards/check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));

  if (data?.ok === true && data?.skipped === "not_configured") {
    return { kind: "not_configured" };
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

/** @param {ReturnType<typeof checkRewardsStatus> extends Promise<infer T> ? T : never} result */
export function formatCheckResult(result) {
  switch (result.kind) {
    case "not_configured":
      return {
        text: "Rewards server is not configured yet (missing server environment keys).",
        tone: "warn",
      };
    case "no_identity":
      return {
        text: "Connect with your wallet to earn Otter Shell Rush drip points.",
        tone: "warn",
      };
    case "no_signature":
      return {
        text: "Approve the wallet signature prompt to verify rewards. If nothing appears, unlock your wallet extension.",
        tone: "warn",
      };
    case "not_found":
      return {
        text: "No rewards profile found for this wallet in the Otter Shell Rush program. Join or link this wallet where you manage rewards.",
        tone: "bad",
      };
    case "ok":
      return {
        text:
          result.balance === null
            ? "You're linked for Otter Shell Rush rewards. Session shells can be claimed to drip points."
            : `You're linked for Otter Shell Rush rewards. Current drip points: ${result.balance}.`,
        tone: "ok",
      };
    case "error":
      return { text: result.message, tone: "bad" };
    default:
      return { text: "Could not verify rewards.", tone: "bad" };
  }
}

/**
 * Claim session shells to Snag Drip (same as Shell Snag end-of-run claim).
 * @param {number} shells
 * @param {string} [runId]
 * @param {number} [score]
 */
export async function claimSessionShells(shells, runId, score) {
  const wallet = getConnectedWallet() || (await resolveActiveWallet(""));
  if (!wallet) {
    return {
      ok: false,
      tone: "warn",
      text: "Connect your wallet on the start screen first, then claim.",
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

  const message = attestationMessage(wallet, capped, id, issuedAtSec);
  const signature = await personalSign(message, wallet);
  if (!signature) {
    return {
      ok: false,
      tone: "warn",
      text: "No wallet signature detected. Unlock your wallet and try again.",
    };
  }

  const body = { wallet, shells: capped, runId: id, issuedAtSec, signature };
  if (typeof score === "number" && Number.isFinite(score)) {
    body.score = Math.max(0, Math.floor(score));
  }

  const res = await fetch("/api/rewards/award", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));

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
      text: "Rewards server is not configured yet.",
    };
  }
  if (data?.ok === true && data?.skipped === "no_member") {
    return {
      ok: false,
      tone: "bad",
      text: "This wallet is not enrolled for rewards yet (no member found).",
    };
  }
  if (data?.ok === true && typeof data.dripId === "string" && typeof data.balance === "number") {
    return {
      ok: true,
      tone: "ok",
      text: `Claimed ${capped} shells. New drip points balance: ${data.balance}.`,
      balance: data.balance,
      dripId: data.dripId,
      shells: capped,
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
