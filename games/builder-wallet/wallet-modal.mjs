import { connectWithProvider, connectWalletConnect } from './connect.mjs?v=6';
import { discoverEip6963Providers, resolveWalletProviders } from './wallets.mjs?v=6';

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
  const listGlyph = document.getElementById('wallet-list-glyph');
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

  async function refreshWalletList() {
    const announced = await discoverEip6963Providers();
    wallets = resolveWalletProviders(announced);

    const installed = wallets.filter(
      (w) => w.installed && !w.isWalletConnect && !w.hiddenUnlessInstalled
    );
    const installedIds = new Set(installed.map((w) => w.id));

    const popular = wallets.filter(
      (w) =>
        w.section === 'popular' &&
        (!installedIds.has(w.id) || w.isWalletConnect) &&
        (!w.hiddenUnlessInstalled || w.installed)
    );

    const glyph = wallets.filter((w) => w.section === 'glyph' && !installedIds.has(w.id));

    if (sectionInstalled) {
      sectionInstalled.hidden = installed.length === 0;
    }
    renderList(listInstalled, installed, { showRecent: true });
    renderList(listPopular, popular, { showRecent: false });
    if (listGlyph) renderList(listGlyph, glyph, { showRecent: false });
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
      if (wallet.isWalletConnect) {
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
