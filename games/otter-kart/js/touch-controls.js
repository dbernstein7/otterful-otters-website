/**
 * On-screen drive controls for phones / tablets (no gamepad).
 * @param {{ touch: { gas: boolean, brake: boolean, steerL: boolean, steerR: boolean, drift: boolean } }} game
 */
export function initTouchControls(game) {
  const root = document.getElementById("touch-controls");
  if (!(root instanceof HTMLElement)) return;

  game.touch = {
    gas: false,
    brake: false,
    steerL: false,
    steerR: false,
    drift: false,
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
    ".touch-btn--left",
    () => {
      game.touch.steerL = true;
    },
    () => {
      game.touch.steerL = false;
    },
  );
  bindHold(
    ".touch-btn--right",
    () => {
      game.touch.steerR = true;
    },
    () => {
      game.touch.steerR = false;
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
}

/** @param {{ touch?: { gas: boolean, brake: boolean, steerL: boolean, steerR: boolean, drift: boolean } }} game */
export function readTouchInput(game) {
  const t = game.touch;
  if (!t) {
    return { gas: false, brake: false, steer: 0, drift: false };
  }
  let steer = 0;
  if (t.steerL) steer -= 1;
  if (t.steerR) steer += 1;
  return {
    gas: Boolean(t.gas),
    brake: Boolean(t.brake),
    steer,
    drift: Boolean(t.drift),
  };
}
