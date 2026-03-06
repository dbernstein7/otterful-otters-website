let othersideFiles = [];
let currentOthersideIndex = 0;
let othersideLoadedCount = 0;
const OTHERSIDE_PAGE_SIZE = 48;

function encodePath(pathStr) {
  return pathStr
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

function originalSrc(name) {
  return encodePath(`Otherside Otter Photos/${name}`);
}

function thumbSrc(thumbName) {
  return encodePath(`Otherside Otter Photos_thumbnails/${thumbName}`);
}

async function loadManifest() {
  const res = await fetch('/api/otherside-manifest');
  if (!res.ok) throw new Error(`Manifest HTTP ${res.status}`);
  const data = await res.json();
  return data.files || [];
}

function updateCount() {
  const el = document.getElementById('othersideGalleryCount');
  if (!el) return;
  el.textContent = `${othersideFiles.length.toLocaleString('en-US')} photos`;
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
  img.alt = `Otherside Otter ${index + 1}`;
  img.src = '';

  img.onerror = function () {
    // Fallback to original if thumbnail missing
    if (this.src && this.src.includes('Otherside%20Otter%20Photos_thumbnails')) {
      this.src = this.dataset.full;
      return;
    }
  };

  card.appendChild(img);

  card.addEventListener('click', () => {
    currentOthersideIndex = index;
    openOthersideModal(currentOthersideIndex);
  });

  return card;
}

function renderNextBatch() {
  const grid = document.getElementById('othersideFullGallery');
  if (!grid) return;

  const frag = document.createDocumentFragment();

  const nextEnd = Math.min(othersideFiles.length, othersideLoadedCount + OTHERSIDE_PAGE_SIZE);
  for (let i = othersideLoadedCount; i < nextEnd; i++) {
    const card = buildCard(othersideFiles[i], i);
    frag.appendChild(card);
  }
  grid.appendChild(frag);

  // Set src for all new images so they load (loading="lazy" still lets browser prioritize)
  const added = nextEnd - othersideLoadedCount;
  const allImgs = grid.querySelectorAll('img.otherside-grid-img');
  for (let i = allImgs.length - added; i < allImgs.length; i++) {
    const img = allImgs[i];
    if (img && img.dataset.src) img.src = img.dataset.src;
  }

  othersideLoadedCount = nextEnd;

  const loadMoreBtn = document.getElementById('othersideLoadMore');
  if (loadMoreBtn) {
    loadMoreBtn.style.display = othersideLoadedCount < othersideFiles.length ? 'inline-flex' : 'none';
  }
}

function openOthersideModal(index) {
  const modal = document.getElementById('othersideModal');
  const modalImage = document.getElementById('othersideModalImage');
  if (!modal || !modalImage) return;

  const file = othersideFiles[index];
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

function closeOthersideModal() {
  const modal = document.getElementById('othersideModal');
  if (!modal) return;
  modal.classList.remove('active');
  document.body.style.overflow = '';
}

function navigateOthersideModal(direction) {
  if (!othersideFiles.length) return;
  if (direction === 'next') currentOthersideIndex = (currentOthersideIndex + 1) % othersideFiles.length;
  if (direction === 'prev') currentOthersideIndex = (currentOthersideIndex - 1 + othersideFiles.length) % othersideFiles.length;
  openOthersideModal(currentOthersideIndex);
}

function setupModalHandlers() {
  const modal = document.getElementById('othersideModal');
  const closeBtn = document.querySelector('.otherside-modal-close');
  const prevBtn = document.querySelector('.otherside-modal-prev');
  const nextBtn = document.querySelector('.otherside-modal-next');

  if (!modal) return;

  if (!modal.dataset.handlersWired) {
    modal.dataset.handlersWired = 'true';

    if (closeBtn) closeBtn.addEventListener('click', closeOthersideModal);
    if (prevBtn) prevBtn.addEventListener('click', () => navigateOthersideModal('prev'));
    if (nextBtn) nextBtn.addEventListener('click', () => navigateOthersideModal('next'));

    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeOthersideModal();
    });

    document.addEventListener('keydown', (e) => {
      const isActive = modal.classList.contains('active');
      if (!isActive) return;
      if (e.key === 'Escape') closeOthersideModal();
      if (e.key === 'ArrowLeft') navigateOthersideModal('prev');
      if (e.key === 'ArrowRight') navigateOthersideModal('next');
    });
  }
}

function setupMobileNav() {
  const menuBtn = document.querySelector('.nav-menu-btn');
  const drawer = document.getElementById('navDrawer');
  const overlay = document.getElementById('navDrawerOverlay');
  if (!menuBtn || !drawer || !overlay) return;

  function openDrawer() {
    drawer.classList.add('is-open');
    overlay.classList.add('is-open');
    menuBtn.setAttribute('aria-expanded', 'true');
    drawer.setAttribute('aria-hidden', 'false');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeDrawer() {
    drawer.classList.remove('is-open');
    overlay.classList.remove('is-open');
    menuBtn.setAttribute('aria-expanded', 'false');
    drawer.setAttribute('aria-hidden', 'true');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  menuBtn.addEventListener('click', () => {
    if (drawer.classList.contains('is-open')) closeDrawer();
    else openDrawer();
  });

  overlay.addEventListener('click', closeDrawer);

  document.querySelectorAll('.nav-drawer-pill').forEach((pill) => {
    pill.addEventListener('click', () => closeDrawer());
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  setupMobileNav();

  try {
    othersideFiles = await loadManifest();
    updateCount();

    // Randomize order for a more fun gallery (same vibe as homepage carousel)
    othersideFiles = [...othersideFiles].sort(() => Math.random() - 0.5);

    const loadMoreBtn = document.getElementById('othersideLoadMore');
    if (loadMoreBtn) {
      loadMoreBtn.addEventListener('click', renderNextBatch);
    }

    renderNextBatch();
  } catch (err) {
    console.error('Failed to load Otherside gallery:', err);
    const grid = document.getElementById('othersideFullGallery');
    if (grid) {
      grid.innerHTML = '<div style="padding: 40px; text-align:center; color: var(--text-muted);">Failed to load gallery. Please try again.</div>';
    }
  }
});

