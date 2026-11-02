import type { RefObject } from 'react';
import type { Group, Material } from 'three';
import type { SpacecraftModel } from '../useSpacecraftModels';
import { LandingGear } from './LandingGear';
import { ShipEffects } from './ShipEffects';

interface StarfighterProps {
  modelRef: RefObject<Group | null>;
  enginePowerRef: RefObject<number>;
  effectTimeRef: RefObject<number>;
  model: SpacecraftModel;
  visible: boolean;
  reducedMotion: boolean;
  effectPhase?: number;
  gearRef?: RefObject<boolean>;
  shadowDepth?: Material;
}

/** Shared opaque hull and per-ship, depth-tested lighting/exhaust instances. */
export function Starfighter({
  modelRef,
  enginePowerRef,
  effectTimeRef,
  model,
  visible,
  reducedMotion,
  effectPhase = 0,
  gearRef,
  shadowDepth,
}: StarfighterProps) {
  return (
    <group ref={modelRef} visible={visible}>
      <mesh
        geometry={model.geometry}
        material={model.material}
        dispose={null}
        castShadow={Boolean(shadowDepth)}
        receiveShadow={Boolean(shadowDepth)}
        customDepthMaterial={shadowDepth}
      />
      {gearRef && <LandingGear deployed={gearRef} reducedMotion={reducedMotion} />}
      <ShipEffects
        model={model}
        modelRef={modelRef}
        enginePowerRef={enginePowerRef}
        effectTimeRef={effectTimeRef}
        reducedMotion={reducedMotion}
        phase={effectPhase}
      />
    </group>
  );
}
