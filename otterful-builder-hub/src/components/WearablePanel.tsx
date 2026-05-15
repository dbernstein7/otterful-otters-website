import React, { useEffect, useMemo, useState } from 'react';
import { useBuilderStore } from '@/store/builderStore';
import { SOCKET_OPTIONS, type WearableCategory } from '@/data/wearables';
import { MML_SLOT_OFF, buildMmlApiUrl } from '@/lib/mmlExport';
import { resolveAssetUrl } from '@/data/avatars';

const CATS: { key: WearableCategory; label: string; mmlNote?: string }[] = [
  { key: 'hats', label: 'Hats' },
  { key: 'glasses', label: 'Glasses', mmlNote: 'Uses ?glasses= / eyes slot in MML.' },
  { key: 'tops', label: 'Tops', mmlNote: 'Uses shirt slot in MML.' },
  { key: 'accessories', label: 'Accessories', mmlNote: 'Not in /api/mml yet.' },
];

type TraitHints = { hat?: string; shirt?: string; eyes?: string };

function parseTraitHints(metadata: unknown): TraitHints {
  const out: TraitHints = {};
  const attrs = (metadata as { attributes?: { trait_type?: string; value?: string }[] })?.attributes;
  if (!Array.isArray(attrs)) return out;
  for (const attr of attrs) {
    const tt = String(attr.trait_type || '').toLowerCase();
    const val = String(attr.value || '').trim();
    if (!val || val.toLowerCase() === 'none') continue;
    if (tt === 'hats' || tt === 'hat') out.hat = val;
    else if (tt === 'shirt' || tt === 'shirts') out.shirt = val;
    else if (tt === 'eyes') out.eyes = val;
  }
  return out;
}

function shortUrl(u: string, max = 52) {
  if (u.length <= max) return u;
  return `${u.slice(0, max - 1)}…`;
}

export function WearablePanel() {
  const tokenId = useBuilderStore((s) => s.tokenId);
  const equipped = useBuilderStore((s) => s.equipped);
  const setEquipped = useBuilderStore((s) => s.setEquipped);
  const manualSocketOverride = useBuilderStore((s) => s.manualSocketOverride);
  const setManualSocketOverride = useBuilderStore((s) => s.setManualSocketOverride);
  const debugSockets = useBuilderStore((s) => s.debugSockets);
  const mmlPreview = useBuilderStore((s) => s.mmlPreview);
  const mmlPreviewLoading = useBuilderStore((s) => s.mmlPreviewLoading);
  const mmlPreviewError = useBuilderStore((s) => s.mmlPreviewError);
  const [cat, setCat] = useState<WearableCategory>('hats');
  const [traits, setTraits] = useState<TraitHints>({});
  const [draft, setDraft] = useState<Partial<Record<WearableCategory, string>>>({});

  const mmlUrl = useMemo(() => buildMmlApiUrl(tokenId, equipped), [tokenId, equipped]);

  useEffect(() => {
    let off = false;
    const u = resolveAssetUrl(`/metadata/${tokenId}.json`);
    fetch(u)
      .then((r) => (r.ok ? r.json() : null))
      .then((meta) => {
        if (!off && meta) setTraits(parseTraitHints(meta));
      })
      .catch(() => {
        if (!off) setTraits({});
      });
    return () => {
      off = true;
    };
  }, [tokenId]);

  const slotKey = (c: WearableCategory): keyof TraitHints | null => {
    if (c === 'hats') return 'hat';
    if (c === 'tops') return 'shirt';
    if (c === 'glasses') return 'eyes';
    return null;
  };

  const previewModelForCat = (c: WearableCategory) => {
    if (c === 'accessories') return undefined;
    return mmlPreview?.models.find((m) => m.category === c);
  };

  const equipVal = (c: WearableCategory) => {
    if (c === 'hats') return equipped.hats;
    if (c === 'tops') return equipped.tops;
    if (c === 'glasses') return equipped.glasses;
    return equipped.accessories;
  };

  return (
    <div className="panel panel--right">
      <h2 className="panel-title">Wearables (MML)</h2>
      <p className="panel-hint">
        Preview loads the same document as <code className="mono">/api/mml</code> — body <code className="mono">src</code> and each{' '}
        <code className="mono">m-model</code> URL + <code className="mono">socket</code> from that HTML. No local shell catalog.
      </p>
      <p className="panel-hint mono" style={{ fontSize: 12, opacity: 0.85 }}>
        {mmlPreviewLoading ? 'Fetching MML…' : mmlPreviewError ? `MML: ${mmlPreviewError}` : shortUrl(mmlUrl, 64)}
      </p>
      <p className="panel-hint" style={{ fontSize: 11 }}>
        Hub on a preview domain but GLBs live on production? Set <code className="mono">VITE_PUBLIC_ASSET_ORIGIN</code> (see{' '}
        <code className="mono">.env.example</code>) so <code className="mono">/builder/models/*</code> resolves.
      </p>

      <label className="field-label" htmlFor="mml-socket-override">
        Manual socket override (testing)
      </label>
      <select
        id="mml-socket-override"
        name="mml-socket-override"
        className="field-select"
        value={manualSocketOverride ?? ''}
        onChange={(e) => setManualSocketOverride(e.target.value || null)}
      >
        <option value="">(use MML socket per model)</option>
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

      {cat === 'accessories' ? (
        <p className="panel-hint">Accessories are not emitted by <code className="mono">/api/mml</code> yet (only hat, shirt, glasses).</p>
      ) : (
        <div className="wearable-mml-slot">
          <h3 className="subhead" style={{ marginTop: 8 }}>
            {cat === 'hats' ? 'Hat' : cat === 'tops' ? 'Shirt' : 'Glasses / eyes'}
          </h3>
          {CATS.find((x) => x.key === cat)?.mmlNote ? <p className="panel-hint">{CATS.find((x) => x.key === cat)?.mmlNote}</p> : null}

          <div className="btn-row" style={{ flexWrap: 'wrap', gap: 6 }}>
            <button
              type="button"
              className={`btn ${equipVal(cat) == null ? 'btn--primary' : ''}`}
              onClick={() => setEquipped(cat, null)}
            >
              NFT default
            </button>
            <button
              type="button"
              className={`btn ${equipVal(cat) === MML_SLOT_OFF ? 'btn--primary' : ''}`}
              onClick={() => setEquipped(cat, MML_SLOT_OFF)}
            >
              Hidden
            </button>
          </div>

          <p className="panel-hint">
            {(() => {
              const sk = slotKey(cat);
              const t = sk ? traits[sk] : undefined;
              return t ? <>Metadata trait: <strong>{t}</strong></> : <>No matching trait on metadata (slot still works via overrides).</>;
            })()}
          </p>

          {(() => {
            const pm = previewModelForCat(cat);
            if (!pm) {
              return <p className="panel-hint">No <code className="mono">m-model</code> for this slot in the current MML (hidden or absent).</p>;
            }
            return (
              <div className="mono-block" style={{ fontSize: 11, lineHeight: 1.35 }}>
                <div>
                  <span style={{ opacity: 0.75 }}>socket</span> {pm.socket}
                </div>
                <div>
                  <span style={{ opacity: 0.75 }}>src</span> {shortUrl(pm.src, 70)}
                </div>
              </div>
            );
          })()}

          <label className="field-label" style={{ marginTop: 10 }} htmlFor={`mml-override-${cat}`}>
            Override stem or full GLB URL (<code className="mono">hat=</code> / <code className="mono">shirt=</code> /{' '}
            <code className="mono">glasses=</code>)
          </label>
          <div className="row">
            <input
              id={`mml-override-${cat}`}
              name={`mml-override-${cat}`}
              className="field-input"
              placeholder="e.g. Antler or https://…/file.glb"
              value={draft[cat] ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, [cat]: e.target.value }))}
            />
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                const v = (draft[cat] || '').trim();
                setEquipped(cat, v || null);
              }}
            >
              Apply
            </button>
          </div>
        </div>
      )}

      {debugSockets ? (
        <details className="bone-hint">
          <summary>Bone / socket catalog</summary>
          <ul className="mono-list">
            {SOCKET_OPTIONS.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
