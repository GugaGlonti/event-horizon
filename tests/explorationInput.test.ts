import { Quaternion, Vector3 } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HYPERSPACE_ENTRY, HYPERSPACE_TIMING } from '@/engine/navigation/HyperspaceController';
import { travelDirection } from '@/engine/navigation/hyperspaceRoute';
import { FlightController } from '@/engine/simulation/FlightController';
import { createFlightInput } from '@/engine/simulation/flightTypes';
import { SYSTEMS } from '@/features/exploration/data/systems';
import { FLIGHT_CONFIG } from '@/features/flight/config';
import { FlightSession } from '@/features/flight/FlightSession';
import { useExplorationStore } from '@/stores/explorationStore';
import { useFlightStore } from '@/stores/flightStore';

let session: FlightSession;
let windowTarget: EventTarget;
let doc: EventTarget & {
  pointerLockElement: HTMLElement | null;
  hidden: boolean;
  exitPointerLock: () => void;
};
let detach = () => {};
function key(code: string, repeat = false) {
  windowTarget.dispatchEvent(
    Object.assign(new Event('keydown', { cancelable: true }), { code, repeat }),
  );
}
function advance(seconds: number) {
  for (let frame = 0; frame < seconds * 120; frame += 1) {
    session.exploration.markArrivalReady(session.exploration.world.definition.id);
    session.advance(1 / 120);
  }
}

beforeEach(() => {
  useFlightStore.setState(useFlightStore.getInitialState(), true);
  useExplorationStore.setState(useExplorationStore.getInitialState(), true);
  useExplorationStore.setState({ soundEnabled: false });
  windowTarget = new EventTarget();
  doc = Object.assign(new EventTarget(), {
    pointerLockElement: null as HTMLElement | null,
    hidden: false,
    exitPointerLock: vi.fn(),
  });
  vi.stubGlobal('window', windowTarget);
  vi.stubGlobal('document', doc);
  const target = { focus: vi.fn() } as unknown as HTMLElement;
  session = new FlightSession();
  detach = session.attach(target);
  session.markReady();
  session.startKeyboard();
});
afterEach(() => {
  detach();
  vi.unstubAllGlobals();
});

describe('exploration input integration', () => {
  it.each([
    ['KeyM', 'galaxy'],
    ['KeyL', 'local'],
  ])(
    'opens %s safely, clears held thrust, and closes without resuming implicitly',
    (shortcut, view) => {
      key('KeyW');
      advance(1);
      const throttle = session.controller.enginePower,
        position = session.position.clone();
      key(shortcut);
      expect(useExplorationStore.getState().overlay).toBe(view);
      expect(useFlightStore.getState().phase).toBe('paused');
      advance(10);
      expect(session.position.equals(position)).toBe(true);
      expect(session.controller.enginePower).toBe(throttle);
      key(shortcut, true);
      expect(useExplorationStore.getState().overlay).toBe(view);
      key(shortcut);
      expect(useExplorationStore.getState().overlay).toBeNull();
      expect(useFlightStore.getState().phase).toBe('paused');
      session.startKeyboard();
      advance(1);
      expect(session.controller.enginePower).toBe(0);
    },
  );

  it('cycles/clears targets and releases all map shortcuts on disposal', () => {
    key('KeyT');
    expect(session.exploration.navigation.targetId).toBe('lyra');
    key('KeyX');
    expect(session.exploration.navigation.targetId).toBeNull();
    key('KeyL');
    key('Escape');
    expect(useExplorationStore.getState().overlay).toBeNull();
    detach();
    key('KeyM');
    expect(useExplorationStore.getState().overlay).toBeNull();
    expect(useFlightStore.getState().rendererReady).toBe(false);
  });

  it('suppresses steering and menus during a jump, then Escape cancels to a paused safe pose', () => {
    session.exploration.selectDestination('vesper');
    session.exploration.beginJump();
    const position = session.position.clone();
    key('KeyW');
    key('ArrowDown');
    key('KeyM');
    key('KeyL');
    advance(1);
    expect(useExplorationStore.getState().overlay).toBeNull();
    expect(session.controller.enginePower).toBe(0);
    expect(session.position.equals(position)).toBe(true);
    key('Escape');
    expect(session.exploration.jump.phase).toBe('IDLE');
    expect(useFlightStore.getState().phase).toBe('paused');
    expect(session.exploration.world.definition.id).toBe('solara');
  });

  it('suspends jumps on visibility loss and reset cancels the pending transaction', () => {
    session.exploration.selectDestination('vesper');
    session.exploration.beginJump();
    advance(1);
    const elapsed = session.exploration.jump.elapsed;
    doc.hidden = true;
    doc.dispatchEvent(new Event('visibilitychange'));
    advance(60);
    expect(session.exploration.jump.elapsed).toBe(elapsed);
    expect(useExplorationStore.getState().jump.suspended).toBe(true);
    session.reset();
    expect(session.exploration.jump.phase).toBe('IDLE');
    expect(session.position.toArray()).toEqual([...session.exploration.world.arrival().position]);
    expect(useFlightStore.getState().telemetry.speed).toBe(0);
  });

  it('aborts a moving departure at its displayed pose without returning to the launch point', () => {
    session.exploration.selectDestination('vesper');
    expect(session.exploration.beginJump()).toBe(true);
    const launch = session.position.clone();
    const movingProgress =
      HYPERSPACE_ENTRY.ignitionStart + (1 - HYPERSPACE_ENTRY.ignitionStart) * 0.6;
    advance(HYPERSPACE_TIMING.CHARGING + HYPERSPACE_TIMING.ACCELERATING * movingProgress);
    const abortPosition = session.position.clone();
    expect(abortPosition.distanceTo(launch)).toBeGreaterThan(100);
    key('Escape');
    advance(1);
    const physics = new Vector3();
    session.controller.copyTransform(physics, new Quaternion());
    expect(session.position.distanceTo(abortPosition)).toBeLessThan(1e-9);
    expect(physics.distanceTo(abortPosition)).toBeLessThan(1e-9);
    expect(session.controller.speed).toBe(0);
  });

  it('hands off arrival at a safe pose, preserves camera preference and restores keyboard controls', async () => {
    useFlightStore.getState().toggleCamera();
    session.exploration.selectDestination('vesper');
    session.exploration.beginJump();
    await vi.waitFor(() => expect(session.exploration.jump.prepared).toBe(true));
    for (let frame = 0; frame < 1200 && session.exploration.jump.phase !== 'COOLDOWN'; frame += 1)
      advance(1 / 120);
    expect(session.exploration.world.definition.id).toBe('vesper');
    const source = SYSTEMS.find((system) => system.id === 'solara');
    if (!source) throw new Error('Missing fixture.');
    const direction = travelDirection(source, session.exploration.world.definition);
    expect(new Vector3(0, 0, -1).applyQuaternion(session.orientation).dot(direction)).toBeCloseTo(
      1,
    );
    expect(session.controller.speed).toBeCloseTo(100);
    expect(useFlightStore.getState().cameraMode).toBe('cockpit');
    expect(useFlightStore.getState().phase).toBe('flying');
    expect(useExplorationStore.getState().arrival).toMatch(/Welcome to Vesper/);
    advance(1);
    expect(session.controller.speed).toBeCloseTo(100 - FLIGHT_CONFIG.deceleration);
    const speed = session.controller.speed;
    key('KeyW');
    advance(1);
    expect(session.controller.speed).toBeGreaterThan(speed);
  });

  it('holds an opaque destination until that scene reports readiness, then restores flight', async () => {
    session.exploration.selectDestination('vesper');
    session.exploration.beginJump();
    await vi.waitFor(() => expect(session.exploration.jump.prepared).toBe(true));
    for (let frame = 0; frame < 1200 && session.exploration.jump.phase !== 'EXITING'; frame += 1)
      session.advance(1 / 120);
    expect(session.exploration.world.definition.id).toBe('vesper');
    session.exploration.markArrivalReady('solara');
    for (let frame = 0; frame < 120; frame += 1) session.advance(1 / 120);
    expect(session.exploration.jump.progress).toBe(0);
    expect(session.exploration.jump.coverage).toBe(1);
    expect(useFlightStore.getState().phase).toBe('paused');
    session.exploration.markArrivalReady('vesper');
    for (let frame = 0; frame < 240 && session.exploration.jump.phase !== 'COOLDOWN'; frame += 1)
      advance(1 / 120);
    expect(useFlightStore.getState().phase).toBe('flying');
    expect(session.controller.speed).toBeCloseTo(100);
  });
});

describe('logical flight arrivals', () => {
  it('stops momentum while preserving boost reserve, assistance, and trip distance', () => {
    const controller = new FlightController(FLIGHT_CONFIG);
    controller.setAssistance(false);
    for (let step = 0; step < 20; step += 1)
      controller.step({ ...createFlightInput(), throttle: 1, boost: true }, 0.1);
    const previous = controller.getTelemetry();
    controller.relocate(new Vector3(1e12, 200, -1e12), new Quaternion(0, 0, 0, 2));
    const position = new Vector3(),
      orientation = new Quaternion();
    controller.copyTransform(position, orientation);
    expect(position.toArray()).toEqual([1e12, 200, -1e12]);
    expect(orientation.length()).toBe(1);
    expect(controller.getTelemetry()).toMatchObject({
      speed: 0,
      throttle: 0,
      boosting: false,
      assistance: false,
      boostCharge: previous.boostCharge,
      distance: previous.distance,
    });
    expect(() => controller.relocate(new Vector3(Number.NaN, 0, 0), new Quaternion())).toThrow();
    const after = new Vector3();
    controller.copyTransform(after, orientation);
    expect(after.equals(position)).toBe(true);
  });
});
