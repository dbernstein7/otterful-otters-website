import { Html, OrbitControls, useGLTF, Center, ContactShadows } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { getAvatarByToken, resolveAssetUrl, type AnimationKey, type AvatarConfig } from '@/data/avatars';
import { attachWearableToSocket, type TransformConfig } from '@/lib/socketAttach';
import { remapClipTracksToRig } from '@/lib/clipRemap';
import { useBuilderStore } from '@/store/builderStore';
import type { MmlAnchorModel } from '@/lib/parseMmlHtml';
import { SocketDebugger } from '@/components/SocketDebugger';

const loader = new GLTFLoader();
loader.setCrossOrigin('anonymous');

function CameraResetListener() {
  const nonce = useBuilderStore((s) => s.cameraResetNonce);
  const controls = useThree((st) => st.controls as { reset?: () => void } | null);
  const seen = useRef(0);
  useEffect(() => {
    if (nonce === 0) return;
    if (nonce === seen.current) return;
    seen.current = nonce;
    controls?.reset?.();
  }, [nonce, controls]);
  return null;
}

function pickClip(gltf: { animations?: THREE.AnimationClip[] }, hint: string): THREE.AnimationClip | null {
  const clips = gltf.animations || [];
  if (!clips.length) return null;
  const h = hint.toLowerCase();
  const scored = clips.map((c) => {
    const n = c.name.toLowerCase();
    let s = 0;
    if (n.includes(h)) s += 10;
    if (h === 'idle' && n.includes('idle')) s += 5;
    if (h === 'walk' && n.includes('walk')) s += 5;
    if (h === 'run' && n.includes('run')) s += 5;
    if (h === 'jump' && n.includes('jump')) s += 5;
    if (h === 'dance' && (n.includes('dance') || n.includes('wave'))) s += 5;
    return { c, s };
  });
  scored.sort((a, b) => b.s - a.s);
  return scored[0]?.c ?? clips[0] ?? null;
}

function modelToTransformConfig(model: MmlAnchorModel): TransformConfig {
  const cfg: TransformConfig = {};
  if (model.position) cfg.position = model.position;
  if (model.rotation) cfg.rotation = model.rotation;
  if (model.scale) {
    const [sx, sy, sz] = model.scale;
    cfg.scale = sx === sy && sy === sz ? sx : [sx, sy, sz];
  }
  return cfg;
}

type AvatarRigProps = {
  config: AvatarConfig;
  bodyUrl: string;
};

function AvatarRig({ config, bodyUrl }: AvatarRigProps) {
  const { scene, animations } = useGLTF(bodyUrl);
  const root = useMemo(() => scene.clone(true), [scene, bodyUrl]);
  const mmlModels = useBuilderStore((s) => s.mmlPreview?.models);
  const characterAnim = useBuilderStore((s) => s.mmlPreview?.characterAnim);
  const attachKey = useMemo(
    () => (mmlModels ?? []).map((m) => `${m.src}\x1e${m.socket}`).join('\x1f'),
    [mmlModels],
  );
  const manualSocketOverride = useBuilderStore((s) => s.manualSocketOverride);
  const debugSockets = useBuilderStore((s) => s.debugSockets);
  const activeAnimKey = useBuilderStore((s) => s.activeAnimKey);
  const othersideMotionTest = useBuilderStore((s) => s.othersideMotionTest);
  const setLoadError = useBuilderStore((s) => s.setLoadError);

  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actionsRef = useRef<Partial<Record<string, THREE.AnimationAction>>>({});

  const motionTRef = useRef(0);
  const motionPhaseRef = useRef(0);

  useEffect(() => {
    setLoadError(null);
  }, [bodyUrl, setLoadError]);

  useEffect(() => {
    const m = new THREE.AnimationMixer(root);
    mixerRef.current = m;
    const clipsBody = animations || [];
    for (const c of clipsBody) {
      const act = m.clipAction(c);
      act.stop();
    }
    return () => {
      m.stopAllAction();
      mixerRef.current = null;
    };
  }, [root, animations]);

  useEffect(() => {
    const m = mixerRef.current;
    if (!m) return;
    Object.values(actionsRef.current).forEach((a) => a?.stop());
    actionsRef.current = {};

    const base = config.animationUrls || {};
    const mmlIdle = characterAnim?.trim();

    const urlsForKey = (key: AnimationKey): string[] => {
      const u = base[key];
      if (key === 'idle') {
        const list: string[] = [];
        if (mmlIdle) list.push(mmlIdle);
        if (u && u !== mmlIdle) list.push(u);
        return list;
      }
      return u ? [u] : [];
    };

    const keySet = new Set<AnimationKey>(Object.keys(base) as AnimationKey[]);
    if (mmlIdle) keySet.add('idle');
    const keys = [...keySet].filter((k) => urlsForKey(k).length > 0);
    let cancelled = false;

    (async () => {
      for (const key of keys) {
        for (const raw of urlsForKey(key)) {
          const abs = resolveAssetUrl(raw);
          try {
            const gltf = await loader.loadAsync(abs);
            if (cancelled) return;
            const clipRaw = pickClip(gltf, key);
            if (!clipRaw) continue;
            const remapped = remapClipTracksToRig(clipRaw, root);
            const clip = remapped ?? clipRaw;
            if (!clip.tracks.length) continue;
            const act = m.clipAction(clip);
            act.reset();
            act.setEffectiveWeight(0);
            act.play();
            actionsRef.current[key] = act;
            break;
          } catch (e) {
            console.warn(`[AvatarViewer] Failed to load animation "${key}" from ${abs}`, e);
          }
        }
      }
    })();

    return () => {
      cancelled = true;
      Object.values(actionsRef.current).forEach((a) => a?.stop());
      actionsRef.current = {};
    };
  }, [config.animationUrls, characterAnim, root]);

  useEffect(() => {
    const detachers: (() => void)[] = [];
    let cancelled = false;
    const list = useBuilderStore.getState().mmlPreview?.models ?? [];

    (async () => {
      for (const model of list) {
        const socket = manualSocketOverride || model.socket;
        const tcfg = modelToTransformConfig(model);
        try {
          const gltf = await loader.loadAsync(resolveAssetUrl(model.src));
          if (cancelled) return;
          const att = attachWearableToSocket(root, gltf.scene, socket, tcfg);
          if (att) detachers.push(att.detach);
        } catch (e) {
          console.warn(`[AvatarViewer] MML wearable load failed`, model.src, e);
        }
      }
    })();

    return () => {
      cancelled = true;
      detachers.forEach((d) => d());
    };
  }, [attachKey, manualSocketOverride, root]);

  useFrame((_, dt) => {
    const m = mixerRef.current;
    if (!m) return;
    m.update(dt);

    const acts = actionsRef.current;
    const keys = Object.keys(acts);

    if (othersideMotionTest && keys.length) {
      motionTRef.current += dt;
      if (motionTRef.current > 2.4) {
        motionTRef.current = 0;
        motionPhaseRef.current = (motionPhaseRef.current + 1) % 3;
      }
      const order = ['idle', 'walk', 'run'];
      const cur = order[motionPhaseRef.current % 3];
      keys.forEach((k) => {
        const a = acts[k];
        if (!a) return;
        a.setEffectiveWeight(k === cur ? 1 : 0);
      });
      return;
    }

    const active = activeAnimKey || 'idle';
    keys.forEach((k) => {
      const a = acts[k];
      if (!a) return;
      a.setEffectiveWeight(k === active ? 1 : 0);
    });
  });

  return (
    <group>
      <Center>
        <primitive object={root} castShadow receiveShadow />
      </Center>
      <ContactShadows position={[0, 0, 0]} opacity={0.45} scale={12} blur={2.5} far={6} />
      {debugSockets ? <SocketDebugger root={root} /> : null}
    </group>
  );
}

function Loading() {
  return (
    <Html center>
      <div className="hub-hud">Loading avatar…</div>
    </Html>
  );
}

function Scene() {
  const tokenId = useBuilderStore((s) => s.tokenId);
  const mmlPreview = useBuilderStore((s) => s.mmlPreview);
  const cfg = useMemo(() => getAvatarByToken(tokenId), [tokenId]);
  const bodyUrl = useMemo(() => {
    const src = mmlPreview?.characterSrc?.trim();
    if (src) return resolveAssetUrl(src);
    return resolveAssetUrl(cfg.modelUrl);
  }, [mmlPreview?.characterSrc, cfg.modelUrl]);

  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight
        castShadow
        position={[5, 12, 8]}
        intensity={1.15}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-far={40}
        shadow-camera-near={0.5}
      />
      <mesh rotation-x={-Math.PI / 2} receiveShadow position={[0, 0, 0]}>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#0f1520" roughness={0.9} metalness={0.05} />
      </mesh>
      <Suspense key={bodyUrl} fallback={<Loading />}>
        <AvatarRig config={cfg} bodyUrl={bodyUrl} />
      </Suspense>
      <OrbitControls makeDefault minDistance={0.75} maxDistance={14} target={[0, 0.95, 0]} />
      <CameraResetListener />
    </>
  );
}

export function AvatarViewer() {
  return (
    <div className="avatar-viewer-wrap">
      <Canvas shadows camera={{ position: [2.2, 1.45, 2.8], fov: 42, near: 0.05, far: 80 }}>
        <color attach="background" args={['#070a12']} />
        <fog attach="fog" args={['#070a12', 12, 55]} />
        <Scene />
      </Canvas>
    </div>
  );
}
