/**
 * Embedded Three.js runner for Otterful 3D Builder: fetch MML HTML, load m-character + m-model GLBs, third-person WASD.
 */
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';

const gltfLoader = new GLTFLoader();
gltfLoader.setCrossOrigin('anonymous');

function resolveMmlAssetUrl(documentBaseUrl, ref) {
  const s = String(ref || '').trim();
  if (!s) return s;
  if (/^https?:\/\//i.test(s)) return s;
  try {
    return new URL(s, documentBaseUrl).href;
  } catch (_) {
    return s;
  }
}

/** `/api/mml` escapes `&` as `&amp;` in attributes — decode before fetching GLBs. */
function decodeHtmlAttributeValue(raw) {
  return String(raw)
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&');
}

function readMmlAttr(attrs, name) {
  const re = new RegExp(`(?:^|[\\s])${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i');
  const m = attrs.match(re);
  if (!m) return null;
  const inner = m[2].trim().replace(/\s+/g, ' ');
  return decodeHtmlAttributeValue(inner);
}

/**
 * Otterful MML: `<m-character>` + `<m-model>` (multiline-safe). Same rules as `otterful-hub/src/parseMml.ts`.
 * @param {string} html
 * @param {string} documentBaseUrl Absolute URL of the fetched MML document (resolves relative `src`).
 */
export function parseMmlHtml(html, documentBaseUrl) {
  const charOpen = html.match(/<\s*m-character\b([\s\S]*?)>/i);
  if (!charOpen) throw new Error('No <m-character> in MML document.');
  const attrBlock = charOpen[1];
  const bodyRaw = readMmlAttr(attrBlock, 'src');
  if (!bodyRaw) throw new Error('m-character has no src (body GLB).');
  const bodySrc = resolveMmlAssetUrl(documentBaseUrl, bodyRaw);
  const animRaw = readMmlAttr(attrBlock, 'anim');
  const animSrc = animRaw ? resolveMmlAssetUrl(documentBaseUrl, animRaw) : null;
  const wearables = [];
  const block = html.match(/<\s*m-character\b[\s\S]*?>([\s\S]*?)<\/\s*m-character\s*>/i);
  const inner = block ? block[1] : html;
  const modelRe = /<\s*m-model\b([\s\S]*?)(?:\/>|>[\s\S]*?<\/\s*m-model\s*>)/gi;
  let mm;
  while ((mm = modelRe.exec(inner))) {
    const a = mm[1];
    const socket = readMmlAttr(a, 'socket');
    const srcRaw = readMmlAttr(a, 'src');
    if (socket && srcRaw) {
      wearables.push({ socket: socket.trim(), src: resolveMmlAssetUrl(documentBaseUrl, srcRaw) });
    }
  }
  return { documentUrl: documentBaseUrl, bodySrc, animSrc, wearables };
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
    const vol = box.isEmpty() ? 0 : box.getSize(new THREE.Vector3()).length();
    return n * 1000 + vol;
  };
  list.sort((a, b) => score(b) - score(a));
  return list[0];
}

function socketNameVariants(socket) {
  const s = String(socket || '').trim();
  const out = new Set([s]);
  const noColon = s.replace(/mixamorig:/gi, 'mixamorig');
  if (noColon !== s) out.add(noColon);
  const m = s.match(/^mixamorig:([A-Za-z0-9_]+)$/i);
  if (m) out.add(`mixamorig${m[1]}`);
  const m2 = s.match(/^(mixamorig)([A-Z][a-zA-Z0-9_]+)$/);
  if (m2) out.add(`${m2[1]}:${m2[2]}`);
  const tail = s.replace(/^mixamorig:?/i, '');
  if (tail && tail !== s) {
    out.add(tail);
    out.add(`mixamorig${tail}`);
    out.add(`mixamorig:${tail}`);
    out.add(`mixamorig:${tail.charAt(0).toUpperCase()}${tail.slice(1)}`);
  }
  const tl = tail.toLowerCase();
  if (tl === 'head' || tl.endsWith('head')) {
    ['Head', 'mixamorigHead', 'mixamorig:Head', 'mixamorighead'].forEach((x) => out.add(x));
  }
  if (tl === 'spine2' || tl.endsWith('spine2')) {
    ['Spine2', 'mixamorigSpine2', 'mixamorig:Spine2', 'mixamorigspine2'].forEach((x) => out.add(x));
  }
  return [...out];
}

function boneMatchesVariant(boneName, variant) {
  if (boneName === variant) return true;
  if (boneName.toLowerCase() === variant.toLowerCase()) return true;
  const bn = boneName.replace(/:/g, '');
  const vn = variant.replace(/:/g, '');
  if (bn.toLowerCase() === vn.toLowerCase()) return true;
  return false;
}

function boneStem(name) {
  return String(name || '')
    .replace(/^mixamorig:?/i, '')
    .replace(/^def-/i, '')
    .replace(/:/g, '')
    .toLowerCase();
}

function findBoneForSocket(bodyRoot, socketName) {
  const variants = socketNameVariants(socketName);
  const meshes = [];
  bodyRoot.traverse((o) => {
    if (o.isSkinnedMesh) meshes.push(o);
  });
  meshes.sort((a, b) => (b.skeleton?.bones?.length ?? 0) - (a.skeleton?.bones?.length ?? 0));
  for (const sm of meshes) {
    const bones = sm.skeleton?.bones;
    if (!bones) continue;
    for (const variant of variants) {
      const bone = bones.find((b) => boneMatchesVariant(b.name, variant));
      if (bone) return bone;
    }
  }
  const dom = findDominantSkinnedMesh(bodyRoot);
  const stem = boneStem(socketName);
  if (dom?.skeleton?.bones && stem.length >= 3) {
    const bone = dom.skeleton.bones.find((b) => {
      const bs = boneStem(b.name);
      return bs === stem || bs.endsWith(stem) || stem.endsWith(bs);
    });
    if (bone) return bone;
  }
  return null;
}

function resetWearableRotationScale(obj) {
  obj.rotation.set(0, 0, 0);
  obj.scale.set(1, 1, 1);
  obj.updateMatrixWorld(true);
}

function attachWearableGltf(bodyModel, socket, gltf) {
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene);
  if (!box.isEmpty()) {
    const c = box.getCenter(new THREE.Vector3());
    scene.position.sub(c);
  }
  resetWearableRotationScale(scene);
  scene.updateMatrixWorld(true);
  const bone = findBoneForSocket(bodyModel, socket);
  if (!bone) return false;
  bone.add(scene);
  return true;
}

function collectRigBoneNames(root) {
  const names = new Set();
  root.traverse((o) => {
    if (o.isSkinnedMesh && o.skeleton?.bones) {
      for (const b of o.skeleton.bones) names.add(b.name);
    }
  });
  return names;
}

function clipTrackMatchesSkeleton(clip, root) {
  const names = collectRigBoneNames(root);
  const stems = new Set();
  names.forEach((n) => stems.add(boneStem(n)));
  let hits = 0;
  for (const tr of clip.tracks) {
    const dot = tr.name.indexOf('.');
    const prefix = dot >= 0 ? tr.name.slice(0, dot) : tr.name;
    if (names.has(prefix)) {
      hits++;
      continue;
    }
    const pst = boneStem(prefix);
    if (pst.length >= 2 && stems.has(pst)) {
      hits++;
      continue;
    }
    for (const s of stems) {
      if (s.length >= 2 && (pst === s || pst.endsWith(s) || s.endsWith(pst))) {
        hits++;
        break;
      }
    }
  }
  return hits;
}

function pickBestClipForRig(clips, root) {
  if (!clips.length) return null;
  let best = null;
  let bestScore = -1;
  for (const c of clips) {
    const s = clipTrackMatchesSkeleton(c, root);
    if (s > bestScore) {
      bestScore = s;
      best = c;
    }
  }
  if (bestScore > 0) return best;
  return clips[0];
}

function pickIdleClip(bodyAnimations, externalAnimGltf, modelRoot) {
  let clip = null;
  if (externalAnimGltf?.animations?.length) {
    const picked = pickBestClipForRig(externalAnimGltf.animations, modelRoot);
    if (picked && clipTrackMatchesSkeleton(picked, modelRoot) > 0) clip = picked;
  }
  if (!clip && bodyAnimations.length) {
    clip = pickBestClipForRig(bodyAnimations, modelRoot);
  }
  return clip;
}

function mountBodyPrimaryAnimation(mixer, modelRoot, bodyAnimations, externalAnimGltf) {
  mixer.stopAllAction();
  const clip = pickIdleClip(bodyAnimations, externalAnimGltf, modelRoot);
  if (clip) {
    const act = mixer.clipAction(clip);
    act.reset().setEffectiveWeight(1).fadeIn(0.15).play();
    return act;
  }
  return null;
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
  root.traverse((o) => {
    if (o.isMesh && o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((mat) => {
        if (mat) mat.side = THREE.DoubleSide;
      });
    }
  });
}

function loadGltf(url) {
  return new Promise((resolve, reject) => {
    gltfLoader.load(url, resolve, undefined, reject);
  });
}

/**
 * @param {{ container: HTMLElement; canvas: HTMLCanvasElement; hud: HTMLElement; getMmlUrl: () => string; getWalkUrl: () => string; onStatus: (s: string) => void }} opts
 */
export function mountOtterSpace(opts) {
  const { container, canvas, hud, getMmlUrl, getWalkUrl, onStatus } = opts;

  let running = false;
  let raf = 0;
  let resizeObserver = null;
  let renderer = null;
  let scene = null;
  let camera = null;
  let clock = null;
  let player = null;
  let mixer = null;
  let walkAction = null;
  let idleAction = null;
  const keys = {};
  let yaw = 0;
  let pitch = 0.28;
  const vel = new THREE.Vector3();
  const moveDir = new THREE.Vector3();
  const camOffset = new THREE.Vector3(0, 2.2, 4.8);
  const tmp = new THREE.Vector3();
  const camPos = new THREE.Vector3();
  let pointerLocked = false;
  let camInitialized = false;

  function setHud(text) {
    if (hud) hud.textContent = text;
  }

  function onKeyDown(e) {
    keys[e.code] = true;
    if (e.code === 'Escape' && document.pointerLockElement === canvas) document.exitPointerLock();
  }
  function onKeyUp(e) {
    keys[e.code] = false;
  }
  function onMouseMove(e) {
    if (!pointerLocked || !running) return;
    yaw -= e.movementX * 0.0022;
    pitch -= e.movementY * 0.0018;
    pitch = Math.max(0.08, Math.min(1.2, pitch));
  }
  function onPointerLockChange() {
    pointerLocked = document.pointerLockElement === canvas;
    setHud(
      pointerLocked
        ? 'WASD move · Shift sprint · Esc releases mouse'
        : 'Click the scene to grab the mouse and run around'
    );
  }
  function onCanvasClick() {
    if (!pointerLocked && running) canvas.requestPointerLock();
  }

  function cleanup() {
    running = false;
    cancelAnimationFrame(raf);
    if (resizeObserver) {
      try {
        resizeObserver.disconnect();
      } catch (_) {}
      resizeObserver = null;
    }
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('pointerlockchange', onPointerLockChange);
    canvas.removeEventListener('click', onCanvasClick);
    try {
      document.exitPointerLock();
    } catch (_) {}
    if (renderer) {
      renderer.dispose();
      if (renderer.domElement === canvas) renderer.forceContextLoss?.();
    }
    renderer = null;
    scene = null;
    camera = null;
    clock = null;
    player = null;
    mixer = null;
    walkAction = null;
    idleAction = null;
    camInitialized = false;
  }

  async function start() {
    cleanup();
    running = true;
    camInitialized = false;
    const mmlUrlRaw = String(getMmlUrl() || '').trim();
    if (!mmlUrlRaw) {
      onStatus('Set an MML document URL (https… or same-origin /mml/….mml).');
      running = false;
      return;
    }
    const mmlUrl = /^https?:\/\//i.test(mmlUrlRaw) ? mmlUrlRaw : new URL(mmlUrlRaw, window.location.href).href;
    onStatus('Fetching MML…');
    const res = await fetch(mmlUrl, { credentials: 'omit', mode: 'cors' });
    if (!res.ok) throw new Error(`MML fetch failed (${res.status})`);
    const html = await res.text();
    const parsed = parseMmlHtml(html, mmlUrl);
    onStatus('Loading GLBs…');

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x070d1a);
    scene.fog = new THREE.Fog(0x070d1a, 18, 95);

    camera = new THREE.PerspectiveCamera(55, 1, 0.08, 220);
    clock = new THREE.Clock();

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;

    scene.add(new THREE.HemisphereLight(0xb8c4ff, 0x1a1208, 0.55));
    const sun = new THREE.DirectionalLight(0xffffff, 0.95);
    sun.position.set(8, 22, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    scene.add(sun);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshStandardMaterial({ color: 0x152018, roughness: 0.92, metalness: 0.05 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    const grid = new THREE.GridHelper(120, 60, 0x2a4a38, 0x142018);
    grid.position.y = 0.01;
    scene.add(grid);

    player = new THREE.Group();
    player.position.set(0, 0, 0);
    scene.add(player);

    const bodyGltf = await loadGltf(parsed.bodySrc);
    const model = bodyGltf.scene;
    model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    fitAndGround(model, 2.1);
    model.updateMatrixWorld(true);
    player.add(model);

    for (const w of parsed.wearables) {
      try {
        const g = await loadGltf(w.src);
        g.scene.traverse((o) => {
          if (o.isMesh) o.castShadow = true;
        });
        if (!attachWearableGltf(model, w.socket, g)) {
          g.scene.position.set(0, 1.2, 0);
          player.add(g.scene);
        }
      } catch (_) {
        /* skip broken wearable */
      }
    }

    mixer = new THREE.AnimationMixer(model);
    let externalAnimGltf = null;
    if (parsed.animSrc) {
      try {
        externalAnimGltf = await loadGltf(parsed.animSrc);
      } catch (_) {
        externalAnimGltf = null;
      }
    }
    idleAction = mountBodyPrimaryAnimation(mixer, model, bodyGltf.animations || [], externalAnimGltf);
    if (!idleAction) {
      try {
        const mixIdle = `${window.location.origin}/mixamo/idle-00.glb`;
        const ig = await loadGltf(mixIdle);
        idleAction = mountBodyPrimaryAnimation(mixer, model, ig.animations || [], null);
      } catch (_) {
        /* no fallback idle */
      }
    }

    async function tryWalkClip(url) {
      if (!url || !mixer) return;
      try {
        const ag = await loadGltf(url);
        const clip = pickBestClipForRig(ag.animations || [], model);
        if (clip) {
          walkAction = mixer.clipAction(clip);
          walkAction.setEffectiveWeight(0);
          walkAction.play();
        }
      } catch (_) {
        /* clip may not retarget to this rig */
      }
    }

    const walkField = String(getWalkUrl() || '').trim();
    if (walkField) await tryWalkClip(new URL(walkField, window.location.origin).href);

    const resize = () => {
      if (!container || !renderer || !camera) return;
      const w = Math.max(2, container.clientWidth);
      const h = Math.max(320, container.clientHeight || 420);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    resize();
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('pointerlockchange', onPointerLockChange);
    canvas.addEventListener('click', onCanvasClick);

    setHud('Click the scene to grab the mouse and run around');
    onStatus('Ready — WASD. Idle: MML or /mixamo/idle-00.glb. Walk: walk URL field (/mixamo/walk.glb).');

    function tick() {
      if (!running) return;
      raf = requestAnimationFrame(tick);
      const dt = Math.min(clock.getDelta(), 0.08);
      const sprint = keys['ShiftLeft'] || keys['ShiftRight'];
      const speed = (sprint ? 9.5 : 5.2) * dt;
      moveDir.set(0, 0, 0);
      if (keys['KeyW'] || keys['KeyZ']) moveDir.z -= 1;
      if (keys['KeyS']) moveDir.z += 1;
      if (keys['KeyA'] || keys['KeyQ']) moveDir.x -= 1;
      if (keys['KeyD']) moveDir.x += 1;
      if (moveDir.lengthSq() > 0) {
        moveDir.normalize();
        moveDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
        vel.x = moveDir.x * speed;
        vel.z = moveDir.z * speed;
      } else {
        vel.x *= 0.82;
        vel.z *= 0.82;
      }
      player.position.x += vel.x;
      player.position.z += vel.z;
      player.rotation.y = yaw;

      const spd = Math.hypot(vel.x, vel.z) / Math.max(dt, 1e-6);
      if (walkAction && idleAction) {
        const t = Math.min(1, spd / 3);
        walkAction.setEffectiveWeight(t);
        idleAction.setEffectiveWeight(Math.max(0.05, 1 - t * 0.95));
      } else if (walkAction) {
        walkAction.setEffectiveWeight(Math.min(1, spd / 2.5));
      } else if (idleAction) {
        idleAction.setEffectiveWeight(1);
      }
      if (mixer) mixer.update(dt);

      tmp.copy(camOffset);
      tmp.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw + Math.PI);
      tmp.y += Math.sin(pitch) * 1.2;
      camPos.copy(player.position).add(tmp);
      if (!camInitialized) {
        camera.position.copy(camPos);
        camInitialized = true;
      } else {
        camera.position.lerp(camPos, 0.18);
      }
      camera.lookAt(player.position.x, player.position.y + 1.0, player.position.z);

      renderer.render(scene, camera);
    }
    tick();
  }

  return { start, dispose: cleanup };
}
