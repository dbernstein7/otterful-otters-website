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
  let loadGen = 0;

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

  /** @param {boolean} andPlay */
  function loadTrack(andPlay) {
    const gen = ++loadGen;
    audio.pause();
    const url = resolveTrackUrl(TRACKS[trackIndex].file);
    applyVolume();
    syncLabels();
    persist();

    return new Promise((resolve) => {
      let settled = false;
      const finish = (statusText) => {
        if (settled || gen !== loadGen) return;
        settled = true;
        syncLabels(statusText);
        persist();
        resolve();
      };

      const startPlayback = () => {
        if (settled || gen !== loadGen) return;
        if (!andPlay || paused || muted) {
          finish();
          return;
        }
        applyVolume();
        audio
          .play()
          .then(() => finish())
          .catch(() => finish("Tap Play to start audio"));
      };

      const onError = () => {
        console.warn("[OtterKart music] failed to load", TRACKS[trackIndex].file);
        finish("Track failed to load");
      };

      audio.removeEventListener("canplay", startPlayback);
      audio.removeEventListener("error", onError);
      audio.addEventListener("canplay", startPlayback, { once: true });
      audio.addEventListener("error", onError, { once: true });

      if (audio.src !== url) audio.src = url;
      audio.load();

      if (audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        startPlayback();
      }

      window.setTimeout(() => finish(), 12000);
    });
  }

  /** @param {number} delta */
  async function changeTrack(delta) {
    trackIndex = (trackIndex + delta + TRACKS.length) % TRACKS.length;
    paused = false;
    syncLabels();
    await loadTrack(true);
  }

  async function playMusic() {
    paused = false;
    if (!audio.src) await loadTrack(false);
    applyVolume();
    syncLabels();
    persist();
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
    void changeTrack(1);
  });

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    setPanelOpen(!panelOpen);
  });

  closeBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    setPanelOpen(false);
  });

  prevBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    void changeTrack(-1);
  });

  nextBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    void changeTrack(1);
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

  setPanelOpen(panelOpen);
  void loadTrack(false);
  syncLabels();
}
