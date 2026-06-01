import {
  DEMO_EYE_IDS,
  DEMO_HAT_IDS,
  DEMO_KART_IDS,
  GARAGE_KART_IDS,
  characterAssetUrl,
  EYE_IDS,
  HAT_IDS,
  KART_ID_RAINBOW,
  drawKartLayers,
  getCharacterAtlas,
  loadCharacterAtlas,
} from "./character.js";
import { Game } from "./game.js?v=2026-05-28-mapring-v16";
import { TRACK_IDS } from "./tracks.js?v=2026-05-19-neo-v4";
import {
  isDemoSessionActive,
  isRainbowKartUnlocked,
  loadEffectiveLoadout,
  saveLoadout,
  setDemoSessionActive,
} from "./storage.js";
import { KART_SPRITE_WORLD_SPAN } from "./config.js";
import { formatStatBars, resolveKartStats } from "./kart-stats.js";
import {
  applyHudViewportVars,
  getEmbedViewport,
  getGameViewportSize,
  isDesktopEmbedLayout,
  isEmbedded,
  setEmbedViewport,
} from "./viewport.js";
import { initOtterKartMusic } from "./music.js";
import { initTouchControls } from "./touch-controls.js";

import {
  claimSessionShells,
  connectAndCheckRewards,
  getConnectedWallet,
  shortWallet,
} from "../../shell-rush-rewards.mjs";

const canvas = document.getElementById("game");
const countdownEl = document.getElementById("countdown");
const hudTime = document.getElementById("hud-time");
const hudLap = document.getElementById("hud-lap");
const shellCount = document.getElementById("shell-count");
const bananaInv = null;
const boostInv = null;
const driftWrap = document.getElementById("drift-meter-wrap");
const driftFill = document.getElementById("drift-meter-fill");
const driftMeterTrack = document.getElementById("drift-meter-track");
const hudMode = document.getElementById("hud-mode");
const hudRandomizer = document.getElementById("hud-randomizer");
const hudRandomizerItem = document.getElementById("hud-randomizer-item");
const hudPlace = document.getElementById("hud-place");
const hudDriftBoard = document.getElementById("hud-drift-board");
const hudDriftCurVal = document.getElementById("hud-drift-cur-val");
const hudLives = document.getElementById("hud-lives");
const hudLivesVal = document.getElementById("hud-lives-val");
const homeShellsTotal = document.getElementById("home-shells-total");
const mapSessionShells = document.getElementById("map-session-shells");
const mapClaimBar = document.getElementById("map-claim-bar");
const btnClaim = document.getElementById("btn-claim");
const btnSettings = document.getElementById("btn-settings");
const panelSettings = document.getElementById("panel-settings");
const btnSettingsClose = document.getElementById("btn-settings-close");
const btnSettingsMenu = document.getElementById("btn-settings-menu");
const panelStart = document.getElementById("panel-start");
const panelEnd = document.getElementById("panel-end");
const modalBackdrop = document.getElementById("modal-backdrop");
const btnPractice = document.getElementById("btn-practice");
const btnDaily = document.getElementById("btn-daily");
const btnGP = document.getElementById("btn-gp");
const btnTouge = document.getElementById("btn-touge");
const btnEndless = document.getElementById("btn-endless");
const btnRestart = document.getElementById("btn-restart");
const btnMainMenu = document.getElementById("btn-main-menu");
const endTitle = document.getElementById("end-title");
const endTime = document.getElementById("end-time");
const endBestLap = document.getElementById("end-best-lap");
const endDriftTime = document.getElementById("end-drift-time");
const endShellsN = document.getElementById("end-shells-n");
const endFinishPlace = document.getElementById("end-finish-place");
const endDailyRank = document.getElementById("end-daily-rank");
const lbList = document.getElementById("lb-list");
const lbLabel = document.getElementById("lb-label");
const lbSub = document.getElementById("lb-sub");
const btnTabPlay = document.getElementById("btn-tab-play");
const btnTabCharacter = document.getElementById("btn-tab-character");
const tabPanePlay = document.getElementById("tab-pane-play");
const tabPaneCharacter = document.getElementById("tab-pane-character");
const mapHotspots = document.getElementById("map-hotspots");
const startMenuHotspots = document.getElementById("start-menu-hotspots");
const startWalletToast = document.getElementById("start-wallet-toast");
const demoSessionBadge = document.getElementById("demo-session-badge");
const garageHotspots = document.getElementById("garage-hotspots");
const btnAdminOpen = document.getElementById("btn-admin-open");
const panelAdmin = document.getElementById("panel-admin");
const btnAdminClose = document.getElementById("btn-admin-close");
const adminTrackList = document.getElementById("admin-track-list");

const ADMIN_TRACK_LABELS = {
  "meadow-oval": "Race 1 · Meadow Oval",
  "s-bends": "Race 2 · S-Bends",
  chicane: "Race 3 · Chicane",
  "neo-snake-gp": "Race 4 · Neon Snake",
  "lava-serpent": "Race 5 · Lava Serpent",
};
// Snake mode removed.

const game = new Game(canvas ?? /** @type {HTMLCanvasElement} */ (document.createElement("canvas")));
// On hard refresh some browsers briefly display a stale canvas bitmap.
// Clear immediately so nothing "pops" before the first draw.
try {
  const ctx0 = canvas?.getContext?.("2d");
  if (ctx0 && canvas?.width && canvas?.height) {
    ctx0.setTransform(1, 0, 0, 1, 0, 0);
    ctx0.clearRect(0, 0, canvas.width, canvas.height);
    ctx0.fillStyle = "#080c10";
    ctx0.fillRect(0, 0, canvas.width, canvas.height);
  }
} catch {
  // ignore
}

// Cache-bust the map image so updates show immediately.
// (Also used for hotspot calibration sizing.)
const MAP_IMG_URL = "./OtterKart-Map.png?v=2026-05-07-1236";
const START_IMG_URL = "./OtterKart-Start-Menu.png?v=2026-05-28-start-menu-v15";
let mapImgNatural = { w: 0, h: 0 };
let startImgNatural = { w: 0, h: 0 };
let hotspotLayoutRaf = 0;

/** Image-space hitboxes for OtterKart-Start-Menu.png (1024×572). */
const START_HOTSPOT_BOXES = {
  start: { ix: 358, iy: 208, iw: 306, ih: 92 },
  demo: { ix: 368, iy: 323, iw: 276, ih: 60 },
  wallet: { ix: 394, iy: 402, iw: 224, ih: 48 },
};

/** Image-space hitboxes for OtterKart-Map.png (1672×941) — same on every viewport size. */
const MAP_HOTSPOT_BOXES = {
  garage: { ix: 48, iy: 198, iw: 220, ih: 184 },
  practice: { ix: 367, iy: 208, iw: 202, ih: 122 },
  daily: { ix: 1043, iy: 91, iw: 302, ih: 104 },
  grandprix: { ix: 622, iy: 552, iw: 268, ih: 104 },
  touge: { ix: 1170, iy: 573, iw: 235, ih: 113 },
  endless: { ix: 301, iy: 753, iw: 235, ih: 122 },
  claim: { ix: 1414, iy: 896, iw: 101, ih: 84 },
};

function coverTransform(imgW, imgH, vw, vh) {
  const s = Math.max(vw / imgW, vh / imgH);
  const dw = imgW * s;
  const dh = imgH * s;
  const ox = (vw - dw) * 0.5; // centered
  const oy = (vh - dh) * 0.5;
  return { s, ox, oy, dw, dh };
}

function isDesktopEmbedMapLayout() {
  return isEmbedded() && isDesktopEmbedLayout();
}

function getMenuCoverImageEl() {
  const img = document.getElementById("menu-cover-img");
  return img instanceof HTMLImageElement ? img : null;
}

/** Same cover math as full-page local file (window size, not iframe postMessage). */
function coverPaintForHotspots(imgW, imgH) {
  const vw = Math.round(
    document.documentElement.clientWidth || window.innerWidth || 1,
  );
  const vh = Math.round(
    document.documentElement.clientHeight || window.innerHeight || 1,
  );
  const { s, ox, oy, dw, dh } = coverTransform(imgW, imgH, vw, vh);
  return { left: ox, top: oy, width: dw, height: dh, scale: s };
}

function clearMapHotspotInlineStyles() {
  mapHotspots?.querySelectorAll?.("[data-map-mode]")?.forEach((el) => {
    if (!(el instanceof HTMLElement)) return;
    el.style.removeProperty("left");
    el.style.removeProperty("top");
    el.style.removeProperty("width");
    el.style.removeProperty("height");
    el.style.removeProperty("position");
  });
}

/**
 * @param {number} clientX
 * @param {number} clientY
 * @param {Record<string, { ix: number, iy: number, iw: number, ih: number }>} boxes
 * @param {number} imgW
 * @param {number} imgH
 * @returns {string | null}
 */
function hitTestCoverHotspots(clientX, clientY, boxes, imgW, imgH) {
  const paint = coverPaintForHotspots(imgW, imgH);
  const ix = (clientX - paint.left) / paint.scale;
  const iy = (clientY - paint.top) / paint.scale;

  for (const [key, box] of Object.entries(boxes)) {
    if (
      ix >= box.ix &&
      ix <= box.ix + box.iw &&
      iy >= box.iy &&
      iy <= box.iy + box.ih
    ) {
      return key;
    }
  }
  return null;
}

/**
 * Position hotspot buttons using the same cover math as body::after backgrounds.
 * @param {HTMLElement | null | undefined} layer
 * @param {Record<string, { ix: number, iy: number, iw: number, ih: number }>} boxes
 * @param {number} imgW
 * @param {number} imgH
 * @param {string} attr e.g. data-start-action | data-map-mode
 */
function layoutCoverHotspots(layer, boxes, imgW, imgH, attr) {
  if (!(layer instanceof HTMLElement) || !imgW || !imgH) return;
  const paint = coverPaintForHotspots(imgW, imgH);

  layer.querySelectorAll(`[${attr}]`).forEach((el) => {
    if (!(el instanceof HTMLElement)) return;
    const key = el.getAttribute(attr);
    const box = key ? boxes[key] : null;
    if (!box) return;
    const w = Math.max(12, box.iw * paint.scale);
    const h = Math.max(12, box.ih * paint.scale);
    el.style.position = "fixed";
    el.style.left = `${paint.left + box.ix * paint.scale}px`;
    el.style.top = `${paint.top + box.iy * paint.scale}px`;
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    el.style.margin = "0";
  });
}

function relayoutMenuHotspots() {
  syncMenuCover();
  resetMenuCoverToFullFrame();
  if (document.body?.classList?.contains?.("otter-ui-start")) {
    const iw = startImgNatural.w || 1024;
    const ih = startImgNatural.h || 572;
    layoutCoverHotspots(
      startMenuHotspots,
      START_HOTSPOT_BOXES,
      iw,
      ih,
      "data-start-action",
    );
  } else if (
    document.body?.classList?.contains?.("otter-ui-playtab") &&
    !document.body?.classList?.contains?.("otter-ui-garage")
  ) {
    void layoutMapHotspots();
  }
}

function scheduleHotspotRelayout() {
  if (hotspotLayoutRaf) cancelAnimationFrame(hotspotLayoutRaf);
  hotspotLayoutRaf = requestAnimationFrame(() => {
    hotspotLayoutRaf = 0;
    relayoutMenuHotspots();
  });
}

function installHotspotResizeWatchers() {
  const onResize = () => {
    applyHudViewportVars();
    scheduleHotspotRelayout();
    try {
      game.resize();
    } catch {
      // ignore
    }
  };
  window.addEventListener("resize", onResize);
  window.visualViewport?.addEventListener("resize", onResize);
  window.visualViewport?.addEventListener("scroll", onResize);
  window.addEventListener("message", (event) => {
    if (event?.data?.type === "REQUEST_GAME_SIZE") onResize();
    if (event?.data?.type === "EMBED_VIEWPORT") {
      setEmbedViewport(event.data.width, event.data.height);
      onResize();
    }
  });
  if (typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(onResize);
    ro.observe(document.documentElement);
    if (document.body) ro.observe(document.body);
    const coverImg = getMenuCoverImageEl();
    if (coverImg) ro.observe(coverImg);
  }
}

async function ensureMapImageSize() {
  if (mapImgNatural.w > 0 && mapImgNatural.h > 0) return mapImgNatural;
  return await new Promise((resolve) => {
    const im = new Image();
    im.onload = () => {
      mapImgNatural = { w: im.naturalWidth || 1672, h: im.naturalHeight || 941 };
      resolve(mapImgNatural);
    };
    im.onerror = () => {
      mapImgNatural = { w: 1672, h: 941 };
      resolve(mapImgNatural);
    };
    im.src = MAP_IMG_URL;
  });
}

/** Start screen: full-frame cover via CSS — clear any map-only inline layout. */
function resetMenuCoverToFullFrame() {
  const cover = document.getElementById("menu-cover");
  const img = document.getElementById("menu-cover-img");
  if (!(cover instanceof HTMLElement) || !(img instanceof HTMLImageElement)) return;
  for (const el of [cover, img]) {
    el.style.removeProperty("position");
    el.style.removeProperty("left");
    el.style.removeProperty("top");
    el.style.removeProperty("width");
    el.style.removeProperty("height");
    el.style.removeProperty("right");
    el.style.removeProperty("bottom");
    el.style.removeProperty("overflow");
  }
}

async function layoutMapHotspots() {
  if (!(mapHotspots instanceof HTMLElement)) return;
  await ensureMapImageSize();
  const iw = mapImgNatural.w || 1672;
  const ih = mapImgNatural.h || 941;
  const img = getMenuCoverImageEl();
  if (img && !img.complete) {
    await new Promise((resolve) => img.addEventListener("load", resolve, { once: true }));
  }
  if (isDesktopEmbedMapLayout()) {
    clearMapHotspotInlineStyles();
  } else {
    layoutCoverHotspots(mapHotspots, MAP_HOTSPOT_BOXES, iw, ih, "data-map-mode");
  }
  layoutMapClaimBar();
}

function syncMenuCover() {
  const cover = document.getElementById("menu-cover");
  const img = document.getElementById("menu-cover-img");
  if (!(cover instanceof HTMLElement) || !(img instanceof HTMLImageElement)) return;

  const onStart = document.body?.classList?.contains?.("otter-ui-start");
  const onMap =
    document.body?.classList?.contains?.("otter-ui-playtab") &&
    !document.body?.classList?.contains?.("otter-ui-garage");

  if (onStart) {
    cover.hidden = false;
    cover.classList.add("is-visible");
    cover.setAttribute("aria-hidden", "false");
    if (!img.src.includes("OtterKart-Start-Menu")) img.src = START_IMG_URL;
  } else if (onMap) {
    cover.hidden = false;
    cover.classList.add("is-visible");
    cover.setAttribute("aria-hidden", "false");
    if (!img.src.includes("OtterKart-Map")) {
      img.src = MAP_IMG_URL;
    }
    if (!img.complete) {
      img.addEventListener("load", () => scheduleHotspotRelayout(), { once: true });
    }
  } else {
    cover.hidden = true;
    cover.classList.remove("is-visible");
    cover.setAttribute("aria-hidden", "true");
  }
}

async function ensureStartImageSize() {
  if (startImgNatural.w > 0 && startImgNatural.h > 0) return startImgNatural;
  return await new Promise((resolve) => {
    const im = new Image();
    im.onload = () => {
      startImgNatural = { w: im.naturalWidth || 1024, h: im.naturalHeight || 572 };
      resolve(startImgNatural);
    };
    im.onerror = () => {
      startImgNatural = { w: 1024, h: 572 };
      resolve(startImgNatural);
    };
    im.src = START_IMG_URL;
  });
}

function syncDemoSessionBadge() {
  const show =
    isDemoSessionActive() &&
    document.body?.classList?.contains?.("otter-ui-playtab") &&
    !document.body?.classList?.contains?.("otter-ui-garage");
  demoSessionBadge?.classList.toggle("hidden", !show);
  demoSessionBadge?.setAttribute("aria-hidden", show ? "false" : "true");
}

/** @param {{ demo?: boolean }} opts */
function enterMapFromStart(opts = {}) {
  setDemoSessionActive(!!opts.demo);
  document.body?.classList?.remove?.("otter-ui-start");
  startMenuHotspots?.setAttribute?.("aria-hidden", "true");
  activateMenuTab("play");
  syncDemoSessionBadge();
  syncMenuCover();
  scheduleHotspotRelayout();
}

let walletToastTimer = 0;
function showStartWalletToast(text, persist) {
  if (!(startWalletToast instanceof HTMLElement)) return;
  startWalletToast.textContent = text;
  startWalletToast.classList.remove("hidden");
  window.clearTimeout(walletToastTimer);
  if (!persist) {
    walletToastTimer = window.setTimeout(() => {
      startWalletToast.classList.add("hidden");
    }, 5200);
  }
}

async function handleWalletConnectHotspot() {
  showStartWalletToast("Connecting wallet…", true);
  try {
    const result = await connectAndCheckRewards(getConnectedWallet());
    const short = result.wallet ? shortWallet(result.wallet) : "";
    const prefix = short ? `${short} — ` : "";
    showStartWalletToast(`${prefix}${result.text}`, result.tone === "ok");
  } catch {
    showStartWalletToast("Wallet check failed. Try again.", false);
  }
}

let claimBusy = false;
async function handleClaimShells() {
  if (claimBusy) return;
  const shells = Math.floor(game.totalShellsSession ?? 0);
  if (shells <= 0) {
    showStartWalletToast("No session shells to claim yet.", false);
    return;
  }
  claimBusy = true;
  const prevLabel = btnClaim?.textContent;
  if (btnClaim) btnClaim.textContent = "Claiming…";
  if (btnClaim) btnClaim.disabled = true;
  try {
    const result = await claimSessionShells(shells);
    showStartWalletToast(result.text, result.ok);
    if (result.ok) {
      game.totalShellsSession = 0;
      game.updateHomeShellsUI();
    }
  } catch {
    showStartWalletToast("Claim failed. Try again.", false);
  } finally {
    claimBusy = false;
    if (btnClaim) {
      btnClaim.disabled = false;
      btnClaim.textContent = prevLabel || "Claim";
    }
  }
}

function hideMapClaimBar() {
  if (!(mapClaimBar instanceof HTMLElement)) return;
  mapClaimBar.style.removeProperty("left");
  mapClaimBar.style.removeProperty("top");
  mapClaimBar.style.removeProperty("visibility");
  mapClaimBar.style.removeProperty("display");
}

function layoutMapClaimBar() {
  if (!(mapClaimBar instanceof HTMLElement)) return;
  if (
    !document.body?.classList?.contains?.("otter-ui-menu") ||
    !document.body?.classList?.contains?.("otter-ui-playtab") ||
    document.body?.classList?.contains?.("otter-ui-garage")
  ) {
    hideMapClaimBar();
    return;
  }

  const claim = mapHotspots?.querySelector?.(".map-hotspot--claim");
  if (!(claim instanceof HTMLElement)) return;

  mapClaimBar.style.removeProperty("display");
  mapClaimBar.style.visibility = "hidden";

  const cr = claim.getBoundingClientRect();
  const bw = mapClaimBar.offsetWidth || 88;
  const bh = mapClaimBar.offsetHeight || 40;
  const gap = 232;
  const { vw, vh } = getGameViewportSize();
  const desktop = Math.min(vw, vh) >= 560;
  let left = cr.left - bw - gap;
  let top = cr.top + (cr.height - bh) * 0.5;
  if (desktop) top -= 30;
  left = Math.max(8, left);
  top = Math.max(8, Math.min(top, vh - bh - 8));
  mapClaimBar.style.left = `${left}px`;
  mapClaimBar.style.top = `${top}px`;
  mapClaimBar.style.removeProperty("visibility");
  mapClaimBar.setAttribute("aria-hidden", "false");
}

/** Map homescreen after leaving a race — restore Play tab + shell counter. */
function returnToMapHome() {
  game.returnToMainMenu();
  activateMenuTab("play");
  modalBackdrop?.classList?.add?.("hidden");
}

function setAdminPanelOpen(open) {
  if (!panelAdmin) return;
  document.body?.classList?.toggle?.("otter-ui-admin-open", !!open);
  if (open) {
    if (panelSettings) panelSettings.classList.add("hidden");
    panelAdmin.classList.remove("hidden");
    modalBackdrop?.classList.remove("hidden");
    btnAdminOpen?.setAttribute("aria-expanded", "true");
  } else {
    panelAdmin.classList.add("hidden");
    btnAdminOpen?.setAttribute("aria-expanded", "false");
    const settingsOpen =
      panelSettings && !panelSettings.classList.contains("hidden");
    const endOpen = panelEnd && !panelEnd.classList.contains("hidden");
    if (!settingsOpen && !endOpen) modalBackdrop?.classList.add("hidden");
  }
}

function populateAdminTrackList() {
  if (!adminTrackList) return;
  adminTrackList.innerHTML = "";
  for (const id of TRACK_IDS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "admin-track-btn";
    b.setAttribute("data-admin-track", id);
    b.textContent = ADMIN_TRACK_LABELS[id] ?? id;
    adminTrackList.appendChild(b);
  }
}

function startAdminRace(trackId) {
  try {
    void loadCharacterAtlas();
    hideMapClaimBar();
    mapHotspots?.setAttribute?.("aria-hidden", "true");
    game.bindInput();
    game.setModeAdmin(trackId);
    if (game.hudMode) game.hudMode.textContent = game.getHUDModeLabel();
    game.softRestart();
    setAdminPanelOpen(false);
    modalBackdrop?.classList?.add?.("hidden");
  } catch (e) {
    showFatal(e);
  }
}

/** @param {"play" | "character"} tab */
function activateMenuTab(tab) {
  setAdminPanelOpen(false);
  const isPlay = tab === "play";
  if (btnTabPlay)
    btnTabPlay.setAttribute("aria-selected", isPlay ? "true" : "false");
  if (btnTabCharacter)
    btnTabCharacter.setAttribute("aria-selected", tab === "character" ? "true" : "false");
  if (tabPanePlay) tabPanePlay.hidden = tab !== "play";
  if (tabPaneCharacter) tabPaneCharacter.hidden = tab !== "character";
  document.body?.classList?.toggle("otter-ui-garage", tab === "character");
  document.body?.classList?.toggle("otter-ui-playtab", tab === "play");
  if (panelStart) {
    if (isPlay) panelStart.classList.add("hidden");
    else panelStart.classList.remove("hidden");
  }
  if (mapHotspots) mapHotspots.setAttribute("aria-hidden", tab === "play" ? "false" : "true");
  if (mapClaimBar)
    mapClaimBar.setAttribute("aria-hidden", tab === "play" ? "false" : "true");
  if (garageHotspots)
    garageHotspots.setAttribute(
      "aria-hidden",
      tab === "character" ? "false" : "true",
    );
  if (tab === "play") {
    syncMenuCover();
    scheduleHotspotRelayout();
    syncDemoSessionBadge();
  } else {
    syncMenuCover();
    hideMapClaimBar();
    demoSessionBadge?.classList?.add?.("hidden");
  }

  // The equipped preview size/styling depends on whether we're in Garage mode.
  // Re-render immediately on tab change so it doesn't "pop" only after the next click.
  try {
    const mount = document.getElementById("loadout-mount");
    const cv = mount?.querySelector?.("canvas[data-equipped-preview]");
    if (cv instanceof HTMLCanvasElement) renderEquippedComposite(cv, loadEffectiveLoadout());
  } catch {
    // ignore
  }
}

function showFatal(err) {
  const msg =
    err && typeof err === "object" && "stack" in err
      ? String(err.stack)
      : String(err);
  console.error(err);
  const box = document.createElement("div");
  box.style.position = "fixed";
  box.style.left = "12px";
  box.style.right = "12px";
  box.style.bottom = "12px";
  box.style.zIndex = "999";
  box.style.background = "rgba(120, 18, 18, 0.92)";
  box.style.border = "1px solid rgba(255,255,255,0.22)";
  box.style.color = "white";
  box.style.padding = "10px 12px";
  box.style.borderRadius = "12px";
  box.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
  box.style.fontSize = "12px";
  box.style.whiteSpace = "pre-wrap";
  box.textContent = `Error:\\n${msg}`;
  document.body.appendChild(box);
}

window.addEventListener("error", (e) => showFatal(e.error ?? e.message));
window.addEventListener("unhandledrejection", (e) => showFatal(e.reason));

function folderForSlot(slot) {
  if (slot === "kart") return "Karts";
  if (slot === "hat") return "Hats";
  return "Eyes";
}

function syncChipSelection(mount, sel) {
  if (!mount) return;
  mount.querySelectorAll("[data-loadout-chip]").forEach((b) => {
    const slot = b.getAttribute("data-slot");
    const id = b.getAttribute("data-id");
    const match =
      slot === "kart"
        ? id === sel.kart
        : slot === "hat"
          ? id === sel.hat
          : slot === "eye"
            ? id === sel.eye
            : false;
    b.classList.toggle("loadout-chip--selected", match);
    b.setAttribute("aria-pressed", match ? "true" : "false");
  });
}

function formatEquippedLabel(slot, id) {
  if (!id) return "—";
  if (slot === "kart" && id === KART_ID_RAINBOW) return "Rainbow kart";
  if (slot === "kart") return `${id} kart`;
  return id;
}

function drawFallbackOtter(ctx, x, y, ang, alphaW) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  const ga = typeof ctx.globalAlpha === "number" ? ctx.globalAlpha : 1;
  ctx.globalAlpha = ga * (alphaW ?? 1);
  ctx.fillStyle = "rgba(240, 249, 252, 0.85)";
  ctx.beginPath();
  ctx.ellipse(0, 0, 13, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Size preview so modal + headings + chip rows usually fit without scrolling.
 * Uses viewport height reserve (approx. non-preview content in #panel-start).
 */
function equippedPreviewCssSize() {
  if (typeof window === "undefined") return 128;
  const { vw, vh } = getGameViewportSize();
  const garage = document?.body?.classList?.contains?.("otter-ui-garage");
  if (garage) {
    // In Garage, the preview is the centerpiece.
    return Math.round(Math.max(220, Math.min(520, Math.min(vh * 0.58, vw * 0.42))));
  }
  /** Extra vertical budget for headings, tabs, chip rows (~3 sections). */
  const reserveFrac = vh <= 460 ? 0.705 : vh <= 560 ? 0.645 : 0.585;
  const reserveY = Math.round(Math.min(540, Math.max(328, vh * reserveFrac)));
  const fromH = vh - reserveY;
  const fromW = Math.floor(vw * 0.46);
  return Math.round(Math.max(84, Math.min(288, Math.min(fromH, fromW))));
}

function renderEquippedComposite(canvasEl, sel) {
  if (!(canvasEl instanceof HTMLCanvasElement)) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const sizeCss = equippedPreviewCssSize();
  canvasEl.width = Math.floor(sizeCss * dpr);
  canvasEl.height = Math.floor(sizeCss * dpr);
  canvasEl.style.width = `${sizeCss}px`;
  canvasEl.style.height = `${sizeCss}px`;

  const ctx = canvasEl.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, sizeCss, sizeCss);

  const garage = document?.body?.classList?.contains?.("otter-ui-garage");
  if (!garage) {
    // Soft backdrop so transparent sprites read well.
    ctx.fillStyle = "rgba(20, 32, 50, 0.85)";
    ctx.fillRect(0, 0, sizeCss, sizeCss);
  }

  const atlas = getCharacterAtlas();
  if (!atlas) {
    // Try again once the atlas resolves.
    loadCharacterAtlas().then(() => renderEquippedComposite(canvasEl, sel));
    return;
  }

  // Map world-size sprite span into our pixel preview.
  // Some sprites have tighter bounds; give Garage a bit more padding to avoid clipping.
  const pad = garage ? 14 : 14;
  const pxSpan = sizeCss - pad * 2;
  // Slightly smaller in Garage to prevent edge cut-off on wide/tall karts.
  const scale = pxSpan / (KART_SPRITE_WORLD_SPAN * (garage ? 1.14 : 1.05));
  ctx.save();
  ctx.translate(sizeCss * 0.5, sizeCss * (garage ? 0.52 : 0.535));
  ctx.scale(scale, scale);
  drawKartLayers(
    ctx,
    0,
    0,
    Math.PI / 2,
    1,
    sel.kart,
    sel.eye,
    sel.hat,
    atlas,
    sel.hull,
    sel.fur,
    drawFallbackOtter,
  );
  ctx.restore();
}

function createLoadoutStatBars() {
  const wrap = document.createElement("div");
  wrap.className = "loadout-stats";
  wrap.dataset.loadoutStats = "";
  for (const key of ["speed", "control", "drift"]) {
    const label =
      key === "speed" ? "Speed" : key === "control" ? "Control" : "Drift";
    const row = document.createElement("div");
    row.className = "loadout-stat";
    row.dataset.stat = key;
    const lab = document.createElement("span");
    lab.className = "loadout-stat__label";
    lab.textContent = label;
    const track = document.createElement("div");
    track.className = "loadout-stat__track";
    const fill = document.createElement("div");
    fill.className = "loadout-stat__fill";
    fill.dataset.statFill = key;
    track.appendChild(fill);
    row.append(lab, track);
    wrap.appendChild(row);
  }
  return wrap;
}

/** @param {HTMLElement | null | undefined} root @param {{ kart: string, hat: string, eye: string }} sel */
function updateLoadoutStatBars(root, sel) {
  if (!root || !sel) return;
  const bars = formatStatBars(
    resolveKartStats(sel.kart, sel.hat, sel.eye),
  );
  for (const key of ["speed", "control", "drift"]) {
    const fill = root.querySelector(`[data-stat-fill="${key}"]`);
    if (fill instanceof HTMLElement)
      fill.style.width = `${bars[key]}%`;
  }
}

function appendEquippedBanner(mount, sel) {
  const wrap = document.createElement("div");
  wrap.className = "loadout-equipped";
  wrap.dataset.loadoutEquipped = "";
  wrap.setAttribute("role", "region");
  wrap.setAttribute("aria-label", "Currently equipped");

  const title = document.createElement("p");
  title.className = "loadout-equipped__title";
  title.textContent = "Equipped now";

  const strip = document.createElement("div");
  strip.className = "loadout-equipped__strip";

  const previewWrap = document.createElement("div");
  previewWrap.className = "loadout-equipped__previewWrap";
  const preview = document.createElement("canvas");
  preview.className = "loadout-equipped__preview";
  preview.dataset.equippedPreview = "";
  previewWrap.appendChild(preview);

  const meta = document.createElement("div");
  meta.className = "loadout-equipped__meta";
  const line = document.createElement("div");
  line.className = "loadout-equipped__line";
  line.dataset.equippedLine = "";
  line.textContent = `${sel.kart} · ${sel.hat} · ${sel.eye}`;
  const small = document.createElement("div");
  small.className = "loadout-equipped__sub";
  small.textContent = "Kart · Hat · Eyes";
  meta.append(line, small);

  strip.append(previewWrap, meta);

  const stats = createLoadoutStatBars();
  updateLoadoutStatBars(stats, sel);

  wrap.append(title, strip, stats);
  mount.appendChild(wrap);
  renderEquippedComposite(preview, sel);
}

function updateEquippedBanner(mount, sel) {
  const root = mount.querySelector("[data-loadout-equipped]");
  if (!root) return;
  const cv = root.querySelector("canvas[data-equipped-preview]");
  renderEquippedComposite(cv, sel);
  const line = root.querySelector("[data-equipped-line]");
  if (line) line.textContent = `${sel.kart} · ${sel.hat} · ${sel.eye}`;
  const garageLine = mount.parentElement?.querySelector?.("[data-garage-line]");
  if (garageLine)
    garageLine.textContent = `OtterKart / ${sel.kart} · ${sel.hat} · ${sel.eye}`;
  const statsRoot = root.querySelector("[data-loadout-stats]");
  updateLoadoutStatBars(statsRoot, sel);
}

function mountLoadoutPicker() {
  const mount = document.getElementById("loadout-mount");
  if (!mount) return;
  mount.replaceChildren();
  let sel = loadEffectiveLoadout();

  const layout = document.createElement("div");
  layout.className = "loadout-layout";
  const left = document.createElement("div");
  left.className = "loadout-layout__left";
  const right = document.createElement("div");
  right.className = "loadout-layout__right";
  // Garage background is full-screen (CSS). Keep right column empty (hidden in Garage mode).
  right.innerHTML = ``;
  layout.append(left, right);
  mount.appendChild(layout);

  appendEquippedBanner(left, sel);

  /** Cache for trimmed alpha bounds so we don't re-scan every frame. */
  const trimCache = new Map();

  function loadImageOnce(src, ms = 12000) {
    return new Promise((resolve) => {
      let settled = false;
      const tid = window.setTimeout(() => wrap(null), ms);
      function wrap(im) {
        if (settled) return;
        settled = true;
        window.clearTimeout(tid);
        resolve(im?.complete && im?.naturalWidth ? im : null);
      }
      const im = new Image();
      im.onload = () => wrap(im);
      im.onerror = () => wrap(null);
      im.src = src;
    });
  }

  function computeAlphaTrim(img) {
    const key = img.src || `${img.naturalWidth}x${img.naturalHeight}`;
    if (trimCache.has(key)) return trimCache.get(key);
    const w = img.naturalWidth | 0;
    const h = img.naturalHeight | 0;
    if (!w || !h) {
      const t = { sx: 0, sy: 0, sw: 1, sh: 1 };
      trimCache.set(key, t);
      return t;
    }
    const maxScan = 128;
    const scanScale = Math.min(1, maxScan / Math.max(w, h));
    const sw = Math.max(1, Math.floor(w * scanScale));
    const sh = Math.max(1, Math.floor(h * scanScale));
    const c = document.createElement("canvas");
    c.width = sw;
    c.height = sh;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      const t = { sx: 0, sy: 0, sw: w, sh: h };
      trimCache.set(key, t);
      return t;
    }
    ctx.clearRect(0, 0, sw, sh);
    ctx.drawImage(img, 0, 0, sw, sh);
    const data = ctx.getImageData(0, 0, sw, sh).data;
    let minX = sw,
      minY = sh,
      maxX = -1,
      maxY = -1;
    for (let y = 0; y < sh; y++) {
      const row = y * sw * 4;
      for (let x = 0; x < sw; x++) {
        const a = data[row + x * 4 + 3];
        if (a > 8) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < minX || maxY < minY) {
      const t = { sx: 0, sy: 0, sw: w, sh: h };
      trimCache.set(key, t);
      return t;
    }
    const inv = 1 / scanScale;
    const pad = 2;
    const sx = Math.max(0, Math.floor(minX * inv) - pad);
    const sy = Math.max(0, Math.floor(minY * inv) - pad);
    const ex = Math.min(w - 1, Math.ceil(maxX * inv) + pad);
    const ey = Math.min(h - 1, Math.ceil(maxY * inv) + pad);
    const t = { sx, sy, sw: Math.max(1, ex - sx + 1), sh: Math.max(1, ey - sy + 1) };
    if (trimCache.size > 48) trimCache.clear();
    trimCache.set(key, t);
    return t;
  }

  function blitTrimmedToCanvas(canvas, img) {
    const cssW = canvas.clientWidth || 200;
    const cssH = canvas.clientHeight || 80;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.floor(cssW * dpr));
    canvas.height = Math.max(1, Math.floor(cssH * dpr));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    const t = computeAlphaTrim(img);
    const scale = Math.min(cssW / t.sw, cssH / t.sh);
    const dw = t.sw * scale;
    const dh = t.sh * scale;
    const dx = (cssW - dw) * 0.5;
    const dy = (cssH - dh) * 0.5;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, t.sx, t.sy, t.sw, t.sh, dx, dy, dw, dh);
  }

  /** @param {string} title @param {'kart'|'hat'|'eye'} slot @param {string[]} ids */
  function row(title, slot, ids) {
    const wrap = document.createElement("div");
    wrap.className = "loadout-row loadout-row--carousel";
    wrap.dataset.loadoutCarousel = "";
    wrap.dataset.slot = slot;
    const lab = document.createElement("span");
    lab.className = "loadout-row__label";
    lab.textContent = title;
    wrap.appendChild(lab);

    const picker = document.createElement("div");
    picker.className = "loadout-carousel";

    const prev = document.createElement("button");
    prev.type = "button";
    prev.className = "loadout-nav loadout-nav--prev";
    prev.dataset.loadoutNav = "prev";
    prev.dataset.slot = slot;
    prev.setAttribute("aria-label", `Previous ${title.toLowerCase()}`);
    prev.textContent = "‹";

    const next = document.createElement("button");
    next.type = "button";
    next.className = "loadout-nav loadout-nav--next";
    next.dataset.loadoutNav = "next";
    next.dataset.slot = slot;
    next.setAttribute("aria-label", `Next ${title.toLowerCase()}`);
    next.textContent = "›";

    const center = document.createElement("button");
    center.type = "button";
    center.className = "loadout-carousel__center";
    center.dataset.loadoutCenter = "";
    center.dataset.slot = slot;
    center.setAttribute("aria-label", `Current ${title.toLowerCase()}`);

    const cv = document.createElement("canvas");
    cv.className = "loadout-carousel__canvas";
    cv.dataset.loadoutCanvas = "";
    cv.dataset.slot = slot;
    center.appendChild(cv);

    const name = document.createElement("div");
    name.className = "loadout-carousel__name";
    name.dataset.loadoutName = "";
    name.textContent = "—";

    picker.append(prev, center, next);
    wrap.append(picker, name);
    left.appendChild(wrap);
  }

  row("Kart", "kart", GARAGE_KART_IDS);
  row("Hat", "hat", HAT_IDS);
  row("Eyes", "eye", EYE_IDS);

  const randWrap = document.createElement("div");
  randWrap.className = "loadout-randWrap";
  randWrap.innerHTML = `
    <button type="button" class="loadout-rand" data-loadout-rand>
      Randomize
    </button>
  `;
  left.appendChild(randWrap);

  function unlockedListFor(slot, ids) {
    if (slot !== "kart") return ids;
    if (isRainbowKartUnlocked()) return ids;
    return ids.filter((id) => id !== KART_ID_RAINBOW);
  }

  /** Garage carousel ids (demo session uses a fixed subset). */
  function pickerIdsFor(slot, ids) {
    if (isDemoSessionActive()) {
      if (slot === "kart") return DEMO_KART_IDS;
      if (slot === "hat") return DEMO_HAT_IDS;
      if (slot === "eye") return DEMO_EYE_IDS;
    }
    return unlockedListFor(slot, ids);
  }

  /** @param {'kart'|'hat'|'eye'} slot */
  function applySlot(slot, id) {
    saveLoadout(
      slot === "kart"
        ? { kart: id }
        : slot === "hat"
          ? { hat: id }
          : { eye: id },
    );
    sel = loadEffectiveLoadout();
    updateEquippedBanner(left, sel);
    renderAllRows();
  }

  function randPick(arr) {
    if (!arr?.length) return null;
    return arr[Math.floor(Math.random() * arr.length)] ?? null;
  }

  function randomizeAll() {
    const karts = pickerIdsFor("kart", GARAGE_KART_IDS);
    const hats = pickerIdsFor("hat", HAT_IDS);
    const eyes = pickerIdsFor("eye", EYE_IDS);
    const rk = randPick(karts);
    const rh = randPick(hats);
    const re = randPick(eyes);
    saveLoadout({ kart: rk ?? sel.kart, hat: rh ?? sel.hat, eye: re ?? sel.eye });
    sel = loadEffectiveLoadout();
    updateEquippedBanner(left, sel);
    renderAllRows();
  }

  function renderAllRows() {
    /** @type {Array<HTMLDivElement>} */
    const rows = Array.from(
      left.querySelectorAll("div[data-loadout-carousel]"),
    );
    for (const r of rows) {
      const slot = r.dataset.slot;
      if (slot !== "kart" && slot !== "hat" && slot !== "eye") continue;
      const ids =
        slot === "kart"
          ? GARAGE_KART_IDS
          : slot === "hat"
            ? HAT_IDS
            : EYE_IDS;
      const list = pickerIdsFor(slot, ids);
      const cur = slot === "kart" ? sel.kart : slot === "hat" ? sel.hat : sel.eye;
      const idx = Math.max(0, list.indexOf(cur));
      const shown = list[idx] ?? list[0];
      const cv = r.querySelector("canvas[data-loadout-canvas]");
      if (cv instanceof HTMLCanvasElement) {
        const src = characterAssetUrl(folderForSlot(slot), shown);
        loadImageOnce(src).then((im) => {
          if (!im) return;
          blitTrimmedToCanvas(cv, im);
        });
      }
      const nm = r.querySelector("[data-loadout-name]");
      if (nm) nm.textContent = shown;
    }
  }

  renderAllRows();

  left.querySelector("[data-loadout-rand]")?.addEventListener("click", () => {
    randomizeAll();
  });

  left.onclick = (e) => {
    const nav = e.target.closest("[data-loadout-nav]");
    if (!(nav instanceof HTMLButtonElement)) return;
    const dir = nav.dataset.loadoutNav;
    const slot = nav.dataset.slot;
    if (!dir || (dir !== "prev" && dir !== "next")) return;
    if (!slot || (slot !== "kart" && slot !== "hat" && slot !== "eye")) return;
    const ids =
      slot === "kart"
        ? GARAGE_KART_IDS
        : slot === "hat"
          ? HAT_IDS
          : EYE_IDS;
    const list = pickerIdsFor(slot, ids);
    const cur = slot === "kart" ? sel.kart : slot === "hat" ? sel.hat : sel.eye;
    let idx = list.indexOf(cur);
    if (idx < 0) idx = 0;
    idx = dir === "prev" ? idx - 1 : idx + 1;
    if (idx < 0) idx = list.length - 1;
    if (idx >= list.length) idx = 0;
    const nextId = list[idx];
    if (!nextId) return;
    applySlot(slot, nextId);
  };
}

function safeMountLoadoutPicker() {
  try {
    mountLoadoutPicker();
  } catch (e) {
    console.error("Garage loadout UI failed:", e);
    showFatal(e);
  }
}
/** Keep preview canvas bitmap size in sync after viewport changes */
let equippedResizeTimer = 0;
window.addEventListener("resize", () => {
  window.clearTimeout(equippedResizeTimer);
  equippedResizeTimer = window.setTimeout(() => {
    const mount = document.getElementById("loadout-mount");
    const cv = mount?.querySelector?.("canvas[data-equipped-preview]");
    if (cv instanceof HTMLCanvasElement)
      renderEquippedComposite(cv, loadEffectiveLoadout());
  }, 120);
});
loadCharacterAtlas().catch(() => {});

btnTabPlay?.addEventListener("click", () => activateMenuTab("play"));
btnTabCharacter?.addEventListener("click", () =>
  activateMenuTab("character"),
);

game.setUIHooks({
  countdownEl,
  hudTime,
  hudLap,
  shellCount,
  bananaInv,
  boostInv,
  driftWrap,
  driftFill,
  driftMeterTrack,
  hudMode,
  hudRandomizer,
  hudRandomizerItem,
  hudPlace,
  hudDriftCur: hudDriftBoard,
  hudDriftCurVal,
  hudLives,
  hudLivesVal,
  homeShellsTotal,
  mapSessionShells,
  btnClaim,
  panelEnd,
  panelStart,
  endTitle,
  endTime,
  endBestLap,
  endDriftTime,
  endShellsN,
  endFinishPlace,
  endDailyRank,
  lbList,
  lbLabel,
  lbSub,
});
game.updateHomeShellsUI();

populateAdminTrackList();
safeMountLoadoutPicker();
window.addEventListener("otterkart-loadout-change", () => safeMountLoadoutPicker());

startImgNatural = { w: 1024, h: 572 };
mapImgNatural = { w: 1672, h: 941 };
installHotspotResizeWatchers();
void ensureStartImageSize().then(() => scheduleHotspotRelayout());
void ensureMapImageSize().then(() => scheduleHotspotRelayout());
scheduleHotspotRelayout();
window.setTimeout(scheduleHotspotRelayout, 50);
window.setTimeout(scheduleHotspotRelayout, 250);

function handleStartHotspotAction(action) {
  if (!document.body?.classList?.contains?.("otter-ui-start")) return;
  if (action === "start") enterMapFromStart({ demo: false });
  else if (action === "demo") enterMapFromStart({ demo: true });
  else if (action === "wallet") void handleWalletConnectHotspot();
}

function handleMapHotspotMode(mode) {
  if (!document.body?.classList?.contains?.("otter-ui-playtab")) return;
  if (document.body?.classList?.contains?.("otter-ui-garage")) return;
  if (document.body?.classList?.contains?.("otter-ui-admin-open")) return;
  if (mode === "garage") {
    activateMenuTab("character");
    return;
  }
  if (mode === "claim") {
    void handleClaimShells();
    return;
  }
  if (mode === "touge") game.trackId = "neo-touge";
  if (mode === "endless") game.trackId = "neo-touge";
  startRaceMode(/** @type {any} */ (mode));
}

/** Direct button clicks (primary) + cover hit-test on layer (fallback). */
function bindMenuHotspotClicks() {
  startMenuHotspots?.querySelectorAll("[data-start-action]").forEach((el) => {
    if (!(el instanceof HTMLElement)) return;
    el.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const action = el.getAttribute("data-start-action");
      if (action) handleStartHotspotAction(action);
    });
  });

  mapHotspots?.querySelectorAll("[data-map-mode]").forEach((el) => {
    if (!(el instanceof HTMLElement)) return;
    el.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const mode = el.getAttribute("data-map-mode");
      if (mode) handleMapHotspotMode(mode);
    });
  });
}

bindMenuHotspotClicks();

startMenuHotspots?.addEventListener(
  "pointerdown",
  (e) => {
    if (!document.body?.classList?.contains?.("otter-ui-start")) return;
    if (e.button !== 0) return;
    const iw = startImgNatural.w || 1024;
    const ih = startImgNatural.h || 572;
    const action = hitTestCoverHotspots(e.clientX, e.clientY, START_HOTSPOT_BOXES, iw, ih);
    if (!action) return;
    e.preventDefault();
    e.stopPropagation();
    handleStartHotspotAction(action);
  },
  { capture: true },
);

function hitTestMapHotspotMode(clientX, clientY) {
  if (isDesktopEmbedMapLayout() && mapHotspots) {
    for (const el of mapHotspots.querySelectorAll("[data-map-mode]")) {
      if (!(el instanceof HTMLElement)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      if (
        clientX >= r.left &&
        clientX <= r.right &&
        clientY >= r.top &&
        clientY <= r.bottom
      ) {
        return el.getAttribute("data-map-mode");
      }
    }
    return null;
  }
  const iw = mapImgNatural.w || 1672;
  const ih = mapImgNatural.h || 941;
  return hitTestCoverHotspots(clientX, clientY, MAP_HOTSPOT_BOXES, iw, ih);
}

function handleMapHotspotPointer(clientX, clientY) {
  const mode = hitTestMapHotspotMode(clientX, clientY);
  if (!mode) return false;
  handleMapHotspotMode(mode);
  return true;
}

mapHotspots?.addEventListener(
  "pointerdown",
  (e) => {
    if (!document.body?.classList?.contains?.("otter-ui-playtab")) return;
    if (document.body?.classList?.contains?.("otter-ui-garage")) return;
    if (e.button !== 0) return;
    if (!handleMapHotspotPointer(e.clientX, e.clientY)) return;
    e.preventDefault();
    e.stopPropagation();
  },
  { capture: true },
);

mapHotspots?.addEventListener(
  "touchend",
  (e) => {
    if (!document.body?.classList?.contains?.("otter-ui-playtab")) return;
    if (document.body?.classList?.contains?.("otter-ui-garage")) return;
    const t = e.changedTouches?.[0];
    if (!t) return;
    if (!handleMapHotspotPointer(t.clientX, t.clientY)) return;
    e.preventDefault();
    e.stopPropagation();
  },
  { capture: true, passive: false },
);

btnClaim?.addEventListener("click", () => {
  void handleClaimShells();
});

function layoutSettingsHotspots() {
  const panel = document.getElementById("settings-panel");
  if (!(panel instanceof HTMLElement)) return;
  const art = panel.querySelector(".settings-panel__art");
  const iw =
    (art instanceof HTMLImageElement && art.naturalWidth) || 1000;
  const ih =
    (art instanceof HTMLImageElement && art.naturalHeight) || 550;
  const pw = panel.clientWidth || iw;
  const ph = panel.clientHeight || ih;
  panel.querySelectorAll(".settings-panel__hotspot").forEach((el) => {
    if (!(el instanceof HTMLElement)) return;
    const ix = Number(el.dataset.ix);
    const iy = Number(el.dataset.iy);
    const iwBox = Number(el.dataset.iw);
    const ihBox = Number(el.dataset.ih);
    if (!Number.isFinite(ix) || !Number.isFinite(iy)) return;
    el.style.left = `${(ix / iw) * pw}px`;
    el.style.top = `${(iy / ih) * ph}px`;
    el.style.width = `${((iwBox || 0) / iw) * pw}px`;
    el.style.height = `${((ihBox || 0) / ih) * ph}px`;
  });
}

function setSettingsOpen(open) {
  if (!panelSettings) return;
  if (open) {
    if (panelAdmin) panelAdmin.classList.add("hidden");
    btnAdminOpen?.setAttribute("aria-expanded", "false");
  }
  panelSettings.classList.toggle("hidden", !open);
  modalBackdrop?.classList.toggle("hidden", !open);
  if (open) {
    requestAnimationFrame(() => layoutSettingsHotspots());
    const art = document.querySelector("#settings-panel .settings-panel__art");
    if (art instanceof HTMLImageElement && !art.complete) {
      art.addEventListener("load", () => layoutSettingsHotspots(), { once: true });
    }
  }
}

btnAdminOpen?.addEventListener("click", () => setAdminPanelOpen(true));
btnAdminClose?.addEventListener("click", () => setAdminPanelOpen(false));
adminTrackList?.addEventListener("click", (e) => {
  const t = e.target.closest("[data-admin-track]");
  if (!(t instanceof HTMLButtonElement)) return;
  const tid = t.getAttribute("data-admin-track");
  if (!tid) return;
  startAdminRace(tid);
});
modalBackdrop?.addEventListener("click", () => {
  if (panelAdmin && !panelAdmin.classList.contains("hidden"))
    setAdminPanelOpen(false);
});

btnSettings?.addEventListener("click", () => setSettingsOpen(true));
btnSettingsClose?.addEventListener("click", () => setSettingsOpen(false));
btnSettingsMenu?.addEventListener("click", () => {
  setSettingsOpen(false);
  returnToMapHome();
});

game.resize();
window.addEventListener("resize", () => {
  game.resize();
  scheduleHotspotRelayout();
});

function startRaceMode(mode) {
  try {
    /** Do not block on images — broken file:// or slow loads would freeze the menu */
    void loadCharacterAtlas();
    hideMapClaimBar();
    mapHotspots?.setAttribute?.("aria-hidden", "true");
    game.startFromMenu(mode);
    modalBackdrop?.classList?.add?.("hidden");
  } catch (e) {
    showFatal(e);
  }
}

btnPractice?.addEventListener("click", () => {
  startRaceMode("practice");
});
btnDaily?.addEventListener("click", () => {
  startRaceMode("daily");
});
btnGP?.addEventListener("click", () => {
  startRaceMode("grandprix");
});
btnTouge?.addEventListener("click", () => {
  game.trackId = "neo-touge";
  startRaceMode("touge");
});
btnEndless?.addEventListener("click", () => {
  game.trackId = "neo-touge";
  startRaceMode("endless");
});
btnRestart?.addEventListener("click", () => {
  try {
    game.requestRestartRace();
    modalBackdrop?.classList?.add?.("hidden");
  } catch (e) {
    showFatal(e);
  }
});
btnMainMenu?.addEventListener("click", () => {
  try {
    returnToMapHome();
  } catch (e) {
    showFatal(e);
  }
});

// Garage overlay hotspot: back to Map (Play tab)
garageHotspots?.addEventListener("click", (e) => {
  const btn = e.target.closest(".garage-hotspot--to-map");
  if (!(btn instanceof HTMLButtonElement)) return;
  activateMenuTab("play");
});

requestAnimationFrame(game.loop);

window.addEventListener("resize", () => {
  if (panelSettings && !panelSettings.classList.contains("hidden")) {
    layoutSettingsHotspots();
  }
});

/** Show backdrop whenever end-results panel is visible. */
if (panelEnd && modalBackdrop) {
  const syncBackdrop = () => {
    const vis = !panelEnd.classList.contains("hidden");
    modalBackdrop.classList.toggle("hidden", !vis);
  };
  new MutationObserver(syncBackdrop).observe(panelEnd, {
    attributes: true,
    attributeFilter: ["class"],
  });
  syncBackdrop();
}

initOtterKartMusic();
initTouchControls(game);
applyHudViewportVars();

window.__otterKartBooted = true;
