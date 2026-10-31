import { useMemo } from 'react';
import { useSceneStore } from '@/stores/sceneStore';

const STAR_COUNT = 2400;
const STAR_RADIUS = 85;

function createStarPositions() {
  const positions = new Float32Array(STAR_COUNT * 3);

  for (let index = 0; index < STAR_COUNT; index += 1) {
    const y = Math.random() * 2 - 1;
    const azimuth = Math.random() * Math.PI * 2;
    const radius = Math.sqrt(1 - y * y) * STAR_RADIUS;
    positions[index * 3] = Math.cos(azimuth) * radius;
    positions[index * 3 + 1] = y * STAR_RADIUS;
    positions[index * 3 + 2] = Math.sin(azimuth) * radius;
  }

  return positions;
}

export function Starfield() {
  const positions = useMemo(createStarPositions, []);
  const visible = useSceneStore((state) => state.starsVisible);

  // Keep the same positions when hidden. Fiber owns and disposes both resources.
  return (
    <points visible={visible}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color="#c2ccdd"
        size={0.09}
        sizeAttenuation
        transparent
        opacity={0.75}
        depthWrite={false}
        toneMapped={false}
      />
    </points>
  );
}
