/** Client-side username checks (server enforces the same rules). */

const USERNAME_RE = /^[A-Za-z0-9_-]{3,16}$/;

const BLOCKED_TERMS = [
  "fuck",
  "fuk",
  "fck",
  "shit",
  "sh1t",
  "bitch",
  "b1tch",
  "bastard",
  "asshole",
  "dumbass",
  "jackass",
  "motherf",
  "bullshit",
  "shithead",
  "cocksuck",
  "cumshot",
  "blowjob",
  "handjob",
  "cunt",
  "pussy",
  "whore",
  "slut",
  "nigger",
  "nigga",
  "faggot",
  "fagot",
  "retard",
  "rape",
  "rapist",
  "nazi",
  "hitler",
  "kike",
  "spic",
  "chink",
  "wetback",
  "tranny",
  "pedoph",
  "childporn",
  "porchmonkey",
  "onlyfans",
  "pornhub",
  "hentai",
  "dildo",
  "vibrator",
  "masturb",
  "ejacul",
  "suckmyd",
  "eatshit",
  "killurself",
  "terrorist",
  "isis",
];

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

/** @returns {{ ok: true, username: string } | { ok: false, error: string }} */
export function validatePlayerUsername(raw) {
  if (typeof raw !== "string") {
    return { ok: false, error: "Enter a username." };
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: "Enter a username." };
  }
  if (trimmed.length < 3 || trimmed.length > 16) {
    return { ok: false, error: "Username must be 3–16 characters." };
  }
  if (!USERNAME_RE.test(trimmed)) {
    return {
      ok: false,
      error: "Letters, numbers, underscore, or hyphen only.",
    };
  }
  if (containsProfanity(trimmed)) {
    return { ok: false, error: "That username is not allowed." };
  }
  return { ok: true, username: trimmed };
}
