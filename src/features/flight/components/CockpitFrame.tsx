import type { RefObject } from 'react';
import type { Group } from 'three';

export function CockpitFrame({
  frameRef,
  visible,
}: {
  frameRef: RefObject<Group | null>;
  visible: boolean;
}) {
  return (
    <group ref={frameRef} visible={visible}>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 1.28, -0.55, -1.65]} rotation={[0, 0, side * 0.4]}>
          <boxGeometry args={[0.1, 1.9, 0.14]} />
          <meshStandardMaterial color="#18222a" metalness={0.5} roughness={0.6} />
        </mesh>
      ))}
      <mesh position={[0, -1.08, -1.5]} rotation={[-0.2, 0, 0]}>
        <boxGeometry args={[2.8, 0.2, 0.5]} />
        <meshStandardMaterial color="#172129" roughness={0.7} metalness={0.3} />
      </mesh>
      <mesh position={[0, -0.96, -1.45]}>
        <boxGeometry args={[0.65, 0.012, 0.04]} />
        <meshBasicMaterial color="#74c9bf" toneMapped={false} />
      </mesh>
    </group>
  );
}
