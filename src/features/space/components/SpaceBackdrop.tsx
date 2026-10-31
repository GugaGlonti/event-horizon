import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { BackSide, Color, type Mesh } from 'three';
import type { StarSystemDefinition } from '@/engine/world/worldTypes';

export function SpaceBackdrop({
  environment,
}: {
  environment: StarSystemDefinition['environment'];
}) {
  const mesh = useRef<Mesh>(null);
  const uniforms = useMemo(
    () => ({
      uBase: { value: new Color(environment.background) },
      uNebula: { value: new Color(environment.nebula) },
      uSeed: { value: environment.seed },
    }),
    [environment],
  );
  useFrame(({ camera }) => mesh.current?.position.copy(camera.position));
  return (
    <mesh ref={mesh} renderOrder={-10}>
      <sphereGeometry args={[40000, 24, 16]} />
      <shaderMaterial
        side={BackSide}
        depthWrite={false}
        uniforms={uniforms}
        vertexShader={`varying vec3 vDirection; void main() { vDirection = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`}
        fragmentShader={`uniform vec3 uBase, uNebula; uniform float uSeed; varying vec3 vDirection;
        void main() { vec3 p = vDirection; float cloud = pow(max(0.0, sin(p.x * 5.0 + sin(p.z * 7.0 + uSeed)) * 0.5 + 0.5), 4.0);
          cloud *= pow(max(0.0, 1.0 - abs(p.y + p.z * 0.25)), 5.0);
          float detail = sin(p.x * 31.0 + sin(p.z * 25.0)) * 0.12 + 0.88;
          gl_FragColor = vec4(uBase + uNebula * cloud * detail * 0.24, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`}
      />
    </mesh>
  );
}
