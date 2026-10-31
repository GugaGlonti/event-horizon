import { SceneCanvas } from '@/engine/rendering/SceneCanvas';
import { FlightWorld } from '@/features/flight/components/FlightWorld';
import { GAME_CONFIG } from '@/features/flight/config';
import type { FlightSession } from '@/features/flight/FlightSession';

export default function SpaceScene({ session }: { session: FlightSession }) {
  return (
    <SceneCanvas
      onReady={session.markReady}
      label="Interactive spacecraft flight environment near Aster"
      cameraSettings={{
        position: [...GAME_CONFIG.camera.chaseOffset],
        fov: GAME_CONFIG.camera.chaseFov,
        near: GAME_CONFIG.camera.near,
        far: GAME_CONFIG.camera.far,
      }}
    >
      <FlightWorld session={session} />
    </SceneCanvas>
  );
}
