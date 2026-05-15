/**
 * Bake Otterful wearable GLBs for MML.io / Otherside (socket-relative origin).
 * Uses @gltf-transform (fast on serverless); Three.js GLTFExporter hangs on Node.
 */
const { NodeIO } = require('@gltf-transform/core');
const { transformMesh, prune, dequantize } = require('@gltf-transform/functions');
const { mat4 } = require('gl-matrix');

const SOCKET_BONES = {
  hat: ['head', 'mixamorigHead', 'mixamorig:Head', 'neck_02', 'Head'],
  eyes: ['head', 'mixamorigHead', 'mixamorig:Head', 'neck_02', 'Head'],
  shirt: ['spine_03', 'spine_04', 'mixamorigSpine2', 'mixamorig:Spine2', 'Spine2', 'spine_02'],
};

const IDENTITY = mat4.create();

function toU8(buffer) {
  if (buffer instanceof Uint8Array) return buffer;
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

function nameMatchesBone(name, variants) {
  const lower = String(name || '').toLowerCase();
  const stem = lower.replace(/^mixamorig:?/i, '').replace(/_/g, '');
  for (const v of variants) {
    const vs = v.toLowerCase().replace(/^mixamorig:?/i, '').replace(/_/g, '');
    if (lower === v.toLowerCase() || stem === vs || stem.endsWith(vs)) return true;
  }
  return false;
}

function findSocketNode(root, kind) {
  const variants = SOCKET_BONES[kind] || SOCKET_BONES.hat;
  let found = null;
  for (const node of root.listNodes()) {
    if (nameMatchesBone(node.getName(), variants)) {
      found = node;
      break;
    }
  }
  if (found) return found;
  for (const node of root.listNodes()) {
    if (node.listChildren().length) continue;
    if (node.getMesh()) continue;
    if (node.getSkin()) return node;
  }
  return root.listNodes()[0] || null;
}

function shouldDropNode(node, mesh, kind) {
  const name = `${node.getName()} ${mesh.getName()}`.toLowerCase();
  if (kind === 'eyes') return false;
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

function collectAccessoryNodes(root, kind) {
  const parts = [];
  for (const node of root.listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    if (shouldDropNode(node, mesh, kind)) continue;
    parts.push(node);
  }
  return parts;
}

/**
 * @param {Buffer|Uint8Array} buffer
 * @param {'hat'|'shirt'|'eyes'|'other'} kind
 * @returns {Promise<Buffer>}
 */
async function bakeWearableGlbForMml(buffer, kind) {
  const io = new NodeIO();
  const doc = await io.readBinary(toU8(buffer));
  await doc.transform(dequantize());

  const root = doc.getRoot();
  const socket = findSocketNode(root, kind);
  if (!socket) throw new Error(`Socket bone not found (${kind})`);

  const socketInv = mat4.create();
  mat4.invert(socketInv, socket.getWorldMatrix());

  const parts = collectAccessoryNodes(root, kind);
  if (!parts.length) throw new Error(`No accessory meshes found in wearable GLB (${kind})`);

  for (const node of parts) {
    const mesh = node.getMesh();
    const rel = mat4.create();
    mat4.multiply(rel, socketInv, node.getWorldMatrix());
    transformMesh(mesh, rel, true);
    node.setSkin(null);
    node.setMatrix(IDENTITY);
  }

  const exportRoot = doc.createNode('MMLAccessory');
  const scene = root.listScenes()[0] || doc.createScene('Scene');
  for (const child of [...scene.listChildren()]) scene.removeChild(child);
  scene.addChild(exportRoot);

  for (const node of parts) {
    const parent = node.getParentNode?.() || null;
    if (parent) parent.removeChild(node);
    exportRoot.addChild(node);
  }

  for (const node of [...root.listNodes()]) {
    if (parts.includes(node) || node === exportRoot) continue;
    if (node.listChildren().length && !parts.some((p) => isDescendant(node, p))) {
      continue;
    }
    if (!node.getMesh() && !parts.includes(node)) {
      try {
        node.dispose();
      } catch (_) {
        /* ignore */
      }
    }
  }

  await doc.transform(prune({ keepLeaves: false }));

  const out = await io.writeBinary(doc);
  return Buffer.from(out);
}

function isDescendant(ancestor, node) {
  let p = node.getParentNode?.();
  while (p) {
    if (p === ancestor) return true;
    p = p.getParentNode?.();
  }
  return false;
}

module.exports = { bakeWearableGlbForMml };
