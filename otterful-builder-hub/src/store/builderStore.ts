import { create } from 'zustand';
import type { EquippedMap, WearableCategory } from '@/data/wearables';
import type { MmlDocumentPreview } from '@/lib/parseMmlHtml';

export type BuilderState = {
  tokenId: number;
  setTokenId: (id: number) => void;
  /**
   * Per-slot preview overrides sent to `/api/mml`:
   * - `null` = use NFT metadata only (omit query param for that slot)
   * - `MML_SLOT_OFF` (`__off__`) = force-hide (`no_hat` / `no_shirt` / `no_glasses`)
   * - other string = `hat=` / `shirt=` / `glasses=` stem or full `https://…glb`
   */
  equipped: EquippedMap;
  setEquipped: (cat: WearableCategory, wearableId: string | null) => void;
  clearLoadout: () => void;
  /** When set, overrides socket for every `m-model` attachment (testing). */
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
  mmlPreview: MmlDocumentPreview | null;
  mmlPreviewLoading: boolean;
  mmlPreviewError: string | null;
  setMmlPreview: (p: MmlDocumentPreview | null) => void;
  setMmlPreviewLoading: (v: boolean) => void;
  setMmlPreviewError: (s: string | null) => void;
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
  mmlPreview: null,
  mmlPreviewLoading: false,
  mmlPreviewError: null,
  setMmlPreview: (mmlPreview) => set({ mmlPreview }),
  setMmlPreviewLoading: (mmlPreviewLoading) => set({ mmlPreviewLoading }),
  setMmlPreviewError: (mmlPreviewError) => set({ mmlPreviewError }),
}));

const LS_PREFIX = 'otterful-equipped-';

/** Legacy hub demo ids — map to “inherit metadata” so MML preview is not stuck on local shell props. */
const LEGACY_DEMO_IDS = new Set(['crown', 'backpack-shell', 'sneaker-prop', 'deal-with-it', 'top-visor']);

function normalizeStoredSlot(v: string | null | undefined): string | null {
  if (v == null || v === '') return null;
  if (LEGACY_DEMO_IDS.has(v)) return null;
  return v;
}

export function loadLoadoutFromStorage(tokenId: number): EquippedMap {
  try {
    const raw = localStorage.getItem(`${LS_PREFIX}${tokenId}`);
    if (!raw) return { ...defaultEquipped };
    const o = JSON.parse(raw) as Record<string, string | null>;
    return {
      hats: normalizeStoredSlot(o.hats),
      glasses: normalizeStoredSlot(o.glasses),
      tops: normalizeStoredSlot(o.tops),
      accessories: normalizeStoredSlot(o.accessories),
    };
  } catch {
    return { ...defaultEquipped };
  }
}

export function equippedEqual(a: EquippedMap, b: EquippedMap): boolean {
  return a.hats === b.hats && a.tops === b.tops && a.glasses === b.glasses && a.accessories === b.accessories;
}

export function saveLoadoutToStorage(tokenId: number, equipped: EquippedMap) {
  try {
    localStorage.setItem(`${LS_PREFIX}${tokenId}`, JSON.stringify(equipped));
  } catch {
    /* quota / private mode */
  }
}
