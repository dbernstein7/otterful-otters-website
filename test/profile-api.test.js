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
const walletOttersRef = { tokenIds: [] };

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
    zscore: (...args) => backendRef.current.zscore(...args),
    zrevrangeWithScores: (...args) => backendRef.current.zrevrangeWithScores(...args),
  },
});

mock.module("../lib/wallet-otters/lookup.js", {
  cache: false,
  namedExports: {
    fetchWalletOtterIds: async (wallet) => ({
      wallet,
      tokenIds: walletOttersRef.tokenIds.slice(),
      source: "test",
      verifiedOnChain: true,
    }),
  },
});

const { handleProfileGet } = require("../lib/otterful-profile/handlers.js");
const { recordClamReward } = require("../lib/otterful-rewards/ledger.js");
const profileHandler = require("../api/profile.js");

const WALLET = "0x1234567890123456789012345678901234567890";

describe("profile API", () => {
  beforeEach(() => {
    backendRef.current = createMemoryKv();
    walletOttersRef.tokenIds = [12, 481, 1902];
  });

  test("returns wallet address", async () => {
    const result = await handleProfileGet({ wallet: WALLET });
    assert.equal(result.status, 200);
    assert.equal(result.json.ok, true);
    assert.equal(result.json.wallet, WALLET);
  });

  test("returns verified Otterful NFT token IDs", async () => {
    const result = await handleProfileGet({ wallet: WALLET });
    assert.deepEqual(result.json.otters, [12, 481, 1902]);
  });

  test("returns current Clam balance from ledger", async () => {
    await recordClamReward({
      wallet: WALLET,
      game: "shell-snag",
      runId: "profile-balance-run",
      amount: 500,
    });

    const result = await handleProfileGet({ wallet: WALLET });
    assert.equal(result.json.clams, 500);
  });

  test("returns recent Clam activity", async () => {
    await recordClamReward({
      wallet: WALLET,
      game: "shell-snag",
      runId: "profile-act-1",
      amount: 500,
    });
    await recordClamReward({
      wallet: WALLET,
      game: "otter-kart",
      runId: "profile-act-2",
      amount: 250,
    });

    const result = await handleProfileGet({ wallet: WALLET, limit: 5 });
    assert.equal(result.json.activity.length, 2);
    const games = result.json.activity.map((row) => row.game);
    assert.ok(games.includes("shell-snag"));
    assert.ok(games.includes("otter-kart"));
    const amounts = result.json.activity.map((row) => row.amount).sort((a, b) => a - b);
    assert.deepEqual(amounts, [250, 500]);
    assert.ok(result.json.games.includes("shell-snag"));
    assert.ok(result.json.games.includes("otter-kart"));
  });

  test("rejects invalid wallet address", async () => {
    const result = await handleProfileGet({ wallet: "not-a-wallet" });
    assert.equal(result.status, 400);
    assert.equal(result.json.code, "bad_wallet");
  });

  test("wallet with no Otters gets empty NFT state", async () => {
    walletOttersRef.tokenIds = [];
    const result = await handleProfileGet({ wallet: WALLET });
    assert.deepEqual(result.json.otters, []);
  });

  test("wallet with no activity gets empty activity state", async () => {
    const result = await handleProfileGet({ wallet: WALLET });
    assert.deepEqual(result.json.activity, []);
    assert.deepEqual(result.json.games, []);
  });

  test("profile endpoint is read-only and rejects POST", async () => {
    const res = {
      statusCode: 0,
      headers: {},
      setHeader(k, v) {
        this.headers[k] = v;
      },
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        this.body = body;
        return this;
      },
    };

    await profileHandler({ method: "POST", query: { wallet: WALLET } }, res);
    assert.equal(res.statusCode, 405);
    assert.equal(res.body.error, "Method not allowed");

    const balanceBefore = await handleProfileGet({ wallet: WALLET });
    assert.equal(balanceBefore.json.clams, 0);
  });

  test("profile GET cannot modify Clam balances", async () => {
    await handleProfileGet({ wallet: WALLET, clams: 99999, amount: 99999 });
    const after = await handleProfileGet({ wallet: WALLET });
    assert.equal(after.json.clams, 0);
  });
});
