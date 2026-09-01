const { verifyMessage } = require("viem");
const { buildAwardAttestation, buildCheckAttestation } = require("./attestation.js");

const MAX_ISSUED_AGE_SEC = 900;

function isHexSig(s) {
  return /^0x[0-9a-fA-F]{130}$/.test(s) || /^0x[0-9a-fA-F]{128}$/.test(s);
}

function assertFreshIssuedAt(issuedAtSec, nowSec) {
  if (!Number.isFinite(issuedAtSec) || issuedAtSec <= 0) return false;
  return Math.abs(nowSec - issuedAtSec) <= MAX_ISSUED_AGE_SEC;
}

async function verifyAwardSignature(params) {
  const { wallet, shells, runId, issuedAtSec, signature, nowSec } = params;
  if (!/^0x[a-fA-F0-9]{40}$/i.test(String(wallet || "").trim())) return false;
  if (!isHexSig(signature)) return false;
  if (!Number.isInteger(shells) || shells < 0 || shells > 1_000_000) return false;
  if (typeof runId !== "string" || !runId.trim() || runId.length > 128) return false;
  if (!assertFreshIssuedAt(issuedAtSec, nowSec)) return false;

  const w = wallet.trim();
  const msg = buildAwardAttestation(w, shells, runId.trim(), issuedAtSec);
  try {
    return await verifyMessage({
      address: w,
      message: msg,
      signature,
    });
  } catch {
    return false;
  }
}

async function verifyCheckSignature(params) {
  const { wallet, issuedAtSec, signature, nowSec } = params;
  if (!/^0x[a-fA-F0-9]{40}$/i.test(String(wallet || "").trim())) return false;
  if (!isHexSig(signature)) return false;
  if (!assertFreshIssuedAt(issuedAtSec, nowSec)) return false;

  const w = wallet.trim();
  const msg = buildCheckAttestation(w, issuedAtSec);
  try {
    return await verifyMessage({
      address: w,
      message: msg,
      signature,
    });
  } catch {
    return false;
  }
}

module.exports = {
  verifyAwardSignature,
  verifyCheckSignature,
  assertFreshIssuedAt,
  MAX_ISSUED_AGE_SEC,
};
