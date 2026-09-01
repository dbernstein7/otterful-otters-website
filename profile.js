import {
  getStoredWallet,
  initOtterfulWallet,
  shortWallet,
  clearStoredWallet,
} from "./otterful-wallet.mjs";
import { prepareGameLaunch, gameLaunchUrl } from "./otterful-game-launch.mjs";
import { bootstrapWalletSession } from "./otterful-session.mjs";

const OTTER_CONTRACT = "0x4e5913922b7ddf916c8d27d1016827f799687e66";
const OPENSEA_ASSET_BASE = `https://opensea.io/assets/ape_chain/${OTTER_CONTRACT}`;

const GAME_LABELS = {
  "shell-snag": "Shell Snag",
  "otter-kart": "OtterKart",
  "shell-rush": "Shell Rush",
};

const els = {
  loading: document.getElementById("profileLoading"),
  error: document.getElementById("profileError"),
  disconnected: document.getElementById("profileDisconnected"),
  content: document.getElementById("profileContent"),
  wallet: document.getElementById("profileWallet"),
  clams: document.getElementById("profileClams"),
  urnzBalance: document.getElementById("profileUrnzBalance"),
  ottersGrid: document.getElementById("profileOttersGrid"),
  ottersEmpty: document.getElementById("profileOttersEmpty"),
  activityList: document.getElementById("profileActivityList"),
  activityEmpty: document.getElementById("profileActivityEmpty"),
  gamesList: document.getElementById("profileGamesList"),
  connectBtn: document.getElementById("profileConnectBtn"),
  disconnectBtn: document.getElementById("profileDisconnectBtn"),
  refreshBtn: document.getElementById("profileRefreshBtn"),
  launchShellSnag: document.getElementById("launchShellSnag"),
  launchOtterKart: document.getElementById("launchOtterKart"),
};

let walletApi = null;
let activeWallet = null;

function formatClams(n) {
  const v = Math.max(0, Math.floor(Number(n) || 0));
  return v.toLocaleString("en-US");
}

function gameLabel(game) {
  return GAME_LABELS[game] || game.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatActivityDate(ms) {
  if (!ms || !Number.isFinite(ms)) return "";
  const d = new Date(ms);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86400000;
  const t = d.getTime();
  if (t >= startOfToday) return "Today";
  if (t >= startOfYesterday) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function otterImageUrl(id) {
  return `images_compressed/${id}.png`;
}

function setVisible(state) {
  els.loading.hidden = state !== "loading";
  els.error.hidden = state !== "error";
  els.disconnected.hidden = state !== "disconnected";
  els.content.hidden = state !== "content";

  const connected = state === "content" || state === "loading" || state === "error";
  if (els.connectBtn) els.connectBtn.hidden = connected;
  if (els.refreshBtn) els.refreshBtn.hidden = !connected;
  if (els.disconnectBtn) els.disconnectBtn.hidden = !connected;
}

function renderOtters(ids) {
  if (!els.ottersGrid || !els.ottersEmpty) return;
  els.ottersGrid.innerHTML = "";
  if (!ids.length) {
    els.ottersEmpty.hidden = false;
    return;
  }
  els.ottersEmpty.hidden = true;
  for (const id of ids) {
    const link = document.createElement("a");
    link.className = "profile-otter-card";
    link.href = `${OPENSEA_ASSET_BASE}/${id}`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.title = `Otterful Otter #${id}`;

    const img = document.createElement("img");
    img.src = otterImageUrl(id);
    img.alt = `Otterful Otter #${id}`;
    img.loading = "lazy";
    img.width = 160;
    img.height = 160;

    const label = document.createElement("span");
    label.className = "profile-otter-label";
    label.textContent = `#${id}`;

    link.append(img, label);
    els.ottersGrid.append(link);
  }
}

function renderActivity(rows) {
  if (!els.activityList || !els.activityEmpty) return;
  els.activityList.innerHTML = "";
  if (!rows.length) {
    els.activityEmpty.hidden = false;
    return;
  }
  els.activityEmpty.hidden = true;
  for (const row of rows) {
    const li = document.createElement("li");
    li.className = "profile-activity-item";

    const amount = document.createElement("span");
    amount.className = "profile-activity-amount";
    amount.textContent = `+${formatClams(row.amount)} Clams`;

    const meta = document.createElement("div");
    meta.className = "profile-activity-meta";

    const game = document.createElement("span");
    game.className = "profile-activity-game";
    game.textContent = gameLabel(row.game);

    const when = document.createElement("span");
    when.className = "profile-activity-date";
    when.textContent = formatActivityDate(row.createdAt);

    meta.append(game, when);
    li.append(amount, meta);
    els.activityList.append(li);
  }
}

function renderGames(games) {
  if (!els.gamesList) return;
  els.gamesList.innerHTML = "";
  if (!games.length) {
    const li = document.createElement("li");
    li.className = "profile-games-empty";
    li.textContent = "No games yet — play Shell Snag or OtterKart to earn Clams.";
    els.gamesList.append(li);
    return;
  }
  for (const game of games) {
    const li = document.createElement("li");
    li.className = "profile-games-item";
    li.textContent = gameLabel(game);
    els.gamesList.append(li);
  }
}

function renderProfile(data) {
  if (els.wallet) els.wallet.textContent = data.wallet;
  if (els.clams) els.clams.textContent = formatClams(data.clams);

  if (els.urnzBalance) {
    if (typeof data.urnzBalance === "number") {
      els.urnzBalance.hidden = false;
      els.urnzBalance.textContent = `URNZ balance: ${formatClams(data.urnzBalance)}`;
    } else {
      els.urnzBalance.hidden = true;
      els.urnzBalance.textContent = "";
    }
  }

  renderOtters(Array.isArray(data.otters) ? data.otters : []);
  renderActivity(Array.isArray(data.activity) ? data.activity : []);
  renderGames(Array.isArray(data.games) ? data.games : []);
  setVisible("content");
}

async function loadProfile(wallet) {
  setVisible("loading");
  if (els.error) els.error.hidden = true;

  try {
    const res = await fetch(`/api/profile?wallet=${encodeURIComponent(wallet)}`, {
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) {
      throw new Error(data?.message || `Could not load profile (${res.status})`);
    }
    renderProfile(data);
  } catch (err) {
    if (els.error) {
      els.error.textContent = "Unable to load your profile. Please try again.";
      els.error.hidden = false;
    }
    setVisible("error");
    console.error("Profile load failed:", err);
  }
}

async function onWalletReady(wallet) {
  activeWallet = wallet;
  if (els.wallet) els.wallet.textContent = shortWallet(wallet);
  try {
    await bootstrapWalletSession(wallet);
  } catch (err) {
    if (els.error) {
      els.error.textContent = err?.message || "Could not start wallet session.";
      els.error.hidden = false;
    }
  }
  await loadProfile(wallet);
}

function onNoWallet() {
  activeWallet = null;
  setVisible("disconnected");
}

async function launchGame(game, url) {
  const wallet = activeWallet || getStoredWallet();
  if (!wallet) {
    walletApi?.openConnect();
    return;
  }

  try {
    if (els.error) els.error.hidden = true;
    await prepareGameLaunch(game, wallet);
    window.location.href = gameLaunchUrl(url);
  } catch (err) {
    if (els.error) {
      els.error.textContent = err?.message || "Could not prepare game launch.";
      els.error.hidden = false;
    }
  }
}

function initNavDrawer() {
  const menuBtn = document.querySelector(".nav-menu-btn");
  const drawer = document.getElementById("navDrawer");
  const overlay = document.getElementById("navDrawerOverlay");
  if (!menuBtn || !drawer || !overlay) return;

  function closeDrawer() {
    drawer.classList.remove("is-open");
    overlay.classList.remove("is-open");
    menuBtn.setAttribute("aria-expanded", "false");
    drawer.setAttribute("aria-hidden", "true");
    overlay.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  function openDrawer() {
    drawer.classList.add("is-open");
    overlay.classList.add("is-open");
    menuBtn.setAttribute("aria-expanded", "true");
    drawer.setAttribute("aria-hidden", "false");
    overlay.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  closeDrawer();
  menuBtn.addEventListener("click", () => {
    if (drawer.classList.contains("is-open")) closeDrawer();
    else openDrawer();
  });
  overlay.addEventListener("click", closeDrawer);
  drawer.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeDrawer));
}

function init() {
  initNavDrawer();

  walletApi = initOtterfulWallet({
    onConnected: onWalletReady,
    onDisconnected: onNoWallet,
    onError: (err) => {
      if (els.error) {
        els.error.textContent = err?.message || "Wallet connection failed.";
        els.error.hidden = false;
      }
    },
  });

  els.connectBtn?.addEventListener("click", () => walletApi.openConnect());
  els.disconnectBtn?.addEventListener("click", async () => {
    await walletApi.disconnect();
    clearStoredWallet();
    onNoWallet();
  });
  els.refreshBtn?.addEventListener("click", () => {
    if (activeWallet) loadProfile(activeWallet);
  });

  els.launchShellSnag?.addEventListener("click", () => {
    launchGame("shell-snag", "shell-snag.html");
  });
  els.launchOtterKart?.addEventListener("click", () => {
    launchGame("otter-kart", "otter-kart.html");
  });

  const stored = getStoredWallet();
  if (stored) {
    onWalletReady(stored);
  } else {
    onNoWallet();
  }
}

init();
