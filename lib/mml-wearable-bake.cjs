/**
 * Bake Otterful wearable GLBs for MML.io / Otherside (socket-relative origin).
 * Uses @gltf-transform/core only (no sharp / functions bundle on Vercel).
 */
const { NodeIO } = require('@gltf-transform/core');
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
  for (const node of root.listNodes()) {
    if (nameMatchesBone(node.getName(), variants)) return node;
  }
  for (const node of root.listNodes()) {
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

function transformPrimitivePositions(prim, matrix) {
  const position = prim.getAttribute('POSITION');
  if (!position) return;
  const src = position.getArray();
  const arr = src.slice();
  for (let i = 0; i < arr.length; i += 3) {
    const x = arr[i];
    const y = arr[i + 1];
    const z = arr[i + 2];
    arr[i] = matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12];
    arr[i + 1] = matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13];
    arr[i + 2] = matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14];
  }
  position.setArray(arr);
}

function transformMeshVertices(mesh, matrix) {
  for (const prim of mesh.listPrimitives()) {
    transformPrimitivePositions(prim, matrix);
  }
}

/**
 * @param {Buffer|Uint8Array} buffer
 * @param {'hat'|'shirt'|'eyes'|'other'} kind
 * @returns {Promise<Buffer>}
 */
async function bakeWearableGlbForMml(buffer, kind) {
  const io = new NodeIO();
  const doc = await io.readBinary(toU8(buffer));
  const root = doc.getRoot();

  const socket = findSocketNode(root, kind);
  if (!socket) throw new Error(`Socket bone not found (${kind})`);

  const socketInv = mat4.create();
  mat4.invert(socketInv, socket.getWorldMatrix());

  const parts = [];
  for (const node of root.listNodes()) {
    const mesh = node.getMesh();
    if (!mesh || shouldDropNode(node, mesh, kind)) continue;
    parts.push(node);
  }
  if (!parts.length) throw new Error(`No accessory meshes found in wearable GLB (${kind})`);

  for (const node of parts) {
    const rel = mat4.create();
    mat4.multiply(rel, socketInv, node.getWorldMatrix());
    transformMeshVertices(node.getMesh(), rel);
    node.setSkin(null);
    node.setMatrix(IDENTITY);
  }

  const exportRoot = doc.createNode('MMLAccessory');
  const scene = root.listScenes()[0] || doc.createScene('Scene');
  for (const child of [...scene.listChildren()]) scene.removeChild(child);
  scene.addChild(exportRoot);

  for (const node of parts) {
    const parent = node.getParentNode?.();
    if (parent) parent.removeChild(node);
    exportRoot.addChild(node);
  }

  const out = await io.writeBinary(doc);
  return Buffer.from(out);
}

module.exports = { bakeWearableGlbForMml };
