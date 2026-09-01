const crypto = require("crypto");
const { kvGet, kvSet, kvDel, isKvConfigured } = require("../otter-kart-leaderboard/kv.js");
const { buildSessionMessage } = require("./attestation.js");
const { verifySessionSignature } = require("./verify.js");
const { getSessionConfig } = require("./env.js");

const NONCE_PREFIX = "otterful:session:nonce";
const TOKEN_PREFIX = "otterful:session:token";

function isEthAddress(addr) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(addr || "").trim());
}

function normalizeWallet(wallet) {
  const w = String(wallet || "").trim().toLowerCase();
  if (!isEthAddress(w)) return null;
  return w;
}

function nonceKey(wallet) {
  return `${NONCE_PREFIX}:${wallet}`;
}

function tokenKey(token) {
  return `${TOKEN_PREFIX}:${token}`;
}

function createNonceValue() {
  return crypto.randomBytes(16).toString("hex");
}

function createSessionToken() {
  return crypto.randomBytes(24).toString("hex");
}

async function issueNonce(wallet, opts = {}) {
  const config = opts.config || getSessionConfig(opts.env);
  if (!isKvConfigured()) {
    return { ok: false, code: "not_configured", message: "Session storage is not configured." };
  }

  const normalized = normalizeWallet(wallet);
  if (!normalized) {
    return { ok: false, code: "bad_wallet", message: "Valid wallet address required." };
  }

  const issuedAtSec = Math.floor(Date.now() / 1000);
  const nonce = createNonceValue();
  const expiresAt = issuedAtSec + config.nonceTtlSec;

  await kvSet(nonceKey(normalized), JSON.stringify({ nonce, issuedAtSec, expiresAt }));

  return {
    ok: true,
    wallet: normalized,
    nonce,
    issuedAtSec,
    expiresAtSec: expiresAt,
    message: buildSessionMessage(normalized, nonce, issuedAtSec),
  };
}

async function createSessionFromSignature(body, opts = {}) {
  const config = opts.config || getSessionConfig(opts.env);
  if (!isKvConfigured()) {
    return { ok: false, code: "not_configured", message: "Session storage is not configured." };
  }

  const wallet = normalizeWallet(body?.wallet);
  const nonce = typeof body?.nonce === "string" ? body.nonce.trim() : "";
  const signature = typeof body?.signature === "string" ? body.signature.trim() : "";
  const issuedAtSec =
    typeof body?.issuedAtSec === "number" && Number.isFinite(body.issuedAtSec)
      ? Math.floor(body.issuedAtSec)
      : NaN;
  const nowSec = Math.floor(Date.now() / 1000);

  if (!wallet || !nonce || !signature) {
    return { ok: false, code: "bad_request", message: "wallet, nonce, and signature are required." };
  }

  const rawNonce = await kvGet(nonceKey(wallet));
  if (!rawNonce) {
    return { ok: false, code: "invalid_nonce", message: "Nonce expired or not found." };
  }

  let nonceRecord;
  try {
    nonceRecord = JSON.parse(rawNonce);
  } catch {
    return { ok: false, code: "invalid_nonce", message: "Nonce expired or not found." };
  }

  if (!nonceRecord || nonceRecord.nonce !== nonce) {
    return { ok: false, code: "invalid_nonce", message: "Nonce does not match." };
  }
  if (Number(nonceRecord.expiresAt) <= nowSec) {
    await kvDel(nonceKey(wallet)).catch(() => {});
    return { ok: false, code: "invalid_nonce", message: "Nonce expired." };
  }

  const effectiveIssuedAt = Number.isFinite(issuedAtSec)
    ? issuedAtSec
    : Number(nonceRecord.issuedAtSec);

  const good = await verifySessionSignature({
    wallet,
    nonce,
    issuedAtSec: effectiveIssuedAt,
    signature,
  });
  if (!good) {
    return { ok: false, code: "invalid_signature", message: "Invalid wallet signature." };
  }

  await kvDel(nonceKey(wallet)).catch(() => {});

  const sessionToken = createSessionToken();
  const createdAt = Date.now();
  const expiresAt = createdAt + config.sessionTtlSec * 1000;

  await kvSet(tokenKey(sessionToken), JSON.stringify({ wallet, createdAt, expiresAt }));

  return {
    ok: true,
    sessionToken,
    wallet,
    createdAt,
    expiresAt,
    expiresAtSec: Math.floor(expiresAt / 1000),
  };
}

async function validateSessionToken(sessionToken, opts = {}) {
  if (!isKvConfigured()) {
    return { ok: false, code: "not_configured", message: "Session storage is not configured." };
  }

  const token = String(sessionToken || "").trim();
  if (!token || token.length > 128) {
    return { ok: false, code: "bad_token", message: "Invalid session token." };
  }

  const raw = await kvGet(tokenKey(token));
  if (!raw) {
    return { ok: false, code: "invalid_session", message: "Session not found or expired." };
  }

  let record;
  try {
    record = JSON.parse(raw);
  } catch {
    return { ok: false, code: "invalid_session", message: "Session not found or expired." };
  }

  const now = Date.now();
  if (!record?.wallet || Number(record.expiresAt) <= now) {
    await kvDel(tokenKey(token)).catch(() => {});
    return { ok: false, code: "expired_session", message: "Session expired." };
  }

  return {
    ok: true,
    wallet: normalizeWallet(record.wallet),
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    expiresAtSec: Math.floor(Number(record.expiresAt) / 1000),
  };
}

module.exports = {
  NONCE_PREFIX,
  TOKEN_PREFIX,
  normalizeWallet,
  buildSessionMessage,
  issueNonce,
  createSessionFromSignature,
  validateSessionToken,
};
