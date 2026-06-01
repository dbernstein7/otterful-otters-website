/**
 * In-game background music for OtterKart (files under /games/otter-kart/music/).
 */

const TRACKS = [
  { file: "pixel-drift-1.mp3", label: "Pixel Drift I" },
  { file: "pixel-drift-2.mp3", label: "Pixel Drift II" },
  { file: "night-bus-slow-motion-1.mp3", label: "Night Bus I" },
  { file: "night-bus-slow-motion-2.mp3", label: "Night Bus II" },
  { file: "midnight-bus-ride.mp3", label: "Midnight Bus Ride" },
  { file: "soft-echoes-3am.mp3", label: "Soft Echoes 3am" },
  { file: "paper-rain-monday.mp3", label: "Paper Rain Monday" },
];

const STORAGE_KEY = "otterKartMusic";

function resolveTrackUrl(file) {
  return new URL(`music/${file}`, document.baseURI || window.location.href).href;
}

function loadPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function savePrefs(prefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore
  }
}

/**
 * Mount in-game music controls (HUD button + panel). Call once from main.js.
 */
export function initOtterKartMusic() {
  const btn = document.getElementById("btn-music");
  const panel = document.getElementById("music-panel");
  if (!(btn instanceof HTMLButtonElement) || !(panel instanceof HTMLElement)) return;

  const prefs = loadPrefs() || {};
  let trackIndex = Number.isFinite(prefs.trackIndex)
    ? Math.min(Math.max(0, prefs.trackIndex), TRACKS.length - 1)
    : 0;
  let volume = Number.isFinite(prefs.volume) ? Math.min(1, Math.max(0, prefs.volume)) : 0.45;
  let muted = !!prefs.muted;
  let paused = prefs.paused === true;
  let panelOpen = !!prefs.panelOpen;
  let unlocked = false;
  let switching = false;

  const audio = new Audio();
  audio.loop = false;
  audio.preload = "auto";

  const titleEl = panel.querySelector(".music-panel__title");
  const metaEl = panel.querySelector(".music-panel__meta");
  const playBtn = panel.querySelector("[data-music-play]");
  const prevBtn = panel.querySelector("[data-music-prev]");
  const nextBtn = panel.querySelector("[data-music-next]");
  const muteBtn = panel.querySelector("[data-music-mute]");
  const closeBtn = panel.querySelector("[data-music-close]");
  const volInput = panel.querySelector("[data-music-volume]");

  function persist() {
    savePrefs({ trackIndex, volume, muted, paused, panelOpen });
  }

  function applyVolume() {
    audio.volume = muted ? 0 : volume;
  }

  function syncLabels() {
    const t = TRACKS[trackIndex];
    if (titleEl) titleEl.textContent = t.label;
    if (metaEl) {
      metaEl.textContent = `Track ${trackIndex + 1} / ${TRACKS.length}`;
    }
    if (playBtn instanceof HTMLButtonElement) {
      playBtn.textContent = paused ? "▶ Play" : "❚❚ Pause";
    }
    if (muteBtn instanceof HTMLButtonElement) {
      muteBtn.textContent = muted ? "Unmute" : "Mute";
    }
    if (volInput instanceof HTMLInputElement) {
      volInput.value = String(muted ? 0 : volume);
    }
  }

  function markUnlocked() {
    unlocked = true;
  }

  /** @returns {Promise<void>} */
  function playCurrent() {
    markUnlocked();
    if (paused || muted) return Promise.resolve();
    applyVolume();
    return audio.play().catch(() => {});
  }

  /** @param {boolean} andPlay */
  function loadTrack(andPlay) {
    audio.pause();
    const url = resolveTrackUrl(TRACKS[trackIndex].file);
    return new Promise((resolve) => {
      const finish = () => {
        applyVolume();
        syncLabels();
        persist();
        resolve();
      };
      const onReady = () => {
        if (andPlay && unlocked && !paused && !muted) {
          playCurrent().finally(finish);
        } else {
          finish();
        }
      };
      const onError = () => {
        console.warn("[OtterKart music] failed to load", TRACKS[trackIndex].file);
        finish();
      };

      if (audio.src === url && audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
        onReady();
        return;
      }

      audio.addEventListener("canplay", onReady, { once: true });
      audio.addEventListener("error", onError, { once: true });
      audio.src = url;
      audio.load();
    });
  }

  /** @param {number} delta */
  async function changeTrack(delta) {
    if (switching) return;
    switching = true;
    markUnlocked();
    trackIndex = (trackIndex + delta + TRACKS.length) % TRACKS.length;
    paused = false;
    try {
      await loadTrack(true);
    } finally {
      switching = false;
    }
  }

  function setPanelOpen(open) {
    panelOpen = open;
    panel.classList.toggle("hidden", !open);
    panel.setAttribute("aria-hidden", open ? "false" : "true");
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    persist();
  }

  audio.addEventListener("ended", () => {
    if (paused || switching) return;
    void changeTrack(1);
  });

  function bindControl(el, handler) {
    if (!(el instanceof HTMLElement)) return;
    const run = (e) => {
      e.preventDefault();
      e.stopPropagation();
      markUnlocked();
      void handler(e);
    };
    el.addEventListener("click", run);
  }

  bindControl(btn, () => {
    setPanelOpen(!panelOpen);
    if (!panelOpen) return;
    if (!paused && !muted) void loadTrack(true);
  });

  bindControl(closeBtn, () => {
    setPanelOpen(false);
  });

  bindControl(prevBtn, () => {
    void changeTrack(-1);
  });

  bindControl(nextBtn, () => {
    void changeTrack(1);
  });

  bindControl(playBtn, async () => {
    paused = !paused;
    if (paused) {
      audio.pause();
    } else {
      if (!audio.src) await loadTrack(false);
      await playCurrent();
    }
    syncLabels();
    persist();
  });

  bindControl(muteBtn, async () => {
    muted = !muted;
    applyVolume();
    if (!muted && !paused) await playCurrent();
    syncLabels();
    persist();
  });

  volInput?.addEventListener("input", (e) => {
    e.stopPropagation();
    if (!(volInput instanceof HTMLInputElement)) return;
    markUnlocked();
    volume = Number(volInput.value);
    if (volume > 0 && muted) muted = false;
    applyVolume();
    if (!paused && !muted) void playCurrent();
    syncLabels();
    persist();
  });

  panel.addEventListener("click", (e) => e.stopPropagation());
  panel.addEventListener("pointerdown", (e) => e.stopPropagation());

  window.addEventListener("keydown", (ev) => {
    if (ev.code !== "KeyM" && ev.key?.toLowerCase() !== "m") return;
    const t = ev.target;
    if (
      t &&
      (t.closest('input, textarea, select, [contenteditable="true"]') ||
        t.isContentEditable)
    ) {
      return;
    }
    ev.preventDefault();
    markUnlocked();
    setPanelOpen(!panelOpen);
    if (!panelOpen || paused || muted) return;
    void loadTrack(true);
  });

  setPanelOpen(panelOpen);
  void loadTrack(false);
  syncLabels();
}
