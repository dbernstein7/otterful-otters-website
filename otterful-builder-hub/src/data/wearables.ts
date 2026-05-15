/**
 * Wearable **categories** for the hub UI. Preview slots come from `/api/mml` (`m-model` order: hat, shirt, eyes).
 * There is no static demo catalog — stems / URLs are driven by NFT metadata + query overrides.
 */
export type WearableCategory = 'hats' | 'glasses' | 'tops' | 'accessories';

export type EquippedMap = Partial<Record<WearableCategory, string | null>>;

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
