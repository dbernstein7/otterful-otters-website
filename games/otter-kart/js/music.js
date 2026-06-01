/**
 * In-game background music for OtterKart (standalone; files live under /games/otter-kart/music/).
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
  audio.loop = true;
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

  function loadTrack(andPlay) {
    audio.src = trackUrl(TRACKS[trackIndex].file);
    applyVolume();
    syncLabels();
    if (andPlay && unlocked && !paused && !muted) {
      audio.play().catch(() => {});
    }
  }

  function tryPlay() {
    unlocked = true;
    if (!paused && !muted) audio.play().catch(() => {});
  }

  function setPanelOpen(open) {
    panelOpen = open;
    panel.classList.toggle("hidden", !open);
    panel.setAttribute("aria-hidden", open ? "false" : "true");
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    persist();
  }

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
    trackIndex = (trackIndex - 1 + TRACKS.length) % TRACKS.length;
    paused = false;
    loadTrack(true);
    persist();
  });

  nextBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    trackIndex = (trackIndex + 1) % TRACKS.length;
    paused = false;
    loadTrack(true);
    persist();
  });

  playBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    paused = !paused;
    if (paused) audio.pause();
    else tryPlay();
    syncLabels();
    persist();
  });

  muteBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    muted = !muted;
    applyVolume();
    syncLabels();
    persist();
  });

  volInput?.addEventListener("input", (e) => {
    e.stopPropagation();
    if (!(volInput instanceof HTMLInputElement)) return;
    volume = Number(volInput.value);
    if (volume > 0 && muted) muted = false;
    applyVolume();
    syncLabels();
    persist();
  });

  panel.addEventListener("click", (e) => e.stopPropagation());

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

  if (panelOpen) setPanelOpen(true);
  else setPanelOpen(false);
  loadTrack(false);
  syncLabels();
}
