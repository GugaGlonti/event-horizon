import { Quaternion as ThreeQuaternion, Vector3 as ThreeVector } from 'three';
import { describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from '@/engine/math/linear';
import { InputQueue, neutralInput } from '@/engine/network/InputQueue';
import { MultiplayerWorld } from '@/engine/network/MultiplayerWorld';
import { Prediction, predict } from '@/engine/network/Prediction';
import { inputSchema, joinSchema, snapshotSchema } from '@/engine/network/protocol';
import { SnapshotBuffer } from '@/engine/network/SnapshotBuffer';
import { FLIGHT_CONFIG } from '@/engine/simulation/config';
import { FlightController } from '@/engine/simulation/FlightController';
import { createFlightInput } from '@/engine/simulation/flightTypes';

const moving = (seq: number) => ({
  ...neutralInput(seq),
  paused: false,
  flight: { ...neutralInput().flight, throttle: 1 },
});
describe('shared multiplayer rules', () => {
  it('matches renderer quaternion/vector conventions without loading renderer math in simulation', () => {
    const q = new Quaternion().setFromAxisAngle(new Vector3(1, 2, 3).normalize(), 1.2);
    const three = new ThreeQuaternion().setFromAxisAngle(new ThreeVector(1, 2, 3).normalize(), 1.2);
    const v = new Vector3(2, 3, -4).applyQuaternion(q);
    const reference = new ThreeVector(2, 3, -4).applyQuaternion(three);
    expect(v.toArray()).toEqual(reference.toArray());
    expect(new Vector3().lerpVectors(v, v, 0.5).toArray()).toEqual(v.toArray());
    expect(new Quaternion().slerpQuaternions(q, q.clone().invert(), 0.3).toArray()).toEqual(
      new ThreeQuaternion().slerpQuaternions(three, three.clone().invert(), 0.3).toArray(),
    );
  });
  it('validates versions, finite bounded axes and rejects arbitrary state', () => {
    expect(joinSchema.safeParse({ v: 99, name: 'Pilot', systemId: 'solara' }).success).toBe(false);
    for (const invalid of [
      { ...moving(1), position: [0, 0, 0] },
      { ...moving(1), travelMode: 'surface' },
      { ...moving(1), flight: { ...moving(1).flight, yaw: Infinity } },
      { ...moving(1), weapon: 5 },
      { ...moving(1), seq: -1 },
    ])
      expect(inputSchema.safeParse(invalid).success).toBe(false);
  });
  it('rejects duplicate/out of order commands and bounds bursts without advancing physics', () => {
    const queue = new InputQueue();
    expect(queue.accept(moving(2))).toBe(true);
    expect(queue.accept(moving(1))).toBe(false);
    expect(queue.accept(moving(2))).toBe(false);
    expect(queue.ack).toBe(0);
    expect(queue.step(1 / 30).seq).toBe(2);
    for (let i = 3; i < 50; i++) queue.accept(moving(i));
    expect(queue.rejected).toBeGreaterThan(30);
    for (let i = 0; i < 40; i++) queue.step(1 / 30);
    expect(queue.step(1 / 30).fire).toBe(false);
    expect(queue.step(1 / 30).paused).toBe(true);
  });
  it('restores boost and angular state and replays only unacknowledged flight inputs', () => {
    const authority = new FlightController(FLIGHT_CONFIG),
      local = new FlightController(FLIGHT_CONFIG);
    const prediction = new Prediction(local);
    const first = { ...moving(1), flight: { ...moving(1).flight, boost: true, pitch: 0.4 } };
    prediction.apply(first);
    predict(authority, first, 30);
    prediction.apply(moving(2));
    prediction.reconcile(authority.snapshot(), 1);
    predict(authority, moving(2), 30);
    expect(local.snapshot()).toEqual(authority.snapshot());
    expect(prediction.pending).toBe(1);
    for (let i = 3; i < 200; i++) prediction.apply(moving(i));
    expect(prediction.pending).toBe(120);
  });
  it('interpolates orientation, bounds extrapolation and snaps teleports', () => {
    const world = new MultiplayerWorld('solara');
    world.addPlayer('one', 'One');
    const buffer = new SnapshotBuffer();
    buffer.delay = 0;
    const a = world.snapshot('one', 6000);
    a.time = 1;
    a.tick = 1;
    const b = structuredClone(a);
    b.tick = 2;
    b.time = 2;
    const ship = b.ships[0];
    if (!ship) throw new Error('ship');
    ship.flight.position[0] += 10;
    ship.flight.velocity = [20, 0, 0];
    buffer.push(a, 0);
    buffer.push(b, 1);
    const p = new Vector3(),
      q = new Quaternion();
    buffer.sample('one', 1.2, p, q);
    expect(p.x).toBeCloseTo(ship.flight.position[0] + 3);
    expect(buffer.push(a, 2)).toBe(false);
    const c = structuredClone(b);
    c.tick++;
    c.time = 3;
    const teleported = c.ships[0];
    if (!teleported) throw new Error('ship');
    teleported.flight.position[0] += 1000;
    buffer.push(c, 2);
    buffer.sample('one', 2, p, q);
    expect(p.x).toBe(teleported.flight.position[0]);
  });
  it('shares one AI encounter and isolates independent system worlds', () => {
    const a = new MultiplayerWorld('solara'),
      b = new MultiplayerWorld('vesper');
    a.addPlayer('one', 'One');
    a.addPlayer('two', 'Two');
    b.addPlayer('other', 'Other');
    expect(a.startEncounter(true)).toBe(true);
    expect(a.startEncounter(true)).toBe(false);
    for (let i = 0; i < 10; i++) a.step();
    const left = a.snapshot('one', 6000),
      right = a.snapshot('two', 6000);
    expect(left.ships.filter((s) => !s.player)).toEqual(right.ships.filter((s) => !s.player));
    expect(b.snapshot('other', 6000).ships).toHaveLength(1);
    expect(snapshotSchema.safeParse(left).success).toBe(true);
  });
  it('retains destroyed pilots for respawn, credits one kill and blocks travel damage', () => {
    const world = new MultiplayerWorld('solara'),
      one = world.addPlayer('one', 'One'),
      two = world.addPlayer('two', 'Two');
    two.ship.health.invulnerability = 0;
    world.simulation.damage(two.ship, 200, 'one');
    world.simulation.damage(two.ship, 200, 'one');
    world.step();
    expect(two.deaths).toBe(1);
    expect(one.kills).toBe(1);
    expect(world.respawn('two')).toBe(true);
    expect(world.respawn('two')).toBe(false);
    one.ship.transferring = true;
    one.ship.health.invulnerability = 0;
    world.simulation.damage(one.ship, 300, 'two');
    expect(one.ship.health.hull).toBe(100);
    world.removePlayer('one');
    expect(world.simulation.ships.has('one')).toBe(false);
  });
});

describe('authority and delayed prediction regressions', () => {
  it('reconciles delayed acknowledgements to the same flight result as the server', () => {
    const world = new MultiplayerWorld('solara');
    const pilot = world.addPlayer('pilot', 'Pilot');
    const local = new FlightController(FLIGHT_CONFIG);
    local.restore(pilot.ship.controller.snapshot());
    const prediction = new Prediction(local);
    const delayed: { state: ReturnType<FlightController['snapshot']>; ack: number }[] = [];
    for (let i = 1; i <= 120; i++) {
      const command = {
        ...moving(i),
        flight: { ...moving(i).flight, yaw: Math.sin(i / 30) * 0.3, boost: i < 40 },
      };
      prediction.apply(command);
      pilot.inputs.accept(command);
      world.step();
      delayed.push({ state: pilot.ship.controller.snapshot(), ack: pilot.inputs.ack });
      if (delayed.length > 4) {
        const old = delayed.shift();
        if (old) prediction.reconcile(old.state, old.ack);
      }
    }
    prediction.reconcile(pilot.ship.controller.snapshot(), pilot.inputs.ack);
    expect(local.snapshot()).toEqual(pilot.ship.controller.snapshot());
    expect(prediction.pending).toBe(0);
  });
  it('preserves input sequencing across respawn and neutralizes paused fire', () => {
    const world = new MultiplayerWorld('solara'),
      pilot = world.addPlayer('pilot', 'Pilot');
    pilot.inputs.accept({ ...moving(250), fire: true });
    world.step();
    pilot.ship.health.invulnerability = 0;
    world.simulation.damage(pilot.ship, 300);
    world.step();
    world.respawn(pilot.id);
    const replacement = world.pilots.get(pilot.id);
    if (!replacement) throw new Error('pilot');
    expect(replacement.inputs.ack).toBe(250);
    expect(replacement.inputs.accept({ ...neutralInput(251), fire: true })).toBe(true);
    world.step();
    expect(replacement.ship.command.fire).toBe(false);
  });
  it('uses nearest alive player as AI target and does not multiply enemies on client join', () => {
    const world = new MultiplayerWorld('solara'),
      a = world.addPlayer('a', 'A'),
      b = world.addPlayer('b', 'B');
    world.startEncounter(false);
    world.step();
    const enemy = [...world.simulation.ships.values()].find((s) => s.team === 'hostile');
    if (!enemy) throw new Error('enemy');
    b.ship.controller.relocate(
      enemy.position.clone().add({ x: 100, y: 0, z: 0 }),
      b.ship.orientation,
    );
    a.ship.controller.relocate(
      enemy.position.clone().add({ x: 2000, y: 0, z: 0 }),
      a.ship.orientation,
    );
    world.step();
    expect(enemy.targetId).toBe('b');
    b.ship.health.hull = 0;
    world.step();
    expect(enemy.targetId).toBe('a');
    world.addPlayer('c', 'C');
    expect([...world.simulation.ships.values()].filter((s) => s.team === 'hostile')).toHaveLength(
      5,
    );
  });
  it('reduces distant state frequency while retaining combat targets and a removal roster', () => {
    const world = new MultiplayerWorld('solara'),
      a = world.addPlayer('a', 'A'),
      b = world.addPlayer('b', 'B');
    b.ship.controller.relocate(
      a.ship.position.clone().add({ x: 20000, y: 0, z: 0 }),
      b.ship.orientation,
    );
    b.ship.sync();
    expect(world.snapshot('a', 6000).ships).toHaveLength(1);
    expect(world.snapshot('a', 6000).roster).toContain('b');
    expect(world.snapshot('a', 6000, true).ships).toHaveLength(2);
    b.ship.targetId = 'a';
    expect(world.snapshot('a', 6000).ships).toHaveLength(2);
    b.ship.health.invulnerability = 0;
    world.simulation.damage(b.ship, 1, null);
    expect(world.snapshot('a', 6000).events).toHaveLength(0);
    world.simulation.damage(b.ship, 1, 'a');
    expect(world.snapshot('a', 6000).events).toHaveLength(1);
    expect(world.snapshot('b', 6000).events).toHaveLength(2);
    world.removePlayer('b');
    expect(world.snapshot('a', 6000).roster).not.toContain('b');
  });
  it('starts the arrival patrol clock only after a player engages controls', () => {
    const world = new MultiplayerWorld('solara'),
      pilot = world.addPlayer('p', 'P');
    for (let i = 0; i < 300; i++) world.step();
    expect(world.simulation.ships.size).toBe(1);
    for (let i = 1; i <= 250; i++) {
      pilot.inputs.accept({ ...moving(i), flight: createFlightInput() });
      world.step();
    }
    expect([...world.simulation.ships.values()].some((s) => s.team === 'hostile')).toBe(true);
  });
});

describe('authoritative arrival handoff', () => {
  it('preserves flight reserves and rechecks occupancy before releasing a destination hold', () => {
    const source = new MultiplayerWorld('solara'),
      pilot = source.addPlayer('p', 'Pilot');
    pilot.ship.controller.step({ ...createFlightInput(), throttle: 1, boost: true }, 0.1);
    const flight = pilot.ship.controller.snapshot();
    const destination = new MultiplayerWorld('vesper');
    const arrived = destination.addPlayer(
      'p',
      'Pilot',
      { shields: 72, hull: 84, kills: 2, deaths: 1, flight },
      'solara',
    );
    expect(arrived.ship.controller.snapshot().boostCharge).toBe(flight.boostCharge);
    expect(arrived.ship.controller.snapshot().distance).toBe(flight.distance);
    expect(arrived.ship.health.hull).toBe(84);
    arrived.ship.transferring = true;
    const blocker = destination.addPlayer('blocker', 'Blocker');
    blocker.ship.controller.relocate(arrived.ship.position, arrived.ship.orientation);
    blocker.ship.sync();
    expect(destination.releasePlayer('p')).toBe(true);
    expect(arrived.ship.position.distanceTo(blocker.ship.position)).toBeGreaterThan(80);
    expect(arrived.ship.transferring).toBe(false);
  });
});

it('neutralizes paused and timed-out thrust while preserving the selected flight mode', () => {
  const queue = new InputQueue();
  queue.accept({
    ...neutralInput(1),
    paused: true,
    flightMode: 'travel',
    weapon: 3,
    fire: true,
    flight: { ...createFlightInput(), throttle: 1 },
  });
  const paused = queue.step(1 / 30);
  expect(paused.flightMode).toBe('travel');
  expect(paused.weapon).toBe(3);
  expect(paused.fire).toBe(false);
  expect(paused.flight.throttle).toBe(0);
  expect(queue.step(1).flightMode).toBe('travel');
});
