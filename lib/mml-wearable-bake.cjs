/**
 * Bake Otterful wearable GLBs into MML-ready accessory files: mesh only, transforms
 * relative to the socket bone so viewer.mml.io / Otherside attach the origin correctly.
 */
if (typeof globalThis.self === 'undefined') globalThis.self = globalThis;
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class FileReader {
    readAsArrayBuffer(blob) {
      Promise.resolve(blob.arrayBuffer()).then((buf) => {
        if (this.onload) this.onload({ target: { result: buf } });
      });
    }
  };
}
if (typeof globalThis.Blob === 'undefined') {
  globalThis.Blob = require('buffer').Blob;
}

const THREE = require('three');
const { GLTFLoader } = require('three/examples/jsm/loaders/GLTFLoader.js');
const { GLTFExporter } = require('three/examples/jsm/exporters/GLTFExporter.js');

const SOCKET_BONES = {
  hat: ['head', 'mixamorigHead', 'mixamorig:Head', 'neck_02', 'Head'],
  eyes: ['head', 'mixamorigHead', 'mixamorig:Head', 'neck_02', 'Head'],
  shirt: ['spine_03', 'spine_04', 'mixamorigSpine2', 'mixamorig:Spine2', 'Spine2', 'spine_02'],
};

function findSocketBone(root, kind) {
  const names = SOCKET_BONES[kind] || SOCKET_BONES.hat;
  let found = null;
  root.traverse((o) => {
    if (found || !o.isBone) return;
    const n = o.name;
    const lower = n.toLowerCase();
    for (const v of names) {
      if (n === v || lower === v.toLowerCase()) {
        found = o;
        return;
      }
    }
    const stem = lower.replace(/^mixamorig:?/i, '').replace(/_/g, '');
    for (const v of names) {
      const vs = v.toLowerCase().replace(/^mixamorig:?/i, '').replace(/_/g, '');
      if (stem === vs || stem.endsWith(vs)) {
        found = o;
        return;
      }
    }
  });
  return found;
}

function isCurveOrLine(obj) {
  return obj.isLine || obj.isLineSegments || obj.type === 'Line' || obj.type === 'LineSegments';
}

function shouldDropMesh(child, kind) {
  const name = child.name.toLowerCase();
  if (kind === 'eyes') return false;
  if (isCurveOrLine(child)) return false;
  return (
    (name.includes('body') && !name.includes('shirt') && !name.includes('jersey')) ||
    name.includes('teeth') ||
    name.includes('tongue') ||
    name.includes('nose') ||
    name.includes('whisker') ||
    (name.includes('eye') && kind !== 'eyes') ||
    name.includes('cone') ||
    name.includes('sphere') ||
    /^mesh_0001/i.test(name)
  );
}

function bakeSkinnedToStatic(skinned) {
  skinned.skeleton?.update();
  skinned.updateMatrixWorld(true);
  const geometry = skinned.geometry.clone();
  const vertex = new THREE.Vector3();
  for (let i = 0; i < geometry.attributes.position.count; i++) {
    vertex.fromBufferAttribute(geometry.attributes.position, i);
    skinned.applyBoneTransform(i, vertex);
    geometry.attributes.position.setXYZ(i, vertex.x, vertex.y, vertex.z);
  }
  if (geometry.attributes.skinIndex) delete geometry.attributes.skinIndex;
  if (geometry.attributes.skinWeight) delete geometry.attributes.skinWeight;
  const mesh = new THREE.Mesh(geometry, skinned.material);
  mesh.name = skinned.name;
  return mesh;
}

function cloneForExport(src) {
  if (src.isSkinnedMesh) return bakeSkinnedToStatic(src);
  if (isCurveOrLine(src)) return src.clone();
  if (!src.isMesh) return null;
  const geometry = src.geometry.clone();
  if (geometry.attributes.skinIndex) delete geometry.attributes.skinIndex;
  if (geometry.attributes.skinWeight) delete geometry.attributes.skinWeight;
  const mesh = new THREE.Mesh(geometry, src.material);
  mesh.name = src.name;
  return mesh;
}

function collectParts(scene, kind) {
  const parts = [];
  scene.traverse((child) => {
    if (!child.isMesh && !isCurveOrLine(child)) return;
    if (shouldDropMesh(child, kind)) return;
    parts.push(child);
  });
  return parts;
}

function toArrayBuffer(buffer) {
  if (buffer instanceof ArrayBuffer) return buffer;
  const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
}

function parseGlb(buffer) {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.parse(
      toArrayBuffer(buffer),
      '',
      (gltf) => resolve(gltf),
      (err) => reject(err || new Error('GLTF parse failed'))
    );
  });
}

function exportGroup(group) {
  return new Promise((resolve, reject) => {
    const exporter = new GLTFExporter();
    exporter.parse(
      group,
      (result) => {
        if (result instanceof ArrayBuffer) {
          resolve(Buffer.from(result));
          return;
        }
        if (result.buffers && result.buffers[0]) {
          resolve(Buffer.from(result.buffers[0]));
          return;
        }
        reject(new Error('GLTFExporter returned unexpected format'));
      },
      (err) => reject(err || new Error('GLTF export failed')),
      { binary: true, onlyVisible: true, embedImages: true }
    );
  });
}

/**
 * @param {Buffer|Uint8Array} buffer
 * @param {'hat'|'shirt'|'eyes'|'other'} kind
 * @returns {Promise<Buffer>}
 */
async function bakeWearableGlbForMml(buffer, kind) {
  const gltf = await parseGlb(buffer);
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);

  let socketBone = findSocketBone(scene, kind);
  if (!socketBone) {
    scene.traverse((o) => {
      if (socketBone || !o.isBone) return;
      socketBone = o;
    });
  }
  if (!socketBone) socketBone = scene;

  socketBone.updateMatrixWorld(true);
  const socketInv = socketBone.matrixWorld.clone().invert();

  const parts = collectParts(scene, kind);
  if (!parts.length) {
    throw new Error(`No accessory meshes found in wearable GLB (${kind})`);
  }

  const exportRoot = new THREE.Group();
  exportRoot.name = 'MMLAccessory';

  for (const src of parts) {
    const node = cloneForExport(src);
    if (!node) continue;

    src.updateMatrixWorld(true);
    const rel = new THREE.Matrix4().multiplyMatrices(socketInv, src.matrixWorld);
    rel.decompose(node.position, node.quaternion, node.scale);
    exportRoot.add(node);
  }

  if (!exportRoot.children.length) {
    throw new Error(`Nothing to export after filter (${kind})`);
  }

  return exportGroup(exportRoot);
}

module.exports = { bakeWearableGlbForMml };
