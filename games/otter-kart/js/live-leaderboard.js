/**
 * Global leaderboards — best run per mode, saved on race finish (Vercel KV).
 */

import { getConnectedWallet, isEthAddress } from "../../otter-kart-rewards.mjs";
import { getDemoPlayerId, getDemoPlayerName, isDemoSessionActive, todayISO } from "./storage.js";

const READ_URL = "/api/rewards/leaderboard";
const POST_URL = "/api/otter-kart/leaderboard";
const POLL_MS = 15000;
const TOP_SLOTS = 10;
const MODE_ORDER = ["practice", "daily", "touge", "endless", "grandprix"];
const MODE_LABELS = {
  practice: "Practice",
  daily: "Drift",
  touge: "Snake",
  endless: "Endless",
  grandprix: "GP",
};

/** @type {ReturnType<typeof setInterval> | null} */
let pollTimer = null;
/** @type {number} */
let lastFetchAt = 0;
/** @type {boolean} */
let serverConfigured = false;
/** @type {string} */
let statusText = "Loading…";
/** @type {Record<string, { label?: string, date?: string, rows: Array<{ rank: number, label: string, blank?: boolean }> }>} */
let cachedBoards = {};
/** @type {Set<HTMLElement>} */
const mountedRoots = new Set();
/** @type {HTMLElement | null} */
let overlayEl = null;
/** @type {HTMLButtonElement | null} */
let overlayToggleBtn = null;

async function postLeaderboardRun(mode, stats) {
  if (isDemoSessionActive()) {
    const playerName = getDemoPlayerName();
    if (!playerName) return { ok: false, skipped: true, reason: "no_name" };
    const res = await fetch(POST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        demo: true,
        demoId: getDemoPlayerId(),
        playerName,
        mode,
        stats,
      }),
    });
    return res.json().catch(() => ({}));
  }

  const wallet = getConnectedWallet();
  if (!wallet || !isEthAddress(wallet)) {
    return { ok: false, skipped: true, reason: "no_wallet" };
  }

  const res = await fetch(POST_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet: wallet.trim().toLowerCase(), mode, stats }),
  });
  return res.json().catch(() => ({}));
}

function padRows(rows) {
  const out = Array.isArray(rows) ? rows.slice(0, TOP_SLOTS) : [];
  while (out.length < TOP_SLOTS) {
    out.push({ rank: out.length + 1, label: "", blank: true });
  }
  return out;
}

function filledRowCount(boards) {
  return MODE_ORDER.reduce((n, mode) => {
    const rows = boards[mode]?.rows || [];
    return n + rows.filter((r) => !r.blank && (r.label || r.walletShort)).length;
  }, 0);
}

export async function fetchLiveLeaderboards(limit = TOP_SLOTS) {
  const date = todayISO();
  const url = `${READ_URL}?game=otter-kart&all=1&limit=${encodeURIComponent(String(limit))}&date=${encodeURIComponent(date)}`;
  const res = await fetch(url, { method: "GET", headers: { Accept: "application/json" }, cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!data?.ok) throw new Error(data?.error || "Leaderboard fetch failed");

  lastFetchAt = Date.now();
  serverConfigured = !!data.configured;
  cachedBoards = {};
  if (data.boards && typeof data.boards === "object") {
    for (const mode of MODE_ORDER) {
      const board = data.boards[mode] || { rows: [] };
      cachedBoards[mode] = {
        ...board,
        rows: padRows(board.rows),
      };
    }
  }
  statusText = !serverConfigured ? "Storage not configured" : filledRowCount(cachedBoards) > 0 ? "Live" : "Top 10 — finish a race to claim a spot";

  for (const root of mountedRoots) renderRoot(root);
  return cachedBoards;
}

export function getLiveLeaderboardStatus() {
  return statusText;
}

function relTime(ts) {
  if (!ts) return "";
  const sec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (sec < 8) return "just now";
  if (sec < 60) return `${sec}s ago`;
  return `${Math.floor(sec / 60)}m ago`;
}

function renderBoardList(rows) {
  const slots = padRows(rows);
  const items = slots
    .map((r) => {
      const empty = !!r.blank || !(r.label || r.walletShort);
      const entry = empty ? "—" : r.label || r.walletShort;
      const cls = empty ? " live-lb__entry live-lb__entry--empty" : "live-lb__entry";
      return `<li class="${empty ? "live-lb__slot--empty" : ""}"><span class="live-lb__rank">${r.rank}</span><span class="${cls}">${escapeHtml(
        entry,
      )}</span></li>`;
    })
    .join("");
  return `<ol class="live-lb__list live-lb__list--top10">${items}</ol>`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function bindPanelTabs(panel) {
  if (!(panel instanceof HTMLElement) || panel.dataset.liveLbBound === "1") return;
  panel.dataset.liveLbBound = "1";
  panel.addEventListener("click", (event) => {
    const tab = event.target.closest?.("[data-live-lb-tab]");
    if (!(tab instanceof HTMLButtonElement)) return;
    event.preventDefault();
    event.stopPropagation();
    panel.dataset.liveLbActive = tab.getAttribute("data-live-lb-tab") || "practice";
    renderRoot(panel);
  });
}

function renderRoot(root) {
  if (!(root instanceof HTMLElement)) return;
  const variant = root.dataset.liveLbVariant || "overlay";
  const activeMode = root.dataset.liveLbActive || "practice";

  if (variant === "page") {
    const cards = MODE_ORDER.map((mode) => {
      const board = cachedBoards[mode] || { rows: padRows([]), label: MODE_LABELS[mode] };
      const sub =
        mode === "daily" && board.date ? `<span class="live-lb__date">${escapeHtml(board.date)}</span>` : "";
      return `<article class="live-lb-card" data-mode="${mode}">
        <header class="live-lb-card__head">
          <h3 class="live-lb-card__title">${escapeHtml(board.label || MODE_LABELS[mode])}</h3>
          ${sub}
        </header>
        ${renderBoardList(board.rows)}
      </article>`;
    }).join("");
    root.innerHTML = `<p class="live-lb__status">${escapeHtml(statusText)}</p>
      <div class="live-lb-page__grid">${cards}</div>
      <p class="live-lb__meta">Updated ${relTime(lastFetchAt)} · Top ${TOP_SLOTS} per mode · scores save when you finish a race.</p>`;
    return;
  }

  const tabs = MODE_ORDER.map(
    (mode) =>
      `<button type="button" class="live-lb__tab${mode === activeMode ? " is-active" : ""}" data-live-lb-tab="${mode}">${escapeHtml(
        MODE_LABELS[mode],
      )}</button>`,
  ).join("");
  const board = cachedBoards[activeMode] || { rows: padRows([]) };
  root.innerHTML = `<p class="live-lb__status">${escapeHtml(statusText)}</p>
    <div class="live-lb__tabs" role="tablist" aria-label="Game mode">${tabs}</div>
    ${renderBoardList(board.rows)}
    <div class="live-lb__meta">Updated ${relTime(lastFetchAt)}</div>`;
}

function setLiveLeaderboardOverlayOpen(open) {
  if (!(overlayEl instanceof HTMLElement) || !(overlayToggleBtn instanceof HTMLButtonElement)) return;
  overlayEl.classList.toggle("hidden", !open);
  overlayEl.setAttribute("aria-hidden", open ? "false" : "true");
  overlayToggleBtn.setAttribute("aria-expanded", open ? "true" : "false");
  document.body?.classList?.toggle?.("otter-live-lb-open", open);
  if (open) {
    void fetchLiveLeaderboards(TOP_SLOTS).catch(() => renderRoot(overlayEl.querySelector("#live-leaderboard-panel")));
    const panel = overlayEl.querySelector("#live-leaderboard-panel");
    if (panel instanceof HTMLElement) renderRoot(panel);
    overlayEl.querySelector(".live-lb-overlay__close")?.focus?.();
  }
}

export function mountLiveLeaderboard(root, opts = {}) {
  if (!(root instanceof HTMLElement)) return;
  root.dataset.liveLbVariant = opts.variant || "overlay";
  root.dataset.liveLbActive = opts.activeMode || "practice";
  mountedRoots.add(root);
  bindPanelTabs(root);
  renderRoot(root);
}

export function initLiveLeaderboard(root, opts = {}) {
  mountLiveLeaderboard(root, opts);
  void fetchLiveLeaderboards(opts.limit || TOP_SLOTS).catch(() => renderRoot(root));
  if (pollTimer) return;
  pollTimer = window.setInterval(() => {
    void fetchLiveLeaderboards(opts.limit || TOP_SLOTS).catch(() => {});
  }, opts.pollMs || POLL_MS);
}

export function initLiveLeaderboardOverlay(opts = {}) {
  overlayEl = document.getElementById("live-leaderboard-overlay");
  overlayToggleBtn = document.getElementById("btn-live-leaderboard");
  const panel = document.getElementById("live-leaderboard-panel");
  if (!(overlayEl instanceof HTMLElement) || !(overlayToggleBtn instanceof HTMLButtonElement)) return;
  if (!(panel instanceof HTMLElement)) return;

  overlayToggleBtn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setLiveLeaderboardOverlayOpen(overlayEl.classList.contains("hidden"));
  });

  overlayEl.querySelectorAll("[data-live-lb-close]").forEach((el) => {
    el.addEventListener("click", (event) => {
      event.preventDefault();
      setLiveLeaderboardOverlayOpen(false);
    });
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !overlayEl.classList.contains("hidden")) {
      setLiveLeaderboardOverlayOpen(false);
    }
  });

  initLiveLeaderboard(panel, { variant: "overlay", limit: opts.limit || TOP_SLOTS, pollMs: opts.pollMs || POLL_MS });
}

function statsFromRaceDetail(detail) {
  return {
    mode: detail.mode,
    dateISO: detail.dateISO || (detail.mode === "daily" ? todayISO() : ""),
    totalTime: Number(detail.totalTime) || 0,
    bestLap: Number(detail.bestLap) || 0,
    shells: Math.floor(Number(detail.shells) || 0),
    longestDrift: Number(detail.longestDrift) || 0,
    longestDriftTime: Number(detail.longestDriftTime) || 0,
    distance: Number(detail.endlessDist ?? detail.distance) || 0,
    endlessLongestDrift: Number(detail.endlessLongestDrift) || 0,
    gpTotalTime: Number(detail.gpTotalTime) || 0,
    gpPlayerPoints: Math.floor(Number(detail.gpPlayerPoints) || 0),
    gpSeriesComplete: !!detail.gpSeriesComplete,
  };
}

function shouldSubmitRace(detail) {
  if (!detail || typeof detail !== "object") return false;
  if (detail.mode === "admin" || detail.mode === "session") return false;
  if (detail.mode === "grandprix" && !detail.gpSeriesComplete) return false;
  if (isDemoSessionActive() && !getDemoPlayerName()) return false;
  return true;
}

export async function submitLiveLeaderboardRun(detail) {
  if (!shouldSubmitRace(detail)) return { ok: false, skipped: true };
  const data = await postLeaderboardRun(detail.mode, statsFromRaceDetail(detail));
  if (data?.updated) {
    void fetchLiveLeaderboards(TOP_SLOTS).catch(() => {});
  }
  return data;
}

export function installLiveLeaderboardRaceHook() {
  window.addEventListener("otterkart-race-finished", (event) => {
    void submitLiveLeaderboardRun(event?.detail).catch(() => {});
  });
}

export function getCachedLiveLeaderboards() {
  return cachedBoards;
}
