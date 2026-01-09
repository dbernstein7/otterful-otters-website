# 🦦 Ottvatar Viewer

<div align="center">

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![JavaScript](https://img.shields.io/badge/JavaScript-84.6%25-yellow)
![Three.js](https://img.shields.io/badge/Three.js-0.160.0-green)
![Static Site](https://img.shields.io/badge/static-site-brightgreen)

**A modern, web-based 3D avatar customization tool for creating unique otter avatars**

[Live Demo](#-deployment) • [Features](#-features) • [Usage](#-usage) • [Deploy](#-deploy-as-a-public-website)

</div>

---

A beautiful, interactive web application for customizing otter avatars with different furs, hats, and shirts. Built with Three.js, this tool provides an intuitive gallery-based interface for mixing and matching avatar components in real-time.

## ✨ Features

- 🎨 **Fur Customization**: Choose from 18+ unique fur patterns (Tiger, Galaxy, Robo, Zombie, and more!)
- 🎩 **Hat Gallery**: Browse and apply 85+ hat options (from simple beanies to wizard hats and viking helmets)
- 👕 **Shirt Collection**: Mix and match 79+ shirt styles (sports jerseys, suits, costumes, and more)
- 🎲 **Randomize**: Instantly generate random combinations with one click
- 🎬 **Interactive 3D Viewer**: Rotate, zoom, and pan around your avatar with smooth OrbitControls
- 🌓 **Dark/Light Theme**: Toggle between themes for comfortable viewing
- 🎛️ **Scene Controls**: Adjust background presets, lighting intensity, and auto-rotation
- 💾 **100% Client-Side**: All processing happens in your browser - no server required
- 🔒 **Privacy-First**: Your files never leave your device

## 🚀 Deploy as a Public Website

This tool is ready to deploy as a static website! Choose one of these free hosting options:

### Option 1: GitHub Pages (Recommended)

1. Push your code to GitHub
2. Go to your repository → **Settings** → **Pages**
3. Under "Source", select your branch (usually `main`)
4. Select `/ (root)` as the source folder
5. Click **Save**
6. Your site will be live at `https://your-username.github.io/ottvatar` (may take a few minutes)

**Note**: A GitHub Actions workflow is included (`.github/workflows/pages.yml`) for automatic deployment on push.

### Option 2: Netlify (Easiest)

1. Push your code to GitHub
2. Go to [Netlify](https://www.netlify.com/)
3. Click "New site from Git"
4. Connect your repository
5. Deploy! (Netlify will auto-detect the settings from `netlify.toml`)

Your site will be live at `https://your-site-name.netlify.app`

### Option 3: Vercel

1. Push your code to GitHub
2. Go to [Vercel](https://vercel.com/)
3. Click "New Project" and import your repository
4. Deploy! (Vercel will auto-detect the settings from `vercel.json`)

Your site will be live at `https://your-site-name.vercel.app`

### Option 4: Local Development

For local testing:

1. Install a simple HTTP server:
   ```bash
   npm install -g serve
   ```

2. Start the server:
   ```bash
   npm start
   # or
   npx serve .
   ```

3. Open `http://localhost:3000` in your browser

Or use Python:
```bash
python -m http.server 8000
```
Then open `http://localhost:8000`

## 🎮 Usage

1. **Select a Fur**: Click any fur from the gallery to load the base otter avatar
2. **Add a Hat**: Once a fur is loaded, the hat gallery appears - click any hat to add it
3. **Add a Shirt**: Click any shirt from the shirt gallery to dress your otter
4. **Randomize**: Click the 🎲 Randomize button for instant random combinations
5. **Customize Scene**: 
   - Choose from background presets (Dark Studio, Light Studio, Gradients, Blue Sky, Sunset)
   - Adjust light intensity with the slider
   - Enable auto-rotation for hands-free viewing
6. **Remove Items**: Use the "Remove Hat" or "Remove Shirt" buttons to go back
7. **Interact**: Click and drag to rotate, scroll to zoom, right-click and drag to pan

### Available Customizations

- **18 Fur Options**: OG, Red, Orange, Green, Blue, Pink, Purple, Tiger variants, Dots patterns, Robo styles, Zombie, Galaxy, Gold, and more
- **85+ Hat Options**: Beanies, Buckets, Crowns, Helmets, Wizard hats, Viking helmets, and many creative designs
- **79+ Shirt Options**: Sports jerseys, Business suits, Costumes, Robes, Space suits, and casual wear

## Browser Compatibility

This tool uses ES6 modules and modern JavaScript features. It works best in:
- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)

## Technical Details

- **Three.js**: 3D rendering and GLB loading
- **GLTFLoader**: Loads GLB/GLTF files
- **GLTFExporter**: Exports customized models
- **OrbitControls**: Interactive camera controls
- **Vanilla JavaScript**: No build step required, uses ES6 modules

## 📁 Project Structure

```
ottvatar/
├── index.html              # Main HTML file
├── styles.css              # Styling and theme
├── app.js                  # Main application logic (Three.js, GLB loading)
├── package.json            # Project metadata
├── netlify.toml            # Netlify deployment config
├── vercel.json             # Vercel deployment config
├── Otter_Master.glb        # Base otter 3D model
├── fishy-log.png.png       # Logo image
├── Selection Images/       # Preview thumbnails
│   ├── Furs/              # 18 fur preview images
│   ├── Hats/              # 85+ hat preview images
│   └── Shirt/             # 79+ shirt preview images
├── WEARABLES/             # 3D GLB model files
│   ├── Furs/              # 18 fur GLB files
│   ├── Hats/              # 85+ hat GLB files
│   └── Shirts/            # 79+ shirt GLB files
└── .github/
    └── workflows/
        └── pages.yml       # GitHub Pages deployment workflow
```

## 🛠️ Technical Details

- **Three.js v0.160.0**: 3D rendering and GLB/GLTF loading
- **GLTFLoader**: Loads GLB files from the WEARABLES directory
- **OrbitControls**: Interactive camera controls (rotate, zoom, pan)
- **ES6 Modules**: Modern JavaScript with import maps (no build step required)
- **Vanilla JavaScript**: No frameworks - pure, lightweight code
- **CDN Dependencies**: All libraries loaded via jsDelivr CDN

## 📝 Notes

- ✅ **100% Client-Side**: All processing happens in the browser - no server-side code required
- ✅ **Privacy-First**: Your GLB files never leave your device - everything runs locally
- ✅ **No Build Step**: Uses ES6 modules via CDN - works directly as static files
- ✅ **Free Hosting**: Deploy to Netlify, Vercel, or GitHub Pages for free
- ⚠️ Large GLB files may take a moment to load (especially on slower connections)
- ⚠️ All changes are applied in real-time with smooth transitions

## 🎯 Repository Topics

To add topics to your GitHub repository, go to the repository page and click the gear icon next to "About", then add these topics:

```
threejs, 3d, avatar, otter, glb, gltf, webgl, customization, 
interactive, three-js, 3d-model, avatar-builder, static-site
```

## 📄 License

MIT License - feel free to use this project for your own avatar customization needs!

## 🙏 Credits

Built with [Three.js](https://threejs.org/) - an amazing 3D library for the web.

