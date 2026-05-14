/**
 * Gamepad → Shell Rush (same KeyboardEvent codes as bundled LQ / Gs).
 * Right stick → synthetic mousemove (movementX/Y) while pointer lock is active.
 */
(function () {
  var DEADZONE = 0.38;
  var LOOK_DEAD = 0.2;
  var LOOK_SENS = 56;

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

  /**
   * Camera reads movementX/Y only when pointer is locked (or mouse drag).
   * Dispatch on the locked element so the game’s canvas/document listener receives it.
   */
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

  /* ——— Controls reference (cog) ——— */
  function injectControlsUi() {
    if (document.getElementById('osr-controls-root')) return;

    var css =
      '#osr-controls-root{position:fixed;left:10px;bottom:10px;z-index:1253;font-family:system-ui,Segoe UI,Roboto,sans-serif;font-size:13px;-webkit-tap-highlight-color:transparent}' +
      '#osr-controls-toggle{width:44px;height:44px;border-radius:12px;border:1px solid rgba(255,255,255,.22);background:rgba(15,23,42,.88);color:#e0f2fe;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 28px rgba(0,0,0,.45);backdrop-filter:blur(10px);transition:transform .15s ease,background .15s}' +
      '#osr-controls-toggle:hover{background:rgba(30,41,59,.92);transform:scale(1.04)}' +
      '#osr-controls-toggle svg{width:22px;height:22px;opacity:.95}' +
      '#osr-controls-backdrop{position:fixed;inset:0;z-index:1251;background:rgba(2,6,23,.45);backdrop-filter:blur(2px);opacity:0;pointer-events:none;transition:opacity .2s ease}' +
      '#osr-controls-backdrop.osr-open{opacity:1;pointer-events:auto}' +
      '#osr-controls-panel{position:fixed;left:10px;bottom:62px;z-index:1252;width:min(92vw,380px);max-height:min(72vh,440px);overflow:auto;border-radius:16px;border:1px solid rgba(255,255,255,.14);background:rgba(15,23,42,.96);color:#f1f5f9;box-shadow:0 16px 48px rgba(0,0,0,.55);backdrop-filter:blur(12px);transform:translateY(8px);opacity:0;pointer-events:none;transition:opacity .2s ease,transform .2s ease}' +
      '#osr-controls-panel.osr-open{opacity:1;pointer-events:auto;transform:translateY(0)}' +
      '#osr-controls-panel h2{margin:0 0 10px;font-size:15px;font-weight:800;letter-spacing:.04em;color:#a5f3fc}' +
      '#osr-controls-panel h3{margin:14px 0 6px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:rgba(165,243,252,.75)}' +
      '#osr-controls-panel ul{margin:0;padding-left:1.1rem;line-height:1.55}' +
      '#osr-controls-panel li{margin:3px 0}' +
      '#osr-controls-hint{margin:12px 0 0;padding:10px;border-radius:10px;background:rgba(0,0,0,.28);font-size:11px;line-height:1.45;color:rgba(226,232,240,.88)}';

    var st = document.createElement('style');
    st.textContent = css;
    document.head.appendChild(st);

    var root = document.createElement('div');
    root.id = 'osr-controls-root';

    var gearSvg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/>' +
      '<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z"/>' +
      '</svg>';

    var btn = document.createElement('button');
    btn.id = 'osr-controls-toggle';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Show keyboard and controller controls');
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = gearSvg;

    var backdrop = document.createElement('div');
    backdrop.id = 'osr-controls-backdrop';
    backdrop.setAttribute('aria-hidden', 'true');

    var panel = document.createElement('div');
    panel.id = 'osr-controls-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'osr-controls-title');
    panel.innerHTML =
      '<div style="padding:14px 16px 16px">' +
      '<h2 id="osr-controls-title">Controls</h2>' +
      '<h3>Keyboard &amp; mouse</h3>' +
      '<ul>' +
      '<li><strong>W A S D</strong> or <strong>arrow keys</strong> — move</li>' +
      '<li><strong>Shift</strong> — sprint</li>' +
      '<li><strong>Space</strong> — jump</li>' +
      '<li><strong>F</strong> — punch &nbsp;·&nbsp; <strong>G</strong> — kick</li>' +
      '<li><strong>Q</strong> / <strong>C</strong> — melee &nbsp;·&nbsp; <strong>E</strong> — cast</li>' +
      '<li><strong>Mouse</strong> — look (after pointer lock) &nbsp;·&nbsp; <strong>Wheel</strong> — zoom distance</li>' +
      '<li><strong>M</strong> — music panel &nbsp;·&nbsp; on-screen Jump / Kick buttons also work</li>' +
      '</ul>' +
      '<h3>Controller (Xbox / PlayStation layout)</h3>' +
      '<ul>' +
      '<li><strong>Left stick</strong> or <strong>D-pad</strong> — move</li>' +
      '<li><strong>LB</strong> — sprint</li>' +
      '<li><strong>A</strong> (Cross) — jump &nbsp;·&nbsp; <strong>B</strong> (Circle) — kick</li>' +
      '<li><strong>X</strong> (Square) — punch &nbsp;·&nbsp; <strong>Y</strong> (Triangle) — cast</li>' +
      '<li><strong>RB</strong> — melee</li>' +
      '<li><strong>Right stick</strong> — look (same as mouse; works while pointer is locked on the game)</li>' +
      '</ul>' +
      '<p id="osr-controls-hint" class="osr-controls-hint">Click the game after <strong>Start run</strong> so the browser locks the pointer; then the right stick steers the camera. Press <strong>Esc</strong> to exit pointer lock.</p>' +
      '</div>';

    root.appendChild(btn);
    document.body.appendChild(backdrop);
    document.body.appendChild(panel);
    document.body.appendChild(root);
    /* stacking: backdrop 1251 < panel 1252 < cog root 1253 */

    function setOpen(open) {
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      backdrop.classList.toggle('osr-open', open);
      panel.classList.toggle('osr-open', open);
      backdrop.setAttribute('aria-hidden', open ? 'false' : 'true');
    }

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = !panel.classList.contains('osr-open');
      setOpen(open);
    });

    backdrop.addEventListener('click', function () {
      setOpen(false);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && panel.classList.contains('osr-open')) {
        setOpen(false);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectControlsUi);
  } else {
    injectControlsUi();
  }

  requestAnimationFrame(tick);
})();
