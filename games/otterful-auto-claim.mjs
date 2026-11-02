import { createRewardOutbox } from "/games/reward-outbox.mjs";
/**
 * Auto-credit rewards on run end when an Otterful session exists.
 * Shell Snag: session-aware fetch/sign patches + direct claim on end screen.
 */
import { getStoredSessionToken, OTTERFUL_SESSION_READY_EVENT } from "/otterful-session.mjs";
import { applySessionToRewardBody, formatClamCreditMessage } from "/games/otterful-rewards-client.mjs";
import { applyOtterfulWalletShim, resolveOtterfulWallet } from "/games/otterful-wallet-shim.mjs";
import { claimSessionShells } from "/games/shell-rush-rewards.mjs";

const REWARD_API_PATTERN = /\/api\/rewards\/(award|check)(?:\?|$)/;

/** @type {{ lastKey: string | null, inFlight: boolean, noticeShown: boolean }} */
const shellSnagState = {
  lastKey: null,
  inFlight: false,
  noticeShown: false,
};

export function hasActiveRewardSession() {
  return !!getStoredSessionToken()?.sessionToken;
}

export async function ensureRewardSessionReady() {
  patchEthereumForSession();
  if (hasActiveRewardSession()) return true;

  return false; // Sign in on the profile page; games only consume that session.
}

function patchEthereumForSession() {
  // Do not stub personal_sign with a fake signature — that produces
  // invalid_signature when a claim races ahead of session injection.
  // Session awards go through fetch patch / claimSessionShells instead.
  applyOtterfulWalletShim();
}

function handleRewardAwardSuccess(data, shellsHint) {
  const hasClam =
    typeof data?.clamBalance === "number" &&
    (data.ok === true ||
      data.clamCredited === true ||
      data.alreadyCredited === true ||
      data.clamStatus === "credited" ||
      data.clamStatus === "duplicate");
  if (!hasClam && data?.ok !== true) return;
  const shells =
    typeof shellsHint === "number" && shellsHint > 0
      ? shellsHint
      : typeof data.shells === "number"
        ? data.shells
        : typeof data.effectiveShells === "number"
          ? data.effectiveShells
          : 0;
  const text =
    typeof data.clamBalance === "number" || typeof data.balance === "number"
      ? formatClamCreditMessage(shells, data)
      : shells > 0
        ? `+${shells} Clams added.`
        : "Rewards credited.";
  hideManualRewardsUi();
  showAutoCreditNotice(text);
  shellSnagState.noticeShown = true;
}

function patchFetchForSession() {
  if (typeof window === "undefined" || window.__otterfulRewardFetchPatched) return;
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input?.url || "";
    let shellsHint = 0;

    if (REWARD_API_PATTERN.test(url) && init?.body && hasActiveRewardSession()) {
      try {
        const body = applySessionToRewardBody(JSON.parse(String(init.body)));
        delete body.signature;
        shellsHint = Number(body.shells ?? body.points ?? body.score ?? 0) || 0;
        init = { ...init, body: JSON.stringify(body) };
      } catch {
        // ignore malformed bodies
      }
    }

    const response = await nativeFetch(input, init);

    if (REWARD_API_PATTERN.test(url) && /\/award(?:\?|$)/.test(url)) {
      try {
        const clone = response.clone();
        const data = await clone.json();
        if (hasActiveRewardSession()) {
          handleRewardAwardSuccess(data, shellsHint);
        }
      } catch {
        // ignore
      }
    }

    return response;
  };
  window.__otterfulRewardFetchPatched = true;
}

/** @returns {{ shells: number, score: number } | null} */
export function parseShellSnagEndScreen(root = document) {
  if (!root) return null;

  let shells = 0;
  let score = 0;

  for (const btn of root.querySelectorAll("button")) {
    const label = (btn.textContent || "").trim();
    const claimMatch = label.match(/claim rewards\s*\(\+(\d+)\)/i);
    if (claimMatch) {
      shells = Math.max(shells, Number(claimMatch[1]) || 0);
    }
  }

  const spans = root.querySelectorAll("span");
  for (let i = 0; i < spans.length; i++) {
    const label = (spans[i].textContent || "").trim();
    const valueEl = spans[i + 1];
    const valueText = valueEl ? (valueEl.textContent || "").trim() : "";
    const value = Number(String(valueText).replace(/,/g, ""));

    if (label === "Shells collected" && Number.isFinite(value)) {
      shells = Math.max(shells, Math.floor(value));
    }
    if (label === "Total score" && Number.isFinite(value)) {
      score = Math.max(score, Math.floor(value));
    }
  }

  if (shells <= 0) return null;
  return { shells, score };
}

export function hideManualRewardsUi(root = document) {
  if (!root) return;
  for (const btn of root.querySelectorAll("button")) {
    const label = (btn.textContent || "").trim();
    if (!/check rewards status/i.test(label) && !/claim rewards/i.test(label)) continue;
    const panel =
      btn.closest(".flex-col.items-center.gap-3") ||
      btn.closest('[class*="flex-col"][class*="items-center"]') ||
      btn.parentElement;
    if (panel instanceof HTMLElement) {
      panel.style.display = "none";
    }
  }
}

export function showAutoCreditNotice(text, details = {}) {
  if (!text || typeof document === "undefined") return;
  window.dispatchEvent(new CustomEvent("otterful:reward-status", { detail: { ...details, text } }));
  if (window.__otterfulShellRunEvents) return;
  const existing = document.getElementById("otterful-auto-credit-notice");
  if (existing) {
    if (existing.textContent !== text) existing.textContent = text;
    return;
  }

  const notice = document.createElement("p");
  notice.id = "otterful-auto-credit-notice";
  notice.textContent = text;
  notice.setAttribute("role", "status");
  notice.style.cssText =
    "margin:12px auto 0;max-width:28rem;text-align:center;font-size:0.875rem;line-height:1.45;color:#93c5fd;font-weight:600;";

  const claimBtn = [...document.querySelectorAll("button")].find((btn) =>
    /claim rewards/i.test((btn.textContent || "").trim()),
  );
  const anchor =
    claimBtn?.closest(".flex-col.items-center.gap-3") ||
    claimBtn?.closest('[class*="flex-col"][class*="items-center"]') ||
    claimBtn?.parentElement ||
    document.getElementById("root");

  if (anchor?.parentElement) {
    anchor.parentElement.insertBefore(notice, anchor.nextSibling);
  } else if (document.body) {
    document.body.appendChild(notice);
  }
}


function isShellSnagEndScreenVisible(root = document) {
  if (!root) return false;
  for (const span of root.querySelectorAll("span")) {
    if ((span.textContent || "").trim() === "Shells collected") return true;
  }
  return false;
}

let shellRun = null;
const shellOutboxes = new Map();
function shellOutbox() {
  const wallet = resolveOtterfulWallet()?.toLowerCase();
  if (!wallet || !hasActiveRewardSession()) return null;
  if (!shellOutboxes.has(wallet)) shellOutboxes.set(wallet, createRewardOutbox({
    storage: localStorage,
    key: `otterful:rewards:shell-snag:${wallet}`,
    ready: () => resolveOtterfulWallet()?.toLowerCase() === wallet && hasActiveRewardSession(),
    send: (item) => claimSessionShells(item.shells, item.runId, item.score),
    notify: showAutoCreditNotice,
  }));
  return shellOutboxes.get(wallet);
}
async function tryDirectShellSnagAutoCredit() {
  if (shellSnagState.inFlight) return;
  const outbox = shellOutbox();
  if (!isShellSnagEndScreenVisible()) {
    shellRun = null;
    if (outbox) await outbox.flush();
    return;
  }
  if (window.__otterfulShellRunEvents) { if (outbox) await outbox.flush(); return; }
  const stats = parseShellSnagEndScreen();
  if (!stats) return;
  if (!outbox) {
    showAutoCreditNotice("Sign in on your profile to earn automatic Clams.");
    return;
  }
  shellSnagState.inFlight = true;
  try {
    if (!shellRun) {
      const item = { ...stats, runId: `shellrush-${crypto.randomUUID()}` };
      outbox.enqueue(item);
      shellRun = item;
    }
    await outbox.flush();
  } catch {
    showAutoCreditNotice("Could not save your reward. Keep the game open and allow browser storage.");
  } finally { shellSnagState.inFlight = false; }
}

export function installShellSnagProfileLink(root = document) {
  const start = [...root.querySelectorAll("button")].find((button) => /^start run$/i.test(button.textContent.trim()));
  if (!start || [...root.querySelectorAll("button")].some((button) => /^profile sign-in$/i.test(button.textContent.trim()))) return;
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Profile sign-in";
  button.style.cssText = "pointer-events:auto;margin-top:16px;padding:12px 28px;border:1px solid #22d3ee;border-radius:12px;background:#10263b;color:#b8ffdf;font-weight:bold;cursor:pointer";
  button.addEventListener("click", () => {
    const url = new URL("/profile.html", window.location.origin).href;
    try { window.top.location.assign(url); } catch { window.location.assign(url); }
  });
  start.insertAdjacentElement("afterend", button);
}

function scheduleShellSnagAutoCredit() {
  if (window.location.pathname.includes("/shell-snag")) installShellSnagProfileLink();
  void tryDirectShellSnagAutoCredit();
}

function initShellSnagAutoClaim() {
  if (typeof document === "undefined") return;
  window.addEventListener("shellsnag-run-finished", (event) => {
    const item = event.detail;
    if (!item?.runId || !Number.isFinite(item.shells) || item.shells <= 0) return;
    const outbox = shellOutbox();
    if (!outbox) { showAutoCreditNotice("Sign in on your profile to earn automatic Clams.", { runId: item.runId, ok: false }); return; }
    if (item.wallet && item.wallet.toLowerCase() !== resolveOtterfulWallet()?.toLowerCase()) {
      showAutoCreditNotice("Return to the profile account that started this run to receive its Clams.", { runId: item.runId, ok: false });
      return;
    }
    try {
      const { onQueued, ...batch } = item;
      outbox.enqueue(batch);
      showAutoCreditNotice(`+${item.shells} Clams pending delivery to Urnz.`, { runId: item.runId, syncStatus: "pending" });
      if (typeof onQueued === "function") onQueued();
      void outbox.flush();
    }
    catch { showAutoCreditNotice("Unable to save reward. Allow browser storage and keep the game open.", { runId: item.runId, ok: false }); }
  });

  window.setInterval(scheduleShellSnagAutoCredit, 30000);
  window.addEventListener("online", scheduleShellSnagAutoCredit);
  const observer = new MutationObserver(() => { hideManualRewardsUi(); scheduleShellSnagAutoCredit(); });
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["disabled", "class"],
  });

  for (const delay of [300, 900, 1800, 3500, 6000, 10000]) {
    window.setTimeout(scheduleShellSnagAutoCredit, delay);
  }

  void ensureRewardSessionReady().then((ready) => {
    if (ready) scheduleShellSnagAutoCredit();
  });

  window.addEventListener("storage", (event) => {
    if (
      event.key === "otterfulSessionToken" ||
      event.key === "otterfulSessionExpires" ||
      event.key === "otterfulWallet"
    ) {
      void ensureRewardSessionReady().then(() => scheduleShellSnagAutoCredit());
    }
  });

  window.addEventListener(OTTERFUL_SESSION_READY_EVENT, () => {
    patchEthereumForSession();
    scheduleShellSnagAutoCredit();
  });
}

export function initOtterfulAutoClaim() {
  patchEthereumForSession();
  patchFetchForSession();
  hideManualRewardsUi();

  const path = String(window.location.pathname || "");
  if (path.includes("/shell-snag")) {
    initShellSnagAutoClaim();
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("otterful:wallet-ready", () => {
    patchEthereumForSession();
    scheduleShellSnagAutoCredit();
  });
}
