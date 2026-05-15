import { create } from 'zustand';
import type { WearableCategory } from '@/data/wearables';

export type EquippedMap = Partial<Record<WearableCategory, string | null>>;

export type BuilderState = {
  tokenId: number;
  setTokenId: (id: number) => void;
  /** Equipped wearable ids per category (null = none). */
  equipped: EquippedMap;
  setEquipped: (cat: WearableCategory, wearableId: string | null) => void;
  clearLoadout: () => void;
  /** When set, overrides socket for the *next* attachment resolution (testing). */
  manualSocketOverride: string | null;
  setManualSocketOverride: (socket: string | null) => void;
  debugSockets: boolean;
  setDebugSockets: (on: boolean) => void;
  activeAnimKey: string | null;
  setActiveAnimKey: (key: string | null) => void;
  othersideMotionTest: boolean;
  setOthersideMotionTest: (on: boolean) => void;
  loadError: string | null;
  setLoadError: (msg: string | null) => void;
  cameraResetNonce: number;
  requestCameraReset: () => void;
};

const defaultEquipped: EquippedMap = {
  hats: null,
  glasses: null,
  tops: null,
  accessories: null,
};

export const useBuilderStore = create<BuilderState>((set) => ({
  tokenId: 26,
  setTokenId: (tokenId) => set({ tokenId }),
  equipped: { ...defaultEquipped },
  setEquipped: (cat, wearableId) =>
    set((s) => ({
      equipped: { ...s.equipped, [cat]: wearableId },
    })),
  clearLoadout: () => set({ equipped: { ...defaultEquipped } }),
  manualSocketOverride: null,
  setManualSocketOverride: (manualSocketOverride) => set({ manualSocketOverride }),
  debugSockets: false,
  setDebugSockets: (debugSockets) => set({ debugSockets }),
  activeAnimKey: 'idle',
  setActiveAnimKey: (activeAnimKey) => set({ activeAnimKey }),
  othersideMotionTest: false,
  setOthersideMotionTest: (othersideMotionTest) => set({ othersideMotionTest }),
  loadError: null,
  setLoadError: (loadError) => set({ loadError }),
  cameraResetNonce: 0,
  requestCameraReset: () => set((s) => ({ cameraResetNonce: s.cameraResetNonce + 1 })),
}));

const LS_PREFIX = 'otterful-equipped-';

export function loadLoadoutFromStorage(tokenId: number): EquippedMap {
  try {
    const raw = localStorage.getItem(`${LS_PREFIX}${tokenId}`);
    if (!raw) return { ...defaultEquipped };
    const o = JSON.parse(raw) as Record<string, string | null>;
    return {
      hats: o.hats ?? null,
      glasses: o.glasses ?? null,
      tops: o.tops ?? null,
      accessories: o.accessories ?? null,
    };
  } catch {
    return { ...defaultEquipped };
  }
}

export function saveLoadoutToStorage(tokenId: number, equipped: EquippedMap) {
  try {
    localStorage.setItem(`${LS_PREFIX}${tokenId}`, JSON.stringify(equipped));
  } catch {
    /* quota / private mode */
  }
}
