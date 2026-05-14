/**
 * Gamepad → Shell Rush (KeyboardEvent codes matching bundled LQ / Gs).
 * Right stick → synthetic mousemove while pointer lock is active.
 * Left stick: smoothed axes + hysteresis so WASD mapping feels less “90° snap”.
 */
(function () {
  var STICK_SMOOTH = 0.26;
  var AXIS_ON = 0.2;
  var AXIS_OFF = 0.1;
  var LOOK_DEAD = 0.18;
  var LOOK_SENS = 52;
  var LOOK_SMOOTH = 0.32;

  var KEY_META = {
    KeyW: { key: 'w', code: 'KeyW' },
    KeyS: { key: 's', code: 'KeyS' },
    KeyA: { key: 'a', code: 'KeyA' },
    KeyD: { key: 'd', code: 'KeyD' },
    Space: { key: ' ', code: 'Space' },
    ShiftLeft: { key: 'Shift', code: 'ShiftLeft' },
    KeyF: { key: 'f', code: 'KeyF' },
    KeyG: { key: 'g', code: 'KeyG' },
    KeyQ: { key: 'q', code: 'KeyQ' },
    KeyE: { key: 'e', code: 'KeyE' },
  };

  var held = Object.create(null);
  var momentaryDown = Object.create(null);

  var sm0 = 0;
  var sm1 = 0;
  var latF = false;
  var latB = false;
  var latL = false;
  var latR = false;
  var lr0 = 0;
  var lr1 = 0;

  function fire(type, name) {
    var m = KEY_META[name];
    if (!m) return;
    document.dispatchEvent(
      new KeyboardEvent(type, {
        key: m.key,
        code: m.code,
        bubbles: true,
        cancelable: true,
      }),
    );
  }

  function setHeld(name, want) {
    if (want && !held[name]) {
      held[name] = true;
      fire('keydown', name);
    } else if (!want && held[name]) {
      held[name] = false;
      fire('keyup', name);
    }
  }

  function pulse(name, want) {
    if (want && !momentaryDown[name]) {
      momentaryDown[name] = true;
      fire('keydown', name);
    } else if (!want && momentaryDown[name]) {
      momentaryDown[name] = false;
      fire('keyup', name);
    }
  }

  function resetMovementState() {
    sm0 = 0;
    sm1 = 0;
    latF = false;
    latB = false;
    latL = false;
    latR = false;
    lr0 = 0;
    lr1 = 0;
  }

  function releaseAll() {
    Object.keys(KEY_META).forEach(function (name) {
      if (held[name]) setHeld(name, false);
      if (momentaryDown[name]) pulse(name, false);
    });
    resetMovementState();
  }

  function pressed(gp, index) {
    var b = gp.buttons && gp.buttons[index];
    if (!b) return false;
    if (typeof b === 'object') return !!(b.pressed || (typeof b.value === 'number' && b.value > 0.5));
    return !!b;
  }

  function axis(gp, i) {
    var v = gp.axes && gp.axes[i];
    return typeof v === 'number' && !isNaN(v) ? v : 0;
  }

  function pickPad(list) {
    if (!list || !list.length) return null;
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].connected) return list[i];
    }
    return null;
  }

  /** Stick up / negative axis1 → forward */
  function schmittNeg(sm, prev) {
    if (sm < -AXIS_ON) return true;
    if (sm > -AXIS_OFF) return false;
    return prev;
  }

  /** Stick down / positive axis1 → backward */
  function schmittPos(sm, prev) {
    if (sm > AXIS_ON) return true;
    if (sm < AXIS_OFF) return false;
    return prev;
  }

  function applyRightStickLook(gp) {
    var lockEl = document.pointerLockElement;
    if (!lockEl) return;

    var rx = axis(gp, 2);
    var ry = axis(gp, 3);
    lr0 += (rx - lr0) * LOOK_SMOOTH;
    lr1 += (ry - lr1) * LOOK_SMOOTH;
    if (Math.abs(lr0) < LOOK_DEAD && Math.abs(lr1) < LOOK_DEAD) return;

    var mx = lr0 * LOOK_SENS;
    var my = lr1 * LOOK_SENS;
    var r = lockEl.getBoundingClientRect ? lockEl.getBoundingClientRect() : { left: 0, top: 0, width: 0, height: 0 };
    var cx = r.left + r.width * 0.5;
    var cy = r.top + r.height * 0.5;

    lockEl.dispatchEvent(
      new MouseEvent('mousemove', {
        bubbles: true,
        cancelable: true,
        view: window,
        movementX: mx,
        movementY: my,
        clientX: cx,
        clientY: cy,
      }),
    );
  }

  function tick() {
    var list = navigator.getGamepads && navigator.getGamepads();
    var gp = pickPad(list);

    if (!gp) {
      releaseAll();
      requestAnimationFrame(tick);
      return;
    }

    var ax0 = axis(gp, 0);
    var ax1 = axis(gp, 1);
    sm0 += (ax0 - sm0) * STICK_SMOOTH;
    sm1 += (ax1 - sm1) * STICK_SMOOTH;

    latF = schmittNeg(sm1, latF);
    latB = schmittPos(sm1, latB);
    latL = schmittNeg(sm0, latL);
    latR = schmittPos(sm0, latR);

    var forward = pressed(gp, 12) || latF;
    var backward = pressed(gp, 13) || latB;
    var left = pressed(gp, 14) || latL;
    var right = pressed(gp, 15) || latR;

    setHeld('KeyW', forward);
    setHeld('KeyS', backward);
    setHeld('KeyA', left);
    setHeld('KeyD', right);

    setHeld('ShiftLeft', pressed(gp, 4));

    pulse('Space', pressed(gp, 0));
    pulse('KeyG', pressed(gp, 1));
    pulse('KeyF', pressed(gp, 2));
    pulse('KeyE', pressed(gp, 3));
    pulse('KeyQ', pressed(gp, 5));

    applyRightStickLook(gp);

    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
})();
