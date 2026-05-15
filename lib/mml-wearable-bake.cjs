/**
 * Bake Otterful wearable GLBs for MML.io / Otherside (socket-relative origin).
 * Shirts use the Otter body fur spine_03 frame (mml.io parents to that bone on the character).
 */
const { NodeIO } = require('@gltf-transform/core');
const { mat4 } = require('gl-matrix');

const DEFAULT_BODY_GLB_URL =
  'https://firebasestorage.googleapis.com/v0/b/otterful-otters.firebasestorage.app/o/Furs%2FOG.glb?alt=media';

const SOCKET_BONES = {
  hat: ['head', 'mixamorigHead', 'mixamorig:Head', 'neck_02', 'Head'],
  eyes: ['head', 'mixamorigHead', 'mixamorig:Head', 'neck_02', 'Head'],
  shirt: ['spine_03', 'spine_04', 'mixamorigSpine2', 'mixamorig:Spine2', 'Spine2', 'spine_02'],
};

const IDENTITY = mat4.create();

let cachedBodySocketInv = null;

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
  for (const variant of variants) {
    for (const node of root.listNodes()) {
      if (nameMatchesBone(node.getName(), [variant])) return node;
    }
  }
  return null;
}

async function getBodySpineInverse(io) {
  if (cachedBodySocketInv) return cachedBodySocketInv;
  const url = (process.env.MML_BAKE_BODY_GLB_URL || DEFAULT_BODY_GLB_URL).trim();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Body reference GLB fetch failed: HTTP ${res.status}`);
  const bodyDoc = await io.readBinary(new Uint8Array(await res.arrayBuffer()));
  const socket = findSocketNode(bodyDoc.getRoot(), 'shirt');
  if (!socket) throw new Error('spine_03 not found on body reference GLB');
  cachedBodySocketInv = mat4.create();
  mat4.invert(cachedBodySocketInv, socket.getWorldMatrix());
  return cachedBodySocketInv;
}

function shouldDropNode(node, mesh, kind) {
  const name = `${node.getName()} ${mesh.getName()}`.toLowerCase();
  if (kind === 'eyes') return false;
  if (kind === 'shirt') {
    if (name.includes('cone') || name.includes('sphere') || /^mesh_0001/i.test(name)) return true;
    if (
      name.includes('teeth') ||
      name.includes('tongue') ||
      name.includes('head') ||
      name.includes('mouth') ||
      name.includes('jaw') ||
      (name.includes('eye') && !name.includes('ear')) ||
      name.includes('nose') ||
      name.includes('whisker')
    ) {
      return true;
    }
  }
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

function readWeights(arr, i) {
  const o = i * 4;
  if (arr instanceof Uint8Array) {
    return [arr[o] / 255, arr[o + 1] / 255, arr[o + 2] / 255, arr[o + 3] / 255];
  }
  return [arr[o], arr[o + 1], arr[o + 2], arr[o + 3]];
}

function readJoints(arr, i) {
  const o = i * 4;
  return [arr[o], arr[o + 1], arr[o + 2], arr[o + 3]];
}

function jointSkinMatrices(skin) {
  const joints = skin.listJoints();
  const ibmAcc = skin.getInverseBindMatrices();
  const ibmArr = ibmAcc ? ibmAcc.getArray() : null;
  return joints.map((joint, ji) => {
    const jm = mat4.clone(joint.getWorldMatrix());
    if (!ibmArr) return jm;
    const ibm = mat4.create();
    mat4.copy(ibm, ibmArr.subarray(ji * 16, ji * 16 + 16));
    const out = mat4.create();
    mat4.multiply(out, jm, ibm);
    return out;
  });
}

/** Apply glTF skinning into mesh-local POSITION (removes skin). */
function bakeSkinnedMeshLocal(node) {
  const mesh = node.getMesh();
  const skin = node.getSkin();
  if (!mesh || !skin) return;

  const jm = jointSkinMatrices(skin);
  const tmp = [0, 0, 0];
  const acc = [0, 0, 0];
  const v = [0, 0, 0];

  for (const prim of mesh.listPrimitives()) {
    const posAttr = prim.getAttribute('POSITION');
    const weightsAttr = prim.getAttribute('WEIGHTS_0');
    const jointsAttr = prim.getAttribute('JOINTS_0');
    if (!posAttr || !weightsAttr || !jointsAttr) continue;

    const pos = posAttr.getArray();
    const weights = weightsAttr.getArray();
    const jointIdx = jointsAttr.getArray();
    const out = pos.slice();

    for (let vi = 0; vi < out.length / 3; vi++) {
      v[0] = pos[vi * 3];
      v[1] = pos[vi * 3 + 1];
      v[2] = pos[vi * 3 + 2];
      acc[0] = acc[1] = acc[2] = 0;
      const w = readWeights(weights, vi);
      const ji = readJoints(jointIdx, vi);
      for (let k = 0; k < 4; k++) {
        if (w[k] < 1e-5) continue;
        const j = ji[k];
        if (j >= jm.length) continue;
        const m = jm[j];
        tmp[0] = m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12];
        tmp[1] = m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13];
        tmp[2] = m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14];
        acc[0] += tmp[0] * w[k];
        acc[1] += tmp[1] * w[k];
        acc[2] += tmp[2] * w[k];
      }
      out[vi * 3] = acc[0];
      out[vi * 3 + 1] = acc[1];
      out[vi * 3 + 2] = acc[2];
    }

    posAttr.setArray(out);
    prim.setAttribute('WEIGHTS_0', null);
    prim.setAttribute('JOINTS_0', null);
  }
  node.setSkin(null);
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

  const bodySocketInv = kind === 'shirt' ? await getBodySpineInverse(io) : null;

  let wearableSocketInv = null;
  if (kind !== 'shirt') {
    const socket = findSocketNode(root, kind);
    if (!socket) throw new Error(`Socket bone not found (${kind})`);
    wearableSocketInv = mat4.create();
    mat4.invert(wearableSocketInv, socket.getWorldMatrix());
  }

  const parts = [];
  for (const node of root.listNodes()) {
    const mesh = node.getMesh();
    if (!mesh || shouldDropNode(node, mesh, kind)) continue;
    parts.push(node);
  }
  if (!parts.length) throw new Error(`No accessory meshes found in wearable GLB (${kind})`);

  for (const node of parts) {
    if (node.getSkin()) bakeSkinnedMeshLocal(node);
    const nodeWorld = mat4.clone(node.getWorldMatrix());

    if (kind === 'shirt') {
      transformMeshVertices(node.getMesh(), nodeWorld);
      node.setMatrix(IDENTITY);
      transformMeshVertices(node.getMesh(), bodySocketInv);
    } else {
      const rel = mat4.create();
      mat4.multiply(rel, wearableSocketInv, nodeWorld);
      transformMeshVertices(node.getMesh(), rel);
      node.setMatrix(IDENTITY);
    }
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
