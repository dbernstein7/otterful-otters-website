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

function norm(name: string) {
  return name.replace(/:/g, '').toLowerCase();
}

function stem(name: string) {
  return norm(name).replace(/^mixamorig/i, '');
}

/**
 * When a logical socket (e.g. BackSocket) is missing on the rig, try **only** bones that make sense
 * for that region. A single global fallback list was wrong: it always matched mixamorigHead first,
 * so hand/back props parented to the head and disappeared inside the mesh.
 *
 * CHANGE: extend this map for your custom socket names.
 */
const SOCKET_FALLBACK_CHAINS: Record<string, string[]> = {
  headsocket: ['mixamorigHead', 'Head', 'head', 'mixamorigNeck', 'Neck'],
  facesocket: ['mixamorigHead', 'Head', 'mixamorigNeck'],
  chestsocket: ['mixamorigSpine2', 'Spine2', 'mixamorigSpine1', 'Spine1', 'mixamorigSpine', 'Spine'],
  backsocket: ['mixamorigSpine2', 'mixamorigSpine1', 'mixamorigSpine', 'Spine2', 'Spine1', 'Spine'],
  righthandsocket: ['mixamorigRightHand', 'mixamorigRightHandIndex1', 'RightHand', 'Hand_R', 'mixamorigRightArm'],
  lefthandsocket: ['mixamorigLeftHand', 'mixamorigLeftHandIndex1', 'LeftHand', 'Hand_L', 'mixamorigLeftArm'],
};

function fallbackChainForSocket(want: string): string[] {
  const k = norm(want);
  if (SOCKET_FALLBACK_CHAINS[k]) return [...SOCKET_FALLBACK_CHAINS[k]!];
  /* Generic: try exact stem on bones later via findBoneOnSkeleton only — no global head-first list */
  const s = stem(want);
  if (s.includes('head') || s.includes('hat')) return [...SOCKET_FALLBACK_CHAINS.headsocket!];
  if (s.includes('face') || s.includes('eye')) return [...SOCKET_FALLBACK_CHAINS.facesocket!];
  if (s.includes('chest') || s.includes('torso')) return [...SOCKET_FALLBACK_CHAINS.chestsocket!];
  if (s.includes('back') || s.includes('spine')) return [...SOCKET_FALLBACK_CHAINS.backsocket!];
  if (s.includes('right') && s.includes('hand')) return [...SOCKET_FALLBACK_CHAINS.righthandsocket!];
  if (s.includes('left') && s.includes('hand')) return [...SOCKET_FALLBACK_CHAINS.lefthandsocket!];
  return ['mixamorigHead', 'mixamorigSpine2', 'mixamorigHips'];
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

  const chain = fallbackChainForSocket(want);
  for (const fb of chain) {
    for (const sm of skinners) {
      const bones = sm.skeleton?.bones;
      if (!bones) continue;
      const b = findBoneOnSkeleton(bones, fb);
      if (b) {
        if (norm(fb) !== norm(want)) {
          console.warn(`[socketAttach] Socket "${want}" missing — using fallback bone "${b.name}".`);
        }
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

/** Center wearable on bbox and reset world rotation/scale baseline before local config (matches Otterful hub pattern). */
export function prepareWearableInstance(instance: THREE.Object3D) {
  instance.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(instance);
  if (!box.isEmpty()) {
    const c = box.getCenter(new THREE.Vector3());
    instance.position.sub(c);
  }
  instance.rotation.set(0, 0, 0);
  instance.scale.set(1, 1, 1);
  instance.updateMatrixWorld(true);
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
  prepareWearableInstance(instance);
  applyLocalTransform(instance, config);
  host.add(instance);

  return {
    detach: () => {
      host.remove(instance);
      disposeObject3D(instance);
    },
  };
}
