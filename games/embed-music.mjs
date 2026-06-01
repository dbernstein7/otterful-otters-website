/**
 * Side-panel music player for embed pages — uses Shell Snag soundtrack files.
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

const STORAGE_KEY = "otterEmbedMusic";

function musicBaseUrl() {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/games/shell-snag/`;
}

function loadPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
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
 * Mount music dock beside an embed iframe container.
 * @param {HTMLElement} mountEl
 */
export function mountEmbedMusic(mountEl) {
  if (!mountEl) return;

  const prefs = loadPrefs() || {};
  let trackIndex = Number.isFinite(prefs.trackIndex)
    ? Math.min(Math.max(0, prefs.trackIndex), TRACKS.length - 1)
    : 0;
  let volume = Number.isFinite(prefs.volume) ? Math.min(1, Math.max(0, prefs.volume)) : 0.45;
  let muted = !!prefs.muted;
  let paused = prefs.paused !== false;
  let panelOpen = !!prefs.panelOpen;

  const audio = new Audio();
  audio.loop = true;
  audio.preload = "auto";

  function persist() {
    savePrefs({ trackIndex, volume, muted, paused, panelOpen });
  }

  function applyVolume() {
    audio.volume = muted ? 0 : volume;
  }

  function trackUrl(index) {
    return `${musicBaseUrl()}${TRACKS[index].file}`;
  }

  function syncTrackLabel() {
    const t = TRACKS[trackIndex];
    titleEl.textContent = t.label;
    metaEl.textContent = `Track ${trackIndex + 1} / ${TRACKS.length}`;
  }

  function loadTrack(playAfter) {
    const wasPlaying = !audio.paused && !paused && !muted;
    audio.src = trackUrl(trackIndex);
    applyVolume();
    syncTrackLabel();
    if (playAfter || (wasPlaying && !paused && !muted)) {
      audio.play().catch(() => {});
    }
  }

  function updatePlayBtn() {
    playBtn.textContent = paused ? "▶" : "❚❚";
    playBtn.title = paused ? "Play" : "Pause";
    playBtn.setAttribute("aria-label", paused ? "Play music" : "Pause music");
  }

  function updateMuteBtn() {
    muteBtn.textContent = muted ? "🔇" : "🔊";
    muteBtn.title = muted ? "Unmute" : "Mute";
    muteBtn.setAttribute("aria-label", muted ? "Unmute music" : "Mute music");
  }

  mountEl.innerHTML = "";
  mountEl.className = "embed-music-dock";

  const panel = document.createElement("div");
  panel.className = "embed-music-panel";
  panel.setAttribute("role", "region");
  panel.setAttribute("aria-label", "Music");

  const panelInner = document.createElement("div");
  panelInner.className = "embed-music-panel__inner";

  const titleEl = document.createElement("p");
  titleEl.className = "embed-music-panel__title";

  const metaEl = document.createElement("p");
  metaEl.className = "embed-music-panel__meta";

  const controls = document.createElement("div");
  controls.className = "embed-music-controls";

  function makeBtn(label, aria) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "embed-music-btn";
    b.textContent = label;
    b.setAttribute("aria-label", aria);
    return b;
  }

  const prevBtn = makeBtn("‹", "Previous track");
  const playBtn = makeBtn("▶", "Play music");
  const nextBtn = makeBtn("›", "Next track");
  const muteBtn = makeBtn("🔊", "Mute music");

  const volWrap = document.createElement("div");
  volWrap.className = "embed-music-volume";
  const volLabel = document.createElement("label");
  volLabel.textContent = "Volume";
  const volInput = document.createElement("input");
  volInput.type = "range";
  volInput.min = "0";
  volInput.max = "1";
  volInput.step = "0.02";
  volInput.value = String(muted ? 0 : volume);
  volWrap.append(volLabel, volInput);

  controls.append(prevBtn, playBtn, nextBtn, muteBtn);
  panelInner.append(titleEl, metaEl, controls, volWrap);
  panel.appendChild(panelInner);

  const tab = document.createElement("button");
  tab.type = "button";
  tab.className = "embed-music-tab";
  tab.setAttribute("aria-expanded", "false");
  tab.title = "Music (keyboard: M)";
  tab.innerHTML =
    '<span class="embed-music-tab__icon" aria-hidden="true">♪</span><span>Music</span>';

  function setPanelOpen(open) {
    panelOpen = open;
    panel.classList.toggle("is-open", open);
    tab.setAttribute("aria-expanded", open ? "true" : "false");
    persist();
  }

  tab.addEventListener("click", () => setPanelOpen(!panelOpen));

  prevBtn.addEventListener("click", () => {
    trackIndex = (trackIndex - 1 + TRACKS.length) % TRACKS.length;
    loadTrack(true);
    paused = false;
    updatePlayBtn();
    persist();
  });

  nextBtn.addEventListener("click", () => {
    trackIndex = (trackIndex + 1) % TRACKS.length;
    loadTrack(true);
    paused = false;
    updatePlayBtn();
    persist();
  });

  playBtn.addEventListener("click", () => {
    paused = !paused;
    if (paused) audio.pause();
    else audio.play().catch(() => {});
    updatePlayBtn();
    persist();
  });

  muteBtn.addEventListener("click", () => {
    muted = !muted;
    applyVolume();
    volInput.value = String(muted ? 0 : volume);
    updateMuteBtn();
    persist();
  });

  volInput.addEventListener("input", () => {
    volume = Number(volInput.value);
    if (volume > 0 && muted) muted = false;
    applyVolume();
    updateMuteBtn();
    persist();
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

  mountEl.append(panel, tab);

  if (panelOpen) panel.classList.add("is-open");
  tab.setAttribute("aria-expanded", panelOpen ? "true" : "false");
  syncTrackLabel();
  updatePlayBtn();
  updateMuteBtn();
  loadTrack(false);

  if (!paused && !muted) {
    audio.play().catch(() => {});
  }
}
