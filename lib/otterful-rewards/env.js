const DEFAULT_ALLOWED_GAMES = ["otter-kart", "shell-rush", "shell-snag"];

const DEFAULT_MAX_AWARD = 50_000;

const VALID_REWARDS_PROVIDERS = new Set(["drip", "urnz", "both", "none"]);

function parsePositiveInt(raw, fallback, max) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(n)));
}

function getClamConfig(env = process.env) {
  const recordSecret = String(env.OTTERFUL_CLAMS_RECORD_SECRET || "").trim() || undefined;
  const allowedRaw = String(env.OTTERFUL_CLAMS_ALLOWED_GAMES || "").trim();
  const allowedGames = allowedRaw
    ? allowedRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : DEFAULT_ALLOWED_GAMES.slice();

  return {
    recordSecret,
    allowedGames: new Set(allowedGames),
    maxAwardPerRecord: parsePositiveInt(env.OTTERFUL_CLAMS_MAX_AWARD_PER_RECORD, DEFAULT_MAX_AWARD, 1_000_000),
    historyDefaultLimit: parsePositiveInt(env.OTTERFUL_CLAMS_HISTORY_DEFAULT_LIMIT, 25, 100),
    historyMaxLimit: parsePositiveInt(env.OTTERFUL_CLAMS_HISTORY_MAX_LIMIT, 50, 200),
  };
}

function getRewardsProviderConfig(env = process.env) {
  const raw = String(env.OTTERFUL_REWARDS_PROVIDER || "drip").trim().toLowerCase();
  const provider = VALID_REWARDS_PROVIDERS.has(raw) ? raw : "drip";

  return {
    provider,
    useDrip: provider === "drip" || provider === "both",
    useUrnz: provider === "urnz" || provider === "both",
    useExternal: provider !== "none",
  };
}

function getSyncConfig(env = process.env) {
  const recordSecret = String(env.OTTERFUL_CLAMS_RECORD_SECRET || "").trim() || undefined;
  const syncRetrySecret =
    String(env.OTTERFUL_CLAMS_SYNC_SECRET || "").trim() || recordSecret || undefined;

  return { syncRetrySecret };
}

module.exports = {
  DEFAULT_ALLOWED_GAMES,
  DEFAULT_MAX_AWARD,
  VALID_REWARDS_PROVIDERS,
  getClamConfig,
  getRewardsProviderConfig,
  getSyncConfig,
};
