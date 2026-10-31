import { useFrame, useThree } from '@react-three/fiber';
import { useRef, useState } from 'react';
import { type Group, PerspectiveCamera } from 'three';
import { FlightCamera } from '@/features/flight/camera/FlightCamera';
import { CockpitFrame } from '@/features/flight/components/CockpitFrame';
import { GAME_CONFIG } from '@/features/flight/config';
import type { FlightSession } from '@/features/flight/FlightSession';
import { FlightEnvironment } from '@/features/space/components/FlightEnvironment';
import { Starfield } from '@/features/space/components/Starfield';
import { Starfighter } from '@/features/spacecraft/components/Starfighter';
import { useReducedMotion } from '@/hooks/useReducedMotion';
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

  useFrame((_, delta) => {
    session.advance(delta);
    if (ship.current) {
      ship.current.position.copy(session.position);
      ship.current.quaternion.copy(session.orientation);
    }
    if (exhaust.current) {
      const intensity = session.controller.isBoosting ? 2.4 : 0.25 + session.controller.enginePower;
      exhaust.current.scale.z = intensity;
    }
    sky.current?.position.copy(session.position);
    if (camera instanceof PerspectiveCamera) {
      const dt = Math.min(delta, GAME_CONFIG.maxFrameTime);
      cameraController.update(camera, session, cameraMode, dt, reducedMotion);
      if (cockpit.current) {
        cockpit.current.position.copy(camera.position);
        cockpit.current.quaternion.copy(camera.quaternion);
      }
    }
  });

  return (
    <>
      <FlightEnvironment />
      <group ref={sky}>
        <Starfield
          radius={GAME_CONFIG.environment.starRadius}
          size={GAME_CONFIG.environment.starSize}
        />
      </group>
      <Starfighter modelRef={ship} exhaustRef={exhaust} visible={cameraMode === 'chase'} />
      <CockpitFrame frameRef={cockpit} visible={cameraMode === 'cockpit'} />
    </>
  );
}
