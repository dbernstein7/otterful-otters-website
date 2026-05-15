import { useMemo } from 'react';
import { useBuilderStore } from '@/store/builderStore';
import { getAvatarByToken } from '@/data/avatars';
import type { AnimationKey } from '@/data/avatars';

const ORDER: AnimationKey[] = ['idle', 'walk', 'run', 'jump', 'dance'];

export function AnimationControls() {
  const tokenId = useBuilderStore((s) => s.tokenId);
  const activeAnimKey = useBuilderStore((s) => s.activeAnimKey);
  const setActiveAnimKey = useBuilderStore((s) => s.setActiveAnimKey);
  const othersideMotionTest = useBuilderStore((s) => s.othersideMotionTest);
  const setOthersideMotionTest = useBuilderStore((s) => s.setOthersideMotionTest);
  const debugSockets = useBuilderStore((s) => s.debugSockets);
  const setDebugSockets = useBuilderStore((s) => s.setDebugSockets);
  const requestCameraReset = useBuilderStore((s) => s.requestCameraReset);

  const cfg = useMemo(() => getAvatarByToken(tokenId), [tokenId]);
  const urls = cfg.animationUrls || {};

  return (
    <div className="bottom-bar">
      <div className="bottom-cluster">
        <span className="bottom-label">Animations</span>
        <div className="btn-row">
          {ORDER.map((key) => {
            const has = Boolean(urls[key]);
            const on = activeAnimKey === key;
            return (
              <button
                key={key}
                type="button"
                className={`pill ${on ? 'is-on' : ''}`}
                disabled={!has}
                title={has ? '' : 'Add clip URL in src/data/avatars.ts'}
                onClick={() => setActiveAnimKey(key)}
              >
                {key}
              </button>
            );
          })}
        </div>
      </div>

      <div className="bottom-cluster">
        <label className="toggle">
          <input
            type="checkbox"
            checked={othersideMotionTest}
            onChange={(e) => setOthersideMotionTest(e.target.checked)}
          />
          Otherside motion test (idle → walk → run loop)
        </label>
        <label className="toggle">
          <input type="checkbox" checked={debugSockets} onChange={(e) => setDebugSockets(e.target.checked)} />
          Socket debug (spheres on bones)
        </label>
        <button type="button" className="pill pill--ghost" onClick={() => requestCameraReset()}>
          Reset camera
        </button>
      </div>
    </div>
  );
}
