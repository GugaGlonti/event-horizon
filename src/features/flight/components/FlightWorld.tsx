import { useFrame, useThree } from '@react-three/fiber';
import { useRef, useState } from 'react';
import { type Group, PerspectiveCamera } from 'three';
import { HyperspaceTunnel } from '@/features/exploration/rendering/HyperspaceTunnel';
import { SystemScene } from '@/features/exploration/rendering/SystemScene';
import { FlightCamera } from '@/features/flight/camera/FlightCamera';
import { CockpitFrame } from '@/features/flight/components/CockpitFrame';
import { GAME_CONFIG } from '@/features/flight/config';
import type { FlightSession } from '@/features/flight/FlightSession';
import { Starfield } from '@/features/space/components/Starfield';
import { Starfighter } from '@/features/spacecraft/components/Starfighter';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useExplorationStore } from '@/stores/explorationStore';
import { useFlightStore } from '@/stores/flightStore';

export function FlightWorld({ session }: { session: FlightSession }) {
  const ship = useRef<Group>(null);
  const exhaust = useRef<Group>(null);
  const cockpit = useRef<Group>(null);
  const sky = useRef<Group>(null);
  const camera = useThree((state) => state.camera);
  const [cameraController] = useState(() => new FlightCamera());
  const cameraMode = useFlightStore((state) => state.cameraMode);
  const reducedMotion = useReducedMotion();
  const systemId = useExplorationStore((state) => state.systemId);

  useFrame((_, delta) => {
    session.advance(delta, reducedMotion);
    if (ship.current) {
      ship.current.position.copy(session.renderPosition);
      ship.current.quaternion.copy(session.orientation);
    }
    if (exhaust.current) {
      const intensity = session.exploration.jump.busy
        ? 0.7 + session.exploration.jump.intensity * 4
        : session.controller.isBoosting
          ? 2.4
          : 0.25 + session.controller.enginePower;
      exhaust.current.scale.z = intensity;
    }
    sky.current?.position.copy(session.renderPosition);
    if (camera instanceof PerspectiveCamera) {
      const dt = Math.min(delta, GAME_CONFIG.maxFrameTime);
      cameraController.update(camera, session, cameraMode, dt, reducedMotion);
      if (cockpit.current) {
        cockpit.current.position.copy(camera.position);
        cockpit.current.quaternion.copy(camera.quaternion);
      }
    }
  }, -2);

  return (
    <>
      <SystemScene key={systemId} session={session} />
      <group ref={sky}>
        <Starfield session={session} radius={GAME_CONFIG.environment.starRadius} />
      </group>
      <Starfighter modelRef={ship} exhaustRef={exhaust} visible={cameraMode === 'chase'} />
      <CockpitFrame frameRef={cockpit} visible={cameraMode === 'cockpit'} />
      <HyperspaceTunnel session={session} />
    </>
  );
}
