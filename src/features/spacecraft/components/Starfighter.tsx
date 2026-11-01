import type { RefObject } from 'react';
import type { Group } from 'three';
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
}: StarfighterProps) {
  return (
    <group ref={modelRef} visible={visible}>
      <mesh geometry={model.geometry} material={model.material} dispose={null} />
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
