import {
  WALLET_TRAITS_KEY,
  EMBED_SELECTION_KEY,
} from './config.mjs';
import { disconnectWallet } from './connect.mjs';
import { initWalletModal } from './wallet-modal.mjs';
import { fetchOwnedTokenIds, loadWalletOtters } from './nfts.mjs';
import {
  parseOtterTraits,
  aggregateWalletTraits,
  buildMmlApiUrl,
  otterImageUrl,
} from './traits.mjs';

/**
 * @typedef {{ id: number, metadata: object|null }} WalletOtter
 */

export function initBuilderWalletUI() {
  const stage = document.getElementById('builder-wallet-stage');
  const connectPanel = document.getElementById('builder-wallet-connect');
  const pickerPanel = document.getElementById('builder-wallet-picker');
  const workspace = document.getElementById('builder-workspace');
  const connectBtn = document.getElementById('builder-wallet-connect-btn');
  const disconnectBtn = document.getElementById('builder-wallet-disconnect-btn');
  const walletAddrEl = document.getElementById('builder-wallet-address');
  const pickerGrid = document.getElementById('builder-wallet-grid');
  const pickerStatus = document.getElementById('builder-wallet-picker-status');
  const pickerCount = document.getElementById('builder-wallet-count');
  const changeOtterBtn = document.getElementById('builder-wallet-change-otter');

  if (!stage || !connectPanel || !pickerPanel || !workspace) return null;

  const walletModal = initWalletModal({
    onConnected: async ({ address }) => {
      const errEl = document.getElementById('builder-wallet-connect-error');
      if (errEl) errEl.hidden = true;
      await afterConnect(address);
    },
    onError: (err) => {
      const errEl = document.getElementById('builder-wallet-connect-error');
      if (errEl) {
        errEl.textContent = err.message || String(err);
        errEl.hidden = false;
      }
    },
  });

  /** @type {WalletOtter[]} */
  let walletOtters = [];
  /** @type {number|null} */
  let selectedId = null;
  /** @type {Record<string, string|null>} */
  let liveTraits = {};

  function shortAddr(addr) {
    return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '';
  }

  function setPickerStatus(msg, isError = false) {
    if (!pickerStatus) return;
    pickerStatus.textContent = msg || '';
    pickerStatus.classList.toggle('is-error', !!isError);
  }

  function showStage(mode) {
    const isConnect = mode === 'connect';
    const isPicker = mode === 'picker';
    const isWorkspace = mode === 'workspace';
    connectPanel.hidden = !isConnect;
    pickerPanel.hidden = !isPicker;
    workspace.hidden = !isWorkspace;
    stage.dataset.mode = mode;
  }

  function publishWalletTraits(allowlist) {
    try {
      localStorage.setItem(WALLET_TRAITS_KEY, JSON.stringify(allowlist));
    } catch {
      /* ignore */
    }
    const frame = document.getElementById('traitGalleryFrame');
    if (frame?.src) {
      const url = new URL(frame.src, window.location.href);
      url.searchParams.set('wc', String(Date.now()));
      frame.src = url.pathname + url.search;
    }
  }

  function syncInputs(tokenId) {
    const s = String(tokenId);
    for (const id of ['builder-nft-input', 'builder-mml-nft-input', 'builder-asset-nft-input']) {
      const el = document.getElementById(id);
      if (el) el.value = s;
    }
  }

  function emitTraitChange() {
    if (!selectedId) return;
    const mmlUrl = buildMmlApiUrl(window.location.origin, selectedId, liveTraits);
    window.dispatchEvent(
      new CustomEvent('otterful-builder-sync-mml', {
        detail: { tokenId: selectedId, traits: { ...liveTraits }, mmlUrl },
      })
    );
    window.dispatchEvent(
      new CustomEvent('otterful-builder-sync-asset', {
        detail: { tokenId: selectedId, mmlUrl },
      })
    );
  }

  function loadOtterInBuilder(tokenId) {
    syncInputs(tokenId);
    try {
      localStorage.setItem(
        EMBED_SELECTION_KEY,
        JSON.stringify({ type: 'nft-load', value: tokenId, ts: Date.now() })
      );
    } catch {
      /* ignore */
    }
    emitTraitChange();
  }

  function applyEmbedSelection(payload) {
    if (!payload || !selectedId) return;
    const type = String(payload.type || '').toLowerCase();
    const value = payload.value;

    if (type === 'fur' && typeof value === 'string') liveTraits.fur = value;
    if (type === 'hat' && typeof value === 'string') liveTraits.hat = value;
    if (type === 'shirt' && typeof value === 'string') liveTraits.shirt = value;
    if (type === 'eyes' && typeof value === 'string') liveTraits.eyes = value;
    if (type === 'remove-hat') liveTraits.hat = null;
    if (type === 'remove-shirt') liveTraits.shirt = null;
    if (type === 'remove-eyes') liveTraits.eyes = null;

    emitTraitChange();
  }

  function renderPickerGrid() {
    if (!pickerGrid) return;
    pickerGrid.innerHTML = '';
    if (!walletOtters.length) {
      pickerGrid.innerHTML =
        '<p class="builder-wallet-empty">No Otterful Otters found in this wallet on ApeChain.</p>';
      return;
    }

    for (const o of walletOtters) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'builder-wallet-nft-card';
      btn.setAttribute('aria-label', `Otter #${o.id}`);
      if (selectedId === o.id) btn.classList.add('is-selected');

      const img = document.createElement('img');
      img.src = otterImageUrl(o.id);
      img.alt = `Otterful #${o.id}`;
      img.loading = 'lazy';

      const label = document.createElement('span');
      label.className = 'builder-wallet-nft-num';
      label.textContent = `#${o.id}`;

      btn.appendChild(img);
      btn.appendChild(label);
      btn.addEventListener('click', () => selectOtter(o.id));
      pickerGrid.appendChild(btn);
    }
  }

  function selectOtter(tokenId) {
    const otter = walletOtters.find((o) => o.id === tokenId);
    if (!otter) return;
    selectedId = tokenId;
    liveTraits = { ...parseOtterTraits(otter.metadata) };
    renderPickerGrid();
    showStage('workspace');
    loadOtterInBuilder(tokenId);

    const selectedLabel = document.getElementById('builder-wallet-selected-label');
    if (selectedLabel) selectedLabel.textContent = `Customizing #${tokenId}`;

    window.dispatchEvent(
      new CustomEvent('otterful-builder-selected', {
        detail: { tokenId, metadata: otter.metadata, traits: { ...liveTraits } },
      })
    );
    window.dispatchEvent(
      new CustomEvent('otterful-builder-sync-asset', {
        detail: { tokenId, mmlUrl: buildMmlApiUrl(window.location.origin, tokenId, liveTraits), open: false },
      })
    );
  }

  async function afterConnect(address) {
    if (walletAddrEl) walletAddrEl.textContent = shortAddr(address);
    if (disconnectBtn) disconnectBtn.hidden = false;
    showStage('picker');
    setPickerStatus('Loading your Otterful Otters…');

    try {
      const ids = await fetchOwnedTokenIds(address);
      if (pickerCount) pickerCount.textContent = ids.length ? `${ids.length} otter${ids.length === 1 ? '' : 's'}` : '0 otters';
      if (!ids.length) {
        walletOtters = [];
        setPickerStatus(
          'No Otterful Otters found for this wallet on ApeChain. If you just bought one, wait a few minutes and reconnect.',
          false
        );
        renderPickerGrid();
        return;
      }
      walletOtters = await loadWalletOtters(ids, (done, total) => {
        setPickerStatus(`Loading metadata… ${done}/${total}`);
      });
      const allowlist = aggregateWalletTraits(walletOtters);
      publishWalletTraits(allowlist);
      setPickerStatus('');
      renderPickerGrid();
    } catch (err) {
      setPickerStatus(err?.message || String(err), true);
    }
  }

  connectBtn?.addEventListener('click', () => {
    const errEl = document.getElementById('builder-wallet-connect-error');
    if (errEl) errEl.hidden = true;
    walletModal.open();
  });

  disconnectBtn?.addEventListener('click', async () => {
    await disconnectWallet();
    walletOtters = [];
    selectedId = null;
    liveTraits = {};
    if (walletAddrEl) walletAddrEl.textContent = '';
    disconnectBtn.hidden = true;
    try {
      localStorage.removeItem(WALLET_TRAITS_KEY);
    } catch {
      /* ignore */
    }
    showStage('connect');
  });

  changeOtterBtn?.addEventListener('click', () => {
    showStage('picker');
  });

  window.addEventListener('storage', (e) => {
    if (e.key !== EMBED_SELECTION_KEY || !e.newValue || !selectedId) return;
    try {
      applyEmbedSelection(JSON.parse(e.newValue));
    } catch {
      /* ignore */
    }
  });

  showStage('connect');
  return { getSelectedId: () => selectedId, getLiveTraits: () => ({ ...liveTraits }) };
}
