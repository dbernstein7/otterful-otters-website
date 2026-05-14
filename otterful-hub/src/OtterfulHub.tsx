import { useCallback, useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { HubCanvasRoot } from './HubCanvas';
import { parseMmlHtml, tokenIdFromMmlUrl, type ParsedMml } from './parseMml';
import './hub.css';

const DEFAULT_MML_URL = 'https://www.otterfulotters.xyz/api/mml?id=26';

export default function OtterfulHub() {
  const [mmlUrl, setMmlUrl] = useState(DEFAULT_MML_URL);
  const [inputUrl, setInputUrl] = useState(DEFAULT_MML_URL);
  const [parsed, setParsed] = useState<ParsedMml | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [avatarOk, setAvatarOk] = useState(false);

  const tokenId = useMemo(() => tokenIdFromMmlUrl(mmlUrl) ?? '26', [mmlUrl]);

  const loadFromUrl = useCallback(async (url: string) => {
    const u = url.trim();
    setLoading(true);
    setError(null);
    setParsed(null);
    setAvatarOk(false);
    setMmlUrl(u);
    try {
      const res = await fetch(u, { credentials: 'omit', mode: 'cors' });
      if (!res.ok) throw new Error(`MML fetch failed (${res.status})`);
      const html = await res.text();
      const p = parseMmlHtml(html);
      setParsed(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setParsed(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFromUrl(DEFAULT_MML_URL);
  }, [loadFromUrl]);

  const onAvatarRoot = useCallback((root: THREE.Group | null, _mixer: THREE.AnimationMixer | null) => {
    setAvatarOk(!!root && root.children.length > 0);
  }, []);

  const modelUrls = useMemo(() => {
    if (!parsed) return { body: '—', wearables: [] as string[], anim: '—' };
    return {
      body: parsed.bodySrc,
      wearables: parsed.wearables.map((w) => `${w.socket}: ${w.src}`),
      anim: parsed.animSrc ?? '—',
    };
  }, [parsed]);

  return (
    <div className="otterful-hub">
      <main className="otterful-hub-main">
        <div className="otterful-hub-canvas">
          {parsed ? (
            <HubCanvasRoot parsed={parsed} onAvatarRoot={onAvatarRoot} />
          ) : (
            <div className="otterful-hub-canvas-fallback">
              {loading ? 'Loading MML…' : error ?? 'No MML loaded.'}
            </div>
          )}
        </div>
        <aside className="otterful-hub-panel" aria-label="MML and asset details">
          <h1 className="otterful-hub-title">Otterful Hub</h1>
          <p className="otterful-hub-lede">MML document is the source of truth. WASD to move.</p>

          <label className="otterful-hub-label" htmlFor="hub-mml-url">
            MML document URL
          </label>
          <textarea
            id="hub-mml-url"
            className="otterful-hub-textarea"
            rows={3}
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            spellCheck={false}
          />
          <button type="button" className="otterful-hub-btn" onClick={() => void loadFromUrl(inputUrl)}>
            Load MML
          </button>

          <hr className="otterful-hub-hr" />

          <div className="otterful-hub-stat">
            <span className="otterful-hub-stat-label">Token ID</span>
            <span className="otterful-hub-stat-value">{tokenId}</span>
          </div>

          <div className="otterful-hub-stat">
            <span className="otterful-hub-stat-label">Active MML URL</span>
            <code className="otterful-hub-code">{mmlUrl}</code>
          </div>

          <div className="otterful-hub-stat">
            <span className="otterful-hub-stat-label">Body GLB (m-character src)</span>
            <code className="otterful-hub-code">{modelUrls.body}</code>
          </div>

          <div className="otterful-hub-stat">
            <span className="otterful-hub-stat-label">Animation URL (m-character anim)</span>
            <code className="otterful-hub-code">{modelUrls.anim}</code>
          </div>

          <div className="otterful-hub-stat">
            <span className="otterful-hub-stat-label">Wearables (m-model)</span>
            {modelUrls.wearables.length === 0 ? (
              <span className="otterful-hub-muted">None in document</span>
            ) : (
              <ul className="otterful-hub-list">
                {modelUrls.wearables.map((line) => (
                  <li key={line}>
                    <code className="otterful-hub-code">{line}</code>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="otterful-hub-stat">
            <span className="otterful-hub-stat-label">Avatar in scene</span>
            <span className="otterful-hub-stat-value">{avatarOk ? 'Loaded from MML' : loading || error ? '—' : 'Not ready'}</span>
          </div>

          {error && <p className="otterful-hub-error">{error}</p>}
        </aside>
      </main>
    </div>
  );
}
