import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js';

const clipSel = document.getElementById('clip');
const slowBtn = document.getElementById('slow');
const clearBtn = document.getElementById('clear');
const pngBtn = document.getElementById('png');
const errEl = document.getElementById('err');
const warnEl = document.getElementById('warn');
const canvas = document.getElementById('cv');
const stage = document.getElementById('stage');

const pageParams = new URLSearchParams(window.location.search);
const hideDupBodies = pageParams.get('hideDupBodies') === '1' || pageParams.get('hideDupBodies') === 'true';
const rawUrlParam = pageParams.get('url');

function showErr(msg) {
  errEl.hidden = !msg;
  errEl.textContent = msg || '';
}

function showWarn(msg) {
  warnEl.hidden = !msg;
  warnEl.textContent = msg || '';
}

/** Names that usually indicate a real wearable, not a second full body. */
const ACCESSORY_NAME_RE = /(hat|cap|beret|beanie|helmet|crown|shirt|jersey|tee|hoodie|jacket|coat|vest|sweater|eye|glass|goggle|mask|belt|shoe|boot|sock|necklace|watch|ring|earring|ear\b|accessory|prop|item|weapon|bag|backpack|scarf|tie|bow|glove|mitt)/i;

function triCount(mesh) {
  const g = mesh.geometry;
  if (!g) return 0;
  if (g.index) return Math.floor(g.index.count / 3);
  const pos = g.attributes && g.attributes.position;
  return pos ? Math.floor(pos.count / 3) : 0;
}

/**
 * Collect skinned meshes with world-space AABB stats after scene graph is live.
 * @param {THREE.Object3D} root
 */
function collectSkinnedMeshStats(root) {
  const out = [];
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const box = new THREE.Box3().setFromObject(o);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const vol = Math.max(size.x * size.y * size.z, 1e-9);
    const tc = triCount(o);
    out.push({
      mesh: o,
      name: o.name || '(unnamed)',
      tris: tc,
      volume: vol,
      center,
      size,
      looksAccessory: ACCESSORY_NAME_RE.test(o.name || ''),
    });
  });
  return out;
}

function countDistinctSkeletons(root) {
  const set = new Set();
  root.traverse((o) => {
    if (o.isSkinnedMesh && o.skeleton) set.add(o.skeleton.uuid);
  });
  return set.size;
}

function logAssetAnalysis(gltf, stats, analysis) {
  const clips = (gltf.animations && gltf.animations.length) || 0;
  console.info('[glb-anim-preview] GLB summary', {
    url: glbUrl,
    clips,
    skinnedMeshes: stats.length,
    distinctSkeletons: countDistinctSkeletons(gltf.scene),
    hideDupBodies,
    duplicateBodyHeuristic: analysis.risky,
  });
  if (analysis.risky) console.warn('[glb-anim-preview]', analysis.message);
}

function analyzeDuplicateBodyRisk(stats, root) {
  if (stats.length < 2) {
    return { risky: false, pairs: [], message: '', hiddenMeshes: [], extraNote: '' };
  }
  const large = stats.filter((s) => s.tris >= 2500);
  if (large.length < 2) {
    const skels = countDistinctSkeletons(root);
    if (skels >= 2 && stats.length >= 2) {
      return {
        risky: true,
        pairs: [],
        message:
          `This GLB has ${skels} distinct skeletons and ${stats.length} skinned mesh(es). `
          + 'Merged or "reference otter + wearable" exports often confuse MML (stacked bodies, wrong binds). '
          + 'Prefer one skeleton on the body GLB and accessory-only meshes for hats/shirts.',
        hiddenMeshes: [],
        extraNote: '',
      };
    }
    return { risky: false, pairs: [], message: '', hiddenMeshes: [], extraNote: '' };
  }
  const byTris = [...large].sort((a, b) => b.tris - a.tris);
  const primary = byTris[0];
  const duplicates = [];
  for (let i = 1; i < byTris.length; i += 1) {
    const s = byTris[i];
    if (s.looksAccessory) continue;
    const trRatio = s.tris / Math.max(primary.tris, 1);
    const volRatio = s.volume / Math.max(primary.volume, 1e-9);
    if (trRatio < 0.38 || volRatio < 0.42 || volRatio > 1.45) continue;
    const dist = primary.center.distanceTo(s.center);
    const span = Math.max(primary.size.length(), s.size.length(), 0.001);
    if (dist > span * 0.85) continue;
    duplicates.push({ primary, dup: s });
  }
  if (!duplicates.length) {
    return { risky: false, pairs: [], message: '', hiddenMeshes: [], extraNote: '' };
  }
  const names = duplicates.map((p) => `"${p.dup.name}" (${p.dup.tris.toLocaleString()} tris)`).join(', ');
  let message =
    'This GLB looks like it contains more than one large character-scale skinned mesh (not named like a hat/shirt/eyes). '
    + 'That breaks MML stacking (body + hat + shirt each load another full otter). '
    + `Suspected duplicate mesh(es): ${names}. Re-export wearables as accessory-only GLBs parented to the shared rig.`;
  const hiddenMeshes = [];
  if (hideDupBodies) {
    for (const p of duplicates) {
      p.dup.mesh.visible = false;
      hiddenMeshes.push(p.dup.name);
    }
    message += ` For this preview only, hid ${hiddenMeshes.length} duplicate-scale mesh(es). Open this page without hideDupBodies=1 to see the raw file.`;
  }
  return { risky: true, pairs: duplicates, message, hiddenMeshes, extraNote: '' };
}

const raw = rawUrlParam;
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

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  preserveDrawingBuffer: true,
});
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

function safeFilenameBaseFromGlbUrl(url) {
  try {
    const u = new URL(url);
    const seg = u.pathname.split('/').filter(Boolean).pop() || 'model';
    const base = seg.replace(/\.glb$/i, '');
    const cleaned = base.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '');
    return (cleaned || 'otterful-preview').slice(0, 56);
  } catch (_) {
    return 'otterful-preview';
  }
}

/** Directory URL (trailing slash) for resolving relative texture/bin paths inside GLBs. */
function glbResourceBase(url) {
  try {
    const u = new URL(url);
    const href = u.href;
    const i = href.lastIndexOf('/');
    return i === -1 ? '' : href.slice(0, i + 1);
  } catch (_) {
    return '';
  }
}

function isBinaryGlbMagic(buf) {
  if (!buf || buf.byteLength < 12) return false;
  const magic = new DataView(buf).getUint32(0, true);
  /* Little-endian "glTF" at byte 0 */
  return magic === 0x46546c67;
}

/**
 * Three.js r160 GLTFBinaryExtension advances chunk offsets by 8 + chunkLength only,
 * without the glTF-Binary spec's 4-byte padding between chunks. If a chunk length
 * is not a multiple of 4, the BIN chunk is misread, binary buffer stays null, and
 * texture bufferViews throw "Cannot read properties of null (reading 'slice')".
 * This rebuilds the container so each chunk's declared length includes trailing
 * pad bytes (0x20), matching what Three's parser expects.
 * @param {ArrayBuffer} ab
 * @returns {ArrayBuffer}
 */
function normalizeGlbChunkPaddingForThree(ab) {
  const u8 = new Uint8Array(ab);
  if (u8.byteLength < 12) return ab;
  if (u8[0] !== 0x67 || u8[1] !== 0x6c || u8[2] !== 0x54 || u8[3] !== 0x46) return ab;
  const dv = new DataView(ab);
  const declared = dv.getUint32(8, true);
  const end = Math.min(ab.byteLength, declared);
  let p = 12;
  const chunks = [];
  while (p + 8 <= end) {
    const chunkLen = dv.getUint32(p, true);
    const chunkType = dv.getUint32(p + 4, true);
    if (chunkLen < 0 || chunkLen > end || p + 8 + chunkLen > ab.byteLength) break;
    chunks.push({ type: chunkType, data: ab.slice(p + 8, p + 8 + chunkLen) });
    p += 8 + chunkLen;
    p += (4 - (chunkLen % 4)) % 4;
  }
  if (chunks.length === 0) return ab;
  if (chunks.every((c) => (c.data.byteLength % 4) === 0)) return ab;
  let outSize = 12;
  for (let i = 0; i < chunks.length; i += 1) {
    const pad = (4 - (chunks[i].data.byteLength % 4)) % 4;
    outSize += 8 + chunks[i].data.byteLength + pad;
  }
  const out = new ArrayBuffer(outSize);
  new Uint8Array(out, 0, 12).set(u8.subarray(0, 12));
  const outDv = new DataView(out);
  outDv.setUint32(8, outSize, true);
  let o = 12;
  for (let i = 0; i < chunks.length; i += 1) {
    const { type, data } = chunks[i];
    const pad = (4 - (data.byteLength % 4)) % 4;
    const paddedLen = data.byteLength + pad;
    outDv.setUint32(o, paddedLen, true);
    outDv.setUint32(o + 4, type, true);
    new Uint8Array(out, o + 8, data.byteLength).set(new Uint8Array(data));
    for (let j = 0; j < pad; j += 1) new Uint8Array(out)[o + 8 + data.byteLength + j] = 0x20;
    o += 8 + paddedLen;
  }
  return out;
}

if (pngBtn) {
  pngBtn.addEventListener('click', () => {
    if (!root) return;
    controls.update();
    renderer.render(scene, camera);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          showWarn('PNG capture failed — try another browser or disable privacy extensions.');
          return;
        }
        const name = `${safeFilenameBaseFromGlbUrl(glbUrl)}-${Date.now()}.png`;
        const a = document.createElement('a');
        const url = URL.createObjectURL(blob);
        a.href = url;
        a.download = name;
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      },
      'image/png',
      0.92
    );
  });
}

const loader = new GLTFLoader();
loader.setCrossOrigin('anonymous');

function onGltfLoaded(gltf) {
  showErr('');
  showWarn('');
  disposeRoot();
  root = gltf.scene;
  scene.add(root);
  root.updateMatrixWorld(true);
  const stats = collectSkinnedMeshStats(root);
  const analysis = analyzeDuplicateBodyRisk(stats, root);
  showWarn(analysis.risky ? analysis.message : '');
  logAssetAnalysis(gltf, stats, analysis);

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
    const noClipMsg =
      'This GLB lists 0 glTF animations (nothing to play). Re-export with clips included (e.g. Blender glTF: NLA / active actions), '
      + 'or use a separate movement file if your host supports anim="…" on the character element.';
    showWarn([analysis.risky ? analysis.message : '', noClipMsg].filter(Boolean).join(' '));
    if (pngBtn) pngBtn.disabled = false;
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
  if (pngBtn) pngBtn.disabled = false;

  mixer = new THREE.AnimationMixer(root);
  root.updateMatrixWorld(true);
  mixer.update(0);
  clipSel.selectedIndex = 1;
  onClipSelect();
}

function onGltfError(e) {
  const base = e && e.message ? e.message : String(e);
  let msg = 'Could not load GLB: ' + base;
  if (/DOCTYPE|not valid JSON|Unexpected token '<'/i.test(base)) {
    msg +=
      ' — The URL probably returned an HTML page (404 or SPA shell) instead of a binary .glb. '
      + 'If this is /mml/… on Vercel, deploy those GLB files or host them (e.g. Firebase) and set WEARABLE_ASSET_ORIGIN if needed.';
  }
  showErr(msg);
  showWarn('');
  clipSel.disabled = true;
  slowBtn.disabled = true;
  clearBtn.disabled = true;
  if (pngBtn) pngBtn.disabled = true;
}

(async function loadGlbFromUrl() {
  try {
    const res = await fetch(glbUrl, { method: 'GET', mode: 'cors', credentials: 'omit' });
    if (!res.ok) {
      onGltfError(new Error(`HTTP ${res.status} ${(res.statusText || '').trim()}`.trim()));
      return;
    }
    const buf = await res.arrayBuffer();
    if (!buf.byteLength) {
      onGltfError(new Error('empty response body'));
      return;
    }
    const ctype = (res.headers.get('content-type') || '').toLowerCase();
    if (ctype.includes('text/html') || ctype.includes('application/json')) {
      onGltfError(
        new Error(
          `server returned ${ctype || 'unknown'} instead of a GLB (HTML page, JSON API, or proxy error)`
        )
      );
      return;
    }
    if (!isBinaryGlbMagic(buf)) {
      onGltfError(
        new Error(
          'response is not a valid GLB (missing glTF magic bytes) — wrong file, HTML shell, or truncated download'
        )
      );
      return;
    }
    const resourcePath = glbResourceBase(glbUrl);
    if (resourcePath) loader.setResourcePath(resourcePath);
    let parseBuf = buf;
    try {
      parseBuf = normalizeGlbChunkPaddingForThree(buf);
    } catch (_) {
      parseBuf = buf;
    }
    loader.parse(
      parseBuf,
      resourcePath,
      onGltfLoaded,
      onGltfError
    );
  } catch (err) {
    onGltfError(err);
  }
})();
