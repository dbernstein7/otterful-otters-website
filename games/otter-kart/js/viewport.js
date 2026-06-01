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

/** Canvas, menu cover, and hotspots — iframe shell or full window. */
export function getGameViewportSize() {
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
