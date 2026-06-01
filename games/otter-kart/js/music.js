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

  let audio = document.getElementById("otter-music-player");
  if (!(audio instanceof HTMLAudioElement)) {
    audio = document.createElement("audio");
    audio.id = "otter-music-player";
    audio.preload = "auto";
    audio.setAttribute("playsinline", "");
    audio.style.display = "none";
    document.body.appendChild(audio);
  }
  audio.loop = false;

  const prefs = loadPrefs() || {};
  let trackIndex = Number.isFinite(prefs.trackIndex)
    ? Math.min(Math.max(0, prefs.trackIndex), TRACKS.length - 1)
    : 0;
  let volume = Number.isFinite(prefs.volume) ? Math.min(1, Math.max(0, prefs.volume)) : 0.45;
  let muted = !!prefs.muted;
  let paused = prefs.paused !== false;
  let panelOpen = !!prefs.panelOpen;

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

  function syncLabels(statusText) {
    const t = TRACKS[trackIndex];
    if (titleEl) titleEl.textContent = t.label;
    if (metaEl) {
      metaEl.textContent =
        statusText ?? `Track ${trackIndex + 1} / ${TRACKS.length}`;
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

  /** Point audio at the current track (always assign src + reload). */
  function bindCurrentTrack() {
    const url = resolveTrackUrl(TRACKS[trackIndex].file);
    audio.pause();
    audio.src = url;
    audio.load();
    applyVolume();
  }

  /**
   * Skip prev/next — runs on user click (gesture) or natural track end.
   * @param {number} delta
   * @param {boolean} autoplay
   */
  function skipTrack(delta, autoplay) {
    trackIndex = (trackIndex + delta + TRACKS.length) % TRACKS.length;
    if (autoplay) paused = false;
    syncLabels();
    persist();
    bindCurrentTrack();
    if (!autoplay || paused || muted) return;
    void audio.play().catch(() => {
      syncLabels("Tap Play to start audio");
    });
  }

  async function playMusic() {
    paused = false;
    syncLabels();
    persist();
    bindCurrentTrack();
    try {
      await audio.play();
      syncLabels();
    } catch {
      syncLabels("Tap Play to start audio");
    }
  }

  function pauseMusic() {
    paused = true;
    audio.pause();
    syncLabels();
    persist();
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
    skipTrack(1, true);
  });

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    setPanelOpen(!panelOpen);
  });

  closeBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    setPanelOpen(false);
  });

  playBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (paused) void playMusic();
    else pauseMusic();
  });

  muteBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    muted = !muted;
    applyVolume();
    syncLabels();
    persist();
    if (!muted && !paused) void playMusic();
  });

  volInput?.addEventListener("input", (e) => {
    e.stopPropagation();
    if (!(volInput instanceof HTMLInputElement)) return;
    volume = Number(volInput.value);
    if (volume > 0 && muted) muted = false;
    applyVolume();
    syncLabels();
    persist();
    if (!paused && !muted) void playMusic();
  });

  let lastSkipAt = 0;
  let lastSkipDelta = 0;

  function handleSkipClick(e, delta) {
    e.preventDefault();
    e.stopPropagation();
    const now = Date.now();
    if (now - lastSkipAt < 450 && lastSkipDelta === delta) return;
    lastSkipAt = now;
    lastSkipDelta = delta;
    skipTrack(delta, true);
  }

  /** Capture-phase handlers so ‹ › work in iframe embeds and on touch. */
  for (const [el, delta] of [
    [prevBtn, -1],
    [nextBtn, 1],
  ]) {
    if (!(el instanceof HTMLButtonElement)) continue;
    el.addEventListener("pointerdown", (e) => handleSkipClick(e, delta), true);
    el.addEventListener("click", (e) => handleSkipClick(e, delta), true);
  }

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
  });

  if (panelOpen) setPanelOpen(true);
  else setPanelOpen(false);
  bindCurrentTrack();
  syncLabels();
  persist();
}
