/**
 * Avatar registry — add one entry per token that should resolve to a distinct body GLB.
 * For any token ID not listed, `getAvatarByToken` falls back to `DEFAULT_AVATAR_MODEL` (same rig for prototyping).
 *
 * Default assets live under `public/models/` (served as `/builder/models/...`) so the hub does not depend on `/games/shell-snag/`.
 */
export type AnimationKey = 'idle' | 'walk' | 'run' | 'jump' | 'dance';

export type AvatarConfig = {
  tokenId: number;
  displayName: string;
  /** GLB/GLTF URL — site-root absolute path recommended for production. */
  modelUrl: string;
  /** Optional per-clip GLBs (Mixamo-style tracks). Keys not set are omitted in the UI. */
  animationUrls?: Partial<Record<AnimationKey, string>>;
};

/** Default Otterful MML body (UE-style bone names: `pelvis`, `spine_04`, `head`, `hand_l`, …). */
export const DEFAULT_AVATAR_MODEL = '/builder/models/avatars/MMLOtter.glb';

/** Locomotion clips (Mixamo skeleton; remapped at runtime in `clipRemap.ts`). */
export const DEFAULT_ANIMATION_BUNDLE: Partial<Record<AnimationKey, string>> = {
  idle: '/builder/models/animations/idle-00.glb',
  walk: '/builder/models/animations/walk.glb',
  run: '/builder/models/animations/run-medium.glb',
  jump: '/builder/models/animations/jump.glb',
  dance: '/builder/models/animations/dance-wave.glb',
};

const REGISTRY: AvatarConfig[] = [
  {
    tokenId: 1,
    displayName: 'Otter #1 (registry)',
    modelUrl: DEFAULT_AVATAR_MODEL,
    animationUrls: DEFAULT_ANIMATION_BUNDLE,
  },
  {
    tokenId: 26,
    displayName: 'Otter #26 (registry)',
    modelUrl: DEFAULT_AVATAR_MODEL,
    animationUrls: DEFAULT_ANIMATION_BUNDLE,
  },
  {
    tokenId: 100,
    displayName: 'Otter #100 (registry)',
    modelUrl: DEFAULT_AVATAR_MODEL,
    animationUrls: DEFAULT_ANIMATION_BUNDLE,
  },
];

export function listRegisteredAvatars(): AvatarConfig[] {
  return [...REGISTRY];
}

export function getAvatarByToken(tokenId: number): AvatarConfig {
  const row = REGISTRY.find((a) => a.tokenId === tokenId);
  if (row) return row;
  return {
    tokenId,
    displayName: `Otter #${tokenId}`,
    modelUrl: DEFAULT_AVATAR_MODEL,
    animationUrls: DEFAULT_ANIMATION_BUNDLE,
  };
}

/** Site origin for root-relative assets (`/builder/...`, `/mixamo/...`). Defaults to `window.location.origin`. */
function assetSiteOrigin(): string {
  const o = (import.meta.env.VITE_PUBLIC_ASSET_ORIGIN || '').trim().replace(/\/$/, '');
  if (o) return o;
  if (typeof window === 'undefined') return '';
  return window.location.origin.replace(/\/$/, '');
}

/** Resolve relative paths against the site origin (iframe parent / same tab). */
export function resolveAssetUrl(path: string): string {
  const p = path.trim();
  if (!p) return p;
  if (/^https?:\/\//i.test(p)) return p;
  if (typeof window === 'undefined') return p;
  const origin = assetSiteOrigin();
  if (p.startsWith('/')) return `${origin}${p}`;
  return new URL(p, origin + (import.meta.env.BASE_URL || '/builder/')).href;
}
