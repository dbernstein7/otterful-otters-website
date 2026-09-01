const { verifyAwardSignature, verifyCheckSignature, assertFreshIssuedAt } = require("./verify.js");
const { getShellRushConfig } = require("./env.js");

function isEthAddress(addr) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(addr || "").trim());
}

function computeEffectivePoints(points, maxScore, dripMax) {
  let p = Math.max(0, Math.floor(points));
  p = Math.min(p, maxScore);
  if (dripMax !== undefined && Number.isFinite(dripMax)) {
    p = Math.min(p, Math.floor(dripMax));
  }
  return p;
}

function parseIssuedAtSec(body) {
  if (typeof body.issuedAtSec === "number" && Number.isFinite(body.issuedAtSec)) {
    return Math.floor(body.issuedAtSec);
  }
  if (typeof body.issuedAt === "number" && Number.isFinite(body.issuedAt)) {
    return Math.floor(body.issuedAt);
  }
  return NaN;
}

async function gateAwardPost({ body, env, mode, nowSec }) {
  const config = getShellRushConfig(env);
  const wallet = typeof body.wallet === "string" ? body.wallet.trim() : "";
  const runId = typeof body.runId === "string" ? body.runId.trim() : "";
  const issuedAtSec = parseIssuedAtSec(body);
  const signature = typeof body.signature === "string" ? body.signature.trim() : "";
  const rawShells =
    typeof body.shells === "number" && Number.isFinite(body.shells)
      ? body.shells
      : typeof body.points === "number" && Number.isFinite(body.points)
        ? body.points
        : typeof body.score === "number" && Number.isFinite(body.score)
          ? body.score
          : NaN;
  const rawScore =
    typeof body.score === "number" && Number.isFinite(body.score)
      ? body.score
      : typeof body.points === "number" && Number.isFinite(body.points)
        ? body.points
        : rawShells;

  const allowUnsignedDev =
    env.SHELL_RUSH_REWARDS_ALLOW_UNSIGNED_DEV === "1" && mode === "development";

  if (!wallet || !isEthAddress(wallet) || Number.isNaN(rawShells) || rawShells < 0 || !runId || runId.length > 128) {
    return { ok: false, status: 400, json: { ok: false, code: "bad_request", message: "Invalid award payload." } };
  }

  const effectiveIssuedAt =
    allowUnsignedDev && (Number.isNaN(issuedAtSec) || issuedAtSec <= 0) ? nowSec : issuedAtSec;
  if (!allowUnsignedDev && (Number.isNaN(issuedAtSec) || issuedAtSec <= 0)) {
    return { ok: false, status: 400, json: { ok: false, code: "bad_request", message: "Missing issuedAtSec." } };
  }

  const effectiveShells = computeEffectivePoints(
    rawShells,
    config.maxShellsPerClaim,
    config.dripMaxAwardPerRun,
  );
  const effectiveScore = Math.max(0, Math.floor(Number(rawScore) || 0));

  if (!allowUnsignedDev) {
    if (!signature) {
      return { ok: false, status: 401, json: { ok: false, code: "signature_required", message: "Wallet signature required." } };
    }
    if (!assertFreshIssuedAt(effectiveIssuedAt, nowSec)) {
      return { ok: false, status: 403, json: { ok: false, code: "invalid_signature", message: "Invalid or expired signature." } };
    }
    const good = await verifyAwardSignature({
      wallet,
      shells: effectiveShells,
      runId,
      issuedAtSec: effectiveIssuedAt,
      signature,
      nowSec,
    });
    if (!good) {
      return { ok: false, status: 403, json: { ok: false, code: "invalid_signature", message: "Invalid or expired signature." } };
    }
  }

  if (effectiveShells <= 0) {
    return { ok: false, status: 400, json: { ok: false, code: "bad_request", message: "No shells to credit." } };
  }

  return {
    ok: true,
    wallet,
    runId,
    issuedAtSec: effectiveIssuedAt,
    effectiveShells,
    effectiveScore,
    effectivePoints: effectiveShells,
  };
}

async function gateCheckPost({ body, env, mode, nowSec }) {
  const wallet = typeof body.wallet === "string" ? body.wallet.trim() : "";
  const issuedAtSec = parseIssuedAtSec(body);
  const signature = typeof body.signature === "string" ? body.signature.trim() : "";
  const allowUnsignedDev =
    env.SHELL_RUSH_REWARDS_ALLOW_UNSIGNED_DEV === "1" && mode === "development";

  if (!wallet || !isEthAddress(wallet)) {
    return { ok: false, status: 400, json: { ok: false, code: "bad_request", message: "Invalid check payload." } };
  }

  if (!allowUnsignedDev) {
    if (Number.isNaN(issuedAtSec) || issuedAtSec <= 0) {
      return { ok: false, status: 400, json: { ok: false, code: "bad_request", message: "Missing issuedAtSec." } };
    }
    if (!signature) {
      return { ok: false, status: 401, json: { ok: false, code: "signature_required", message: "Wallet signature required." } };
    }
    if (!assertFreshIssuedAt(issuedAtSec, nowSec)) {
      return { ok: false, status: 403, json: { ok: false, code: "invalid_signature", message: "Invalid or expired signature." } };
    }
    const good = await verifyCheckSignature({ wallet, issuedAtSec, signature, nowSec });
    if (!good) {
      return { ok: false, status: 403, json: { ok: false, code: "invalid_signature", message: "Invalid or expired signature." } };
    }
  }

  return { ok: true, wallet };
}

module.exports = { gateAwardPost, gateCheckPost };
