import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MultiplayerWorld } from '@/engine/network/MultiplayerWorld';
import type { NetworkInput, WorldSnapshot } from '@/engine/network/protocol';
import { FLIGHT_CONFIG } from '@/engine/simulation/config';
import { FlightController } from '@/engine/simulation/FlightController';
import { createFlightInput } from '@/engine/simulation/flightTypes';
import { CombatSession } from '@/features/combat/CombatSession';
import { MultiplayerSession } from '@/features/multiplayer/MultiplayerSession';
import { useCombatStore } from '@/stores/combatStore';

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
    session.advance(1 / 30, input, true, false, true);
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
      session.advance(1 / 60, input, true, false, true);
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
