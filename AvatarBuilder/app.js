import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';

class AvatarBuilder {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.model = null;
        this.originalModel = null;
        this.currentHat = null;
        this.currentShirt = null;
        this.currentEyes = null;
        this.animationFrameId = null;
        this.editMode = false;
        this.transformControls = null;
        this.selectedObject = null;
        this.history = []; // Undo/redo history
        this.historyIndex = -1; // Current position in history
        this.maxHistorySize = 50; // Limit history size
        this.storageKey = 'avatarBuilder_positions'; // localStorage key for saved positions
        this.currentZoomLevel = 2;  // Start at level +2 (slightly zoomed out), -6 to +6 (negative = zoom in, positive = zoom out)
        // Reference transforms removed - using default positioning
        this.autoRotate = false;  // Auto-rotation state
        this.rotationSpeed = 0.005;  // Rotation speed (radians per frame)
        this.needsRender = true;  // Performance: only render when needed
        this.isRendering = false;  // Prevent multiple renders
        this.isRandomizing = false;  // Prevent overlapping randomize calls
        
        // Available fur options
        this.furOptions = [
            'OG', 'Red', 'Orange', 'Green', 'Blue', 'Pink', 'Purple',
            'Blue-Tiger', 'Red-Tiger', 'Neon-Tiger', 'Tiger',
            'Green-Dots', 'Purple-Dots',
            'Robo-1', 'Robo-2',
            'Zombie', 'Galaxy', 'Gold', 'SpecialPink'
        ];
        
        // Available hat options (matching WEARABLES/Hats folder, sorted alphabetically)
        this.hatOptions = [
            'Afro-Rainbow', 'Antlers', 'Backwards-Hat', 'Backwards-Hat-Red-v2', 'Backwards-Hat-Yellow-Purple',
            'Banana', 'Bandana', 'Bandana-Red', 'Beanie', 'Beanie-Orange', 'Beanie-Orange-v2', 'Beanie-Stealth',
            'Beret-Green', 'Bow', 'Bucket', 'Bucket-Orange', 'Bucket-Snow-Tan', 'Bunny',
            'Captain', 'Captain-Gold', 'Chef', 'Clouds', 'Cone', 'Cowboy', 'Cowboy-Stealth', 'Crown',
            'Ducky', 'Fisherman', 'Flipped-Brim-Blue', 'Flipped-Brim-Red-v2', 'Frog',
            'Fuzzy-Bucket', 'Fuzzy-Bucket-Blue-Yellow', 'Fuzzy-Bucket-Green-Stealth v2', 'Fuzzy-Bucket-Orange-Blue',
            'Fuzzy-Bucket-Pink-Green', 'Fuzzy-Bucket-Snow', 'Fuzzy-Bucket-Snow-Red', 'Fuzzy-Bucket-Stealth',
            'Fuzzy-Bucket-Stealth-Red', 'Fuzzy-Bucket-Stealth-Teal', 'Green-Dino', 'Halo', 'Hat-Red-v2',
            'Hat-Stealth-v2', 'Helmet Green', 'Horns', 'Island', 'Mowhawk-Green', 'Mowhawk-Stealth',
            'Mushroom-Green', 'Mushroom-Red', 'Pineapple', 'Pink-Dino', 'Pirate',
            'Plumber', 'Plumber-v2', 'Plumber-v3', 'Plumber-v4', 'Plumber-v5', 'Pot-of-Gold', 'Propeller',
            'Sailor', 'Sensei', 'Shark', 'Space-Helmet-Gold', 'Space-Helmet-v2',
            'Spikey-Hair', 'Spikey-Hair-Rose', 'Spikey-Hair-Teal', 'Spikey-Hair-v2', 'Spikey-Hair-Yellow',
            'Sportband-OG', 'Taco', 'Top-Hat-v3', 'Uni-Horn', 'Viking-Helmet', 'Viking-Helmet-Gold',
            'Viking-Helmet-Red', 'Viking-Helmet-Silver', 'Visor', 'Watermelon', 'Whale',
            'Wizard Teal', 'Wizard-Blue'
        ];
        
        // Available shirt options (sorted alphabetically)
        this.shirtOptions = [
            'Apron-Fishy', 'Apron', 'Baseball-Blue-Orange-v2', 'Baseball-Green-Yellow', 'Baseball-Mint-Stealth',
            'Baseball-Snow-Blue-v2', 'Baseball-Snow-Purple', 'Baseball-Snow-Stealth', 'Basketball-Blue', 'Basketball-Gold',
            'Basketball-Green', 'Basketball-Purple-v2', 'Basketball-Purple', 'Basketball-Red', 'Bathrobe', 'Bowtie',
            'Business-v2', 'Business', 'Camo-Green-v2', 'Cowboy-Vest', 'Fishdolier', 'Football-Blue-Red',
            'Football-Purple-Yellow', 'Football-Stealth', 'Golf-Red', 'Hockey-Blue-Orange', 'Hockey-Red-Blue',
            'Kimono-Blue-Flowers', 'Kimono-Pink-Flowers', 'Kimono-Purple-Red', 'Kimono-Snow-Brown-v2', 'Mech-Suit',
            'Ninja', 'Overalls-Orange', 'Overalls-v2', 'Overalls-v3', 'Puffy-Jacket-Stripes-v8', 'Puffy-Jacket-Stripes-v9',
            'Puffy-Sleeves', 'Robe-Purple', 'Scuba', 'Soccer-Mint-Fishy', 'Soccer-Stealth', 'Spacesuit-Gold',
            'Spacesuit-v3', 'Supersuit-v10', 'Supersuit-v2', 'Supersuit-v3', 'Supersuit-v4', 'Supersuit-v5',
            'Supersuit-v6', 'Supersuit-v7', 'Supersuit-v8', 'Supersuit-v9', 'Supersuit', 'Sweater-Yellow',
            'Sweater', 'T-Shirt-Blue-Fishy', 'T-Shirt-Meme', 'T-Shirt', 'Tracksuit-Red', 'Tracksuit-Yellow-Stealth',
            'Tux-Gold', 'Tux-Purple', 'Tux-Snow', 'Tux-Stealth', 'Vest', 'Warmup-Blue-Orange', 'Warmup-Blue-Snow',
            'Warmup-Blue-Stealth', 'Warmup-Mint-Snow', 'Warmup-Pink-Orange', 'Warmup-Purple-Red', 'Warmup-Purple-Yellow',
            'Warmup-Stealth', 'Wings', 'Wizard-Cloak-Green', 'Wizard-Cloak-Pink', 'Wizard-Cloak-Teal'
        ];
        
        // Available eye options (matching WEARABLES/Eyes folder, sorted alphabetically)
        this.eyeOptions = [
            '3D', 'Angry', 'Cartoon', 'Cartoon Glossy', 'Cartoon Third Eye', 'Cartoon Third Eye Glossy',
            'Circle-Shades', 'Crazy', 'Cyclops', 'Default', 'Determined', 'Droopy', 'Evil', 'Eyepatch', 'Floating',
            'Happy', 'Heart', 'Laser-Blue', 'Laser-Green', 'Laser-Red', 'Meme', 'Perplexed', 'Punk',
            'Scanner Gold', 'Scanner Red', 'Scanner Teal', 'Shades', 'Slick', 'Three', 'Tired', 'Triangles',
            'Viper Gold', 'Viper Green', 'Viper Purple', 'Viper-Rainbow', 'Viper-Red', 'VR', 'VR-Green', 'VR-Red',
            'Yellow-Scanner', 'Zombie', 'Zombie-Blue', 'Zombie-Green', 'Zombie-Mint', 'Zombie-Orange',
            'Zombie-Pink', 'Zombie-Purple', 'Zombie-Red', 'Zombie-Yellow'
        ];
        
        this.init();
    }

    // Helper function to properly encode file paths with spaces
    encodePath(folder, filename) {
        // Handle nested paths (e.g., "WEARABLES/Furs")
        // Split by forward slash, encode each part, then rejoin
        const folderParts = folder.split('/').map(part => part.replace(/ /g, '%20'));
        const encodedFolder = folderParts.join('/');
        // Use encodeURIComponent for filename to handle all special characters
        const encodedFilename = encodeURIComponent(filename);
        return `${encodedFolder}/${encodedFilename}`;
    }

    async init() {
        try {
            // Check if running from file:// protocol (won't work with ES6 modules)
            if (window.location.protocol === 'file:') {
                console.error('⚠️ App is being opened as a file:// URL. ES6 modules require a web server.');
                alert('⚠️ This app must be run from a web server!\n\nPlease:\n1. Run "npm start" in the terminal, OR\n2. Use a local server like "python -m http.server" or "npx serve ."\n\nOpening as file:// will not work due to browser security restrictions.');
                return;
            }
            
            this.setupTheme();
            this.setupScene();
            // Note: Reference file loading removed - using default transforms
            this.setupEventListeners();
            this.setupInventory();
            this.setupFurGallery();
            this.setupHatGallery();
            this.setupShirtGallery();
            this.setupEyesGallery();
            this.animate();
        } catch (error) {
            console.error('Error in AvatarBuilder.init():', error);
            throw error;
        }
    }

    setupTheme() {
        // Check for saved theme preference or default to dark
        const savedTheme = localStorage.getItem('theme') || 'dark';
        document.documentElement.setAttribute('data-theme', savedTheme);
        
        // Update theme toggle icon
        const themeIcon = document.querySelector('.theme-icon');
        if (themeIcon) {
            themeIcon.textContent = savedTheme === 'dark' ? '🌙' : '☀️';
        }
        
        // Setup theme toggle button
        // Theme toggle button removed - keeping function for compatibility but no-op
        const themeToggle = document.getElementById('theme-toggle');
        if (false && themeToggle) {
            themeToggle.addEventListener('click', () => {
                const currentTheme = document.documentElement.getAttribute('data-theme');
                const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
                document.documentElement.setAttribute('data-theme', newTheme);
                localStorage.setItem('theme', newTheme);
                
                // Update icon
                const icon = document.querySelector('.theme-icon');
                if (icon) {
                    icon.textContent = newTheme === 'dark' ? '🌙' : '☀️';
                }
            });
        }
    }

    setupScene() {
        // Scene
        this.scene = new THREE.Scene();
        // Start with light gradient background
        this.createGradientBackground(true);

        // Camera
        this.camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        // Set initial camera position - mobile gets zoomed out 2x more and lowered
        if (window.innerWidth <= 768) {
            this.camera.position.set(0, -0.6, 4.5);  // Mobile: closer and better centered
        } else {
            this.camera.position.set(0, 0.2, 3.5);  // Desktop: Higher camera position, moved back
        }

        // Renderer with performance optimizations
        const container = document.getElementById('canvas-container');
        this.renderer = new THREE.WebGLRenderer({ 
            antialias: true,
            powerPreference: "high-performance",
            stencil: false,
            depth: true
        });
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Limit pixel ratio for performance
        container.appendChild(this.renderer.domElement);

        // Controls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        // Enable zoom for touch devices (pinch), but we'll handle mouse wheel manually
        this.controls.enableZoom = true;  // Enable zoom for touch devices
        this.controls.enableDolly = true;  // Enable pinch zoom (dolly)
        
        // Set target based on device type
        if (window.innerWidth <= 768) {
            this.controls.target.set(0, -0.4, 0);  // Mobile: centered target
        } else {
            this.controls.target.set(0, -0.4, 0);  // Desktop: target at -0.4
        }
        
        // Enable panning with middle mouse button (scroll wheel click)
        this.controls.mouseButtons = {
            LEFT: THREE.MOUSE.ROTATE,
            MIDDLE: THREE.MOUSE.PAN,  // Pan when middle mouse button is held
            RIGHT: THREE.MOUSE.PAN
        };
        
        // Touch controls configuration
        // Available options:
        // THREE.TOUCH.ROTATE - Single finger rotates
        // THREE.TOUCH.DOLLY - Two fingers zoom (pinch)
        // THREE.TOUCH.PAN - Two fingers pan
        // THREE.TOUCH.DOLLY_PAN - Two fingers zoom + pan (default)
        // THREE.TOUCH.DOLLY_ROTATE - Two fingers zoom + rotate
        this.controls.touches = {
            ONE: THREE.TOUCH.ROTATE,      // Single finger = rotate camera
            TWO: THREE.TOUCH.DOLLY_PAN    // Two fingers = pinch zoom + pan
        };
        
        // Disable mouse wheel zoom (we handle it with custom discrete levels)
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        
        // Setup custom zoom with discrete levels
        this.setupDiscreteZoom();
        
        // Transform Controls for editing mode
        this.transformControls = new TransformControls(this.camera, this.renderer.domElement);
        let isDragging = false;
        this.transformControls.addEventListener('dragging-changed', (event) => {
            // Disable orbit controls when dragging transform controls
            this.controls.enabled = !event.value;
            isDragging = event.value;
            
            // Save state when dragging ends (not during dragging)
            if (!event.value && this.selectedObject) {
                // Ensure transform is committed immediately
                this.selectedObject.updateMatrixWorld();
                // Small delay to ensure transform is complete
                setTimeout(() => {
                    this.saveStateToHistory('Transform object');
                }, 50);
            }
        });
        this.scene.add(this.transformControls);

        // Enhanced Lighting Setup
        // Ambient light for overall scene illumination
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(this.ambientLight);

        // Main key light (bright, from top-right-front)
        // Reduced shadow map size for better performance (1024 instead of 2048)
        this.directionalLight = new THREE.DirectionalLight(0xffffff, 3);
        this.directionalLight.position.set(5, 10, 5);
        this.directionalLight.castShadow = true;
        this.directionalLight.shadow.mapSize.width = 1024;  // Reduced from 2048
        this.directionalLight.shadow.mapSize.height = 1024; // Reduced from 2048
        this.directionalLight.shadow.camera.near = 0.5;
        this.directionalLight.shadow.camera.far = 50;
        this.scene.add(this.directionalLight);

        // Fill light (softer, from opposite side)
        this.fillLight = new THREE.DirectionalLight(0xffffff, 1.8);
        this.fillLight.position.set(-5, 2, -5);
        this.scene.add(this.fillLight);

        // Rim light (backlight for edge definition)
        this.rimLight = new THREE.DirectionalLight(0xffffff, 1.2);
        this.rimLight.position.set(0, 5, -10);
        this.scene.add(this.rimLight);

        // Store lights for intensity control
        this.lights = [this.ambientLight, this.directionalLight, this.fillLight, this.rimLight];

        // Handle resize
        window.addEventListener('resize', () => this.onWindowResize());
    }

    setupDiscreteZoom() {
        // Define zoom levels: base distance is 2.0
        // 6 levels zooming in (closer): -6 to -1
        // Base level: 0
        // 6 levels zooming out (further): +1 to +6
        this.zoomLevels = [
            0.5,   // Level -6 (closest)
            0.75,  // Level -5
            1.0,   // Level -4
            1.25,  // Level -3
            1.5,   // Level -2
            1.75,  // Level -1
            2.05,  // Level 0 (base) - moved back 5px
            2.55,  // Level +1
            3.05,  // Level +2 - moved back 5px
            3.55,  // Level +3
            4.05,  // Level +4
            4.55,  // Level +5
            5.05   // Level +6 (furthest)
        ];

        // Add wheel event listener to canvas
        // This overrides the default OrbitControls wheel zoom with our custom discrete levels
        const canvas = this.renderer.domElement;
        canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            e.stopPropagation();  // Prevent OrbitControls from handling it
            
            // Determine zoom direction
            const delta = e.deltaY > 0 ? 1 : -1;
            
            // Update zoom level
            const newLevel = this.currentZoomLevel + delta;
            
            // Clamp to valid range (-6 to +6, which is indices 0 to 12)
            if (newLevel >= -6 && newLevel <= 6) {
                this.currentZoomLevel = newLevel;
                this.applyZoomLevel();
            }
        }, { passive: false });
    }

    applyZoomLevel() {
        if (!this.camera || !this.controls) return;
        
        // Get the distance for current zoom level
        // currentZoomLevel: -6 to +6, map to array index: 0 to 12
        const levelIndex = this.currentZoomLevel + 6;
        const targetDistance = this.zoomLevels[levelIndex];
        
        // Calculate direction from target to current camera position
        const direction = new THREE.Vector3();
        direction.subVectors(this.camera.position, this.controls.target);
        const directionLength = direction.length();
        
        // If direction is zero or invalid, use default direction (along Z-axis, looking from front)
        if (directionLength === 0 || !isFinite(directionLength)) {
            direction.set(0, 0, 1);
        } else {
            direction.normalize();
        }
        
        // Set new camera position: target + (direction * distance)
        this.camera.position.copy(this.controls.target).addScaledVector(direction, targetDistance);
        this.controls.update();
    }
    
    // Direction movement functions
    moveCamera(direction, amount = 0.1) {
        if (!this.camera || !this.controls) return;
        
        const moveVector = new THREE.Vector3();
        
        switch(direction.toLowerCase()) {
            case 'up':
                moveVector.set(0, amount, 0);
                break;
            case 'down':
                moveVector.set(0, -amount, 0);
                break;
            case 'left':
                moveVector.set(-amount, 0, 0);
                break;
            case 'right':
                moveVector.set(amount, 0, 0);
                break;
            case 'forward':
                // Move along camera's forward direction
                this.camera.getWorldDirection(moveVector);
                moveVector.multiplyScalar(amount);
                break;
            case 'back':
            case 'backward':
                // Move along camera's backward direction
                this.camera.getWorldDirection(moveVector);
                moveVector.multiplyScalar(-amount);
                break;
            default:
                return;
        }
        
        // Apply movement to both camera and target (panning)
        this.camera.position.add(moveVector);
        this.controls.target.add(moveVector);
        this.controls.update();
    }
    
    // Move hat in world space (not local space) to avoid axis confusion
    moveHat(direction, amount = 0.05) {
        if (!this.currentHat) {
            console.warn('No hat loaded to move');
            return;
        }
        
        // Get hat's current world position
        const worldPos = new THREE.Vector3();
        this.currentHat.getWorldPosition(worldPos);
        
        // Calculate movement in world space
        const moveVector = new THREE.Vector3();
        
        switch(direction.toLowerCase()) {
            case 'up':
                moveVector.set(0, amount, 0);  // World Y up
                break;
            case 'down':
                moveVector.set(0, -amount, 0);  // World Y down
                break;
            case 'left':
                moveVector.set(-amount, 0, 0);  // World X left
                break;
            case 'right':
                moveVector.set(amount, 0, 0);  // World X right
                break;
            case 'forward':
                moveVector.set(0, 0, -amount);  // World Z forward (toward camera)
                break;
            case 'back':
            case 'backward':
                moveVector.set(0, 0, amount);  // World Z back (away from camera)
                break;
            default:
                console.warn(`Unknown direction: ${direction}`);
                return;
        }
        
        // Calculate new world position
        const newWorldPos = worldPos.add(moveVector);
        
        // Convert back to local space relative to parent (head bone)
        if (this.currentHat.parent) {
            this.currentHat.parent.worldToLocal(newWorldPos);
            this.currentHat.position.copy(newWorldPos);
        } else {
            // If no parent, just move in world space
            this.currentHat.position.add(moveVector);
        }
        
        this.currentHat.updateMatrixWorld();
        console.log(`Hat moved ${direction}: position now X=${this.currentHat.position.x.toFixed(3)}, Y=${this.currentHat.position.y.toFixed(3)}, Z=${this.currentHat.position.z.toFixed(3)}`);
    }

    // Rotate hat on specified axis (in radians)
    // axis: 'x', 'y', 'z' or 'flip' (180 degrees on Y)
    // amount: rotation amount in radians (default: Math.PI/2 for 90 degrees)
    createGradientBackground(isLight = true) {
        // Create a canvas for gradient
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const context = canvas.getContext('2d');
        
        // Create gradient
        const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
        if (isLight) {
            // Light gradient: from light blue-white to soft cream
            gradient.addColorStop(0, '#f0f8ff'); // Alice blue
            gradient.addColorStop(0.5, '#e6f3ff'); // Light blue
            gradient.addColorStop(1, '#fff8e6'); // Cream
        } else {
            // Dark gradient: from dark gray to black
            gradient.addColorStop(0, '#1a1a1a');
            gradient.addColorStop(0.5, '#0f0f0f');
            gradient.addColorStop(1, '#0a0a0a');
        }
        
        context.fillStyle = gradient;
        context.fillRect(0, 0, canvas.width, canvas.height);
        
        // Create texture from canvas
        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;
        
        // Set as scene background
        this.scene.background = texture;
        
        // Add subtle fog for depth
        if (isLight) {
            this.scene.fog = new THREE.Fog(0xe6f3ff, 15, 60);
        } else {
            this.scene.fog = new THREE.Fog(0x0a0a0a, 10, 50);
        }
    }

    setBackground(preset) {
        const customColorGroup = document.getElementById('custom-color-group');
        
        switch(preset) {
            case 'dark':
                this.scene.background = new THREE.Color(0x1a1a1a);
                customColorGroup.style.display = 'none';
                break;
            case 'light':
                this.scene.background = new THREE.Color(0xf5f5f5);
                customColorGroup.style.display = 'none';
                break;
            case 'gradient-dark':
                this.createGradientBackground(false);
                customColorGroup.style.display = 'none';
                break;
            case 'gradient-light':
                this.createGradientBackground(true);
                customColorGroup.style.display = 'none';
                break;
            case 'blue-sky':
                this.scene.background = new THREE.Color(0x87ceeb);
                this.scene.fog = null;
                customColorGroup.style.display = 'none';
                break;
            case 'sunset':
                this.scene.background = new THREE.Color(0xff6b35);
                this.scene.fog = null;
                customColorGroup.style.display = 'none';
                break;
            case 'custom':
                customColorGroup.style.display = 'block';
                break;
        }
    }

    rotateHat(axis, amount = null) {
        if (!this.currentHat) {
            console.warn('No hat loaded to rotate');
            return;
        }

        // Handle special cases
        if (axis.toLowerCase() === 'flip') {
            // Flip = 180 degrees on Y axis
            axis = 'y';
            amount = Math.PI;
        } else if (axis.toLowerCase() === 'turn') {
            // Turn = 90 degrees on Y axis
            axis = 'y';
            amount = amount || Math.PI / 2;
        }

        // Get current rotation
        const currentRotation = new THREE.Euler().setFromQuaternion(this.currentHat.quaternion);
        
        // Apply rotation on specified axis
        const axisLower = axis.toLowerCase();
        if (axisLower === 'x') {
            currentRotation.x += (amount !== null ? amount : Math.PI / 2);
        } else if (axisLower === 'y') {
            currentRotation.y += (amount !== null ? amount : Math.PI / 2);
        } else if (axisLower === 'z') {
            currentRotation.z += (amount !== null ? amount : Math.PI / 2);
        } else {
            console.warn(`Unknown axis: ${axis}. Use 'x', 'y', 'z', 'flip', or 'turn'`);
            return;
        }

        // Apply the rotation
        this.currentHat.rotation.copy(currentRotation);
        this.currentHat.quaternion.setFromEuler(currentRotation);
        this.currentHat.updateMatrixWorld();
        
        console.log(`Hat rotated on ${axis.toUpperCase()} axis by ${((amount !== null ? amount : Math.PI / 2) * 180 / Math.PI).toFixed(1)}°`);
    }

    setupInventory() {
        const inventoryToggle = document.getElementById('inventory-toggle');
        const inventoryPanel = document.getElementById('inventory-panel');
        const inventoryClose = document.getElementById('inventory-close');
        const inventoryOverlay = document.getElementById('inventory-overlay');
        
        const openInventory = () => {
            inventoryPanel.classList.add('open');
            inventoryOverlay.classList.add('active');
            document.body.style.overflow = 'hidden';
        };
        
        const closeInventory = () => {
            inventoryPanel.classList.remove('open');
            inventoryOverlay.classList.remove('active');
            document.body.style.overflow = '';
        };
        
        if (inventoryToggle) {
            inventoryToggle.addEventListener('click', openInventory);
        }
        
        if (inventoryClose) {
            inventoryClose.addEventListener('click', closeInventory);
        }
        
        if (inventoryOverlay) {
            inventoryOverlay.addEventListener('click', closeInventory);
        }
        
        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && inventoryPanel.classList.contains('open')) {
                closeInventory();
            }
        });
    }

    setupEventListeners() {
        // Randomize button
        document.getElementById('randomize-btn').addEventListener('click', () => {
            this.randomize();
        });
        
        // NFT Search functionality - Desktop
        const nftSearchBtn = document.getElementById('nft-search-btn');
        const nftSearchInput = document.getElementById('nft-search-input');
        
        // NFT Search functionality - Mobile
        const nftSearchBtnMobile = document.getElementById('nft-search-btn-mobile');
        const nftSearchInputMobile = document.getElementById('nft-search-input-mobile');
        
        // Helper function to handle search
        const handleSearch = (inputElement) => {
            const nftNumber = parseInt(inputElement.value);
            if (nftNumber && nftNumber >= 1 && nftNumber <= 2222) {
                this.loadNFTTraits(nftNumber);
                // Clear both inputs after search
                if (nftSearchInput) nftSearchInput.value = '';
                if (nftSearchInputMobile) nftSearchInputMobile.value = '';
            } else {
                this.showNFTError('Please enter a valid NFT number between 1 and 2222');
            }
        };
        
        // Desktop search
        if (nftSearchBtn && nftSearchInput) {
            nftSearchBtn.addEventListener('click', () => handleSearch(nftSearchInput));
            nftSearchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    handleSearch(nftSearchInput);
                }
            });
        }
        
        // Mobile search
        if (nftSearchBtnMobile && nftSearchInputMobile) {
            nftSearchBtnMobile.addEventListener('click', () => handleSearch(nftSearchInputMobile));
            nftSearchInputMobile.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    handleSearch(nftSearchInputMobile);
                }
            });
        }
        
        // Scene controls
        // Background preset selector
        const bgPreset = document.getElementById('bg-preset');
        if (bgPreset) {
            bgPreset.addEventListener('change', (e) => {
                this.setBackground(e.target.value);
            });
            // Initialize with dark studio
            this.setBackground('gradient-light');
        }
        
        // Custom color input
        const bgColor = document.getElementById('bg-color');
        if (bgColor) {
            bgColor.addEventListener('input', (e) => {
                this.scene.background = new THREE.Color(e.target.value);
                if (this.scene.fog) this.scene.fog = null;
            });
        }

        document.getElementById('light-intensity').addEventListener('input', (e) => {
            const intensity = parseFloat(e.target.value);
            document.getElementById('light-value').textContent = intensity.toFixed(1);
            // Update all lights proportionally
            if (this.lights) {
                this.directionalLight.intensity = intensity;
                this.fillLight.intensity = intensity * 0.6;
                this.rimLight.intensity = intensity * 0.4;
                this.ambientLight.intensity = intensity * 0.2;
            }
        });
        
        // Auto-rotate toggle
        const autoRotateCheckbox = document.getElementById('auto-rotate');
        if (autoRotateCheckbox) {
            autoRotateCheckbox.addEventListener('change', (e) => {
                this.autoRotate = e.target.checked;
                if (this.controls) {
                    this.controls.autoRotate = this.autoRotate;
                    this.controls.autoRotateSpeed = 2.0;
                }
                console.log(`Auto-rotate ${this.autoRotate ? 'enabled' : 'disabled'}`);
            });
        }
        
        // Edit mode toggle
        const editModeCheckbox = document.getElementById('edit-mode');
        if (editModeCheckbox) {
            editModeCheckbox.addEventListener('change', (e) => {
                this.setEditMode(e.target.checked);
            });
        }
        
        // Save positions button
        const savePositionsBtn = document.getElementById('save-positions-btn');
        if (savePositionsBtn) {
            savePositionsBtn.addEventListener('click', () => {
                this.saveCurrentPositions();
            });
        }
        
        // Object selection for edit mode
        this.setupObjectSelection();
        this.setupClickToSelect();
    }

    setupFurGallery() {
        const gallery = document.getElementById('fur-gallery');
        gallery.innerHTML = '';

        this.furOptions.forEach((furName) => {
            const button = document.createElement('button');
            button.className = 'fur-btn';
            button.title = `Load ${furName}.glb from WEARABLES/Furs folder`;
            
            // Create image element with lazy loading
            const img = document.createElement('img');
            const imagePath = `Selection Images/Furs/${furName}.png`;
            img.loading = 'lazy'; // Native lazy loading
            img.src = imagePath;
            img.alt = furName;
            img.onerror = () => {
                // Fallback to text if image doesn't exist
                button.innerHTML = '';
                button.textContent = furName;
            };
            button.appendChild(img);
            
            button.addEventListener('click', () => {
                this.loadFurFile(furName);
            });
            gallery.appendChild(button);
        });
    }

    setupHatGallery() {
        const gallery = document.getElementById('hat-gallery');
        gallery.innerHTML = '';

        this.hatOptions.forEach((hatName) => {
            const button = document.createElement('button');
            button.className = 'fur-btn';
            button.title = `Load ${hatName}.glb hat`;
            
            // Create image element with lazy loading
            const img = document.createElement('img');
            const imagePath = `Selection Images/Hats/${hatName}.png`;
            img.loading = 'lazy'; // Native lazy loading
            img.src = imagePath;
            img.alt = hatName;
            img.onerror = () => {
                // Fallback to text if image doesn't exist
                button.innerHTML = '';
                button.textContent = hatName;
            };
            button.appendChild(img);
            
            button.addEventListener('click', () => {
                this.loadHat(hatName);
            });
            gallery.appendChild(button);
        });

        // Remove hat button
        document.getElementById('remove-hat-btn').addEventListener('click', () => {
            this.removeHat();
        });
    }

    setupShirtGallery() {
        const gallery = document.getElementById('shirt-gallery');
        gallery.innerHTML = '';

        this.shirtOptions.forEach((shirtName) => {
            const button = document.createElement('button');
            button.className = 'fur-btn';
            button.title = `Load ${shirtName}.glb shirt`;
            
            // Create image element with lazy loading
            const img = document.createElement('img');
            img.loading = 'lazy'; // Native lazy loading
            img.src = `Selection%20Images/Shirt/${encodeURIComponent(shirtName)}.png`;
            img.alt = shirtName;
            img.onerror = () => {
                // Fallback to text if image doesn't exist
                button.innerHTML = '';
                button.textContent = shirtName;
            };
            button.appendChild(img);
            
            button.addEventListener('click', () => {
                this.loadShirt(shirtName);
            });
            gallery.appendChild(button);
        });

        // Remove shirt button
        document.getElementById('remove-shirt-btn').addEventListener('click', () => {
            this.removeShirt();
        });
    }

    setupEyesGallery() {
        const gallery = document.getElementById('eyes-gallery');
        gallery.innerHTML = '';

        this.eyeOptions.forEach((eyeName) => {
            const button = document.createElement('button');
            button.className = 'fur-btn';
            button.title = `Load ${eyeName}.glb eyes`;
            
            // Create image element with lazy loading
            const img = document.createElement('img');
            // Skip image for Default since it doesn't have a PNG
            if (eyeName === 'Default') {
                button.textContent = eyeName;
            } else {
                const imagePath = `Selection Images/Eyes/${eyeName}.png`;
                img.loading = 'lazy'; // Native lazy loading
                img.src = imagePath;
                img.alt = eyeName;
                img.onerror = () => {
                    // Fallback to text if image doesn't exist
                    button.innerHTML = '';
                    button.textContent = eyeName;
                };
                button.appendChild(img);
            }
            
            button.addEventListener('click', () => {
                this.loadEyes(eyeName);
            });
            gallery.appendChild(button);
        });

        // Remove eyes button
        document.getElementById('remove-eyes-btn').addEventListener('click', () => {
            this.removeEyes();
        });
    }

    async loadFurFile(furName, preserveWearables = true, manageLoadingScreen = true) {
        // Load GLB file directly from the WEARABLES/Furs folder
        const fileName = `${furName}.glb`;
        // Properly encode the file path to handle spaces and special characters
        const filePath = this.encodePath('WEARABLES/Furs', fileName);
        
        const loading = document.getElementById('loading');
        const placeholder = document.getElementById('placeholder');
        
        // Only manage loading screen if explicitly requested (default behavior)
        if (manageLoadingScreen) {
            if (loading) {
                loading.style.display = 'block';
            }
            if (placeholder) {
                placeholder.style.display = 'none';
            }
        }

        const loader = new GLTFLoader();
        
        try {
            const gltf = await new Promise((resolve, reject) => {
                loader.load(
                    filePath,
                    resolve,
                    undefined,
                    (error) => {
                        console.error(`Error loading ${fileName} from path: ${filePath}`, error);
                        reject(new Error(`Failed to load ${fileName}. Make sure the file exists in the WEARABLES/Furs folder.`));
                    }
                );
            });

            // Store previous model's transform to preserve position/scale when switching furs
            let previousPosition = null;
            let previousScale = null;
            let previousHat = null;
            let previousShirt = null;
            let previousEyes = null;
            
            if (this.model) {
                // Save current hat, shirt, and eyes before removing model
                previousHat = this.currentHat;
                previousShirt = this.currentShirt;
                previousEyes = this.currentEyes;
                
                // Save previous model's transform
                previousPosition = this.model.position.clone();
                previousScale = this.model.scale.clone();
                
                // Temporarily remove hat, shirt, and eyes from model before removing model
                if (this.currentHat && this.currentHat.parent) {
                    this.currentHat.parent.remove(this.currentHat);
                }
                if (this.currentShirt && this.currentShirt.parent) {
                    this.currentShirt.parent.remove(this.currentShirt);
                }
                if (this.currentEyes && this.currentEyes.parent) {
                    this.currentEyes.parent.remove(this.currentEyes);
                }
                this.scene.remove(this.model);
            }

            this.model = gltf.scene;
            this.originalModel = this.model.clone();
            
            // Preserve auto-rotate state when switching models
            if (this.controls) {
                this.controls.autoRotate = this.autoRotate;
                if (this.autoRotate) {
                    this.controls.autoRotateSpeed = 2.0;
                }
            }
            
            // Preserve position and scale when switching furs (don't reset)
            if (previousPosition && previousScale) {
                // Use previous position and scale to maintain otter position
                this.model.position.copy(previousPosition);
                this.model.scale.copy(previousScale);
            } else {
                // First load - center and scale normally
                this.centerModel();
                // Reset camera and controls to center on the model
                // Set target based on device type
                if (window.innerWidth <= 768) {
                    this.controls.target.set(0, -0.4, 0);  // Mobile: centered target
                } else {
                    this.controls.target.set(0, -0.4, 0);  // Desktop: target at -0.4
                }
                this.currentZoomLevel = 2;  // Start slightly zoomed out (level +2)
                this.applyZoomLevel();  // Apply the zoom level
            }
            
            this.scene.add(this.model);
            this.requestRender(); // Scene changed, request render

            // Update UI
            document.getElementById('scene-panel').style.display = 'block';
            document.getElementById('hat-panel').style.display = 'block';
            document.getElementById('shirt-panel').style.display = 'block';
            document.getElementById('eyes-panel').style.display = 'block';
            
            // Restore hat if it existed (preserve hat when switching furs, unless preserveWearables is false)
            if (previousHat && preserveWearables) {
                // Find head bone in new model
                const headBone = this.findHeadBone(this.model);
                if (headBone) {
                    headBone.add(previousHat);
                    this.currentHat = previousHat;
                    document.getElementById('remove-hat-btn').disabled = false;
                } else {
                    // If no head bone, remove the hat
                    this.scene.remove(previousHat);
                    this.currentHat = null;
                    document.getElementById('remove-hat-btn').disabled = true;
                }
            } else if (previousHat && !preserveWearables) {
                // Clean up previous hat if not preserving
                this.scene.remove(previousHat);
                this.currentHat = null;
                document.getElementById('remove-hat-btn').disabled = true;
            }

            // Restore shirt if it existed (preserve shirt when switching furs, unless preserveWearables is false)
            if (previousShirt && preserveWearables) {
                // Attach directly to model root (not body bone) to align with furs
                this.model.add(previousShirt);
                this.currentShirt = previousShirt;
                document.getElementById('remove-shirt-btn').disabled = false;
            } else if (previousShirt && !preserveWearables) {
                // Clean up previous shirt if not preserving
                this.scene.remove(previousShirt);
                this.currentShirt = null;
                document.getElementById('remove-shirt-btn').disabled = true;
            }

            // Restore eyes if they existed (preserve eyes when switching furs, unless preserveWearables is false)
            if (previousEyes && preserveWearables) {
                // Find head bone in new model
                const headBone = this.findHeadBone(this.model);
                if (headBone) {
                    headBone.add(previousEyes);
                    this.currentEyes = previousEyes;
                    document.getElementById('remove-eyes-btn').disabled = false;
                } else {
                    // If no head bone, remove the eyes
                    this.scene.remove(previousEyes);
                    this.currentEyes = null;
                    document.getElementById('remove-eyes-btn').disabled = true;
                }
            } else if (previousEyes && !preserveWearables) {
                // Clean up previous eyes if not preserving
                this.scene.remove(previousEyes);
                this.currentEyes = null;
                document.getElementById('remove-eyes-btn').disabled = true;
            }

        } catch (error) {
            console.error('Error loading GLB:', error);
            alert(`Error loading ${fileName}:\n\n${error.message}\n\nMake sure the file exists in the WEARABLES/Furs folder.`);
            if (manageLoadingScreen && placeholder) {
                placeholder.style.display = 'flex';
            }
        } finally {
            // Only hide loading screen if we're managing it
            if (manageLoadingScreen && loading) {
                loading.style.display = 'none';
            }
        }
    }

    async loadGLB(file) {
        if (!file) return;

        const loading = document.getElementById('loading');
        const placeholder = document.getElementById('placeholder');
        loading.style.display = 'block';
        placeholder.style.display = 'none';

        const loader = new GLTFLoader();
        
        try {
            const gltf = await new Promise((resolve, reject) => {
                loader.load(
                    URL.createObjectURL(file),
                    resolve,
                    undefined,
                    reject
                );
            });

            // Remove previous model
            if (this.model) {
                this.scene.remove(this.model);
            }

            this.model = gltf.scene;
            this.originalModel = this.model.clone();
            
            // Center and scale model
            this.centerModel();
            
            this.scene.add(this.model);

            // Reset camera and controls to center on the model
            // Set to perfect viewing position matching the desired size
            if (window.innerWidth <= 768) {
                this.controls.target.set(0, -0.6, 0);  // Mobile: lower target
            } else {
                this.controls.target.set(0, -0.4, 0);  // Desktop: target at -0.4
            }
            this.currentZoomLevel = 2;  // Start slightly zoomed out (level +2)
            this.applyZoomLevel();  // Apply the zoom level

            // Update UI
            document.getElementById('scene-panel').style.display = 'block';
            document.getElementById('hat-panel').style.display = 'block';
            document.getElementById('shirt-panel').style.display = 'block';
            document.getElementById('eyes-panel').style.display = 'block';
            
            // Remove any existing hat when loading new fur
            if (this.currentHat) {
                if (this.currentHat.parent === this.model) {
                    this.model.remove(this.currentHat);
                } else {
                    this.scene.remove(this.currentHat);
                }
                this.currentHat = null;
                document.getElementById('remove-hat-btn').disabled = true;
            }

            // Remove any existing shirt when loading new fur
            if (this.currentShirt) {
                if (this.currentShirt.parent === this.model) {
                    this.model.remove(this.currentShirt);
                } else {
                    this.scene.remove(this.currentShirt);
                }
                this.currentShirt = null;
                document.getElementById('remove-shirt-btn').disabled = true;
            }

        } catch (error) {
            console.error('Error loading GLB:', error);
            alert('Error loading GLB file. Please make sure it is a valid GLB file.');
        } finally {
            loading.style.display = 'none';
        }
    }

    // Reference file loading removed - using default transforms
    // This function is kept for potential future use but is not called
    async loadReferenceFile() {
        const loader = new GLTFLoader();
        try {
            const gltf = await new Promise((resolve, reject) => {
                loader.load(
                    'everythinggg.glb',
                    resolve,
                    undefined,
                    (error) => {
                        console.warn('Could not load reference file:', error);
                        reject(error);
                    }
                );
            });

            const referenceScene = gltf.scene;
            this.referenceHatTransforms = {};
            this.referenceShirtTransforms = {};

            // Find head bone and body bone in reference scene
            const headBone = this.findHeadBone(referenceScene);
            const bodyBone = this.findBodyBone(referenceScene);
            
            if (!headBone) {
                console.warn('No head bone found in reference file');
            }
            if (!bodyBone) {
                console.warn('No body bone found in reference file');
            }

            // Traverse entire scene to find hat and shirt meshes (they might be nested)
            referenceScene.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    const meshName = child.name.toLowerCase();
                    const parentName = child.parent ? child.parent.name.toLowerCase() : '';
                    
                    // Check if this is a hat mesh
                    let hatMatchedKey = null;
                    
                    if (meshName.includes('backwardsh') && (meshName.includes('2') || meshName.includes('3'))) {
                        hatMatchedKey = meshName.includes('2') ? 'backwardsh2' : 'backwardsh3';
                    } else if (meshName.includes('whale')) {
                        hatMatchedKey = 'whale';
                    } else if (meshName.includes('spikey') && meshName.includes('halo')) {
                        hatMatchedKey = 'spikeyhairhalo';
                    } else if (meshName.includes('green') && meshName.includes('dino')) {
                        hatMatchedKey = 'greendino';
                    } else if (meshName.includes('pink') && meshName.includes('dino')) {
                        hatMatchedKey = 'pinkdino';
                    } else if (meshName.includes('ducky')) {
                        hatMatchedKey = 'ducky';
                    }
                    
                    // Store hat transform if matched
                    if (hatMatchedKey && headBone && !this.referenceHatTransforms[hatMatchedKey]) {
                        // Get world transform
                        const worldPos = new THREE.Vector3();
                        const worldQuat = new THREE.Quaternion();
                        const worldScale = new THREE.Vector3();
                        child.getWorldPosition(worldPos);
                        child.getWorldQuaternion(worldQuat);
                        child.getWorldScale(worldScale);
                        
                        // Convert to local space relative to head bone
                        const localPos = worldPos.clone();
                        headBone.worldToLocal(localPos);
                        
                        // Get local rotation (convert world quaternion to local)
                        const localQuat = worldQuat.clone();
                        const headBoneWorldQuat = new THREE.Quaternion();
                        headBone.getWorldQuaternion(headBoneWorldQuat);
                        localQuat.premultiply(headBoneWorldQuat.invert());
                        
                        // Store the transform
                        this.referenceHatTransforms[hatMatchedKey] = {
                            position: localPos.clone(),
                            rotation: new THREE.Euler().setFromQuaternion(localQuat),
                            scale: worldScale.clone()
                        };
                        
                        console.log(`Found reference hat transform for ${hatMatchedKey} (mesh: ${child.name}):`, {
                            position: localPos,
                            rotation: this.referenceHatTransforms[hatMatchedKey].rotation,
                            scale: worldScale
                        });
                    }
                    
                    // Check if this is a shirt mesh - try to match against all shirt options
                    // Shirt meshes typically don't have "body", "head", "teeth", "tongue" in their names
                    const isShirtMesh = (
                        !meshName.includes('body') &&
                        !meshName.includes('head') &&
                        !meshName.includes('teeth') &&
                        !meshName.includes('tooth') &&
                        !meshName.includes('tongue') &&
                        !meshName.includes('eye') &&
                        !meshName.includes('nose') &&
                        !meshName.includes('whisker') &&
                        !meshName.includes('cone') &&
                        !meshName.includes('geo') &&
                        !meshName.includes('sphere') &&
                        !meshName.includes('mesh_0001') &&
                        meshName.length > 0
                    );
                    
                    // Try to match shirt name from mesh name or parent name
                    if (isShirtMesh && bodyBone) {
                        // Check if mesh is parented to body bone or in body bone hierarchy
                        let checkParent = child.parent;
                        let isParentedToBody = false;
                        while (checkParent) {
                            if (checkParent === bodyBone || 
                                (checkParent instanceof THREE.Bone && 
                                 (checkParent.name.toLowerCase().includes('body') ||
                                  checkParent.name.toLowerCase().includes('torso') ||
                                  checkParent.name.toLowerCase().includes('spine') ||
                                  checkParent.name.toLowerCase().includes('chest')))) {
                                isParentedToBody = true;
                                break;
                            }
                            checkParent = checkParent.parent;
                        }
                        
                        // Try to match shirt name from mesh name - use more flexible matching
                        let shirtMatchedKey = null;
                        let bestMatch = null;
                        let bestScore = 0;
                        
                        // Normalize mesh name for comparison
                        const meshNameNormalized = meshName.replace(/[-_\s]/g, '').toLowerCase();
                        const originalMeshName = child.name;
                        
                        for (const shirtOption of this.shirtOptions) {
                            const shirtNameNormalized = shirtOption.replace(/[-_\s]/g, '').toLowerCase();
                            
                            // Exact match
                            if (meshNameNormalized === shirtNameNormalized || 
                                meshName === shirtOption.toLowerCase()) {
                                shirtMatchedKey = shirtOption;
                                break;
                            }
                            
                            // Check if mesh name contains shirt name (or vice versa)
                            if (meshNameNormalized.includes(shirtNameNormalized) || 
                                shirtNameNormalized.includes(meshNameNormalized)) {
                                const score = Math.min(meshNameNormalized.length, shirtNameNormalized.length);
                                if (score > bestScore) {
                                    bestScore = score;
                                    bestMatch = shirtOption;
                                }
                            }
                            
                            // Check if original mesh name matches (case-insensitive, with variations)
                            const originalLower = originalMeshName.toLowerCase();
                            const shirtLower = shirtOption.toLowerCase();
                            if (originalLower.includes(shirtLower) || shirtLower.includes(originalLower)) {
                                const score = Math.min(originalLower.length, shirtLower.length);
                                if (score > bestScore) {
                                    bestScore = score;
                                    bestMatch = shirtOption;
                                }
                            }
                        }
                        
                        // Use best match if found
                        if (!shirtMatchedKey && bestMatch) {
                            shirtMatchedKey = bestMatch;
                        }
                        
                        // Store shirt transform if matched and not already stored
                        if (shirtMatchedKey && !this.referenceShirtTransforms[shirtMatchedKey]) {
                            // Get world transform
                            const worldPos = new THREE.Vector3();
                            const worldQuat = new THREE.Quaternion();
                            const worldScale = new THREE.Vector3();
                            child.getWorldPosition(worldPos);
                            child.getWorldQuaternion(worldQuat);
                            child.getWorldScale(worldScale);
                            
                            // Convert to local space relative to body bone
                            const localPos = worldPos.clone();
                            bodyBone.worldToLocal(localPos);
                            
                            // Get local rotation (convert world quaternion to local)
                            const localQuat = worldQuat.clone();
                            const bodyBoneWorldQuat = new THREE.Quaternion();
                            bodyBone.getWorldQuaternion(bodyBoneWorldQuat);
                            localQuat.premultiply(bodyBoneWorldQuat.invert());
                            
                            // Store the transform
                            this.referenceShirtTransforms[shirtMatchedKey] = {
                                position: localPos.clone(),
                                rotation: new THREE.Euler().setFromQuaternion(localQuat),
                                scale: worldScale.clone()
                            };
                            
                            console.log(`Found reference shirt transform for ${shirtMatchedKey} (mesh: ${child.name}):`, {
                                position: localPos,
                                rotation: this.referenceShirtTransforms[shirtMatchedKey].rotation,
                                scale: worldScale
                            });
                        }
                    }
                }
            });
            
            console.log('Reference hat transforms loaded:', Object.keys(this.referenceHatTransforms).length, 'hats');
            console.log('Reference shirt transforms loaded:', Object.keys(this.referenceShirtTransforms).length, 'shirts');
            if (Object.keys(this.referenceShirtTransforms).length > 0) {
                console.log('Shirt transforms found:', Object.keys(this.referenceShirtTransforms));
            } else {
                console.warn('No shirt transforms found in reference file. Shirts will use default positioning.');
            }
        } catch (error) {
            console.warn('Could not load reference file, using default transforms:', error);
        }
    }

    centerModel() {
        // Check if model is already at origin and centered (preserve Blender positioning)
        const box = new THREE.Box3().setFromObject(this.model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        
        // If model is already centered at origin (within tolerance), preserve Blender positioning
        const isAlreadyCentered = Math.abs(center.x) < 0.01 && 
                                  Math.abs(center.y) < 0.01 && 
                                  Math.abs(center.z) < 0.01;
        
        if (isAlreadyCentered && 
            Math.abs(this.model.position.x) < 0.01 && 
            Math.abs(this.model.position.y) < 0.01 && 
            Math.abs(this.model.position.z) < 0.01) {
            // Model is already correctly positioned in Blender - only apply minimal scaling if needed
            // Don't reposition, preserve Blender's 0,0,0 positioning
            
            // Only scale if the model is extremely large or small (outside reasonable range)
            const maxDim = Math.max(size.x, size.y, size.z);
            if (maxDim > 10.0) {
                // Model is very large, scale it down
                const scale = 2.0 / maxDim;
                this.model.scale.multiplyScalar(scale);
            } else if (maxDim < 0.1) {
                // Model is very small, scale it up
                const scale = 2.0 / maxDim;
                this.model.scale.multiplyScalar(scale);
            }
        } else {
            // Model is not centered - apply centering (for older files or incorrectly positioned models)
            this.model.position.sub(center);
            this.model.position.y -= 0.9;  // Move model down to appear lower on screen
            this.model.position.x = 0;
            
            // Scale to fit - adjust scale factor for perfect viewing size
            const maxDim = Math.max(size.x, size.y, size.z);
            const scale = 2.0 / maxDim;  // Scale factor for viewing size
            this.model.scale.multiplyScalar(scale);
        }
    }

    /* -----------------------------------------------------
       OPTIMIZED HAT LOADER
    ----------------------------------------------------- */

    async loadHat(hatName) {
        if (!this.model) {
            alert("Please load an otter fur first!");
            return;
        }

        if (this.currentHat?.parent) this.currentHat.parent.remove(this.currentHat);
        this.currentHat = null;

        const filePath = this.encodePath("WEARABLES/Hats", `${hatName}.glb`);
        console.log(`Loading hat from path: ${filePath}`);
        const loader = new GLTFLoader();
        
        try {
            const gltf = await loader.loadAsync(filePath);

            const hatGroup = new THREE.Group();
            hatGroup.userData.hatName = hatName;

            this.removePlaceholdersFromScene(gltf.scene);

            const meshes = this.extractWearableMeshes(gltf.scene);
            
            // CRITICAL FIX: Get WORLD transforms of meshes before extracting
            // This accounts for any parent transforms in the GLB hierarchy
            gltf.scene.updateMatrixWorld(true);
            
            meshes.forEach(mesh => {
                // Get world transform before removing from GLB scene
                const worldPos = new THREE.Vector3();
                const worldQuat = new THREE.Quaternion();
                const worldScale = new THREE.Vector3();
                mesh.getWorldPosition(worldPos);
                mesh.getWorldQuaternion(worldQuat);
                mesh.getWorldScale(worldScale);
                
                // Reset mesh to origin in hatGroup's local space
                mesh.position.set(0, 0, 0);
                mesh.rotation.set(0, 0, 0);
                mesh.scale.set(1, 1, 1);
                mesh.quaternion.set(0, 0, 0, 1);
                
                // Add to hatGroup first (so we can convert world to local)
                hatGroup.add(mesh);
                
                // Convert world transform to hatGroup's local space
                hatGroup.updateMatrixWorld(true);
                const localPos = worldPos.clone();
                const localQuat = worldQuat.clone();
                const localScale = worldScale.clone();
                
                hatGroup.worldToLocal(localPos);
                
                // Apply the converted local transform
                mesh.position.copy(localPos);
                mesh.quaternion.copy(localQuat);
                mesh.scale.copy(localScale);
                mesh.rotation.setFromQuaternion(localQuat);
            });

            const headBone = this.findHeadBone(this.model);

            if (!headBone) {
                console.warn("No head bone found – attaching hat to root instead.");
                this.model.add(hatGroup);
                this.currentHat = hatGroup;
                document.getElementById("remove-hat-btn").disabled = false;
                return;
            }

            // FORCE EXACT COORDINATES FOR ALL HATS - These values are mandatory for all hats
            // Set forced values BEFORE parenting to bone (skip attachWearableToBone calculation)
            // Position (local): x: -0.607745, y: 0.000000, z: 0.005627
            hatGroup.position.set(-0.607745, 0.000000, 0.005627);
            
            // Scale (local): x: 1.000000, y: 1.000000, z: 1.000000
            hatGroup.scale.set(1.000000, 1.000000, 1.000000);
            
            // Rotation (local, Euler): x: 0.000000, y: -0.000000, z: -1.570796 (approximately -90 degrees, or -π/2 radians)
            hatGroup.rotation.set(0.000000, -0.000000, -1.570796);
            
            // Quaternion (local): x: 0.000000, y: -0.000000, z: -0.707107, w: 0.707107
            hatGroup.quaternion.set(0.000000, -0.000000, -0.707107, 0.707107);
            
            // Parent directly to bone with forced values (skip attachWearableToBone calculation)
            headBone.add(hatGroup);
            
            // Expected World Position: x: -0.000000, y: -0.900000, z: 0.150000

            // Log exact position, scale, and rotation values
            console.log(`=== ${hatName} - FORCED Exact Transform Values ===`);
            console.log('Position (local):', {
                x: hatGroup.position.x.toFixed(6),
                y: hatGroup.position.y.toFixed(6),
                z: hatGroup.position.z.toFixed(6)
            });
            console.log('Scale (local):', {
                x: hatGroup.scale.x.toFixed(6),
                y: hatGroup.scale.y.toFixed(6),
                z: hatGroup.scale.z.toFixed(6)
            });
            console.log('Rotation (local, Euler):', {
                x: hatGroup.rotation.x.toFixed(6),
                y: hatGroup.rotation.y.toFixed(6),
                z: hatGroup.rotation.z.toFixed(6)
            });
            console.log('Quaternion (local):', {
                x: hatGroup.quaternion.x.toFixed(6),
                y: hatGroup.quaternion.y.toFixed(6),
                z: hatGroup.quaternion.z.toFixed(6),
                w: hatGroup.quaternion.w.toFixed(6)
            });
            
            // Also log world position for reference
            const finalWorldPos = new THREE.Vector3();
            hatGroup.getWorldPosition(finalWorldPos);
            console.log('World Position:', {
                x: finalWorldPos.x.toFixed(6),
                y: finalWorldPos.y.toFixed(6),
                z: finalWorldPos.z.toFixed(6)
            });
            console.log('==========================================');

            this.currentHat = hatGroup;
            document.getElementById("remove-hat-btn").disabled = false;
            this.requestRender(); // Scene changed, request render
        } catch (error) {
            console.error('Error loading hat:', error);
            console.error('Attempted path:', filePath);
            console.error('Full error details:', error);
            alert(`Error loading ${hatName}.glb:\n\nPath: ${filePath}\n\nError: ${error.message}\n\nMake sure:\n1. The file exists in the WEARABLES/Hats folder\n2. You're running the app from a web server (not file://)\n3. Check the browser console for more details`);
        }
    }

    findHeadBone(model) {
        let headBone = null;
        const headBoneNames = ['head', 'Head', 'HEAD', 'head_bone', 'Head_Bone'];
        
        model.traverse((child) => {
            if (child instanceof THREE.Bone || child.type === 'Bone') {
                const name = child.name.toLowerCase();
                if (headBoneNames.some(pattern => name.includes(pattern.toLowerCase())) || 
                    name === 'head' || 
                    name.includes('head')) {
                    headBone = child;
                }
            }
        });
        
        // If no head bone found, try to find it in skeleton
        if (!headBone && model.children.length > 0) {
            model.traverse((child) => {
                if (child.skeleton) {
                    child.skeleton.bones.forEach(bone => {
                        const name = bone.name.toLowerCase();
                        if (headBoneNames.some(pattern => name.includes(pattern.toLowerCase())) || 
                            name === 'head' || 
                            name.includes('head')) {
                            headBone = bone;
                        }
                    });
                }
            });
        }
        
        return headBone;
    }

    findBodyBone(model) {
        let bodyBone = null;
        const bodyBoneNames = ['body', 'Body', 'BODY', 'torso', 'Torso', 'TORSO', 'spine', 'Spine', 'SPINE', 'chest', 'Chest', 'CHEST', 'root', 'Root', 'ROOT'];
        
        model.traverse((child) => {
            if (child instanceof THREE.Bone || child.type === 'Bone') {
                const name = child.name.toLowerCase();
                if (bodyBoneNames.some(pattern => name.includes(pattern.toLowerCase())) || 
                    (name.includes('body') && !name.includes('head')) ||
                    (name.includes('torso') && !name.includes('head')) ||
                    (name.includes('spine') && !name.includes('head')) ||
                    (name === 'root' && !name.includes('head'))) {
                    bodyBone = child;
                }
            }
        });
        
        // If no body bone found, try to find it in skeleton
        if (!bodyBone && model.children.length > 0) {
            model.traverse((child) => {
                if (child.skeleton) {
                    child.skeleton.bones.forEach(bone => {
                        const name = bone.name.toLowerCase();
                        if (bodyBoneNames.some(pattern => name.includes(pattern.toLowerCase())) || 
                            (name.includes('body') && !name.includes('head')) ||
                            (name.includes('torso') && !name.includes('head')) ||
                            (name.includes('spine') && !name.includes('head'))) {
                            bodyBone = bone;
                        }
                    });
                }
            });
        }
        
        return bodyBone;
    }

    filterHatByHeadBone(hatScene, headBone) {
        // Create a new group for filtered hat
        const filteredHat = new THREE.Group();
        filteredHat.userData = hatScene.userData;
        
        const meshesToKeep = [];
        const meshesToRemove = [];
        
        // Get otter body mesh names for comparison
        const otterBodyMeshes = new Set();
        if (this.model) {
            this.model.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    otterBodyMeshes.add(child.name);
                }
            });
        }
        
        // Collect only meshes (not bones or other objects)
        const allObjects = [];
        hatScene.traverse((child) => {
            // Only collect meshes - skip bones, groups, and other objects
            if (child instanceof THREE.Mesh) {
                allObjects.push(child);
            }
        });
        
        // Filter objects: remove placeholders and body parts, keep everything else
        allObjects.forEach((child) => {
            const name = child.name.toLowerCase();
            const originalName = child.name;
            
            // REMOVE: Blender placeholder objects - check for ANY occurrence of cone/geo/sphere
            const isPlaceholder = (
                name.includes('cone') ||
                name.includes('geo') ||
                name.includes('sphere')
            );
            
            // Only process meshes (all objects in allObjects are already meshes)
            
            // Check if this is a body mesh (matches otter body exactly)
            const isOtterBody = otterBodyMeshes.has(child.name);
            
            // Body part keywords to remove
            const isBodyPart = (
                name.includes('teeth') ||
                name.includes('tooth') ||
                name.includes('tongue') ||
                name.includes('body') ||
                name.includes('torso') ||
                name.includes('mouth') ||
                (name.includes('eye') && !name.includes('ear') && !name.includes('bunny')) ||
                name.includes('nose') ||
                name.includes('whisker')
            );
            
            // Generic body mesh patterns - ALL mesh_0001 patterns are body
            const isGenericBody = (
                name.includes('mesh_0001') || 
                name.startsWith('mesh_0001') ||
                name.match(/^mesh_0001/i)
            );
            
            // Remove placeholders and body parts
            if (isPlaceholder || isOtterBody || isGenericBody || isBodyPart) {
                meshesToRemove.push(child);
            } else {
                // Keep everything else (should be the hat)
                meshesToKeep.push(child);
            }
        });
        
        // Clone and add only hat meshes, preserving their transforms
        meshesToKeep.forEach(mesh => {
            const clonedMesh = mesh.clone();
            // Preserve all transforms from the original mesh
            clonedMesh.position.copy(mesh.position);
            clonedMesh.rotation.copy(mesh.rotation);
            clonedMesh.scale.copy(mesh.scale);
            clonedMesh.quaternion.copy(mesh.quaternion);
            clonedMesh.matrix.copy(mesh.matrix);
            clonedMesh.matrixWorld.copy(mesh.matrixWorld);
            // Preserve skeleton if it exists
            if (mesh.skeleton) {
                clonedMesh.skeleton = mesh.skeleton;
                clonedMesh.bind(mesh.skeleton, mesh.bindMatrix);
            }
            filteredHat.add(clonedMesh);
        });
        
        return filteredHat;
    }

    filterShirtByBody(shirtScene) {
        // Create a new group for filtered shirt
        const filteredShirt = new THREE.Group();
        filteredShirt.userData = shirtScene.userData;
        
        const meshesToKeep = [];
        const meshesToRemove = [];
        
        // Get otter body mesh names and geometry for comparison
        const otterBodyMeshes = new Set();
        const otterBodyGeometries = new Map(); // Store geometry to compare
        
        if (this.model) {
            this.model.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    otterBodyMeshes.add(child.name);
                    // Store geometry for comparison (by vertex count or bounding box)
                    if (child.geometry) {
                        const box = new THREE.Box3().setFromObject(child);
                        const size = box.getSize(new THREE.Vector3());
                        otterBodyGeometries.set(child.name, {
                            vertexCount: child.geometry.attributes.position?.count || 0,
                            size: size,
                            center: box.getCenter(new THREE.Vector3())
                        });
                    }
                }
            });
        }
        
        // Collect meshes AND curves/lines (text content on shirts)
        // Also log all object names for debugging
        const allObjects = [];
        const allObjectNames = [];
        shirtScene.traverse((child) => {
            if (child instanceof THREE.Mesh || 
                child instanceof THREE.Line || 
                child instanceof THREE.LineSegments ||
                child.type === 'Line' ||
                child.type === 'LineSegments') {
                allObjects.push(child);
                allObjectNames.push(child.name);
            }
        });
        console.log(`Found ${allObjects.length} objects in shirt scene:`, allObjectNames);
        
        // Filter objects: remove otter body meshes, placeholders, and head parts
        allObjects.forEach((child) => {
            const name = child.name.toLowerCase();
            const originalName = child.name;
            
            // REMOVE: Blender placeholder objects - check both lowercase and original name
            const isPlaceholder = (
                name.includes('cone') ||
                name.includes('geo') ||
                name.includes('sphere') ||
                name.includes('placeholder') ||
                name.includes('temp') ||
                originalName.includes('Cone') ||
                originalName.includes('Sphere') ||
                originalName.includes('Geo')
            );
            
            // Check if this is a curve/line (text content) - these should be kept but may need rotation/positioning
            const isCurveOrLine = (
                child instanceof THREE.Line ||
                child instanceof THREE.LineSegments ||
                child.type === 'Line' ||
                child.type === 'LineSegments' ||
                name.includes('curve') ||
                name.includes('text') ||
                originalName.includes('Curve') ||
                originalName.includes('Text')
            );
            
            // Check geometry shape - detect cones and spheres ONLY by geometry type (primitives)
            // Don't use bounding box detection - it's too aggressive and removes actual shirts
            // BUT: Don't remove curves/lines - they're text content on shirts
            let isConeOrSphere = false;
            if (!isCurveOrLine && child.geometry) {
                const geometryType = child.geometry.type;
                // ONLY check for primitive geometry types - these are definitely placeholders
                // Don't check bounding box - actual shirt meshes might have similar shapes
                if (geometryType === 'ConeGeometry' || 
                    geometryType === 'SphereGeometry' ||
                    geometryType === 'ConeBufferGeometry' ||
                    geometryType === 'SphereBufferGeometry') {
                    isConeOrSphere = true;
                }
                // Only check bounding box for VERY small objects that are clearly placeholders
                // Make it very strict - only tiny objects
                try {
                    const box = new THREE.Box3().setFromObject(child);
                    const size = box.getSize(new THREE.Vector3());
                    const maxSize = Math.max(size.x, size.y, size.z);
                    // Only remove if it's VERY small (less than 0.1 units) AND roughly round
                    // This catches tiny placeholder objects, not actual clothing
                    if (maxSize < 0.1) {
                        const isRoughlyRound = Math.abs(size.x - size.z) < 0.05 && size.y < 0.1;
                        if (isRoughlyRound) {
                            isConeOrSphere = true;
                        }
                    }
                } catch (e) {
                    // Ignore errors in shape detection
                }
            }
            
            // Head/face part keywords to remove
            const isHeadPart = (
                name.includes('teeth') ||
                name.includes('tooth') ||
                name.includes('tongue') ||
                name.includes('head') ||
                name.includes('mouth') ||
                name.includes('jaw') ||
                (name.includes('eye') && !name.includes('ear') && !name.includes('bunny')) ||
                name.includes('nose') ||
                name.includes('whisker') ||
                name.includes('snout') ||
                name.includes('muzzle')
            );
            
            // Check if this is an otter body mesh by comparing geometry
            let isOtterBody = false;
            
            // First check: exact name match
            if (otterBodyMeshes.has(child.name)) {
                // Check if geometry matches (same vertex count and similar size)
                if (child.geometry && child.geometry.attributes && otterBodyGeometries.has(child.name)) {
                    try {
                        const otterGeo = otterBodyGeometries.get(child.name);
                        const shirtBox = new THREE.Box3().setFromObject(child);
                        const shirtSize = shirtBox.getSize(new THREE.Vector3());
                        const shirtVertexCount = child.geometry.attributes.position?.count || 0;
                    
                    // If vertex count and size are very similar, it's the otter body
                    const vertexMatch = Math.abs(shirtVertexCount - otterGeo.vertexCount) < 10;
                    const sizeMatch = Math.abs(shirtSize.x - otterGeo.size.x) < 0.01 &&
                                     Math.abs(shirtSize.y - otterGeo.size.y) < 0.01 &&
                                     Math.abs(shirtSize.z - otterGeo.size.z) < 0.01;
                    
                        if (vertexMatch && sizeMatch) {
                            isOtterBody = true;
                        }
                    } catch (e) {
                        console.warn(`Error comparing geometry for ${child.name}:`, e);
                        // If name matches but geometry comparison fails, assume it's body
                        isOtterBody = true;
                    }
                } else {
                    // If name matches but no geometry to compare, assume it's body
                    isOtterBody = true;
                }
            }
            
            // Check if mesh is very large (likely body) - body meshes are typically much larger than clothing
            let isLargeBodyMesh = false;
            if (child.geometry && child.geometry.attributes) {
                try {
                    const box = new THREE.Box3().setFromObject(child);
                    const size = box.getSize(new THREE.Vector3());
                // Body meshes are typically large (torso/body sized)
                // Shirt meshes are usually smaller and positioned around the body
                const isLarge = size.y > 0.6 || (size.x > 0.5 && size.z > 0.5 && size.y > 0.4);
                const isVeryLarge = size.y > 1.0 || (size.x > 0.8 && size.z > 0.8);
                
                // If it's very large and positioned at body center, it's likely the body
                const center = box.getCenter(new THREE.Vector3());
                const isAtBodyCenter = Math.abs(center.y) < 0.5 && Math.abs(center.x) < 0.3 && Math.abs(center.z) < 0.3;
                
                    if (isVeryLarge || (isLarge && isAtBodyCenter)) {
                        isLargeBodyMesh = true;
                    }
                } catch (e) {
                    console.warn(`Error checking mesh size for ${child.name}:`, e);
                }
            }
            
            // Remove placeholders, cones/spheres, head parts, otter body matches, and large body meshes
            // BUT: Keep curves/lines (text content) - they need special handling for rotation/positioning
            const shouldRemove = !isCurveOrLine && (isPlaceholder || isConeOrSphere || isHeadPart || isOtterBody || isLargeBodyMesh);
            
            if (shouldRemove) {
                meshesToRemove.push(child);
                // Log why it was removed for debugging
                const reasons = [];
                if (isPlaceholder) reasons.push('placeholder');
                if (isConeOrSphere) reasons.push('cone/sphere');
                if (isHeadPart) reasons.push('head part');
                if (isOtterBody) reasons.push('otter body');
                if (isLargeBodyMesh) reasons.push('large body mesh');
                console.log(`Removing mesh "${originalName}": ${reasons.join(', ')}`);
            } else {
                // Keep everything else - this should be a shirt mesh
                meshesToKeep.push(child);
            }
        });
        
        // Clone and add shirt meshes and curves/lines (text content)
        // Convert SkinnedMesh to regular Mesh to prevent deformation and errors
        meshesToKeep.forEach(mesh => {
            try {
                // Check if this is a curve/line (text content)
                const isCurveOrLine = (
                    mesh instanceof THREE.Line ||
                    mesh instanceof THREE.LineSegments ||
                    mesh.type === 'Line' ||
                    mesh.type === 'LineSegments'
                );
                
                if (isCurveOrLine) {
                    // Handle curves/lines (text content) - they were parented to bones
                    // Need to convert from bone-relative space to world space, then to model space
                    const clonedCurve = mesh.clone();
                    
                    // Get world transform before removing from bone parent
                    const worldPos = new THREE.Vector3();
                    const worldQuat = new THREE.Quaternion();
                    const worldScale = new THREE.Vector3();
                    
                    mesh.getWorldPosition(worldPos);
                    mesh.getWorldQuaternion(worldQuat);
                    mesh.getWorldScale(worldScale);
                    
                    // Apply the same scale as shirts (0.5x fur scale)
                    const furScale = this.model ? this.model.scale.x : 1.0;
                    const targetScale = furScale * 0.5;
                    
                    // Set world scale, then convert to local space relative to model
                    clonedCurve.scale.copy(worldScale);
                    clonedCurve.scale.multiplyScalar(targetScale / furScale);
                    
                    // Convert world position to local space relative to model root
                    // Apply Y offset (-0.02) in local space
                    const localPos = worldPos.clone();
                    if (this.model) {
                        this.model.worldToLocal(localPos);
                    }
                    localPos.y -= 0.02;
                    clonedCurve.position.copy(localPos);
                    
                    // Convert world rotation to local space, then apply X axis rotation
                    // Text curves need rotation on X axis to align properly
                    const localQuat = worldQuat.clone();
                    if (this.model) {
                        const modelWorldQuat = new THREE.Quaternion();
                        this.model.getWorldQuaternion(modelWorldQuat);
                        localQuat.premultiply(modelWorldQuat.invert());
                    }
                    
                    // Apply X axis rotation (180 degrees) to fix text orientation
                    const xRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
                    localQuat.multiply(xRotation);
                    
                    clonedCurve.quaternion.copy(localQuat);
                    clonedCurve.rotation.setFromQuaternion(localQuat);
                    
                    filteredShirt.add(clonedCurve);
                    console.log(`Added curve/line "${mesh.name}" with world-to-local transform, X rotation applied`);
                } else {
                    // Handle regular meshes
                    // Clone the geometry first
                    let newGeometry = null;
                    if (mesh.geometry) {
                        newGeometry = mesh.geometry.clone();
                        
                        // Remove skinning attributes if they exist
                        if (newGeometry.attributes.skinIndex) {
                            delete newGeometry.attributes.skinIndex;
                        }
                        if (newGeometry.attributes.skinWeight) {
                            delete newGeometry.attributes.skinWeight;
                        }
                    }
                    
                    // Create a regular Mesh (not SkinnedMesh) to avoid bone transformation errors
                    const clonedMesh = new THREE.Mesh(newGeometry || mesh.geometry, mesh.material);
                    // Preserve all transforms from the original mesh
                    clonedMesh.position.copy(mesh.position);
                    clonedMesh.rotation.copy(mesh.rotation);
                    clonedMesh.scale.copy(mesh.scale);
                    clonedMesh.quaternion.copy(mesh.quaternion);
                    clonedMesh.matrix.copy(mesh.matrix);
                    clonedMesh.matrixWorld.copy(mesh.matrixWorld);
                    
                    // Copy all properties from original mesh
                    clonedMesh.name = mesh.name;
                    clonedMesh.position.copy(mesh.position);
                    clonedMesh.rotation.copy(mesh.rotation);
                    clonedMesh.scale.copy(mesh.scale);
                    clonedMesh.quaternion.copy(mesh.quaternion);
                    clonedMesh.matrix.copy(mesh.matrix);
                    clonedMesh.matrixWorld.copy(mesh.matrixWorld);
                    
                    // Explicitly ensure no skeleton references
                    clonedMesh.skeleton = null;
                    clonedMesh.bindMatrix = null;
                    
                    // Copy userData if it exists
                    if (mesh.userData) {
                        clonedMesh.userData = JSON.parse(JSON.stringify(mesh.userData));
                    }
                    
                    filteredShirt.add(clonedMesh);
                }
            } catch (error) {
                console.error(`Error processing object ${mesh.name}:`, error);
                // If processing fails, try to add a simple clone
                try {
                    const simpleClone = mesh.clone();
                    if (simpleClone.skeleton) {
                        simpleClone.skeleton = null;
                    }
                    if (simpleClone.bindMatrix) {
                        simpleClone.bindMatrix = null;
                    }
                    filteredShirt.add(simpleClone);
                } catch (e) {
                    console.error(`Failed to add object ${mesh.name}:`, e);
                }
            }
        });
        
        console.log(`Filtered shirt: kept ${meshesToKeep.length} meshes, removed ${meshesToRemove.length} meshes`);
        if (meshesToRemove.length > 0) {
            console.log('Removed meshes:', meshesToRemove.map(m => m.name));
        }
        
        return filteredShirt;
    }

    /* -----------------------------------------------------
       UNIVERSAL HELPERS (ALL-IN-ONE)
    ----------------------------------------------------- */

    attachWearableToBone(group, bone) {
        if (!group || !bone) return;

        group.updateMatrixWorld(true);
        bone.updateMatrixWorld(true);

        const wPos = new THREE.Vector3();
        const wQuat = new THREE.Quaternion();
        const wScale = new THREE.Vector3();
        group.getWorldPosition(wPos);
        group.getWorldQuaternion(wQuat);
        group.getWorldScale(wScale);

        const localPos = wPos.clone();
        bone.worldToLocal(localPos);

        const boneQuat = new THREE.Quaternion();
        bone.getWorldQuaternion(boneQuat);
        const localQuat = wQuat.clone().premultiply(boneQuat.invert());

        group.position.copy(localPos);
        group.quaternion.copy(localQuat);
        group.scale.copy(wScale);

        bone.add(group);
    }

    removePlaceholdersFromScene(scene) {
        scene.traverse((child) => {
            const n = child.name?.toLowerCase();
            if (n && n.includes("placeholder")) {
                child.parent?.remove(child);
            }
        });
    }

    extractWearableMeshes(scene) {
        const meshes = [];
        scene.traverse((child) => {
            if (!child.isMesh) return;

            const n = child.name.toLowerCase();
            const isBodyPart =
                n.includes("body") ||
                n.includes("eye") ||
                n.includes("teeth") ||
                n.includes("tongue") ||
                n.includes("nose") ||
                n.includes("whisker");

            if (!isBodyPart) meshes.push(child);
        });
        return meshes;
    }

    fixEyeMaterialRenderOrder(mesh) {
        // Fix render order for eye materials: plastic should render before polarized
        if (!mesh.material) return;
        
        // Handle both single materials and arrays
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        
        materials.forEach((material, index) => {
            if (!material) return;
            
            // Get material name (if available) or check material properties
            const materialName = material.name?.toLowerCase() || '';
            const meshName = mesh.name?.toLowerCase() || '';
            
            // Check if this is a polarized material (transparent, reflective, or named as polarized)
            const isPolarized = material.transparent || 
                               materialName.includes('polarized') || 
                               materialName.includes('polar') ||
                               meshName.includes('polarized') ||
                               meshName.includes('polar') ||
                               (material.metalness > 0.5 && material.roughness < 0.3); // High metalness + low roughness = reflective
            
            // Check if this is a plastic material
            const isPlastic = materialName.includes('plastic') || 
                             meshName.includes('plastic') ||
                             (!material.transparent && material.roughness > 0.3 && material.metalness < 0.5);
            
            // Set render order: plastic should render in front of polarized
            // Lower renderOrder = renders first (behind), higher = renders later (in front)
            if (isPlastic) {
                mesh.renderOrder = 1; // Render after polarized (in front)
                material.depthWrite = true;
                material.depthTest = true;
            } else if (isPolarized) {
                mesh.renderOrder = 0; // Render first (behind plastic)
                // For transparent/reflective materials, ensure proper depth handling
                if (material.transparent) {
                    material.depthWrite = false; // Don't write to depth buffer for transparent
                    material.depthTest = true; // But still test depth
                } else {
                    material.depthWrite = true;
                    material.depthTest = true;
                }
            } else {
                // Default: ensure proper depth settings
                mesh.renderOrder = -1;
                material.depthWrite = true;
                material.depthTest = true;
            }
            
            // Ensure material needs update if we changed properties
            material.needsUpdate = true;
        });
    }

    removeHat() {
        if (this.currentHat) {
            // Remove hat from wherever it's parented (head bone, otter model, or scene)
            if (this.currentHat.parent) {
                this.currentHat.parent.remove(this.currentHat);
            } else {
                this.scene.remove(this.currentHat);
            }
            this.currentHat = null;
            document.getElementById('remove-hat-btn').disabled = true;
            this.requestRender(); // Scene changed, request render
            
            // Update object selection dropdown if edit mode is active
            if (this.editMode) {
                this.updateObjectSelectionDropdown();
            }
        }
    }

    /* -----------------------------------------------------
       OPTIMIZED SHIRT LOADER  (unchanged behavior)
    ----------------------------------------------------- */

    async loadShirt(shirtName) {
        if (!this.model) {
            alert("Please load an otter fur first!");
            return;
        }

        if (this.currentShirt?.parent) this.currentShirt.parent.remove(this.currentShirt);
        this.currentShirt = null;

        const filePath = this.encodePath("WEARABLES/Shirts", `${shirtName}.glb`);
        console.log(`Loading shirt from path: ${filePath}`);
        const loader = new GLTFLoader();
        
        try {
            const gltf = await loader.loadAsync(filePath);

            const shirtGroup = new THREE.Group();
            shirtGroup.userData.shirtName = shirtName;

            this.removePlaceholdersFromScene(gltf.scene);

            const meshes = this.extractWearableMeshes(gltf.scene);
            
            // CRITICAL FIX: Get WORLD transforms of meshes before extracting
            // This accounts for any parent transforms in the GLB hierarchy
            gltf.scene.updateMatrixWorld(true);
            
            meshes.forEach(mesh => {
                // Get world transform before removing from GLB scene
                const worldPos = new THREE.Vector3();
                const worldQuat = new THREE.Quaternion();
                const worldScale = new THREE.Vector3();
                mesh.getWorldPosition(worldPos);
                mesh.getWorldQuaternion(worldQuat);
                mesh.getWorldScale(worldScale);
                
                // Reset mesh to origin in shirtGroup's local space
                mesh.position.set(0, 0, 0);
                mesh.rotation.set(0, 0, 0);
                mesh.scale.set(1, 1, 1);
                mesh.quaternion.set(0, 0, 0, 1);
                
                // Add to shirtGroup first (so we can convert world to local)
                shirtGroup.add(mesh);
                
                // Convert world transform to shirtGroup's local space
                shirtGroup.updateMatrixWorld(true);
                const localPos = worldPos.clone();
                const localQuat = worldQuat.clone();
                const localScale = worldScale.clone();
                
                shirtGroup.worldToLocal(localPos);
                
                // Apply the converted local transform
                mesh.position.copy(localPos);
                mesh.quaternion.copy(localQuat);
                mesh.scale.copy(localScale);
                mesh.rotation.setFromQuaternion(localQuat);
            });

            // Attach to ROOT because your shirts align correctly this way
            this.model.add(shirtGroup);

            this.currentShirt = shirtGroup;
            document.getElementById("remove-shirt-btn").disabled = false;
            this.requestRender(); // Scene changed, request render
            
            // Update object selection dropdown if edit mode is active
            if (this.editMode) {
                this.updateObjectSelectionDropdown();
            }
        } catch (error) {
            console.error('Error loading shirt:', error);
            console.error('Attempted path:', filePath);
            console.error('Full error details:', error);
            alert(`Error loading ${shirtName}.glb:\n\nPath: ${filePath}\n\nError: ${error.message}\n\nMake sure:\n1. The file exists in the WEARABLES/Shirts folder\n2. You're running the app from a web server (not file://)\n3. Check the browser console for more details`);
        }
    }

    removeShirt() {
        if (this.currentShirt) {
            // Remove shirt from wherever it's parented (body bone, otter model, or scene)
            if (this.currentShirt.parent) {
                this.currentShirt.parent.remove(this.currentShirt);
            } else {
                this.scene.remove(this.currentShirt);
            }
            this.currentShirt = null;
            document.getElementById('remove-shirt-btn').disabled = true;
            this.requestRender(); // Scene changed, request render
            
            // Update object selection dropdown if edit mode is active
            if (this.editMode) {
                this.updateObjectSelectionDropdown();
            }
        }
    }

    /* -----------------------------------------------------
       EYES LOADER
    ----------------------------------------------------- */

    async loadEyes(eyeName) {
        if (!this.model) {
            alert("Please load an otter fur first!");
            return;
        }

        if (this.currentEyes?.parent) this.currentEyes.parent.remove(this.currentEyes);
        this.currentEyes = null;

        const filePath = this.encodePath("WEARABLES/Eyes", `${eyeName}.glb`);
        console.log(`Loading eyes from path: ${filePath}`);
        const loader = new GLTFLoader();
        
        try {
            const gltf = await loader.loadAsync(filePath);

            const eyesGroup = new THREE.Group();
            eyesGroup.userData.eyeName = eyeName;

            this.removePlaceholdersFromScene(gltf.scene);

            const meshes = this.extractWearableMeshes(gltf.scene);
            
            // CRITICAL FIX: Get WORLD transforms of meshes before extracting
            // This accounts for any parent transforms in the GLB hierarchy
            gltf.scene.updateMatrixWorld(true);
            
            meshes.forEach(mesh => {
                // Fix material render order for eyes (plastic should render before polarized)
                this.fixEyeMaterialRenderOrder(mesh);
                
                // Get world transform before removing from GLB scene
                const worldPos = new THREE.Vector3();
                const worldQuat = new THREE.Quaternion();
                const worldScale = new THREE.Vector3();
                mesh.getWorldPosition(worldPos);
                mesh.getWorldQuaternion(worldQuat);
                mesh.getWorldScale(worldScale);
                
                // Reset mesh to origin in eyesGroup's local space
                mesh.position.set(0, 0, 0);
                mesh.rotation.set(0, 0, 0);
                mesh.scale.set(1, 1, 1);
                mesh.quaternion.set(0, 0, 0, 1);
                
                // Add to eyesGroup first (so we can convert world to local)
                eyesGroup.add(mesh);
                
                // Convert world transform to eyesGroup's local space
                eyesGroup.updateMatrixWorld(true);
                const localPos = worldPos.clone();
                const localQuat = worldQuat.clone();
                const localScale = worldScale.clone();
                
                eyesGroup.worldToLocal(localPos);
                
                // Apply the converted local transform
                mesh.position.copy(localPos);
                mesh.quaternion.copy(localQuat);
                mesh.scale.copy(localScale);
                mesh.rotation.setFromQuaternion(localQuat);
            });

            const headBone = this.findHeadBone(this.model);

            if (!headBone) {
                console.warn("No head bone found – attaching eyes to root instead.");
                this.model.add(eyesGroup);
                this.currentEyes = eyesGroup;
                document.getElementById("remove-eyes-btn").disabled = false;
                return;
            }

            // Attach eyes to head bone (similar to hats)
            // Use the same positioning as hats for consistency
            eyesGroup.position.set(-0.607745, 0.000000, 0.005627);
            eyesGroup.scale.set(1.000000, 1.000000, 1.000000);
            eyesGroup.rotation.set(0.000000, -0.000000, -1.570796);
            eyesGroup.quaternion.set(0.000000, -0.000000, -0.707107, 0.707107);
            
            // Parent directly to bone
            headBone.add(eyesGroup);

            this.currentEyes = eyesGroup;
            document.getElementById("remove-eyes-btn").disabled = false;
            this.requestRender(); // Scene changed, request render
            
            // Update object selection dropdown if edit mode is active
            if (this.editMode) {
                this.updateObjectSelectionDropdown();
            }
        } catch (error) {
            console.error('Error loading eyes:', error);
            console.error('Attempted path:', filePath);
            console.error('Full error details:', error);
            alert(`Error loading ${eyeName}.glb:\n\nPath: ${filePath}\n\nError: ${error.message}\n\nMake sure:\n1. The file exists in the WEARABLES/Eyes folder\n2. You're running the app from a web server (not file://)\n3. Check the browser console for more details`);
        }
    }

    removeEyes() {
        if (this.currentEyes) {
            // Remove eyes from wherever it's parented (head bone, otter model, or scene)
            if (this.currentEyes.parent) {
                this.currentEyes.parent.remove(this.currentEyes);
            } else {
                this.scene.remove(this.currentEyes);
            }
            this.currentEyes = null;
            document.getElementById('remove-eyes-btn').disabled = true;
            this.requestRender(); // Scene changed, request render
            
            // Update object selection dropdown if edit mode is active
            if (this.editMode) {
                this.updateObjectSelectionDropdown();
            }
        }
    }

    randomize() {
        // Prevent overlapping randomize calls
        if (this.isRandomizing) {
            console.log('Randomize already in progress, skipping...');
            return;
        }
        
        this.isRandomizing = true;
        
        // Show loading screen
        const loading = document.getElementById('loading');
        const placeholder = document.getElementById('placeholder');
        const loadingStartTime = Date.now();
        const minLoadingTime = 3000; // 3 seconds minimum
        
        if (loading) {
            loading.style.display = 'block';
        }
        if (placeholder) {
            placeholder.style.display = 'none';
        }
        
        // Remove all existing wearables first to prevent stacking
        this.removeHat();
        this.removeShirt();
        this.removeEyes();
        
        // Randomly select a fur
        const randomFur = this.furOptions[Math.floor(Math.random() * this.furOptions.length)];
        
        // Load the random fur (don't preserve wearables when randomizing, and don't manage loading screen)
        this.loadFurFile(randomFur, false, false).then(() => {
            // After fur loads, randomly select wearables
            const shouldHaveHat = Math.random() > 0.3; // 70% chance of having a hat
            const shouldHaveShirt = Math.random() > 0.2; // 80% chance of having a shirt
            const randomEyes = this.eyeOptions[Math.floor(Math.random() * this.eyeOptions.length)];
            
            // Create array of promises for all loading operations
            const loadPromises = [];
            
            // Load hat if needed
            if (shouldHaveHat) {
                const randomHat = this.hatOptions[Math.floor(Math.random() * this.hatOptions.length)];
                loadPromises.push(
                    new Promise(resolve => {
                        setTimeout(() => {
                            this.loadHat(randomHat).then(resolve).catch(resolve);
                        }, 100);
                    })
                );
            }
            
            // Load shirt if needed
            if (shouldHaveShirt) {
                const randomShirt = this.shirtOptions[Math.floor(Math.random() * this.shirtOptions.length)];
                loadPromises.push(
                    new Promise(resolve => {
                        setTimeout(() => {
                            this.loadShirt(randomShirt).then(resolve).catch(resolve);
                        }, 150);
                    })
                );
            }
            
            // Always load eyes (100% chance - eyes must show every generation)
            loadPromises.push(
                new Promise(resolve => {
                    setTimeout(() => {
                        this.loadEyes(randomEyes).then(resolve).catch(resolve);
                    }, 200);
                })
            );
            
            // Wait for all wearables to load (or resolve immediately if no promises)
            if (loadPromises.length === 0) {
                // If no promises (shouldn't happen, but handle it), just wait for minimum time
                const elapsedTime = Date.now() - loadingStartTime;
                const remainingTime = Math.max(0, minLoadingTime - elapsedTime);
                setTimeout(() => {
                    if (loading) {
                        loading.style.display = 'none';
                    }
                    this.isRandomizing = false;
                }, remainingTime);
            } else {
                Promise.all(loadPromises).then(() => {
                    // Ensure loading screen shows for at least 3 seconds
                    const elapsedTime = Date.now() - loadingStartTime;
                    const remainingTime = Math.max(0, minLoadingTime - elapsedTime);
                    
                    console.log(`All wearables loaded. Elapsed: ${elapsedTime}ms, Remaining: ${remainingTime}ms`);
                    
                    setTimeout(() => {
                        // Hide loading screen after all wearables are loaded AND minimum time has passed
                        console.log('Hiding loading screen');
                        if (loading) {
                            loading.style.display = 'none';
                        }
                        this.isRandomizing = false; // Reset flag after loading completes
                    }, remainingTime);
                }).catch((error) => {
                    console.error('Error loading wearables:', error);
                    // Still hide loading screen after minimum time even on error
                    const elapsedTime = Date.now() - loadingStartTime;
                    const remainingTime = Math.max(0, minLoadingTime - elapsedTime);
                    setTimeout(() => {
                        if (loading) {
                            loading.style.display = 'none';
                        }
                        this.isRandomizing = false;
                    }, remainingTime);
                });
            }
        }).catch((error) => {
            console.error('Error during randomize:', error);
            // Hide loading screen on error after minimum time
            const elapsedTime = Date.now() - loadingStartTime;
            const remainingTime = Math.max(0, minLoadingTime - elapsedTime);
            setTimeout(() => {
                if (loading) {
                    loading.style.display = 'none';
                }
                this.isRandomizing = false; // Reset flag on error
            }, remainingTime);
        });
    }

    /* -----------------------------------------------------
       NFT METADATA SEARCH
    ----------------------------------------------------- */

    async loadNFTTraits(nftNumber) {
        const errorDiv = document.getElementById('nft-search-error');
        errorDiv.style.display = 'none';
        errorDiv.textContent = '';
        
        // Show loading screen
        const loading = document.getElementById('loading');
        const placeholder = document.getElementById('placeholder');
        const loadingStartTime = Date.now();
        const minLoadingTime = 3000; // 3 seconds minimum
        
        if (loading) {
            loading.style.display = 'block';
        }
        if (placeholder) {
            placeholder.style.display = 'none';
        }
        
        try {
            // Load the metadata JSON file
            const metadataPath = `metadata/${nftNumber}.json`;
            const response = await fetch(metadataPath);
            
            if (!response.ok) {
                throw new Error(`NFT #${nftNumber} not found`);
            }
            
            const metadata = await response.json();
            
            // Extract traits from attributes array
            const traits = {};
            if (metadata.attributes && Array.isArray(metadata.attributes)) {
                metadata.attributes.forEach(attr => {
                    if (attr.trait_type && attr.value) {
                        // Normalize trait type names
                        const traitType = attr.trait_type.toLowerCase();
                        const traitValue = attr.value.trim();
                        
                        // Skip "None" or empty values
                        if (!traitValue || traitValue.toLowerCase() === 'none' || traitValue === '') {
                            return;
                        }
                        
                        if (traitType === 'fur') {
                            traits.fur = traitValue;
                        } else if (traitType === 'shirt') {
                            traits.shirt = traitValue;
                        } else if (traitType === 'eyes') {
                            traits.eyes = traitValue;
                        } else if (traitType === 'hats' || traitType === 'hat') {
                            traits.hat = traitValue;
                        }
                    }
                });
            }
            
            // Load the traits onto the avatar
            if (traits.fur) {
                // Validate that fur exists in our options
                if (!this.furOptions.includes(traits.fur)) {
                    throw new Error(`Fur "${traits.fur}" not found in available options`);
                }
                
                // Load fur first (required base) - don't let it manage loading screen
                await this.loadFurFile(traits.fur, false, false);
                
                // Create array of promises for all loading operations
                const loadPromises = [];
                
                // Load hat if present
                if (traits.hat) {
                    if (this.hatOptions.includes(traits.hat)) {
                        loadPromises.push(
                            new Promise(resolve => {
                                setTimeout(() => {
                                    this.loadHat(traits.hat).then(resolve).catch(err => {
                                        console.warn(`Could not load hat: ${traits.hat}`, err);
                                        resolve(); // Resolve anyway to not block other loads
                                    });
                                }, 200);
                            })
                        );
                    } else {
                        console.warn(`Hat "${traits.hat}" not found in available options`);
                    }
                }
                
                // Load shirt if present
                if (traits.shirt) {
                    if (this.shirtOptions.includes(traits.shirt)) {
                        loadPromises.push(
                            new Promise(resolve => {
                                setTimeout(() => {
                                    this.loadShirt(traits.shirt).then(resolve).catch(err => {
                                        console.warn(`Could not load shirt: ${traits.shirt}`, err);
                                        resolve(); // Resolve anyway to not block other loads
                                    });
                                }, 300);
                            })
                        );
                    } else {
                        console.warn(`Shirt "${traits.shirt}" not found in available options`);
                    }
                }
                
                // Load eyes if present
                if (traits.eyes) {
                    if (this.eyeOptions.includes(traits.eyes)) {
                        loadPromises.push(
                            new Promise(resolve => {
                                setTimeout(() => {
                                    this.loadEyes(traits.eyes).then(resolve).catch(err => {
                                        console.warn(`Could not load eyes: ${traits.eyes}`, err);
                                        resolve(); // Resolve anyway to not block other loads
                                    });
                                }, 400);
                            })
                        );
                    } else {
                        console.warn(`Eyes "${traits.eyes}" not found in available options`);
                    }
                }
                
                // Wait for all wearables to load (or resolve immediately if no promises)
                if (loadPromises.length === 0) {
                    // If no promises (shouldn't happen, but handle it), just wait for minimum time
                    const elapsedTime = Date.now() - loadingStartTime;
                    const remainingTime = Math.max(0, minLoadingTime - elapsedTime);
                    setTimeout(() => {
                        if (loading) {
                            loading.style.display = 'none';
                        }
                    }, remainingTime);
                } else {
                    Promise.all(loadPromises).then(() => {
                        // Ensure loading screen shows for at least 3 seconds
                        const elapsedTime = Date.now() - loadingStartTime;
                        const remainingTime = Math.max(0, minLoadingTime - elapsedTime);
                        
                        console.log(`NFT: All wearables loaded. Elapsed: ${elapsedTime}ms, Remaining: ${remainingTime}ms`);
                        
                        setTimeout(() => {
                            // Hide loading screen after all wearables are loaded AND minimum time has passed
                            console.log('NFT: Hiding loading screen');
                            if (loading) {
                                loading.style.display = 'none';
                            }
                        }, remainingTime);
                    }).catch((error) => {
                        console.error('Error loading wearables:', error);
                        // Still hide loading screen after minimum time even on error
                        const elapsedTime = Date.now() - loadingStartTime;
                        const remainingTime = Math.max(0, minLoadingTime - elapsedTime);
                        setTimeout(() => {
                            if (loading) {
                                loading.style.display = 'none';
                            }
                        }, remainingTime);
                    });
                }
            } else {
                throw new Error('No Fur trait found in metadata');
            }
            
            // Show success message
            errorDiv.style.display = 'block';
            errorDiv.style.color = 'var(--success)';
            const loadedTraits = [];
            if (traits.fur) loadedTraits.push(`Fur: ${traits.fur}`);
            if (traits.hat) loadedTraits.push(`Hat: ${traits.hat}`);
            if (traits.shirt) loadedTraits.push(`Shirt: ${traits.shirt}`);
            if (traits.eyes) loadedTraits.push(`Eyes: ${traits.eyes}`);
            errorDiv.textContent = `✓ Loaded NFT #${nftNumber}: ${loadedTraits.join(', ')}`;
            
            // Clear input after successful load
            const input = document.getElementById('nft-search-input');
            if (input) input.value = '';
            
            // Clear success message after 5 seconds
            setTimeout(() => {
                errorDiv.style.display = 'none';
            }, 5000);
            
        } catch (error) {
            console.error('Error loading NFT traits:', error);
            // Hide loading screen on error after minimum time
            const elapsedTime = Date.now() - loadingStartTime;
            const remainingTime = Math.max(0, minLoadingTime - elapsedTime);
            setTimeout(() => {
                if (loading) {
                    loading.style.display = 'none';
                }
            }, remainingTime);
            this.showNFTError(`Error loading NFT #${nftNumber}: ${error.message}`);
        }
    }
    
    showNFTError(message) {
        const errorDiv = document.getElementById('nft-search-error');
        errorDiv.style.display = 'block';
        errorDiv.style.color = 'var(--warning)';
        errorDiv.textContent = message;
    }

    onWindowResize() {
        const container = document.getElementById('canvas-container');
        this.camera.aspect = container.clientWidth / container.clientHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        
        // Mobile-specific camera adjustments
        if (window.innerWidth <= 768) {
            this.camera.position.set(0, -0.6, 4.5);
            if (this.controls) {
                this.controls.target.set(0, -0.4, 0);
            }
        } else {
            // Desktop: use higher position, moved back
            this.camera.position.set(0, 0.2, 3.5);
            if (this.controls) {
                this.controls.target.set(0, -0.4, 0);
            }
        }
    }

    animate() {
        this.animationFrameId = requestAnimationFrame(() => this.animate());
        
        // Performance: Always update controls (they handle damping internally)
        if (this.controls) {
            this.controls.update();
        }
        
        // Auto-rotate model if enabled
        if (this.autoRotate) {
            if (this.controls) {
                this.controls.autoRotate = true;
                this.controls.autoRotateSpeed = 2.0;
            } else if (this.model) {
                this.model.rotation.y += this.rotationSpeed;
            }
        } else {
            if (this.controls) {
                this.controls.autoRotate = false;
            }
        }
        
        // Render: OrbitControls with damping needs continuous rendering when active
        // Skip rendering only if no model is loaded and nothing is happening
        if (this.renderer && this.scene && this.camera) {
            // Render if:
            // - Scene was explicitly marked as needing render
            // - Model is loaded (user expects to see it)
            // - Controls are enabled (user might be interacting)
            // - Auto-rotate is on
            if (this.needsRender || this.model || (this.controls && this.controls.enabled) || this.autoRotate) {
            this.renderer.render(this.scene, this.camera);
                this.needsRender = false;
            }
        }
        }

    // Mark that a render is needed (call this when scene changes)
    requestRender() {
        this.needsRender = true;
    }
    
    setEditMode(enabled) {
        this.editMode = enabled;
        const objectSelectGroup = document.getElementById('object-select-group');
        const savePositionsGroup = document.getElementById('save-positions-group');
        
        if (enabled) {
            if (objectSelectGroup) {
                objectSelectGroup.style.display = 'block';
            }
            if (savePositionsGroup) {
                savePositionsGroup.style.display = 'block';
            }
            this.updateObjectSelectionDropdown();
            console.log('Edit mode enabled - Click objects in 3D view or use dropdown to select');
            console.log('Click any mesh/curve in the 3D view to select it for editing');
        } else {
            if (objectSelectGroup) {
                objectSelectGroup.style.display = 'none';
            }
            if (savePositionsGroup) {
                savePositionsGroup.style.display = 'none';
            }
            // Save state before disabling edit mode
            if (this.selectedObject) {
                // Ensure transforms are committed before saving
                this.selectedObject.updateMatrixWorld();
                this.saveStateToHistory('Transform object');
            }
            // Detach transform controls
            if (this.transformControls) {
                this.transformControls.detach();
                this.selectedObject = null;
            }
            console.log('Edit mode disabled');
        }
    }
    
    setupObjectSelection() {
        const objectSelect = document.getElementById('object-select');
        if (objectSelect) {
            objectSelect.addEventListener('change', (e) => {
                const selected = e.target.value;
                if (selected === '' || selected === '-- Select --') {
                    // Deselect and save current state
                    if (this.selectedObject) {
                        this.saveStateToHistory('Transform object');
                    }
                    if (this.transformControls) {
                        this.transformControls.detach();
                    }
                    this.selectedObject = null;
                    console.log('Deselected object - changes saved');
                } else {
                    this.selectObjectForEditing(selected);
                }
            });
        }
        
        // Keyboard shortcuts for transform modes and delete/undo
        window.addEventListener('keydown', (e) => {
            // Only handle if not typing in an input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            
            // Undo/Redo (Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y)
            if (e.ctrlKey || e.metaKey) {
                if (e.key === 'z' || e.key === 'Z') {
                    if (e.shiftKey) {
                        this.redo();
                    } else {
                        this.undo();
                    }
                    e.preventDefault();
                    return;
                } else if (e.key === 'y' || e.key === 'Y') {
                    this.redo();
                    e.preventDefault();
                    return;
                }
            }
            
            if (!this.editMode || !this.transformControls) return;
            
            switch(e.key.toLowerCase()) {
                case 'g':
                    if (this.selectedObject) {
                        this.transformControls.setMode('translate');
                        e.preventDefault();
                    }
                    break;
                case 'r':
                    if (this.selectedObject) {
                        this.transformControls.setMode('rotate');
                        e.preventDefault();
                    }
                    break;
                case 's':
                    if (this.selectedObject) {
                        this.transformControls.setMode('scale');
                        e.preventDefault();
                    }
                    break;
                case 'delete':
                case 'backspace':
                    if (this.selectedObject) {
                        this.deleteSelectedObject();
                        e.preventDefault();
                    }
                    break;
            }
        });
    }
    
    selectObjectForEditing(objectType) {
        if (!this.editMode || !this.transformControls) return;
        
        // Save state of previous object before switching
        if (this.selectedObject) {
            // Ensure transforms are committed before saving
            this.selectedObject.updateMatrixWorld();
            this.saveStateToHistory('Transform object');
        }
        
        // Detach from previous object
        this.transformControls.detach();
        this.selectedObject = null;
        
        let targetObject = null;
        
        if (objectType === 'hat' && this.currentHat) {
            targetObject = this.currentHat;
            console.log('Selected hat group for editing - drag the controls to move/rotate/scale');
        } else if (objectType === 'shirt' && this.currentShirt) {
            targetObject = this.currentShirt;
            console.log('Selected shirt group for editing - drag the controls to move/rotate/scale');
        } else if (objectType === 'eyes' && this.currentEyes) {
            targetObject = this.currentEyes;
            console.log('Selected eyes group for editing - drag the controls to move/rotate/scale');
        } else if (objectType && objectType.startsWith('hat_')) {
            // Individual hat mesh/curve
            const index = parseInt(objectType.replace('hat_', ''));
            if (this.currentHat && this.currentHat.children[index]) {
                targetObject = this.currentHat.children[index];
                console.log(`Selected hat mesh/curve "${targetObject.name}" for editing`);
            }
        } else if (objectType && objectType.startsWith('shirt_')) {
            // Individual shirt mesh/curve
            const index = parseInt(objectType.replace('shirt_', ''));
            if (this.currentShirt && this.currentShirt.children[index]) {
                targetObject = this.currentShirt.children[index];
                console.log(`Selected shirt mesh/curve "${targetObject.name}" for editing`);
            }
        } else if (objectType && objectType.startsWith('eyes_')) {
            // Individual eyes mesh/curve
            const index = parseInt(objectType.replace('eyes_', ''));
            if (this.currentEyes && this.currentEyes.children[index]) {
                targetObject = this.currentEyes.children[index];
                console.log(`Selected eyes mesh/curve "${targetObject.name}" for editing`);
            }
        }
        
        if (targetObject) {
            this.selectedObject = targetObject;
            this.transformControls.attach(targetObject);
            this.transformControls.setMode('translate'); // Default to translate mode
            console.log(`Transform controls attached. Right-click controls to switch modes (translate/rotate/scale)`);
            console.log('Press Delete/Backspace to delete, Ctrl+Z to undo');
        } else {
            console.warn(`Cannot select ${objectType} - object not loaded`);
        }
    }
    
    // Get all selectable objects (groups and individual meshes/curves)
    getAllSelectableObjects() {
        const objects = [];
        
        if (this.currentHat) {
            objects.push({ value: 'hat', label: 'Hat (Group)' });
            this.currentHat.children.forEach((child, index) => {
                objects.push({ 
                    value: `hat_${index}`, 
                    label: `Hat: ${child.name || `Mesh ${index}`}` 
                });
            });
        }
        
        if (this.currentShirt) {
            objects.push({ value: 'shirt', label: 'Shirt (Group)' });
            this.currentShirt.children.forEach((child, index) => {
                objects.push({ 
                    value: `shirt_${index}`, 
                    label: `Shirt: ${child.name || `Mesh ${index}`}` 
                });
            });
        }
        
        if (this.currentEyes) {
            objects.push({ value: 'eyes', label: 'Eyes (Group)' });
            this.currentEyes.children.forEach((child, index) => {
                objects.push({ 
                    value: `eyes_${index}`, 
                    label: `Eyes: ${child.name || `Mesh ${index}`}` 
                });
            });
        }
        
        return objects;
    }
    
    // Update object selection dropdown with all available objects
    updateObjectSelectionDropdown() {
        const objectSelect = document.getElementById('object-select');
        if (!objectSelect) return;
        
        // Clear existing options
        objectSelect.innerHTML = '<option value="">-- Select --</option>';
        
        // Add all selectable objects
        const objects = this.getAllSelectableObjects();
        objects.forEach(obj => {
            const option = document.createElement('option');
            option.value = obj.value;
            option.textContent = obj.label;
            objectSelect.appendChild(option);
        });
        
        console.log(`Updated object selection: ${objects.length} objects available`);
    }
    
    // Setup click-to-select in 3D view
    setupClickToSelect() {
        if (!this.renderer) return;
        
        const canvas = this.renderer.domElement;
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();
        
        canvas.addEventListener('click', (event) => {
            if (!this.editMode) return;
            
            // Calculate mouse position in normalized device coordinates
            const rect = canvas.getBoundingClientRect();
            mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
            
            // Raycast to find intersected objects
            raycaster.setFromCamera(mouse, this.camera);
            
            // Collect all selectable objects (hat, shirt, eyes, and their children)
            const selectableObjects = [];
            if (this.currentHat) {
                selectableObjects.push(this.currentHat);
                this.currentHat.traverse((child) => {
                    if (child instanceof THREE.Mesh || 
                        child instanceof THREE.Line || 
                        child instanceof THREE.LineSegments) {
                        selectableObjects.push(child);
                    }
                });
            }
            if (this.currentShirt) {
                selectableObjects.push(this.currentShirt);
                this.currentShirt.traverse((child) => {
                    if (child instanceof THREE.Mesh || 
                        child instanceof THREE.Line || 
                        child instanceof THREE.LineSegments) {
                        selectableObjects.push(child);
                    }
                });
            }
            if (this.currentEyes) {
                selectableObjects.push(this.currentEyes);
                this.currentEyes.traverse((child) => {
                    if (child instanceof THREE.Mesh || 
                        child instanceof THREE.Line || 
                        child instanceof THREE.LineSegments) {
                        selectableObjects.push(child);
                    }
                });
            }
            
            const intersects = raycaster.intersectObjects(selectableObjects, true);
            
            if (intersects.length > 0) {
                const selected = intersects[0].object;
                // Find the top-level selectable object (group or direct child)
                let targetObject = selected;
                
                // If clicked object is a child, use it directly; otherwise use the group
                if (selected.parent === this.currentHat || selected.parent === this.currentShirt || selected.parent === this.currentEyes) {
                    targetObject = selected;
                } else if (selected === this.currentHat || selected === this.currentShirt || selected === this.currentEyes) {
                    targetObject = selected;
                } else {
                    // Find the parent group
                    let parent = selected.parent;
                    while (parent) {
                        if (parent === this.currentHat || parent === this.currentShirt || parent === this.currentEyes) {
                            targetObject = selected; // Use the clicked mesh/curve
                            break;
                        }
                        parent = parent.parent;
                    }
                }
                
                // Attach transform controls to selected object
                if (this.transformControls) {
                    // Save state of previous object before switching
                    if (this.selectedObject && this.selectedObject !== targetObject) {
                        // Ensure previous object's transforms are committed
                        this.selectedObject.updateMatrixWorld();
                        this.saveStateToHistory('Transform object');
                    }
                    
                    this.transformControls.detach();
                    this.transformControls.attach(targetObject);
                    this.transformControls.setMode('translate');
                    this.selectedObject = targetObject;
                    console.log(`Selected "${targetObject.name || 'object'}" for editing - click and drag to transform`);
                    console.log('Press Delete/Backspace to delete, Ctrl+Z to undo');
                    
                    // Update dropdown to reflect selection
                    this.updateObjectSelectionDropdown();
                }
            } else {
                // Clicked on empty space - deselect and save current state
                if (this.transformControls && this.selectedObject) {
                    // Ensure transforms are committed before saving
                    this.selectedObject.updateMatrixWorld();
                    this.saveStateToHistory('Transform object');
                    this.transformControls.detach();
                    this.selectedObject = null;
                    console.log('Deselected object - changes saved');
                    
                    // Update dropdown
                    this.updateObjectSelectionDropdown();
                }
            }
        });
    }
    
    // Method to turn off edit mode when user confirms they like the positions
    confirmEditPositions() {
        if (this.editMode) {
            console.log('Saving current positions...');
            // Positions are already saved in the objects themselves
            // Just turn off edit mode
            this.setEditMode(false);
            const editModeCheckbox = document.getElementById('edit-mode');
            if (editModeCheckbox) {
                editModeCheckbox.checked = false;
            }
            console.log('Edit mode turned off. Positions saved.');
        }
    }
    
    // Delete the currently selected object
    deleteSelectedObject() {
        if (!this.selectedObject) {
            console.warn('No object selected to delete');
            return;
        }
        
        const objectToDelete = this.selectedObject;
        const parent = objectToDelete.parent;
        const objectName = objectToDelete.name || 'object';
        
        // Get index in parent before removal
        let indexInParent = -1;
        if (parent) {
            indexInParent = parent.children.indexOf(objectToDelete);
        }
        
        // Save state to history before deleting (store object reference for undo)
        this.saveStateToHistory(`Delete ${objectName}`, objectToDelete, parent, indexInParent);
        
        // Detach transform controls
        if (this.transformControls) {
            this.transformControls.detach();
        }
        
        // Remove from parent
        if (parent) {
            parent.remove(objectToDelete);
        } else {
            this.scene.remove(objectToDelete);
        }
        
        // Check if we deleted the entire hat or shirt
        if (objectToDelete === this.currentHat) {
            this.currentHat = null;
            const removeHatBtn = document.getElementById('remove-hat-btn');
            if (removeHatBtn) removeHatBtn.disabled = true;
        } else if (objectToDelete === this.currentShirt) {
            this.currentShirt = null;
            const removeShirtBtn = document.getElementById('remove-shirt-btn');
            if (removeShirtBtn) removeShirtBtn.disabled = true;
        } else if (objectToDelete === this.currentEyes) {
            this.currentEyes = null;
            const removeEyesBtn = document.getElementById('remove-eyes-btn');
            if (removeEyesBtn) removeEyesBtn.disabled = true;
        }
        
        this.selectedObject = null;
        console.log(`Deleted ${objectName}. Press Ctrl+Z to undo.`);
        
        // Update dropdown
        if (this.editMode) {
            this.updateObjectSelectionDropdown();
        }
    }
    
    // Save current state to history for undo/redo
    saveStateToHistory(action = 'Edit', deletedObject = null, deletedObjectParent = null, deletedObjectIndex = -1) {
        // Ensure all transforms are committed before saving
        if (this.selectedObject) {
            this.selectedObject.updateMatrixWorld();
        }
        if (this.currentHat) {
            this.currentHat.updateMatrixWorld();
        }
        if (this.currentShirt) {
            this.currentShirt.updateMatrixWorld();
        }
        if (this.currentEyes) {
            this.currentEyes.updateMatrixWorld();
        }
        
        const state = {
            action: action,
            timestamp: Date.now(),
            hat: this.currentHat ? this.serializeObject(this.currentHat) : null,
            shirt: this.currentShirt ? this.serializeObject(this.currentShirt) : null,
            eyes: this.currentEyes ? this.serializeObject(this.currentEyes) : null,
            deletedObject: deletedObject,
            deletedObjectParent: deletedObjectParent,
            deletedObjectIndex: deletedObjectIndex
        };
        
        // Remove any states after current index (when we're not at the end)
        if (this.historyIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.historyIndex + 1);
        }
        
        // Add new state
        this.history.push(state);
        this.historyIndex = this.history.length - 1;
        
        // Limit history size
        if (this.history.length > this.maxHistorySize) {
            this.history.shift();
            this.historyIndex--;
        }
        
        // State saved (verbose logging removed for performance)
        
        // Also save to localStorage for persistence across page refreshes
        this.savePositionsToStorage();
    }
    
    // Save current positions to localStorage
    savePositionsToStorage() {
        try {
            const positions = {
                hats: {},
                shirts: {},
                eyes: {}
            };
            
            // Save hat position if it exists
            if (this.currentHat) {
                const hatName = this.getHatName();
                if (hatName) {
                    // Get world position if parented to bone, otherwise use local
                    let pos, rot, scale, quat;
                    if (this.currentHat.parent && this.currentHat.parent.type === 'Bone') {
                        const worldPos = new THREE.Vector3();
                        const worldQuat = new THREE.Quaternion();
                        const worldScale = new THREE.Vector3();
                        this.currentHat.getWorldPosition(worldPos);
                        this.currentHat.getWorldQuaternion(worldQuat);
                        this.currentHat.getWorldScale(worldScale);
                        pos = { x: worldPos.x, y: worldPos.y, z: worldPos.z };
                        quat = { x: worldQuat.x, y: worldQuat.y, z: worldQuat.z, w: worldQuat.w };
                        scale = { x: worldScale.x, y: worldScale.y, z: worldScale.z };
                        rot = { x: this.currentHat.rotation.x, y: this.currentHat.rotation.y, z: this.currentHat.rotation.z };
                    } else {
                        pos = { x: this.currentHat.position.x, y: this.currentHat.position.y, z: this.currentHat.position.z };
                        rot = { x: this.currentHat.rotation.x, y: this.currentHat.rotation.y, z: this.currentHat.rotation.z };
                        scale = { x: this.currentHat.scale.x, y: this.currentHat.scale.y, z: this.currentHat.scale.z };
                        quat = { x: this.currentHat.quaternion.x, y: this.currentHat.quaternion.y, z: this.currentHat.quaternion.z, w: this.currentHat.quaternion.w };
                    }
                    const hatData = { position: pos, rotation: rot, scale: scale, quaternion: quat, children: [] };
                    
                    // Save all children (meshes, curves, lines) positions
                    this.currentHat.children.forEach((child, index) => {
                        if (child instanceof THREE.Mesh || 
                            child instanceof THREE.Line || 
                            child instanceof THREE.LineSegments ||
                            child instanceof THREE.Group) {
                            child.updateMatrixWorld();
                            let childPos, childRot, childScale, childQuat;
                            if (this.currentHat.parent && this.currentHat.parent.type === 'Bone') {
                                const worldPos = new THREE.Vector3();
                                const worldQuat = new THREE.Quaternion();
                                const worldScale = new THREE.Vector3();
                                child.getWorldPosition(worldPos);
                                child.getWorldQuaternion(worldQuat);
                                child.getWorldScale(worldScale);
                                childPos = { x: worldPos.x, y: worldPos.y, z: worldPos.z };
                                childQuat = { x: worldQuat.x, y: worldQuat.y, z: worldQuat.z, w: worldQuat.w };
                                childScale = { x: worldScale.x, y: worldScale.y, z: worldScale.z };
                                childRot = { x: child.rotation.x, y: child.rotation.y, z: child.rotation.z };
                            } else {
                                childPos = { x: child.position.x, y: child.position.y, z: child.position.z };
                                childRot = { x: child.rotation.x, y: child.rotation.y, z: child.rotation.z };
                                childScale = { x: child.scale.x, y: child.scale.y, z: child.scale.z };
                                childQuat = { x: child.quaternion.x, y: child.quaternion.y, z: child.quaternion.z, w: child.quaternion.w };
                            }
                            hatData.children.push({
                                name: child.name,
                                index: index,
                                position: childPos,
                                rotation: childRot,
                                scale: childScale,
                                quaternion: childQuat,
                                visible: child.visible
                            });
                        }
                    });
                    
                    positions.hats[hatName] = hatData;
                }
            }
            
            // Save shirt position if it exists
            if (this.currentShirt) {
                const shirtName = this.getShirtName();
                if (shirtName) {
                    const shirtData = {
                        position: { x: this.currentShirt.position.x, y: this.currentShirt.position.y, z: this.currentShirt.position.z },
                        rotation: { x: this.currentShirt.rotation.x, y: this.currentShirt.rotation.y, z: this.currentShirt.rotation.z },
                        scale: { x: this.currentShirt.scale.x, y: this.currentShirt.scale.y, z: this.currentShirt.scale.z },
                        quaternion: { x: this.currentShirt.quaternion.x, y: this.currentShirt.quaternion.y, z: this.currentShirt.quaternion.z, w: this.currentShirt.quaternion.w },
                        children: []
                    };
                    
                    // Save all children (meshes, curves, lines) positions
                    this.currentShirt.children.forEach((child, index) => {
                        if (child instanceof THREE.Mesh || 
                            child instanceof THREE.Line || 
                            child instanceof THREE.LineSegments ||
                            child instanceof THREE.Group) {
                            child.updateMatrixWorld();
                            shirtData.children.push({
                                name: child.name,
                                index: index,
                                position: { x: child.position.x, y: child.position.y, z: child.position.z },
                                rotation: { x: child.rotation.x, y: child.rotation.y, z: child.rotation.z },
                                scale: { x: child.scale.x, y: child.scale.y, z: child.scale.z },
                                quaternion: { x: child.quaternion.x, y: child.quaternion.y, z: child.quaternion.z, w: child.quaternion.w },
                                visible: child.visible
                            });
                        }
                    });
                    
                    positions.shirts[shirtName] = shirtData;
                }
            }
            
            // Save eyes position if it exists
            if (this.currentEyes) {
                const eyeName = this.getEyeName();
                if (eyeName) {
                    // Get world position if parented to bone, otherwise use local
                    let pos, rot, scale, quat;
                    if (this.currentEyes.parent && this.currentEyes.parent.type === 'Bone') {
                        const worldPos = new THREE.Vector3();
                        const worldQuat = new THREE.Quaternion();
                        const worldScale = new THREE.Vector3();
                        this.currentEyes.getWorldPosition(worldPos);
                        this.currentEyes.getWorldQuaternion(worldQuat);
                        this.currentEyes.getWorldScale(worldScale);
                        pos = { x: worldPos.x, y: worldPos.y, z: worldPos.z };
                        quat = { x: worldQuat.x, y: worldQuat.y, z: worldQuat.z, w: worldQuat.w };
                        scale = { x: worldScale.x, y: worldScale.y, z: worldScale.z };
                        rot = { x: this.currentEyes.rotation.x, y: this.currentEyes.rotation.y, z: this.currentEyes.rotation.z };
                    } else {
                        pos = { x: this.currentEyes.position.x, y: this.currentEyes.position.y, z: this.currentEyes.position.z };
                        rot = { x: this.currentEyes.rotation.x, y: this.currentEyes.rotation.y, z: this.currentEyes.rotation.z };
                        scale = { x: this.currentEyes.scale.x, y: this.currentEyes.scale.y, z: this.currentEyes.scale.z };
                        quat = { x: this.currentEyes.quaternion.x, y: this.currentEyes.quaternion.y, z: this.currentEyes.quaternion.z, w: this.currentEyes.quaternion.w };
                    }
                    const eyeData = { position: pos, rotation: rot, scale: scale, quaternion: quat, children: [] };
                    
                    // Save all children (meshes, curves, lines) positions
                    this.currentEyes.children.forEach((child, index) => {
                        if (child instanceof THREE.Mesh || 
                            child instanceof THREE.Line || 
                            child instanceof THREE.LineSegments ||
                            child instanceof THREE.Group) {
                            child.updateMatrixWorld();
                            let childPos, childRot, childScale, childQuat;
                            if (this.currentEyes.parent && this.currentEyes.parent.type === 'Bone') {
                                const worldPos = new THREE.Vector3();
                                const worldQuat = new THREE.Quaternion();
                                const worldScale = new THREE.Vector3();
                                child.getWorldPosition(worldPos);
                                child.getWorldQuaternion(worldQuat);
                                child.getWorldScale(worldScale);
                                childPos = { x: worldPos.x, y: worldPos.y, z: worldPos.z };
                                childQuat = { x: worldQuat.x, y: worldQuat.y, z: worldQuat.z, w: worldQuat.w };
                                childScale = { x: worldScale.x, y: worldScale.y, z: worldScale.z };
                                childRot = { x: child.rotation.x, y: child.rotation.y, z: child.rotation.z };
                            } else {
                                childPos = { x: child.position.x, y: child.position.y, z: child.position.z };
                                childRot = { x: child.rotation.x, y: child.rotation.y, z: child.rotation.z };
                                childScale = { x: child.scale.x, y: child.scale.y, z: child.scale.z };
                                childQuat = { x: child.quaternion.x, y: child.quaternion.y, z: child.quaternion.z, w: child.quaternion.w };
                            }
                            eyeData.children.push({
                                name: child.name,
                                index: index,
                                position: childPos,
                                rotation: childRot,
                                scale: childScale,
                                quaternion: childQuat,
                                visible: child.visible
                            });
                        }
                    });
                    
                    positions.eyes[eyeName] = eyeData;
                }
            }
            
            localStorage.setItem(this.storageKey, JSON.stringify(positions));
            console.log('Positions saved to localStorage');
        } catch (error) {
            console.error('Error saving positions to localStorage:', error);
        }
    }
    
    // Load saved position from localStorage
    loadSavedPosition(type, name) {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (!stored) return null;
            
            const positions = JSON.parse(stored);
            if (type === 'hat' && positions.hats && positions.hats[name]) {
                return positions.hats[name];
            } else if (type === 'shirt' && positions.shirts && positions.shirts[name]) {
                return positions.shirts[name];
            } else if (type === 'eyes' && positions.eyes && positions.eyes[name]) {
                return positions.eyes[name];
            }
            return null;
        } catch (error) {
            console.error('Error loading saved position:', error);
            return null;
        }
    }
    
    // Get current hat name
    getHatName() {
        if (this.currentHat && this.currentHat.userData && this.currentHat.userData.hatName) {
            return this.currentHat.userData.hatName;
        }
        return null;
    }
    
    // Get current shirt name
    getShirtName() {
        if (this.currentShirt && this.currentShirt.userData && this.currentShirt.userData.shirtName) {
            return this.currentShirt.userData.shirtName;
        }
        return null;
    }
    
    // Get current eye name
    getEyeName() {
        if (this.currentEyes && this.currentEyes.userData && this.currentEyes.userData.eyeName) {
            return this.currentEyes.userData.eyeName;
        }
        return null;
    }
    
    // Explicitly save current positions as default (called by Save button)
    saveCurrentPositions() {
        // Ensure all transforms are committed
        if (this.currentHat) {
            this.currentHat.updateMatrixWorld();
            this.currentHat.children.forEach(child => child.updateMatrixWorld());
        }
        if (this.currentShirt) {
            this.currentShirt.updateMatrixWorld();
            this.currentShirt.children.forEach(child => child.updateMatrixWorld());
        }
        if (this.selectedObject) {
            this.selectedObject.updateMatrixWorld();
        }
        
        // Save to localStorage
        this.savePositionsToStorage();
        
        // Show feedback
        const saveFeedback = document.getElementById('save-feedback');
        if (saveFeedback) {
            const hatName = this.getHatName();
            const shirtName = this.getShirtName();
            const eyeName = this.getEyeName();
            let message = 'Positions saved!';
            if (hatName || shirtName || eyeName) {
                message += ' Saved positions for:';
                if (hatName) message += ` ${hatName}`;
                if (shirtName) message += ` ${shirtName}`;
                if (eyeName) message += ` ${eyeName}`;
            }
            saveFeedback.textContent = message;
            saveFeedback.style.display = 'block';
            saveFeedback.style.color = '#4CAF50'; // Green color
            
            // Hide feedback after 3 seconds
            setTimeout(() => {
                saveFeedback.style.display = 'none';
            }, 3000);
        }
        
        console.log('✅ Positions explicitly saved as default load positions');
    }
    
    // Serialize object state (position, rotation, scale, children)
    serializeObject(object) {
        if (!object) return null;
        
        // Ensure matrix is up to date before reading transforms
        object.updateMatrixWorld();
        
        const serialized = {
            position: object.position.clone(),
            rotation: object.rotation.clone(),
            scale: object.scale.clone(),
            quaternion: object.quaternion.clone(),
            children: []
        };
        
        // Serialize children
        object.children.forEach((child, index) => {
            if (child instanceof THREE.Mesh || 
                child instanceof THREE.Line || 
                child instanceof THREE.LineSegments ||
                child instanceof THREE.Group) {
                // Ensure child matrix is updated
                child.updateMatrixWorld();
                serialized.children.push({
                    name: child.name,
                    position: child.position.clone(),
                    rotation: child.rotation.clone(),
                    scale: child.scale.clone(),
                    quaternion: child.quaternion.clone(),
                    visible: child.visible,
                    index: index
                });
            }
        });
        
        return serialized;
    }
    
    // Restore object from serialized state
    restoreObject(object, state) {
        if (!object || !state) return;
        
        console.log(`Restoring object "${object.name || 'object'}"`, {
            from: `${object.position.x.toFixed(3)}, ${object.position.y.toFixed(3)}, ${object.position.z.toFixed(3)}`,
            to: `${state.position.x.toFixed(3)}, ${state.position.y.toFixed(3)}, ${state.position.z.toFixed(3)}`
        });
        
        object.position.copy(state.position);
        object.rotation.copy(state.rotation);
        object.scale.copy(state.scale);
        object.quaternion.copy(state.quaternion);
        
        // Restore children states
        state.children.forEach((childState) => {
            if (object.children[childState.index]) {
                const child = object.children[childState.index];
                child.position.copy(childState.position);
                child.rotation.copy(childState.rotation);
                child.scale.copy(childState.scale);
                child.quaternion.copy(childState.quaternion);
                child.visible = childState.visible;
                child.updateMatrixWorld();
            }
        });
        
        object.updateMatrixWorld();
    }
    
    // Undo last action
    undo() {
        if (this.historyIndex <= 0) {
            console.log('Nothing to undo');
            return;
        }
        
        // Get current state before undoing
        const currentState = this.history[this.historyIndex];
        
        this.historyIndex--;
        const state = this.history[this.historyIndex];
        
        // If we're undoing a deletion, restore the deleted object
        if (currentState.deletedObject && currentState.deletedObjectParent !== null) {
            const deletedObj = currentState.deletedObject;
            const parent = currentState.deletedObjectParent;
            const index = currentState.deletedObjectIndex;
            
            // Restore object to parent
            if (parent) {
                if (index >= 0 && index < parent.children.length) {
                    parent.children.splice(index, 0, deletedObj);
                } else {
                    parent.add(deletedObj);
                }
            } else {
                this.scene.add(deletedObj);
            }
            
            // Restore hat/shirt/eyes references if needed
            if (deletedObj === this.currentHat || (this.currentHat === null && deletedObj.name && deletedObj.name.includes('hat'))) {
                // Check if this was the hat
                if (deletedObj === currentState.hat || !this.currentHat) {
                    this.currentHat = deletedObj;
                    const removeHatBtn = document.getElementById('remove-hat-btn');
                    if (removeHatBtn) removeHatBtn.disabled = false;
                }
            }
            if (deletedObj === this.currentShirt || (this.currentShirt === null && deletedObj.name && deletedObj.name.includes('shirt'))) {
                // Check if this was the shirt
                if (deletedObj === currentState.shirt || !this.currentShirt) {
                    this.currentShirt = deletedObj;
                    const removeShirtBtn = document.getElementById('remove-shirt-btn');
                    if (removeShirtBtn) removeShirtBtn.disabled = false;
                }
            }
            if (deletedObj === this.currentEyes || (this.currentEyes === null && deletedObj.name && deletedObj.name.includes('eye'))) {
                // Check if this was the eyes
                if (deletedObj === currentState.eyes || !this.currentEyes) {
                    this.currentEyes = deletedObj;
                    const removeEyesBtn = document.getElementById('remove-eyes-btn');
                    if (removeEyesBtn) removeEyesBtn.disabled = false;
                }
            }
            
            console.log(`Restored deleted object: ${deletedObj.name || 'object'}`);
        }
        
        // Restore hat state
        if (state.hat && this.currentHat) {
            this.restoreObject(this.currentHat, state.hat);
        }
        
        // Restore shirt state
        if (state.shirt && this.currentShirt) {
            this.restoreObject(this.currentShirt, state.shirt);
        }
        
        // Restore eyes state
        if (state.eyes && this.currentEyes) {
            this.restoreObject(this.currentEyes, state.eyes);
        }
        
        console.log(`Undo: ${state.action}`);
        
        // Update dropdown
        if (this.editMode) {
            this.updateObjectSelectionDropdown();
        }
        
        // Reattach transform controls if object is still selected
        if (this.selectedObject && this.transformControls) {
            this.transformControls.attach(this.selectedObject);
        }
    }
    
    // Redo last undone action
    redo() {
        if (this.historyIndex >= this.history.length - 1) {
            console.log('Nothing to redo');
            return;
        }
        
        this.historyIndex++;
        const state = this.history[this.historyIndex];
        
        // If we're redoing a deletion, delete the object again
        if (state.deletedObject && state.deletedObjectParent !== null) {
            const deletedObj = state.deletedObject;
            const parent = state.deletedObjectParent;
            
            // Remove object again
            if (parent) {
                parent.remove(deletedObj);
            } else {
                this.scene.remove(deletedObj);
            }
            
            // Clear hat/shirt/eyes references if needed
            if (deletedObj === this.currentHat) {
                this.currentHat = null;
                const removeHatBtn = document.getElementById('remove-hat-btn');
                if (removeHatBtn) removeHatBtn.disabled = true;
            }
            if (deletedObj === this.currentShirt) {
                this.currentShirt = null;
                const removeShirtBtn = document.getElementById('remove-shirt-btn');
                if (removeShirtBtn) removeShirtBtn.disabled = true;
            }
            if (deletedObj === this.currentEyes) {
                this.currentEyes = null;
                const removeEyesBtn = document.getElementById('remove-eyes-btn');
                if (removeEyesBtn) removeEyesBtn.disabled = true;
            }
            
            // Clear selection if it was the selected object
            if (deletedObj === this.selectedObject) {
                this.selectedObject = null;
                if (this.transformControls) {
                    this.transformControls.detach();
                }
            }
            
            console.log(`Redid deletion: ${deletedObj.name || 'object'}`);
        }
        
        // Restore hat state
        if (state.hat && this.currentHat) {
            this.restoreObject(this.currentHat, state.hat);
        }
        
        // Restore shirt state
        if (state.shirt && this.currentShirt) {
            this.restoreObject(this.currentShirt, state.shirt);
        }
        
        // Restore eyes state
        if (state.eyes && this.currentEyes) {
            this.restoreObject(this.currentEyes, state.eyes);
        }
        
        console.log(`Redo: ${state.action}`);
        
        // Update dropdown
        if (this.editMode) {
            this.updateObjectSelectionDropdown();
        }
        
        // Reattach transform controls if object is still selected
        if (this.selectedObject && this.transformControls) {
            this.transformControls.attach(this.selectedObject);
        }
    }
}

// Initialize
let avatarBuilder;
window.addEventListener('DOMContentLoaded', () => {
    console.log('DOM Content Loaded - Initializing AvatarBuilder...');
    try {
        avatarBuilder = new AvatarBuilder();
        console.log('AvatarBuilder initialized successfully!');
    } catch (error) {
        console.error('Error initializing AvatarBuilder:', error);
        alert('Error initializing Avatar Builder. Check console for details.');
    }
    
    // Expose hat rotation function globally for console access
    window.rotateHat = (axis, amount = null) => {
        if (avatarBuilder) {
            avatarBuilder.rotateHat(axis, amount);
        }
    };
    
    // Expose hat movement function globally for console access
    window.moveHat = (direction, amount = 0.05) => {
        if (avatarBuilder) {
            avatarBuilder.moveHat(direction, amount);
        }
    };
    
    // Expose edit mode confirmation function
    window.confirmEditPositions = () => {
        if (avatarBuilder) {
            avatarBuilder.confirmEditPositions();
        }
    };
    
    // Expose object selection for editing
    window.selectForEditing = (objectType) => {
        if (avatarBuilder) {
            avatarBuilder.selectObjectForEditing(objectType);
        }
    };
});
