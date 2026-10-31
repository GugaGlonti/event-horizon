import { PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import { createFlightInput } from '@/engine/simulation/flightTypes';
import { FlightCamera } from '@/features/flight/camera/FlightCamera';
import { GAME_CONFIG } from '@/features/flight/config';
import { FlightSession } from '@/features/flight/FlightSession';
import { useFlightStore } from '@/stores/flightStore';

describe('flight presentation boundaries', () => {
  beforeEach(() => useFlightStore.setState(useFlightStore.getInitialState(), true));

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
    session.controller.step({ ...createFlightInput(), throttle: 1 }, 0.1);
    const position = new Vector3();
    const orientation = new Quaternion();
    session.controller.copyTransform(position, orientation);
    session.advance(60);
    const pausedPosition = new Vector3();
    session.controller.copyTransform(pausedPosition, orientation);
    expect(pausedPosition.equals(position)).toBe(true);
    session.reset();
    expect(session.position.length()).toBe(0);
    expect(useFlightStore.getState().telemetry.speed).toBe(0);
    expect(session.resetVersion).toBe(1);
  });

  it('switches between chase and cockpit without changing the simulation pose', () => {
    const session = new FlightSession();
    const rig = new FlightCamera();
    const camera = new PerspectiveCamera();
    rig.update(camera, session, 'chase', 1 / 60, false);
    expect(camera.position.toArray()).toEqual([...GAME_CONFIG.camera.chaseOffset]);
    rig.update(camera, session, 'cockpit', 1 / 60, false);
    expect(camera.position.toArray()).toEqual([...GAME_CONFIG.camera.cockpitOffset]);
    const pose = new Vector3();
    session.controller.copyTransform(pose, new Quaternion());
    expect(pose.length()).toBe(0);
    expect(session.orientation.equals(new Quaternion())).toBe(true);
  });

  it('backs the chase camera away on narrow viewports without changing the ship pose', () => {
    const session = new FlightSession();
    const camera = new PerspectiveCamera(62, 0.5);
    new FlightCamera().update(camera, session, 'chase', 1 / 60, false);
    expect(camera.position.z).toBeGreaterThan(GAME_CONFIG.camera.chaseOffset[2]);
    expect(session.position.length()).toBe(0);
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
});
