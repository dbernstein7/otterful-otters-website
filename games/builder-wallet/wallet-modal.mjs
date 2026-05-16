import { connectWithProvider, connectWalletConnect } from './connect.mjs?v=9';
import { connectGlyphWallet } from './glyph-connect.mjs?v=9';
import { discoverEip6963Providers, resolveWalletProviders } from './wallets.mjs?v=9';

/** Always pinned at top of Popular (under MetaMask). */
const TOP_POPULAR_IDS = ['metamask', 'glyph'];

/**
 * @param {{ onConnected: (session: { address: string, provider: object }) => void | Promise<void>, onError?: (err: Error) => void }} opts
 */
export function initWalletModal(opts) {
  const { onConnected, onError } = opts;
  const modals = document.querySelectorAll('#wallet-connect-modal');
  if (modals.length > 1) {
    modals.forEach((el, i) => {
      if (i > 0) el.remove();
    });
  }
  const modal = document.getElementById('wallet-connect-modal');
  const backdrop = modal?.querySelector('[data-wallet-backdrop]');
  const closeBtn = modal?.querySelector('[data-wallet-close]');
  const listInstalled = document.getElementById('wallet-list-installed');
  const listPopular = document.getElementById('wallet-list-popular');
  const sectionInstalled = document.getElementById('wallet-section-installed');

  if (!modal || !listPopular) return { open: () => {}, close: () => {} };

  /** @type {ReturnType<typeof resolveWalletProviders>} */
  let wallets = [];

  function close() {
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('wallet-modal-open');
  }

  function open() {
    modal.hidden = false;
    modal.removeAttribute('aria-hidden');
    document.body.classList.add('wallet-modal-open');
    void refreshWalletList();
  }

  function sortPopular(items) {
    const catalogOrder = new Map(wallets.map((w, i) => [w.id, i]));
    return [...items].sort((a, b) => {
      const topA = TOP_POPULAR_IDS.indexOf(a.id);
      const topB = TOP_POPULAR_IDS.indexOf(b.id);
      if (topA !== -1 || topB !== -1) {
        if (topA === -1) return 1;
        if (topB === -1) return -1;
        return topA - topB;
      }
      return (catalogOrder.get(a.id) ?? 999) - (catalogOrder.get(b.id) ?? 999);
    });
  }

  async function refreshWalletList() {
    const announced = await discoverEip6963Providers();
    wallets = resolveWalletProviders(announced);

    const installed = wallets.filter(
      (w) =>
        w.installed &&
        !w.isWalletConnect &&
        !w.hiddenUnlessInstalled &&
        !TOP_POPULAR_IDS.includes(w.id)
    );
    const installedIds = new Set(installed.map((w) => w.id));

    const popular = sortPopular(
      wallets.filter((w) => {
        if (TOP_POPULAR_IDS.includes(w.id)) return w.section === 'popular';
        if (w.section !== 'popular') return false;
        if (w.hiddenUnlessInstalled && !w.installed) return false;
        return !installedIds.has(w.id) || w.isWalletConnect;
      })
    );

    if (sectionInstalled) {
      sectionInstalled.hidden = installed.length === 0;
    }
    renderList(listInstalled, installed, { showRecent: true });
    renderList(listPopular, popular, { showRecent: false });
  }

  /**
   * @param {HTMLElement|null} container
   * @param {typeof wallets} items
   * @param {{ showRecent?: boolean }} opts
   */
  function renderList(container, items, opts = {}) {
    if (!container) return;
    container.innerHTML = '';

    for (const w of items) {
      if (w.hiddenUnlessInstalled && !w.installed) continue;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'wallet-option';
      btn.dataset.walletId = w.id;

      const iconWrap = document.createElement('span');
      iconWrap.className = 'wallet-option-icon-wrap';

      const icon = document.createElement('img');
      icon.className = 'wallet-option-icon';
      icon.src = w.icon;
      icon.alt = '';
      icon.width = 40;
      icon.height = 40;
      icon.decoding = 'async';
      icon.onerror = () => {
        icon.remove();
        const fallback = document.createElement('span');
        fallback.className = 'wallet-option-icon-fallback';
        fallback.textContent = w.name.charAt(0);
        iconWrap.appendChild(fallback);
      };
      iconWrap.appendChild(icon);

      const textWrap = document.createElement('span');
      textWrap.className = 'wallet-option-text';

      const label = document.createElement('span');
      label.className = 'wallet-option-name';
      label.textContent = w.name;
      textWrap.appendChild(label);

      if (opts.showRecent && w.id === 'metamask' && w.installed) {
        const tag = document.createElement('span');
        tag.className = 'wallet-option-tag';
        tag.textContent = 'Recent';
        textWrap.appendChild(tag);
      }

      btn.appendChild(iconWrap);
      btn.appendChild(textWrap);

      btn.addEventListener('click', () => void handleSelect(w));
      container.appendChild(btn);
    }
  }

  async function handleSelect(wallet) {
    const buttons = modal.querySelectorAll('.wallet-option');
    buttons.forEach((b) => {
      b.disabled = true;
    });

    try {
      let session;
      if (wallet.id === 'glyph') {
        session = await connectGlyphWallet();
      } else if (wallet.isWalletConnect) {
        session = await connectWalletConnect();
      } else if (wallet.provider) {
        session = await connectWithProvider(wallet.provider);
      } else if (wallet.downloadUrl) {
        window.open(wallet.downloadUrl, '_blank', 'noopener,noreferrer');
        return;
      } else {
        throw new Error(`${wallet.name} is not installed. Use WalletConnect or install the extension.`);
      }
      close();
      await onConnected(session);
    } catch (err) {
      onError?.(err instanceof Error ? err : new Error(String(err)));
    } finally {
      buttons.forEach((b) => {
        b.disabled = false;
      });
    }
  }

  closeBtn?.addEventListener('click', close);
  backdrop?.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) close();
  });

  return { open, close, refresh: refreshWalletList };
}
