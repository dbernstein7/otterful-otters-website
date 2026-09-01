const { getClamBalance, getClamHistory } = require("../otterful-rewards/ledger.js");
const { getClamConfig, getRewardsProviderConfig } = require("../otterful-rewards/env.js");
const { getBalance: getUrnzBalance } = require("../otterful-rewards/urnz.js");
const { fetchWalletOtterIds } = require("../wallet-otters/lookup.js");

const DEFAULT_ACTIVITY_LIMIT = 10;

function parseActivityLimit(raw, config) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_ACTIVITY_LIMIT;
  return Math.min(config.historyMaxLimit, Math.max(1, Math.floor(n)));
}

function normalizeProfileWallet(wallet) {
  const w = String(wallet || "").trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(w)) return null;
  return w;
}

function mapActivityRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((tx) => tx && typeof tx === "object")
    .map((tx) => ({
      game: String(tx.game || ""),
      amount: Math.max(0, Math.floor(Number(tx.amount) || 0)),
      createdAt: tx.createdAt || null,
      txId: tx.txId || "",
    }));
}

function uniqueGames(activity) {
  return [...new Set(activity.map((row) => row.game).filter(Boolean))];
}

async function handleProfileGet(query, opts = {}) {
  const wallet = normalizeProfileWallet(query?.wallet || query?.address);
  if (!wallet) {
    return {
      status: 400,
      json: { ok: false, code: "bad_wallet", message: "Valid wallet address required (?wallet=0x…)." },
    };
  }

  const config = opts.config || getClamConfig(opts.env);
  const providerConfig = getRewardsProviderConfig(opts.env);
  const activityLimit = parseActivityLimit(query?.limit, config);

  const fetches = [
    fetchWalletOtterIds(wallet).catch((err) => ({
      wallet,
      tokenIds: [],
      error: err?.message || "Failed to load otters",
    })),
    getClamBalance(wallet),
    getClamHistory(wallet, activityLimit, { config, env: opts.env }),
  ];

  if (providerConfig.useUrnz) {
    fetches.push(getUrnzBalance(wallet, { env: opts.env }));
  }

  const results = await Promise.all(fetches);
  const ottersResult = results[0];
  const balanceResult = results[1];
  const historyResult = results[2];
  const urnzResult = providerConfig.useUrnz ? results[3] : null;

  const otters = Array.isArray(ottersResult?.tokenIds) ? ottersResult.tokenIds : [];
  const clams =
    balanceResult?.ok && Number.isFinite(balanceResult.balance)
      ? Math.max(0, Math.floor(balanceResult.balance))
      : 0;

  const activity =
    historyResult?.ok && Array.isArray(historyResult.rows)
      ? mapActivityRows(historyResult.rows)
      : [];

  const json = {
    ok: true,
    wallet,
    otters,
    clams,
    activity,
    games: uniqueGames(activity),
  };

  if (ottersResult?.error) {
    json.ottersError = ottersResult.error;
  }
  if (!balanceResult?.ok && balanceResult?.code === "not_configured") {
    json.clamsConfigured = false;
  }
  if (!historyResult?.ok && historyResult?.code === "not_configured") {
    json.activityConfigured = false;
  }

  if (providerConfig.useUrnz && urnzResult) {
    if (urnzResult.ok) {
      json.urnzBalance = urnzResult.found ? Math.max(0, Math.floor(urnzResult.balance)) : 0;
      json.urnzMemberFound = Boolean(urnzResult.found);
    } else if (urnzResult.code !== "not_configured") {
      json.urnzError = urnzResult.message || "Could not load URNZ balance.";
    }
  }

  return { status: 200, json };
}

module.exports = {
  normalizeProfileWallet,
  handleProfileGet,
  mapActivityRows,
  uniqueGames,
};
