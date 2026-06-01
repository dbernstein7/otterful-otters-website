/** @typedef {{ x0: number, y0: number, outerD: number, cxScreen: number, cyScreen: number, mapCy: number, outerR: number }} TouchMinimapLayout */

const MINIMAP_RING_MAP_OFFSET_Y = -5;

function isTouchControlsVisible() {
  if (typeof document === "undefined") return false;
  if (document.body.classList.contains("otter-ui-menu")) return false;
  const root = document.getElementById("touch-controls");
  if (!(root instanceof HTMLElement)) return false;
  return getComputedStyle(root).display !== "none";
}

/**
 * Map #touch-minimap-slot DOM rect → canvas pixels for drawGpCourseMinimap.
 * @param {HTMLCanvasElement | null | undefined} canvas
 * @returns {TouchMinimapLayout | null}
 */
export function getTouchMinimapLayout(canvas) {
  if (!isTouchControlsVisible()) return null;
  const slot = document.getElementById("touch-minimap-slot");
  if (!(slot instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement)) {
    return null;
  }
  const sr = slot.getBoundingClientRect();
  if (sr.width < 8 || sr.height < 8) return null;
  const cr = canvas.getBoundingClientRect();
  if (cr.width < 1 || cr.height < 1) return null;

  const scaleX = canvas.width / cr.width;
  const scaleY = canvas.height / cr.height;
  const outerD = Math.min(sr.width * scaleX, sr.height * scaleY);
  const outerR = outerD * 0.5;
  const cxScreen = (sr.left + sr.width * 0.5 - cr.left) * scaleX;
  const cyScreen = (sr.top + sr.height * 0.5 - cr.top) * scaleY;
  const x0 = cxScreen - outerR;
  const y0 = cyScreen - outerR;
  const mapCy = cyScreen + MINIMAP_RING_MAP_OFFSET_Y;

  return { x0, y0, outerD, cxScreen, cyScreen, mapCy, outerR };
}

/**
 * On-screen drive controls for phones / tablets (no gamepad).
 * @param {{ touch: { gas: boolean, brake: boolean, drift: boolean, steer: number }, canvas?: HTMLCanvasElement }} game
 */
export function initTouchControls(game) {
  const root = document.getElementById("touch-controls");
  if (!(root instanceof HTMLElement)) return;

  game.touch = {
    gas: false,
    brake: false,
    drift: false,
    steer: 0,
  };

  const bindHold = (selector, on, off) => {
    const el = root.querySelector(selector);
    if (!(el instanceof HTMLElement)) return;
    const down = (e) => {
      e.preventDefault();
      on();
    };
    const up = (e) => {
      e.preventDefault();
      off();
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("pointerleave", up);
    el.addEventListener("contextmenu", (e) => e.preventDefault());
  };

  bindHold(
    ".touch-btn--gas",
    () => {
      game.touch.gas = true;
    },
    () => {
      game.touch.gas = false;
    },
  );
  bindHold(
    ".touch-btn--brake",
    () => {
      game.touch.brake = true;
    },
    () => {
      game.touch.brake = false;
    },
  );
  bindHold(
    ".touch-btn--drift",
    () => {
      game.touch.drift = true;
    },
    () => {
      game.touch.drift = false;
    },
  );

  initTouchJoystick(game, root);
}

/**
 * @param {{ touch: { steer: number } }} game
 * @param {HTMLElement} root
 */
function initTouchJoystick(game, root) {
  const zone = root.querySelector(".touch-joystick");
  const stick = root.querySelector(".touch-joystick__stick");
  if (!(zone instanceof HTMLElement) || !(stick instanceof HTMLElement)) return;

  /** @type {number | null} */
  let activeId = null;

  const maxRadius = () => {
    const r = zone.getBoundingClientRect();
    return Math.max(28, Math.min(r.width, r.height) * 0.38);
  };

  const resetStick = () => {
    activeId = null;
    game.touch.steer = 0;
    stick.style.transform = "translate(-50%, -50%)";
    zone.classList.remove("touch-joystick--active");
  };

  const moveStick = (clientX, clientY) => {
    const rect = zone.getBoundingClientRect();
    const cx = rect.left + rect.width * 0.5;
    const cy = rect.top + rect.height * 0.5;
    const maxR = maxRadius();
    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > maxR) {
      dx = (dx / dist) * maxR;
      dy = (dy / dist) * maxR;
    }
    stick.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    game.touch.steer = Math.max(-1, Math.min(1, dx / maxR));
    zone.classList.add("touch-joystick--active");
  };

  zone.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    try {
      zone.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    activeId = e.pointerId;
    moveStick(e.clientX, e.clientY);
  });

  zone.addEventListener("pointermove", (e) => {
    if (activeId !== e.pointerId) return;
    e.preventDefault();
    moveStick(e.clientX, e.clientY);
  });

  const end = (e) => {
    if (activeId !== e.pointerId) return;
    e.preventDefault();
    try {
      zone.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    resetStick();
  };

  zone.addEventListener("pointerup", end);
  zone.addEventListener("pointercancel", end);
  zone.addEventListener("lostpointercapture", () => {
    if (activeId != null) resetStick();
  });
  zone.addEventListener("contextmenu", (e) => e.preventDefault());
}

/** @param {{ touch?: { gas: boolean, brake: boolean, drift: boolean, steer: number } }} game */
export function readTouchInput(game) {
  const t = game.touch;
  if (!t) {
    return { gas: false, brake: false, steer: 0, drift: false };
  }
  const steer = Math.max(-1, Math.min(1, Number(t.steer) || 0));
  return {
    gas: Boolean(t.gas),
    brake: Boolean(t.brake),
    steer,
    drift: Boolean(t.drift),
  };
}
