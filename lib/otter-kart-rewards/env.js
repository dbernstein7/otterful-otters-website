/** OTTER ARMY realm defaults (public ids — secret is OTTER_KART_DRIP_API_KEY only). */
const DEFAULT_REALM_ID = "67dfb2d4e88a620c1498e2ba";
const DEFAULT_CURRENCY_ID = "67dfb2d4d7a2230e68bad767";

function getDripConfig(env = process.env) {
  const apiKey = String(env.OTTER_KART_DRIP_API_KEY || "").trim();
  const realmId = String(env.OTTER_KART_DRIP_REALM_ID || DEFAULT_REALM_ID).trim();
  const currencyId = String(env.OTTER_KART_DRIP_CURRENCY_ID || DEFAULT_CURRENCY_ID).trim();
  const patchMode = String(env.OTTER_KART_DRIP_PATCH_MODE || "delta").toLowerCase() === "absolute" ? "absolute" : "delta";
  const initiatorId = String(env.OTTER_KART_DRIP_INITIATOR_ID || "").trim() || undefined;
  return { apiKey, realmId, currencyId, patchMode, initiatorId };
}

module.exports = { getDripConfig, DEFAULT_REALM_ID, DEFAULT_CURRENCY_ID };
