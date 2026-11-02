import { PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HYPERSPACE_ENTRY, HYPERSPACE_TIMING } from '@/engine/navigation/HyperspaceController';
import { createFlightInput } from '@/engine/simulation/flightTypes';
import { FlightCamera } from '@/features/flight/camera/FlightCamera';
import { GAME_CONFIG } from '@/features/flight/config';
import { FlightSession } from '@/features/flight/FlightSession';
import { useExplorationStore } from '@/stores/explorationStore';
import { useFlightStore } from '@/stores/flightStore';

describe('flight presentation boundaries', () => {
  beforeEach(() => {
    useFlightStore.setState(useFlightStore.getInitialState(), true);
    useExplorationStore.setState(useExplorationStore.getInitialState(), true);
  });

  it('publishes telemetry at the configured cadence instead of every render frame', () => {
    const session = new FlightSession();
    useFlightStore.getState().setInputMode('keyboard');
    let publications = 0;
    const unsubscribe = useFlightStore.subscribe((state, previous) => {
      if (state.telemetry !== previous.telemetry) publications += 1;
    });
    for (let frame = 0; frame < 120; frame += 1) session.advance(1 / 120);
    unsubscribe();
    expect(publications).toBeGreaterThanOrEqual(9);
    expect(publications).toBeLessThanOrEqual(10);
  });

  it('holds the pose on pause, ignores a long pause, and resets the session without a camera flight-back', () => {
    const session = new FlightSession();
    const spawn = session.position.clone();
    const version = session.resetVersion;
    session.controller.step({ ...createFlightInput(), throttle: 1 }, 0.1);
    const position = new Vector3();
    const orientation = new Quaternion();
    session.controller.copyTransform(position, orientation);
    session.advance(60);
    const pausedPosition = new Vector3();
    session.controller.copyTransform(pausedPosition, orientation);
    expect(pausedPosition.equals(position)).toBe(true);
    session.reset();
    expect(session.position.equals(spawn)).toBe(true);
    expect(useFlightStore.getState().telemetry.speed).toBe(0);
    expect(session.resetVersion).toBe(version + 1);
  });

  it('switches between chase and cockpit without changing the simulation pose', () => {
    const session = new FlightSession();
    const rig = new FlightCamera();
    const camera = new PerspectiveCamera();
    rig.update(camera, session, 'chase', 1 / 60, false);
    expect(
      camera.position
        .clone()
        .sub(session.renderPosition)
        .distanceTo(new Vector3(...GAME_CONFIG.camera.chaseOffset)),
    ).toBeLessThan(1e-10);
    rig.update(camera, session, 'cockpit', 1 / 60, false);
    const cockpitOffset = camera.position.clone().sub(session.renderPosition);
    expect(cockpitOffset.distanceTo(new Vector3(...GAME_CONFIG.camera.cockpitOffset))).toBeLessThan(
      1e-10,
    );
    const pose = new Vector3();
    session.controller.copyTransform(pose, new Quaternion());
    expect(pose.equals(session.position)).toBe(true);
    expect(session.orientation.equals(new Quaternion())).toBe(true);
  });

  it('frames a narrow chase view above the instruments without changing the ship pose', () => {
    const session = new FlightSession();
    const pose = session.position.clone();
    const camera = new PerspectiveCamera(62, 0.5);
    new FlightCamera().update(camera, session, 'chase', 1 / 60, false);
    expect(camera.position.z - session.renderPosition.z).toBeGreaterThan(
      GAME_CONFIG.camera.chaseOffset[2],
    );
    camera.updateMatrixWorld();
    const hullCenter = session.renderPosition.clone().project(camera);
    expect(hullCenter.y).toBeGreaterThan(-0.35);
    expect(hullCenter.y).toBeLessThan(0);
    expect(session.position.equals(pose)).toBe(true);
  });

  it('rebases the chase camera without changing its logical position or introducing a follow jump', () => {
    const session = new FlightSession();
    const camera = new PerspectiveCamera();
    const rig = new FlightCamera();
    rig.update(camera, session, 'chase', 1 / 60, false);
    const logicalCamera = camera.position.clone().add(session.origin.position);
    session.origin.position.x += 1024;
    session.origin.toRender(session.position, session.renderPosition);
    rig.update(camera, session, 'chase', 1 / 60, false);
    expect(
      camera.position.clone().add(session.origin.position).distanceTo(logicalCamera),
    ).toBeLessThan(1e-8);
  });

  it('uses a stable field of view for reduced motion', () => {
    const session = new FlightSession();
    const camera = new PerspectiveCamera();
    const rig = new FlightCamera();
    for (let tick = 0; tick < 1000; tick += 1)
      session.controller.step({ ...createFlightInput(), throttle: 1 }, 1 / 120);
    rig.update(camera, session, 'chase', 1 / 60, true);
    expect(camera.fov).toBe(GAME_CONFIG.camera.chaseFov);
    rig.update(camera, session, 'cockpit', 1 / 60, false);
    expect(camera.fov).toBeGreaterThan(GAME_CONFIG.camera.cockpitFov);
  });

  it('gives the cockpit a bounded impulse without accumulation, then settles or suppresses it', () => {
    const session = new FlightSession();
    const camera = new PerspectiveCamera();
    const rig = new FlightCamera();
    const jump = session.exploration.jump;
    jump.phase = 'ACCELERATING';
    jump.elapsed = HYPERSPACE_TIMING.ACCELERATING * HYPERSPACE_ENTRY.impactStart + 0.06;
    const baseline = session.renderPosition
      .clone()
      .add(new Vector3(...GAME_CONFIG.camera.cockpitOffset));
    rig.update(camera, session, 'cockpit', 1 / 120, false);
    const offset = camera.position.clone().sub(baseline);
    expect(offset.length()).toBeGreaterThan(0.01);
    expect(offset.length()).toBeLessThan(0.2);
    for (let frame = 0; frame < 30; frame++) rig.update(camera, session, 'cockpit', 0, false);
    expect(camera.position.clone().sub(baseline).distanceTo(offset)).toBeLessThan(1e-8);
    rig.update(camera, session, 'cockpit', 1 / 120, true);
    expect(camera.position.distanceTo(baseline)).toBeLessThan(1e-8);
    jump.phase = 'HYPERSPACE';
    jump.distance = 100;
    let calm = 0,
      hiccups = 0;
    for (let frame = 0; frame < 1200; frame++) {
      jump.elapsed = 1 + frame / 120;
      rig.update(camera, session, 'cockpit', 1 / 120, false);
      const distance = camera.position.distanceTo(baseline);
      expect(distance).toBeLessThan(0.05);
      if (distance < 1e-8) {
        calm++;
        expect(camera.quaternion.angleTo(session.orientation)).toBeLessThan(1e-7);
      } else {
        hiccups++;
        const held = camera.position.clone();
        rig.update(camera, session, 'cockpit', 0, false);
        expect(camera.position.distanceTo(held)).toBeLessThan(1e-8);
        rig.update(camera, session, 'cockpit', 1 / 120, true);
        expect(camera.position.distanceTo(baseline)).toBeLessThan(1e-8);
      }
    }
    expect(calm / 1200).toBeGreaterThan(0.8);
    expect(hiccups).toBeGreaterThan(0);
  });

  it('keeps cinematic camera lag bounded while the departure crosses render-origin cells', () => {
    const session = new FlightSession();
    const camera = new PerspectiveCamera();
    const rig = new FlightCamera();
    session.exploration.jump.phase = 'ACCELERATING';
    rig.update(camera, session, 'chase', 1 / 60, false);
    for (let frame = 0; frame < 20; frame += 1) {
      session.position.z -= 100000;
      session.origin.update(session.position);
      session.origin.toRender(session.position, session.renderPosition);
      rig.update(camera, session, 'chase', 1 / 60, false);
      expect(camera.position.distanceTo(session.renderPosition)).toBeLessThan(20);
    }
  });

  it.each(['chase', 'cockpit'] as const)(
    'keeps the %s star projection coherent before rendering across rapid origin shifts',
    (mode) => {
      const session = new FlightSession();
      const camera = new PerspectiveCamera(62, 16 / 9);
      const rig = new FlightCamera();
      const direction = new Vector3(0.3, 0.14, -1).normalize();
      session.orientation.setFromUnitVectors(new Vector3(0, 0, -1), direction);
      session.exploration.jump.phase = 'ACCELERATING';
      rig.update(camera, session, mode, 1 / 60, false);
      camera.updateMatrixWorld();
      const axis = new Vector3();
      const baseline = session.renderPosition
        .clone()
        .addScaledVector(direction, GAME_CONFIG.environment.starRadius)
        .project(camera);
      for (let frame = 0; frame < 20; frame += 1) {
        session.position.addScaledVector(direction, 100000);
        session.origin.update(session.position);
        session.origin.toRender(session.position, session.renderPosition);
        rig.update(camera, session, mode, 1 / 60, false);
        // Star uniforms are sampled before Three updates matrices for the actual draw.
        axis
          .copy(session.renderPosition)
          .addScaledVector(direction, GAME_CONFIG.environment.starRadius);
        const beforeDraw = axis.clone().project(camera);
        camera.updateMatrixWorld();
        const atDraw = axis.clone().project(camera);
        expect(beforeDraw.distanceTo(atDraw)).toBeLessThan(1e-10);
        expect(beforeDraw.distanceTo(baseline)).toBeLessThan(1e-8);
      }
    },
  );

  it.each(['chase', 'cockpit'] as const)(
    'preserves the %s camera offset and FOV across the masked system handoff',
    async (mode) => {
      const session = new FlightSession();
      const camera = new PerspectiveCamera();
      const rig = new FlightCamera();
      session.exploration.selectDestination('vesper');
      session.exploration.beginJump();
      await vi.waitFor(() => expect(session.exploration.jump.prepared).toBe(true));
      const revision = session.resetVersion;
      let committed = false;
      let resumed = false;
      for (let frame = 0; frame < 4000; frame += 1) {
        const previous = session.exploration.jump.phase;
        const offset = camera.position.clone().sub(session.renderPosition);
        const fov = camera.fov;
        session.advance(1 / 120);
        rig.update(camera, session, mode, 1 / 120, false);
        if (previous === 'HYPERSPACE' && session.exploration.jump.phase === 'EXITING') {
          expect(session.resetVersion).toBe(revision);
          expect(
            camera.position.clone().sub(session.renderPosition).distanceTo(offset),
          ).toBeLessThan(0.01);
          expect(Math.abs(camera.fov - fov)).toBeLessThan(0.2);
          committed = true;
        }
        if (session.exploration.jump.phase === 'EXITING')
          session.exploration.markArrivalReady(session.exploration.world.definition.id);
        if (previous === 'EXITING' && session.exploration.jump.phase === 'COOLDOWN') {
          expect(Math.abs(camera.fov - fov)).toBeLessThan(0.2);
          resumed = true;
          break;
        }
      }
      expect(committed).toBe(true);
      expect(resumed).toBe(true);
      session.exploration.dispose();
    },
  );
});
