import * as THREE from 'three';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js';
import * as SkeletonUtils from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/utils/SkeletonUtils.js';

const clipSel = document.getElementById('clip');
const slowBtn = document.getElementById('slow');
const clearBtn = document.getElementById('clear');
const errEl = document.getElementById('err');
const warnEl = document.getElementById('warn');
const canvas = document.getElementById('cv');
const stage = document.getElementById('stage');

const pageParams = new URLSearchParams(window.location.search);
const hideDupBodies = pageParams.get('hideDupBodies') === '1' || pageParams.get('hideDupBodies') === 'true';
const useLibrary = pageParams.get('library') !== '0' && pageParams.get('library') !== 'false';
const rawUrlParam = pageParams.get('url');

/** Epic / UE mannequin-style names → Mixamo mixamorig:* (donor clips). */
const EPIC_TO_MIXAMO_NAMES = {
  pelvis: 'mixamorig:Hips',
  spine_01: 'mixamorig:Spine',
  spine_02: 'mixamorig:Spine1',
  spine_03: 'mixamorig:Spine2',
  spine_04: 'mixamorig:Neck',
  spine_05: 'mixamorig:Head',
  neck_01: 'mixamorig:Neck',
  neck_02: 'mixamorig:Head',
  head: 'mixamorig:Head',
  clavicle_l: 'mixamorig:LeftShoulder',
  upperarm_l: 'mixamorig:LeftArm',
  lowerarm_l: 'mixamorig:LeftForeArm',
  hand_l: 'mixamorig:LeftHand',
  clavicle_r: 'mixamorig:RightShoulder',
  upperarm_r: 'mixamorig:RightArm',
  lowerarm_r: 'mixamorig:RightForeArm',
  hand_r: 'mixamorig:RightHand',
  thigh_l: 'mixamorig:LeftUpLeg',
  calf_l: 'mixamorig:LeftLeg',
  foot_l: 'mixamorig:LeftFoot',
  ball_l: 'mixamorig:LeftToeBase',
  thigh_r: 'mixamorig:RightUpLeg',
  calf_r: 'mixamorig:RightLeg',
  foot_r: 'mixamorig:RightFoot',
  ball_r: 'mixamorig:RightToeBase',
};

const LIBRARY_CLIPS = [
  { file: 'idle-00.glb', label: 'Library: Idle (retargeted)' },
  { file: 'walk.glb', label: 'Library: Walk (retargeted)' },
  { file: 'run-medium.glb', label: 'Library: Run (retargeted)' },
];

/** Vercel routes /mixamo/* → games/shell-snag/mixamo/; also try direct /games/… for static hosts. */
function donorUrlsForFile(file) {
  const origin = `${window.location.origin}/`;
  return [
    new URL(`mixamo/${file}`, origin).href,
    new URL(`games/shell-snag/mixamo/${file}`, origin).href,
  ];
}

function showErr(msg) {
  errEl.hidden = !msg;
  errEl.textContent = msg || '';
}

function showWarn(msg) {
  warnEl.hidden = !msg;
  warnEl.textContent = msg || '';
}

function triCount(mesh) {
  const g = mesh.geometry;
  if (!g) return 0;
  if (g.index) return Math.floor(g.index.count / 3);
  const pos = g.attributes && g.attributes.position;
  return pos ? Math.floor(pos.count / 3) : 0;
}

function collectSkinnedMeshStats(root) {
  const out = [];
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const box = new THREE.Box3().setFromObject(o);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const vol = Math.max(size.x * size.y * size.z, 1e-9);
    out.push({
      mesh: o,
      name: o.name || '(unnamed)',
      tris: triCount(o),
      volume: vol,
      center,
      size,
    });
  });
  return out;
}

const ACCESSORY_NAME_RE = /(hat|cap|beret|beanie|helmet|crown|shirt|jersey|tee|hoodie|jacket|coat|vest|sweater|eye|glass|goggle|mask|belt|shoe|boot|sock|necklace|watch|ring|earring|ear\b|accessory|prop|item|weapon|bag|backpack|scarf|tie|bow|glove|mitt)/i;

function analyzeDuplicateBodyRisk(stats) {
  if (stats.length < 2) return { risky: false, message: '' };
  const large = stats.filter((s) => s.tris >= 2500);
  if (large.length < 2) return { risky: false, message: '' };
  const byTris = [...large].sort((a, b) => b.tris - a.tris);
  const primary = byTris[0];
  const duplicates = [];
  for (let i = 1; i < byTris.length; i += 1) {
    const s = byTris[i];
    if (ACCESSORY_NAME_RE.test(s.name || '')) continue;
    const trRatio = s.tris / Math.max(primary.tris, 1);
    const volRatio = s.volume / Math.max(primary.volume, 1e-9);
    if (trRatio < 0.38 || volRatio < 0.42 || volRatio > 1.45) continue;
    const dist = primary.center.distanceTo(s.center);
    const span = Math.max(primary.size.length(), s.size.length(), 0.001);
    if (dist > span * 0.85) continue;
    duplicates.push(s);
  }
  if (!duplicates.length) return { risky: false, message: '' };
  if (hideDupBodies) {
    for (const s of duplicates) s.mesh.visible = false;
    return {
      risky: true,
      message: `Hid ${duplicates.length} duplicate-scale skinned mesh(es) (hideDupBodies=1).`,
    };
  }
  return {
    risky: true,
    message: 'Multiple large skinned bodies detected; pass hideDupBodies=1 to hide likely duplicates in this lab only.',
  };
}

function findLargestSkinnedMesh(root) {
  let best = null;
  let bestTri = 0;
  root.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const t = triCount(o);
    if (t > bestTri) {
      bestTri = t;
      best = o;
    }
  });
  return best;
}

function disposeGltf(gltf) {
  gltf.scene.traverse((o) => {
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
}

if (!rawUrlParam || !rawUrlParam.trim()) {
  showErr('Missing ?url= with an absolute https link to your body .glb.');
  throw new Error('no url');
}
let glbUrl = rawUrlParam.trim();
try {
  glbUrl = decodeURIComponent(glbUrl);
} catch (_) {
  /* ignore */
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
let mixerClipRoot = null;
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
  mixerClipRoot = null;
  if (!root) return;
  disposeGltf({ scene: root });
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
  const localRoot = mixerClipRoot && mixerClipRoot.isObject3D ? mixerClipRoot : root;
  currentAction = mixer.clipAction(clip, localRoot);
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

async function buildLibraryClips(targetMesh) {
  const out = [];
  let loadFailures = 0;
  for (const entry of LIBRARY_CLIPS) {
    const tryUrls = donorUrlsForFile(entry.file);
    let donorGltf = null;
    let lastErr = null;
    for (const donorUrl of tryUrls) {
      try {
        donorGltf = await loader.loadAsync(donorUrl);
        break;
      } catch (e) {
        lastErr = e;
        console.warn('[avatar-motion-lab] donor try failed', donorUrl, e);
      }
    }
    if (!donorGltf) {
      loadFailures += 1;
      if (lastErr) console.warn('[avatar-motion-lab] all donor URLs failed for', entry.file, lastErr);
      continue;
    }
    try {
      const donorMesh = findLargestSkinnedMesh(donorGltf.scene);
      const srcClip = donorGltf.animations && donorGltf.animations[0];
      if (!donorMesh || !donorMesh.skeleton || !srcClip) {
        disposeGltf(donorGltf);
        loadFailures += 1;
        continue;
      }
      donorGltf.scene.visible = false;
      scene.add(donorGltf.scene);
      let retargeted;
      try {
        retargeted = SkeletonUtils.retargetClip(targetMesh, donorMesh, srcClip, {
          hip: 'mixamorig:Hips',
          names: EPIC_TO_MIXAMO_NAMES,
          useFirstFramePosition: true,
          fps: 30,
        });
      } catch (e) {
        console.warn('[avatar-motion-lab] retarget failed', entry.file, e);
        retargeted = null;
      }
      scene.remove(donorGltf.scene);
      disposeGltf(donorGltf);
      if (retargeted && retargeted.tracks && retargeted.tracks.length) {
        retargeted.name = entry.label;
        out.push(retargeted);
      }
    } catch (e) {
      loadFailures += 1;
      console.warn('[avatar-motion-lab] donor processing failed', e);
    }
  }
  buildLibraryClips.lastLoadFailures = loadFailures;
  return out;
}

function fillClipUi(mixerBindingRoot) {
  clipSel.innerHTML = '';
  if (!clips.length) {
    const o = document.createElement('option');
    o.value = '';
    o.textContent = 'No clips';
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
  const bindRoot = mixerBindingRoot && mixerBindingRoot.isObject3D ? mixerBindingRoot : root;
  mixerClipRoot = bindRoot;
  mixer = new THREE.AnimationMixer(bindRoot);
  bindRoot.updateMatrixWorld(true);
  root.updateMatrixWorld(true);
  mixer.update(0);
  clipSel.selectedIndex = 1;
  onClipSelect();
}

loader.load(
  glbUrl,
  async (gltf) => {
    showErr('');
    showWarn('');
    disposeRoot();
    root = gltf.scene;
    scene.add(root);
    root.updateMatrixWorld(true);

    const stats = collectSkinnedMeshStats(root);
    const analysis = analyzeDuplicateBodyRisk(stats);
    showWarn(analysis.risky ? analysis.message : '');

    const box = new THREE.Box3().setFromObject(root);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 0.001);
    controls.target.copy(center);
    const dist = maxDim * 2.2;
    camera.position.set(center.x + dist * 0.45, center.y + maxDim * 0.35, center.z + dist);
    controls.update();

    const targetMesh = findLargestSkinnedMesh(root);
    if (!targetMesh || !targetMesh.skeleton) {
      showErr('No skinned mesh with a skeleton found in this GLB.');
      fillClipUi(root);
      return;
    }

    clips = [...(gltf.animations || [])];
    const nativeCount = clips.length;

    if (!nativeCount && useLibrary) {
      const lib = await buildLibraryClips(targetMesh);
      clips = lib;
      const failedLoads = buildLibraryClips.lastLoadFailures || 0;
      if (!clips.length) {
        const parts = [];
        if (analysis.risky) parts.push(analysis.message);
        if (failedLoads >= LIBRARY_CLIPS.length) {
          parts.push(
            `Could not load any motion-library GLBs. Try URLs under /mixamo/ or /games/shell-snag/mixamo/ on ${window.location.origin}/ (see vercel.json routes).`,
          );
        } else {
          parts.push(
            'Motion library retarget produced no usable tracks for this skeleton. '
            + 'Your rig may not match the built-in Epic→Mixamo map; embed clips in the GLB for MML.',
          );
        }
        showWarn(parts.filter(Boolean).join(' '));
      } else {
        showWarn(
          [analysis.risky ? analysis.message : null, `Loaded ${clips.length} retargeted clip(s) from Otterful’s Mixamo library (body had 0 embedded glTF animations).`]
            .filter(Boolean)
            .join(' '),
        );
      }
    } else if (!nativeCount && !useLibrary) {
      showWarn(
        [analysis.risky ? analysis.message : null, 'This file has no embedded animations and library=0 — nothing to play.']
          .filter(Boolean)
          .join(' '),
      );
    }

    const mixerBindingRoot = !nativeCount && clips.length ? targetMesh : root;
    fillClipUi(mixerBindingRoot);
  },
  undefined,
  (e) => {
    const base = e && e.message ? e.message : String(e);
    let msg = 'Could not load body GLB: ' + base;
    if (/DOCTYPE|not valid JSON|Unexpected token '<'/i.test(base)) {
      msg += ' — The URL may have returned HTML instead of a binary .glb.';
    }
    showErr(msg);
    showWarn('');
    clipSel.disabled = true;
    slowBtn.disabled = true;
    clearBtn.disabled = true;
  }
);
