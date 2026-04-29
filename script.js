// Dashboard interactivity and data updates

// Gallery state
let currentPage = 1;
let itemsPerPage = 15;
let allOtters = [];
let displayedOtters = [];
let totalOtters = 2221;
let metadataCache = {};
let allTraits = {
    Base: new Set(),
    Fur: new Set(),
    Shirt: new Set(),
    Eyes: new Set(),
    Hats: new Set(),
    Mouth: new Set()
};

document.addEventListener('DOMContentLoaded', function() {
    try {
        console.log('DOM loaded, initializing...');
        
        // Check if running from file:// protocol (local file)
        if (window.location.protocol === 'file:') {
            console.warn('⚠️ Running from file:// protocol.');
            console.warn('⚠️ Metadata and images may not load due to browser security restrictions.');
            console.warn('⚠️ Please use a local server:');
            console.warn('   1. Run: python server.py');
            console.warn('   2. Open: http://localhost:8000');
        } else {
            console.log('✓ Running from HTTP server - metadata should load correctly');
        }
        
        // Initialize animations
        try {
            initAnimations();
        } catch (err) {
            console.error('Error initializing animations:', err);
        }
        
        // Setup navigation
        try {
            setupNavigation();
        } catch (err) {
            console.error('Error setting up navigation:', err);
        }

        try {
            setupMobileNav();
        } catch (err) {
            console.error('Error setting up mobile nav:', err);
        }

        try {
            handleInitialHashNavigation();
        } catch (err) {
            console.error('Error handling initial hash navigation:', err);
        }
        
        // Setup refresh button
        try {
            setupRefreshButton();
        } catch (err) {
            console.error('Error setting up refresh button:', err);
        }
        
        // Setup Otherside gallery
        try {
            initOthersideGallery();
        } catch (err) {
            console.error('Error setting up Otherside gallery:', err);
        }
        
        // Setup Nifty gallery
        try {
            initNiftyGallery();
        } catch (err) {
            console.error('Error setting up Nifty gallery:', err);
        }
        
        // Setup electric border for team image
        try {
            initElectricBorder();
        } catch (err) {
            console.error('Error setting up electric border:', err);
        }
        
        // Initialize gallery
        try {
            initGallery();
        } catch (err) {
            console.error('Error initializing gallery:', err);
            // Try to at least show something
            const gallery = document.getElementById('otterGallery');
            if (gallery && gallery.innerHTML.trim() === '') {
                gallery.innerHTML = '<div style="padding: 40px; text-align: center; color: var(--text-muted);">Error loading gallery. Please check console for details.</div>';
            }
        }
        
        // Fetch initial statistics
        try {
            fetchCollectionStats();
            setupDataUpdates();
        } catch (err) {
            console.error('Error setting up data updates:', err);
        }
    } catch (error) {
        console.error('Critical error during initialization:', error);
        alert('Error loading page. Please check the browser console (F12) for details.');
    }
});

function handleInitialHashNavigation() {
    // Allow other pages to deep-link into sections of index.html via hashes.
    // Example: index.html#analytics, index.html#collection, etc.
    const raw = (window.location.hash || '').replace(/^#/, '').trim().toLowerCase();
    if (!raw) return;

    const key = raw.split('?')[0].split('&')[0];

    const scrollTargets = {
        home: function () { window.scrollTo({ top: 0, behavior: 'smooth' }); },
        analytics: function () {
            const el = document.getElementById('collectionOverview');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        },
        collection: function () {
            const el = document.querySelector('.gallery-section');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        },
        explore: function () {
            const el = document.getElementById('exploreSection');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        },
        team: function () {
            const el = document.getElementById('teamSection');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    if (!scrollTargets[key]) return;

    // Update active state for the in-page (non-link) pills on desktop.
    const navPills = document.querySelectorAll('.nav-pill');
    navPills.forEach((pill) => {
        if (pill.tagName !== 'A') pill.classList.remove('active');
    });
    navPills.forEach((pill) => {
        if (pill.tagName === 'A') return;
        const txt = (pill.textContent || '').trim().toLowerCase();
        if (txt === key) pill.classList.add('active');
    });

    // Let layout settle before scrolling (images/fonts can shift heights).
    setTimeout(() => scrollTargets[key](), 50);
}

function initAnimations() {
    // Add stagger animation to cards
    const cards = document.querySelectorAll('.stat-card, .info-card, .analytics-card, .link-card');
    cards.forEach((card, index) => {
        card.style.opacity = '0';
        setTimeout(() => {
            card.style.transition = 'opacity 0.6s ease-out, transform 0.6s ease-out';
            card.style.opacity = '1';
        }, index * 100);
    });
}

function setupNavigation() {
    const navPills = document.querySelectorAll('.nav-pill');
    
    navPills.forEach((pill) => {
        // Skip if it's a link (like 3D Builder)
        if (pill.tagName === 'A') {
            return; // Let the link work normally
        }
        
        pill.addEventListener('click', function() {
            const pillText = this.textContent.trim();
            
            // Remove active class from all pills
            navPills.forEach(p => {
                if (p.tagName !== 'A') {
                    p.classList.remove('active');
                }
            });
            // Add active class to clicked pill
            this.classList.add('active');
            
            // Add glow effect
            this.style.boxShadow = '0 0 30px rgba(30, 79, 214, 0.8)';
            setTimeout(() => {
                this.style.boxShadow = '';
            }, 300);
            
            // Scroll to appropriate section based on button text
            if (pillText === 'Home') {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            } else if (pillText === 'Collection') {
                const gallery = document.querySelector('.gallery-section');
                if (gallery) {
                    gallery.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            } else if (pillText === 'Analytics') {
                const collectionOverview = document.getElementById('collectionOverview');
                if (collectionOverview) {
                    collectionOverview.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            } else if (pillText === 'Explore') {
                const explore = document.getElementById('exploreSection');
                if (explore) {
                    explore.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            } else if (pillText === 'Team') {
                const team = document.getElementById('teamSection');
                if (team) {
                    team.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }
        });
    });
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

    // Reset stale drawer state after back/forward cache restores.
    resetDrawerState();
    window.addEventListener('pageshow', resetDrawerState);

    menuBtn.addEventListener('click', function () {
        if (drawer.classList.contains('is-open')) closeDrawer();
        else openDrawer();
    });

    overlay.addEventListener('click', closeDrawer);

    var scrollTargets = {
        home: function () { window.scrollTo({ top: 0, behavior: 'smooth' }); },
        analytics: function () { document.getElementById('collectionOverview') && document.getElementById('collectionOverview').scrollIntoView({ behavior: 'smooth', block: 'start' }); },
        collection: function () { var el = document.querySelector('.gallery-section'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
        explore: function () { document.getElementById('exploreSection') && document.getElementById('exploreSection').scrollIntoView({ behavior: 'smooth', block: 'start' }); },
        team: function () { document.getElementById('teamSection') && document.getElementById('teamSection').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    };

    document.querySelectorAll('.nav-drawer-pill').forEach(function (pill) {
        pill.addEventListener('click', function (e) {
            var scrollKey = this.getAttribute('data-scroll');
            if (scrollKey && scrollTargets[scrollKey]) {
                e.preventDefault();
                closeDrawer();
                scrollTargets[scrollKey]();
            } else if (this.tagName === 'A') {
                closeDrawer();
                // Ensure state is clean even if browser navigates immediately.
                setTimeout(resetDrawerState, 0);
            }
        });
    });
}

function setupRefreshButton() {
    const refreshBtn = document.querySelector('.action-btn.secondary');
    
    if (refreshBtn) {
        refreshBtn.addEventListener('click', async function() {
            console.log('Refresh button clicked!');
            
            // Add loading state
            const icon = this.querySelector('.icon');
            const originalTransform = icon.style.transform;
            
            this.disabled = true;
            this.style.opacity = '0.6';
            icon.style.transition = 'transform 0.5s linear';
            icon.style.transform = 'rotate(360deg)';
            
            try {
                // Fetch and update stats from OpenSea
                const success = await fetchCollectionStats();
                
                if (success) {
                    // Show success feedback
                    showNotification('Data refreshed successfully!', 'success');
                } else {
                    showNotification('Failed to fetch latest data. Using cached values.', 'info');
                }
            } catch (error) {
                console.error('Error in refresh:', error);
                showNotification('Error refreshing data. Please try again.', 'info');
            } finally {
                // Reset button
                this.disabled = false;
                this.style.opacity = '1';
                icon.style.transition = 'transform 0.3s ease-out';
                icon.style.transform = originalTransform;
            }
        });
    }
}

async function fetchCollectionStats() {
    try {
        const apiUrl = '/api/opensea-stats';
        console.log('Fetching OpenSea v2 data from:', apiUrl);

        const response = await fetch(apiUrl);
        if (!response.ok) {
            let text = '';
            try {
                text = await response.text();
            } catch {
                // ignore
            }
            throw new Error(`API error (${response.status}): ${text || response.statusText}`);
        }

        const data = await response.json();
        if (!data || data.error) {
            throw new Error(data?.error || 'Unknown API error');
        }

        const total = data?.stats?.total;
        const intervals = data?.stats?.intervals || [];
        const collection = data?.collection || null;
        const topOffer = data?.topOffer || null;
        const displayed = data?.openseaDisplayed || null;
        const pricing = data?.pricing || null;

        if (!total) throw new Error('Missing stats.total from API');
        const symbol = total.floor_price_symbol || 'APE';

        // ---------- Top stat cards ----------
        if (typeof total.floor_price === 'number') {
            updateStatValue('stat-floor-price', formatNumber(total.floor_price), symbol);
            const floorEl = document.getElementById('analytics-floor');
            if (floorEl) floorEl.textContent = `Floor: ${formatNumber(total.floor_price)} ${symbol}`;
        }

        // Total Volume:
        // OpenSea v2 stats `total.volume` appears to be in ETH-equivalent (not in APE),
        // so convert to the listing currency using `pricing.eth_price` when available.
        if (displayed?.total_volume !== null && displayed?.total_volume !== undefined) {
            updateStatValue('stat-total-volume', formatLargeNumber(displayed.total_volume), displayed.total_volume_symbol || symbol);
        } else if (typeof total.volume === 'number' && pricing?.eth_price) {
            const ethPerToken = Number(pricing.eth_price);
            if (Number.isFinite(ethPerToken) && ethPerToken > 0) {
                const nativeVol = total.volume / ethPerToken;
                updateStatValue('stat-total-volume', formatLargeNumber(nativeVol), symbol);
            }
        } // else: don't overwrite the existing DOM value

        const oneDay = intervals.find(i => {
            const name = String(i?.interval || '');
            return name.includes('one_day') || name.includes('1_day') || name.includes('24');
        });
        // 24h Volume (same ETH->APE conversion)
        if (displayed?.volume_24h !== null && displayed?.volume_24h !== undefined) {
            updateStatValue('stat-24h-volume', formatNumber(displayed.volume_24h), displayed.volume_24h_symbol || symbol);
        } else if (oneDay && typeof oneDay.volume === 'number' && pricing?.eth_price) {
            const ethPerToken = Number(pricing.eth_price);
            if (Number.isFinite(ethPerToken) && ethPerToken > 0) {
                const nativeVol24h = oneDay.volume / ethPerToken;
                updateStatValue('stat-24h-volume', formatNumber(nativeVol24h), symbol);
            }
        } // else: don't overwrite

        if (topOffer && typeof topOffer.value === 'number') {
            updateStatValue('stat-top-offer', formatNumber(topOffer.value), topOffer.currency || 'WAPE');
        }
        // Prefer OpenSea UI-displayed top offer when available
        if (displayed?.top_offer !== null && displayed?.top_offer !== undefined) {
            updateStatValue('stat-top-offer', formatNumber(displayed.top_offer), displayed.top_offer_symbol || 'WAPE');
        }

        // OpenSea v2 stats endpoint does not include 1d floor % change in this payload
        const floorChangeEl = document.getElementById('stat-floor-change');
        if (floorChangeEl) floorChangeEl.textContent = 'Updated';

        // ---------- Collection Overview ----------
        const totalSupply = typeof collection?.total_supply === 'number' ? collection.total_supply : null;
        const numOwners = typeof total.num_owners === 'number' ? total.num_owners : null;

        if (totalSupply !== null) {
            const el = document.getElementById('overview-total-items');
            if (el) el.textContent = totalSupply.toLocaleString('en-US');
        }
        if (numOwners !== null) {
            const ownersEl = document.getElementById('overview-owners');
            if (ownersEl) ownersEl.textContent = numOwners.toLocaleString('en-US');
        }
        if (totalSupply !== null && numOwners !== null && totalSupply > 0) {
            const pct = (numOwners / totalSupply) * 100;
            const ownersPctEl = document.getElementById('overview-owners-percent');
            if (ownersPctEl) ownersPctEl.textContent = `(${pct.toFixed(1)}%)`;

            const ownersPctText = document.getElementById('analytics-owners-percent');
            if (ownersPctText) ownersPctText.textContent = `Unique Owners: ${pct.toFixed(1)}%`;

            const ownersBar = document.getElementById('analytics-owners-bar');
            if (ownersBar) ownersBar.style.width = `${Math.min(100, Math.max(0, pct)).toFixed(1)}%`;

            const avg = totalSupply / Math.max(1, numOwners);
            const avgEl = document.getElementById('analytics-avg-per-owner');
            if (avgEl) avgEl.textContent = `Average: ${avg.toFixed(2)} per owner`;
        }

        // Listed % (from OpenSea UI scrape)
        if (displayed?.listed_percent !== null && displayed?.listed_percent !== undefined) {
            const listedPct = displayed.listed_percent;
            const overviewListed = document.getElementById('overview-listed');
            if (overviewListed) overviewListed.textContent = `${listedPct.toFixed(1)}%`;

            const listedText = document.getElementById('analytics-listed');
            if (listedText) listedText.textContent = `Listed: ${listedPct.toFixed(1)}%`;

            const availText = document.getElementById('analytics-available');
            if (availText) availText.textContent = `Available: ${(100 - listedPct).toFixed(1)}%`;

            const listedBar = document.getElementById('analytics-listed-bar');
            if (listedBar) listedBar.style.width = `${Math.min(100, Math.max(0, listedPct)).toFixed(1)}%`;
        }

        return true;
    } catch (error) {
        console.error('fetchCollectionStats failed:', error);
        return false;
    }
}

function normalizeLikelyBaseUnits(value, symbol) {
    if (value === undefined || value === null || !Number.isFinite(value)) return value;
    // If the API ever returns token base units (eg wei), this will be enormous.
    // Use a conservative threshold so we don't accidentally shrink legitimate large volumes.
    if (Math.abs(value) >= 1e12 && ['APE', 'WAPE', 'ETH', 'WETH'].includes(String(symbol).toUpperCase())) {
        return value / 1e18;
    }
    return value;
}

function formatNumber(num) {
    if (num === undefined || num === null || isNaN(num)) return '0.00';
    return num.toLocaleString('en-US', { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 3 
    });
}

function formatLargeNumber(num) {
    if (num === undefined || num === null || isNaN(num)) return '0';
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return formatNumber(num);
}

function updateStatValue(elementId, value, unit) {
    const element = document.getElementById(elementId);
    if (element) {
        // Animate the update
        element.style.transform = 'scale(1.1)';
        element.style.transition = 'transform 0.3s ease-out';
        
        // Update the value
        const unitSpan = element.querySelector('.stat-unit');
        if (unitSpan) {
            element.innerHTML = `${value} <span class="stat-unit">${unit}</span>`;
        } else {
            element.innerHTML = `${value} <span class="stat-unit">${unit}</span>`;
        }
        
        setTimeout(() => {
            element.style.transform = 'scale(1)';
        }, 300);
    }
}

function updateStatChange(elementId, changePercent) {
    const element = document.getElementById(elementId);
    if (element) {
        const isPositive = changePercent >= 0;
        element.textContent = `${isPositive ? '+' : ''}${changePercent.toFixed(1)}% (1d)`;
        element.className = `stat-change ${isPositive ? 'positive' : 'negative'}`;
    }
}

async function updateStats() {
    // Fetch real data from API
    const success = await fetchCollectionStats();
    
    if (success) {
        // Animate stat updates
        const statValues = document.querySelectorAll('.stat-value');
        
        statValues.forEach(stat => {
            stat.style.transform = 'scale(1.1)';
            stat.style.transition = 'transform 0.3s ease-out';
            
            setTimeout(() => {
                stat.style.transform = 'scale(1)';
            }, 300);
        });
    }
    
    // Update bar animations
    const barFills = document.querySelectorAll('.bar-fill');
    barFills.forEach(bar => {
        const currentWidth = bar.style.width;
        bar.style.width = '0%';
        setTimeout(() => {
            bar.style.width = currentWidth;
        }, 100);
    });
}

function setupDataUpdates() {
    // Update statistics every 30 seconds
    setInterval(() => {
        console.log('Checking for data updates...');
        fetchCollectionStats();
    }, 30000);
}

function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 80px;
        right: 20px;
        padding: 16px 24px;
        background: linear-gradient(135deg, rgba(30, 79, 214, 0.9) 0%, rgba(42, 109, 245, 0.9) 100%);
        border: 1px solid rgba(90, 140, 255, 0.65);
        border-radius: 12px;
        color: #ffffff;
        font-weight: 600;
        z-index: 1000;
        box-shadow: 0 8px 32px rgba(30, 79, 214, 0.4);
        animation: slideInRight 0.3s ease-out;
        backdrop-filter: blur(10px);
    `;
    
    document.body.appendChild(notification);
    
    // Remove after 3 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease-out';
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
}

// Add CSS animations for notifications
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOutRight {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
    
    .notification-success {
        background: linear-gradient(135deg, rgba(46, 213, 115, 0.9) 0%, rgba(46, 213, 115, 0.7) 100%) !important;
        border-color: rgba(46, 213, 115, 0.8) !important;
    }
`;
document.head.appendChild(style);

// Add hover effects for interactive elements
document.querySelectorAll('.stat-card, .info-card, .link-card').forEach(card => {
    card.addEventListener('mouseenter', function() {
        this.style.transition = 'all 0.3s ease-out';
    });
});

// Add click ripple effect
document.querySelectorAll('.action-btn, .link-card').forEach(button => {
    button.addEventListener('click', function(e) {
        const ripple = document.createElement('span');
        const rect = this.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        const x = e.clientX - rect.left - size / 2;
        const y = e.clientY - rect.top - size / 2;
        
        ripple.style.cssText = `
            position: absolute;
            width: ${size}px;
            height: ${size}px;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.3);
            left: ${x}px;
            top: ${y}px;
            transform: scale(0);
            animation: ripple 0.6s ease-out;
            pointer-events: none;
        `;
        
        this.style.position = 'relative';
        this.style.overflow = 'hidden';
        this.appendChild(ripple);
        
        setTimeout(() => {
            ripple.remove();
        }, 600);
    });
});

// Add ripple animation
const rippleStyle = document.createElement('style');
rippleStyle.textContent = `
    @keyframes ripple {
        to {
            transform: scale(2);
            opacity: 0;
        }
    }
`;
document.head.appendChild(rippleStyle);

// Gallery Functions
function initGallery() {
    console.log('Initializing gallery...');
    
    // Generate array of all otter numbers
    allOtters = Array.from({ length: totalOtters }, (_, i) => i + 1);
    displayedOtters = [...allOtters];
    
    console.log(`Total otters: ${totalOtters}, Displayed: ${displayedOtters.length}`);
    
    // Setup load more button
    const loadMoreBtn = document.getElementById('loadMoreBtn');
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', loadMoreOtters);
    } else {
        console.error('Load more button not found!');
    }
    
    // Setup modal
    setupModal();
    
    // Load initial otters first (don't wait for metadata)
    const initialBatch = displayedOtters.slice(0, itemsPerPage);
    console.log(`Loading initial batch: ${initialBatch.length} otters`);
    
    loadOtters(initialBatch).then(() => {
        updateGalleryCount();
    }).catch(err => {
        console.error('Error loading initial otters:', err);
        updateGalleryCount();
    });
    
    // Show/hide load more button
    if (loadMoreBtn) {
        loadMoreBtn.style.display = displayedOtters.length > itemsPerPage ? 'inline-flex' : 'none';
    }
    
    // Test and load metadata in background (non-blocking)
    testMetadataLoading().then((success) => {
        if (success) {
            console.log('✓ Metadata loading works - traits should be available');
            // Load metadata for trait discovery
            loadMetadataSample().then(() => {
                console.log('Metadata sample loaded');
            }).catch(err => {
                console.error('Error loading metadata sample:', err);
            });
        } else {
            console.warn('⚠ Metadata test failed - traits may not be available');
            console.warn('⚠ Make sure you are using a local server (http://localhost:8000)');
            console.warn('⚠ Opening the HTML file directly (file://) will block metadata loading');
        }
    }).catch(err => {
        console.error('Error testing metadata loading:', err);
    });
}

async function loadOtters(otterNumbers) {
    const gallery = document.getElementById('otterGallery');
    if (!gallery) {
        console.error('Gallery element not found!');
        return;
    }
    
    console.log(`Loading ${otterNumbers.length} otters into gallery`);
    
    for (let index = 0; index < otterNumbers.length; index++) {
        const otterNum = otterNumbers[index];
        const card = await createOtterCard(otterNum);
        card.style.animationDelay = `${index * 0.02}s`;
        gallery.appendChild(card);
    }
}

async function createOtterCard(otterNum) {
    const card = document.createElement('div');
    card.className = 'otter-card';
    card.dataset.otterNumber = otterNum;
    
    const img = document.createElement('img');
    img.className = 'otter-image';
    const imagePath = `images_compressed/${otterNum}.png`;
    img.src = imagePath;
    img.alt = `Otterful Otter #${otterNum}`;
    img.loading = 'lazy'; // Use lazy loading for gallery images
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.display = 'block';
    img.style.opacity = '0';
    img.style.transition = 'opacity 0.3s ease-out';
    
    // Handle image load success
    img.onload = function() {
        this.style.opacity = '1';
    };
    
    // Handle image load error - try alternative paths
    img.onerror = function() {
        console.warn(`Failed to load image: ${imagePath}, trying alternatives...`);
        // Try with different case or extension
        const altPaths = [
            `images_compressed/${otterNum}.PNG`,
            `images_compressed/${otterNum}.jpg`,
            `images_compressed/${otterNum}.JPG`,
        ];
        
        let tried = 0;
        const tryNext = () => {
            if (tried < altPaths.length) {
                this.src = altPaths[tried++];
            } else {
                // All alternatives failed
                console.error(`✗ All image paths failed for otter #${otterNum}`);
                this.style.display = 'none';
                const errorDiv = document.createElement('div');
                errorDiv.style.cssText = 'padding: 20px; text-align: center; color: var(--text-muted); background: rgba(255,0,0,0.1); border: 1px solid rgba(255,0,0,0.3); border-radius: 8px; height: 100%; display: flex; align-items: center; justify-content: center; flex-direction: column;';
                errorDiv.innerHTML = `#${otterNum}<br><small>Image not found</small>`;
                if (!card.querySelector('.image-error')) {
                    card.appendChild(errorDiv);
                }
            }
        };
        
        this.onerror = tryNext;
        tryNext();
    };
    
    const number = document.createElement('div');
    number.className = 'otter-number';
    number.textContent = `#${otterNum}`;
    
    // Trait overlay (will be populated when metadata loads)
    const traitOverlay = document.createElement('div');
    traitOverlay.className = 'trait-overlay';
    traitOverlay.innerHTML = '<div class="trait-loading">Loading traits...</div>';
    
    card.appendChild(img);
    card.appendChild(number);
    card.appendChild(traitOverlay);
    
    // Load metadata for this otter (don't await, let it load in background)
    loadOtterMetadata(otterNum, traitOverlay);
    
    // Click to open modal
    card.addEventListener('click', () => openModal(otterNum));
    
    return card;
}

async function loadOtterMetadata(otterNum, traitOverlay) {
    // Check cache first
    if (metadataCache[otterNum]) {
        if (traitOverlay) {
            displayTraits(metadataCache[otterNum], traitOverlay);
        }
        return metadataCache[otterNum];
    }
    
    // Show loading state
    if (traitOverlay) {
        traitOverlay.innerHTML = '<div class="trait-loading">Loading traits...</div>';
    }
    
    try {
        const metadataPath = `metadata/${otterNum}.json`;
        const response = await fetch(metadataPath);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        // Validate data structure
        if (!data || typeof data !== 'object') {
            throw new Error('Invalid metadata format');
        }
        
        metadataCache[otterNum] = data;
        
        // Add traits to global set (for potential future use)
        if (data.attributes && Array.isArray(data.attributes)) {
            data.attributes.forEach(attr => {
                if (allTraits[attr.trait_type] && attr.trait_type !== 'Trait Count') {
                    allTraits[attr.trait_type].add(attr.value);
                }
            });
        }
        
        if (traitOverlay) {
            displayTraits(data, traitOverlay);
        }
        
        return data;
    } catch (error) {
        console.error(`Failed to load metadata for otter #${otterNum}:`, error);
        console.error(`  Attempted path: metadata/${otterNum}.json`);
        console.error(`  Current URL: ${window.location.href}`);
        
        // Check if it's a CORS issue
        if (window.location.protocol === 'file:') {
            if (traitOverlay) {
                traitOverlay.innerHTML = '<div class="trait-error">Use local server<br><small>file:// blocks metadata</small></div>';
            }
        } else if (error.message.includes('Failed to fetch') || error.message.includes('CORS')) {
            if (traitOverlay) {
                traitOverlay.innerHTML = '<div class="trait-error">CORS error<br><small>Check server config</small></div>';
            }
        } else {
            if (traitOverlay) {
                traitOverlay.innerHTML = '<div class="trait-error">Traits unavailable</div>';
            }
        }
        
        // Don't throw - just return null so the page continues to work
        return null;
    }
}

function displayTraits(metadata, traitOverlay) {
    if (!metadata) {
        console.warn('displayTraits called with no metadata');
        traitOverlay.innerHTML = '<div class="trait-error">No metadata</div>';
        return;
    }
    
    if (!metadata.attributes || !Array.isArray(metadata.attributes)) {
        console.warn('displayTraits: metadata has no attributes array', metadata);
        traitOverlay.innerHTML = '<div class="trait-error">No traits found</div>';
        return;
    }
    
    const filteredAttributes = metadata.attributes.filter(attr => attr.trait_type !== 'Trait Count');
    
    if (filteredAttributes.length === 0) {
        traitOverlay.innerHTML = '<div class="trait-error">No traits available</div>';
        return;
    }
    
    const traitsHtml = filteredAttributes.map(attr => {
        const traitType = attr.trait_type || 'Unknown';
        const traitValue = attr.value || 'N/A';
        return `
            <div class="trait-item-overlay">
                <span class="trait-type">${traitType}:</span>
                <span class="trait-value">${traitValue}</span>
            </div>
        `;
    }).join('');
    
    traitOverlay.innerHTML = `<div class="trait-content">${traitsHtml}</div>`;
}

async function loadMetadataSample() {
    console.log('Loading metadata sample to populate trait filters...');
    // Load a sample of metadata to populate trait filters
    const sampleSize = Math.min(1000, totalOtters);
    const sampleIndices = Array.from({ length: sampleSize }, (_, i) => Math.floor((i / sampleSize) * totalOtters) + 1);
    
    let loaded = 0;
    let failed = 0;
    
    // Load in smaller batches to avoid blocking
    const batchSize = 50;
    for (let i = 0; i < sampleIndices.length; i += batchSize) {
        const batch = sampleIndices.slice(i, i + batchSize);
        const promises = batch.map(async (otterNum) => {
            if (metadataCache[otterNum]) {
                loaded++;
                return;
            }
            
            try {
                const response = await fetch(`metadata/${otterNum}.json`);
                if (response.ok) {
                    const data = await response.json();
                    metadataCache[otterNum] = data;
                    loaded++;
                    
                    if (data.attributes) {
                        data.attributes.forEach(attr => {
                            if (allTraits[attr.trait_type] && attr.trait_type !== 'Trait Count') {
                                allTraits[attr.trait_type].add(attr.value);
                            }
                        });
                    }
                } else {
                    failed++;
                }
            } catch (error) {
                failed++;
                if (failed === 1) {
                    console.error('First metadata load error:', error);
                }
            }
        });
        
        await Promise.all(promises);
        
        // Update filters periodically
        if (i % 200 === 0 || i + batchSize >= sampleIndices.length) {
            updateTraitFilters();
        }
    }
    
    console.log(`Metadata sample loaded: ${loaded} successful, ${failed} failed`);
    console.log('Trait counts:', Object.fromEntries(
        Object.entries(allTraits).map(([k, v]) => [k, v.size])
    ));
    
    // Final update of filters
    updateTraitFilters();
}

async function testMetadataLoading() {
    // Test if we can load metadata at all
    try {
        const testResponse = await fetch('metadata/1.json');
        if (testResponse.ok) {
            const testData = await testResponse.json();
            console.log('✓ Metadata loading test successful');
            console.log('  Sample metadata:', testData);
            return true;
        } else {
            console.error('✗ Metadata loading test failed:', testResponse.status, testResponse.statusText);
            return false;
        }
    } catch (error) {
        console.error('✗ Metadata loading test failed:', error);
        console.error('  This might be a CORS issue if running from file:// protocol');
        return false;
    }
}

function updateTraitFilters() {
    // Only update if we have traits
    const hasTraits = Object.values(allTraits).some(set => set.size > 0);
    if (hasTraits) {
        populateTraitFilters();
    } else {
        console.warn('No traits loaded yet, filters will be empty');
    }
}

function populateTraitFilters() {
    Object.keys(allTraits).forEach(traitType => {
        const select = document.getElementById(`filter${traitType}`);
        if (!select) {
            // Filter select element doesn't exist - this is expected if filters aren't in the UI
            return;
        }
        
        // Clear existing options except "All"
        while (select.options.length > 1) {
            select.remove(1);
        }
        
        // Add sorted trait values
        const sortedTraits = Array.from(allTraits[traitType]).sort();
        if (sortedTraits.length === 0) {
            return; // Skip if no traits
        }
        
        sortedTraits.forEach(traitValue => {
            const option = document.createElement('option');
            option.value = traitValue;
            option.textContent = traitValue;
            select.appendChild(option);
        });
        
        console.log(`Populated ${traitType} filter with ${sortedTraits.length} options`);
    });
}


async function updateGalleryDisplay() {
    currentPage = 1;
    const gallery = document.getElementById('otterGallery');
    if (gallery) {
        gallery.innerHTML = '';
    }
    
    // Normal pagination
    await loadOtters(displayedOtters.slice(0, itemsPerPage));
    updateGalleryCount();
    
    const loadMoreBtn = document.getElementById('loadMoreBtn');
    if (loadMoreBtn) {
        loadMoreBtn.style.display = displayedOtters.length > itemsPerPage ? 'inline-flex' : 'none';
    }
}

async function loadMoreOtters() {
    const startIndex = currentPage * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const nextBatch = displayedOtters.slice(startIndex, endIndex);
    
    if (nextBatch.length > 0) {
        await loadOtters(nextBatch);
        currentPage++;
        updateGalleryCount();
        
        // Hide button if all loaded
        const loadMoreBtn = document.getElementById('loadMoreBtn');
        if (loadMoreBtn && startIndex + nextBatch.length >= displayedOtters.length) {
            loadMoreBtn.style.display = 'none';
        }
    }
}

function updateGalleryCount() {
    const countElement = document.getElementById('galleryCount');
    if (countElement) {
        const loaded = Math.min(currentPage * itemsPerPage, displayedOtters.length);
        countElement.textContent = `Showing ${loaded} / ${displayedOtters.length}`;
    }
}

function setupModal() {
    const modal = document.getElementById('otterModal');
    const closeBtn = modal.querySelector('.modal-close');
    
    // Close modal
    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeModal();
        }
    });
    
    // Close on Escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && modal.classList.contains('active')) {
            closeModal();
        }
    });
}

async function openModal(otterNum) {
    const modal = document.getElementById('otterModal');
    const modalImage = document.getElementById('modalImage');
    const modalNumber = document.getElementById('modalNumber');
    const modalTitle = document.getElementById('modalTitle');
    const modalTraits = document.getElementById('modalTraits');
    const modalOpenSea = document.getElementById('modalOpenSea');
    
    if (!modal || !modalImage) return;
    
    modalImage.src = `images_compressed/${otterNum}.png`;
    modalImage.alt = `Otterful Otter #${otterNum}`;
    modalNumber.textContent = otterNum;
    
    // Update links with correct token ID
    const contractAddress = '0x4e5913922b7ddf916c8d27d1016827f799687e66';
    // OpenSea format: https://opensea.io/item/ape_chain/ADDRESS/TOKEN_ID
    modalOpenSea.href = `https://opensea.io/item/ape_chain/${contractAddress}/${otterNum}`;
    
    // Load and display traits
    modalTraits.innerHTML = '<div class="modal-traits-loading">Loading traits...</div>';
    
    try {
        let metadata = metadataCache[otterNum];
        if (!metadata) {
            metadata = await loadOtterMetadata(otterNum, null);
        }
        
        if (metadata && metadata.attributes) {
            const traitsHtml = metadata.attributes
                .filter(attr => attr.trait_type !== 'Trait Count')
                .map(attr => `
                    <div class="modal-trait-item">
                        <span class="modal-trait-type">${attr.trait_type}:</span>
                        <span class="modal-trait-value">${attr.value}</span>
                    </div>
                `).join('');
            
            modalTraits.innerHTML = `<div class="modal-traits-content">${traitsHtml}</div>`;
        } else {
            modalTraits.innerHTML = '<div class="modal-traits-error">Traits unavailable</div>';
        }
    } catch (error) {
        console.error('Error loading traits for modal:', error);
        modalTraits.innerHTML = '<div class="modal-traits-error">Failed to load traits</div>';
    }
    
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    const modal = document.getElementById('otterModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

// Otherside Gallery Functions
let othersideImageList = [];
let currentOthersideIndex = 0;

function encodeGalleryPath(pathStr) {
    return pathStr
        .split('/')
        .map(part => encodeURIComponent(part))
        .join('/');
}

function getOthersideOriginalSrc(file) {
    return encodeGalleryPath(`Otherside Otter Photos/${file.name}`);
}

function getOthersideThumbSrc(file) {
    return encodeGalleryPath(`Otherside Otter Photos_thumbnails/${file.thumbName}`);
}

async function loadOthersideManifest() {
    const response = await fetch('/api/otherside-manifest');
    if (!response.ok) {
        throw new Error(`Otherside manifest failed with ${response.status}`);
    }
    const data = await response.json();
    return data.files || [];
}

async function initOthersideGallery() {
    const gallery = document.getElementById('othersideGallery');
    if (!gallery) {
        console.error('Otherside gallery container not found');
        return;
    }

    let imageFiles = [];
    try {
        imageFiles = await loadOthersideManifest();
    } catch (error) {
        console.error('Failed to load Otherside gallery manifest:', error);
        return;
    }

    // Randomize the order
    const shuffledFiles = [...imageFiles].sort(() => Math.random() - 0.5);

    // Store the image list for navigation (only unique images, not duplicated)
    othersideImageList = shuffledFiles.map(file => {
        const fullSrc = getOthersideOriginalSrc(file);
        const thumbSrc = file.hasThumbnail ? getOthersideThumbSrc(file) : fullSrc;
        return {
            fullSrc,
            thumbSrc,
            displaySrc: thumbSrc
        };
    });

    // Duplicate images for seamless loop (create 2 sets)
    const duplicatedFiles = [...othersideImageList, ...othersideImageList];
    
    // Create scroll wrapper
    const scrollWrapper = document.createElement('div');
    scrollWrapper.className = 'otherside-gallery-scroll';
    scrollWrapper.style.animationDuration = `${Math.max(120, shuffledFiles.length * 2.45)}s`;
    
    // Create image elements with progressive loading
    duplicatedFiles.forEach((image, index) => {
        const imageItem = document.createElement('div');
        imageItem.className = 'otherside-image-item';
        
        const img = document.createElement('img');
        img.alt = `Otherside Otter ${index + 1}`;
        img.className = 'otherside-image';

        // Store paths
        img.dataset.full = image.fullSrc; // Store full quality path for modal
        img.dataset.thumb = image.thumbSrc;
        img.style.opacity = '0.7';
        
        // Use thumbnail for carousel (KB size), fallback to original if thumbnail doesn't exist
        img.dataset.src = image.displaySrc;
        
        // Set up error handler - fallback to original if thumbnail doesn't exist
        img.onerror = function() {
            if (this.src && this.src.includes('_thumbnails') && this.src !== this.dataset.full) {
                // Thumbnail failed, try original
                this.src = this.dataset.full;
            } else {
                // Both failed
                console.warn(`Failed to load image: ${this.dataset.full}`);
                this.style.display = 'none';
            }
        };
        
        // Add click handler to show full-size image
        // Find the index in the unique list (not duplicated)
        // Since we have duplicated files, we need to find the original index
        const uniqueIndex = index % shuffledFiles.length;
        img.addEventListener('click', () => {
            currentOthersideIndex = uniqueIndex;
            openOthersideModal(image.fullSrc, uniqueIndex, image.thumbSrc);
        });
        
        // Handle successful image load
        img.onload = function() {
            this.style.opacity = '1';
            this.style.transition = 'opacity 0.2s ease-in';
        };
        
        imageItem.appendChild(img);
        scrollWrapper.appendChild(imageItem);
    });
    
    gallery.appendChild(scrollWrapper);
    
    // Use Intersection Observer for efficient lazy loading
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                if (img.dataset.src && !img.src) {
                    img.src = img.dataset.src;
                    observer.unobserve(img);
                }
            }
        });
    }, {
        rootMargin: '300px' // Start loading 300px before image enters viewport
    });
    
    // Load first 6 images immediately for better initial experience
    const images = scrollWrapper.querySelectorAll('.otherside-image');
    images.forEach((img, index) => {
        if (index < 6 && img.dataset.src) {
            // Load first 6 immediately
            img.src = img.dataset.src;
        } else {
            // Lazy load the rest
            observer.observe(img);
        }
    });


    // Setup modal close handler and navigation buttons
    const modal = document.getElementById('othersideModal');
    const closeBtn = document.querySelector('.otherside-modal-close');
    const prevBtn = document.querySelector('.otherside-modal-prev');
    const nextBtn = document.querySelector('.otherside-modal-next');
    
    if (closeBtn) {
        closeBtn.addEventListener('click', closeOthersideModal);
    }
    
    if (prevBtn) {
        prevBtn.addEventListener('click', () => navigateOthersideModal('prev'));
    }
    
    if (nextBtn) {
        nextBtn.addEventListener('click', () => navigateOthersideModal('next'));
    }
    
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                closeOthersideModal();
            }
        });
    }
}

function openOthersideModal(imageSrc, index = null, fallbackSrc = null) {
    const modal = document.getElementById('othersideModal');
    const modalImage = document.getElementById('othersideModalImage');
    
    if (modal && modalImage) {
        if (index !== null) {
            currentOthersideIndex = index;
        }
        modalImage.onerror = function() {
            if (fallbackSrc && this.src !== fallbackSrc) {
                this.src = fallbackSrc;
                return;
            }
            this.onerror = null;
        };
        modalImage.src = imageSrc;
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        
        // Setup keyboard navigation
        setupOthersideKeyboardNav();
    }
}

function navigateOthersideModal(direction) {
    if (othersideImageList.length === 0) return;
    
    if (direction === 'next') {
        currentOthersideIndex = (currentOthersideIndex + 1) % othersideImageList.length;
    } else if (direction === 'prev') {
        currentOthersideIndex = (currentOthersideIndex - 1 + othersideImageList.length) % othersideImageList.length;
    }
    
    const modalImage = document.getElementById('othersideModalImage');
    if (modalImage) {
        const image = othersideImageList[currentOthersideIndex];
        modalImage.onerror = function() {
            if (image.thumbSrc && this.src !== image.thumbSrc) {
                this.src = image.thumbSrc;
                return;
            }
            this.onerror = null;
        };
        modalImage.src = image.fullSrc;
    }
}

function setupOthersideKeyboardNav() {
    // Remove existing listeners to avoid duplicates
    const existingHandler = window.othersideKeyHandler;
    if (existingHandler) {
        document.removeEventListener('keydown', existingHandler);
    }
    
    // Create new handler
    window.othersideKeyHandler = function(e) {
        const modal = document.getElementById('othersideModal');
        if (!modal || !modal.classList.contains('active')) {
            return;
        }
        
        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            navigateOthersideModal('prev');
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            navigateOthersideModal('next');
        } else if (e.key === 'Escape') {
            e.preventDefault();
            closeOthersideModal();
        }
    };
    
    document.addEventListener('keydown', window.othersideKeyHandler);
}

function closeOthersideModal() {
    const modal = document.getElementById('othersideModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
        
        // Remove keyboard listener when modal closes
        if (window.othersideKeyHandler) {
            document.removeEventListener('keydown', window.othersideKeyHandler);
            window.othersideKeyHandler = null;
        }
    }
}

// Progressive image loading function
function loadImagesProgressively(imageFiles, startIndex, batchSize) {
    const images = document.querySelectorAll('.otherside-gallery-scroll .otherside-image');
    let currentIndex = startIndex;
    
    function loadNextBatch() {
        const endIndex = Math.min(currentIndex + batchSize, images.length);
        
        for (let i = currentIndex; i < endIndex; i++) {
            const img = images[i];
            if (img.dataset.src && !img.src) {
                img.src = img.dataset.src;
            }
        }
        
        currentIndex = endIndex;
        
        // Continue loading if there are more images
        if (currentIndex < images.length) {
            // Load next batch after a short delay
            setTimeout(loadNextBatch, 100);
        }
    }
    
    // Start loading after initial images have had time to load
    setTimeout(loadNextBatch, 200);
    
    // Also use Intersection Observer for images that come into view
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                if (img.dataset.src && !img.src) {
                    img.src = img.dataset.src;
                    observer.unobserve(img);
                }
            }
        });
    }, {
        rootMargin: '200px' // Start loading 200px before image enters viewport (more aggressive)
    });
    
    // Observe all lazy-loaded images
    images.forEach((img, index) => {
        if (index >= startIndex && img.dataset.src) {
            observer.observe(img);
        }
    });
}

// Carousel Arrow Control Functions
function setupCarouselArrows(type, scrollWrapper) {
    const leftArrow = document.getElementById(`${type}ArrowLeft`);
    const rightArrow = document.getElementById(`${type}ArrowRight`);
    
    if (!leftArrow || !rightArrow || !scrollWrapper) return;
    
    let manualOffset = 0;
    let isScrolling = false;
    let resumeTimeout = null;
    const scrollAmount = 600; // pixels to scroll per click
    
    // Get current transform value
    function getCurrentTransform() {
        const style = window.getComputedStyle(scrollWrapper);
        const matrix = style.transform;
        if (matrix === 'none' || !matrix) return 0;
        const match = matrix.match(/matrix.*\((.+)\)/);
        if (!match) return 0;
        const values = match[1].split(', ');
        return parseFloat(values[4]) || 0;
    }
    
    // Scroll function
    function scroll(direction) {
        if (isScrolling) return;
        
        isScrolling = true;
        scrollWrapper.style.animationPlayState = 'paused';
        
        // Clear any existing resume timeout
        if (resumeTimeout) {
            clearTimeout(resumeTimeout);
        }
        
        const currentPos = getCurrentTransform();
        const targetPos = currentPos + (direction === 'left' ? -scrollAmount : scrollAmount);
        const distance = targetPos - currentPos;
        const duration = 400; // milliseconds
        const startTime = performance.now();
        const startPos = currentPos;
        
        function animate(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // Ease out cubic
            const easeProgress = 1 - Math.pow(1 - progress, 3);
            const newPos = startPos + (distance * easeProgress);
            scrollWrapper.style.transform = `translateX(${newPos}px)`;
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                // Resume auto-scroll after a delay
                resumeTimeout = setTimeout(() => {
                    // Remove manual transform and let animation continue from current position
                    scrollWrapper.style.transform = '';
                    scrollWrapper.style.animationPlayState = 'running';
                    isScrolling = false;
                }, 2000); // Resume after 2 seconds of inactivity
            }
        }
        
        requestAnimationFrame(animate);
    }
    
    leftArrow.addEventListener('click', () => scroll('left'));
    rightArrow.addEventListener('click', () => scroll('right'));
}

// Electric Border for Team Image
function initElectricBorder() {
    const teamImageContainer = document.getElementById('teamImageContainer');
    if (teamImageContainer && typeof ElectricBorder !== 'undefined') {
        new ElectricBorder(teamImageContainer, {
            color: '#95feb4',
            speed: 1,
            chaos: 0.08,
            borderRadius: 999 // Circle
        });
    }
}

// Nifty Gallery Functions
let niftyImageList = [];
let currentNiftyIndex = 0;

function getNiftyOriginalSrc(file) {
    return encodeGalleryPath(`Nifty Photos/${file.name}`);
}

function getNiftyThumbSrc(file) {
    return encodeGalleryPath(`Nifty Photos_thumbnails/${file.thumbName}`);
}

async function loadNiftyManifest() {
    const response = await fetch('/api/nifty-manifest');
    if (!response.ok) {
        throw new Error(`Nifty manifest failed with ${response.status}`);
    }
    const data = await response.json();
    return data.files || [];
}

async function initNiftyGallery() {
    const gallery = document.getElementById('niftyGallery');
    if (!gallery) {
        console.error('Nifty gallery container not found');
        return;
    }

    let imageFiles = [];
    try {
        imageFiles = await loadNiftyManifest();
    } catch (error) {
        console.error('Failed to load Nifty gallery manifest:', error);
        return;
    }

    const shuffledFiles = [...imageFiles].sort(() => Math.random() - 0.5);

    niftyImageList = shuffledFiles.map(file => {
        const fullSrc = getNiftyOriginalSrc(file);
        const thumbSrc = file.hasThumbnail ? getNiftyThumbSrc(file) : fullSrc;
        return {
            fullSrc,
            thumbSrc,
            displaySrc: thumbSrc
        };
    });

    const duplicatedFiles = [...niftyImageList, ...niftyImageList];

    const scrollWrapper = document.createElement('div');
    scrollWrapper.className = 'nifty-gallery-scroll';
    scrollWrapper.style.animationDuration = `${Math.max(120, shuffledFiles.length * 2.45)}s`;

    duplicatedFiles.forEach((image, index) => {
        const imageItem = document.createElement('div');
        imageItem.className = 'nifty-image-item';

        const img = document.createElement('img');
        img.alt = `Nifty Island ${index + 1}`;
        img.className = 'nifty-image';

        img.dataset.full = image.fullSrc;
        img.dataset.thumb = image.thumbSrc;
        img.style.opacity = '0.7';
        img.dataset.src = image.displaySrc;

        img.onerror = function() {
            if (this.src && this.src.includes('_thumbnails') && this.src !== this.dataset.full) {
                this.src = this.dataset.full;
            } else {
                console.warn(`Failed to load image: ${this.dataset.full}`);
                this.style.display = 'none';
            }
        };

        const uniqueIndex = index % shuffledFiles.length;
        img.addEventListener('click', () => {
            currentNiftyIndex = uniqueIndex;
            openNiftyModal(image.fullSrc, uniqueIndex, image.thumbSrc);
        });

        img.onload = function() {
            this.style.opacity = '1';
            this.style.transition = 'opacity 0.2s ease-in';
        };

        imageItem.appendChild(img);
        scrollWrapper.appendChild(imageItem);
    });

    gallery.appendChild(scrollWrapper);

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                if (img.dataset.src && !img.src) {
                    img.src = img.dataset.src;
                    observer.unobserve(img);
                }
            }
        });
    }, {
        rootMargin: '300px'
    });

    const images = scrollWrapper.querySelectorAll('.nifty-image');
    images.forEach((img, index) => {
        if (index < 6 && img.dataset.src) {
            img.src = img.dataset.src;
        } else {
            observer.observe(img);
        }
    });

    const modal = document.getElementById('niftyModal');
    const closeBtn = document.querySelector('.nifty-modal-close');
    const prevBtn = document.querySelector('.nifty-modal-prev');
    const nextBtn = document.querySelector('.nifty-modal-next');

    if (closeBtn) {
        closeBtn.addEventListener('click', closeNiftyModal);
    }

    if (prevBtn) {
        prevBtn.addEventListener('click', () => navigateNiftyModal('prev'));
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => navigateNiftyModal('next'));
    }

    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                closeNiftyModal();
            }
        });
    }
}

function openNiftyModal(imageSrc, index = null, fallbackSrc = null) {
    const modal = document.getElementById('niftyModal');
    const modalImage = document.getElementById('niftyModalImage');

    if (modal && modalImage) {
        if (index !== null) {
            currentNiftyIndex = index;
        }
        modalImage.onerror = function() {
            if (fallbackSrc && this.src !== fallbackSrc) {
                this.src = fallbackSrc;
                return;
            }
            this.onerror = null;
        };
        modalImage.src = imageSrc;
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';

        setupNiftyKeyboardNav();
    }
}

function navigateNiftyModal(direction) {
    if (niftyImageList.length === 0) return;

    if (direction === 'next') {
        currentNiftyIndex = (currentNiftyIndex + 1) % niftyImageList.length;
    } else if (direction === 'prev') {
        currentNiftyIndex = (currentNiftyIndex - 1 + niftyImageList.length) % niftyImageList.length;
    }

    const modalImage = document.getElementById('niftyModalImage');
    if (modalImage) {
        const image = niftyImageList[currentNiftyIndex];
        modalImage.onerror = function() {
            if (image.thumbSrc && this.src !== image.thumbSrc) {
                this.src = image.thumbSrc;
                return;
            }
            this.onerror = null;
        };
        modalImage.src = image.fullSrc;
    }
}

function setupNiftyKeyboardNav() {
    // Remove existing listeners to avoid duplicates
    const existingHandler = window.niftyKeyHandler;
    if (existingHandler) {
        document.removeEventListener('keydown', existingHandler);
    }
    
    // Create new handler
    window.niftyKeyHandler = function(e) {
        const modal = document.getElementById('niftyModal');
        if (!modal || !modal.classList.contains('active')) {
            return;
        }
        
        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            navigateNiftyModal('prev');
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            navigateNiftyModal('next');
        } else if (e.key === 'Escape') {
            e.preventDefault();
            closeNiftyModal();
        }
    };
    
    document.addEventListener('keydown', window.niftyKeyHandler);
}

function closeNiftyModal() {
    const modal = document.getElementById('niftyModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
        
        // Remove keyboard listener when modal closes
        if (window.niftyKeyHandler) {
            document.removeEventListener('keydown', window.niftyKeyHandler);
            window.niftyKeyHandler = null;
        }
    }
}

