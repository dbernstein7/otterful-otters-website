/**
 * Global Otter Kart leaderboards (Vercel KV).
 * GET  /api/rewards/leaderboard?game=otter-kart&all=1
 * POST /api/otter-kart/leaderboard { playerId, mode, stats }
 */

import { getConnectedWallet, isEthAddress } from "../../otter-kart-rewards.mjs";
import { getPlayerId, getPlayerUsername, todayISO } from "./storage.js";

const READ_URL = "/api/rewards/leaderboard";
const POST_URL = "/api/otter-kart/leaderboard";
const LAST_RACE_KEY = "otterkart:lastRaceStats";
const POLL_MS = 15000;
const MAX_SHELLS = 50000;
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
let lastFetchAt = 0;
let serverConfigured = false;
let statusText = "Loading…";
/** @type {Record<string, { label?: string, date?: string, rows: Array<{ rank: number, label: string }> }>} */
let cachedBoards = {};
/** @type {Set<HTMLElement>} */
const mountedRoots = new Set();
/** @type {HTMLElement | null} */
let overlayEl = null;
/** @type {HTMLButtonElement | null} */
let overlayToggleBtn = null;

function optionalWallet() {
  const wallet = getConnectedWallet();
  return wallet && isEthAddress(wallet) ? wallet.trim().toLowerCase() : undefined;
}

async function postLeaderboard(mode, stats) {
  const username = getPlayerUsername();
  const res = await fetch(POST_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      playerId: getPlayerId(),
      mode,
      stats,
      username: username || undefined,
      wallet: optionalWallet(),
    }),
  });
  return res.json().catch(() => ({}));
}

function totalRowCount(boards) {
  return MODE_ORDER.reduce((n, mode) => n + (boards[mode]?.rows?.length || 0), 0);
}

export async function fetchLiveLeaderboards(limit = 8) {
  const date = todayISO();
  const url = `${READ_URL}?game=otter-kart&all=1&limit=${encodeURIComponent(String(limit))}&date=${encodeURIComponent(date)}`;
  const res = await fetch(url, { method: "GET", headers: { Accept: "application/json" }, cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!data?.ok) throw new Error(data?.error || "Leaderboard fetch failed");

  lastFetchAt = Date.now();
  serverConfigured = !!data.configured;
  cachedBoards = data.boards && typeof data.boards === "object" ? data.boards : {};
  statusText = !serverConfigured
    ? "Storage not configured"
    : totalRowCount(cachedBoards) > 0
      ? "Live"
      : "No entries yet — finish a race to appear here";

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

function renderBoardList(rows, emptyText) {
  if (!rows?.length) {
    return `<p class="live-lb__empty">${emptyText}</p>`;
  }
  const items = rows
    .slice(0, 8)
    .map(
      (r) =>
        `<li><span class="live-lb__rank">${r.rank}</span><span class="live-lb__entry">${escapeHtml(
          r.label || r.walletShort || "—",
        )}</span></li>`,
    )
    .join("");
  return `<ol class="live-lb__list">${items}</ol>`;
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
  const emptyText = serverConfigured
    ? "No runs yet — finish a race to save your best time."
    : "Leaderboard storage not configured on the server yet.";

  if (variant === "page") {
    const cards = MODE_ORDER.map((mode) => {
      const board = cachedBoards[mode] || { rows: [], label: MODE_LABELS[mode] };
      const sub =
        mode === "daily" && board.date ? `<span class="live-lb__date">${escapeHtml(board.date)}</span>` : "";
      return `<article class="live-lb-card" data-mode="${mode}">
        <header class="live-lb-card__head">
          <h3 class="live-lb-card__title">${escapeHtml(board.label || MODE_LABELS[mode])}</h3>
          ${sub}
        </header>
        ${renderBoardList(board.rows, emptyText)}
      </article>`;
    }).join("");
    root.innerHTML = `<p class="live-lb__status">${escapeHtml(statusText)}</p>
      <div class="live-lb-page__grid">${cards}</div>
      <p class="live-lb__meta">Updated ${relTime(lastFetchAt)} · Best runs save when you finish a race.</p>`;
    return;
  }

  const tabs = MODE_ORDER.map(
    (mode) =>
      `<button type="button" class="live-lb__tab${mode === activeMode ? " is-active" : ""}" data-live-lb-tab="${mode}">${escapeHtml(
        MODE_LABELS[mode],
      )}</button>`,
  ).join("");
  const board = cachedBoards[activeMode] || { rows: [] };
  root.innerHTML = `<p class="live-lb__status">${escapeHtml(statusText)}</p>
    <div class="live-lb__tabs" role="tablist" aria-label="Game mode">${tabs}</div>
    ${renderBoardList(board.rows, emptyText)}
    <div class="live-lb__meta">Updated ${relTime(lastFetchAt)}</div>`;
}

function setLiveLeaderboardOverlayOpen(open) {
  if (!(overlayEl instanceof HTMLElement) || !(overlayToggleBtn instanceof HTMLButtonElement)) return;
  overlayEl.classList.toggle("hidden", !open);
  overlayEl.setAttribute("aria-hidden", open ? "false" : "true");
  overlayToggleBtn.setAttribute("aria-expanded", open ? "true" : "false");
  document.body?.classList?.toggle?.("otter-live-lb-open", open);
  if (open) {
    void fetchLiveLeaderboards(8).catch(() => renderRoot(overlayEl.querySelector("#live-leaderboard-panel")));
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
  void fetchLiveLeaderboards(opts.limit || 8).catch(() => renderRoot(root));
  if (pollTimer) return;
  pollTimer = window.setInterval(() => {
    void fetchLiveLeaderboards(opts.limit || 8).catch(() => {});
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

  initLiveLeaderboard(panel, { variant: "overlay", limit: opts.limit || 8, pollMs: opts.pollMs || POLL_MS });
}

export function statsFromRaceDetail(detail) {
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

export function stashLastRaceStats(detail) {
  if (!detail || typeof detail !== "object") return;
  try {
    sessionStorage.setItem(LAST_RACE_KEY, JSON.stringify(statsFromRaceDetail(detail)));
  } catch {}
}

export function peekLastRaceStatsForClaim() {
  try {
    const raw = sessionStorage.getItem(LAST_RACE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || typeof parsed.mode !== "string") return null;
    if (parsed.mode === "admin") return null;
    if (parsed.mode === "grandprix" && !parsed.gpSeriesComplete) return null;
    return parsed;
  } catch {
    return null;
  }
}

function shouldSubmitRace(detail) {
  if (!detail || typeof detail !== "object") return false;
  if (detail.mode === "admin" || detail.mode === "session") return false;
  if (detail.mode === "grandprix" && !detail.gpSeriesComplete) return false;
  return true;
}

export async function submitLiveLeaderboardRun(detail) {
  if (!shouldSubmitRace(detail)) return { ok: false, skipped: true };
  stashLastRaceStats(detail);
  const data = await postLeaderboard(detail.mode, statsFromRaceDetail(detail));
  if (data?.updated || data?.reason === "name_updated") {
    void fetchLiveLeaderboards(8).catch(() => {});
  }
  return data;
}

export function installLiveLeaderboardRaceHook() {
  window.addEventListener("otterkart-race-finished", (event) => {
    const detail = event?.detail;
    stashLastRaceStats(detail);
    void submitLiveLeaderboardRun(detail).catch(() => {});
  });
}

export function getCachedLiveLeaderboards() {
  return cachedBoards;
}
