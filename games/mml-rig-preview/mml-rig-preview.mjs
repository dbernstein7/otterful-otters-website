/**
 * Otterful MML rig preview — Three.js attachment matching AvatarBuilder (not viewer.mml.io).
 * viewer.mml.io parents each wearable GLB root to a socket; Otterful exports duplicate skeletons
 * at bind-pose offsets, so hats/shirts/eyes float. This loader extracts meshes, bakes transforms,
 * parents to body bones / root, and rebinds skinned shirts to the body skeleton when names match.
 */
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
loader.setCrossOrigin('anonymous');

const HEAD_ATTACH_POS = new THREE.Vector3(-0.607745, 0, 0.005627);
const HEAD_ATTACH_QUAT = new THREE.Quaternion(0, 0, -0.707107, 0.707107);

const SOCKET_HEAD_PREF = ['head', 'mixamorigHead', 'mixamorig:Head', 'neck_02', 'Head'];
const SOCKET_TORSO_PREF = [
  'spine_03',
  'spine_04',
  'mixamorigSpine2',
  'mixamorig:Spine2',
  'Spine2',
  'spine_05',
  'spine_02',
];

function decodeHtmlAttr(s) {
  return String(s || '')
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, '&')
    .trim();
}

export function parseMmlHtml(html, documentBaseUrl) {
  const charOpen = html.match(/<\s*m-character\b([\s\S]*?)>/i);
  if (!charOpen) throw new Error('No <m-character> in MML document.');
  const attrBlock = charOpen[1];
  const readAttr = (name) => {
    const re = new RegExp(`(?:^|[\\s])${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i');
    const m = attrBlock.match(re);
    return m ? decodeHtmlAttr(m[2]) : null;
  };
  const bodyRaw = readAttr('src');
  if (!bodyRaw) throw new Error('m-character has no src.');
  const resolve = (ref) => {
    const s = ref.trim();
    if (/^https?:\/\//i.test(s)) return s;
    return new URL(s, documentBaseUrl).href;
  };
  const bodySrc = resolve(bodyRaw);
  const animRaw = readAttr('anim');
  const animSrc = animRaw ? resolve(animRaw) : null;
  const yRaw = readAttr('y');
  const charY = yRaw != null && yRaw !== '' ? parseFloat(yRaw) : 0;

  const wearables = [];
  const block = html.match(/<\s*m-character\b[\s\S]*?>([\s\S]*?)<\/\s*m-character\s*>/i);
  const inner = block ? block[1] : html;
  const modelRe = /<\s*m-model\b([\s\S]*?)(?:\/>|>[\s\S]*?<\/\s*m-model\s*>)/gi;
  let mm;
  while ((mm = modelRe.exec(inner))) {
    const a = mm[1];
    const sockRe = /(?:^|[\s])socket\s*=\s*(["'])([\s\S]*?)\1/i;
    const srcRe = /(?:^|[\s])src\s*=\s*(["'])([\s\S]*?)\1/i;
    const sm = a.match(sockRe);
    const sr = a.match(srcRe);
    if (sm && sr) {
      wearables.push({
        socket: decodeHtmlAttr(sm[2]),
        src: resolve(decodeHtmlAttr(sr[2])),
      });
    }
  }
  return { bodySrc, animSrc, charY, wearables };
}

function wearablesKind(src) {
  const s = decodeURIComponent(String(src || '')).toLowerCase();
  if (/(^|\/|%2f)eyes(\/|%2f)/i.test(s)) return 'eyes';
  if (/(^|\/|%2f)shirts?(\/|%2f)/i.test(s)) return 'shirt';
  if (/(^|\/|%2f)hats?(\/|%2f)/i.test(s)) return 'hat';
  return 'other';
}

function findDominantSkinnedMesh(root) {
  const list = [];
  root.traverse((o) => {
    if (o.isSkinnedMesh) list.push(o);
  });
  if (!list.length) return null;
  const score = (m) => {
    const n = m.skeleton?.bones?.length ?? 0;
    const box = new THREE.Box3().setFromObject(m);
    return n * 1000 + (box.isEmpty() ? 0 : box.getSize(new THREE.Vector3()).length());
  };
  list.sort((a, b) => score(b) - score(a));
  return list[0];
}

function findBone(root, names) {
  const variants = Array.isArray(names) ? names : [names];
  const meshes = [];
  root.traverse((o) => {
    if (o.isSkinnedMesh) meshes.push(o);
  });
  for (const sm of meshes) {
    const bones = sm.skeleton?.bones;
    if (!bones) continue;
    for (const v of variants) {
      const bone = bones.find((b) => b.name === v || b.name.toLowerCase() === v.toLowerCase());
      if (bone) return bone;
    }
  }
  const dom = findDominantSkinnedMesh(root);
  if (!dom?.skeleton?.bones) return null;
  for (const v of variants) {
    const stem = v.replace(/^mixamorig:?/i, '').replace(/_/g, '').toLowerCase();
    const bone = dom.skeleton.bones.find((b) => {
      const bs = b.name.replace(/^mixamorig:?/i, '').replace(/_/g, '').toLowerCase();
      return bs === stem || bs.endsWith(stem) || stem.endsWith(bs);
    });
    if (bone) return bone;
  }
  return null;
}

function resolveSocketBone(bodyRoot, socket, src) {
  const kind = wearablesKind(src);
  if (kind === 'shirt') return null;
  const req = socket.trim();
  const hit = findBone(bodyRoot, [req]);
  if (hit) return hit;
  const pref = kind === 'eyes' || kind === 'hat' || /head/i.test(req) ? SOCKET_HEAD_PREF : SOCKET_TORSO_PREF;
  return findBone(bodyRoot, pref);
}

function extractMeshes(scene, kind) {
  const meshes = [];
  scene.traverse((child) => {
    if (!child.isMesh) return;
    const n = child.name.toLowerCase();
    if (kind === 'eyes') {
      meshes.push(child);
      return;
    }
    const isBodyPart =
      n.includes('body') ||
      n.includes('teeth') ||
      n.includes('tongue') ||
      n.includes('nose') ||
      n.includes('whisker') ||
      (n.includes('eye') && kind !== 'eyes');
    if (!isBodyPart) meshes.push(child);
  });
  return meshes;
}

function isCurveOrLine(obj) {
  return (
    obj.isLine ||
    obj.isLineSegments ||
    obj.type === 'Line' ||
    obj.type === 'LineSegments'
  );
}

function collectBodyMeshInfo(bodyRoot) {
  const names = new Set();
  const geos = new Map();
  bodyRoot.traverse((child) => {
    if (!child.isMesh) return;
    names.add(child.name);
    if (child.geometry?.attributes?.position) {
      const box = new THREE.Box3().setFromObject(child);
      geos.set(child.name, {
        vertexCount: child.geometry.attributes.position.count,
        size: box.getSize(new THREE.Vector3()),
      });
    }
  });
  return { names, geos };
}

/** Drop duplicate otter body / placeholders from shirt GLBs; keep fabric + attached objects/lines. */
function shouldDropShirtObject(child, bodyInfo) {
  const name = child.name.toLowerCase();
  const originalName = child.name;

  if (isCurveOrLine(child)) return false;

  const isPlaceholder =
    name.includes('cone') ||
    name.includes('geo') ||
    name.includes('sphere') ||
    name.includes('placeholder') ||
    name.includes('temp') ||
    originalName.includes('Cone') ||
    originalName.includes('Sphere') ||
    originalName.includes('Geo');

  const isHeadPart =
    name.includes('teeth') ||
    name.includes('tongue') ||
    name.includes('head') ||
    name.includes('mouth') ||
    name.includes('jaw') ||
    (name.includes('eye') && !name.includes('ear')) ||
    name.includes('nose') ||
    name.includes('whisker') ||
    name.includes('snout') ||
    name.includes('muzzle');

  let isConeOrSphere = false;
  if (child.geometry) {
    const gt = child.geometry.type;
    if (
      gt === 'ConeGeometry' ||
      gt === 'SphereGeometry' ||
      gt === 'ConeBufferGeometry' ||
      gt === 'SphereBufferGeometry'
    ) {
      isConeOrSphere = true;
    }
    try {
      const box = new THREE.Box3().setFromObject(child);
      const size = box.getSize(new THREE.Vector3());
      const maxSize = Math.max(size.x, size.y, size.z);
      if (maxSize < 0.1) {
        const round = Math.abs(size.x - size.z) < 0.05 && size.y < 0.1;
        if (round) isConeOrSphere = true;
      }
    } catch (_) {
      /* ignore */
    }
  }

  let isOtterBody = false;
  if (bodyInfo.names.has(child.name)) {
    const bodyGeo = bodyInfo.geos.get(child.name);
    if (bodyGeo && child.geometry?.attributes?.position) {
      const box = new THREE.Box3().setFromObject(child);
      const size = box.getSize(new THREE.Vector3());
      const vc = child.geometry.attributes.position.count;
      const vertexMatch = Math.abs(vc - bodyGeo.vertexCount) < 10;
      const sizeMatch =
        Math.abs(size.x - bodyGeo.size.x) < 0.01 &&
        Math.abs(size.y - bodyGeo.size.y) < 0.01 &&
        Math.abs(size.z - bodyGeo.size.z) < 0.01;
      isOtterBody = vertexMatch && sizeMatch;
    } else {
      isOtterBody = true;
    }
  }

  let isLargeBodyMesh = false;
  if (child.geometry?.attributes?.position) {
    try {
      const box = new THREE.Box3().setFromObject(child);
      const size = box.getSize(new THREE.Vector3());
      const isLarge = size.y > 0.6 || (size.x > 0.5 && size.z > 0.5 && size.y > 0.4);
      const isVeryLarge = size.y > 1.0 || (size.x > 0.8 && size.z > 0.8);
      const center = box.getCenter(new THREE.Vector3());
      const atCenter =
        Math.abs(center.y) < 0.5 && Math.abs(center.x) < 0.3 && Math.abs(center.z) < 0.3;
      if (isVeryLarge || (isLarge && atCenter)) isLargeBodyMesh = true;
    } catch (_) {
      /* ignore */
    }
  }

  return isPlaceholder || isConeOrSphere || isHeadPart || isOtterBody || isLargeBodyMesh;
}

/** Bake skinned shirt vertices to a static mesh (rebind / reparent without bones breaks fabric). */
function bakeSkinnedToStaticMesh(skinned) {
  skinned.skeleton?.update();
  skinned.updateMatrixWorld(true);
  const geometry = skinned.geometry.clone();
  const pos = geometry.attributes.position;
  const vertex = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    vertex.fromBufferAttribute(pos, i);
    skinned.applyBoneTransform(i, vertex);
    pos.setXYZ(i, vertex.x, vertex.y, vertex.z);
  }
  if (geometry.attributes.skinIndex) delete geometry.attributes.skinIndex;
  if (geometry.attributes.skinWeight) delete geometry.attributes.skinWeight;
  const mesh = new THREE.Mesh(geometry, skinned.material);
  mesh.name = skinned.name;
  return mesh;
}

function cloneShirtObject(src) {
  if (src.isSkinnedMesh) return bakeSkinnedToStaticMesh(src);
  if (isCurveOrLine(src)) return src.clone();
  if (!src.isMesh) return null;
  const geometry = src.geometry.clone();
  if (geometry.attributes.skinIndex) delete geometry.attributes.skinIndex;
  if (geometry.attributes.skinWeight) delete geometry.attributes.skinWeight;
  const mesh = new THREE.Mesh(geometry, src.material);
  mesh.name = src.name;
  return mesh;
}

function extractShirtParts(shirtScene, bodyRoot) {
  const bodyInfo = collectBodyMeshInfo(bodyRoot);
  const parts = [];
  shirtScene.traverse((child) => {
    if (!child.isMesh && !isCurveOrLine(child)) return;
    if (shouldDropShirtObject(child, bodyInfo)) return;
    parts.push(child);
  });
  return parts;
}

function bakePartsIntoGroup(parts, scene) {
  const group = new THREE.Group();
  scene.updateMatrixWorld(true);
  for (const src of parts) {
    const node = cloneShirtObject(src);
    if (!node) continue;
    const worldPos = new THREE.Vector3();
    const worldQuat = new THREE.Quaternion();
    const worldScale = new THREE.Vector3();
    src.getWorldPosition(worldPos);
    src.getWorldQuaternion(worldQuat);
    src.getWorldScale(worldScale);
    group.add(node);
    group.updateMatrixWorld(true);
    const lp = worldPos.clone();
    group.worldToLocal(lp);
    node.position.copy(lp);
    node.quaternion.copy(worldQuat);
    node.scale.copy(worldScale);
  }
  return group;
}

function bakeMeshesIntoGroup(meshes, scene) {
  return bakePartsIntoGroup(meshes, scene);
}

function buildShirtGroup(shirtScene, bodyRoot) {
  const parts = extractShirtParts(shirtScene, bodyRoot);
  return bakePartsIntoGroup(parts, shirtScene);
}

/** glTF PBR reads near-black without strong lights (Avatar Builder uses bright key + ambient). */
function prepareMeshMaterials(root) {
  root.traverse((o) => {
    if ((!o.isMesh && !isCurveOrLine(o)) || !o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const mat of mats) {
      if (!mat) continue;
      mat.side = THREE.DoubleSide;
      if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
      if (mat.emissiveMap) mat.emissiveMap.colorSpace = THREE.SRGBColorSpace;
      if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
        mat.metalness = Math.min(mat.metalness ?? 0, 0.25);
        mat.roughness = Math.max(0.35, Math.min(mat.roughness ?? 0.65, 0.92));
      }
    }
  });
}

function fitAndGround(root, targetHeight) {
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const max = Math.max(size.x, size.y, size.z, 1e-6);
  const s = targetHeight / max;
  root.scale.setScalar(s);
  root.updateMatrixWorld(true);
  const b2 = new THREE.Box3().setFromObject(root);
  root.position.y -= b2.min.y;
}

function loadGltf(url) {
  return loader.loadAsync(url);
}

/**
 * @param {{ container: HTMLElement; canvas: HTMLCanvasElement; getOrbitDistance?: () => number; onStatus?: (s: string) => void }} opts
 */
export function mountMmlRigPreview(opts) {
  const { container, canvas, getOrbitDistance, onStatus } = opts;
  let disposed = false;
  let raf = 0;
  let renderer = null;
  let scene = null;
  let camera = null;
  let clock = new THREE.Clock();
  let avatarRoot = null;
  let mixer = null;
  let orbitTheta = 0;
  let orbitPhi = 1.35;
  let orbitDist = 2.8;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  function setStatus(msg) {
    onStatus?.(msg || '');
  }

  function disposeAvatar() {
    if (mixer) mixer.stopAllAction();
    mixer = null;
    if (avatarRoot) {
      avatarRoot.traverse((o) => {
        if (o.geometry) o.geometry.dispose?.();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => m?.dispose?.());
      });
      scene.remove(avatarRoot);
      avatarRoot = null;
    }
  }

  function resize() {
    if (!renderer || !camera || !container) return;
    const w = Math.max(2, container.clientWidth);
    const h = Math.max(280, container.clientHeight || 400);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function updateCamera() {
    if (!camera || !avatarRoot) return;
    const d = getOrbitDistance?.() ?? orbitDist;
    const target = new THREE.Vector3(0, 1.0, 0);
    const x = d * Math.sin(orbitPhi) * Math.sin(orbitTheta);
    const y = d * Math.cos(orbitPhi);
    const z = d * Math.sin(orbitPhi) * Math.cos(orbitTheta);
    camera.position.set(target.x + x, target.y + y, target.z + z);
    camera.lookAt(target);
  }

  function tick() {
    if (disposed) return;
    raf = requestAnimationFrame(tick);
    const dt = Math.min(clock.getDelta(), 0.05);
    mixer?.update(dt);
    updateCamera();
    renderer?.render(scene, camera);
  }

  async function loadFromHtml(html, documentBaseUrl) {
    disposeAvatar();
    setStatus('Parsing MML…');
    const parsed = parseMmlHtml(html, documentBaseUrl || window.location.href);
    setStatus('Loading body…');
    const bodyGltf = await loadGltf(parsed.bodySrc);
    if (disposed) return;

    const body = bodyGltf.scene;
    /* No per-mesh shadows — cast+receive on skinned fur causes shadow acne (grid/moire), not low poly. */
    body.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = false;
        o.receiveShadow = false;
      }
    });
    prepareMeshMaterials(body);
    fitAndGround(body, 2.05);
    if (Number.isFinite(parsed.charY) && parsed.charY !== 0) {
      body.position.y += parsed.charY;
    }
    body.updateMatrixWorld(true);

    avatarRoot = new THREE.Group();
    avatarRoot.add(body);
    scene.add(avatarRoot);

    const logs = [];
    for (const w of parsed.wearables) {
      const kind = wearablesKind(w.src);
      try {
        const g = await loadGltf(w.src);
        if (disposed) return;
        let group;
        if (kind === 'shirt') {
          group = buildShirtGroup(g.scene, body);
          if (!group.children.length) {
            logs.push('shirt: no fabric/objects after filter');
            continue;
          }
          prepareMeshMaterials(group);
          body.add(group);
          logs.push(`shirt → body root (${group.children.length} part(s), static bake)`);
          continue;
        }

        const meshes = extractMeshes(g.scene, kind);
        if (!meshes.length) {
          logs.push(`${kind}: no meshes in GLB`);
          continue;
        }
        group = bakeMeshesIntoGroup(meshes, g.scene);
        prepareMeshMaterials(group);

        const bone = resolveSocketBone(body, w.socket, w.src);
        if (bone) {
          group.position.copy(HEAD_ATTACH_POS);
          group.quaternion.copy(HEAD_ATTACH_QUAT);
          bone.add(group);
          logs.push(`${kind} → bone ${bone.name}`);
        } else {
          body.add(group);
          logs.push(`${kind} → body root (bone "${w.socket}" not found)`);
        }
      } catch (e) {
        logs.push(`${kind} failed: ${e?.message || e}`);
      }
    }

    mixer = new THREE.AnimationMixer(body);
    let clip = null;
    if (parsed.animSrc) {
      try {
        const ag = await loadGltf(parsed.animSrc);
        clip = ag.animations?.[0] || null;
      } catch (_) {
        /* no external anim */
      }
    }
    if (!clip && bodyGltf.animations?.length) {
      clip = bodyGltf.animations[0];
    }
    if (clip) {
      const act = mixer.clipAction(clip);
      act.reset().play();
    }

    setStatus(
      logs.length
        ? `Otterful rig preview — ${logs.join('; ')}`
        : 'Otterful rig preview ready.'
    );
  }

  function initRenderer() {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = false;
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x5a7a9a);
    scene.fog = new THREE.Fog(0x7a9aba, 30, 72);
    camera = new THREE.PerspectiveCamera(52, 1, 0.05, 120);
    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    scene.add(new THREE.HemisphereLight(0xdce8ff, 0x4a4030, 0.5));
    const sun = new THREE.DirectionalLight(0xffffff, 2.5);
    sun.position.set(6, 14, 9);
    sun.castShadow = false;
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xffffff, 1.4);
    fill.position.set(-7, 5, -5);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffffff, 0.85);
    rim.position.set(0, 5, -12);
    scene.add(rim);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.MeshStandardMaterial({ color: 0x152018, roughness: 0.92 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = false;
    scene.add(ground);
    resize();
    tick();
  }

  const ro = new ResizeObserver(resize);
  ro.observe(container);

  canvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    orbitTheta -= (e.clientX - lastX) * 0.008;
    orbitPhi = Math.max(0.35, Math.min(1.55, orbitPhi + (e.clientY - lastY) * 0.006));
    lastX = e.clientX;
    lastY = e.clientY;
  });
  canvas.addEventListener('pointerup', () => {
    dragging = false;
  });
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      orbitDist = Math.max(1.2, Math.min(10, orbitDist + e.deltaY * 0.004));
    },
    { passive: false }
  );

  initRenderer();

  return {
    async show(html, documentBaseUrl) {
      try {
        await loadFromHtml(html, documentBaseUrl);
      } catch (e) {
        setStatus(e?.message || String(e));
        throw e;
      }
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      disposeAvatar();
      if (scene) {
        scene.traverse((o) => {
          if (o.geometry) o.geometry.dispose?.();
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => m?.dispose?.());
        });
        scene.clear();
      }
      renderer?.dispose();
      renderer = null;
    },
  };
}
