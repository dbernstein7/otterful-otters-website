import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js';

const clipSel = document.getElementById('clip');
const slowBtn = document.getElementById('slow');
const clearBtn = document.getElementById('clear');
const errEl = document.getElementById('err');
const canvas = document.getElementById('cv');
const stage = document.getElementById('stage');

function showErr(msg) {
  errEl.hidden = !msg;
  errEl.textContent = msg || '';
}

const raw = new URLSearchParams(window.location.search).get('url');
if (!raw || !raw.trim()) {
  showErr('Missing ?url= with an absolute https link to a .glb file.');
  throw new Error('no url');
}
let glbUrl = raw.trim();
try {
  glbUrl = decodeURIComponent(glbUrl);
} catch (_) {
  /* URLSearchParams already decoded */
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a22);

const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 500);
camera.position.set(0, 1.35, 2.8);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

const hemi = new THREE.HemisphereLight(0xffffff, 0x223344, 0.85);
scene.add(hemi);
const dir = new THREE.DirectionalLight(0xffffff, 1.1);
dir.position.set(3, 6, 4);
scene.add(dir);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.9, 0);
controls.update();

const grid = new THREE.GridHelper(8, 16, 0x444466, 0x333344);
grid.position.y = 0;
scene.add(grid);

let root = null;
let mixer = null;
let clips = [];
let currentAction = null;
let slow = false;

function setSize() {
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  camera.aspect = w / Math.max(h, 1);
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}
setSize();
window.addEventListener('resize', setSize);
if (typeof ResizeObserver !== 'undefined') {
  const ro = new ResizeObserver(() => setSize());
  ro.observe(stage);
}

const clock = new THREE.Clock();
function tick() {
  requestAnimationFrame(tick);
  const dt = clock.getDelta();
  if (mixer) mixer.update(dt);
  controls.update();
  renderer.render(scene, camera);
}
tick();

function disposeRoot() {
  if (mixer) {
    mixer.stopAllAction();
    mixer = null;
  }
  currentAction = null;
  if (!root) return;
  root.traverse((o) => {
    if (o.isMesh) {
      o.geometry?.dispose?.();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => {
        if (!m) return;
        Object.keys(m).forEach((k) => {
          const v = m[k];
          if (v && typeof v.dispose === 'function') v.dispose();
        });
        m.dispose?.();
      });
    }
  });
  scene.remove(root);
  root = null;
}

function stopAll() {
  if (mixer) {
    mixer.stopAllAction();
    mixer.update(0);
  }
  currentAction = null;
}

function playClipByIndex(index) {
  stopAll();
  const clip = clips[index];
  if (!clip || !mixer || !root) return;
  currentAction = mixer.clipAction(clip, root);
  currentAction.reset();
  currentAction.setLoop(THREE.LoopRepeat, Infinity);
  currentAction.clampWhenFinished = false;
  currentAction.timeScale = slow ? 0.35 : 1;
  currentAction.play();
}

function onClipSelect() {
  const v = clipSel.value;
  if (v === '') return;
  const idx = parseInt(v, 10);
  if (!Number.isFinite(idx) || idx < 0 || idx >= clips.length) return;
  playClipByIndex(idx);
}
clipSel.addEventListener('change', onClipSelect);
clipSel.addEventListener('input', onClipSelect);

slowBtn.addEventListener('click', () => {
  slow = !slow;
  slowBtn.classList.toggle('is-on', slow);
  slowBtn.textContent = slow ? 'Normal speed' : 'Slow motion';
  if (currentAction) currentAction.timeScale = slow ? 0.35 : 1;
});

clearBtn.addEventListener('click', () => {
  stopAll();
  clipSel.value = '';
});

const loader = new GLTFLoader();
loader.load(
  glbUrl,
  (gltf) => {
    showErr('');
    disposeRoot();
    root = gltf.scene;
    scene.add(root);

    const box = new THREE.Box3().setFromObject(root);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 0.001);
    controls.target.copy(center);
    const dist = maxDim * 2.2;
    camera.position.set(center.x + dist * 0.45, center.y + maxDim * 0.35, center.z + dist);
    controls.update();

    clips = gltf.animations || [];
    clipSel.innerHTML = '';
    if (!clips.length) {
      const o = document.createElement('option');
      o.value = '';
      o.textContent = 'No clips in this GLB';
      clipSel.appendChild(o);
      clipSel.disabled = true;
      slowBtn.disabled = true;
      clearBtn.disabled = true;
      return;
    }
    const ph = document.createElement('option');
    ph.value = '';
    ph.textContent = 'Select animation…';
    clipSel.appendChild(ph);
    clips.forEach((c, i) => {
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = c.name || `Clip ${i + 1}`;
      clipSel.appendChild(o);
    });
    clipSel.disabled = false;
    slowBtn.disabled = false;
    clearBtn.disabled = false;

    mixer = new THREE.AnimationMixer(root);
    root.updateMatrixWorld(true);
    mixer.update(0);
    clipSel.selectedIndex = 1;
    onClipSelect();
  },
  undefined,
  (e) => {
    showErr('Could not load GLB: ' + (e && e.message ? e.message : String(e)));
    clipSel.disabled = true;
    slowBtn.disabled = true;
    clearBtn.disabled = true;
  }
);
