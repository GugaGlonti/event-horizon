import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { DoubleSide, type Mesh } from 'three';
import { advanceAngle } from '@/engine/simulation/rotation';
import { useRotationEnabled } from '@/hooks/useRotationEnabled';

const RING_BANDS = [
  { inner: 2.75, outer: 2.79, color: '#8e7864', opacity: 0.3 },
  { inner: 2.88, outer: 3.14, color: '#a18a70', opacity: 0.75 },
  { inner: 3.17, outer: 3.36, color: '#b4a18c', opacity: 0.85 },
  { inner: 3.4, outer: 3.46, color: '#6c6056', opacity: 0.6 },
  { inner: 3.56, outer: 3.88, color: '#9a8774', opacity: 0.75 },
  { inner: 3.92, outer: 4.08, color: '#756857', opacity: 0.45 },
  { inner: 4.15, outer: 4.18, color: '#ad9980', opacity: 0.3 },
] as const;

export function CelestialBody() {
  const body = useRef<Mesh>(null);
  const rotationEnabled = useRotationEnabled();

  useFrame((_, delta) => {
    if (body.current && rotationEnabled) {
      body.current.rotation.y = advanceAngle(body.current.rotation.y, 0.065, delta);
    }
  });

  return (
    <group rotation={[0.15, 0, -0.28]}>
      <mesh ref={body}>
        <icosahedronGeometry args={[2.15, 4]} />
        <meshStandardMaterial color="#9a8170" roughness={0.92} metalness={0.08} flatShading />
      </mesh>
      <group rotation={[-Math.PI / 2, 0, 0]}>
        {RING_BANDS.map((band) => (
          <mesh key={band.inner}>
            <ringGeometry args={[band.inner, band.outer, 160]} />
            <meshStandardMaterial
              color={band.color}
              roughness={1}
              side={DoubleSide}
              transparent
              opacity={band.opacity}
            />
          </mesh>
        ))}
        <mesh>
          <ringGeometry args={[5.05, 5.055, 192]} />
          <meshBasicMaterial color="#7d8a96" transparent opacity={0.16} side={DoubleSide} />
        </mesh>
      </group>
    </group>
  );
}
