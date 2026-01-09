// Electric Border Effect - Vanilla JS version
// Inspired by @BalintFerenczy

class ElectricBorder {
  constructor(container, options = {}) {
    this.container = container;
    this.color = options.color || '#95feb4';
    this.speed = options.speed || 1;
    this.chaos = options.chaos || 0.08;
    this.borderRadius = options.borderRadius || 999; // Circle for team image
    
    this.canvas = null;
    this.ctx = null;
    this.animationRef = null;
    this.time = 0;
    this.lastFrameTime = 0;
    
    this.init();
  }
  
  init() {
    // Store original container size and classes
    const originalWidth = this.container.offsetWidth || 160;
    const originalHeight = this.container.offsetHeight || 160;
    const originalClasses = this.container.className;
    const originalMargin = window.getComputedStyle(this.container).margin;
    
    // Create wrapper structure
    const wrapper = document.createElement('div');
    wrapper.className = `electric-border ${originalClasses}`;
    wrapper.style.setProperty('--electric-border-color', this.color);
    wrapper.style.borderRadius = this.borderRadius + 'px';
    wrapper.style.width = originalWidth + 'px';
    wrapper.style.height = originalHeight + 'px';
    wrapper.style.margin = originalMargin;
    
    // Create canvas container
    const canvasContainer = document.createElement('div');
    canvasContainer.className = 'eb-canvas-container';
    
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'eb-canvas';
    canvasContainer.appendChild(this.canvas);
    
    // Create glow layers
    const layers = document.createElement('div');
    layers.className = 'eb-layers';
    layers.innerHTML = `
      <div class="eb-glow-1"></div>
      <div class="eb-glow-2"></div>
      <div class="eb-background-glow"></div>
    `;
    
    // Create content wrapper
    const content = document.createElement('div');
    content.className = 'eb-content';
    content.style.width = '100%';
    content.style.height = '100%';
    
    // Move existing content into wrapper
    while (this.container.firstChild) {
      content.appendChild(this.container.firstChild);
    }
    
    wrapper.appendChild(canvasContainer);
    wrapper.appendChild(layers);
    wrapper.appendChild(content);
    
    // Replace container with wrapper
    this.container.parentNode.replaceChild(wrapper, this.container);
    this.container = wrapper;
    
    this.ctx = this.canvas.getContext('2d');
    this.setupCanvas();
    this.startAnimation();
    
    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      this.setupCanvas();
    });
    resizeObserver.observe(this.container);
  }
  
  setupCanvas() {
    // Get the wrapper size (should be 160px)
    const rect = this.container.getBoundingClientRect();
    const borderOffset = 60;
    // Canvas needs to be larger to draw border outside, but positioned absolutely
    const width = rect.width + borderOffset * 2;
    const height = rect.height + borderOffset * 2;
    
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.scale(dpr, dpr);
  }
  
  random(x) {
    return (Math.sin(x * 12.9898) * 43758.5453) % 1;
  }
  
  noise2D(x, y) {
    const i = Math.floor(x);
    const j = Math.floor(y);
    const fx = x - i;
    const fy = y - j;
    const a = this.random(i + j * 57);
    const b = this.random(i + 1 + j * 57);
    const c = this.random(i + (j + 1) * 57);
    const d = this.random(i + 1 + (j + 1) * 57);
    const ux = fx * fx * (3.0 - 2.0 * fx);
    const uy = fy * fy * (3.0 - 2.0 * fy);
    return a * (1 - ux) * (1 - uy) + b * ux * (1 - uy) + c * (1 - ux) * uy + d * ux * uy;
  }
  
  octavedNoise(x, octaves, lacunarity, gain, baseAmplitude, baseFrequency, time, seed, baseFlatness) {
    let y = 0;
    let amplitude = baseAmplitude;
    let frequency = baseFrequency;
    
    for (let i = 0; i < octaves; i++) {
      let octaveAmplitude = amplitude;
      if (i === 0) {
        octaveAmplitude *= baseFlatness;
      }
      y += octaveAmplitude * this.noise2D(frequency * x + seed * 100, time * frequency * 0.3);
      frequency *= lacunarity;
      amplitude *= gain;
    }
    return y;
  }
  
  getCornerPoint(centerX, centerY, radius, startAngle, arcLength, progress) {
    const angle = startAngle + progress * arcLength;
    return {
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle)
    };
  }
  
  getCirclePoint(centerX, centerY, radius, progress) {
    const angle = progress * 2 * Math.PI;
    return {
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle)
    };
  }
  
  drawElectricBorder(currentTime) {
    if (!this.canvas || !this.ctx) return;
    
    const deltaTime = (currentTime - this.lastFrameTime) / 1000;
    this.time += deltaTime * this.speed;
    this.lastFrameTime = currentTime;
    
    const rect = this.container.getBoundingClientRect();
    const borderOffset = 60;
    const width = rect.width + borderOffset * 2;
    const height = rect.height + borderOffset * 2;
    
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.scale(dpr, dpr);
    
    this.ctx.strokeStyle = this.color;
    this.ctx.lineWidth = 1;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    
    const scale = 60;
    const centerX = width / 2;
    const centerY = height / 2;
    const maxRadius = Math.min(rect.width, rect.height) / 2;
    const radius = Math.min(this.borderRadius === 999 ? maxRadius : this.borderRadius, maxRadius);
    
    const circumference = 2 * Math.PI * radius;
    const sampleCount = Math.floor(circumference / 2);
    
    const octaves = 10;
    const lacunarity = 1.6;
    const gain = 0.7;
    const amplitude = this.chaos;
    const frequency = 10;
    const baseFlatness = 0;
    
    this.ctx.beginPath();
    
    for (let i = 0; i <= sampleCount; i++) {
      const progress = i / sampleCount;
      const point = this.getCirclePoint(centerX, centerY, radius, progress);
      
      const xNoise = this.octavedNoise(
        progress * 8,
        octaves,
        lacunarity,
        gain,
        amplitude,
        frequency,
        this.time,
        0,
        baseFlatness
      );
      
      const yNoise = this.octavedNoise(
        progress * 8,
        octaves,
        lacunarity,
        gain,
        amplitude,
        frequency,
        this.time,
        1,
        baseFlatness
      );
      
      const displacedX = point.x + xNoise * scale;
      const displacedY = point.y + yNoise * scale;
      
      if (i === 0) {
        this.ctx.moveTo(displacedX, displacedY);
      } else {
        this.ctx.lineTo(displacedX, displacedY);
      }
    }
    
    this.ctx.closePath();
    this.ctx.stroke();
    
    this.animationRef = requestAnimationFrame((time) => this.drawElectricBorder(time));
  }
  
  startAnimation() {
    this.lastFrameTime = performance.now();
    this.animationRef = requestAnimationFrame((time) => this.drawElectricBorder(time));
  }
  
  destroy() {
    if (this.animationRef) {
      cancelAnimationFrame(this.animationRef);
    }
  }
}

