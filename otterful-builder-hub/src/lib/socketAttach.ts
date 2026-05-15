import * as THREE from 'three';

/**
 * Local transform applied to the wearable **after** it is parented to the resolved bone/empty.
 * CHANGE offsets here when tuning a new GLB.
 */
export type TransformConfig = {
  position?: [number, number, number];
  /** Euler radians RX, RY, RZ */
  rotation?: [number, number, number];
  scale?: number | [number, number, number];
};

/** When logical socket missing, try these bone / empty names in order (Mixamo + common Otterful names). */
const FALLBACK_NAMES = [
  'HeadSocket',
  'FaceSocket',
  'mixamorigHead',
  'Head',
  'head',
  'Neck',
  'mixamorigNeck',
  'ChestSocket',
  'mixamorigSpine2',
  'Spine2',
  'mixamorigSpine1',
  'BackSocket',
  'mixamorigSpine',
  'RightHandSocket',
  'mixamorigRightHand',
  'Hand_R',
  'LeftHandSocket',
  'mixamorigLeftHand',
  'Hand_L',
];

function norm(name: string) {
  return name.replace(/:/g, '').toLowerCase();
}

function stem(name: string) {
  return norm(name).replace(/^mixamorig/i, '');
}

function collectSkinnedMeshes(root: THREE.Object3D): THREE.SkinnedMesh[] {
  const out: THREE.SkinnedMesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) out.push(o as THREE.SkinnedMesh);
  });
  out.sort((a, b) => (b.skeleton?.bones?.length ?? 0) - (a.skeleton?.bones?.length ?? 0));
  return out;
}

function findBoneOnSkeleton(bones: THREE.Bone[], socketName: string): THREE.Bone | null {
  const want = socketName.trim();
  for (const b of bones) {
    if (b.name === want) return b;
  }
  const nw = norm(want);
  for (const b of bones) {
    if (norm(b.name) === nw) return b;
  }
  const ws = stem(want);
  for (const b of bones) {
    const bs = stem(b.name);
    if (bs === ws || bs.endsWith(ws) || ws.endsWith(bs)) return b;
  }
  return null;
}

/**
 * Resolve an Object3D to parent wearables under: named empties/groups first, then skinned bones.
 * CHANGE FALLBACK_NAMES / matching rules if your rig uses different naming.
 */
export function resolveAttachmentObject(avatarRoot: THREE.Object3D, socketName: string): THREE.Object3D | null {
  const want = socketName.trim();
  let emptyHit: THREE.Object3D | null = null;
  avatarRoot.traverse((o) => {
    if (emptyHit) return;
    if (o === avatarRoot) return;
    if (o.name === want || norm(o.name) === norm(want)) {
      emptyHit = o;
    }
  });
  if (emptyHit) return emptyHit;

  const skinners = collectSkinnedMeshes(avatarRoot);
  for (const sm of skinners) {
    const bones = sm.skeleton?.bones;
    if (!bones) continue;
    const b = findBoneOnSkeleton(bones, want);
    if (b) return b;
  }

  for (const fb of FALLBACK_NAMES) {
    if (norm(fb) === norm(want)) continue;
    for (const sm of skinners) {
      const bones = sm.skeleton?.bones;
      if (!bones) continue;
      const b = findBoneOnSkeleton(bones, fb);
      if (b) {
        console.warn(`[socketAttach] Socket "${want}" missing — using fallback "${b.name}".`);
        return b;
      }
    }
  }

  console.warn(`[socketAttach] Could not resolve socket "${want}" on avatar.`);
  return null;
}

export function applyLocalTransform(target: THREE.Object3D, config: TransformConfig) {
  if (config.position) target.position.set(config.position[0], config.position[1], config.position[2]);
  else target.position.set(0, 0, 0);
  if (config.rotation) target.rotation.set(config.rotation[0], config.rotation[1], config.rotation[2]);
  else target.rotation.set(0, 0, 0);
  if (config.scale != null) {
    if (typeof config.scale === 'number') target.scale.setScalar(config.scale);
    else target.scale.set(config.scale[0], config.scale[1], config.scale[2]);
  } else {
    target.scale.set(1, 1, 1);
  }
}

function disposeObject3D(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.geometry?.dispose();
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      mats.forEach((mat) => (mat as THREE.Material)?.dispose?.());
    }
  });
}

export type WearableAttachment = {
  detach: () => void;
};

/**
 * Parents `wearableRoot` clone under the resolved socket/bone with **local** offsets.
 * Do not position wearables in world space — always use this helper.
 */
export function attachWearableToSocket(
  avatarRoot: THREE.Object3D,
  wearableScene: THREE.Object3D,
  socketName: string,
  config: TransformConfig
): WearableAttachment | null {
  const host = resolveAttachmentObject(avatarRoot, socketName);
  if (!host) return null;

  const instance = wearableScene.clone(true);
  applyLocalTransform(instance, config);
  host.add(instance);

  return {
    detach: () => {
      host.remove(instance);
      disposeObject3D(instance);
    },
  };
}
