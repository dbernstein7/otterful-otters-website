/**
 * Smoke test: MMLOtter bones + Mixamo clip remapping (run: npx tsx scripts/test-rig-remap.mts).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { remapClipTracksToRig } from '../src/lib/clipRemap.ts';
import { resolveAttachmentObject } from '../src/lib/socketAttach.ts';

(globalThis as unknown as { self: unknown }).self = globalThis;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const hubRoot = path.resolve(__dirname, '..');

function parseGlb(file: string): Promise<{ scene: THREE.Object3D; animations: THREE.AnimationClip[] }> {
  const buf = fs.readFileSync(file);
  const loader = new GLTFLoader();
  return new Promise((resolve, reject) => {
    loader.parse(
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
      '',
      (gltf) => resolve({ scene: gltf.scene, animations: gltf.animations || [] }),
      reject
    );
  });
}

async function main() {
  const bodyPath = path.join(hubRoot, 'public/models/avatars/MMLOtter.glb');
  const jumpPath = path.join(hubRoot, 'public/models/animations/jump.glb');
  const { scene, animations: _a } = await parseGlb(bodyPath);
  const root = scene.clone(true);
  const { animations } = await parseGlb(jumpPath);
  const raw = animations[0];
  if (!raw) throw new Error('No clip in jump.glb');

  const remapped = remapClipTracksToRig(raw, root);
  const clip = remapped ?? raw;
  console.log('raw tracks', raw.tracks.length, '-> remapped', clip.tracks.length);

  for (const s of ['mixamorigSpine2', 'mixamorigHead', 'head', 'spine_04']) {
    const hit = resolveAttachmentObject(root, s);
    console.log('socket', s, '->', hit?.name ?? 'FAIL');
  }

  const mixer = new THREE.AnimationMixer(root);
  const action = mixer.clipAction(clip);
  action.play();
  for (let i = 0; i < 5; i++) mixer.update(1 / 30);
  const hips = root.getObjectByName('pelvis');
  console.log('pelvis y after 5 ticks', hips?.position.y);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
