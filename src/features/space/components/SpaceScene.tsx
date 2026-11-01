import { SceneCanvas } from '@/engine/rendering/SceneCanvas';
import { PlanetMarkersProjection } from '@/features/exploration/rendering/PlanetMarkersProjection';
import { FlightWorld } from '@/features/flight/components/FlightWorld';
import { GAME_CONFIG } from '@/features/flight/config';
import type { FlightSession } from '@/features/flight/FlightSession';
import { RemotePilotProjection } from '@/features/multiplayer/RemotePilotProjection';

export default function SpaceScene({ session }: { session: FlightSession }) {
  return (
    <SceneCanvas
      onReady={session.markReady}
      label="Interactive galaxy exploration environment"
      cameraSettings={{
        position: [...GAME_CONFIG.camera.chaseOffset],
        fov: GAME_CONFIG.camera.chaseFov,
        near: GAME_CONFIG.camera.near,
        far: GAME_CONFIG.camera.far,
      }}
    >
      <FlightWorld session={session} />
      <PlanetMarkersProjection session={session} />
      <RemotePilotProjection session={session} />
    </SceneCanvas>
  );
}
