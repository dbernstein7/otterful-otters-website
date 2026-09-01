/**
 * External rewards provider orchestration.
 *
 * OTTERFUL_REWARDS_PROVIDER:
 * - drip (default): central Clam ledger + Drip (Otter Kart local / Shell Snag upstream)
 * - urnz: central Clam ledger + URNZ sync (no Drip)
 * - both: migration — Clam once, then URNZ sync AND Drip (intentional double external credit)
 * - none: central Clam ledger only
 *
 * The central Clam ledger is always credited once per verified game reward regardless of provider.
 */

const { getDripConfig } = require("../otter-kart-rewards/env.js");
const { checkDripRealmMember, awardDripPointsServer } = require("../otter-kart-rewards/drip.js");
const { getRewardsProviderConfig } = require("./env.js");
const { syncAfterClamCredit } = require("./sync.js");

function buildSyncFields(syncResult) {
  if (!syncResult || !syncResult.status) return {};
  const fields = { syncStatus: syncResult.status };
  if (syncResult.externalReference) {
    fields.syncExternalReference = syncResult.externalReference;
  }
  if (syncResult.lastError) {
    fields.syncLastError = syncResult.lastError;
  }
  return fields;
}

async function syncUrnzForClam(clam, opts = {}) {
  if (!clam?.clamTxId) return null;
  if (clam.status !== "credited" && clam.status !== "duplicate") return null;

  const enriched = { ...clam };
  if (!enriched.wallet && clam.wallet) enriched.wallet = clam.wallet;

  return syncAfterClamCredit(enriched, opts);
}

async function awardOtterKartDrip(gated, opts = {}) {
  const { apiKey, realmId, currencyId, patchMode, initiatorId } = getDripConfig(opts.env);
  if (!apiKey) {
    return { ok: true, skipped: "not_configured" };
  }

  return awardDripPointsServer({
    apiKey,
    realmId,
    currencyId,
    wallet: gated.wallet,
    dripUserId: gated.dripUserId,
    points: gated.effectivePoints,
    patchMode,
    initiatorId,
  });
}

async function checkOtterKartDrip(gated, opts = {}) {
  const { apiKey, realmId, currencyId } = getDripConfig(opts.env);
  if (!apiKey) {
    return { ok: true, skipped: "not_configured" };
  }

  return checkDripRealmMember({
    apiKey,
    realmId,
    currencyId,
    wallet: gated.wallet,
    dripUserId: gated.dripUserId,
  });
}

/**
 * Otter Kart award path: URNZ sync + optional local Drip after Clam credit.
 */
async function handleOtterKartExternalRewards(clam, gated, opts = {}) {
  const providerConfig = opts.providerConfig || getRewardsProviderConfig(opts.env);
  const out = { sync: null, drip: null };

  if (providerConfig.useUrnz) {
    out.sync = await syncUrnzForClam(clam, opts);
  }

  if (providerConfig.useDrip) {
    out.drip = await awardOtterKartDrip(gated, opts);
  }

  return out;
}

/**
 * Whether Shell Snag should proxy to upstream Drip after Clam credit.
 */
function shouldProxyShellSnagUpstream(opts = {}) {
  const providerConfig = opts.providerConfig || getRewardsProviderConfig(opts.env);
  return providerConfig.useDrip;
}

module.exports = {
  buildSyncFields,
  syncUrnzForClam,
  awardOtterKartDrip,
  checkOtterKartDrip,
  handleOtterKartExternalRewards,
  shouldProxyShellSnagUpstream,
};
