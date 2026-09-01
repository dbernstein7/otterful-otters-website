const { kvGet, kvSet, kvSetNx, kvDel } = require("../otter-kart-leaderboard/kv.js");

const IDEM_PREFIX = "otterful:clams:idem";

function idempotencyKey(game, runId) {
  return `${IDEM_PREFIX}:${game}:${runId}`;
}

function parseIdempotencyRecord(raw) {
  if (!raw || typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Reserve an idempotency slot for (game, runId).
 * @returns {Promise<{ ok: true, claimed: true, txId: string } | { ok: true, claimed: false, record: object } | { ok: false, code: string, message: string }>}
 */
async function claimIdempotencySlot(game, runId, txId) {
  const key = idempotencyKey(game, runId);
  const payload = JSON.stringify({
    status: "pending",
    txId,
    game,
    runId,
    createdAt: Date.now(),
  });

  const claimed = await kvSetNx(key, payload);
  if (claimed) {
    return { ok: true, claimed: true, txId };
  }

  const existingRaw = await kvGet(key);
  const record = parseIdempotencyRecord(existingRaw);
  if (!record) {
    return { ok: false, code: "idem_corrupt", message: "Idempotency record is unreadable." };
  }
  return { ok: true, claimed: false, record };
}

async function finalizeIdempotencySlot(game, runId, record) {
  const key = idempotencyKey(game, runId);
  await kvSet(
    key,
    JSON.stringify({
      ...record,
      status: "complete",
      completedAt: Date.now(),
    }),
  );
}

async function releaseIdempotencySlot(game, runId) {
  const key = idempotencyKey(game, runId);
  await kvDel(key);
}

async function readIdempotencySlot(game, runId) {
  const raw = await kvGet(idempotencyKey(game, runId));
  return parseIdempotencyRecord(raw);
}

module.exports = {
  IDEM_PREFIX,
  idempotencyKey,
  claimIdempotencySlot,
  finalizeIdempotencySlot,
  releaseIdempotencySlot,
  readIdempotencySlot,
  parseIdempotencyRecord,
};
