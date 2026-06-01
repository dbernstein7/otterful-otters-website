const { verifyAwardSignature, verifyCheckSignature } = require("./verify.js");

const DEFAULT_MAX = 50_000;

function parseMax(raw) {
  if (raw === undefined || raw === "" || !Number.isFinite(Number(raw))) return DEFAULT_MAX;
  return Math.min(Math.max(1, Math.floor(Number(raw))), 1_000_000);
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
  const wallet = typeof body.wallet === "string" ? body.wallet.trim() : "";
  let dripUserId = typeof body.dripUserId === "string" ? body.dripUserId.trim() : undefined;
  const allowDripUserId = env.OTTER_KART_REWARDS_ALLOW_DRIP_USER_ID_BODY === "1" || mode === "development";
  if (!allowDripUserId) dripUserId = undefined;

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

  const allowUnsignedDev = env.OTTER_KART_REWARDS_ALLOW_UNSIGNED_DEV === "1" && mode === "development";

  if ((!wallet && !dripUserId) || Number.isNaN(rawShells) || rawShells < 0 || !runId || runId.length > 128) {
    return { ok: false, status: 400, json: { ok: false, code: "bad_request", message: "Invalid award payload." } };
  }
  if (!allowUnsignedDev && !wallet) {
    return {
      ok: false,
      status: 400,
      json: { ok: false, code: "bad_request", message: "Wallet address required for signed awards." },
    };
  }

  const effectiveIssuedAt =
    allowUnsignedDev && (Number.isNaN(issuedAtSec) || issuedAtSec <= 0) ? nowSec : issuedAtSec;
  if (!allowUnsignedDev && (Number.isNaN(issuedAtSec) || issuedAtSec <= 0)) {
    return { ok: false, status: 400, json: { ok: false, code: "bad_request", message: "Missing issuedAtSec." } };
  }

  const maxUnits = parseMax(env.OTTER_KART_REWARDS_MAX_SHELLS_PER_CLAIM);
  const dripMaxRaw = env.OTTER_KART_DRIP_MAX_AWARD_PER_RUN;
  const dripMax =
    dripMaxRaw !== undefined && dripMaxRaw !== "" && Number.isFinite(Number(dripMaxRaw))
      ? Math.floor(Number(dripMaxRaw))
      : undefined;
  const effective = computeEffectivePoints(rawShells, maxUnits, dripMax);

  if (!allowUnsignedDev) {
    if (!signature) {
      return { ok: false, status: 401, json: { ok: false, code: "signature_required", message: "Wallet signature required." } };
    }
    const good = await verifyAwardSignature({
      wallet,
      shells: effective,
      runId,
      issuedAtSec: effectiveIssuedAt,
      signature,
      nowSec,
    });
    if (!good) {
      return { ok: false, status: 403, json: { ok: false, code: "invalid_signature", message: "Invalid or expired signature." } };
    }
  } else if (!wallet && !dripUserId) {
    return { ok: false, status: 400, json: { ok: false, code: "bad_request", message: "Wallet or drip user id required." } };
  }

  if (effective <= 0) {
    return { ok: false, status: 400, json: { ok: false, code: "bad_request", message: "No shells to credit." } };
  }

  const initiatorId = wallet
    ? `otterkart:${wallet.toLowerCase()}:${runId}:${effectiveIssuedAt}`
    : `otterkart:drip:${dripUserId}:${runId}:${effectiveIssuedAt}`;

  return {
    ok: true,
    wallet,
    dripUserId,
    effectivePoints: effective,
    runId,
    issuedAtSec: effectiveIssuedAt,
    initiatorId,
  };
}

async function gateCheckPost({ body, env, mode, nowSec }) {
  const wallet = typeof body.wallet === "string" ? body.wallet.trim() : "";
  let dripUserId = typeof body.dripUserId === "string" ? body.dripUserId.trim() : undefined;
  const allowDripUserId = env.OTTER_KART_REWARDS_ALLOW_DRIP_USER_ID_BODY === "1" || mode === "development";
  if (!allowDripUserId) dripUserId = undefined;

  const issuedAtSec = parseIssuedAtSec(body);
  const signature = typeof body.signature === "string" ? body.signature.trim() : "";
  const allowUnsignedDev = env.OTTER_KART_REWARDS_ALLOW_UNSIGNED_DEV === "1" && mode === "development";

  if (!wallet && !dripUserId) {
    return { ok: false, status: 400, json: { ok: false, code: "bad_request", message: "Invalid check payload." } };
  }
  if (!allowUnsignedDev && !wallet) {
    return {
      ok: false,
      status: 400,
      json: { ok: false, code: "bad_request", message: "Wallet address required for signed rewards check." },
    };
  }

  if (!allowUnsignedDev) {
    if (Number.isNaN(issuedAtSec) || issuedAtSec <= 0) {
      return { ok: false, status: 400, json: { ok: false, code: "bad_request", message: "Missing issuedAtSec." } };
    }
    if (!signature) {
      return { ok: false, status: 401, json: { ok: false, code: "signature_required", message: "Wallet signature required." } };
    }
    const good = await verifyCheckSignature({ wallet, issuedAtSec, signature, nowSec });
    if (!good) {
      return { ok: false, status: 403, json: { ok: false, code: "invalid_signature", message: "Invalid or expired signature." } };
    }
  }

  return { ok: true, wallet, dripUserId };
}

module.exports = { gateAwardPost, gateCheckPost };
