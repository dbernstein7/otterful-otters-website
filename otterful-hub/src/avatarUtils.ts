import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const loader = new GLTFLoader();

export function findMainSkinned(root: THREE.Object3D): THREE.SkinnedMesh | null {
  let found: THREE.SkinnedMesh | null = null;
  root.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh && !found) found = o as THREE.SkinnedMesh;
  });
  return found;
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

export function attachToBone(rootSkinned: THREE.Object3D, boneName: string, object3d: THREE.Object3D): boolean {
  const skinned = findMainSkinned(rootSkinned);
  if (!skinned || !skinned.skeleton) return false;
  const bone = skinned.skeleton.bones.find((b) => b.name === boneName);
  if (!bone) return false;
  bone.add(object3d);
  return true;
}

export async function loadGltf(url: string) {
  return loader.loadAsync(url);
}
