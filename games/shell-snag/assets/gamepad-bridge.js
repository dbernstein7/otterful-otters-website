/**
 * Gamepad → Shell Rush (KeyboardEvent codes matching bundled LQ / Gs).
 * Right stick → mousemove with movementX/Y only while pointer is locked and
 * the stick is past a dead zone (no smoothing — smoothing caused per-frame
 * events and heavy lag).
 */
(function () {
  var DEADZONE = 0.35;
  var LOOK_DEAD = 0.22;
  var LOOK_SENS = 52;

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

  function applyRightStickLook(gp) {
    var lockEl = document.pointerLockElement;
    if (!lockEl) return;

    var rx = axis(gp, 2);
    var ry = axis(gp, 3);
    if (Math.abs(rx) < LOOK_DEAD && Math.abs(ry) < LOOK_DEAD) return;

    var mx = rx * LOOK_SENS;
    var my = ry * LOOK_SENS;
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

    applyRightStickLook(gp);

    requestAnimationFrame(tick);
  }

  /** Cog + panel: bottom-left of iframe (no backdrop-filter — GPU cost). */
  function injectControlsUi() {
    if (document.getElementById('osr-ctrl-root')) return;

    var css =
      '#osr-ctrl-root{position:fixed;left:10px;bottom:10px;z-index:1253;font-family:system-ui,Segoe UI,Roboto,sans-serif;font-size:13px;-webkit-tap-highlight-color:transparent}' +
      '#osr-ctrl-btn{width:44px;height:44px;border-radius:12px;border:1px solid rgba(255,255,255,.2);background:rgba(15,23,42,.92);color:#e0f2fe;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(0,0,0,.4)}' +
      '#osr-ctrl-btn:hover{background:rgba(30,41,59,.95)}' +
      '#osr-ctrl-btn svg{width:22px;height:22px}' +
      '#osr-ctrl-scrim{position:fixed;inset:0;z-index:1251;background:rgba(2,6,23,.5);opacity:0;pointer-events:none;transition:opacity .15s ease}' +
      '#osr-ctrl-scrim.osr-on{opacity:1;pointer-events:auto}' +
      '#osr-ctrl-panel{position:fixed;left:10px;bottom:62px;z-index:1252;box-sizing:border-box;width:min(92vw,360px);max-height:min(70vh,400px);overflow:auto;padding:14px 16px 16px;border-radius:14px;border:1px solid rgba(255,255,255,.15);background:rgba(15,23,42,.97);color:#e2e8f0;box-shadow:0 12px 40px rgba(0,0,0,.55);opacity:0;pointer-events:none;transform:translateY(6px);transition:opacity .15s ease,transform .15s ease}' +
      '#osr-ctrl-panel.osr-on{opacity:1;pointer-events:auto;transform:translateY(0)}' +
      '#osr-ctrl-panel h2{margin:0 0 10px;font-size:16px;font-weight:800;color:#7dd3fc}' +
      '#osr-ctrl-panel h3{margin:12px 0 6px;font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:rgba(125,211,252,.85)}' +
      '#osr-ctrl-panel ul{margin:0;padding-left:1.05rem;line-height:1.5}' +
      '#osr-ctrl-panel li{margin:2px 0}' +
      '#osr-ctrl-foot{margin-top:12px;padding:8px 10px;font-size:11px;line-height:1.45;color:rgba(226,232,240,.88);background:rgba(0,0,0,.25);border-radius:8px}';

    var st = document.createElement('style');
    st.textContent = css;
    document.head.appendChild(st);

    var root = document.createElement('div');
    root.id = 'osr-ctrl-root';

    var btn = document.createElement('button');
    btn.id = 'osr-ctrl-btn';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Game controls');
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>';

    var scrim = document.createElement('div');
    scrim.id = 'osr-ctrl-scrim';
    scrim.setAttribute('aria-hidden', 'true');

    var panel = document.createElement('div');
    panel.id = 'osr-ctrl-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'osr-ctrl-title');
    panel.innerHTML =
      '<h2 id="osr-ctrl-title">Controls</h2>' +
      '<h3>Keyboard &amp; mouse</h3>' +
      '<ul>' +
      '<li><b>W A S D</b> or arrows — move · <b>Shift</b> sprint · <b>Space</b> jump</li>' +
      '<li><b>F</b> punch · <b>G</b> kick · <b>Q</b> / <b>C</b> melee · <b>E</b> cast</li>' +
      '<li>Mouse look (pointer lock) · wheel zoom · <b>M</b> music</li>' +
      '</ul>' +
      '<h3>Gamepad</h3>' +
      '<ul>' +
      '<li>Left stick / D-pad — move · <b>LB</b> sprint</li>' +
      '<li><b>A</b> jump · <b>B</b> kick · <b>X</b> punch · <b>Y</b> cast · <b>RB</b> melee</li>' +
      '<li>Right stick — look (while pointer locked; click game after Start)</li>' +
      '</ul>' +
      '<p id="osr-ctrl-foot" class="osr-ctrl-foot">Press any controller button once so the browser detects it. <b>Esc</b> exits pointer lock.</p>';

    root.appendChild(btn);
    document.body.appendChild(scrim);
    document.body.appendChild(panel);
    document.body.appendChild(root);

    function setOpen(on) {
      btn.setAttribute('aria-expanded', on ? 'true' : 'false');
      scrim.classList.toggle('osr-on', on);
      panel.classList.toggle('osr-on', on);
      scrim.setAttribute('aria-hidden', on ? 'false' : 'true');
    }

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      setOpen(!panel.classList.contains('osr-on'));
    });
    scrim.addEventListener('click', function () {
      setOpen(false);
    });
    panel.addEventListener('click', function (e) {
      e.stopPropagation();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && panel.classList.contains('osr-on')) setOpen(false);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectControlsUi);
  } else {
    injectControlsUi();
  }

  requestAnimationFrame(tick);
})();
