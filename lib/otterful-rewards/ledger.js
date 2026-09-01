const crypto = require("crypto");
const {
  isKvConfigured,
  kvGet,
  kvSet,
  kvIncrBy,
  zadd,
  zrevrangeWithScores,
} = require("../otter-kart-leaderboard/kv.js");
const { getClamConfig } = require("./env.js");
const {
  claimIdempotencySlot,
  finalizeIdempotencySlot,
  releaseIdempotencySlot,
} = require("./idempotency.js");

const BALANCE_PREFIX = "otterful:clams:balance";
const TX_PREFIX = "otterful:clams:tx";
const HISTORY_PREFIX = "otterful:clams:history";

function isEthAddress(addr) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(addr || "").trim());
}

function normalizeWallet(wallet) {
  const w = String(wallet || "").trim().toLowerCase();
  if (!isEthAddress(w)) return null;
  return w;
}

function normalizeGame(game, allowedGames) {
  const g = String(game || "").trim();
  if (!g || !allowedGames.has(g)) return null;
  return g;
}

function normalizeRunId(runId) {
  const id = String(runId || "").trim();
  if (!id || id.length > 128) return null;
  return id;
}

function normalizeAmount(amount, maxAward) {
  const n = Math.floor(Number(amount));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(n, maxAward);
}

function balanceKey(wallet) {
  return `${BALANCE_PREFIX}:${wallet}`;
}

function txKey(txId) {
  return `${TX_PREFIX}:${txId}`;
}

function historyKey(wallet) {
  return `${HISTORY_PREFIX}:${wallet}`;
}

function createTxId(game, runId) {
  const digest = crypto.createHash("sha256").update(`${game}:${runId}`).digest("hex").slice(0, 16);
  return `clm_${digest}`;
}

function parseTxRecord(raw) {
  if (!raw || typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function parseLimit(raw, fallback, max) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(n)));
}

/**
 * Record a Clam reward for a wallet. Idempotent on (game, runId).
 */
async function recordClamReward(input, opts = {}) {
  const config = opts.config || getClamConfig(opts.env);
  if (!isKvConfigured()) {
    return { ok: false, code: "not_configured", message: "Clam ledger storage is not configured." };
  }

  const wallet = normalizeWallet(input?.wallet);
  const game = normalizeGame(input?.game, config.allowedGames);
  const runId = normalizeRunId(input?.runId);
  const amount = normalizeAmount(input?.amount, config.maxAwardPerRecord);

  if (!wallet) {
    return { ok: false, code: "bad_wallet", message: "Valid wallet address required." };
  }
  if (!game) {
    return { ok: false, code: "bad_game", message: "Unknown or disallowed game." };
  }
  if (!runId) {
    return { ok: false, code: "bad_run_id", message: "Valid runId required (1–128 chars)." };
  }
  if (amount == null) {
    return { ok: false, code: "bad_amount", message: "Amount must be a positive integer." };
  }

  const txId = createTxId(game, runId);
  const claim = await claimIdempotencySlot(game, runId, txId);
  if (!claim.ok) {
    return { ok: false, code: claim.code, message: claim.message };
  }

  if (!claim.claimed) {
    const existingTxId = claim.record?.txId;
    if (existingTxId) {
      const existingTx = await getClamTransaction(existingTxId);
      if (existingTx) {
        return {
          ok: true,
          duplicate: true,
          txId: existingTx.txId,
          wallet: existingTx.wallet,
          game: existingTx.game,
          runId: existingTx.runId,
          amount: existingTx.amount,
          balance: existingTx.balanceAfter,
          createdAt: existingTx.createdAt,
        };
      }
    }
    return {
      ok: false,
      code: "duplicate_pending",
      message: "A reward for this game/runId is already being processed.",
    };
  }

  const createdAt = Date.now();
  try {
    const balanceAfter = await kvIncrBy(balanceKey(wallet), amount);
    const tx = {
      txId,
      wallet,
      game,
      runId,
      amount,
      balanceAfter,
      createdAt,
      metadata:
        input?.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)
          ? input.metadata
          : undefined,
    };

    await kvSet(txKey(txId), JSON.stringify(tx));
    await zadd(historyKey(wallet), createdAt, txId);
    await finalizeIdempotencySlot(game, runId, {
      status: "complete",
      txId,
      wallet,
      game,
      runId,
      amount,
      balanceAfter,
      createdAt,
    });

    return {
      ok: true,
      duplicate: false,
      txId,
      wallet,
      game,
      runId,
      amount,
      balance: balanceAfter,
      createdAt,
    };
  } catch (err) {
    await releaseIdempotencySlot(game, runId).catch(() => {});
    return {
      ok: false,
      code: "ledger_error",
      message: err && err.message ? err.message : "Failed to record Clam reward.",
    };
  }
}

async function getClamBalance(wallet) {
  if (!isKvConfigured()) {
    return { ok: false, code: "not_configured", message: "Clam ledger storage is not configured." };
  }

  const normalized = normalizeWallet(wallet);
  if (!normalized) {
    return { ok: false, code: "bad_wallet", message: "Valid wallet address required." };
  }

  const raw = await kvGet(balanceKey(normalized));
  const balance = raw == null ? 0 : Math.max(0, Math.floor(Number(raw) || 0));
  return { ok: true, wallet: normalized, balance };
}

async function getClamTransaction(txId) {
  const id = String(txId || "").trim();
  if (!id) return null;
  const raw = await kvGet(txKey(id));
  return parseTxRecord(raw);
}

async function getClamHistory(wallet, limitInput, opts = {}) {
  const config = opts.config || getClamConfig(opts.env);
  if (!isKvConfigured()) {
    return { ok: false, code: "not_configured", message: "Clam ledger storage is not configured." };
  }

  const normalized = normalizeWallet(wallet);
  if (!normalized) {
    return { ok: false, code: "bad_wallet", message: "Valid wallet address required." };
  }

  const limit = parseLimit(limitInput, config.historyDefaultLimit, config.historyMaxLimit);
  const raw = await zrevrangeWithScores(historyKey(normalized), limit);
  const rows = [];

  if (Array.isArray(raw)) {
    for (let i = 0; i < raw.length; i += 2) {
      const txId = String(raw[i] || "");
      const createdAt = Math.floor(Number(raw[i + 1]) || 0);
      const tx = txId ? await getClamTransaction(txId) : null;
      if (tx) {
        rows.push(tx);
      } else if (txId) {
        rows.push({ txId, wallet: normalized, createdAt, amount: 0, balanceAfter: 0, game: "", runId: "" });
      }
    }
  }

  return { ok: true, wallet: normalized, rows, limit };
}

function authorizeRecordRequest(headers, config) {
  if (!config.recordSecret) return { ok: true };
  const provided = String(headers?.["x-otterful-clams-secret"] || headers?.["X-Otterful-Clams-Secret"] || "").trim();
  if (!provided || provided !== config.recordSecret) {
    return { ok: false, code: "unauthorized", message: "Invalid or missing record secret." };
  }
  return { ok: true };
}

async function handleRecordPost(body, headers, opts = {}) {
  const config = opts.config || getClamConfig(opts.env);
  const auth = authorizeRecordRequest(headers, config);
  if (!auth.ok) {
    return { status: 401, json: { ok: false, code: auth.code, message: auth.message } };
  }

  const result = await recordClamReward(body, { config, env: opts.env });
  if (!result.ok) {
    const status = result.code === "not_configured" ? 200 : 400;
    return { status, json: { ok: false, ...result } };
  }
  return { status: 200, json: { ok: true, ...result } };
}

async function handleBalanceGet(query, opts = {}) {
  const wallet = query?.wallet;
  const result = await getClamBalance(wallet);
  if (!result.ok) {
    const status = result.code === "not_configured" ? 200 : 400;
    return { status, json: { ok: false, ...result } };
  }
  return { status: 200, json: { ok: true, ...result } };
}

async function handleHistoryGet(query, opts = {}) {
  const config = opts.config || getClamConfig(opts.env);
  const result = await getClamHistory(query?.wallet, query?.limit, { config, env: opts.env });
  if (!result.ok) {
    const status = result.code === "not_configured" ? 200 : 400;
    return { status, json: { ok: false, ...result } };
  }
  return { status: 200, json: { ok: true, ...result } };
}

module.exports = {
  BALANCE_PREFIX,
  TX_PREFIX,
  HISTORY_PREFIX,
  isEthAddress,
  normalizeWallet,
  normalizeGame,
  normalizeRunId,
  normalizeAmount,
  createTxId,
  recordClamReward,
  getClamBalance,
  getClamTransaction,
  getClamHistory,
  handleRecordPost,
  handleBalanceGet,
  handleHistoryGet,
};
