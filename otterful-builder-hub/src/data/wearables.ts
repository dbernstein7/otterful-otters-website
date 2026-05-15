/**
 * Wearable catalog — each row is a separate GLB and a *preferred* logical socket on your rig.
 *
 * Models ship under `public/models/wearables/` → `/builder/models/wearables/...`.
 * Sockets may be Mixamo-style (`mixamorigHead`), colon form (`mixamorig:Head`), or UE bones (`head`, `spine_04`).
 */
export type WearableCategory = 'hats' | 'glasses' | 'tops' | 'accessories';

export type WearableDef = {
  id: string;
  name: string;
  category: WearableCategory;
  modelUrl: string;
  socketName: string;
  positionOffset?: [number, number, number];
  /** Euler radians (RX, RY, RZ). */
  rotationOffset?: [number, number, number];
  scale?: number | [number, number, number];
};

export const WEARABLES: WearableDef[] = [
  {
    id: 'crown',
    name: 'Golden Shell (hat demo)',
    category: 'hats',
    modelUrl: '/builder/models/wearables/goldenshell.glb',
    socketName: 'head',
    positionOffset: [0, 0.12, 0],
    scale: 0.28,
  },
  {
    id: 'backpack-shell',
    name: 'Blue Shell (back demo)',
    category: 'accessories',
    modelUrl: '/builder/models/wearables/blueshell.glb',
    socketName: 'spine_04',
    positionOffset: [0, 0, -0.08],
    rotationOffset: [0, Math.PI, 0],
    scale: 0.22,
  },
  {
    id: 'sneaker-prop',
    name: 'Sneaker (hand demo)',
    category: 'accessories',
    modelUrl: '/builder/models/wearables/sneakers.glb',
    socketName: 'hand_r',
    positionOffset: [0.05, 0, 0],
    scale: 0.045,
  },
  {
    id: 'deal-with-it',
    name: 'Deal-with-it (glasses demo)',
    category: 'glasses',
    modelUrl: '/builder/models/wearables/commonshell.glb',
    socketName: 'head',
    positionOffset: [0, 0.02, 0.06],
    scale: 0.08,
  },
  {
    id: 'top-visor',
    name: 'Visor top (chest demo)',
    category: 'tops',
    modelUrl: '/builder/models/wearables/geometric-palm-oasis.glb',
    socketName: 'spine_04',
    positionOffset: [0, 0.15, 0.1],
    scale: 0.006,
  },
];

export function wearablesByCategory(cat: WearableCategory): WearableDef[] {
  return WEARABLES.filter((w) => w.category === cat);
}

export function getWearableById(id: string): WearableDef | undefined {
  return WEARABLES.find((w) => w.id === id);
}

export const SOCKET_OPTIONS: string[] = [
  'HeadSocket',
  'FaceSocket',
  'ChestSocket',
  'BackSocket',
  'LeftHandSocket',
  'RightHandSocket',
  'head',
  'neck_02',
  'spine_04',
  'spine_03',
  'pelvis',
  'hand_l',
  'hand_r',
  'mixamorigHead',
  'mixamorig:Head',
  'mixamorigSpine2',
  'mixamorig:Spine2',
  'mixamorigRightHand',
  'mixamorigLeftHand',
];
