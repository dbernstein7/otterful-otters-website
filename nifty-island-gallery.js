let niftyIslandFiles = [];
let currentNiftyIslandIndex = 0;
let niftyIslandLoadedCount = 0;
const NIFTY_ISLAND_PAGE_SIZE = 48;

function encodePath(pathStr) {
  return pathStr
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

function originalSrc(name) {
  return encodePath(`Nifty Photos/${name}`);
}

function thumbSrc(thumbName) {
  return encodePath(`Nifty Photos_thumbnails/${thumbName}`);
}

async function loadManifest() {
  const res = await fetch('/api/nifty-manifest');
  if (!res.ok) throw new Error(`Manifest HTTP ${res.status}`);
  const data = await res.json();
  return data.files || [];
}

function updateCount() {
  const el = document.getElementById('niftyIslandGalleryCount');
  if (!el) return;
  el.textContent = `${niftyIslandFiles.length.toLocaleString('en-US')} photos`;
}

function buildCard(file, index) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'otherside-grid-item';
  card.setAttribute('aria-label', `Open image ${index + 1}`);

  const img = document.createElement('img');
  img.className = 'otherside-grid-img';
  img.decoding = 'async';
  img.loading = 'lazy';

  const tSrc = file.hasThumbnail ? thumbSrc(file.thumbName) : originalSrc(file.name);
  img.dataset.src = tSrc;
  img.dataset.full = originalSrc(file.name);
  img.alt = `Nifty Island ${index + 1}`;
  img.src = '';

  img.onerror = function () {
    if (this.src && this.src.includes('Nifty%20Photos_thumbnails')) {
      this.src = this.dataset.full;
      return;
    }
  };

  card.appendChild(img);

  card.addEventListener('click', () => {
    currentNiftyIslandIndex = index;
    openNiftyIslandModal(currentNiftyIslandIndex);
  });

  return card;
}

function renderNextBatch() {
  const grid = document.getElementById('niftyIslandFullGallery');
  if (!grid) return;

  const frag = document.createDocumentFragment();

  const nextEnd = Math.min(niftyIslandFiles.length, niftyIslandLoadedCount + NIFTY_ISLAND_PAGE_SIZE);
  for (let i = niftyIslandLoadedCount; i < nextEnd; i++) {
    const card = buildCard(niftyIslandFiles[i], i);
    frag.appendChild(card);
  }
  grid.appendChild(frag);

  const added = nextEnd - niftyIslandLoadedCount;
  const allImgs = grid.querySelectorAll('img.otherside-grid-img');
  for (let i = allImgs.length - added; i < allImgs.length; i++) {
    const img = allImgs[i];
    if (img && img.dataset.src) img.src = img.dataset.src;
  }

  niftyIslandLoadedCount = nextEnd;

  const loadMoreBtn = document.getElementById('niftyIslandLoadMore');
  if (loadMoreBtn) {
    loadMoreBtn.style.display = niftyIslandLoadedCount < niftyIslandFiles.length ? 'inline-flex' : 'none';
  }
}

function openNiftyIslandModal(index) {
  const modal = document.getElementById('niftyIslandModal');
  const modalImage = document.getElementById('niftyIslandModalImage');
  if (!modal || !modalImage) return;

  const file = niftyIslandFiles[index];
  if (!file) return;

  modalImage.style.opacity = '0';
  modalImage.onload = () => {
    modalImage.style.opacity = '1';
  };
  modalImage.dataset.thumb = thumbSrc(file.thumbName);
  modalImage.onerror = function () {
    if (this.dataset.thumb) {
      this.src = this.dataset.thumb;
      this.onerror = null;
    }
  };
  modalImage.src = originalSrc(file.name);

  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
  setupModalHandlers();
}

function closeNiftyIslandModal() {
  const modal = document.getElementById('niftyIslandModal');
  if (!modal) return;
  modal.classList.remove('active');
  document.body.style.overflow = '';
}

function navigateNiftyIslandModal(direction) {
  if (!niftyIslandFiles.length) return;
  if (direction === 'next')
    currentNiftyIslandIndex = (currentNiftyIslandIndex + 1) % niftyIslandFiles.length;
  if (direction === 'prev')
    currentNiftyIslandIndex =
      (currentNiftyIslandIndex - 1 + niftyIslandFiles.length) % niftyIslandFiles.length;
  openNiftyIslandModal(currentNiftyIslandIndex);
}

function setupModalHandlers() {
  const modal = document.getElementById('niftyIslandModal');
  const closeBtn = document.querySelector('#niftyIslandModal .otherside-modal-close');
  const prevBtn = document.querySelector('#niftyIslandModal .otherside-modal-prev');
  const nextBtn = document.querySelector('#niftyIslandModal .otherside-modal-next');

  if (!modal) return;

  if (!modal.dataset.handlersWired) {
    modal.dataset.handlersWired = 'true';

    if (closeBtn) closeBtn.addEventListener('click', closeNiftyIslandModal);
    if (prevBtn) prevBtn.addEventListener('click', () => navigateNiftyIslandModal('prev'));
    if (nextBtn) nextBtn.addEventListener('click', () => navigateNiftyIslandModal('next'));

    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeNiftyIslandModal();
    });

    document.addEventListener('keydown', (e) => {
      const isActive = modal.classList.contains('active');
      if (!isActive) return;
      if (e.key === 'Escape') closeNiftyIslandModal();
      if (e.key === 'ArrowLeft') navigateNiftyIslandModal('prev');
      if (e.key === 'ArrowRight') navigateNiftyIslandModal('next');
    });
  }
}

function setupMobileNav() {
  const menuBtn = document.querySelector('.nav-menu-btn');
  const drawer = document.getElementById('navDrawer');
  const overlay = document.getElementById('navDrawerOverlay');
  if (!menuBtn || !drawer || !overlay) return;

  function resetDrawerState() {
    drawer.classList.remove('is-open');
    overlay.classList.remove('is-open');
    menuBtn.setAttribute('aria-expanded', 'false');
    drawer.setAttribute('aria-hidden', 'true');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  function openDrawer() {
    drawer.classList.add('is-open');
    overlay.classList.add('is-open');
    menuBtn.setAttribute('aria-expanded', 'true');
    drawer.setAttribute('aria-hidden', 'false');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeDrawer() {
    resetDrawerState();
  }

  resetDrawerState();
  window.addEventListener('pageshow', resetDrawerState);

  menuBtn.addEventListener('click', () => {
    if (drawer.classList.contains('is-open')) closeDrawer();
    else openDrawer();
  });

  overlay.addEventListener('click', closeDrawer);

  document.querySelectorAll('.nav-drawer-pill').forEach((pill) => {
    pill.addEventListener('click', () => {
      closeDrawer();
      setTimeout(resetDrawerState, 0);
    });
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  setupMobileNav();

  try {
    niftyIslandFiles = await loadManifest();
    updateCount();

    niftyIslandFiles = [...niftyIslandFiles].sort(() => Math.random() - 0.5);

    const loadMoreBtn = document.getElementById('niftyIslandLoadMore');
    if (loadMoreBtn) {
      loadMoreBtn.addEventListener('click', renderNextBatch);
    }

    renderNextBatch();
  } catch (err) {
    console.error('Failed to load Nifty Island gallery:', err);
    const grid = document.getElementById('niftyIslandFullGallery');
    if (grid) {
      grid.innerHTML =
        '<div style="padding: 40px; text-align:center; color: var(--text-muted);">Failed to load gallery. Please try again.</div>';
    }
  }
});
