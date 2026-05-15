/**
 * Wearable catalog — each row is a separate GLB and a *preferred* logical socket on your rig.
 *
 * CHANGE:
 * - `socketName`: match empties on your GLB (e.g. HeadSocket) or bone names (mixamorigHead).
 * - `modelUrl`: place files under `public/models/wearables/...` → served as `/builder/models/wearables/...`
 *   or reference existing site assets like `/games/shell-snag/...`.
 * - Adjust offsets (meters / radians) after you swap in real art.
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
    modelUrl: '/games/shell-snag/goldenshell.glb',
    socketName: 'mixamorigHead',
    positionOffset: [0, 0.12, 0],
    scale: 0.28,
  },
  {
    id: 'backpack-shell',
    name: 'Blue Shell (back demo)',
    category: 'accessories',
    modelUrl: '/games/shell-snag/blueshell.glb',
    socketName: 'mixamorigSpine2',
    positionOffset: [0, 0, -0.08],
    rotationOffset: [0, Math.PI, 0],
    scale: 0.22,
  },
  {
    id: 'sneaker-prop',
    name: 'Sneaker (hand demo)',
    category: 'accessories',
    modelUrl: '/games/shell-snag/sneakers.glb',
    socketName: 'mixamorigRightHand',
    positionOffset: [0.05, 0, 0],
    scale: 0.045,
  },
  {
    id: 'deal-with-it',
    name: 'Deal-with-it (glasses demo)',
    category: 'glasses',
    modelUrl: '/games/shell-snag/commonshell.glb',
    socketName: 'mixamorigHead',
    positionOffset: [0, 0.02, 0.06],
    scale: 0.08,
  },
  {
    id: 'top-visor',
    name: 'Visor top (chest demo)',
    category: 'tops',
    modelUrl: '/games/shell-snag/geometric-palm-oasis.glb',
    socketName: 'mixamorigSpine2',
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
  'mixamorigHead',
  'mixamorigSpine2',
  'mixamorigRightHand',
  'mixamorigLeftHand',
];
