import type { RefObject } from 'react';
import { AdditiveBlending, type Group } from 'three';

interface StarfighterProps {
  modelRef: RefObject<Group | null>;
  exhaustRef: RefObject<Group | null>;
  visible: boolean;
  paint?: string;
  engineColor?: string;
}

/** Original Kestrel silhouette. The model's local nose points along -Z. */
export function Starfighter({
  modelRef,
  exhaustRef,
  visible,
  paint = '#b3b9bc',
  engineColor = '#73eaff',
}: StarfighterProps) {
  return (
    <group ref={modelRef} visible={visible}>
      <mesh>
        <boxGeometry args={[1.15, 0.65, 3.4]} />
        <meshStandardMaterial color={paint} roughness={0.55} metalness={0.5} />
      </mesh>
      <mesh position={[0, 0, -2.5]} rotation={[-Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.68, 3.2, 4]} />
        <meshStandardMaterial color={paint} roughness={0.5} metalness={0.45} />
      </mesh>
      <mesh position={[0, 0.44, -0.65]} scale={[0.53, 0.4, 1.1]}>
        <sphereGeometry args={[1, 20, 12]} />
        <meshStandardMaterial
          color="#112a35"
          emissive="#0d2630"
          emissiveIntensity={0.4}
          roughness={0.2}
          metalness={0.7}
        />
      </mesh>
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh position={[side * 2.1, -0.1, 0.65]} rotation={[0, side * -0.25, side * -0.08]}>
            <boxGeometry args={[3.4, 0.13, 1.7]} />
            <meshStandardMaterial color={paint} roughness={0.65} metalness={0.4} />
          </mesh>
          <mesh position={[side * 2.2, 0.01, 0.75]} rotation={[0, side * -0.25, 0]}>
            <boxGeometry args={[2.3, 0.08, 0.25]} />
            <meshStandardMaterial color="#c58a5c" roughness={0.7} />
          </mesh>
          <mesh position={[side * 3.5, 0.2, 1.1]} rotation={[0, 0, side * -0.25]}>
            <boxGeometry args={[0.12, 0.8, 1.9]} />
            <meshStandardMaterial color="#6c7a81" roughness={0.6} metalness={0.4} />
          </mesh>
          <mesh position={[side * 2.65, 0, 1.3]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.38, 0.42, 2.8, 12]} />
            <meshStandardMaterial color="#404b54" roughness={0.5} metalness={0.65} />
          </mesh>
          <mesh position={[side * 2.65, 0, 2.72]}>
            <circleGeometry args={[0.3, 20]} />
            <meshBasicMaterial color="#b8f8ff" toneMapped={false} />
          </mesh>
        </group>
      ))}
      <group ref={exhaustRef} position={[0, 0, 2.75]}>
        {[-1, 1].map((side) => (
          <mesh
            key={side}
            renderOrder={30}
            position={[side * 2.65, 0, 0.8]}
            rotation={[Math.PI / 2, 0, 0]}
          >
            <coneGeometry args={[0.3, 1.6, 12]} />
            <meshBasicMaterial
              color={engineColor}
              transparent
              opacity={0.65}
              blending={AdditiveBlending}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
}
