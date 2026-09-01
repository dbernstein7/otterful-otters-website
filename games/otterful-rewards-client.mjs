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
  const n = Math.max(0, Math.floor(shells));
  if (typeof data?.clamBalance === "number") {
    if (data?.alreadyCredited) {
      return `Run already credited. Clam balance: ${data.clamBalance}.`;
    }
    return `+${n} Clams added. Balance: ${data.clamBalance}.`;
  }
  if (typeof data?.balance === "number") {
    return `+${n} shells credited. Points balance: ${data.balance}.`;
  }
  return `+${n} shells credited.`;
}
