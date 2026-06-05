const { BLOCKED_TERMS } = require("./blocklist.js");

const USERNAME_RE = /^[A-Za-z0-9_-]{3,16}$/;

function normalizeForProfanity(raw) {
  return String(raw || "")
    .toLowerCase()
    .replace(/0/g, "o")
    .replace(/1/g, "i")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/5/g, "s")
    .replace(/7/g, "t")
    .replace(/8/g, "b")
    .replace(/\$/g, "s")
    .replace(/@/g, "a")
    .replace(/[^a-z0-9]/g, "");
}

function containsProfanity(raw) {
  const n = normalizeForProfanity(raw);
  if (!n) return false;
  for (const term of BLOCKED_TERMS) {
    if (n.includes(term)) return true;
  }
  return false;
}

/**
 * @param {unknown} raw
 * @returns {{ ok: true, username: string } | { ok: false, error: string }}
 */
function validateUsername(raw) {
  if (typeof raw !== "string") {
    return { ok: false, error: "Username required." };
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: "Username required." };
  }
  if (trimmed.length < 3 || trimmed.length > 16) {
    return { ok: false, error: "Username must be 3–16 characters." };
  }
  if (!USERNAME_RE.test(trimmed)) {
    return {
      ok: false,
      error: "Use letters, numbers, underscore, or hyphen only.",
    };
  }
  if (containsProfanity(trimmed)) {
    return { ok: false, error: "That username is not allowed." };
  }
  return { ok: true, username: trimmed };
}

module.exports = {
  validateUsername,
  containsProfanity,
  normalizeForProfanity,
  USERNAME_RE,
};
