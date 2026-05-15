import * as THREE from 'three';

/**
 * Rewrites animation clip track prefixes (e.g. mixamorigHips.position) so PropertyBinding
 * resolves against the bones actually present on `root` (Otterful GLBs may omit the mixamorig prefix or use colons).
 */
export function remapClipTracksToRig(clip: THREE.AnimationClip, root: THREE.Object3D): THREE.AnimationClip | null {
  const boneNames = new Set<string>();
  root.traverse((o) => {
    if ((o as THREE.Bone).isBone) boneNames.add((o as THREE.Bone).name);
  });

  const norm = (s: string) => s.replace(/:/g, '').toLowerCase();
  const stem = (s: string) => norm(s).replace(/^mixamorig/i, '');

  function mapPrefix(prefix: string): string {
    if (boneNames.has(prefix)) return prefix;
    const candidates: string[] = [
      prefix,
      prefix.replace(/^mixamorig:/i, 'mixamorig'),
      prefix.replace(/^mixamorig:?/i, ''),
      `mixamorig${prefix}`,
      `mixamorig:${prefix.charAt(0).toUpperCase()}${prefix.slice(1)}`,
      `mixamorig:${prefix}`,
    ];
    for (const c of candidates) {
      if (boneNames.has(c)) return c;
    }
    const pStem = stem(prefix);
    for (const b of boneNames) {
      if (stem(b) === pStem || stem(b).endsWith(pStem) || pStem.endsWith(stem(b))) return b;
    }
    return prefix;
  }

  const newTracks: THREE.KeyframeTrack[] = [];
  for (const tr of clip.tracks) {
    const dot = tr.name.indexOf('.');
    if (dot < 0) {
      newTracks.push(tr);
      continue;
    }
    const prefix = tr.name.slice(0, dot);
    const suffix = tr.name.slice(dot);
    const mapped = mapPrefix(prefix);
    if (!boneNames.has(mapped)) {
      continue;
    }
    if (mapped === prefix) {
      newTracks.push(tr);
      continue;
    }
    const nt = tr.clone();
    nt.name = mapped + suffix;
    newTracks.push(nt);
  }

  if (!newTracks.length) return null;
  return new THREE.AnimationClip(`${clip.name}_remapped`, clip.duration, newTracks, clip.blendMode);
}