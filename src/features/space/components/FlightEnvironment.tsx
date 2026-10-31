import { useMemo } from 'react';
import { GAME_CONFIG } from '@/features/flight/config';
import { CelestialBody } from '@/features/planets/components/CelestialBody';

const config = GAME_CONFIG.environment;

function createDust() {
  const data = new Float32Array(config.dustCount * 3);
  // Stable local scenery; no work or allocation during simulation ticks.
  let seed = 6849;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let index = 0; index < config.dustCount; index += 1) {
    data[index * 3] = (random() - 0.5) * config.dustWidth;
    data[index * 3 + 1] = (random() - 0.5) * config.dustHeight;
    data[index * 3 + 2] = 200 - random() * config.dustDepth;
  }
  return data;
}

export function FlightEnvironment() {
  const dust = useMemo(createDust, []);
  return (
    <>
      <ambientLight color="#bccfdf" intensity={0.6} />
      <directionalLight position={[-5, 5, 6]} color="#ffdfb5" intensity={3.2} />
      <directionalLight position={[2, 1, -5]} color="#8aaac8" intensity={0.9} />
      <group position={config.planetPosition} scale={config.planetScale}>
        <CelestialBody />
      </group>
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[dust, 3]} />
        </bufferGeometry>
        <pointsMaterial size={0.4} color="#8caaa9" transparent opacity={0.55} depthWrite={false} />
      </points>
      {config.gateDistances.map((distance, index) => (
        <group key={distance} position={[0, 0, -distance]}>
          <mesh>
            <torusGeometry args={[config.gateRadius, 0.18, 6, 64]} />
            <meshBasicMaterial color="#3d7779" />
          </mesh>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * config.gateRadius, 0, 0]}>
              <boxGeometry args={[0.65, 3, 0.65]} />
              <meshStandardMaterial
                color="#65777b"
                emissive={index % 2 ? '#c08248' : '#65bbb6'}
                emissiveIntensity={1.2}
              />
            </mesh>
          ))}
        </group>
      ))}
    </>
  );
}
