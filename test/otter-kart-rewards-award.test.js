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
const dripCalls = { award: [] };
let verifyAwardResult = true;

function mockVerifyModule() {
  mock.module("../lib/otter-kart-rewards/verify.js", {
    cache: false,
    namedExports: {
      verifyAwardSignature: async () => verifyAwardResult,
      verifyCheckSignature: async () => true,
    },
  });
}

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

mock.module("../lib/otter-kart-rewards/drip.js", {
  cache: false,
  namedExports: {
    checkDripRealmMember: async () => ({ ok: true, found: true, dripId: "drip_test", balance: 100 }),
    awardDripPointsServer: async (input) => {
      dripCalls.award.push(input);
      return { ok: true, dripId: "drip_test", balance: (input.points || 0) + 100 };
    },
  },
});

mockVerifyModule();

const { handleOtterKartAward } = require("../lib/otter-kart-rewards/handlers.js");
const { getClamBalance } = require("../lib/otterful-rewards/ledger.js");
const { gateAwardPost } = require("../lib/otter-kart-rewards/gate.js");

const WALLET = "0x1234567890123456789012345678901234567890";
const RUN_ID = "otterkart-session-test-run";

function awardBody(overrides = {}) {
  return {
    game: "otter-kart",
    wallet: WALLET,
    shells: 42,
    runId: RUN_ID,
    issuedAtSec: Math.floor(Date.now() / 1000),
    signature: "0x" + "11".repeat(65),
    ...overrides,
  };
}

describe("otter-kart award → central clam ledger", () => {
  beforeEach(() => {
    backendRef.current = createMemoryKv();
    dripCalls.award = [];
    verifyAwardResult = true;
    process.env.OTTER_KART_DRIP_API_KEY = "test-drip-key";
    process.env.OTTER_KART_REWARDS_ALLOW_UNSIGNED_DEV = "0";
    delete process.env.OTTER_KART_DRIP_MAX_AWARD_PER_RUN;
    delete process.env.OTTER_KART_REWARDS_MAX_SHELLS_PER_CLAIM;
  });

  test("valid award creates exactly one Clam transaction and Drip award", async () => {
    const result = await handleOtterKartAward(awardBody());
    assert.equal(result.status, 200);
    assert.equal(result.json.ok, true);
    assert.equal(result.json.alreadyCredited, false);
    assert.equal(typeof result.json.clamTxId, "string");
    assert.equal(result.json.clamBalance, 42);
    assert.equal(result.json.dripId, "drip_test");
    assert.equal(dripCalls.award.length, 1);

    const balance = await getClamBalance(WALLET);
    assert.equal(balance.balance, 42);
  });

  test("same runId submitted twice credits Clams once and skips second Drip award", async () => {
    const first = await handleOtterKartAward(awardBody());
    const second = await handleOtterKartAward(awardBody());

    assert.equal(first.json.ok, true);
    assert.equal(first.json.alreadyCredited, false);
    assert.equal(second.json.ok, true);
    assert.equal(second.json.alreadyCredited, true);
    assert.equal(second.json.clamTxId, first.json.clamTxId);
    assert.equal(dripCalls.award.length, 1);

    const balance = await getClamBalance(WALLET);
    assert.equal(balance.balance, 42);
  });

  test("same runId submitted multiple times increases balance only once", async () => {
    await handleOtterKartAward(awardBody());
    await handleOtterKartAward(awardBody());
    await handleOtterKartAward(awardBody());

    const balance = await getClamBalance(WALLET);
    assert.equal(balance.balance, 42);
    assert.equal(dripCalls.award.length, 1);
  });

  test("invalid signature awards no Clams", async () => {
    verifyAwardResult = false;

    const result = await handleOtterKartAward(awardBody());
    assert.equal(result.status, 403);
    assert.equal(result.json.code, "invalid_signature");

    const balance = await getClamBalance(WALLET);
    assert.equal(balance.balance, 0);
    assert.equal(dripCalls.award.length, 0);
  });

  test("exceeded reward cap awards no Clams", async () => {
    process.env.OTTER_KART_REWARDS_MAX_SHELLS_PER_CLAIM = "10";
    verifyAwardResult = false;

    const result = await handleOtterKartAward(awardBody({ shells: 500 }));
    assert.equal(result.status, 403);

    const balance = await getClamBalance(WALLET);
    assert.equal(balance.balance, 0);
    assert.equal(dripCalls.award.length, 0);
  });

  test("wallet-less award path skips Clams (demo/dev dripUserId only)", async () => {
    process.env.OTTER_KART_REWARDS_ALLOW_DRIP_USER_ID_BODY = "1";
    process.env.OTTER_KART_REWARDS_ALLOW_UNSIGNED_DEV = "1";
    process.env.NODE_ENV = "development";

    const result = await handleOtterKartAward(
      awardBody({ wallet: "", dripUserId: "demo-user-12345678", signature: "" }),
    );

    assert.equal(result.status, 200);
    assert.equal(result.json.ok, true);
    assert.equal(result.json.clamBalance, undefined);
    assert.equal(dripCalls.award.length, 1);

    delete process.env.OTTER_KART_REWARDS_ALLOW_DRIP_USER_ID_BODY;
    delete process.env.OTTER_KART_REWARDS_ALLOW_UNSIGNED_DEV;
    process.env.NODE_ENV = "test";
  });

  test("Drip award still runs when Clam ledger succeeds", async () => {
    const result = await handleOtterKartAward(awardBody({ shells: 15 }));
    assert.equal(result.json.ok, true);
    assert.equal(result.json.balance, 115);
    assert.equal(result.json.clamBalance, 15);
    assert.equal(dripCalls.award[0].points, 15);
  });
});

describe("otter-kart gateAwardPost", () => {
  test("requires runId in award payload", async () => {
    const gated = await gateAwardPost({
      body: {
        wallet: WALLET,
        shells: 5,
        runId: "",
        issuedAtSec: Math.floor(Date.now() / 1000),
        signature: "0x" + "22".repeat(65),
      },
      env: { ...process.env, OTTER_KART_REWARDS_ALLOW_UNSIGNED_DEV: "1" },
      mode: "development",
      nowSec: Math.floor(Date.now() / 1000),
    });
    assert.equal(gated.ok, false);
  });
});
