import React, { useState } from 'react';
import { useBuilderStore } from '@/store/builderStore';
import { WEARABLES, wearablesByCategory, SOCKET_OPTIONS, type WearableCategory } from '@/data/wearables';

const CATS: { key: WearableCategory; label: string }[] = [
  { key: 'hats', label: 'Hats' },
  { key: 'glasses', label: 'Glasses' },
  { key: 'tops', label: 'Tops' },
  { key: 'accessories', label: 'Accessories' },
];

export function WearablePanel() {
  const equipped = useBuilderStore((s) => s.equipped);
  const setEquipped = useBuilderStore((s) => s.setEquipped);
  const manualSocketOverride = useBuilderStore((s) => s.manualSocketOverride);
  const setManualSocketOverride = useBuilderStore((s) => s.setManualSocketOverride);
  const debugSockets = useBuilderStore((s) => s.debugSockets);
  const [cat, setCat] = useState<WearableCategory>('hats');

  return (
    <div className="panel panel--right">
      <h2 className="panel-title">Wearables</h2>
      <p className="panel-hint">Equip one item per category. Sockets follow your rig (see README).</p>

      <label className="field-label">Manual socket override (testing)</label>
      <select
        className="field-select"
        value={manualSocketOverride ?? ''}
        onChange={(e) => setManualSocketOverride(e.target.value || null)}
      >
        <option value="">(use wearable default)</option>
        {SOCKET_OPTIONS.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>

      <div className="cat-row">
        {CATS.map((c) => (
          <button
            key={c.key}
            type="button"
            className={`cat-btn ${cat === c.key ? 'is-on' : ''}`}
            onClick={() => setCat(c.key)}
          >
            {c.label}
          </button>
        ))}
      </div>

      <ul className="wearable-list">
        <li className="wearable-row">
          <button type="button" className="linkish" onClick={() => setEquipped(cat, null)}>
            None
          </button>
        </li>
        {wearablesByCategory(cat).map((w) => {
          const on = equipped[cat] === w.id;
          return (
            <li key={w.id} className="wearable-row">
              <button
                type="button"
                className={`wearable-name ${on ? 'is-on' : ''}`}
                onClick={() => setEquipped(cat, on ? null : w.id)}
              >
                {w.name}
              </button>
              <span className="wearable-meta">{w.socketName}</span>
            </li>
          );
        })}
      </ul>

      {debugSockets ? (
        <details className="bone-hint">
          <summary>Bone / socket catalog</summary>
          <ul className="mono-list">
            {SOCKET_OPTIONS.map((s) => (
              <li key={s}>{s}</li>
            ))}
            {WEARABLES.map((w) => (
              <li key={`w-${w.id}`}>
                {w.id} → {w.socketName}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
