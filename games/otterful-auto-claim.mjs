/**
 * Auto-credit rewards on run end when an Otterful session exists.
 * Shell Snag: session-aware fetch/sign patches + direct claim on end screen.
 */
import { bootstrapWalletSession, getStoredSessionToken, OTTERFUL_SESSION_READY_EVENT } from "/otterful-session.mjs";
import { applySessionToRewardBody, formatClamCreditMessage } from "/games/otterful-rewards-client.mjs";
import { applyOtterfulWalletShim, resolveOtterfulWallet } from "/games/otterful-wallet-shim.mjs";
import { claimSessionShells } from "/games/shell-rush-rewards.mjs";

const REWARD_API_PATTERN = /\/api\/rewards\/(award|check)(?:\?|$)/;
const AUTO_UI_CLICKED = new WeakSet();

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

  const wallet = resolveOtterfulWallet();
  if (!wallet) return false;

  try {
    await bootstrapWalletSession(wallet);
  } catch {
    return false;
  }

  patchEthereumForSession();
  return hasActiveRewardSession();
}

function patchEthereumForSession() {
  applyOtterfulWalletShim();
  const eth = typeof window !== "undefined" ? window.ethereum : null;
  if (!eth || eth.__otterfulSessionSignShimmed || typeof eth.request !== "function") return;

  const originalRequest = eth.request.bind(eth);
  eth.request = async (args) => {
    const method = args && typeof args === "object" ? args.method : args;
    if (method === "personal_sign" && hasActiveRewardSession()) {
      return "0x" + "00".repeat(65);
    }
    return originalRequest(args);
  };
  eth.__otterfulSessionSignShimmed = true;
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

export function showAutoCreditNotice(text) {
  if (!text || typeof document === "undefined") return;
  const existing = document.getElementById("otterful-auto-credit-notice");
  if (existing) {
    existing.textContent = text;
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

function tryAutoClickShellSnagButtons() {
  if (!hasActiveRewardSession()) return;

  const buttons = document.querySelectorAll("button");
  let clickedCheck = false;

  for (const btn of buttons) {
    if (!(btn instanceof HTMLButtonElement)) continue;
    if (AUTO_UI_CLICKED.has(btn) || btn.disabled) continue;
    const label = (btn.textContent || "").trim();

    if (/check rewards status/i.test(label)) {
      AUTO_UI_CLICKED.add(btn);
      clickedCheck = true;
      window.setTimeout(() => {
        try {
          btn.click();
        } catch {
          // ignore
        }
      }, 80);
      break;
    }
  }

  for (const btn of buttons) {
    if (!(btn instanceof HTMLButtonElement)) continue;
    if (AUTO_UI_CLICKED.has(btn) || btn.disabled) continue;
    const label = (btn.textContent || "").trim();
    if (!/claim rewards \(\+\d+\)/i.test(label)) continue;
    if (/^claimed$/i.test(label)) continue;

    AUTO_UI_CLICKED.add(btn);
    window.setTimeout(
      () => {
        try {
          btn.click();
        } catch {
          // ignore
        }
      },
      clickedCheck ? 900 : 120,
    );
    break;
  }
}

function isShellSnagEndScreenVisible(root = document) {
  if (!root) return false;
  for (const span of root.querySelectorAll("span")) {
    if ((span.textContent || "").trim() === "Shells collected") return true;
  }
  return false;
}

async function tryDirectShellSnagAutoCredit() {
  if (shellSnagState.inFlight) return;
  if (!isShellSnagEndScreenVisible()) return;

  const stats = parseShellSnagEndScreen();
  if (!stats || stats.shells <= 0) return;

  const key = `${stats.shells}:${stats.score}`;
  if (shellSnagState.lastKey === key) return;

  if (!hasActiveRewardSession()) {
    const ready = await ensureRewardSessionReady();
    if (!ready) return;
  }

  shellSnagState.inFlight = true;
  try {
    const runId = `shellrush-${Date.now()}-${stats.shells}-${stats.score}`;
    const result = await claimSessionShells(stats.shells, runId, stats.score);
    if (result.ok) {
      shellSnagState.lastKey = key;
      hideManualRewardsUi();
      showAutoCreditNotice(result.text);
      shellSnagState.noticeShown = true;
      return;
    }
  } catch {
    // fall through to button auto-click
  } finally {
    shellSnagState.inFlight = false;
  }

  if (hasActiveRewardSession()) {
    tryAutoClickShellSnagButtons();
  }
}

function scheduleShellSnagAutoCredit() {
  void tryDirectShellSnagAutoCredit();
}

function initShellSnagAutoClaim() {
  if (typeof document === "undefined") return;

  const observer = new MutationObserver(() => scheduleShellSnagAutoCredit());
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
