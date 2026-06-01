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

function trackUrl(file) {
  return `music/${file}`;
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
    if (metaEl) metaEl.textContent = `Track ${trackIndex + 1} / ${TRACKS.length}`;
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

  function playWhenReady() {
    if (!unlocked || paused || muted) return;
    const start = () => {
      audio.play().catch(() => {});
    };
    if (audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      start();
      return;
    }
    audio.addEventListener("canplay", start, { once: true });
    audio.load();
  }

  /** @param {boolean} andPlay */
  function loadTrack(andPlay) {
    audio.pause();
    audio.src = trackUrl(TRACKS[trackIndex].file);
    applyVolume();
    syncLabels();
    persist();
    if (andPlay) playWhenReady();
  }

  function changeTrack(delta) {
    trackIndex = (trackIndex + delta + TRACKS.length) % TRACKS.length;
    paused = false;
    unlocked = true;
    loadTrack(true);
  }

  function tryPlay() {
    unlocked = true;
    if (paused || muted) return;
    if (!audio.src) loadTrack(false);
    playWhenReady();
  }

  function setPanelOpen(open) {
    panelOpen = open;
    panel.classList.toggle("hidden", !open);
    panel.setAttribute("aria-hidden", open ? "false" : "true");
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    persist();
  }

  audio.addEventListener("ended", () => {
    if (paused) return;
    changeTrack(1);
  });

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    setPanelOpen(!panelOpen);
    tryPlay();
  });

  closeBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    setPanelOpen(false);
  });

  prevBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    changeTrack(-1);
  });

  nextBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    changeTrack(1);
  });

  playBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    unlocked = true;
    paused = !paused;
    if (paused) {
      audio.pause();
    } else {
      if (!audio.src) loadTrack(false);
      playWhenReady();
    }
    syncLabels();
    persist();
  });

  muteBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    muted = !muted;
    applyVolume();
    if (!muted && !paused && unlocked) playWhenReady();
    syncLabels();
    persist();
  });

  volInput?.addEventListener("input", (e) => {
    e.stopPropagation();
    if (!(volInput instanceof HTMLInputElement)) return;
    volume = Number(volInput.value);
    if (volume > 0 && muted) muted = false;
    applyVolume();
    if (!paused && !muted && unlocked) playWhenReady();
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
    setPanelOpen(!panelOpen);
    tryPlay();
  });

  const unlock = () => {
    tryPlay();
  };
  document.addEventListener("pointerdown", unlock, { once: true, capture: true });
  document.addEventListener("keydown", unlock, { once: true, capture: true });

  setPanelOpen(panelOpen);
  loadTrack(false);
  syncLabels();
}
