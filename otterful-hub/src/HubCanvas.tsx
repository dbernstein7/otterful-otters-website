import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Clone, Grid, Html } from '@react-three/drei';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { ParsedMml } from './parseMml';
import { attachWearableGltf, fitAndGround, loadGltf, mountIdleWalkRun } from './avatarUtils';

function ChaseCamera({ target }: { target: React.RefObject<THREE.Group> }) {
  const { camera } = useThree();
  const tmp = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const t = target.current;
    if (!t) return;
    tmp.set(0, 2.9, 7.2);
    tmp.applyQuaternion(t.quaternion);
    const want = t.position.clone().add(tmp);
    camera.position.lerp(want, 0.14);
    camera.lookAt(t.position.x, t.position.y + 1.05, t.position.z);
  });
  return null;
}

function PortalZone({
  position,
  color,
  label,
}: {
  position: [number, number, number];
  color: string;
  label: string;
}) {
  return (
    <group position={position}>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <ringGeometry args={[2.1, 3.1, 48]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.4}
          roughness={0.55}
          metalness={0.15}
        />
      </mesh>
      <Html position={[0, 2.4, 0]} center transform occlude={false}>
        <div className="hub-portal-label">{label}</div>
      </Html>
    </group>
  );
}

function disposeGroup(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.geometry?.dispose?.();
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      mats.forEach((mat) => {
        if (mat && typeof (mat as THREE.Material).dispose === 'function') (mat as THREE.Material).dispose();
      });
    }
  });
}

export type LocomotionActions = {
  idle: THREE.AnimationAction | null;
  walk: THREE.AnimationAction | null;
  run: THREE.AnimationAction | null;
};

type BuiltCb = (root: THREE.Group | null, mixer: THREE.AnimationMixer | null, loco: LocomotionActions | null) => void;

/** Loads GLBs from parsed MML only — no generic substitute avatar. */
function MmlAvatarVisual({ parsed, onBuilt }: { parsed: ParsedMml; onBuilt: BuiltCb }) {
  const onBuiltRef = useRef(onBuilt);
  onBuiltRef.current = onBuilt;

  useEffect(() => {
    let cancelled = false;
    const built = new THREE.Group();
    let mixer: THREE.AnimationMixer | null = null;

    (async () => {
      try {
        const bodyGltf = await loadGltf(parsed.bodySrc);
        if (cancelled) return;
        const model = bodyGltf.scene;
        model.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.castShadow = true;
            mesh.receiveShadow = true;
          }
        });
        fitAndGround(model, 2.05);
        model.updateMatrixWorld(true);
        built.add(model);

        for (const w of parsed.wearables) {
          try {
            const g = await loadGltf(w.src);
            if (cancelled) return;
            g.scene.traverse((o) => {
              const mesh = o as THREE.Mesh;
              if (mesh.isMesh) mesh.castShadow = true;
            });
            if (!attachWearableGltf(model, w.socket, g)) {
              g.scene.position.set(0, 1.15, 0);
              built.add(g.scene);
            }
          } catch {
            /* skip broken wearable */
          }
        }

        mixer = new THREE.AnimationMixer(model);
        let externalAnim: { animations: THREE.AnimationClip[] } | null = null;
        if (parsed.animSrc) {
          try {
            externalAnim = await loadGltf(parsed.animSrc);
          } catch {
            externalAnim = null;
          }
        }
        if (cancelled) return;
        const loco = await mountIdleWalkRun(mixer, model, bodyGltf.animations || [], externalAnim);

        if (!cancelled) onBuiltRef.current(built, mixer, loco);
      } catch {
        if (!cancelled) onBuiltRef.current(null, null, null);
      }
    })();

    return () => {
      cancelled = true;
      if (mixer) mixer.stopAllAction();
      disposeGroup(built);
      built.clear();
    };
  }, [parsed]);

  return null;
}

export function HubCanvas({
  parsed,
  onAvatarRoot,
}: {
  parsed: ParsedMml;
  onAvatarRoot: (root: THREE.Group | null, mixer: THREE.AnimationMixer | null) => void;
}) {
  const playerRef = useRef<THREE.Group>(null);
  const mirrorRef = useRef<THREE.Group>(null);
  const [visual, setVisual] = useState<THREE.Group | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const locoRef = useRef<LocomotionActions | null>(null);
  const keys = useRef<Record<string, boolean>>({});
  const onAvatarRootRef = useRef(onAvatarRoot);
  onAvatarRootRef.current = onAvatarRoot;

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      keys.current[e.code] = true;
    };
    const up = (e: KeyboardEvent) => {
      keys.current[e.code] = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const onBuilt = useCallback<BuiltCb>((root, mixer, loco) => {
    setVisual((prev) => {
      if (prev) {
        disposeGroup(prev);
        prev.clear();
      }
      return root;
    });
    mixerRef.current = mixer;
    locoRef.current = loco;
    onAvatarRootRef.current(root, mixer);
  }, []);

  useFrame((_, dt) => {
    mixerRef.current?.update(dt);

    const g = playerRef.current;
    let fwd = 0;
    let steer = 0;
    if (keys.current.KeyW) fwd += 1;
    if (keys.current.KeyS) fwd -= 1;
    if (keys.current.KeyA) steer += 1;
    if (keys.current.KeyD) steer -= 1;

    if (g) {
      g.rotation.y += steer * 1.85 * dt;
      g.translateZ(-fwd * 5.8 * dt);
    }

    const loco = locoRef.current;
    if (loco?.idle) {
      const sprint = !!(keys.current.ShiftLeft || keys.current.ShiftRight);
      const moving = Math.abs(fwd) > 0.01;
      let walkW = 0;
      let runW = 0;
      if (moving) {
        if (sprint && loco.run) {
          runW = Math.min(1, 0.85 + Math.abs(fwd) * 0.15);
          walkW = Math.min(0.35, (1 - runW) * 0.5);
        } else if (loco.walk) {
          walkW = Math.min(1, 0.65 + Math.abs(fwd) * 0.25);
        }
      }
      const moveLayer = Math.max(walkW, runW);
      loco.idle.setEffectiveWeight(Math.max(0.08, 1 - moveLayer * 0.95));
      if (loco.walk) loco.walk.setEffectiveWeight(walkW * (1 - runW * 0.9));
      if (loco.run) loco.run.setEffectiveWeight(runW);
    }

    if (mirrorRef.current) mirrorRef.current.rotation.y += 0.55 * dt;
  });

  return (
    <>
      <color attach="background" args={['#070d1a']} />
      <fog attach="fog" args={['#070d1a', 22, 95]} />
      <hemisphereLight args={['#b8c4ff', '#1a1208', 0.55]} />
      <directionalLight
        castShadow
        position={[12, 22, 10]}
        intensity={1.05}
        shadow-camera-far={60}
        shadow-camera-near={0.5}
        shadow-mapSize={[2048, 2048]}
      />

      <mesh rotation-x={-Math.PI / 2} receiveShadow position={[0, 0, 0]}>
        <planeGeometry args={[56, 56]} />
        <meshStandardMaterial color="#152018" roughness={0.92} metalness={0.04} />
      </mesh>
      <Grid
        position={[0, 0.02, 0]}
        args={[56, 56]}
        cellSize={1}
        sectionSize={4}
        fadeDistance={42}
        sectionColor="#2a4a38"
        cellColor="#142018"
        infiniteGrid={false}
      />

      <PortalZone position={[-12, 0, -7]} color="#ff6b2d" label="Kart Race" />
      <PortalZone position={[12, 0, -7]} color="#5ad4ff" label="Trait Showroom" />
      <PortalZone position={[0, 0, -16]} color="#c56bff" label="Staking Den" />

      <MmlAvatarVisual parsed={parsed} onBuilt={onBuilt} />

      <group ref={playerRef}>
        {visual && <primitive object={visual} />}
      </group>

      {visual && (
        <group ref={mirrorRef} position={[10, 0, 3]}>
          <Clone object={visual} castShadow receiveShadow />
        </group>
      )}

      <ChaseCamera target={playerRef} />
    </>
  );
}

export function HubCanvasRoot({
  parsed,
  onAvatarRoot,
}: {
  parsed: ParsedMml;
  onAvatarRoot: (root: THREE.Group | null, mixer: THREE.AnimationMixer | null) => void;
}) {
  return (
    <Canvas
      shadows
      gl={{ antialias: true }}
      camera={{ position: [0, 4, 10], fov: 52, near: 0.06, far: 220 }}
      onCreated={({ gl }) => {
        gl.shadowMap.enabled = true;
        gl.setClearColor('#070d1a');
      }}
    >
      <HubCanvas parsed={parsed} onAvatarRoot={onAvatarRoot} />
    </Canvas>
  );
}
