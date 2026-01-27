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

function setupRefreshButton() {
    const refreshBtn = document.querySelector('.action-btn.secondary');
    
    if (refreshBtn) {
        refreshBtn.addEventListener('click', function() {
            // Add loading state
            const icon = this.querySelector('.icon');
            const originalTransform = icon.style.transform;
            
            this.disabled = true;
            this.style.opacity = '0.6';
            icon.style.transition = 'transform 0.5s linear';
            icon.style.transform = 'rotate(360deg)';
            
            // Simulate API call
            setTimeout(() => {
                // Update stats (in real app, fetch from API)
                updateStats();
                
                // Reset button
                this.disabled = false;
                this.style.opacity = '1';
                icon.style.transform = originalTransform;
                
                // Show success feedback
                showNotification('Data refreshed successfully!', 'success');
            }, 1500);
        });
    }
}

async function fetchCollectionStats() {
    try {
        // Fetch collection stats from our backend API endpoint (which proxies OpenSea)
        // This avoids CORS issues by fetching server-side
        const apiUrl = '/api/opensea-stats';
        
        console.log('Fetching stats from:', apiUrl);
        
        const response = await fetch(apiUrl);
        
        console.log('Response status:', response.status, response.statusText);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('API Error Response:', errorText);
            throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
        }
        
        const data = await response.json();
        
        console.log('OpenSea API response:', data); // Debug log
        
        // Check if there's an error in the response
        if (data.error) {
            throw new Error(`API Error: ${data.error}`);
        }
        
        // OpenSea v1 API structure
        if (data && data.stats) {
            const stats = data.stats;
            
            console.log('Parsing stats:', stats);
            
            // Update floor price
            if (stats.floor_price !== undefined && stats.floor_price !== null) {
                updateStatValue('stat-floor-price', formatNumber(stats.floor_price), 'APE');
            }
            
            // Update total volume
            if (stats.total_volume !== undefined && stats.total_volume !== null) {
                updateStatValue('stat-total-volume', formatLargeNumber(stats.total_volume), 'APE');
            }
            
            // Update 24h volume
            if (stats.one_day_volume !== undefined && stats.one_day_volume !== null) {
                updateStatValue('stat-24h-volume', formatNumber(stats.one_day_volume), 'APE');
            }
            
            // Update floor price change (1 day)
            if (stats.one_day_change !== undefined && stats.one_day_change !== null) {
                const changePercent = stats.one_day_change * 100; // Convert to percentage
                updateStatChange('stat-floor-change', changePercent);
            }
            
            // Get best offer from collection data
            if (data.collection) {
                console.log('Collection data:', data.collection);
                // Try different possible fields for best offer
                let bestOffer = null;
                if (data.collection.best_offer !== undefined && data.collection.best_offer !== null) {
                    bestOffer = data.collection.best_offer;
                } else if (data.collection.top_bid !== undefined && data.collection.top_bid !== null) {
                    bestOffer = data.collection.top_bid;
                } else if (data.collection.stats && data.collection.stats.top_bid !== undefined) {
                    bestOffer = data.collection.stats.top_bid;
                }
                
                if (bestOffer !== null && bestOffer !== undefined) {
                    updateStatValue('stat-top-offer', formatNumber(bestOffer), 'WAPE');
                }
            }
            
            console.log('Collection stats updated successfully from OpenSea');
            return true;
        } else {
            console.error('Invalid response format - no stats found:', data);
            throw new Error('Invalid response format from OpenSea API - no stats found');
        }
    } catch (error) {
        console.error('Error fetching collection stats from OpenSea:', error);
        console.error('Error details:', {
            message: error.message,
            stack: error.stack
        });
        console.warn('Using cached/fallback values');
        return false;
    }
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
    
    // Setup search
    const searchInput = document.getElementById('otterSearch');
    if (searchInput) {
        searchInput.addEventListener('input', handleSearch);
    } else {
        console.error('Search input not found!');
    }
    
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

async function handleSearch(e) {
    const searchTerm = e.target.value.trim();
    
    if (searchTerm === '') {
        displayedOtters = [...allOtters];
    } else {
        // Parse search term (could be single number or range like "1-100")
        if (searchTerm.includes('-')) {
            const [start, end] = searchTerm.split('-').map(n => parseInt(n.trim()));
            if (!isNaN(start) && !isNaN(end) && start > 0 && end <= totalOtters && start <= end) {
                displayedOtters = Array.from({ length: end - start + 1 }, (_, i) => start + i);
            } else {
                displayedOtters = [];
            }
        } else {
            const num = parseInt(searchTerm);
            if (!isNaN(num) && num > 0 && num <= totalOtters) {
                displayedOtters = [num];
            } else {
                displayedOtters = [];
            }
        }
    }
    
    await updateGalleryDisplay();
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
    const modalMagicEden = document.getElementById('modalMagicEden');
    
    if (!modal || !modalImage) return;
    
    modalImage.src = `images_compressed/${otterNum}.png`;
    modalImage.alt = `Otterful Otter #${otterNum}`;
    modalNumber.textContent = otterNum;
    
    // Update links with correct token ID
    const contractAddress = '0x4e5913922b7ddf916c8d27d1016827f799687e66';
    // OpenSea format: https://opensea.io/item/ape_chain/ADDRESS/TOKEN_ID
    modalOpenSea.href = `https://opensea.io/item/ape_chain/${contractAddress}/${otterNum}`;
    // Magic Eden format: https://magiceden.us/item-details/apechain/ADDRESS/TOKEN_ID
    modalMagicEden.href = `https://magiceden.us/item-details/apechain/${contractAddress}/${otterNum}`;
    
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

async function initOthersideGallery() {
    const gallery = document.getElementById('othersideGallery');
    if (!gallery) {
        console.error('Otherside gallery container not found');
        return;
    }

    // List of images from the folder
    const imageFiles = [
        'Screenshot 2025-10-30 110514.png',
        'Screenshot 2025-10-30 202638.png',
        'Screenshot 2025-11-01 110411.png',
        'Screenshot 2025-11-01 143637.png',
        'Screenshot 2025-11-01 145222.png',
        'Screenshot 2025-11-01 151327.png',
        'Screenshot 2025-11-05 122105.png',
        'Screenshot 2025-11-05 122409 - Copy.png',
        'Screenshot 2025-11-05 123324 - Copy.png',
        'Screenshot 2025-11-06 183604.png',
        'Screenshot 2025-11-07 121735.png',
        'Screenshot 2025-11-08 123604.png',
        'Screenshot 2025-11-08 125933.png',
        'Screenshot 2025-11-08 145240.png',
        'Screenshot 2025-11-09 090244.png',
        'Screenshot 2025-11-12 145142.png',
        'Screenshot 2025-11-12 145935.png',
        'Screenshot 2025-11-12 160831.png',
        'Screenshot 2025-11-12 172340.png',
        'Screenshot 2025-11-12 172758.png',
        'Screenshot 2025-11-12 172816.png',
        'Screenshot 2025-11-12 172852.png',
        'Screenshot 2025-11-12 173612.png',
        'Screenshot 2025-11-12 174106.png',
        'Screenshot 2025-11-12 184405.png',
        'Screenshot 2025-11-12 203535.png',
        'Screenshot 2025-11-13 001140.png',
        'Screenshot 2025-11-13 024558.png',
        'Screenshot 2025-11-18 014002.png',
        'Screenshot 2025-11-18 023048.png',
        'Screenshot 2025-11-18 025102.png',
        'Screenshot 2025-11-18 043941.png',
        'Screenshot 2025-11-18 044008.png',
        'Screenshot 2025-11-20 035947.png',
        'Screenshot 2025-11-21 023614.png',
        'Screenshot 2025-11-23 160102.png',
        'Screenshot 2025-11-26 160332.png',
        'Screenshot 2025-11-29 051555.png',
        'Screenshot 2025-12-05 053820.png',
        'Screenshot 2025-12-06 174602.png',
        'Screenshot 2025-12-07 154029.png',
        'Screenshot 2025-12-17 171344.png',
        'Screenshot 2025-12-17 175901.png',
        'Screenshot 2025-12-19 083420.png',
        'Screenshot 2025-12-26 041208.png',
        'Screenshot 2026-01-03 152902.png',
        'Screenshot 2026-01-04 154518.png',
        'Screenshot 2026-01-05 172504.png',
        'Screenshot 2026-01-06 115911.png'
    ];

    // Randomize the order
    const shuffledFiles = [...imageFiles].sort(() => Math.random() - 0.5);

    // Store the image list for navigation (only unique images, not duplicated)
    othersideImageList = shuffledFiles.map(filename => `Otherside Otter Photos/${filename}`);

    // Duplicate images for seamless loop (create 2 sets)
    const duplicatedFiles = [...shuffledFiles, ...shuffledFiles];
    
    // Create scroll wrapper
    const scrollWrapper = document.createElement('div');
    scrollWrapper.className = 'otherside-gallery-scroll';
    
    // Create image elements with progressive loading
    duplicatedFiles.forEach((filename, index) => {
        const imageItem = document.createElement('div');
        imageItem.className = 'otherside-image-item';
        
        const img = document.createElement('img');
        img.alt = `Otherside Otter ${index + 1}`;
        img.className = 'otherside-image';
        
        // Use thumbnails for carousel (much smaller KB files), full images in modal
        const originalPath = `Otherside Otter Photos/${filename}`;
        const thumbnailPath = `Otherside Otter Photos_thumbnails/${filename.replace('.png', '.jpg')}`;
        
        // Store paths
        img.dataset.full = originalPath; // Store full quality path for modal
        img.style.opacity = '0.7';
        
        // Use thumbnail for carousel (KB size), fallback to original if thumbnail doesn't exist
        img.dataset.src = thumbnailPath;
        
        // Set up error handler - fallback to original if thumbnail doesn't exist
        img.onerror = function() {
            if (this.src === thumbnailPath || this.src.includes('_thumbnails')) {
                // Thumbnail failed, try original
                this.src = originalPath;
            } else {
                // Both failed
                console.warn(`Failed to load image: ${filename}`);
                this.style.display = 'none';
            }
        };
        
        // Add click handler to show full-size image
        // Find the index in the unique list (not duplicated)
        // Since we have duplicated files, we need to find the original index
        const uniqueIndex = index % shuffledFiles.length;
        const imagePath = `Otherside Otter Photos/${filename}`;
        img.addEventListener('click', () => {
            currentOthersideIndex = uniqueIndex;
            openOthersideModal(imagePath, uniqueIndex);
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

function openOthersideModal(imageSrc, index = null) {
    const modal = document.getElementById('othersideModal');
    const modalImage = document.getElementById('othersideModalImage');
    
    if (modal && modalImage) {
        if (index !== null) {
            currentOthersideIndex = index;
        }
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
        modalImage.src = othersideImageList[currentOthersideIndex];
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

async function initNiftyGallery() {
    const gallery = document.getElementById('niftyGallery');
    if (!gallery) {
        console.error('Nifty gallery container not found');
        return;
    }

    // List of images from the folder
    const imageFiles = [
        'Screenshot 2024-12-11 002145.png',
        'Screenshot 2024-12-19 021349.png',
        'Screenshot 2024-12-21 205103.png',
        'Screenshot 2024-12-24 012628.png',
        'Screenshot 2024-12-27 081141.png',
        'Screenshot 2024-12-28 023204.png',
        'Screenshot 2024-12-31 013507.png',
        'Screenshot 2025-01-01 042900.png',
        'Screenshot 2025-01-02 093516.png',
        'Screenshot 2025-01-03 084646.png',
        'Screenshot 2025-01-12 035251.png',
        'Screenshot 2025-01-12 053645.png',
        'Screenshot 2025-01-31 120537.png',
        'Screenshot 2025-02-04 000723.png',
        'Screenshot 2025-02-19 020525.png',
        'Screenshot 2025-03-13 202617.png',
        'Screenshot 2025-03-18 002916.png',
        'Screenshot 2025-03-22 233557.png',
        'Screenshot 2025-04-05 213153.png',
        'Screenshot 2025-04-20 195231.png',
        'Screenshot 2025-04-26 224329.png',
        'Screenshot 2025-04-26 225219.png',
        'Screenshot 2025-05-12 073248.png',
        'Screenshot 2025-07-02 083124.png',
        'Screenshot 2025-07-08 152229.png',
        'Screenshot 2025-08-07 221004.png',
        'Screenshot 2025-08-09 193856.png',
        'Screenshot 2025-08-30 192618.png',
        'Screenshot 2025-10-23 181037.png',
        'Screenshot 2025-11-16 140400.png',
        'Screenshot 2025-12-14 140810.png',
        'Screenshot 2025-12-21 140609.png',
        'Screenshot 2026-01-04 142756.png'
    ];

    // Randomize the order
    const shuffledFiles = [...imageFiles].sort(() => Math.random() - 0.5);

    // Store the image list for navigation (only unique images, not duplicated)
    niftyImageList = shuffledFiles.map(filename => {
        const path = `Nifty Photos/${filename}`;
        // Return path as-is (browser will handle encoding)
        return path;
    });

    // Duplicate images for seamless loop (create 2 sets)
    const duplicatedFiles = [...shuffledFiles, ...shuffledFiles];
    
    // Create scroll wrapper
    const scrollWrapper = document.createElement('div');
    scrollWrapper.className = 'nifty-gallery-scroll';
    
    // Create image elements
    duplicatedFiles.forEach((filename, index) => {
        const imageItem = document.createElement('div');
        imageItem.className = 'nifty-image-item';
        
        const img = document.createElement('img');
        img.alt = `Nifty Photo ${index + 1}`;
        img.className = 'nifty-image';
        
        // Use thumbnails for carousel (much smaller KB files), full images in modal
        const imagePath = `Nifty Photos/${filename}`;
        const thumbnailPath = `Nifty Photos_thumbnails/${filename.replace('.png', '.jpg')}`;
        
        // Store paths
        img.dataset.full = imagePath; // Store full quality path for modal
        img.style.opacity = '0.7';
        
        // Use thumbnail for carousel (KB size), fallback to original if thumbnail doesn't exist
        img.dataset.src = thumbnailPath;
        
        // Set up error handler - fallback to original if thumbnail doesn't exist
        let errorCount = 0;
        img.onerror = function() {
            errorCount++;
            if (errorCount === 1) {
                // Thumbnail failed, try original image
                if (this.src === thumbnailPath || this.src.includes('_thumbnails')) {
                    this.src = imagePath;
                } else {
                    // Try with encoded spaces
                    const encodedPath = imagePath.replace(/ /g, '%20');
                    this.src = encodedPath;
                }
            } else {
                // All attempts failed
                console.error(`Failed to load image: ${filename}`);
                this.style.display = 'none';
            }
        };
        
        // Add click handler to show full-size image
        const uniqueIndex = index % shuffledFiles.length;
        img.addEventListener('click', () => {
            currentNiftyIndex = uniqueIndex;
            openNiftyModal(imagePath, uniqueIndex);
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
    const images = scrollWrapper.querySelectorAll('.nifty-image');
    images.forEach((img, index) => {
        if (index < 6 && img.dataset.src) {
            // Load first 6 immediately
            img.src = img.dataset.src;
        } else if (img.dataset.src) {
            // Lazy load the rest
            observer.observe(img);
        }
    });


    // Setup modal close handler and navigation buttons
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

function openNiftyModal(imageSrc, index = null) {
    const modal = document.getElementById('niftyModal');
    const modalImage = document.getElementById('niftyModalImage');
    
    if (modal && modalImage) {
        if (index !== null) {
            currentNiftyIndex = index;
        }
        modalImage.src = imageSrc;
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        
        // Setup keyboard navigation
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
        modalImage.src = niftyImageList[currentNiftyIndex];
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

