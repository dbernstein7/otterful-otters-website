/**
 * Maps standard gamepad (Xbox / PlayStation layout) to the same KeyboardEvent
 * codes Otter Shell Rush listens for on document (see bundled LQ / Gs).
 * Camera remains mouse-only.
 */
(function () {
  var DEADZONE = 0.38;

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

  /** Keys we sent keydown for — only those get keyup from this bridge */
  var held = Object.create(null);
  /** Momentary actions: track down state for keyup pairing */
  var momentaryDown = Object.create(null);

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

  function releaseAll() {
    Object.keys(KEY_META).forEach(function (name) {
      if (held[name]) setHeld(name, false);
      if (momentaryDown[name]) pulse(name, false);
    });
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
    var forward = ax1 < -DEADZONE || pressed(gp, 12);
    var backward = ax1 > DEADZONE || pressed(gp, 13);
    var left = ax0 < -DEADZONE || pressed(gp, 14);
    var right = ax0 > DEADZONE || pressed(gp, 15);

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

    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
})();
