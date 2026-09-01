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

const {
  recordClamReward,
  getClamBalance,
  getClamHistory,
  normalizeWallet,
  normalizeAmount,
  normalizeGame,
  handleRecordPost,
} = require("../lib/otterful-rewards/ledger.js");
const { getClamConfig } = require("../lib/otterful-rewards/env.js");
const { claimIdempotencySlot, readIdempotencySlot } = require("../lib/otterful-rewards/idempotency.js");

const WALLET = "0x1234567890123456789012345678901234567890";

describe("otterful-rewards env", () => {
  test("getClamConfig applies defaults and parses allowed games", () => {
    const config = getClamConfig({
      OTTERFUL_CLAMS_ALLOWED_GAMES: "otter-kart, shell-rush",
      OTTERFUL_CLAMS_MAX_AWARD_PER_RECORD: "999",
    });
    assert.equal(config.maxAwardPerRecord, 999);
    assert.deepEqual([...config.allowedGames], ["otter-kart", "shell-rush"]);
  });
});

describe("otterful-rewards ledger normalization", () => {
  test("normalizeWallet lowercases valid addresses", () => {
    assert.equal(normalizeWallet(WALLET), WALLET.toLowerCase());
    assert.equal(normalizeWallet("bad"), null);
  });

  test("normalizeAmount enforces positive integers and cap", () => {
    const allowed = new Set(["otter-kart"]);
    assert.equal(normalizeAmount(100, 500), 100);
    assert.equal(normalizeAmount(1000, 500), 500);
    assert.equal(normalizeAmount(0, 500), null);
    assert.equal(normalizeGame("otter-kart", allowed), "otter-kart");
    assert.equal(normalizeGame("unknown", allowed), null);
  });
});

describe("otterful-rewards idempotency", () => {
  beforeEach(() => {
    backendRef.current = createMemoryKv();
  });

  test("claimIdempotencySlot allows first claim and blocks duplicate", async () => {
    const first = await claimIdempotencySlot("otter-kart", "run-1", "clm_test");
    assert.equal(first.ok, true);
    assert.equal(first.claimed, true);

    const second = await claimIdempotencySlot("otter-kart", "run-1", "clm_other");
    assert.equal(second.ok, true);
    assert.equal(second.claimed, false);
    assert.equal(second.record.txId, "clm_test");

    const stored = await readIdempotencySlot("otter-kart", "run-1");
    assert.equal(stored.txId, "clm_test");
  });
});

describe("otterful-rewards ledger", () => {
  beforeEach(() => {
    backendRef.current = createMemoryKv();
  });

  test("recordClamReward credits balance and stores history", async () => {
    const config = getClamConfig({});
    const result = await recordClamReward(
      { wallet: WALLET, game: "otter-kart", runId: "run-a", amount: 120 },
      { config },
    );

    assert.equal(result.ok, true);
    assert.equal(result.duplicate, false);
    assert.equal(result.balance, 120);

    const balance = await getClamBalance(WALLET);
    assert.equal(balance.ok, true);
    assert.equal(balance.balance, 120);

    const history = await getClamHistory(WALLET, 10, { config });
    assert.equal(history.ok, true);
    assert.equal(history.rows.length, 1);
    assert.equal(history.rows[0].amount, 120);
    assert.equal(history.rows[0].runId, "run-a");
  });

  test("duplicate (game, runId) does not double-credit balance", async () => {
    const config = getClamConfig({});
    const input = { wallet: WALLET, game: "shell-rush", runId: "run-dup", amount: 50 };

    const first = await recordClamReward(input, { config });
    const second = await recordClamReward(input, { config });

    assert.equal(first.ok, true);
    assert.equal(first.duplicate, false);
    assert.equal(second.ok, true);
    assert.equal(second.duplicate, true);
    assert.equal(second.txId, first.txId);

    const balance = await getClamBalance(WALLET);
    assert.equal(balance.balance, 50);
  });

  test("separate runIds accumulate balance", async () => {
    const config = getClamConfig({});
    await recordClamReward(
      { wallet: WALLET, game: "otter-kart", runId: "run-1", amount: 30 },
      { config },
    );
    await recordClamReward(
      { wallet: WALLET, game: "otter-kart", runId: "run-2", amount: 70 },
      { config },
    );

    const balance = await getClamBalance(WALLET);
    assert.equal(balance.balance, 100);
  });

  test("handleRecordPost requires secret when configured", async () => {
    const config = getClamConfig({ OTTERFUL_CLAMS_RECORD_SECRET: "test-secret" });
    const denied = await handleRecordPost(
      { wallet: WALLET, game: "otter-kart", runId: "run-auth", amount: 10 },
      {},
      { config },
    );
    assert.equal(denied.status, 401);

    const allowed = await handleRecordPost(
      { wallet: WALLET, game: "otter-kart", runId: "run-auth", amount: 10 },
      { "x-otterful-clams-secret": "test-secret" },
      { config },
    );
    assert.equal(allowed.status, 200);
    assert.equal(allowed.json.ok, true);
    assert.equal(allowed.json.balance, 10);
  });
});

describe("otter-kart-rewards attestation templates", () => {
  test("check and award messages match client format", () => {
    const { buildCheckAttestation, buildAwardAttestation } = require("../lib/otter-kart-rewards/attestation.js");
    assert.match(
      buildCheckAttestation(WALLET, 1700000000),
      /Otter Kart - Rewards Check/,
    );
    assert.match(
      buildAwardAttestation(WALLET, 42, "run-xyz", 1700000000),
      /shells:42/,
    );
  });
});
