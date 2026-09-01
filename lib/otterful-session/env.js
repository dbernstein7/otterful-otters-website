const DEFAULT_SESSION_TTL_SEC = 7200;
const DEFAULT_NONCE_TTL_SEC = 300;

function parsePositiveInt(raw, fallback, max) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(n)));
}

function getSessionConfig(env = process.env) {
  return {
    sessionTtlSec: parsePositiveInt(env.OTTERFUL_SESSION_TTL_SEC, DEFAULT_SESSION_TTL_SEC, 86400),
    nonceTtlSec: parsePositiveInt(env.OTTERFUL_SESSION_NONCE_TTL_SEC, DEFAULT_NONCE_TTL_SEC, 900),
  };
}

module.exports = {
  DEFAULT_SESSION_TTL_SEC,
  DEFAULT_NONCE_TTL_SEC,
  getSessionConfig,
};
