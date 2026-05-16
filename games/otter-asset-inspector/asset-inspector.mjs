/**
 * Otterful asset inspector — 2D image, 3D MML rig preview, core traits, downloads.
 */
const CORE_TRAIT_SKIP = new Set(['trait count', 'compiler']);

function parseBodyGlbUrl(html) {
  const char = html.match(/<\s*m-character\b([^>]*)>/i);
  if (!char) return null;
  const sm = char[1].match(/(?:^|[\s])src\s*=\s*(["'])([\s\S]*?)\1/i);
  return sm ? sm[2].replace(/&amp;/gi, '&').trim() : null;
}

function traitRows(metadata) {
  if (!metadata?.attributes?.length) return [];
  return metadata.attributes.filter((a) => {
    const t = String(a.trait_type || '').toLowerCase();
    return t && !CORE_TRAIT_SKIP.has(t) && a.value != null && String(a.value).trim() !== '';
  });
}

async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function fetchText(url) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

function downloadBlob(filename, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

async function downloadUrlAsFile(url, filename) {
  const r = await fetch(url, { mode: 'cors' });
  if (!r.ok) throw new Error(`Download failed (${r.status})`);
  const blob = await r.blob();
  downloadBlob(filename, blob);
}

/**
 * @param {{ modal: HTMLElement; onClose?: () => void }} opts
 */
export function initAssetInspector(opts) {
  const { modal, onClose } = opts;
  const titleEl = modal.querySelector('[data-asset-title]');
  const traitsEl = modal.querySelector('[data-asset-traits]');
  const statusEl = modal.querySelector('[data-asset-status]');
  const img2d = modal.querySelector('[data-asset-2d]');
  const previewBox = modal.querySelector('.asset-inspector-preview-box');
  const previewWrap = modal.querySelector('[data-asset-3d-wrap]');
  const canvas3d = modal.querySelector('[data-asset-3d-canvas]');
  const backdrop = modal.querySelector('[data-asset-backdrop]');
  const toggle2d = modal.querySelector('[data-asset-mode="2d"]');
  const toggle3d = modal.querySelector('[data-asset-mode="3d"]');
  const btnClose = modal.querySelector('[data-asset-close]');
  const btnGlb = modal.querySelector('[data-asset-dl-glb]');
  const btnMml = modal.querySelector('[data-asset-dl-mml]');
  const btnCopyGlb = modal.querySelector('[data-asset-copy-glb]');
  const btnCopyMml = modal.querySelector('[data-asset-copy-mml]');

  let mode = '3d';
  let currentId = null;
  let bodyGlbUrl = null;
  let mmlDocUrl = null;
  let mmlHtml = null;
  let rigMount = null;
  let rigModulePromise = null;
  const siteOrigin = window.location.origin;

  function setStatus(msg, isError) {
    if (!statusEl) return;
    statusEl.textContent = msg || '';
    statusEl.classList.toggle('is-error', !!isError);
    if (!isError && msg) {
      setTimeout(() => {
        if (statusEl.textContent === msg) statusEl.textContent = '';
      }, 4000);
    }
  }

  function setMode(next) {
    mode = next === '2d' ? '2d' : '3d';
    toggle2d?.classList.toggle('is-active', mode === '2d');
    toggle3d?.classList.toggle('is-active', mode === '3d');
    toggle2d?.setAttribute('aria-pressed', mode === '2d' ? 'true' : 'false');
    toggle3d?.setAttribute('aria-pressed', mode === '3d' ? 'true' : 'false');
    if (img2d) img2d.hidden = mode !== '2d';
    if (previewWrap) previewWrap.hidden = mode !== '3d';
  }

  function loadRigPreviewModule() {
    if (!rigModulePromise) {
      const href = new URL('../mml-rig-preview/mml-rig-preview.mjs', import.meta.url).href;
      rigModulePromise = import(href);
    }
    return rigModulePromise;
  }

  async function ensureRigPreview() {
    if (rigMount || !previewBox || !canvas3d) return rigMount;
    const mod = await loadRigPreviewModule();
    rigMount = mod.mountMmlRigPreview({
      container: previewBox,
      canvas: canvas3d,
      onStatus: (msg) => {
        if (mode === '3d' && msg) setStatus(msg, false);
      },
    });
    return rigMount;
  }

  async function showRigPreview() {
    if (!mmlHtml) return;
    try {
      setStatus('Loading 3D preview…', false);
      const mount = await ensureRigPreview();
      await mount.show(mmlHtml, mmlDocUrl || window.location.href);
    } catch (e) {
      setStatus(e?.message || String(e), true);
    }
  }

  function disposeRigPreview() {
    rigMount?.dispose();
    rigMount = null;
  }

  function renderTraits(metadata) {
    if (!traitsEl) return;
    const rows = traitRows(metadata);
    if (!rows.length) {
      traitsEl.innerHTML = '<p class="asset-inspector-traits-empty">No traits found.</p>';
      return;
    }
    traitsEl.innerHTML = rows
      .map(
        (a) =>
          `<div class="asset-inspector-trait-card">
            <span class="asset-inspector-trait-label">${escapeHtml(a.trait_type)}</span>
            <span class="asset-inspector-trait-value">${escapeHtml(String(a.value))}</span>
          </div>`
      )
      .join('');
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function load(id) {
    currentId = id;
    bodyGlbUrl = null;
    mmlHtml = null;
    mmlDocUrl = `${siteOrigin}/api/mml?id=${id}&v=2`;
    const metaUrl = `${siteOrigin}/metadata/${id}.json`;
    const imgUrl = `images_compressed/${id}.png`;

    if (titleEl) titleEl.textContent = `Otterful #${id}`;
    setStatus('Loading…', false);
    if (img2d) {
      img2d.src = imgUrl;
      img2d.alt = `Otterful Otter #${id}`;
    }

    try {
      const [metadata, html] = await Promise.all([fetchJson(metaUrl), fetchText(mmlDocUrl)]);
      mmlHtml = html;
      renderTraits(metadata);
      bodyGlbUrl = parseBodyGlbUrl(html);
      if (btnGlb) btnGlb.disabled = false;
      if (btnCopyGlb) btnCopyGlb.disabled = !bodyGlbUrl;

      if (mode === '3d') await showRigPreview();
      else setStatus('', false);
    } catch (e) {
      renderTraits(null);
      if (btnGlb) btnGlb.disabled = false;
      if (btnCopyGlb) btnCopyGlb.disabled = true;
      setStatus(e?.message || String(e), true);
    }
  }

  function open(id) {
    modal.hidden = false;
    modal.removeAttribute('aria-hidden');
    modal.classList.add('is-open');
    document.body.classList.add('asset-inspector-open');
    setMode('3d');
    void load(id);
  }

  function close() {
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    modal.classList.remove('is-open');
    document.body.classList.remove('asset-inspector-open');
    disposeRigPreview();
    currentId = null;
    onClose?.();
  }

  toggle2d?.addEventListener('click', () => setMode('2d'));
  toggle3d?.addEventListener('click', () => {
    setMode('3d');
    void showRigPreview();
  });

  btnClose?.addEventListener('click', close);
  backdrop?.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('is-open')) close();
  });

  btnMml?.addEventListener('click', async () => {
    if (!currentId) return;
    try {
      setStatus('Preparing MML…', false);
      const html = mmlHtml || (await fetchText(mmlDocUrl));
      downloadBlob(`otterful-${currentId}.html`, new Blob([html], { type: 'text/html;charset=utf-8' }));
      setStatus('MML downloaded — open via the link in the file or viewer.mml.io.', false);
    } catch (e) {
      setStatus(e?.message || String(e), true);
    }
  });

  btnGlb?.addEventListener('click', async () => {
    if (!currentId) return;
    try {
      setStatus('Building GLB with wearables…', false);
      if (mode !== '3d') setMode('3d');
      const mount = await ensureRigPreview();
      if (!mmlHtml) await load(currentId);
      else await mount.show(mmlHtml, mmlDocUrl || window.location.href);
      const blob = await mount.exportAvatarGlb();
      downloadBlob(`otterful-${currentId}.glb`, blob);
      setStatus('GLB downloaded — body, shirt, hat, and eyes merged for Blender.', false);
    } catch (e) {
      setStatus(e?.message || String(e), true);
    }
  });

  btnCopyMml?.addEventListener('click', async () => {
    if (!mmlDocUrl) return;
    try {
      await navigator.clipboard.writeText(mmlDocUrl);
      setStatus('MML URL copied.', false);
    } catch (_) {
      setStatus('Could not copy MML URL.', true);
    }
  });

  btnCopyGlb?.addEventListener('click', async () => {
    if (!bodyGlbUrl) return;
    try {
      await navigator.clipboard.writeText(bodyGlbUrl);
      setStatus('Body GLB URL copied.', false);
    } catch (_) {
      setStatus('Could not copy GLB URL.', true);
    }
  });

  return { open, close, setMode };
}
