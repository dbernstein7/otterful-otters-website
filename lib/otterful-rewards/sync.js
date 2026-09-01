const { isKvConfigured, kvGet, kvSet } = require("../otter-kart-leaderboard/kv.js");
const { getClamTransaction } = require("./ledger.js");
const { getRewardsProviderConfig, getSyncConfig } = require("./env.js");
const { award: awardUrnz } = require("./urnz.js");

const SYNC_PREFIX = "otterful:clams:sync";
const PROCESSING_STALE_MS = 60_000;

const VALID_STATUSES = new Set(["pending", "processing", "synced", "failed", "skipped"]);

function syncKey(txId) {
  return `${SYNC_PREFIX}:${txId}`;
}

function parseSyncRecord(raw) {
  if (!raw || typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

async function getSyncRecord(txId) {
  const id = String(txId || "").trim();
  if (!id) return null;
  const raw = await kvGet(syncKey(id));
  return parseSyncRecord(raw);
}

async function saveSyncRecord(txId, record) {
  await kvSet(syncKey(txId), JSON.stringify(record));
  return record;
}

async function initSyncRecord(txId, input = {}) {
  const existing = await getSyncRecord(txId);
  if (existing) return existing;

  const record = {
    txId,
    status: "pending",
    provider: input.provider || "urnz",
    wallet: input.wallet || "",
    amount: Math.floor(Number(input.amount) || 0),
    attempts: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await saveSyncRecord(txId, record);
  return record;
}

function isProcessingStale(record) {
  if (!record || record.status !== "processing") return false;
  const updated = Number(record.updatedAt) || 0;
  return Date.now() - updated > PROCESSING_STALE_MS;
}

/**
 * Attempt URNZ synchronization for a central Clam transaction.
 * Idempotent: uses txId as URNZ Idempotency-Key; skips if already synced.
 */
async function syncClamToUrnz(txId, opts = {}) {
  const providerConfig = opts.providerConfig || getRewardsProviderConfig(opts.env);
  if (!providerConfig.useUrnz) {
    return { ok: true, status: "skipped", reason: "provider_disabled" };
  }

  if (!isKvConfigured()) {
    return { ok: false, status: "failed", code: "not_configured", message: "Sync storage not configured." };
  }

  const id = String(txId || "").trim();
  if (!id) {
    return { ok: false, status: "failed", code: "bad_tx_id", message: "Transaction id required." };
  }

  const tx = await getClamTransaction(id);
  if (!tx) {
    return { ok: false, status: "failed", code: "tx_not_found", message: "Clam transaction not found." };
  }

  let record = (await getSyncRecord(id)) || (await initSyncRecord(id, {
    provider: "urnz",
    wallet: tx.wallet,
    amount: tx.amount,
  }));

  if (record.status === "synced") {
    return {
      ok: true,
      status: "synced",
      duplicate: true,
      externalReference: record.externalReference,
      attempts: record.attempts,
    };
  }

  if (record.status === "processing" && !isProcessingStale(record)) {
    return {
      ok: false,
      status: "processing",
      code: "sync_in_progress",
      message: "Synchronization already in progress.",
      attempts: record.attempts,
    };
  }

  record = {
    ...record,
    status: "processing",
    attempts: (Number(record.attempts) || 0) + 1,
    lastAttemptAt: Date.now(),
    updatedAt: Date.now(),
  };
  await saveSyncRecord(id, record);

  const urnzResult = await awardUrnz(tx.wallet, tx.amount, { txId: id, game: tx.game, runId: tx.runId }, opts);

  if (urnzResult.ok) {
    const synced = {
      ...record,
      status: "synced",
      externalReference: urnzResult.externalReference || urnzResult.urnzMemberId || null,
      urnzBalance: urnzResult.balance,
      updatedAt: Date.now(),
      lastError: undefined,
    };
    await saveSyncRecord(id, synced);
    return {
      ok: true,
      status: "synced",
      externalReference: synced.externalReference,
      attempts: synced.attempts,
      urnzBalance: urnzResult.balance,
    };
  }

  if (urnzResult.code === "not_configured") {
    const skipped = {
      ...record,
      status: "skipped",
      lastError: urnzResult.message,
      updatedAt: Date.now(),
    };
    await saveSyncRecord(id, skipped);
    return { ok: true, status: "skipped", reason: "not_configured", attempts: skipped.attempts };
  }

  const failed = {
    ...record,
    status: "failed",
    lastError: urnzResult.message || urnzResult.code || "URNZ sync failed",
    lastErrorCode: urnzResult.code,
    lastHttpStatus: urnzResult.status,
    updatedAt: Date.now(),
  };
  await saveSyncRecord(id, failed);

  return {
    ok: false,
    status: "failed",
    code: urnzResult.code || "urnz_sync_failed",
    message: urnzResult.message || "URNZ synchronization failed.",
    attempts: failed.attempts,
    lastError: failed.lastError,
  };
}

/**
 * After a Clam credit (new or duplicate), run provider sync when configured.
 */
async function syncAfterClamCredit(clam, opts = {}) {
  if (!clam || !clam.clamTxId) {
    return { status: "skipped", reason: "no_tx" };
  }

  const providerConfig = opts.providerConfig || getRewardsProviderConfig(opts.env);
  if (!providerConfig.useUrnz) {
    return { status: "skipped", reason: "provider_disabled" };
  }

  if (clam.status === "skipped" || clam.status === "failed") {
    return { status: "skipped", reason: clam.status };
  }

  const existing = await getSyncRecord(clam.clamTxId);
  if (existing?.status === "synced") {
    return {
      status: "synced",
      externalReference: existing.externalReference,
      attempts: existing.attempts,
    };
  }

  if (clam.status === "duplicate" && existing) {
    if (existing.status === "failed" || existing.status === "pending") {
      return syncClamToUrnz(clam.clamTxId, opts);
    }
    return {
      status: existing.status,
      attempts: existing.attempts,
      lastError: existing.lastError,
      externalReference: existing.externalReference,
    };
  }

  await initSyncRecord(clam.clamTxId, {
    provider: "urnz",
    wallet: clam.wallet,
    amount: clam.amount,
  });

  return syncClamToUrnz(clam.clamTxId, opts);
}

async function retrySync(txId, opts = {}) {
  const syncConfig = opts.syncConfig || getSyncConfig(opts.env);
  const record = await getSyncRecord(txId);
  if (record?.status === "synced") {
    return {
      ok: true,
      status: "synced",
      duplicate: true,
      externalReference: record.externalReference,
      attempts: record.attempts,
    };
  }

  if (record) {
    const reset = {
      ...record,
      status: "pending",
      updatedAt: Date.now(),
    };
    await saveSyncRecord(txId, reset);
  }

  return syncClamToUrnz(txId, opts);
}

function authorizeSyncAdmin(headers, config) {
  if (!config.syncRetrySecret) {
    return { ok: false, code: "not_configured", message: "Sync admin secret not configured." };
  }
  const provided = String(
    headers?.["x-otterful-clams-secret"] || headers?.["X-Otterful-Clams-Secret"] || "",
  ).trim();
  if (!provided || provided !== config.syncRetrySecret) {
    return { ok: false, code: "unauthorized", message: "Invalid or missing sync admin secret." };
  }
  return { ok: true };
}

async function handleSyncStatusGet(query, opts = {}) {
  const txId = String(query?.txId || "").trim();
  if (!txId) {
    return { status: 400, json: { ok: false, code: "bad_tx_id", message: "txId query parameter required." } };
  }

  const syncConfig = opts.syncConfig || getSyncConfig(opts.env);
  const auth = authorizeSyncAdmin(opts.headers || {}, syncConfig);
  if (!auth.ok) {
    return { status: 401, json: { ok: false, code: auth.code, message: auth.message } };
  }

  const record = await getSyncRecord(txId);
  if (!record) {
    return { status: 404, json: { ok: false, code: "not_found", message: "No sync record for transaction." } };
  }

  return {
    status: 200,
    json: {
      ok: true,
      txId,
      status: record.status,
      provider: record.provider,
      attempts: record.attempts,
      lastAttemptAt: record.lastAttemptAt,
      externalReference: record.externalReference,
      lastError: record.lastError,
      lastErrorCode: record.lastErrorCode,
    },
  };
}

async function handleSyncRetryPost(body, headers, opts = {}) {
  const syncConfig = opts.syncConfig || getSyncConfig(opts.env);
  const auth = authorizeSyncAdmin(headers, syncConfig);
  if (!auth.ok) {
    return { status: 401, json: { ok: false, code: auth.code, message: auth.message } };
  }

  const txId = String(body?.txId || "").trim();
  if (!txId) {
    return { status: 400, json: { ok: false, code: "bad_tx_id", message: "txId required in body." } };
  }

  const result = await retrySync(txId, opts);
  return {
    status: 200,
    json: {
      ok: result.ok !== false,
      txId,
      syncStatus: result.status,
      ...result,
    },
  };
}

module.exports = {
  SYNC_PREFIX,
  VALID_STATUSES,
  getSyncRecord,
  initSyncRecord,
  syncClamToUrnz,
  syncAfterClamCredit,
  retrySync,
  handleSyncStatusGet,
  handleSyncRetryPost,
};
