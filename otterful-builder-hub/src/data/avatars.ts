/**
 * Avatar registry — add one entry per token that should resolve to a distinct body GLB.
 * For any token ID not listed, `getAvatarByToken` falls back to `DEFAULT_AVATAR_MODEL` (same rig for prototyping).
 *
 * CHANGE: Replace `DEFAULT_AVATAR_MODEL` with your canonical rigged GLB under `/public/models/avatars/`
 * (served as `/builder/models/avatars/...` in dev/prod), or keep absolute `/games/...` paths on this site.
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

/** Default rig used when token has no bespoke row — Otterful Mixamo-friendly body on this repo. */
export const DEFAULT_AVATAR_MODEL = '/games/shell-snag/MMLOtter.glb';

/** Default locomotion clips (same-origin Shell Snag / Mixamo routes on Vercel). */
export const DEFAULT_ANIMATION_BUNDLE: Partial<Record<AnimationKey, string>> = {
  idle: '/mixamo/idle-00.glb',
  walk: '/mixamo/walk.glb',
  run: '/mixamo/run-medium.glb',
  jump: '/mixamo/jump.glb',
  dance: '/mixamo/dance-wave.glb',
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
    modelUrl: '/games/shell-snag/otter-rig.glb',
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

/** Resolve relative paths against the site origin (iframe parent / same tab). */
export function resolveAssetUrl(path: string): string {
  const p = path.trim();
  if (!p) return p;
  if (/^https?:\/\//i.test(p)) return p;
  if (typeof window === 'undefined') return p;
  if (p.startsWith('/')) return `${window.location.origin}${p}`;
  return new URL(p, window.location.origin + (import.meta.env.BASE_URL || '/builder/')).href;
}
