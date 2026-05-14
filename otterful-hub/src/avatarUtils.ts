import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
loader.setCrossOrigin('anonymous');

/** Same-origin Mixamo clips used by Shell Snag (Vercel routes `/mixamo/*`). */
export function mixamoAssetUrl(file: string): string {
  const f = file.replace(/^\/+/, '');
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/mixamo/${f}`;
  }
  return `/mixamo/${f}`;
}

/** Otter rigs often have several SkinnedMeshes — pick the one that drives the main skeleton. */
export function findDominantSkinnedMesh(root: THREE.Object3D): THREE.SkinnedMesh | null {
  const list: THREE.SkinnedMesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) list.push(o as THREE.SkinnedMesh);
  });
  if (!list.length) return null;
  const score = (m: THREE.SkinnedMesh) => {
    const n = m.skeleton?.bones?.length ?? 0;
    const box = new THREE.Box3().setFromObject(m);
    const vol = box.isEmpty() ? 0 : box.getSize(new THREE.Vector3()).length();
    return n * 1000 + vol;
  };
  list.sort((a, b) => score(b) - score(a));
  return list[0];
}

export function fitAndGround(root: THREE.Object3D, targetHeight: number) {
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const max = Math.max(size.x, size.y, size.z, 1e-6);
  const s = targetHeight / max;
  root.scale.setScalar(s);
  root.updateMatrixWorld(true);
  const b2 = new THREE.Box3().setFromObject(root);
  root.position.y -= b2.min.y;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && mesh.material) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((mat) => {
        if (mat) (mat as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
      });
    }
  });
}

/** Reset exporter rotation/scale only (keep position — e.g. after bbox centering). */
export function resetWearableRotationScale(obj: THREE.Object3D) {
  obj.rotation.set(0, 0, 0);
  obj.scale.set(1, 1, 1);
  obj.updateMatrixWorld(true);
}

function socketNameVariants(socket: string): string[] {
  const s = socket.trim();
  const out = new Set<string>([s]);
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

function boneMatchesVariant(boneName: string, variant: string): boolean {
  if (boneName === variant) return true;
  if (boneName.toLowerCase() === variant.toLowerCase()) return true;
  const bn = boneName.replace(/:/g, '');
  const vn = variant.replace(/:/g, '');
  if (bn.toLowerCase() === vn.toLowerCase()) return true;
  return false;
}

function boneStem(name: string): string {
  return name
    .replace(/^mixamorig:?/i, '')
    .replace(/^def-/i, '')
    .replace(/:/g, '')
    .toLowerCase();
}

/** Find a bone for MML `socket="…"` across body SkinnedMeshes (Mixamo / short names + stem fallback). */
export function findBoneForSocket(bodyRoot: THREE.Object3D, socketName: string): THREE.Bone | null {
  const variants = socketNameVariants(socketName);
  const meshes: THREE.SkinnedMesh[] = [];
  bodyRoot.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(o as THREE.SkinnedMesh);
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

/**
 * Parent a wearable GLB to a body bone.
 * - Centers the loaded scene on its bbox (fixes huge exporter offsets → “floating” props).
 * - You do **not** need to strip rigs: skinned hats follow the bone; centering + correct bone fixes placement.
 */
export function attachWearableGltf(bodyModel: THREE.Object3D, socket: string, gltf: { scene: THREE.Object3D }): boolean {
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

function collectRigBoneNames(root: THREE.Object3D): Set<string> {
  const names = new Set<string>();
  root.traverse((o) => {
    const sm = o as THREE.SkinnedMesh;
    if (sm.isSkinnedMesh && sm.skeleton?.bones) {
      for (const b of sm.skeleton.bones) names.add(b.name);
    }
  });
  return names;
}

function clipTrackMatchesSkeleton(clip: THREE.AnimationClip, root: THREE.Object3D): number {
  const names = collectRigBoneNames(root);
  const stems = new Set<string>();
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

export function pickBestClipForRig(clips: THREE.AnimationClip[], root: THREE.Object3D): THREE.AnimationClip | null {
  if (!clips.length) return null;
  let best: THREE.AnimationClip | null = null;
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

function pickIdleClip(
  bodyAnimations: THREE.AnimationClip[],
  externalAnimGltf: { animations: THREE.AnimationClip[] } | null,
  modelRoot: THREE.Object3D
): THREE.AnimationClip | null {
  if (externalAnimGltf?.animations?.length) {
    const picked = pickBestClipForRig(externalAnimGltf.animations, modelRoot);
    if (picked && clipTrackMatchesSkeleton(picked, modelRoot) > 0) return picked;
  }
  if (bodyAnimations.length) {
    return pickBestClipForRig(bodyAnimations, modelRoot);
  }
  return null;
}

/**
 * Idle: MML `anim=` or embedded body clips, else site `/mixamo/idle-00.glb` (Shell Snag pipeline).
 * Walk / run: `/mixamo/walk.glb`, `/mixamo/run-medium.glb` — blended from movement in the canvas.
 */
export async function mountIdleWalkRun(
  mixer: THREE.AnimationMixer,
  modelRoot: THREE.Object3D,
  bodyAnimations: THREE.AnimationClip[],
  externalAnimGltf: { animations: THREE.AnimationClip[] } | null
): Promise<{
  idle: THREE.AnimationAction | null;
  walk: THREE.AnimationAction | null;
  run: THREE.AnimationAction | null;
}> {
  mixer.stopAllAction();

  let idleClip = pickIdleClip(bodyAnimations, externalAnimGltf, modelRoot);
  if (!idleClip) {
    try {
      const g = await loadGltf(mixamoAssetUrl('idle-00.glb'));
      idleClip = pickBestClipForRig(g.animations || [], modelRoot);
    } catch {
      idleClip = null;
    }
  }

  let idle: THREE.AnimationAction | null = null;
  if (idleClip) {
    idle = mixer.clipAction(idleClip);
    idle.reset().setEffectiveWeight(1).fadeIn(0.12).play();
  }

  let walk: THREE.AnimationAction | null = null;
  let run: THREE.AnimationAction | null = null;
  try {
    const wg = await loadGltf(mixamoAssetUrl('walk.glb'));
    const wc = pickBestClipForRig(wg.animations || [], modelRoot);
    if (wc) {
      walk = mixer.clipAction(wc);
      walk.reset().setEffectiveWeight(0).play();
    }
  } catch {
    walk = null;
  }
  try {
    const rg = await loadGltf(mixamoAssetUrl('run-medium.glb'));
    const rc = pickBestClipForRig(rg.animations || [], modelRoot);
    if (rc) {
      run = mixer.clipAction(rc);
      run.reset().setEffectiveWeight(0).play();
    }
  } catch {
    run = null;
  }

  return { idle, walk, run };
}

/** @deprecated prefer attachWearableGltf */
export function attachToBone(bodyRoot: THREE.Object3D, socketName: string, object3d: THREE.Object3D): boolean {
  object3d.position.set(0, 0, 0);
  resetWearableRotationScale(object3d);
  const bone = findBoneForSocket(bodyRoot, socketName);
  if (!bone) return false;
  bone.add(object3d);
  return true;
}

/**
 * Drive the body with at most ONE full-body clip at a time (no dual idle).
 * Prefer mountIdleWalkRun for the hub player.
 */
export function mountBodyPrimaryAnimation(
  mixer: THREE.AnimationMixer,
  modelRoot: THREE.Object3D,
  bodyAnimations: THREE.AnimationClip[],
  externalAnimGltf: { animations: THREE.AnimationClip[] } | null
): THREE.AnimationAction | null {
  mixer.stopAllAction();
  const clip = pickIdleClip(bodyAnimations, externalAnimGltf, modelRoot);
  if (clip) {
    const act = mixer.clipAction(clip);
    act.reset().setEffectiveWeight(1).fadeIn(0.15).play();
    return act;
  }
  return null;
}

export async function loadGltf(url: string) {
  return loader.loadAsync(url);
}
