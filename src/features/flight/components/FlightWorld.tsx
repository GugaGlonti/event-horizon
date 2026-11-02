import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef, useState } from 'react';
import { type Group, PerspectiveCamera } from 'three';
import { FrameCapture } from '@/engine/rendering/FrameCapture';
import { createShadowDepthMaterial } from '@/engine/rendering/shadowDepth';
import { CombatScene } from '@/features/combat/components/CombatScene';
import { HyperspaceTunnel } from '@/features/exploration/rendering/HyperspaceTunnel';
import { SystemScene } from '@/features/exploration/rendering/SystemScene';
import { FlightCamera } from '@/features/flight/camera/FlightCamera';
import { CockpitFrame } from '@/features/flight/components/CockpitFrame';
import { GAME_CONFIG } from '@/features/flight/config';
import type { FlightSession } from '@/features/flight/FlightSession';
import { terrainMetrics } from '@/features/planets/rendering/PlanetTerrain';
import { visualMetrics } from '@/features/planets/rendering/visualBudget';
import { Starfield } from '@/features/space/components/Starfield';
import { Starfighter } from '@/features/spacecraft/components/Starfighter';
import { useSpacecraftModels } from '@/features/spacecraft/useSpacecraftModels';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useExplorationStore } from '@/stores/explorationStore';
import { useFlightStore } from '@/stores/flightStore';
import { useRenderStatsStore } from '@/stores/renderStatsStore';

export function FlightWorld({ session }: { session: FlightSession }) {
  const statsClock = useRef({ elapsed: 0, frames: 0 });
  const capture = useRef(new FrameCapture());
  const captureRequest = useRef(0);
  const capturePeaks = useRef({
    calls: 0,
    triangles: 0,
    visualBytes: 0,
    scenery: 0,
    cells: 0,
    blocks: 0,
  });
  const ship = useRef<Group>(null);
  const gear = useRef(false);
  const enginePower = useRef(0.25);
  const effectTime = useRef(0);
  const spacecraft = useSpacecraftModels();
  const cockpit = useRef<Group>(null);
  const sky = useRef<Group>(null);
  const camera = useThree((state) => state.camera);
  const [cameraController] = useState(() => new FlightCamera());
  const [shadowDepth] = useState(createShadowDepthMaterial);
  useEffect(() => () => shadowDepth.dispose(), [shadowDepth]);
  const cameraMode = useFlightStore((state) => state.cameraMode);
  const reducedMotion = useReducedMotion();
  const systemId = useExplorationStore((state) => state.systemId);

  useFrame((state, delta) => {
    const request = useRenderStatsStore.getState().captureRequest;
    if (request !== captureRequest.current) {
      captureRequest.current = request;
      capture.current.start();
      capturePeaks.current = {
        calls: 0,
        triangles: 0,
        visualBytes: 0,
        scenery: 0,
        cells: 0,
        blocks: 0,
      };
    }
    if (capture.current.active) {
      const peaks = capturePeaks.current;
      peaks.calls = Math.max(peaks.calls, state.gl.info.render.calls);
      peaks.triangles = Math.max(peaks.triangles, state.gl.info.render.triangles);
      peaks.visualBytes = Math.max(peaks.visualBytes, visualMetrics.bytes);
      peaks.scenery = Math.max(peaks.scenery, visualMetrics.sceneryInstances);
      peaks.cells = Math.max(peaks.cells, visualMetrics.sceneryCells);
      peaks.blocks = Math.max(peaks.blocks, visualMetrics.cityBlocks);
    }
    capture.current.push(delta * 1000, document.visibilityState === 'visible');
    const stats = statsClock.current;
    stats.elapsed += delta;
    stats.frames++;
    if (stats.elapsed >= 0.5) {
      useRenderStatsStore.setState({
        fps: stats.frames / stats.elapsed,
        frameMs: (stats.elapsed * 1000) / stats.frames,
        drawCalls: state.gl.info.render.calls,
        triangles: state.gl.info.render.triangles,
        geometries: state.gl.info.memory.geometries,
        textures: state.gl.info.memory.textures,
        patches: terrainMetrics.patches,
        cache: terrainMetrics.cache,
        generationMs: terrainMetrics.generationMs,
        visualMiB: visualMetrics.bytes / 1048576,
        sceneryCells: visualMetrics.sceneryCells,
        sceneryInstances: visualMetrics.sceneryInstances,
        cityBlocks: visualMetrics.cityBlocks,
        workerFailures: visualMetrics.workerFailures,
        captureResult: captureRequest.current
          ? JSON.stringify({
              ...capture.current.report(),
              peaks: capturePeaks.current,
              calls: state.gl.info.render.calls,
              triangles: state.gl.info.render.triangles,
              geometries: state.gl.info.memory.geometries,
              textures: state.gl.info.memory.textures,
              patches: terrainMetrics.patches,
              cache: terrainMetrics.cache,
              workerMs: terrainMetrics.generationMs,
              width: state.gl.domElement.width,
              height: state.gl.domElement.height,
            })
          : '',
      });
      stats.elapsed = stats.frames = 0;
    }
    session.advance(delta, reducedMotion);
    gear.current = session.controller.landingGear;
    effectTime.current = session.exploration.world.time;
    if (ship.current) {
      ship.current.visible =
        cameraMode === 'chase' && !session.combat.simulation.player.health.destroyed;
      ship.current.position.copy(session.renderPosition);
      ship.current.quaternion.copy(session.orientation);
    }
    enginePower.current = session.exploration.jump.busy
      ? 0.7 + session.exploration.jump.intensity * 4
      : session.controller.isBoosting
        ? 2.4
        : 0.25 + session.controller.enginePower;
    sky.current?.position.copy(session.renderPosition);
    if (camera instanceof PerspectiveCamera) {
      const dt = Math.min(delta, GAME_CONFIG.maxFrameTime);
      cameraController.update(camera, session, cameraMode, dt, reducedMotion);
      if (cockpit.current) {
        cockpit.current.position
          .fromArray(GAME_CONFIG.camera.cockpitOffset)
          .applyQuaternion(session.orientation)
          .add(session.renderPosition);
        cockpit.current.quaternion.copy(session.orientation);
      }
    }
  }, -2);

  return (
    <>
      <SystemScene key={systemId} session={session} />
      <group ref={sky}>
        <Starfield session={session} radius={GAME_CONFIG.environment.starRadius} />
      </group>
      <Starfighter
        shadowDepth={shadowDepth}
        modelRef={ship}
        gearRef={gear}
        enginePowerRef={enginePower}
        effectTimeRef={effectTime}
        model={spacecraft.player}
        visible={cameraMode === 'chase'}
        reducedMotion={reducedMotion}
      />
      <CockpitFrame
        frameRef={cockpit}
        visible={cameraMode === 'cockpit'}
        session={session}
        shadowDepth={shadowDepth}
      />
      <CombatScene
        session={session}
        spacecraft={spacecraft}
        effectTimeRef={effectTime}
        reducedMotion={reducedMotion}
      />
      <HyperspaceTunnel session={session} />
    </>
  );
}
