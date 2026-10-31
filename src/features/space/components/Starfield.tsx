import { useMemo } from 'react';
import { useSceneStore } from '@/stores/sceneStore';

const STAR_COUNT = 2400;

function createStarPositions(radius: number, seed: number) {
  const positions = new Float32Array(STAR_COUNT * 3);
  let value = seed;
  const random = () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };

  for (let index = 0; index < STAR_COUNT; index += 1) {
    const y = random() * 2 - 1;
    const azimuth = random() * Math.PI * 2;
    const horizontalRadius = Math.sqrt(1 - y * y) * radius;
    positions[index * 3] = Math.cos(azimuth) * horizontalRadius;
    positions[index * 3 + 1] = y * radius;
    positions[index * 3 + 2] = Math.sin(azimuth) * horizontalRadius;
  }

  return positions;
}

export function Starfield({
  radius = 85,
  size = 0.09,
  seed = 73,
}: {
  radius?: number;
  size?: number;
  seed?: number;
}) {
  const positions = useMemo(() => createStarPositions(radius, seed), [radius, seed]);
  const visible = useSceneStore((state) => state.starsVisible);

  // Keep the same positions when hidden. Fiber owns and disposes both resources.
  return (
    <points visible={visible}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color="#c2ccdd"
        size={size}
        sizeAttenuation
        transparent
        opacity={0.75}
        depthWrite={false}
        toneMapped={false}
      />
    </points>
  );
}
