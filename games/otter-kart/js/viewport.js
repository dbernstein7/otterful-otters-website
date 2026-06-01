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
}

export function clearEmbedViewport() {
  embedViewport = null;
}

export function isEmbedded() {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

/** Same dimensions for canvas, cover backgrounds, and hotspot layout. */
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
