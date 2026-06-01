/** Native menu / map art aspect (landscape gameplay). */
export const GAME_ASPECT_W = 1672;
export const GAME_ASPECT_H = 941;
const GAME_ASPECT = GAME_ASPECT_W / GAME_ASPECT_H;

/** @type {{ vw: number, vh: number } | null} */
let embedViewport = null;

/**
 * Parent embed page reports the iframe shell size (ResizeObserver).
 * @param {number} width
 * @param {number} height
 */
export function setEmbedViewport(width, height) {
  const w = Math.round(Number(width));
  const h = Math.round(Number(height));
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 1 || h < 1) return;
  embedViewport = { vw: w, vh: h };
  applyEmbedViewportToDocument();
  applyGameViewportStyles();
}

export function clearEmbedViewport() {
  embedViewport = null;
  if (typeof document === "undefined") return;
  for (const el of [document.documentElement, document.body]) {
    if (!(el instanceof HTMLElement)) continue;
    el.style.removeProperty("width");
    el.style.removeProperty("height");
    el.style.removeProperty("overflow");
  }
  applyGameViewportStyles();
}

export function isEmbedded() {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

/** Lock iframe document to the shell pixel size so cover art = hotspot math. */
function applyEmbedViewportToDocument() {
  if (!embedViewport || !isEmbedded()) return;
  const { vw, vh } = embedViewport;
  const w = `${vw}px`;
  const h = `${vh}px`;
  document.documentElement.style.width = w;
  document.documentElement.style.height = h;
  document.documentElement.style.overflow = "hidden";
  document.body.style.width = w;
  document.body.style.height = h;
  document.body.style.overflow = "hidden";
  document.body.style.margin = "0";
}

export function getEmbedViewport() {
  return embedViewport ? { ...embedViewport } : null;
}

/** Browser / iframe bounds before aspect fitting. */
export function getAvailableViewportSize() {
  if (embedViewport) return { vw: embedViewport.vw, vh: embedViewport.vh };

  const vv = window.visualViewport;
  const vw = Math.round(
    vv?.width ?? document.documentElement.clientWidth ?? window.innerWidth ?? 1,
  );
  const vh = Math.round(
    vv?.height ?? document.documentElement.clientHeight ?? window.innerHeight ?? 1,
  );
  return { vw: Math.max(1, vw), vh: Math.max(1, vh) };
}

/**
 * Largest 1672×941 rect centered inside the available viewport (letterboxing).
 * @returns {{ vw: number, vh: number, left: number, top: number, availW: number, availH: number }}
 */
export function getGameViewportLayout() {
  const { vw: availW, vh: availH } = getAvailableViewportSize();
  let gameW;
  let gameH;
  if (availW / availH > GAME_ASPECT) {
    gameH = availH;
    gameW = Math.round(gameH * GAME_ASPECT);
  } else {
    gameW = availW;
    gameH = Math.round(gameW / GAME_ASPECT);
  }
  const left = Math.round((availW - gameW) * 0.5);
  const top = Math.round((availH - gameH) * 0.5);
  return {
    vw: Math.max(1, gameW),
    vh: Math.max(1, gameH),
    left,
    top,
    availW,
    availH,
  };
}

/** Canvas / cover / hotspot layout size (fitted landscape). */
export function getGameViewportSize() {
  const { vw, vh } = getGameViewportLayout();
  return { vw, vh };
}

/** Map screen coords → coords inside the fitted game rect. */
export function clientToGameCoords(clientX, clientY) {
  const { left, top } = getGameViewportLayout();
  return { x: clientX - left, y: clientY - top };
}

export function isPortraitViewport() {
  const { availW, availH } = getGameViewportLayout();
  return availH > availW;
}

/** Push CSS variables + class so fixed layers clip to the game rect. */
export function applyGameViewportStyles() {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const { vw, vh, left, top, availW, availH } = getGameViewportLayout();
  root.style.setProperty("--otter-game-w", `${vw}px`);
  root.style.setProperty("--otter-game-h", `${vh}px`);
  root.style.setProperty("--otter-game-left", `${left}px`);
  root.style.setProperty("--otter-game-top", `${top}px`);
  root.style.setProperty("--otter-avail-w", `${availW}px`);
  root.style.setProperty("--otter-avail-h", `${availH}px`);
  root.classList.add("otter-viewport-fit");
  document.body?.classList.toggle("otter-portrait", isPortraitViewport());
}

let viewportFitInstalled = false;

/** Resize / visualViewport → refit game area. */
export function installViewportFit() {
  if (viewportFitInstalled || typeof window === "undefined") return;
  viewportFitInstalled = true;
  const onFit = () => applyGameViewportStyles();
  applyGameViewportStyles();
  window.addEventListener("resize", onFit);
  window.visualViewport?.addEventListener("resize", onFit);
  window.visualViewport?.addEventListener("scroll", onFit);
  if (typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(onFit);
    ro.observe(document.documentElement);
    if (document.body) ro.observe(document.body);
  }
}
