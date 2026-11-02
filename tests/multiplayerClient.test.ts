import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MultiplayerWorld } from '@/engine/network/MultiplayerWorld';
import type { NetworkInput, WorldSnapshot } from '@/engine/network/protocol';
import { FLIGHT_CONFIG } from '@/engine/simulation/config';
import { FlightController } from '@/engine/simulation/FlightController';
import { createFlightInput } from '@/engine/simulation/flightTypes';
import { CombatSession } from '@/features/combat/CombatSession';
import { FlightSession } from '@/features/flight/FlightSession';
import { MultiplayerSession } from '@/features/multiplayer/MultiplayerSession';
import { useCombatStore } from '@/stores/combatStore';
import { useExplorationStore } from '@/stores/explorationStore';
import { useFlightStore } from '@/stores/flightStore';

const transport = vi.hoisted(() => ({
  receivers: [] as ((state: WorldSnapshot, first: boolean) => void)[],
  sent: [] as NetworkInput[],
}));
vi.mock('@/features/multiplayer/NetworkSession', () => ({
  NetworkSession: class {
    latest: WorldSnapshot | null = null;
    active = true;
    connected = true;
    constructor(receive: (state: WorldSnapshot, first: boolean) => void) {
      transport.receivers.push(receive);
    }
    connect() {
      return Promise.resolve();
    }
    send(input: NetworkInput) {
      transport.sent.push(input);
    }
    ping() {}
    ready() {}
    disconnect() {}
  },
}));
function setup() {
  const controller = new FlightController(FLIGHT_CONFIG),
    input = createFlightInput();
  const combat = new CombatSession(controller, input);
  const session = new MultiplayerSession(
    controller,
    combat,
    () => false,
    () => {},
  );
  const world = new MultiplayerWorld('solara');
  world.addPlayer('own', 'Own');
  world.addPlayer('other', 'Other');
  const receive = (first = false) => {
    const frame = world.snapshot('own', 6000, true);
    session.network.latest = frame;
    transport.receivers[0]?.(frame, first);
    return frame;
  };
  receive(true);
  return { session, world, combat, input, receive };
}
beforeEach(() => {
  transport.receivers.length = 0;
  transport.sent.length = 0;
});
describe('multiplayer browser adapter without WebGL', () => {
  it('keeps a newly requested weapon when an older authoritative snapshot arrives', () => {
    const { session, combat, input, receive } = setup();
    combat.selectWeapon(3);
    receive();
    session.advance(1 / 30, input, true, false, 'combat');
    expect(transport.sent.at(-1)?.weapon).toBe(3);
    expect(combat.simulation.player.weapon).toBe(3);
  });
  it('renders the practice archetype with correct defenses and clears destroyed player targets', () => {
    const { combat, world, receive } = setup();
    world.startEncounter(true);
    receive();
    const drone = [...combat.simulation.ships.values()].find((ship) => ship.stationary);
    if (!drone) throw new Error('drone');
    combat.simulation.targetId = drone.id;
    combat.publish();
    expect(useCombatStore.getState().readout.target?.shields).toBe(1);
    expect(useCombatStore.getState().readout.target?.hull).toBe(1);
    expect(useCombatStore.getState().readout.target?.state).toBe('practice');
    combat.simulation.targetId = 'other';
    const other = world.pilots.get('other');
    if (other) other.ship.health.hull = 0;
    receive();
    expect(combat.simulation.targetId).toBeNull();
  });
  it('predicts only flight, publishes at 10 Hz, and immediately sends neutral input on pause', () => {
    const { session, combat, input, receive } = setup();
    session.enabled = true;
    const step = vi.spyOn(combat.simulation, 'step'),
      publish = vi.spyOn(combat, 'publish');
    for (let frame = 0; frame < 60; frame++) {
      session.advance(1 / 60, input, true, false, 'combat');
      if (frame % 3 === 0) receive();
    }
    expect(step).not.toHaveBeenCalled();
    expect(publish.mock.calls.length).toBeGreaterThanOrEqual(9);
    expect(publish.mock.calls.length).toBeLessThanOrEqual(10);
    session.pause();
    expect(transport.sent.at(-1)?.fire).toBe(false);
    expect(transport.sent.at(-1)?.paused).toBe(true);
  });
});

it('keeps paused multiplayer charts on authoritative celestial time at 10 Hz', () => {
  const session = new FlightSession();
  const world = new MultiplayerWorld('solara');
  world.addPlayer('own', 'Own');
  session.multiplayer.enabled = true;
  const snapshot = world.snapshot('own', 6000);
  snapshot.time = 60;
  session.multiplayer.network.latest = snapshot;
  useFlightStore.setState({ phase: 'paused' });
  const before = useExplorationStore.getState().chart;
  const sync = vi.spyOn(session.exploration, 'syncPose');
  for (let frame = 0; frame < 10; frame++) session.advance(0.1);
  expect(sync).toHaveBeenCalledTimes(10);
  const moon = session.exploration.world.definition.bodies.find((body) => body.orbit);
  if (!moon) throw new Error('moon');
  const position = useExplorationStore
    .getState()
    .chart.bodies.find((body) => body.id === moon.id)?.position;
  expect(position).toEqual(session.exploration.world.positions.get(moon.id)?.toArray());
  expect(position).not.toEqual(before.bodies.find((body) => body.id === moon.id)?.position);
});
