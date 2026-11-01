/**
 * Session-aware reward request helpers (sign once on profile, claim without wallet popups).
 */
import { getStoredSessionToken } from "/otterful-session.mjs";

export function hasOtterfulRewardSession() {
  return !!getStoredSessionToken()?.sessionToken;
}

export function applySessionToRewardBody(body) {
  const session = getStoredSessionToken();
  if (!session?.sessionToken) return body;
  return { ...body, sessionToken: session.sessionToken };
}

export function formatClamCreditMessage(shells, data) {
  const n = Math.max(0, Math.floor(data?.awardedAmount ?? shells));
  if (data?.syncStatus === "synced") {
    return data.alreadyCredited ? "Reward delivered to your Urnz account." : `+${n} Clams delivered to your Urnz account.`;
  }
  if (typeof data?.clamBalance === "number") {
    return `+${n} Clams recorded. Urnz delivery pending; we’ll retry automatically while the game is open.`;
  }
  if (typeof data?.balance === "number") {
    return `+${n} shells credited. Points balance: ${data.balance}.`;
  }
  return `+${n} shells credited.`;
}
