import { connectWithProvider, connectWalletConnect } from './connect.mjs';
import { discoverEip6963Providers, resolveWalletProviders } from './wallets.mjs';

const MODAL_HTML = [
  '<motion class="wallet-modal-backdrop" data-wallet-backdrop aria-hidden="true"></motion>',
  '<motion class="wallet-modal-dialog" role="document">',
  '  <button type="button" class="wallet-modal-close" data-wallet-close aria-label="Close">×</button>',
  '  <motion class="wallet-modal-columns">',
  '    <motion class="wallet-modal-wallets">',
  '      <h2 id="wallet-modal-title" class="wallet-modal-heading">Connect a Wallet</h2>',
  '      <motion id="wallet-section-installed" class="wallet-modal-section" hidden>',
  '        <h3 class="wallet-modal-section-title">Installed</h3>',
  '        <motion id="wallet-list-installed" class="wallet-modal-list" role="list"></motion>',
  '      </motion>',
  '      <motion class="wallet-modal-section">',
  '        <h3 class="wallet-modal-section-title">Popular</h3>',
  '        <motion id="wallet-list-popular" class="wallet-modal-list" role="list"></motion>',
  '      </motion>',
  '      <motion class="wallet-modal-section">',
  '        <h3 class="wallet-modal-section-title">Glyph</h3>',
  '        <motion id="wallet-list-glyph" class="wallet-modal-list" role="list"></motion>',
  '      </motion>',
  '    </motion>',
  '    <aside class="wallet-modal-about" aria-label="About wallets">',
  '      <h2 class="wallet-modal-heading">What is a Wallet?</h2>',
  '      <motion class="wallet-about-block">',
  '        <motion class="wallet-about-icon wallet-about-icon--assets" aria-hidden="true"></motion>',
  '        <motion>',
  '          <h3 class="wallet-about-title">A Home for your Digital Assets</h3>',
  '          <p class="wallet-about-text">Wallets are used to send, receive, store, and display digital assets like Ethereum and NFTs.</p>',
  '        </motion>',
  '      </motion>',
  '      <motion class="wallet-about-block">',
  '        <motion class="wallet-about-icon wallet-about-icon--login" aria-hidden="true"></motion>',
  '        <motion>',
  '          <h3 class="wallet-about-title">A New Way to Log In</h3>',
  '          <p class="wallet-about-text">Instead of creating new accounts and passwords on every website, just connect your wallet.</p>',
  '        </motion>',
  '      </motion>',
  '      <a href="https://ethereum.org/en/wallets/" target="_blank" rel="noopener noreferrer" class="wallet-modal-cta">Get a Wallet</a>',
  '      <a href="https://ethereum.org/en/wallets/find-wallet/" target="_blank" rel="noopener noreferrer" class="wallet-modal-learn">Learn More</a>',
  '    </aside>',
  '  </motion>',
  '</motion>',
].join('\n').replace(/<\/?motion\b/g, (m) => (m.includes('/') ? '</div>' : '<div')).replace(/<div class="wallet-modal-dialog"/g, '<div class="wallet-modal-dialog"');

function ensureModalDom() {
  let modal = document.getElementById('wallet-connect-modal');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = 'wallet-connect-modal';
  modal.className = 'wallet-modal';
  modal.hidden = true;
  modal.setAttribute('aria-hidden', 'true');
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'wallet-modal-title');
  modal.innerHTML = MODAL_HTML;
  document.body.appendChild(modal);
  return modal;
}

/**
 * @param {{ onConnected: (session: { address: string, provider: object }) => void | Promise<void>, onError?: (err: Error) => void }} opts
 */
export function initWalletModal(opts) {
  const { onConnected, onError } = opts;
  const modal = ensureModalDom();
  const backdrop = modal.querySelector('[data-wallet-backdrop]');
  const closeBtn = modal.querySelector('[data-wallet-close]');
  const listInstalled = document.getElementById('wallet-list-installed');
  const listPopular = document.getElementById('wallet-list-popular');
  const listGlyph = document.getElementById('wallet-list-glyph');
  const sectionInstalled = document.getElementById('wallet-section-installed');

  if (!listPopular) return { open: () => {}, close: () => {} };

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
    const popular = wallets.filter((w) => w.section === 'popular');
    const glyph = wallets.filter((w) => w.section === 'glyph');

    if (sectionInstalled) {
      sectionInstalled.hidden = installed.length === 0;
    }
    renderList(listInstalled, installed);
    renderList(listPopular, popular);
    if (listGlyph) renderList(listGlyph, glyph);
  }

  /**
   * @param {HTMLElement|null} container
   * @param {typeof wallets} items
   */
  function renderList(container, items) {
    if (!container) return;
    container.innerHTML = '';

    for (const w of items) {
      if (w.hiddenUnlessInstalled && !w.installed) continue;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'wallet-option';
      btn.dataset.walletId = w.id;

      const icon = document.createElement('img');
      icon.className = 'wallet-option-icon';
      icon.src = w.icon;
      icon.alt = '';
      icon.width = 32;
      icon.height = 32;
      icon.loading = 'lazy';
      icon.onerror = () => {
        icon.remove();
        const fallback = document.createElement('span');
        fallback.className = 'wallet-option-icon-fallback';
        fallback.textContent = w.name.charAt(0);
        btn.insertBefore(fallback, btn.firstChild);
      };

      const label = document.createElement('span');
      label.className = 'wallet-option-name';
      label.textContent = w.name;

      btn.appendChild(icon);
      btn.appendChild(label);

      if (w.installed && w.id === 'metamask') {
        const tag = document.createElement('span');
        tag.className = 'wallet-option-tag';
        tag.textContent = 'Recent';
        btn.appendChild(tag);
      }

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
