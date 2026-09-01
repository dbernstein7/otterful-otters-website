const DEFAULT_MAX = 50_000;

function getShellRushConfig(env = process.env) {
  const maxRaw = env.SHELL_RUSH_REWARDS_MAX_SHELLS_PER_CLAIM;
  const maxShells =
    maxRaw !== undefined && maxRaw !== "" && Number.isFinite(Number(maxRaw))
      ? Math.min(Math.max(1, Math.floor(Number(maxRaw))), 1_000_000)
      : DEFAULT_MAX;

  const dripMaxRaw = env.SHELL_RUSH_DRIP_MAX_AWARD_PER_RUN;
  const dripMax =
    dripMaxRaw !== undefined && dripMaxRaw !== "" && Number.isFinite(Number(dripMaxRaw))
      ? Math.floor(Number(dripMaxRaw))
      : undefined;

  return {
    maxShellsPerClaim: maxShells,
    dripMaxAwardPerRun: dripMax,
    upstreamAwardUrl:
      String(env.SHELL_RUSH_UPSTREAM_AWARD_URL || "").trim() ||
      "https://shell-rush-otterful-otters.vercel.app/api/rewards/award",
    upstreamCheckUrl:
      String(env.SHELL_RUSH_UPSTREAM_CHECK_URL || "").trim() ||
      "https://shell-rush-otterful-otters.vercel.app/api/rewards/check",
  };
}

module.exports = { DEFAULT_MAX, getShellRushConfig };
