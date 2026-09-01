/**
 * Auto-credit rewards on run end when an Otterful session exists.
 * Shell Snag: intercepts reward API calls + auto-triggers end-screen claim.
 */
import { getStoredSessionToken } from "/otterful-session.mjs";
import { applySessionToRewardBody } from "/games/otterful-rewards-client.mjs";
import { applyOtterfulWalletShim } from "/games/otterful-wallet-shim.mjs";

const REWARD_API_PATTERN = /\/api\/rewards\/(award|check)(?:\?|$)/;
const AUTO_CLAIM_CLICKED = new WeakSet();

function patchEthereumForSession() {
  applyOtterfulWalletShim();
  const eth = typeof window !== "undefined" ? window.ethereum : null;
  if (!eth || eth.__otterfulSessionSignShimmed || typeof eth.request !== "function") return;

  const originalRequest = eth.request.bind(eth);
  eth.request = async (args) => {
    const method = args && typeof args === "object" ? args.method : args;
    if (method === "personal_sign" && getStoredSessionToken()?.sessionToken) {
      return "0x" + "00".repeat(65);
    }
    return originalRequest(args);
  };
  eth.__otterfulSessionSignShimmed = true;
}

function patchFetchForSession() {
  if (typeof window === "undefined" || window.__otterfulRewardFetchPatched) return;
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input?.url || "";
    if (REWARD_API_PATTERN.test(url) && init?.body && getStoredSessionToken()?.sessionToken) {
      try {
        const body = applySessionToRewardBody(JSON.parse(String(init.body)));
        delete body.signature;
        init = { ...init, body: JSON.stringify(body) };
      } catch {
        // ignore malformed bodies
      }
    }
    return nativeFetch(input, init);
  };
  window.__otterfulRewardFetchPatched = true;
}

function tryAutoClickShellSnagClaim() {
  if (!getStoredSessionToken()?.sessionToken) return;
  const buttons = document.querySelectorAll("button");
  for (const btn of buttons) {
    if (!(btn instanceof HTMLButtonElement)) continue;
    if (AUTO_CLAIM_CLICKED.has(btn) || btn.disabled) continue;
    const label = (btn.textContent || "").trim();
    if (!/claim rewards/i.test(label)) continue;
    AUTO_CLAIM_CLICKED.add(btn);
    window.setTimeout(() => {
      try {
        btn.click();
      } catch {
        // ignore
      }
    }, 120);
    break;
  }
}

function initShellSnagAutoClaim() {
  if (typeof document === "undefined") return;
  const observer = new MutationObserver(() => tryAutoClickShellSnagClaim());
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["disabled", "class"],
  });
  window.setTimeout(tryAutoClickShellSnagClaim, 400);
  window.setTimeout(tryAutoClickShellSnagClaim, 1500);
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
  });
}
