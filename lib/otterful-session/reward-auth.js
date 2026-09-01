const { validateSessionToken, normalizeWallet } = require("./handlers.js");

/**
 * Authorize a rewards request using a validated Otterful session token.
 * @returns {Promise<
 *   | { ok: true, wallet: string, authMethod: "session" }
 *   | { ok: false, status: number, json: object }
 *   | { ok: false, authMethod: null }
 * >}
 */
async function authorizeRewardSession({ body, wallet, env }) {
  const sessionToken =
    typeof body?.sessionToken === "string" ? body.sessionToken.trim() : "";
  if (!sessionToken) {
    return { ok: false, authMethod: null };
  }

  const normalized = normalizeWallet(wallet);
  if (!normalized) {
    return {
      ok: false,
      status: 400,
      json: { ok: false, code: "bad_wallet", message: "Valid wallet address required." },
    };
  }

  const session = await validateSessionToken(sessionToken, { env });
  if (!session.ok) {
    const status =
      session.code === "expired_session" || session.code === "invalid_session" ? 401 : 403;
    return {
      ok: false,
      status,
      json: {
        ok: false,
        code: session.code || "invalid_session",
        message: session.message || "Invalid session.",
      },
    };
  }

  if (session.wallet !== normalized) {
    return {
      ok: false,
      status: 403,
      json: {
        ok: false,
        code: "wallet_mismatch",
        message: "Session wallet does not match request wallet.",
      },
    };
  }

  return { ok: true, wallet: normalized, authMethod: "session" };
}

module.exports = { authorizeRewardSession };
