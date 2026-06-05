const BLOCKED = [
  "asshole",
  "bastard",
  "bitch",
  "bollocks",
  "bullshit",
  "cock",
  "crap",
  "cunt",
  "damn",
  "dick",
  "fag",
  "faggot",
  "fuck",
  "hell",
  "nigga",
  "nigger",
  "piss",
  "pussy",
  "retard",
  "shit",
  "slut",
  "twat",
  "whore",
];

function normalizeForFilter(raw) {
  return String(raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function hasProfanity(raw) {
  const n = normalizeForFilter(raw);
  if (!n) return false;
  return BLOCKED.some((word) => n.includes(word));
}

/** @returns {{ ok: true, name: string } | { ok: false, error: string }} */
export function validatePlayerName(raw) {
  if (typeof raw !== "string") {
    return { ok: false, error: "Enter a name (2–16 letters or numbers)." };
  }
  const collapsed = raw.trim().replace(/\s+/g, " ");
  if (collapsed.length < 2 || collapsed.length > 16) {
    return { ok: false, error: "Name must be 2–16 characters." };
  }
  if (!/^[a-zA-Z0-9 _-]+$/.test(collapsed)) {
    return { ok: false, error: "Use letters, numbers, spaces, - or _ only." };
  }
  if (hasProfanity(collapsed)) {
    return { ok: false, error: "Please choose an appropriate name." };
  }
  return { ok: true, name: collapsed };
}
