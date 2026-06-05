/**
 * Live global leaderboards — GET /api/otter-kart/leaderboard
 * Submit signed runs after races (wallet required).
 */

import {
  getConnectedWallet,
  isEthAddress,
} from "../../otter-kart-rewards.mjs";
import { isDemoSessionActive, todayISO } from "./storage.js";

const API_URL = "/api/otter-kart/leaderboard";
const POLL_MS = 30000;
const MODE_ORDER = ["practice", "daily", "touge", "endless", "grandprix"];
const MODE_LABELS = {
  practice: "Practice",
  daily: "Drift challenge",
  touge: "Neon Snake",
  endless: "Endless",
  grandprix: "Grand Prix",
};

/** @type {ReturnType<typeof setInterval> | null} */
let pollTimer = null;
/** @type {number} */
let lastFetchAt = 0;
/** @type {boolean} */
let serverConfigured = false;
/** @type {Record<string, { label?: string, date?: string, rows: Array<{ rank: number, label: string }> }>} */
let cachedBoards = {};
/** @type {Set<(boards: typeof cachedBoards) => void>} */
const listeners = new Set();
/** @type {Set<HTMLElement>} */
const mountedRoots = new Set();
/** @type {HTMLElement | null} */
let overlayEl = null;
/** @type {HTMLButtonElement | null} */
let overlayToggleBtn = null;

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

function getEthereum() {
  const eth = typeof window !== "undefined" ? window.ethereum : null;
  return eth && typeof eth.request === "function" ? eth : null;
}

function submitMessage(wallet, mode, runId, issuedAtSec, stats) {
  const w = wallet.trim().toLowerCase();
  const lines = [
    "Otter Kart - Leaderboard Submit",
    "v1",
    `mode:${mode}`,
    `wallet:${w}`,
    `runId:${runId}`,
    `issuedAt:${issuedAtSec}`,
  ];
  if (stats.dateISO) lines.push(`date:${stats.dateISO}`);
  if (Number(stats.totalTime) > 0) lines.push(`time:${Number(stats.totalTime).toFixed(3)}`);
  if (Number(stats.bestLap) > 0) lines.push(`bestLap:${Number(stats.bestLap).toFixed(3)}`);
  if (Number(stats.shells) >= 0) lines.push(`shells:${Math.floor(Number(stats.shells) || 0)}`);
  if (Number(stats.longestDrift) > 0)
    lines.push(`longestDrift:${Number(stats.longestDrift).toFixed(3)}`);
  if (Number(stats.longestDriftTime) > 0)
    lines.push(`longestDriftTime:${Number(stats.longestDriftTime).toFixed(3)}`);
  if (Number(stats.distance) > 0) lines.push(`distance:${Number(stats.distance).toFixed(3)}`);
  if (Number(stats.endlessLongestDrift) > 0)
    lines.push(`endlessLongestDrift:${Number(stats.endlessLongestDrift).toFixed(3)}`);
  if (Number(stats.gpPlayerPoints) > 0)
    lines.push(`gpPoints:${Math.floor(Number(stats.gpPlayerPoints) || 0)}`);
  if (Number(stats.gpTotalTime) > 0)
    lines.push(`gpTotalTime:${Number(stats.gpTotalTime).toFixed(3)}`);
  return lines.join("\n");
}

async function personalSign(message, address) {
  const eth = getEthereum();
  if (!eth) return null;
  try {
    const sig = await eth.request({ method: "personal_sign", params: [message, address] });
    return typeof sig === "string" ? sig : null;
  } catch {
    return null;
  }
}

export async function fetchLiveLeaderboards(limit = 6) {
  const date = todayISO();
  const url = `${API_URL}?all=1&limit=${encodeURIComponent(String(limit))}&date=${encodeURIComponent(date)}`;
  const res = await fetch(url, { method: "GET", headers: { Accept: "application/json" } });
  const data = await res.json().catch(() => ({}));
  if (!data?.ok) throw new Error(data?.error || "Leaderboard fetch failed");
  lastFetchAt = Date.now();
  serverConfigured = !!data.configured;
  cachedBoards = data.boards && typeof data.boards === "object" ? data.boards : {};
  for (const fn of listeners) fn(cachedBoards);
  for (const root of mountedRoots) renderRoot(root);
  return cachedBoards;
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
    .slice(0, 6)
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

function renderRoot(root) {
  if (!(root instanceof HTMLElement)) return;
  const variant = root.dataset.liveLbVariant || "overlay";
  const activeMode = root.dataset.liveLbActive || "practice";
  const configured = serverConfigured;

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
        ${renderBoardList(board.rows, configured ? "No runs yet." : "Leaderboard storage not configured.")}
      </article>`;
    }).join("");
    root.innerHTML = `<div class="live-lb-page__grid">${cards}</div>
      <p class="live-lb__meta">Updated ${relTime(lastFetchAt)} · Connect wallet on the map to post scores</p>`;
    return;
  }

  const tabs = MODE_ORDER.map(
    (mode) =>
      `<button type="button" class="live-lb__tab${mode === activeMode ? " is-active" : ""}" data-live-lb-tab="${mode}">${escapeHtml(
        MODE_LABELS[mode],
      )}</button>`,
  ).join("");
  const board = cachedBoards[activeMode] || { rows: [] };
  root.innerHTML = `<div class="live-lb__tabs" role="tablist" aria-label="Game mode">${tabs}</div>
    ${renderBoardList(
      board.rows,
      configured ? "No runs yet — connect wallet & race." : "Server storage not configured.",
    )}
    <div class="live-lb__meta">Updated ${relTime(lastFetchAt)} · Connect wallet to submit scores</div>`;
}

function setLiveLeaderboardOverlayOpen(open) {
  if (!(overlayEl instanceof HTMLElement) || !(overlayToggleBtn instanceof HTMLButtonElement)) return;
  overlayEl.classList.toggle("hidden", !open);
  overlayEl.setAttribute("aria-hidden", open ? "false" : "true");
  overlayToggleBtn.setAttribute("aria-expanded", open ? "true" : "false");
  document.body?.classList?.toggle?.("otter-live-lb-open", open);
  if (open) {
    void fetchLiveLeaderboards(8).catch(() => {});
    const panel = overlayEl.querySelector("#live-leaderboard-panel");
    if (panel instanceof HTMLElement) renderRoot(panel);
    overlayEl.querySelector(".live-lb-overlay__close")?.focus?.();
  }
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
  void fetchLiveLeaderboards(opts.limit || 6).catch(() => renderRoot(root));
  if (pollTimer) return;
  pollTimer = window.setInterval(() => {
    void fetchLiveLeaderboards(opts.limit || 6).catch(() => {});
  }, opts.pollMs || POLL_MS);
}

function shouldSubmitRace(detail) {
  if (!detail || typeof detail !== "object") return false;
  if (detail.mode === "admin") return false;
  if (isDemoSessionActive()) return false;
  if (detail.mode === "grandprix" && !detail.gpSeriesComplete) return false;
  return true;
}

function statsFromDetail(detail) {
  return {
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

export async function submitLiveLeaderboardRun(detail) {
  if (!shouldSubmitRace(detail)) return { ok: false, skipped: true };
  const wallet = getConnectedWallet();
  if (!wallet || !isEthAddress(wallet)) return { ok: false, skipped: true, reason: "no_wallet" };

  const mode = detail.mode;
  const stats = statsFromDetail(detail);
  const issuedAtSec = Math.floor(Date.now() / 1000);
  const runId = `lb-${mode}-${issuedAtSec}-${Math.random().toString(36).slice(2, 10)}`;
  const message = submitMessage(wallet, mode, runId, issuedAtSec, stats);
  const signature = await personalSign(message, wallet);
  if (!signature) return { ok: false, error: "signature_failed" };

  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode, wallet, runId, issuedAtSec, signature, stats }),
  });
  const data = await res.json().catch(() => ({}));
  if (data?.updated) {
    void fetchLiveLeaderboards(6).catch(() => {});
  }
  return data;
}

export function installLiveLeaderboardRaceHook() {
  window.addEventListener("otterkart-race-finished", (event) => {
    const detail = event?.detail;
    void submitLiveLeaderboardRun(detail).catch(() => {});
  });
}

export function getCachedLiveLeaderboards() {
  return cachedBoards;
}
