const { verifyAwardSignature, verifyCheckSignature, assertFreshIssuedAt } = require("./verify.js");
const { getShellRushConfig } = require("./env.js");
const { authorizeRewardSession } = require("../otterful-session/reward-auth.js");

function isEthAddress(addr) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(addr || "").trim());
}

/** Shell Snag sends respawnNonce as a number; coerce safely for attestation + ledger. */
function normalizeRunId(runId) {
  if (typeof runId === "string") return runId.trim();
  if (typeof runId === "number" && Number.isFinite(runId)) return String(Math.trunc(runId));
  if (typeof runId === "bigint") return String(runId);
  return "";
}

function normalizeShellAmount(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return NaN;
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
  const runId = normalizeRunId(body.runId);
  const issuedAtSec = parseIssuedAtSec(body);
  const signature = typeof body.signature === "string" ? body.signature.trim() : "";
  const rawShells = normalizeShellAmount(
    body.shells !== undefined && body.shells !== null
      ? body.shells
      : body.points !== undefined && body.points !== null
        ? body.points
        : body.score,
  );
  const rawScore = normalizeShellAmount(
    body.score !== undefined && body.score !== null
      ? body.score
      : body.points !== undefined && body.points !== null
        ? body.points
        : rawShells,
  );

  const allowUnsignedDev =
    env.SHELL_RUSH_REWARDS_ALLOW_UNSIGNED_DEV === "1" && mode === "development";
  const hasSessionToken =
    typeof body.sessionToken === "string" && body.sessionToken.trim().length > 0;

  if (!wallet || !isEthAddress(wallet) || Number.isNaN(rawShells) || rawShells < 0 || !runId || runId.length > 128) {
    return { ok: false, status: 400, json: { ok: false, code: "bad_request", message: "Invalid award payload." } };
  }

  let effectiveIssuedAt =
    allowUnsignedDev && (Number.isNaN(issuedAtSec) || issuedAtSec <= 0) ? nowSec : issuedAtSec;
  if (!allowUnsignedDev && (Number.isNaN(issuedAtSec) || issuedAtSec <= 0) && !hasSessionToken) {
    return { ok: false, status: 400, json: { ok: false, code: "bad_request", message: "Missing issuedAtSec." } };
  }
  if (Number.isNaN(effectiveIssuedAt) || effectiveIssuedAt <= 0) {
    effectiveIssuedAt = nowSec;
  }

  // Clients sign the capped claim amount (max shells), not the drip-max credit.
  // Verify against the signed value, then apply dripMax only for crediting.
  const signedShells = computeEffectivePoints(rawShells, config.maxShellsPerClaim, undefined);
  const effectiveShells = computeEffectivePoints(
    signedShells,
    config.maxShellsPerClaim,
    config.dripMaxAwardPerRun,
  );
  const effectiveScore = Math.max(0, Math.floor(Number(rawScore) || 0));

  let authedViaSession = false;
  if (!allowUnsignedDev) {
    const sessionAuth = await authorizeRewardSession({ body, wallet, env });
    if (sessionAuth.ok) {
      authedViaSession = true;
    } else if (sessionAuth.authMethod === null) {
      if (!signature) {
        return { ok: false, status: 401, json: { ok: false, code: "signature_required", message: "Wallet signature required." } };
      }
      if (!assertFreshIssuedAt(effectiveIssuedAt, nowSec)) {
        return { ok: false, status: 403, json: { ok: false, code: "invalid_signature", message: "Invalid or expired signature." } };
      }
      const good = await verifyAwardSignature({
        wallet,
        shells: signedShells,
        runId,
        issuedAtSec: effectiveIssuedAt,
        signature,
        nowSec,
      });
      if (!good) {
        return { ok: false, status: 403, json: { ok: false, code: "invalid_signature", message: "Invalid or expired signature." } };
      }
    } else {
      return { ok: false, status: sessionAuth.status, json: sessionAuth.json };
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
    authMethod: authedViaSession ? "session" : allowUnsignedDev ? "dev" : "signature",
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
    const sessionAuth = await authorizeRewardSession({ body, wallet, env });
    if (sessionAuth.ok) {
      return { ok: true, wallet, authMethod: "session" };
    }
    if (sessionAuth.authMethod !== null) {
      return { ok: false, status: sessionAuth.status, json: sessionAuth.json };
    }
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

  return { ok: true, wallet, authMethod: allowUnsignedDev ? "dev" : "signature" };
}

module.exports = { gateAwardPost, gateCheckPost };
