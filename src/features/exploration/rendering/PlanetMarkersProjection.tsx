import { useFrame } from '@react-three/fiber';
import { useRef, useState } from 'react';
import { PerspectiveCamera } from 'three';
import { PlanetMarkerProjector } from '@/features/exploration/planetMarkers';
import { GAME_CONFIG } from '@/features/flight/config';
import type { FlightSession } from '@/features/flight/FlightSession';
import { useExplorationStore } from '@/stores/explorationStore';
import { useFlightStore } from '@/stores/flightStore';

export function PlanetMarkersProjection({ session }: { session: FlightSession }) {
  const [projector] = useState(() => new PlanetMarkerProjector(GAME_CONFIG.planetMarkers));
  const previous = useRef({
    chart: null as ReturnType<typeof useExplorationStore.getState>['chart'] | null,
    width: 0,
    height: 0,
    mode: '',
  });
  useFrame(({ camera, size }) => {
    const exploration = useExplorationStore.getState();
    const flight = useFlightStore.getState();
    if (
      flight.phase !== 'flying' ||
      exploration.overlay ||
      session.exploration.jump.busy ||
      !(camera instanceof PerspectiveCamera)
    ) {
      previous.current.chart = null;
      return;
    }
    const last = previous.current;
    if (
      last.chart === exploration.chart &&
      last.width === size.width &&
      last.height === size.height &&
      last.mode === flight.cameraMode
    )
      return;
    // Follow the existing 10 Hz navigation publication; no second timer or frame-rate store writes.
    last.chart = exploration.chart;
    last.width = size.width;
    last.height = size.height;
    last.mode = flight.cameraMode;
    camera.updateMatrixWorld();
    useExplorationStore.setState({
      planetMarkers: {
        systemId: session.exploration.world.definition.id,
        items: projector.sample(
          session.exploration.world,
          session.position,
          camera,
          session.origin.position,
          size,
        ),
      },
    });
  }, -1);
  return null;
}
