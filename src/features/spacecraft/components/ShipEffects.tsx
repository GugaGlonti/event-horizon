import { useFrame } from '@react-three/fiber';
import { type RefObject, useMemo, useRef } from 'react';
import { AdditiveBlending, type Group, type ShaderMaterial } from 'three';
import {
  createShipEffectAttributes,
  particleReach,
  shipEffectFragment,
  shipEffectVertex,
  visualEnginePower,
} from '../shipEffects';
import type { SpacecraftModel } from '../useSpacecraftModels';

const quad = new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]);
const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);

export function ShipEffects({
  model,
  modelRef,
  enginePowerRef,
  effectTimeRef,
  reducedMotion,
  phase,
}: {
  model: SpacecraftModel;
  modelRef: RefObject<Group | null>;
  enginePowerRef: RefObject<number>;
  effectTimeRef: RefObject<number>;
  reducedMotion: boolean;
  phase: number;
}) {
  const material = useRef<ShaderMaterial>(null);
  const attributes = useMemo(
    () => createShipEffectAttributes(model.engines, model.lighting),
    [model],
  );
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uPower: { value: 0.25 },
      uReach: { value: particleReach(0.25) },
      uMotion: { value: 1 },
      uPhase: { value: phase },
      uViewportHeight: { value: 900 },
    }),
    [phase],
  );
  useFrame(({ size }) => {
    if (!material.current || !modelRef.current?.visible) return;
    const target = material.current.uniforms;
    const power = visualEnginePower(enginePowerRef.current);
    if (target.uTime) target.uTime.value = effectTimeRef.current % 1024;
    if (target.uPower) target.uPower.value = power;
    if (target.uReach) target.uReach.value = particleReach(power);
    if (target.uMotion) target.uMotion.value = reducedMotion ? 0 : 1;
    if (target.uViewportHeight) target.uViewportHeight.value = Math.max(1, size.height);
  });
  return (
    <mesh frustumCulled={false} renderOrder={30}>
      <instancedBufferGeometry instanceCount={attributes.count}>
        <bufferAttribute attach="attributes-position" args={[quad, 3]} />
        <bufferAttribute attach="index" args={[indices, 1]} />
        <instancedBufferAttribute attach="attributes-aOrigin" args={[attributes.origins, 3]} />
        <instancedBufferAttribute attach="attributes-aColor" args={[attributes.colors, 3]} />
        <instancedBufferAttribute
          attach="attributes-aParameters"
          args={[attributes.parameters, 4]}
        />
      </instancedBufferGeometry>
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        vertexShader={shipEffectVertex}
        fragmentShader={shipEffectFragment}
        transparent
        blending={AdditiveBlending}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}
