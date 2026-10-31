import { PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
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

  it('backs the chase camera away on narrow viewports without changing the ship pose', () => {
    const session = new FlightSession();
    const pose = session.position.clone();
    const camera = new PerspectiveCamera(62, 0.5);
    new FlightCamera().update(camera, session, 'chase', 1 / 60, false);
    expect(camera.position.z - session.renderPosition.z).toBeGreaterThan(
      GAME_CONFIG.camera.chaseOffset[2],
    );
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

  it('keeps cinematic camera lag bounded while the departure crosses render-origin cells', () => {
    const session = new FlightSession();
    const camera = new PerspectiveCamera();
    const rig = new FlightCamera();
    session.exploration.jump.phase = 'ACCELERATING';
    rig.update(camera, session, 'chase', 1 / 60, false);
    for (let frame = 0; frame < 20; frame += 1) {
      session.position.z -= 100;
      session.origin.update(session.position);
      session.origin.toRender(session.position, session.renderPosition);
      rig.update(camera, session, 'chase', 1 / 60, false);
      expect(camera.position.distanceTo(session.renderPosition)).toBeLessThan(20);
    }
  });
});
