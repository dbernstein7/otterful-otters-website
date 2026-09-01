"use strict";

const { describe, test, beforeEach, mock } = require("node:test");
const assert = require("node:assert/strict");

function createMemoryKv() {
  const strings = new Map();
  const zsets = new Map();

  return {
    isKvConfigured() {
      return true;
    },
    async kvGet(key) {
      return strings.has(key) ? strings.get(key) : null;
    },
    async kvSet(key, value) {
      strings.set(key, String(value));
    },
    async kvSetNx(key, value) {
      if (strings.has(key)) return false;
      strings.set(key, String(value));
      return true;
    },
    async kvIncrBy(key, increment) {
      const cur = Number(strings.get(key) || 0);
      const next = cur + Number(increment);
      strings.set(key, String(next));
      return next;
    },
    async kvDel(key) {
      strings.delete(key);
    },
    async zadd(key, score, member) {
      if (!zsets.has(key)) zsets.set(key, new Map());
      zsets.get(key).set(String(member), Number(score));
    },
    async zrevrangeWithScores(key, limit) {
      const bucket = zsets.get(key);
      if (!bucket) return [];
      const entries = [...bucket.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
      const out = [];
      for (const [member, score] of entries) {
        out.push(member, String(score));
      }
      return out;
    },
  };
}

const backendRef = { current: createMemoryKv() };
const urnzCalls = { award: [], getBalance: [] };
let urnzAwardBehavior = "success";

mock.module("../lib/otter-kart-leaderboard/kv.js", {
  cache: false,
  namedExports: {
    isKvConfigured: () => backendRef.current.isKvConfigured(),
    kvGet: (...args) => backendRef.current.kvGet(...args),
    kvSet: (...args) => backendRef.current.kvSet(...args),
    kvSetNx: (...args) => backendRef.current.kvSetNx(...args),
    kvIncrBy: (...args) => backendRef.current.kvIncrBy(...args),
    kvDel: (...args) => backendRef.current.kvDel(...args),
    zadd: (...args) => backendRef.current.zadd(...args),
    zrevrangeWithScores: (...args) => backendRef.current.zrevrangeWithScores(...args),
  },
});

mock.module("../lib/otterful-rewards/urnz.js", {
  cache: false,
  namedExports: {
    getUrnzConfig: () => ({
      apiKey: "test-urnz-key",
      realmId: "9ee65660fbd2344f82ad71ad",
      baseUrl: "https://www.urnz.app/api/v1",
      memberSearchType: "wallet-evm",
      configured: true,
    }),
    getStatus: () => ({ ok: true, configured: true }),
    getBalance: async (wallet) => {
      urnzCalls.getBalance.push(wallet);
      return { ok: true, found: true, balance: 500, memberId: "urnz_member_1" };
    },
    award: async (wallet, amount, transaction) => {
      urnzCalls.award.push({ wallet, amount, transaction });
      if (urnzAwardBehavior === "fail") {
        return { ok: false, code: "urnz_error", message: "HTTP 503", status: 503 };
      }
      return {
        ok: true,
        memberId: "urnz_member_1",
        balance: 500 + amount,
        externalReference: "urnz_tx_ref_1",
      };
    },
    sanitizeErrorMessage: (m) => m,
    resetUrnzCacheForTests: () => {},
  },
});

mock.module("../lib/otter-kart-rewards/drip.js", {
  cache: false,
  namedExports: {
    checkDripRealmMember: async () => ({ ok: true, found: true, dripId: "drip_test", balance: 100 }),
    awardDripPointsServer: async (input) => ({
      ok: true,
      dripId: "drip_test",
      balance: (input.points || 0) + 100,
    }),
  },
});

mock.module("../lib/otter-kart-rewards/verify.js", {
  cache: false,
  namedExports: {
    verifyAwardSignature: async () => true,
    verifyCheckSignature: async () => true,
  },
});

const { recordClamReward, getClamBalance } = require("../lib/otterful-rewards/ledger.js");
const {
  syncClamToUrnz,
  syncAfterClamCredit,
  retrySync,
  getSyncRecord,
  handleSyncRetryPost,
  handleSyncStatusGet,
} = require("../lib/otterful-rewards/sync.js");
const { getStatus: getUrnzStatus } = require("../lib/otterful-rewards/urnz.js");
const { getRewardsProviderConfig } = require("../lib/otterful-rewards/env.js");
const { handleProfileGet } = require("../lib/otterful-profile/handlers.js");
const { handleOtterKartAward } = require("../lib/otter-kart-rewards/handlers.js");

const WALLET = "0x1234567890123456789012345678901234567890";
const RUN_ID = "urnz-sync-test-run";

function awardBody(overrides = {}) {
  return {
    game: "otter-kart",
    wallet: WALLET,
    shells: 25,
    runId: RUN_ID,
    issuedAtSec: Math.floor(Date.now() / 1000),
    signature: "0x" + "aa".repeat(65),
    ...overrides,
  };
}

describe("URNZ adapter", () => {
  test("getStatus reports configured when credentials present", () => {
    const status = getUrnzStatus({ URNZ_API_KEY: "k", URNZ_REALM_ID: "r" });
    assert.equal(status.configured, true);
  });

  test("getStatus does not expose API key", () => {
    const status = getUrnzStatus({ URNZ_API_KEY: "secret-key", URNZ_REALM_ID: "r" });
    assert.equal(JSON.stringify(status).includes("secret-key"), false);
  });
});

describe("provider configuration", () => {
  test("defaults to drip provider", () => {
    const cfg = getRewardsProviderConfig({});
    assert.equal(cfg.provider, "drip");
    assert.equal(cfg.useDrip, true);
    assert.equal(cfg.useUrnz, false);
  });

  test("urnz provider enables URNZ only", () => {
    const cfg = getRewardsProviderConfig({ OTTERFUL_REWARDS_PROVIDER: "urnz" });
    assert.equal(cfg.useUrnz, true);
    assert.equal(cfg.useDrip, false);
  });

  test("both provider enables migration mode", () => {
    const cfg = getRewardsProviderConfig({ OTTERFUL_REWARDS_PROVIDER: "both" });
    assert.equal(cfg.useUrnz, true);
    assert.equal(cfg.useDrip, true);
  });
});

describe("Clam → URNZ synchronization", () => {
  beforeEach(() => {
    backendRef.current = createMemoryKv();
    urnzCalls.award = [];
    urnzAwardBehavior = "success";
    process.env.OTTERFUL_REWARDS_PROVIDER = "urnz";
    process.env.OTTER_KART_DRIP_API_KEY = "";
    process.env.OTTER_KART_REWARDS_ALLOW_UNSIGNED_DEV = "0";
  });

  test("verified reward creates Clam transaction and URNZ sync", async () => {
    const result = await handleOtterKartAward(awardBody());
    assert.equal(result.json.ok, true);
    assert.equal(result.json.clamBalance, 25);
    assert.equal(typeof result.json.clamTxId, "string");
    assert.equal(result.json.syncStatus, "synced");
    assert.equal(urnzCalls.award.length, 1);
    assert.equal(urnzCalls.award[0].transaction.txId, result.json.clamTxId);

    const balance = await getClamBalance(WALLET);
    assert.equal(balance.balance, 25);
  });

  test("duplicate game reward creates one Clam transaction", async () => {
    const first = await handleOtterKartAward(awardBody());
    const second = await handleOtterKartAward(awardBody());

    assert.equal(first.json.clamTxId, second.json.clamTxId);
    assert.equal(second.json.alreadyCredited, true);
    assert.equal(urnzCalls.award.length, 1);

    const balance = await getClamBalance(WALLET);
    assert.equal(balance.balance, 25);
  });

  test("URNZ timeout/failure leaves Clam recorded and sync failed", async () => {
    urnzAwardBehavior = "fail";

    const recorded = await recordClamReward({
      wallet: WALLET,
      game: "otter-kart",
      runId: "urnz-fail-run",
      amount: 10,
    });
    assert.equal(recorded.ok, true);

    const sync = await syncClamToUrnz(recorded.txId);
    assert.equal(sync.status, "failed");
    assert.match(sync.lastError, /503/);

    const balance = await getClamBalance(WALLET);
    assert.equal(balance.balance, 10);
  });

  test("retry does not duplicate Clam reward", async () => {
    const recorded = await recordClamReward({
      wallet: WALLET,
      game: "otter-kart",
      runId: "urnz-retry-run",
      amount: 15,
    });

    const sync1 = await syncClamToUrnz(recorded.txId);
    assert.equal(sync1.status, "synced");

    urnzCalls.award = [];
    const sync2 = await retrySync(recorded.txId);
    assert.equal(sync2.status, "synced");
    assert.equal(sync2.duplicate, true);
    assert.equal(urnzCalls.award.length, 0);

    const balance = await getClamBalance(WALLET);
    assert.equal(balance.balance, 15);
  });

  test("sync record stores diagnostic fields", async () => {
    const recorded = await recordClamReward({
      wallet: WALLET,
      game: "shell-snag",
      runId: "sync-meta-run",
      amount: 5,
    });
    await syncClamToUrnz(recorded.txId);

    const record = await getSyncRecord(recorded.txId);
    assert.equal(record.status, "synced");
    assert.equal(record.provider, "urnz");
    assert.equal(record.attempts, 1);
    assert.equal(record.externalReference, "urnz_tx_ref_1");
  });
});

describe("admin sync endpoints", () => {
  beforeEach(() => {
    backendRef.current = createMemoryKv();
    process.env.OTTERFUL_CLAMS_SYNC_SECRET = "admin-secret";
    process.env.OTTERFUL_REWARDS_PROVIDER = "urnz";
  });

  test("sync status requires admin secret", async () => {
    const recorded = await recordClamReward({
      wallet: WALLET,
      game: "otter-kart",
      runId: "admin-status-run",
      amount: 3,
    });
    await syncClamToUrnz(recorded.txId);

    const denied = await handleSyncStatusGet({ txId: recorded.txId }, { headers: {} });
    assert.equal(denied.status, 401);

    const allowed = await handleSyncStatusGet(
      { txId: recorded.txId },
      { headers: { "x-otterful-clams-secret": "admin-secret" } },
    );
    assert.equal(allowed.status, 200);
    assert.equal(allowed.json.status, "synced");
    assert.equal(allowed.json.attempts, 1);
  });

  test("sync retry endpoint retries failed sync", async () => {
    const recorded = await recordClamReward({
      wallet: WALLET,
      game: "otter-kart",
      runId: "admin-retry-run",
      amount: 7,
    });

    await backendRef.current.kvSet(`otterful:clams:sync:${recorded.txId}`, JSON.stringify({
      txId: recorded.txId,
      status: "failed",
      provider: "urnz",
      wallet: WALLET,
      amount: 7,
      attempts: 1,
      lastError: "HTTP 503",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }));

    urnzCalls.award = [];
    const result = await handleSyncRetryPost(
      { txId: recorded.txId },
      { "x-otterful-clams-secret": "admin-secret" },
    );
    assert.equal(result.status, 200);
    assert.equal(result.json.syncStatus, "synced");
    assert.equal(urnzCalls.award.length, 1);
  });
});

describe("profile reads central ledger not URNZ", () => {
  beforeEach(() => {
    backendRef.current = createMemoryKv();
    process.env.OTTERFUL_REWARDS_PROVIDER = "drip";
  });

  test("profile clams come from central ledger", async () => {
    await recordClamReward({
      wallet: WALLET,
      game: "otter-kart",
      runId: "profile-clam-run",
      amount: 99,
    });

    const profile = await handleProfileGet({ wallet: WALLET });
    assert.equal(profile.json.clams, 99);
    assert.equal(urnzCalls.getBalance.length, 0);
  });
});

describe("Drip provider still works when configured", () => {
  beforeEach(() => {
    backendRef.current = createMemoryKv();
    urnzCalls.award = [];
    process.env.OTTERFUL_REWARDS_PROVIDER = "drip";
    process.env.OTTER_KART_DRIP_API_KEY = "test-drip-key";
    process.env.OTTER_KART_REWARDS_ALLOW_UNSIGNED_DEV = "0";
  });

  test("drip provider skips URNZ sync", async () => {
    const result = await handleOtterKartAward(awardBody({ runId: "drip-only-run" }));
    assert.equal(result.json.ok, true);
    assert.equal(result.json.dripId, "drip_test");
    assert.equal(result.json.syncStatus, undefined);
    assert.equal(urnzCalls.award.length, 0);
  });
});
