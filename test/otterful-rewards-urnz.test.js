"use strict";

const { describe, test, beforeEach, afterEach, mock } = require("node:test");
const assert = require("node:assert/strict");

const REALM_ID = "9ee65660fbd2344f82ad71ad";
const BASE_URL = "https://www.urnz.app/api/v1";
const WALLET = "0x1234567890123456789012345678901234567890";
const MEMBER_ID = "member_urnz_abc123";
const CURRENCY_ID = "currency_clams_001";
const API_KEY = "test-urnz-api-key";

const testEnv = {
  URNZ_API_KEY: API_KEY,
  URNZ_REALM_ID: REALM_ID,
};

function testConfig(overrides = {}) {
  const { getUrnzConfig } = require("../lib/otterful-rewards/urnz.js");
  return getUrnzConfig({ ...testEnv, ...overrides });
}

function jsonResponse(status, body, headers = {}) {
  return {
    status,
    headers: {
      get(name) {
        return headers[name] || headers[name.toLowerCase()] || null;
      },
    },
    async text() {
      return body == null ? "" : JSON.stringify(body);
    },
  };
}

function emptyResponse(status, headers = {}) {
  return {
    status,
    headers: {
      get(name) {
        return headers[name] || headers[name.toLowerCase()] || null;
      },
    },
    async text() {
      return "";
    },
  };
}

let fetchCalls = [];
let fetchImpl = async () => jsonResponse(404, { message: "not found" });

beforeEach(() => {
  fetchCalls = [];
  fetchImpl = async () => jsonResponse(404, { message: "not found" });
  mock.method(global, "fetch", async (url, init) => {
    fetchCalls.push({ url: String(url), init });
    return fetchImpl(url, init);
  });
  const { resetUrnzCacheForTests } = require("../lib/otterful-rewards/urnz.js");
  resetUrnzCacheForTests();
});

afterEach(() => {
  mock.restoreAll();
});

function mockCurrencyAndMember(memberOverrides = {}) {
  fetchImpl = async (url, init) => {
    const u = String(url);
    if (u.includes(`/realms/${REALM_ID}/currencies`)) {
      return jsonResponse(200, {
        data: [{ id: CURRENCY_ID, name: "Clams", default: true }],
      });
    }
    if (u.includes("/members/search")) {
      assert.match(u, /type=wallet-evm/);
      assert.match(u, new RegExp(`values=${WALLET}`));
      return jsonResponse(200, {
        data: [
          {
            id: MEMBER_ID,
            balances: [{ currencyId: CURRENCY_ID, balance: 100 }],
            ...memberOverrides,
          },
        ],
      });
    }
    if (u.includes(`/members/${MEMBER_ID}/balance`) && init?.method === "PATCH") {
      return jsonResponse(201, { balance: 125, id: "urnz_tx_001" });
    }
    if (u === `${BASE_URL}/realms/${REALM_ID}`) {
      return jsonResponse(200, { data: { id: REALM_ID, name: "Otterful" } });
    }
    return jsonResponse(404, { message: "unexpected " + u });
  };
}

describe("URNZ config", () => {
  test("defaults member search type to wallet-evm", () => {
    const config = testConfig();
    assert.equal(config.memberSearchType, "wallet-evm");
  });

  test("defaults realm id to documented Otterful realm", () => {
    const config = testConfig({ URNZ_REALM_ID: undefined });
    assert.equal(config.realmId, REALM_ID);
  });

  test("getStatus does not expose API key", () => {
    const { getStatus } = require("../lib/otterful-rewards/urnz.js");
    const status = getStatus(testEnv);
    assert.equal(status.configured, true);
    assert.equal(JSON.stringify(status).includes(API_KEY), false);
    assert.deepEqual(status.requiredScopes, ["read:realm", "read:members", "write:balances"]);
  });
});

describe("URNZ wallet-evm lookup", () => {
  test("searches members with wallet-evm credential type", async () => {
    mockCurrencyAndMember();
    const { findMemberByWallet } = require("../lib/otterful-rewards/urnz.js");
    const result = await findMemberByWallet(testConfig(), WALLET);
    assert.equal(result.ok, true);
    assert.equal(result.member.id, MEMBER_ID);

    const searchCall = fetchCalls.find((c) => c.url.includes("/members/search"));
    assert.ok(searchCall);
    assert.match(searchCall.url, /type=wallet-evm/);
    assert.match(searchCall.url, /values=0x1234567890123456789012345678901234567890/);
    assert.equal(searchCall.init.headers.Authorization, `Bearer ${API_KEY}`);
  });

  test("resolves member id from search response", async () => {
    mockCurrencyAndMember();
    const { award } = require("../lib/otterful-rewards/urnz.js");
    await award(WALLET, 25, { txId: "clm_test123" }, { config: testConfig() });

    const patchCall = fetchCalls.find(
      (c) => c.url.includes(`/members/${MEMBER_ID}/balance`) && c.init.method === "PATCH",
    );
    assert.ok(patchCall);
  });

  test("missing member returns no_member on empty data array", async () => {
    fetchImpl = async (url) => {
      if (String(url).includes("/members/search")) {
        return jsonResponse(200, { data: [] });
      }
      return jsonResponse(404, { message: "unexpected" });
    };

    const { findMemberByWallet } = require("../lib/otterful-rewards/urnz.js");
    const result = await findMemberByWallet(testConfig(), WALLET);
    assert.equal(result.ok, false);
    assert.equal(result.code, "no_member");
  });
});

describe("URNZ balance increment", () => {
  test("increments balance with action increment and discovered currencyId", async () => {
    mockCurrencyAndMember();
    const { award } = require("../lib/otterful-rewards/urnz.js");
    const result = await award(WALLET, 25, { txId: "clm_award001" }, { config: testConfig() });

    assert.equal(result.ok, true);
    assert.equal(result.httpStatus, 201);
    assert.equal(result.balance, 125);
    assert.equal(result.currencyId, CURRENCY_ID);

    const patchCall = fetchCalls.find((c) => c.init?.method === "PATCH");
    assert.ok(patchCall);
    const body = JSON.parse(patchCall.init.body);
    assert.deepEqual(body, {
      amount: 25,
      currencyId: CURRENCY_ID,
      action: "increment",
    });
  });

  test("uses deterministic Idempotency-Key from transaction id", async () => {
    mockCurrencyAndMember();
    const { award } = require("../lib/otterful-rewards/urnz.js");
    await award(WALLET, 10, { txId: "clm_idempotent_key" }, { config: testConfig() });

    const patchCall = fetchCalls.find((c) => c.init?.method === "PATCH");
    assert.equal(patchCall.init.headers["Idempotency-Key"], "clm_idempotent_key");
  });

  test("handles 204 claim response with no JSON body", async () => {
    fetchImpl = async (url, init) => {
      const u = String(url);
      if (u.includes("/currencies")) {
        return jsonResponse(200, { data: [{ id: CURRENCY_ID, default: true }] });
      }
      if (u.includes("/members/search")) {
        return jsonResponse(200, {
          data: [{ id: MEMBER_ID, balances: [{ currencyId: CURRENCY_ID, balance: 50 }] }],
        });
      }
      if (u.includes("/balance") && init?.method === "PATCH") {
        return emptyResponse(204);
      }
      return jsonResponse(404, { message: "unexpected" });
    };

    const { award } = require("../lib/otterful-rewards/urnz.js");
    const result = await award(WALLET, 15, { txId: "clm_claim204" }, { config: testConfig() });
    assert.equal(result.ok, true);
    assert.equal(result.httpStatus, 204);
    assert.equal(result.claimed, true);
    assert.equal(result.balance, 65);
  });
});

describe("URNZ error handling", () => {
  test("maps 403 to forbidden auth/scope error", async () => {
    fetchImpl = async () => jsonResponse(403, { message: "Insufficient scope" });

    const { findMemberByWallet } = require("../lib/otterful-rewards/urnz.js");
    const result = await findMemberByWallet(testConfig(), WALLET);
    assert.equal(result.ok, false);
    assert.equal(result.code, "forbidden");
    assert.equal(result.status, 403);
    assert.match(result.message, /scope|authentication|denied/i);
  });

  test("honors Retry-After on 429 then succeeds", async () => {
    let attempts = 0;
    fetchImpl = async (url) => {
      attempts += 1;
      if (String(url).includes("/members/search")) {
        if (attempts === 1) {
          return jsonResponse(429, { message: "Rate limited" }, { "Retry-After": "1" });
        }
        return jsonResponse(200, { data: [{ id: MEMBER_ID, balances: [] }] });
      }
      return jsonResponse(404, { message: "unexpected" });
    };

    const { findMemberByWallet } = require("../lib/otterful-rewards/urnz.js");
    const started = Date.now();
    const result = await findMemberByWallet(testConfig(), WALLET);
    const elapsed = Date.now() - started;

    assert.equal(result.ok, true);
    assert.equal(result.member.id, MEMBER_ID);
    assert.ok(elapsed >= 900, "expected Retry-After delay before retry");
    assert.equal(fetchCalls.filter((c) => c.url.includes("/members/search")).length, 2);
  });
});

describe("URNZ realm connectivity", () => {
  test("checkConnectivity calls GET /realms/{realmId}", async () => {
    fetchImpl = async (url) => {
      assert.equal(String(url), `${BASE_URL}/realms/${REALM_ID}`);
      return jsonResponse(200, { data: { id: REALM_ID, name: "Otterful Otters" } });
    };

    const { checkConnectivity } = require("../lib/otterful-rewards/urnz.js");
    const result = await checkConnectivity({ config: testConfig() });
    assert.equal(result.ok, true);
    assert.equal(result.realmId, REALM_ID);
    assert.equal(result.realm.name, "Otterful Otters");
  });

  test("checkConnectivity surfaces 403 failures", async () => {
    fetchImpl = async () => jsonResponse(403, { message: "Forbidden" });

    const { checkConnectivity } = require("../lib/otterful-rewards/urnz.js");
    const result = await checkConnectivity({ config: testConfig() });
    assert.equal(result.ok, false);
    assert.equal(result.code, "forbidden");
  });
});
