import { useFrame } from '@react-three/fiber';
import { type RefObject, useMemo, useRef } from 'react';
import { type InstancedMesh, Object3D } from 'three';
/** Cosmetic gear consumes a scalar presentation ref; spacecraft assets know no simulation types. */
export function LandingGear({
  deployed,
  reducedMotion,
}: {
  deployed: RefObject<boolean>;
  reducedMotion: boolean;
}) {
  const mesh = useRef<InstancedMesh>(null),
    progress = useRef(0);
  const object = useMemo(() => new Object3D(), []);
  useFrame((_, dt) => {
    if (!mesh.current) return;
    const target = deployed.current ? 1 : 0;
    const next = reducedMotion
      ? target
      : progress.current + Math.max(-dt * 2, Math.min(dt * 2, target - progress.current));
    mesh.current.visible = next > 0.001;
    if (next === progress.current) return;
    progress.current = next;
    for (let i = 0; i < 4; i++) {
      const x = (i % 2 ? 1 : -1) * 1.7,
        z = (i < 2 ? 1 : -1) * 1.6;
      object.position.set(x, -0.7 - 2.1 * next, z);
      object.scale.set(0.22, 4.2 * next, 0.22);
      object.updateMatrix();
      mesh.current.setMatrixAt(i * 2, object.matrix);
      object.position.y = -0.7 - 4.2 * next;
      object.scale.set(1, 0.2, 1.4);
      object.updateMatrix();
      mesh.current.setMatrixAt(i * 2 + 1, object.matrix);
    }
    mesh.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, 8]}
      visible={false}
      frustumCulled={false}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#83929e" metalness={0.65} roughness={0.55} />
    </instancedMesh>
  );
}
