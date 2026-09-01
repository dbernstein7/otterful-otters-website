"use strict";

const { describe, test, beforeEach, mock } = require("node:test");
const assert = require("node:assert/strict");

function createMemoryKv() {
  const strings = new Map();
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
    async kvDel(key) {
      strings.delete(key);
    },
  };
}

const backendRef = { current: createMemoryKv() };
let verifySessionOk = true;

mock.module("../lib/otter-kart-leaderboard/kv.js", {
  cache: false,
  namedExports: {
    isKvConfigured: () => backendRef.current.isKvConfigured(),
    kvGet: (...args) => backendRef.current.kvGet(...args),
    kvSet: (...args) => backendRef.current.kvSet(...args),
    kvDel: (...args) => backendRef.current.kvDel(...args),
    kvSetNx: async () => true,
    kvIncrBy: async () => 0,
    zadd: async () => {},
    zscore: async () => null,
    zrevrangeWithScores: async () => [],
  },
});

mock.module("../lib/otterful-session/verify.js", {
  cache: false,
  namedExports: {
    verifySessionSignature: async () => verifySessionOk,
    isHexSig: (s) => /^0x[0-9a-fA-F]{130}$/.test(s) || /^0x[0-9a-fA-F]{128}$/.test(s),
  },
});

const {
  issueNonce,
  createSessionFromSignature,
  validateSessionToken,
  TOKEN_PREFIX,
} = require("../lib/otterful-session/handlers.js");
const nonceHandler = require("../api/session/nonce.js");
const validateHandler = require("../api/session/validate.js");

const WALLET_A = "0x1234567890123456789012345678901234567890";
const WALLET_B = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";

describe("otterful session", () => {
  beforeEach(() => {
    backendRef.current = createMemoryKv();
    verifySessionOk = true;
  });

  test("valid wallet authentication creates a session", async () => {
    const nonce = await issueNonce(WALLET_A);
    assert.equal(nonce.ok, true);

    const session = await createSessionFromSignature({
      wallet: WALLET_A,
      nonce: nonce.nonce,
      issuedAtSec: nonce.issuedAtSec,
      signature: "0x" + "11".repeat(65),
    });

    assert.equal(session.ok, true);
    assert.equal(typeof session.sessionToken, "string");

    const validated = await validateSessionToken(session.sessionToken);
    assert.equal(validated.ok, true);
    assert.equal(validated.wallet, WALLET_A);
  });

  test("invalid signature cannot create a session", async () => {
    verifySessionOk = false;
    const nonce = await issueNonce(WALLET_A);

    const session = await createSessionFromSignature({
      wallet: WALLET_A,
      nonce: nonce.nonce,
      issuedAtSec: nonce.issuedAtSec,
      signature: "0x" + "22".repeat(65),
    });

    assert.equal(session.ok, false);
    assert.equal(session.code, "invalid_signature");
  });

  test("expired session is rejected", async () => {
    const nonce = await issueNonce(WALLET_A);
    const session = await createSessionFromSignature({
      wallet: WALLET_A,
      nonce: nonce.nonce,
      issuedAtSec: nonce.issuedAtSec,
      signature: "0x" + "33".repeat(65),
    });
    assert.equal(session.ok, true);

    const key = `${TOKEN_PREFIX}:${session.sessionToken}`;
    const raw = await backendRef.current.kvGet(key);
    const record = JSON.parse(raw);
    record.expiresAt = Date.now() - 1000;
    await backendRef.current.kvSet(key, JSON.stringify(record));

    const validated = await validateSessionToken(session.sessionToken);
    assert.equal(validated.ok, false);
    assert.equal(validated.code, "expired_session");
  });

  test("session token cannot be reused as another wallet", async () => {
    const nonce = await issueNonce(WALLET_A);
    const session = await createSessionFromSignature({
      wallet: WALLET_A,
      nonce: nonce.nonce,
      issuedAtSec: nonce.issuedAtSec,
      signature: "0x" + "44".repeat(65),
    });

    const validated = await validateSessionToken(session.sessionToken);
    assert.equal(validated.wallet, WALLET_A);
    assert.notEqual(validated.wallet, WALLET_B);
  });

  test("validate endpoint rejects POST without token", async () => {
    const res = {
      statusCode: 0,
      setHeader() {},
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        this.body = body;
        return this;
      },
    };
    await validateHandler({ method: "POST", body: {}, headers: {} }, res);
    assert.equal(res.statusCode, 400);
  });

  test("nonce endpoint rejects GET", async () => {
    const res = {
      statusCode: 0,
      setHeader() {},
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        this.body = body;
        return this;
      },
    };
    await nonceHandler({ method: "GET" }, res);
    assert.equal(res.statusCode, 405);
  });
});

describe("otterful launch message trust", () => {
  test("unknown origin cannot inject a wallet launch message", async () => {
    const { isTrustedLaunchMessage } = await import("../otterful-game-launch.mjs");
    const trustedOrigin = "https://otterfulotters.xyz";
    const badEvent = {
      origin: "https://evil.example",
      data: { type: "OTTERFUL_LAUNCH_SESSION", v: 1, sessionToken: "abc" },
    };
    const goodEvent = {
      origin: trustedOrigin,
      data: { type: "OTTERFUL_LAUNCH_SESSION", v: 1, sessionToken: "abc" },
    };

    assert.equal(isTrustedLaunchMessage(badEvent, trustedOrigin), false);
    assert.equal(isTrustedLaunchMessage(goodEvent, trustedOrigin), true);
  });
});

describe("reward gates still require signatures (session is not a reward bypass)", () => {
  test("OtterKart award gate still rejects without valid reward signature", async () => {
    mock.module("../lib/otter-kart-rewards/verify.js", {
      cache: false,
      namedExports: {
        verifyAwardSignature: async () => false,
        verifyCheckSignature: async () => false,
      },
    });
    const { gateAwardPost: kartGate } = require("../lib/otter-kart-rewards/gate.js");
    const gated = await kartGate({
      body: {
        game: "otter-kart",
        wallet: WALLET_A,
        shells: 10,
        runId: "run-test",
        issuedAtSec: Math.floor(Date.now() / 1000),
        signature: "0x" + "55".repeat(65),
      },
      env: { OTTER_KART_REWARDS_ALLOW_UNSIGNED_DEV: "0" },
      mode: "production",
      nowSec: Math.floor(Date.now() / 1000),
    });
    assert.equal(gated.ok, false);
    assert.equal(gated.status, 403);
  });

  test("Shell Snag award gate still rejects without valid reward signature", async () => {
    mock.module("../lib/shell-rush-rewards/verify.js", {
      cache: false,
      namedExports: {
        verifyAwardSignature: async () => false,
        verifyCheckSignature: async () => false,
        assertFreshIssuedAt: () => true,
        MAX_ISSUED_AGE_SEC: 900,
      },
    });
    const { gateAwardPost: snagGate } = require("../lib/shell-rush-rewards/gate.js");
    const gated = await snagGate({
      body: {
        wallet: WALLET_A,
        shells: 10,
        runId: "run-test",
        issuedAtSec: Math.floor(Date.now() / 1000),
        signature: "0x" + "66".repeat(65),
      },
      env: { SHELL_RUSH_REWARDS_ALLOW_UNSIGNED_DEV: "0" },
      mode: "production",
      nowSec: Math.floor(Date.now() / 1000),
    });
    assert.equal(gated.ok, false);
    assert.equal(gated.status, 403);
  });
});
