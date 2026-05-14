import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const loader = new GLTFLoader();

/** Otter rigs often have several SkinnedMeshes (body, face, etc.). Use the one that drives the skeleton. */
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

/** @deprecated use findDominantSkinnedMesh */
export function findMainSkinned(root: THREE.Object3D): THREE.SkinnedMesh | null {
  return findDominantSkinnedMesh(root);
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

/** Normalize wearable root so exporter offset does not fight socket transform. */
export function prepareWearableRoot(obj: THREE.Object3D) {
  obj.position.set(0, 0, 0);
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

/** Find a bone for MML `socket="…"` across all body SkinnedMeshes (Mixamo / short names). */
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
  return null;
}

export function attachToBone(bodyRoot: THREE.Object3D, socketName: string, object3d: THREE.Object3D): boolean {
  prepareWearableRoot(object3d);
  const bone = findBoneForSocket(bodyRoot, socketName);
  if (!bone) return false;
  bone.add(object3d);
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
  let hits = 0;
  for (const tr of clip.tracks) {
    const dot = tr.name.indexOf('.');
    const prefix = dot >= 0 ? tr.name.slice(0, dot) : tr.name;
    if (names.has(prefix)) hits++;
  }
  return hits;
}

/** Pick clip whose tracks best match this rig (avoid playing unrelated clips at weight 1). */
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

/**
 * Drive the body with at most ONE full-body clip at a time.
 * m-character `anim` replaces (not stacks with) embedded body idle when compatible.
 */
export function mountBodyPrimaryAnimation(
  mixer: THREE.AnimationMixer,
  modelRoot: THREE.Object3D,
  bodyAnimations: THREE.AnimationClip[],
  externalAnimGltf: { animations: THREE.AnimationClip[] } | null
): THREE.AnimationAction | null {
  mixer.stopAllAction();
  let clip: THREE.AnimationClip | null = null;

  if (externalAnimGltf?.animations?.length) {
    const picked = pickBestClipForRig(externalAnimGltf.animations, modelRoot);
    if (picked && clipTrackMatchesSkeleton(picked, modelRoot) > 0) {
      clip = picked;
    }
  }
  if (!clip && bodyAnimations.length) {
    clip = pickBestClipForRig(bodyAnimations, modelRoot);
  }

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
