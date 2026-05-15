import { useLayoutEffect, useMemo } from 'react';
import * as THREE from 'three';

type Props = {
  root: THREE.Object3D;
};

const COLORS = ['#5ad4ff', '#ff6b9d', '#c56bff', '#7cffb3', '#ffd166', '#ff8c42'];

function Marker({ host, color }: { host: THREE.Object3D; color: string }) {
  useLayoutEffect(() => {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 10, 10),
      new THREE.MeshBasicMaterial({
        color,
        depthTest: false,
        transparent: true,
        opacity: 0.88,
      })
    );
    mesh.scale.setScalar(0.028);
    mesh.position.set(0, 0, 0);
    host.add(mesh);
    return () => {
      host.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    };
  }, [host, color]);

  return null;
}

/** Spheres parented under bones / *Socket* empties — follows animation (no R3F reparent conflicts). */
export function SocketDebugger({ root }: Props) {
  const hosts = useMemo(() => {
    const out: THREE.Object3D[] = [];
    const seen = new Set<string>();

    root.traverse((o) => {
      if (out.length >= 36) return;
      if (!o.name) return;
      if (/socket/i.test(o.name) && !seen.has(o.name)) {
        seen.add(o.name);
        out.push(o);
      }
    });

    const skinners: THREE.SkinnedMesh[] = [];
    root.traverse((o) => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinners.push(o as THREE.SkinnedMesh);
    });
    skinners.sort((a, b) => (b.skeleton?.bones?.length ?? 0) - (a.skeleton?.bones?.length ?? 0));
    const primary = skinners[0];
    if (primary?.skeleton?.bones) {
      for (const b of primary.skeleton.bones) {
        if (out.length >= 48) break;
        if (!b.name || seen.has(b.name)) continue;
        seen.add(b.name);
        out.push(b);
      }
    }
    return out;
  }, [root]);

  return (
    <>
      {hosts.map((h, i) => (
        <Marker key={`${h.uuid}-${i}`} host={h} color={COLORS[i % COLORS.length]!} />
      ))}
    </>
  );
}
