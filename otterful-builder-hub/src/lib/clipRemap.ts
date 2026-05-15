import * as THREE from 'three';

/**
 * Rewrites Mixamo-style clip tracks onto Otterful MMLOtter rigs (UE-style bones: `pelvis`, `spine_04`, `hand_l`, …).
 * Without this, almost every track is dropped because PropertyBinding names never match the loaded skeleton.
 */
export function remapClipTracksToRig(clip: THREE.AnimationClip, root: THREE.Object3D): THREE.AnimationClip | null {
  const boneNames = new Set<string>();
  root.traverse((o) => {
    if ((o as THREE.Bone).isBone) boneNames.add((o as THREE.Bone).name);
  });

  const norm = (s: string) => s.replace(/:/g, '').toLowerCase();
  const mixamoStem = (prefix: string) => norm(prefix).replace(/^mixamorig/i, '');

  function mapHandFingerStem(stem: string): string | null {
    const m = /^(left|right)hand(index|middle|ring|pinky|thumb)(\d+)$/.exec(stem);
    if (!m) return null;
    const lr = m[1] === 'left' ? 'l' : 'r';
    const finger = m[2];
    const digit = Math.min(parseInt(m[3], 10) || 1, 4);

    const hand = `hand_${lr}`;
    if (finger === 'thumb') {
      const idx = Math.min(Math.max(digit, 1), 3);
      const name = `thumb_0${idx}_${lr}`;
      if (boneNames.has(name)) return name;
      return boneNames.has(hand) ? hand : null;
    }
    if (finger === 'index') {
      const table: Record<number, string> = {
        1: `index_metacarpal_${lr}`,
        2: `index_01_${lr}`,
        3: `index_02_${lr}`,
        4: `index_03_${lr}`,
      };
      const name = table[digit] ?? `index_03_${lr}`;
      if (boneNames.has(name)) return name;
      return boneNames.has(hand) ? hand : null;
    }
    return boneNames.has(hand) ? hand : null;
  }

  function mapStemToBone(stem: string): string | null {
    const hit = (n: string) => (boneNames.has(n) ? n : null);

    const core: Record<string, string> = {
      hips: 'pelvis',
      spine: 'spine_01',
      spine1: 'spine_02',
      spine2: 'spine_04',
      neck: 'neck_01',
      head: 'head',
      headtop_end: 'head',
      leftshoulder: 'clavicle_l',
      rightshoulder: 'clavicle_r',
      leftarm: 'upperarm_l',
      rightarm: 'upperarm_r',
      leftforearm: 'lowerarm_l',
      rightforearm: 'lowerarm_r',
      lefthand: 'hand_l',
      righthand: 'hand_r',
      leftupleg: 'thigh_l',
      rightupleg: 'thigh_r',
      leftleg: 'calf_l',
      rightleg: 'calf_r',
      leftfoot: 'foot_l',
      rightfoot: 'foot_r',
      lefttoebase: 'ball_l',
      righttoebase: 'ball_r',
      lefttoe_end: 'ball_l',
      righttoe_end: 'ball_r',
    };

    if (core[stem]) {
      const n = hit(core[stem]);
      if (n) return n;
    }

    const finger = mapHandFingerStem(stem);
    if (finger) return finger;

    return null;
  }

  function mapPrefix(prefix: string): string | null {
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

    const stem = mixamoStem(prefix);
    const mapped = mapStemToBone(stem);
    if (mapped) return mapped;

    const pStem = stem;
    for (const b of boneNames) {
      const bStem = mixamoStem(b);
      if (bStem === pStem || bStem.endsWith(pStem) || pStem.endsWith(bStem)) return b;
    }

    return null;
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
    if (!mapped || !boneNames.has(mapped)) continue;

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
