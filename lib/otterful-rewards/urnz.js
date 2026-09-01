/**
 * URNZ provider adapter (server-side only).
 *
 * Official API: https://www.urnz.app/api/v1
 * Auth: Authorization: Bearer {URNZ_API_KEY}
 * Required scopes: read:realm, read:members, write:balances
 *
 * Endpoints used:
 * - GET  /realms/{realmId}
 * - GET  /realms/{realmId}/currencies
 * - GET  /realms/{realmId}/members/search?type=wallet-evm&values={wallet}
 * - PATCH /realms/{realmId}/members/{memberId}/balance
 */

const DEFAULT_REALM_ID = "9ee65660fbd2344f82ad71ad";
const DEFAULT_BASE_URL = "https://www.urnz.app/api/v1";
const DEFAULT_MEMBER_SEARCH_TYPE = "wallet-evm";
const REQUIRED_SCOPES = ["read:realm", "read:members", "write:balances"];

const SENSITIVE_PATTERNS = [/bearer\s+/i, /authorization/i, /api[_-]?key/i];

function sanitizeErrorMessage(message) {
  if (!message) return "URNZ API error";
  let safe = String(message);
  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(safe)) return "URNZ API error";
  }
  return safe;
}

function getUrnzConfig(env = process.env) {
  const apiKey = String(env.URNZ_API_KEY || "").trim();
  const realmId = String(env.URNZ_REALM_ID || DEFAULT_REALM_ID).trim();
  const baseUrl = String(env.URNZ_BASE_URL || DEFAULT_BASE_URL).trim().replace(/\/$/, "");
  const memberSearchType =
    String(env.URNZ_MEMBER_SEARCH_TYPE || DEFAULT_MEMBER_SEARCH_TYPE).trim() ||
    DEFAULT_MEMBER_SEARCH_TYPE;
  const currencyId = String(env.URNZ_CURRENCY_ID || "").trim() || undefined;

  return {
    apiKey,
    realmId,
    baseUrl,
    memberSearchType,
    currencyId,
    configured: Boolean(apiKey && realmId),
  };
}

function buildUrl(baseUrl, path, query = {}) {
  const url = new URL(`${baseUrl}${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function normalizeWalletAddress(wallet) {
  return String(wallet || "").trim().toLowerCase();
}

function parseResponseBody(text) {
  if (!text || !String(text).trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function mapHttpError(status, data) {
  if (status === 403) {
    return {
      ok: false,
      code: "forbidden",
      message: sanitizeErrorMessage(
        typeof data === "object" && data?.message
          ? data.message
          : "URNZ authentication, scope, or realm access denied.",
      ),
      status: 403,
    };
  }

  const message = sanitizeErrorMessage(
    typeof data === "object" && data?.message ? data.message : `HTTP ${status}`,
  );
  return {
    ok: false,
    code: "urnz_error",
    message,
    status,
  };
}

async function urnzRequest(config, method, path, { body, query, idempotencyKey, retries = 0 } = {}) {
  const url = buildUrl(config.baseUrl, path, query);
  const headers = {
    Authorization: `Bearer ${config.apiKey}`,
    Accept: "application/json",
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (idempotencyKey) {
    headers["Idempotency-Key"] = idempotencyKey;
  }

  const options = { method, headers };
  if (body !== undefined) {
    options.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(url, options);
  } catch (err) {
    return {
      ok: false,
      code: "network_error",
      message: sanitizeErrorMessage(err?.message || "Network error contacting URNZ"),
    };
  }

  if (response.status === 429 && retries < 2) {
    const retryAfter = parseInt(response.headers.get("Retry-After") || "2", 10);
    await new Promise((resolve) => setTimeout(resolve, Math.max(1, retryAfter) * 1000));
    return urnzRequest(config, method, path, { body, query, idempotencyKey, retries: retries + 1 });
  }

  const text = await response.text();
  const data = parseResponseBody(text);
  const successStatuses = new Set([200, 201, 204]);

  if (!successStatuses.has(response.status)) {
    const err = mapHttpError(response.status, data);
    err.retryAfter = response.headers.get("Retry-After");
    return err;
  }

  return {
    ok: true,
    data: response.status === 204 ? null : data,
    status: response.status,
    noContent: response.status === 204,
  };
}

let cachedDefaultCurrency = null;

async function getDefaultCurrency(config) {
  if (config.currencyId) {
    return { id: config.currencyId };
  }
  if (cachedDefaultCurrency) {
    return cachedDefaultCurrency;
  }

  const res = await urnzRequest(config, "GET", `/realms/${config.realmId}/currencies`);
  if (!res.ok) {
    return { error: res };
  }

  const currencies = res.data?.data || res.data?.currencies || res.data || [];
  const list = Array.isArray(currencies) ? currencies : [];
  const defaultCurrency = list.find((c) => c.default === true) || list[0];
  if (!defaultCurrency) {
    return {
      error: { ok: false, code: "no_currency", message: "No default currency found for URNZ realm." },
    };
  }

  cachedDefaultCurrency = {
    id: defaultCurrency.id || defaultCurrency.currencyId,
    name: defaultCurrency.name || defaultCurrency.currencyName,
  };
  return cachedDefaultCurrency;
}

async function searchMembers(config, type, values) {
  return urnzRequest(config, "GET", `/realms/${config.realmId}/members/search`, {
    query: { type, values: String(values).trim() },
  });
}

async function findMemberByWallet(config, wallet) {
  const normalized = normalizeWalletAddress(wallet);
  if (!normalized || !/^0x[a-f0-9]{40}$/.test(normalized)) {
    return { ok: false, code: "bad_wallet", message: "Valid EVM wallet required for URNZ member lookup." };
  }

  const res = await searchMembers(config, config.memberSearchType, normalized);
  if (!res.ok) {
    return { ok: false, code: res.code, message: res.message, status: res.status };
  }

  const members = res.data?.data ?? [];
  if (!Array.isArray(members) || members.length === 0) {
    return { ok: false, code: "no_member", message: "No URNZ realm member matched wallet." };
  }

  const member = members[0];
  if (!member?.id) {
    return { ok: false, code: "bad_member", message: "URNZ member response missing id." };
  }

  return { ok: true, member };
}

function memberBalanceForCurrency(member, currencyId) {
  const balances = member?.balances || [];
  const match = balances.find((b) => b.currencyId === currencyId);
  return match?.balance ?? 0;
}

function resolveMemberId(member) {
  const id = member?.id;
  return id != null && String(id).trim() ? String(id).trim() : null;
}

/**
 * GET /realms/{realmId} connectivity / health check.
 */
async function checkConnectivity(opts = {}) {
  const config = opts.config || getUrnzConfig(opts.env);
  if (!config.configured) {
    return { ok: false, code: "not_configured", message: "URNZ is not configured." };
  }

  const res = await urnzRequest(config, "GET", `/realms/${config.realmId}`);
  if (!res.ok) {
    return res;
  }

  return {
    ok: true,
    status: res.status,
    realm: res.data?.data ?? res.data ?? null,
    realmId: config.realmId,
  };
}

/**
 * @returns {{ ok: boolean, configured: boolean, realmId?: string, baseUrl?: string, message?: string }}
 */
function getStatus(env = process.env) {
  const config = getUrnzConfig(env);
  if (!config.configured) {
    return {
      ok: true,
      configured: false,
      message: "URNZ credentials not configured (URNZ_API_KEY, URNZ_REALM_ID).",
      requiredScopes: REQUIRED_SCOPES,
    };
  }
  return {
    ok: true,
    configured: true,
    realmId: config.realmId,
    baseUrl: config.baseUrl,
    memberSearchType: config.memberSearchType,
    requiredScopes: REQUIRED_SCOPES,
  };
}

/**
 * Read URNZ balance for a wallet-connected member.
 */
async function getBalance(wallet, opts = {}) {
  const config = opts.config || getUrnzConfig(opts.env);
  if (!config.configured) {
    return { ok: false, code: "not_configured", message: "URNZ is not configured." };
  }

  const currency = await getDefaultCurrency(config);
  if (currency.error) {
    return { ok: false, ...currency.error };
  }

  const found = await findMemberByWallet(config, wallet);
  if (!found.ok) {
    if (found.code === "no_member") {
      return { ok: true, found: false, balance: 0, currencyId: currency.id };
    }
    return found;
  }

  return {
    ok: true,
    found: true,
    memberId: found.member.id,
    balance: memberBalanceForCurrency(found.member, currency.id),
    currencyId: currency.id,
  };
}

/**
 * Award (increment) URNZ points for a wallet member.
 * Uses Idempotency-Key = transaction.txId to prevent double-credit on retry.
 *
 * @param {string} wallet
 * @param {number} amount
 * @param {{ txId: string, game?: string, runId?: string }} transaction
 */
async function award(wallet, amount, transaction = {}, opts = {}) {
  const config = opts.config || getUrnzConfig(opts.env);
  if (!config.configured) {
    return { ok: false, code: "not_configured", message: "URNZ is not configured." };
  }

  const txId = String(transaction?.txId || "").trim();
  if (!txId) {
    return { ok: false, code: "bad_tx_id", message: "Transaction id required for URNZ award." };
  }

  const points = Math.floor(Number(amount));
  if (!Number.isFinite(points) || points <= 0) {
    return { ok: false, code: "bad_amount", message: "Amount must be a positive integer." };
  }

  const currency = await getDefaultCurrency(config);
  if (currency.error) {
    return { ok: false, ...currency.error };
  }

  const found = await findMemberByWallet(config, wallet);
  if (!found.ok) {
    return found;
  }

  const memberId = resolveMemberId(found.member);
  if (!memberId) {
    return { ok: false, code: "bad_member", message: "URNZ member id missing." };
  }

  const res = await urnzRequest(
    config,
    "PATCH",
    `/realms/${config.realmId}/members/${memberId}/balance`,
    {
      body: { amount: points, currencyId: currency.id, action: "increment" },
      idempotencyKey: txId,
    },
  );

  if (!res.ok) {
    return res;
  }

  const priorBalance = memberBalanceForCurrency(found.member, currency.id);
  const responseBalance =
    res.noContent || res.data == null
      ? priorBalance + points
      : typeof res.data?.balance === "number"
        ? res.data.balance
        : priorBalance + points;

  return {
    ok: true,
    memberId,
    urnzMemberId: memberId,
    balance: responseBalance,
    currencyId: currency.id,
    httpStatus: res.status,
    externalReference: res.data?.id || res.data?.transactionId || txId,
    idempotencyKey: txId,
    claimed: res.status === 204,
  };
}

/** Test helper — reset cached currency between tests. */
function resetUrnzCacheForTests() {
  cachedDefaultCurrency = null;
}

module.exports = {
  DEFAULT_REALM_ID,
  DEFAULT_BASE_URL,
  DEFAULT_MEMBER_SEARCH_TYPE,
  REQUIRED_SCOPES,
  getUrnzConfig,
  getStatus,
  checkConnectivity,
  getBalance,
  award,
  findMemberByWallet,
  searchMembers,
  getDefaultCurrency,
  buildUrl,
  sanitizeErrorMessage,
  resetUrnzCacheForTests,
  normalizeWalletAddress,
  resolveMemberId,
};
