import { useEffect, useMemo, useState } from 'react';
import { AvatarViewer } from '@/components/AvatarViewer';
import { WearablePanel } from '@/components/WearablePanel';
import { AnimationControls } from '@/components/AnimationControls';
import { useBuilderStore, loadLoadoutFromStorage, saveLoadoutToStorage } from '@/store/builderStore';
import { buildMmlApiUrl, buildMmlViewerOpenUrl } from '@/lib/mmlExport';
import { listRegisteredAvatars } from '@/data/avatars';
import { parseMmlHtml } from '@/lib/parseMmlHtml';

function syncUrlToken(tokenId: number) {
  try {
    const u = new URL(window.location.href);
    u.searchParams.set('id', String(tokenId));
    window.history.replaceState(null, '', `${u.pathname}?${u.searchParams.toString()}`);
  } catch {
    /* ignore */
  }
}

export function BuilderPage() {
  const tokenId = useBuilderStore((s) => s.tokenId);
  const setTokenId = useBuilderStore((s) => s.setTokenId);
  const equipped = useBuilderStore((s) => s.equipped);
  const setMmlPreview = useBuilderStore((s) => s.setMmlPreview);
  const setMmlPreviewLoading = useBuilderStore((s) => s.setMmlPreviewLoading);
  const setMmlPreviewError = useBuilderStore((s) => s.setMmlPreviewError);
  const setLoadError = useBuilderStore((s) => s.setLoadError);
  const clearLoadout = useBuilderStore((s) => s.clearLoadout);
  const [input, setInput] = useState(String(tokenId));
  const [exportMsg, setExportMsg] = useState('');

  useEffect(() => {
    const url = buildMmlApiUrl(tokenId, equipped);
    const ac = new AbortController();
    setMmlPreviewLoading(true);
    setMmlPreviewError(null);
    fetch(url, { signal: ac.signal })
      .then(async (r) => {
        const text = await r.text();
        if (!r.ok) throw new Error(text.slice(0, 220) || `${r.status} ${r.statusText}`);
        return text;
      })
      .then((html) => {
        const parsed = parseMmlHtml(html);
        setMmlPreview(parsed);
        setLoadError(null);
      })
      .catch((e: unknown) => {
        if (ac.signal.aborted) return;
        const err = e instanceof Error ? e : new Error(String(e));
        if (err.name === 'AbortError') return;
        const msg = err.message || String(e);
        setMmlPreview(null);
        setMmlPreviewError(msg);
        setLoadError(msg);
      })
      .finally(() => {
        if (!ac.signal.aborted) setMmlPreviewLoading(false);
      });
    return () => ac.abort();
  }, [tokenId, equipped, setMmlPreview, setMmlPreviewLoading, setMmlPreviewError, setLoadError]);

  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const raw = sp.get('id');
      if (raw) {
        const n = parseInt(raw, 10);
        if (!Number.isNaN(n) && n >= 1 && n <= 2222) {
          setTokenId(n);
          setInput(String(n));
        }
      }
    } catch {
      /* ignore */
    }
  }, [setTokenId]);

  useEffect(() => {
    setInput(String(tokenId));
    const loaded = loadLoadoutFromStorage(tokenId);
    useBuilderStore.setState({ equipped: loaded });
  }, [tokenId]);

  const mmlUrl = useMemo(() => buildMmlApiUrl(tokenId, equipped), [tokenId, equipped]);
  const viewerUrl = useMemo(() => buildMmlViewerOpenUrl(tokenId, equipped), [tokenId, equipped]);
  const mmlWorkbench = useMemo(() => {
    const o = window.location.origin.replace(/\/$/, '');
    return `${o}/3d-builder.html?url=${encodeURIComponent(mmlUrl)}#mml`;
  }, [mmlUrl]);

  const applyToken = () => {
    const n = parseInt(input, 10);
    if (Number.isNaN(n) || n < 1 || n > 2222) {
      setExportMsg('Token ID must be 1–2222.');
      return;
    }
    setTokenId(n);
    syncUrlToken(n);
    setExportMsg(`Loaded token #${n}`);
  };

  const saveLoadout = () => {
    saveLoadoutToStorage(tokenId, equipped);
    setExportMsg('Loadout saved to this browser (localStorage).');
  };

  const clearSaved = () => {
    clearLoadout();
    try {
      localStorage.removeItem(`otterful-equipped-${tokenId}`);
    } catch {
      /* ignore */
    }
    setExportMsg('Cleared equipped items and storage for this token.');
  };

  const copyMml = async () => {
    try {
      await navigator.clipboard.writeText(mmlUrl);
      setExportMsg('Copied MML API URL.');
    } catch {
      setExportMsg(mmlUrl);
    }
  };

  return (
    <div className="builder-shell">
      <header className="top-bar">
        <div className="brand">
          <span className="brand-mark">◆</span>
          <div>
            <div className="brand-title">Otterful Hub</div>
            <div className="brand-sub">3D Avatar Builder · MML preview</div>
          </div>
        </div>
      </header>

      <div className="builder-grid">
        <aside className="panel panel--left">
          <h2 className="panel-title">Avatar / token</h2>
          <label className="field-label" htmlFor="tok">
            Token ID (1–2222)
          </label>
          <div className="row">
            <input
              id="tok"
              className="field-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              inputMode="numeric"
            />
            <button type="button" className="btn btn--primary" onClick={applyToken}>
              Apply
            </button>
          </div>
          <p className="panel-hint">Route example: <code className="mono">/builder/?id=26</code></p>
          <h3 className="subhead">Registry</h3>
          <ul className="mono-list compact">
            {listRegisteredAvatars().map((a) => (
              <li key={a.tokenId}>
                <button
                  type="button"
                  className="linkish"
                  onClick={() => {
                    setTokenId(a.tokenId);
                    setInput(String(a.tokenId));
                    syncUrlToken(a.tokenId);
                  }}
                >
                  #{a.tokenId}
                </button>{' '}
                — {a.displayName}
              </li>
            ))}
          </ul>
          <div className="stack-btns">
            <button type="button" className="btn" onClick={saveLoadout}>
              Save loadout
            </button>
            <button type="button" className="btn btn--danger" onClick={clearSaved}>
              Clear loadout
            </button>
          </div>
        </aside>

        <main className="viewport-wrap">
          <AvatarViewer />
        </main>

        <WearablePanel />
      </div>

      <AnimationControls />

      <section className="export-panel">
        <h2 className="panel-title">MML export</h2>
        <p className="panel-hint">
          Uses live <code className="mono">/api/mml</code> with query overrides (<code className="mono">hat</code>,{' '}
          <code className="mono">shirt</code>, <code className="mono">glasses</code>, <code className="mono">no_hat</code>,{' '}
          <code className="mono">no_shirt</code>, <code className="mono">no_glasses</code>). The 3D preview parses the same
          HTML the viewer loads — body <code className="mono">src</code> and each <code className="mono">m-model</code> socket + URL.
        </p>
        <div className="mono-block">{mmlUrl}</div>
        <div className="btn-row">
          <button type="button" className="btn btn--primary" onClick={copyMml}>
            Copy MML URL
          </button>
          <a className="btn" href={viewerUrl} target="_blank" rel="noreferrer">
            Open MML viewer
          </a>
          <a className="btn" href={mmlWorkbench} target="_blank" rel="noreferrer">
            Open 3D Builder MML tab
          </a>
        </div>
        {exportMsg ? <p className="export-msg">{exportMsg}</p> : null}
      </section>
    </div>
  );
}
