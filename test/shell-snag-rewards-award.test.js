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
    async zscore(key, member) {
      const bucket = zsets.get(key);
      if (!bucket) return null;
      const val = bucket.get(String(member));
      return val == null ? null : String(val);
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
const upstreamCalls = { award: [], check: [] };
const zaddCalls = [];
let verifyAwardResult = true;
let verifyCheckResult = true;
let upstreamAwardResponse = {
  ok: true,
  dripId: "drip_shell_test",
  balance: 250,
};
let upstreamCheckResponse = {
  ok: true,
  found: true,
  dripId: "drip_shell_test",
  balance: 250,
};

function mockVerifyModule() {
  mock.module("../lib/shell-rush-rewards/verify.js", {
    cache: false,
    namedExports: {
      verifyAwardSignature: async () => verifyAwardResult,
      verifyCheckSignature: async () => verifyCheckResult,
      assertFreshIssuedAt: (issuedAtSec, nowSec) => {
        if (!Number.isFinite(issuedAtSec) || issuedAtSec <= 0) return false;
        return Math.abs(nowSec - issuedAtSec) <= 900;
      },
      MAX_ISSUED_AGE_SEC: 900,
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
    zadd: (...args) => {
      zaddCalls.push(args);
      return backendRef.current.zadd(...args);
    },
    zscore: (...args) => backendRef.current.zscore(...args),
    zrevrangeWithScores: (...args) => backendRef.current.zrevrangeWithScores(...args),
  },
});

mockVerifyModule();

global.fetch = async (url, init) => {
  const body = init?.body ? JSON.parse(init.body) : {};
  const urlStr = String(url);
  if (urlStr.includes("/api/rewards/award")) {
    upstreamCalls.award.push({ url: urlStr, body });
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify(upstreamAwardResponse),
      json: async () => upstreamAwardResponse,
      headers: { get: () => "application/json" },
    };
  }
  if (urlStr.includes("/api/rewards/check")) {
    upstreamCalls.check.push({ url: urlStr, body });
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify(upstreamCheckResponse),
      json: async () => upstreamCheckResponse,
      headers: { get: () => "application/json" },
    };
  }
  throw new Error(`Unexpected fetch URL: ${urlStr}`);
};

const { handleShellSnagAward, handleShellSnagCheck } = require("../lib/shell-rush-rewards/handlers.js");
const { getClamBalance } = require("../lib/otterful-rewards/ledger.js");
const { gateAwardPost } = require("../lib/shell-rush-rewards/gate.js");

const WALLET = "0x1234567890123456789012345678901234567890";
const RUN_ID = "shell-snag-respawn-nonce-test";

function awardBody(overrides = {}) {
  return {
    wallet: WALLET,
    shells: 42,
    runId: RUN_ID,
    issuedAtSec: Math.floor(Date.now() / 1000),
    signature: "0x" + "11".repeat(65),
    score: 1200,
    ...overrides,
  };
}

describe("shell-snag award → central clam ledger", () => {
  beforeEach(() => {
    backendRef.current = createMemoryKv();
    upstreamCalls.award = [];
    upstreamCalls.check = [];
    zaddCalls.length = 0;
    verifyAwardResult = true;
    verifyCheckResult = true;
    upstreamAwardResponse = {
      ok: true,
      dripId: "drip_shell_test",
      balance: 292,
    };
    process.env.SHELL_RUSH_REWARDS_ALLOW_UNSIGNED_DEV = "0";
    delete process.env.SHELL_RUSH_DRIP_MAX_AWARD_PER_RUN;
    delete process.env.SHELL_RUSH_REWARDS_MAX_SHELLS_PER_CLAIM;
  });

  test("valid Shell Snag signature → Clam credited once and Drip upstream called", async () => {
    const result = await handleShellSnagAward(awardBody());
    assert.equal(result.status, 200);
    assert.equal(result.json.ok, true);
    assert.equal(result.json.alreadyCredited, false);
    assert.equal(typeof result.json.clamTxId, "string");
    assert.equal(result.json.clamBalance, 42);
    assert.equal(result.json.dripId, "drip_shell_test");
    assert.equal(upstreamCalls.award.length, 1);

    const balance = await getClamBalance(WALLET);
    assert.equal(balance.balance, 42);
  });

  test("same runId submitted twice → Clam credited only once and upstream skipped on replay", async () => {
    const first = await handleShellSnagAward(awardBody());
    const second = await handleShellSnagAward(awardBody());

    assert.equal(first.json.ok, true);
    assert.equal(first.json.alreadyCredited, false);
    assert.equal(second.json.ok, true);
    assert.equal(second.json.alreadyCredited, true);
    assert.equal(second.json.clamTxId, first.json.clamTxId);
    assert.equal(upstreamCalls.award.length, 1);

    const balance = await getClamBalance(WALLET);
    assert.equal(balance.balance, 42);
  });

  test("same runId submitted repeatedly → balance increases only once", async () => {
    await handleShellSnagAward(awardBody());
    await handleShellSnagAward(awardBody());
    await handleShellSnagAward(awardBody());

    const balance = await getClamBalance(WALLET);
    assert.equal(balance.balance, 42);
    assert.equal(upstreamCalls.award.length, 1);
  });

  test("invalid signature → zero Clams and no upstream Drip award", async () => {
    verifyAwardResult = false;

    const result = await handleShellSnagAward(awardBody());
    assert.equal(result.status, 403);
    assert.equal(result.json.code, "invalid_signature");

    const balance = await getClamBalance(WALLET);
    assert.equal(balance.balance, 0);
    assert.equal(upstreamCalls.award.length, 0);
    assert.equal(zaddCalls.length, 0);
  });

  test("expired/stale signature → zero Clams", async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const stale = await gateAwardPost({
      body: awardBody({ issuedAtSec: nowSec - 2000 }),
      env: { ...process.env, SHELL_RUSH_REWARDS_ALLOW_UNSIGNED_DEV: "0" },
      mode: "production",
      nowSec,
    });

    assert.equal(stale.ok, false);
    assert.equal(stale.status, 403);
    assert.equal(stale.json.code, "invalid_signature");

    const balance = await getClamBalance(WALLET);
    assert.equal(balance.balance, 0);
  });

  test("reward above existing cap → zero excess reward (signature mismatch)", async () => {
    process.env.SHELL_RUSH_REWARDS_MAX_SHELLS_PER_CLAIM = "10";
    verifyAwardResult = false;

    const result = await handleShellSnagAward(awardBody({ shells: 500 }));
    assert.equal(result.status, 403);

    const balance = await getClamBalance(WALLET);
    assert.equal(balance.balance, 0);
    assert.equal(upstreamCalls.award.length, 0);
  });

  test("demo/invalid wallet → no Clam reward", async () => {
    const result = await handleShellSnagAward(
      awardBody({ wallet: "demo-wallet-not-eth", signature: "0x" + "22".repeat(65) }),
    );
    assert.equal(result.status, 400);

    const balance = await getClamBalance("demo-wallet-not-eth");
    assert.equal(balance.ok, false);
    assert.equal(upstreamCalls.award.length, 0);
  });

  test("existing Drip reward behavior remains functional via upstream proxy", async () => {
    const result = await handleShellSnagAward(awardBody({ shells: 15 }));
    assert.equal(result.json.ok, true);
    assert.equal(result.json.dripId, "drip_shell_test");
    assert.equal(typeof result.json.balance, "number");
    assert.equal(result.json.clamBalance, 15);
    assert.equal(upstreamCalls.award.length, 1);
  });

  test("fake/unverified requests cannot create a trusted leaderboard reward", async () => {
    verifyAwardResult = false;

    await handleShellSnagAward(
      awardBody({ shells: 99999, score: 999999, signature: "0x" + "33".repeat(65) }),
    );

    assert.equal(zaddCalls.length, 0);
  });

  test("verified upstream success updates leaderboard using gated values", async () => {
    await handleShellSnagAward(awardBody({ shells: 30, score: 5000 }));

    assert.ok(zaddCalls.length >= 1);
    const pointsCall = zaddCalls.find((c) => c[0] === "shellrush:leaderboard:points");
    const shellsCall = zaddCalls.find((c) => c[0] === "shellrush:leaderboard:shells");
    assert.equal(pointsCall?.[1], 5000);
    assert.equal(shellsCall?.[1], 30);
  });
});

describe("shell-snag check gate", () => {
  beforeEach(() => {
    verifyCheckResult = true;
    upstreamCalls.check = [];
    process.env.SHELL_RUSH_REWARDS_ALLOW_UNSIGNED_DEV = "0";
  });

  test("check proxies upstream only after signature verification", async () => {
    const result = await handleShellSnagCheck({
      wallet: WALLET,
      issuedAtSec: Math.floor(Date.now() / 1000),
      signature: "0x" + "44".repeat(65),
    });

    assert.equal(result.status, 200);
    assert.equal(result.json.found, true);
    assert.equal(upstreamCalls.check.length, 1);
  });

  test("check rejects invalid signature before upstream", async () => {
    verifyCheckResult = false;

    const result = await handleShellSnagCheck({
      wallet: WALLET,
      issuedAtSec: Math.floor(Date.now() / 1000),
      signature: "0x" + "55".repeat(65),
    });

    assert.equal(result.status, 403);
    assert.equal(upstreamCalls.check.length, 0);
  });
});
