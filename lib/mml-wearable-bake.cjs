/**
 * Bake Otterful wearable GLBs for MML.io / Otherside (socket-relative origin).
 * Uses @gltf-transform/core only (no sharp / functions bundle on Vercel).
 */
const { NodeIO } = require('@gltf-transform/core');
const { mat4, vec3 } = require('gl-matrix');

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
  return null;
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
  const tmp = vec3.create();
  const acc = vec3.create();
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
      vec3.set(acc, 0, 0, 0);
      const w = readWeights(weights, vi);
      const ji = readJoints(jointIdx, vi);
      for (let k = 0; k < 4; k++) {
        if (w[k] < 1e-5) continue;
        const j = ji[k];
        if (j >= jm.length) continue;
        vec3.transformMat4(tmp, v, jm[j]);
        vec3.scaleAndAdd(acc, acc, tmp, w[k]);
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
    if (node.getSkin()) bakeSkinnedMeshLocal(node);
    const rel = mat4.create();
    mat4.multiply(rel, socketInv, node.getWorldMatrix());
    transformMeshVertices(node.getMesh(), rel);
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
