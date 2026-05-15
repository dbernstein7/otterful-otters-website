/**
 * Otterful asset inspector — 2D image, 3D MML rig preview, core traits, GLB/MML downloads.
 */
const CORE_TRAIT_SKIP = new Set(['trait count', 'compiler']);

function parseMmlUrls(html) {
  const urls = { body: null, wearables: [] };
  const char = html.match(/<\s*m-character\b([^>]*)>/i);
  if (char) {
    const sm = char[1].match(/(?:^|[\s])src\s*=\s*(["'])([\s\S]*?)\1/i);
    if (sm) urls.body = sm[2].replace(/&amp;/gi, '&').trim();
  }
  const modelRe = /<\s*m-model\b([^>]*?)(?:\/>|>)/gi;
  let mm;
  while ((mm = modelRe.exec(html))) {
    const block = mm[1];
    const srcM = block.match(/(?:^|[\s])src\s*=\s*(["'])([\s\S]*?)\1/i);
    const sockM = block.match(/(?:^|[\s])socket\s*=\s*(["'])([\s\S]*?)\1/i);
    if (srcM) {
      urls.wearables.push({
        socket: sockM ? sockM[2].trim() : '',
        src: srcM[2].replace(/&amp;/gi, '&').trim(),
      });
    }
  }
  return urls;
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
  const r = await fetch(url);
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
 * @param {{
 *   modal: HTMLElement;
 *   onClose?: () => void;
 * }} opts
 */
export function initAssetInspector(opts) {
  const { modal, onClose } = opts;
  const frame = modal.querySelector('.asset-inspector-frame');
  const titleEl = modal.querySelector('[data-asset-title]');
  const traitsEl = modal.querySelector('[data-asset-traits]');
  const statusEl = modal.querySelector('[data-asset-status]');
  const img2d = modal.querySelector('[data-asset-2d]');
  const previewWrap = modal.querySelector('[data-asset-3d-wrap]');
  const canvas = modal.querySelector('[data-asset-3d-canvas]');
  const toggle2d = modal.querySelector('[data-asset-mode="2d"]');
  const toggle3d = modal.querySelector('[data-asset-mode="3d"]');
  const btnClose = modal.querySelector('[data-asset-close]');
  const btnGlb = modal.querySelector('[data-asset-dl-glb]');
  const btnMml = modal.querySelector('[data-asset-dl-mml]');
  const btnCopyGlb = modal.querySelector('[data-asset-copy-glb]');
  const btnCopyMml = modal.querySelector('[data-asset-copy-mml]');
  const glbLinksEl = modal.querySelector('[data-asset-glb-links]');

  let mode = '3d';
  let currentId = null;
  let bodyGlbUrl = null;
  let mmlDocUrl = null;
  let mmlHtml = null;
  let rigMount = null;

  function setStatus(msg, isError) {
    if (!statusEl) return;
    statusEl.textContent = msg || '';
    statusEl.classList.toggle('is-error', !!isError);
    if (!isError && msg) {
      setTimeout(() => {
        if (statusEl.textContent === msg) statusEl.textContent = '';
      }, 3200);
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

  async function ensureRig() {
    if (rigMount || !canvas || !previewWrap) return rigMount;
    const href = new URL('../mml-rig-preview/mml-rig-preview.mjs', import.meta.url).href;
    const mod = await import(href);
    rigMount = mod.mountMmlRigPreview({
      container: previewWrap,
      canvas,
      getOrbitDistance: () => 2.34,
      onStatus: (msg) => setStatus(msg, false),
    });
    return rigMount;
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

  function renderGlbLinks(urls) {
    if (!glbLinksEl) return;
    const items = [];
    if (urls.body) {
      items.push({ label: 'Body (fur)', url: urls.body });
    }
    urls.wearables.forEach((w) => {
      const label = w.socket ? `Wearable (${w.socket})` : 'Wearable';
      items.push({ label, url: w.src });
    });
    if (!items.length) {
      glbLinksEl.innerHTML = '';
      glbLinksEl.hidden = true;
      return;
    }
    glbLinksEl.hidden = false;
    glbLinksEl.innerHTML =
      '<p class="asset-inspector-glb-links-title">GLB files in this MML</p>' +
      items
        .map(
          (it) =>
            `<a class="asset-inspector-glb-link" href="${escapeHtml(it.url)}" target="_blank" rel="noopener noreferrer" download>${escapeHtml(it.label)}</a>`
        )
        .join('');
  }

  async function load(id) {
    currentId = id;
    bodyGlbUrl = null;
    mmlHtml = null;
    const origin = window.location.origin;
    mmlDocUrl = `${origin}/api/mml?id=${id}`;
    const metaUrl = `${origin}/metadata/${id}.json`;
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
      const urls = parseMmlUrls(html);
      bodyGlbUrl = urls.body;
      renderGlbLinks(urls);
      if (btnGlb) btnGlb.disabled = !bodyGlbUrl;
      if (btnCopyGlb) btnCopyGlb.disabled = !bodyGlbUrl;

      if (mode === '3d') {
        const mount = await ensureRig();
        await mount.show(html, mmlDocUrl);
      }
      setStatus('', false);
    } catch (e) {
      renderTraits(null);
      if (glbLinksEl) {
        glbLinksEl.innerHTML = '';
        glbLinksEl.hidden = true;
      }
      if (btnGlb) btnGlb.disabled = true;
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
    currentId = null;
    onClose?.();
  }

  toggle2d?.addEventListener('click', () => {
    setMode('2d');
  });
  toggle3d?.addEventListener('click', async () => {
    setMode('3d');
    if (currentId && mmlHtml) {
      try {
        const mount = await ensureRig();
        await mount.show(mmlHtml, mmlDocUrl);
      } catch (e) {
        setStatus(e?.message || String(e), true);
      }
    }
  });

  btnClose?.addEventListener('click', close);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('is-open')) close();
  });

  btnMml?.addEventListener('click', async () => {
    if (!currentId) return;
    try {
      setStatus('Preparing MML…', false);
      const html = mmlHtml || (await fetchText(mmlDocUrl));
      downloadBlob(`otterful-${currentId}.html`, new Blob([html], { type: 'text/html;charset=utf-8' }));
      setStatus('MML downloaded.', false);
    } catch (e) {
      setStatus(e?.message || String(e), true);
    }
  });

  btnGlb?.addEventListener('click', async () => {
    if (!bodyGlbUrl || !currentId) return;
    try {
      setStatus('Downloading body GLB…', false);
      const stem = bodyGlbUrl.split('/').pop()?.split('?')[0] || `otter-${currentId}.glb`;
      await downloadUrlAsFile(bodyGlbUrl, stem.endsWith('.glb') ? stem : `otter-${currentId}-body.glb`);
      setStatus('Body GLB downloaded.', false);
    } catch (e) {
      setStatus(e?.message || String(e), true);
    }
  });

  btnCopyMml?.addEventListener('click', async () => {
    if (!mmlDocUrl) return;
    try {
      await navigator.clipboard.writeText(mmlDocUrl);
      setStatus('MML URL copied.', false);
    } catch (e) {
      setStatus('Could not copy MML URL.', true);
    }
  });

  btnCopyGlb?.addEventListener('click', async () => {
    if (!bodyGlbUrl) return;
    try {
      await navigator.clipboard.writeText(bodyGlbUrl);
      setStatus('Body GLB URL copied.', false);
    } catch (e) {
      setStatus('Could not copy GLB URL.', true);
    }
  });

  return { open, close, setMode };
}
