import { Client, type Room } from '@colyseus/sdk';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from '@/engine/math/linear';
import { neutralInput } from '@/engine/network/InputQueue';
import { ROOM_NAME, type TravelPermit, type WorldSnapshot } from '@/engine/network/protocol';
import { surfaceDirection, tangentFrame } from '@/engine/planetary/coordinates';
import { portPose } from '@/engine/stations/stationGeometry';
import { serverConfig } from '../server/config';
import { createGameServer } from '../server/createServer';

let game: Awaited<ReturnType<typeof createGameServer>>;
const clients: Room<unknown>[] = [];
function until<T>(
  room: Room<unknown>,
  type: string,
  test: (value: T) => boolean = () => true,
  timeout = 3000,
) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      remove();
      reject(new Error(`Timed out waiting for ${type}`));
    }, timeout);
    const remove = room.onMessage<T>(type, (value) => {
      if (test(value)) {
        clearTimeout(timer);
        remove();
        resolve(value);
      }
    });
  });
}
async function join(name: string, systemId = 'solara', ticket?: string) {
  const room = await new Client(`ws://127.0.0.1:${game.port}`).joinOrCreate<unknown>(ROOM_NAME, {
    v: 5,
    name,
    systemId,
    instanceId: 'public',
    ...(ticket ? { ticket } : {}),
  });
  clients.push(room);
  room.onMessage('welcome', () => {});
  room.onMessage('error', () => {});
  room.onMessage('pong', () => {});
  room.onMessage('snapshot', () => {});
  return room;
}
beforeAll(async () => {
  game = await createGameServer({ ...serverConfig({}), grace: 2, capacity: 2 }, 0);
});
afterAll(async () => {
  await Promise.all(clients.map((c) => c.leave().catch(() => {})));
  await game.close();
});
describe('real authoritative room protocol', () => {
  it('joins a shared room, rejects forged state, fires centrally, respawns and transfers a stable guest', async () => {
    const a = await join('Alpha'),
      b = await join('Bravo');
    expect(a.roomId).toBe(b.roomId);
    const overflow = await join('Overflow');
    expect(overflow.roomId).not.toBe(a.roomId);
    const overflowState = await until<WorldSnapshot>(overflow, 'snapshot');
    expect(overflowState.instanceId).toBe(overflow.roomId);
    await overflow.leave();
    const snapA = await until<WorldSnapshot>(a, 'snapshot', (s) => s.players === 2);
    const snapB = await until<WorldSnapshot>(b, 'snapshot', (s) => s.players === 2);
    const room = [...game.rooms].find((r) => r.roomId === a.roomId);
    if (!room) throw new Error('room');
    const pilotA = room.world.pilots.get(snapA.playerId),
      pilotB = room.world.pilots.get(snapB.playerId);
    if (!pilotA || !pilotB) throw new Error('pilots');
    const before = pilotA.ship.controller.snapshot();
    a.send('input', { ...neutralInput(1), position: [999, 999, 999] });
    await until<WorldSnapshot>(a, 'snapshot', (s) => s.tick > snapB.tick + 1);
    expect(pilotA.inputs.ack).toBe(0);
    expect(
      new Vector3()
        .fromArray(pilotA.ship.controller.snapshot().position)
        .distanceTo(new Vector3().fromArray(before.position)),
    ).toBeLessThan(1);
    // Fixture positioning belongs to server, never to a client message.
    pilotB.ship.controller.relocate(
      pilotA.ship.position.clone().add({ x: 0, y: 0, z: -180 }),
      pilotA.ship.orientation,
    );
    pilotB.ship.health.invulnerability = 0;
    pilotA.ship.health.invulnerability = 0;
    let seq = 1;
    const firing = setInterval(
      () =>
        a.send('input', { ...neutralInput(seq++), paused: false, fire: true, targetId: pilotB.id }),
      33,
    );
    try {
      await until<WorldSnapshot>(
        b,
        'snapshot',
        (s) => s.ships.some((ship) => ship.id === pilotB.id && ship.hull === 0),
        6000,
      );
    } finally {
      clearInterval(firing);
    }
    expect(pilotB.ship.health.destroyed).toBe(true);
    expect(pilotA.kills).toBe(1);
    const respawn = until<WorldSnapshot>(b, 'snapshot', (s) =>
      s.ships.some((ship) => ship.id === pilotB.id && ship.hull === 100),
    );
    b.send('action', { kind: 'respawn' });
    await respawn;
    const encounter = until<WorldSnapshot>(a, 'snapshot', (s) =>
      s.ships.some((ship) => !ship.player),
    );
    a.send('action', { kind: 'encounter', practice: true });
    const enemies = await encounter;
    const shared = await until<WorldSnapshot>(b, 'snapshot', (s) =>
      s.ships.some((ship) => !ship.player),
    );
    expect(enemies.ships.find((s) => !s.player)?.id).toBe(shared.ships.find((s) => !s.player)?.id);
    const enemyId = enemies.ships.find((s) => !s.player)?.id;
    const enemy = enemyId && room.world.simulation.ships.get(enemyId);
    const partner = room.world.pilots.get(pilotB.id);
    if (!enemy || !partner) throw new Error('Shared enemy missing.');
    partner.ship.controller.relocate(
      enemy.position.clone().add({ x: 50, y: 0, z: 180 }),
      new Quaternion().setFromUnitVectors(
        new Vector3(0, 0, -1),
        new Vector3(-50, 0, -180).normalize(),
      ),
    );
    let partnerSeq = 1;
    const fireTogether = setInterval(() => {
      a.send('input', { ...neutralInput(seq++), paused: false, fire: true, targetId: enemy.id });
      b.send('input', {
        ...neutralInput(partnerSeq++),
        paused: false,
        fire: true,
        targetId: enemy.id,
      });
    }, 33);
    const deadForA = until<WorldSnapshot>(
      a,
      'snapshot',
      (s) => s.events.some((e) => e.kind === 'destroyed' && e.shipId === enemy.id),
      6000,
    );
    const deadForB = until<WorldSnapshot>(
      b,
      'snapshot',
      (s) => s.events.some((e) => e.kind === 'destroyed' && e.shipId === enemy.id),
      6000,
    );
    try {
      await Promise.all([deadForA, deadForB]);
    } finally {
      clearInterval(fireTogether);
      a.send('input', neutralInput(seq++));
      b.send('input', neutralInput(partnerSeq++));
    }
    const sources = room.world.simulation.events
      .filter((e) => e.kind === 'damage' && e.shipId === enemy.id)
      .map((e) => (e.kind === 'damage' ? e.sourceId : null));
    expect(sources).toContain(pilotA.id);
    expect(sources).toContain(pilotB.id);
    expect(
      room.world.simulation.events.filter((e) => e.kind === 'destroyed' && e.shipId === enemy.id),
    ).toHaveLength(1);
    const permitPromise = until<TravelPermit>(a, 'travel');
    a.send('action', { kind: 'travel', destination: 'vesper' });
    const permit = await permitPromise;
    const destination = await join('Alpha', 'vesper', permit.ticket);
    const arrived = await until<WorldSnapshot>(destination, 'snapshot');
    expect(arrived.playerId).toBe(pilotA.id);
    expect(arrived.systemId).toBe('vesper');
    expect(arrived.instanceId).toBe(destination.roomId);
    expect(arrived.instanceId).not.toBe(snapA.instanceId);
    expect(arrived.ships.find((s) => s.id === pilotA.id)?.transferring).toBe(true);
    destination.send('action', { kind: 'ready' });
    expect(room.world.pilots.has(pilotA.id)).toBe(false);
    const source = await until<WorldSnapshot>(b, 'snapshot', (s) => s.players === 1);
    expect(source.systemId).toBe('solara');
    await expect(join('Impostor', 'vesper', permit.ticket)).rejects.toThrow();
    const partnerPermit = until<TravelPermit>(b, 'travel');
    b.send('action', { kind: 'travel', destination: 'vesper' });
    const partnerDestination = await join('Bravo', 'vesper', (await partnerPermit).ticket);
    const together = await until<WorldSnapshot>(
      partnerDestination,
      'snapshot',
      (s) => s.players === 2,
    );
    expect(together.playerId).toBe(pilotB.id);
    expect(together.ships.some((ship) => ship.id === pilotA.id)).toBe(true);
    partnerDestination.send('action', { kind: 'ready' });
    await a.leave();
    await b.leave();
    await destination.leave();
    await partnerDestination.leave();
  }, 15000);

  it('synchronizes two planetary landings and exclusive station services over real sockets', async () => {
    const a = await join('Surface Alpha'),
      b = await join('Surface Bravo');
    const initial = await until<WorldSnapshot>(a, 'snapshot', (s) => s.players === 2);
    const room = [...game.rooms].find((r) => r.roomId === a.roomId);
    if (!room) throw new Error('room');
    const pilotA = room.world.pilots.get(initial.playerId);
    const second = await until<WorldSnapshot>(b, 'snapshot');
    const pilotB = room.world.pilots.get(second.playerId);
    const body = room.world.system.definition.bodies.find((p) => p.id === 'pelagos'),
      station = room.world.system.definition.stations?.[0];
    const zone = body?.landingZones?.[0],
      center = body && room.world.system.positions.get(body.id),
      port = station?.ports[0];
    if (!pilotA || !pilotB || !body || !zone || !center || !station || !port)
      throw new Error('fixtures');
    const up = surfaceDirection(zone.latitude, zone.longitude),
      rotation = tangentFrame(up);
    const base = center.clone().addScaledVector(up, body.radius + zone.elevation + 5.01);
    const east = new Vector3(1, 0, 0).applyQuaternion(rotation);
    const place = (pilot: typeof pilotA, point: Vector3, orientation: Quaternion) => {
      pilot.ship.controller.relocate(point, orientation);
      pilot.ship.sync();
      pilot.ship.previous.copy(point);
      pilot.ship.previousOrientation.copy(orientation);
    };
    place(pilotA, base, rotation);
    place(pilotB, base.clone().addScaledVector(east, 80), rotation);
    a.send('action', { kind: 'landing-gear', enabled: true });
    b.send('action', { kind: 'landing-gear', enabled: true });
    await until<WorldSnapshot>(a, 'snapshot', (s) =>
      s.ships.filter((ship) => ship.player).every((ship) => ship.flight.landingGear),
    );
    for (const pilot of [pilotA, pilotB]) {
      pilot.ship.controller.resolveMotion(pilot.ship.position, up.clone().multiplyScalar(-1));
      pilot.ship.sync();
    }
    const landedA = await until<WorldSnapshot>(a, 'snapshot', (s) =>
      s.ships.filter((ship) => ship.player).every((ship) => ship.flight.surface.phase === 'landed'),
    );
    const landedB = await until<WorldSnapshot>(b, 'snapshot', (s) =>
      s.ships.filter((ship) => ship.player).every((ship) => ship.flight.surface.phase === 'landed'),
    );
    expect(landedA.ships.map((ship) => ship.flight.surface.bodyId)).toEqual(
      landedB.ships.map((ship) => ship.flight.surface.bodyId),
    );
    a.send('action', { kind: 'takeoff' });
    b.send('action', { kind: 'takeoff' });
    await until<WorldSnapshot>(
      a,
      'snapshot',
      (s) => s.ships.every((ship) => ship.flight.surface.phase === 'flying'),
      6000,
    );
    const berth = portPose(room.world.system, station, port);
    place(pilotA, berth.approach, berth.orientation);
    place(pilotB, berth.approach.clone().add(new Vector3(80, 0, 0)), berth.orientation);
    a.send('action', { kind: 'dock', stationId: station.id, portId: port.id });
    await until<WorldSnapshot>(b, 'snapshot', (s) =>
      s.ports.some((p) => p.portId === port.id && p.occupant === pilotA.id),
    );
    const denied = until<{ code: string; message: string }>(b, 'error');
    b.send('action', { kind: 'dock', stationId: station.id, portId: port.id });
    expect((await denied).message).toMatch(/occupied/);
    place(pilotA, berth.position.clone().add(new Vector3(0, 0, 20)), berth.orientation);
    a.send('action', { kind: 'capture' });
    await until<WorldSnapshot>(b, 'snapshot', (s) =>
      s.ships.some((ship) => ship.id === pilotA.id && ship.docking.phase === 'docked'),
    );
    pilotA.ship.health.hull = 40;
    pilotA.ship.health.shields = 10;
    a.send('action', { kind: 'service', service: 'repair' });
    await until<WorldSnapshot>(a, 'snapshot', (s) =>
      s.ships.some((ship) => ship.id === pilotA.id && ship.hull === 100),
    );
    expect(pilotA.ship.controller.flightLocked).toBe(true);
    a.send('input', {
      ...neutralInput(1),
      paused: false,
      fire: true,
      flight: { ...neutralInput().flight, throttle: 1, boost: true },
    });
    await until<WorldSnapshot>(a, 'snapshot', (s) => s.ack === 1);
    expect(
      room.world.simulation.projectiles.filter((shot) => shot.owner === pilotA.id),
    ).toHaveLength(0);
    a.send('action', { kind: 'undock' });
    await until<WorldSnapshot>(
      b,
      'snapshot',
      (s) => s.ports.some((p) => p.portId === port.id && p.occupant === null),
      6000,
    );
    b.send('action', { kind: 'dock', stationId: station.id, portId: port.id });
    await until<WorldSnapshot>(a, 'snapshot', (s) =>
      s.ports.some((p) => p.portId === port.id && p.occupant === pilotB.id),
    );
    await a.leave();
    await b.leave();
  }, 22000);
  it('validates landing assistance centrally and replicates manual cancellation', async () => {
    const a = await join('Assist Alpha'),
      b = await join('Assist Bravo');
    const initial = await until<WorldSnapshot>(a, 'snapshot', (s) => s.players === 2);
    const room = [...game.rooms].find((r) => r.roomId === a.roomId),
      pilot = room?.world.pilots.get(initial.playerId),
      body = room?.world.system.definition.bodies.find((p) => p.landable),
      zone = body?.landingZones?.[0],
      center = body && room?.world.system.positions.get(body.id);
    if (!room || !pilot || !body || !zone || !center) throw new Error('assist fixture');
    const up = surfaceDirection(zone.latitude, zone.longitude);
    pilot.ship.controller.relocate(
      center.clone().addScaledVector(up, body.radius + zone.elevation + 120),
      tangentFrame(up),
    );
    pilot.ship.sync();
    let seq = 1,
      override = false;
    const commands = setInterval(
      () =>
        a.send('input', {
          ...neutralInput(seq++),
          paused: false,
          flight: { ...neutralInput().flight, yaw: override ? 1 : 0 },
        }),
      33,
    );
    try {
      const denied = until<{ message: string }>(a, 'error');
      a.send('action', { kind: 'landing-assist', zoneId: 'unknown-zone' });
      expect((await denied).message).toMatch(/Select/);
      await until<WorldSnapshot>(a, 'snapshot', (s) => s.ack > 0);
      a.send('action', { kind: 'landing-assist', zoneId: zone.id });
      await until<WorldSnapshot>(b, 'snapshot', (s) =>
        s.ships.some((ship) => ship.id === pilot.id && ship.flight.landingAssist === zone.id),
      );
      expect(pilot.ship.controller.landingGear).toBe(true);
      override = true;
      await until<WorldSnapshot>(b, 'snapshot', (s) =>
        s.ships.some((ship) => ship.id === pilot.id && ship.flight.landingAssist === null),
      );
    } finally {
      clearInterval(commands);
      await a.leave();
      await b.leave();
    }
  });

  it('replicates released surface coasting across stabilization changes and explicit braking', async () => {
    const a = await join('Coast Alpha'),
      b = await join('Coast Bravo');
    const initial = await until<WorldSnapshot>(a, 'snapshot', (s) => s.players === 2);
    let seq = 1,
      lift = -1,
      assisted = true,
      brake = false;
    const commands = setInterval(
      () =>
        a.send('input', {
          ...neutralInput(seq++),
          paused: false,
          assistance: assisted,
          flight: { ...neutralInput().flight, lift, brake, reverse: brake },
        }),
      33,
    );
    const own = (s: WorldSnapshot) => s.ships.find((ship) => ship.id === initial.playerId);
    try {
      await until<WorldSnapshot>(
        b,
        'snapshot',
        (s) => {
          const ship = own(s);
          return ship?.flight.travelMode === 'surface' && Math.hypot(...ship.flight.velocity) > 400;
        },
        6500,
      );
      lift = 0;
      assisted = false;
      const released = await until<WorldSnapshot>(
        a,
        'snapshot',
        (s) => own(s)?.flight.assistance === false,
      );
      const coast = await until<WorldSnapshot>(b, 'snapshot', (s) => s.tick > released.tick + 10);
      expect(own(coast)?.flight.travelMode).toBe('surface');
      expect(Math.hypot(...(own(coast)?.flight.velocity ?? [0, 0, 0]))).toBeGreaterThan(350);
      assisted = true;
      const stabilized = await until<WorldSnapshot>(
        b,
        'snapshot',
        (s) => s.tick > coast.tick + 10 && own(s)?.flight.assistance === true,
      );
      expect(own(stabilized)?.flight.travelMode).toBe('surface');
      expect(Math.hypot(...(own(stabilized)?.flight.velocity ?? [0, 0, 0]))).toBeGreaterThan(350);
      brake = true;
      await until<WorldSnapshot>(b, 'snapshot', (s) => own(s)?.flight.travelMode === 'normal');
    } finally {
      clearInterval(commands);
      await a.leave();
      await b.leave();
    }
  }, 10000);

  it('reconnects within grace without creating a duplicate and recovers cancelled transfers', async () => {
    const a = await join('Reconnect');
    const initial = await until<WorldSnapshot>(a, 'snapshot');
    const token = a.reconnectionToken;
    a.reconnection.enabled = false;
    a.connection.close();
    await new Promise<void>((resolve) => setTimeout(resolve, 80));
    const reconnected = await new Client(`ws://127.0.0.1:${game.port}`).reconnect<unknown>(token);
    clients.push(reconnected);
    reconnected.onMessage('welcome', () => {});
    reconnected.onMessage('error', () => {});
    const state = await until<WorldSnapshot>(reconnected, 'snapshot');
    expect(state.playerId).toBe(initial.playerId);
    expect(state.players).toBe(1);
    await expect(
      new Client(`ws://127.0.0.1:${game.port}`).reconnect<unknown>(token),
    ).rejects.toThrow();
    const permit = until<TravelPermit>(reconnected, 'travel');
    reconnected.send('action', { kind: 'travel', destination: 'aether' });
    await permit;
    reconnected.send('action', { kind: 'cancel-travel' });
    const restored = await until<WorldSnapshot>(reconnected, 'snapshot', (s) =>
      s.ships.some((ship) => ship.id === initial.playerId && !ship.transferring),
    );
    expect(restored.systemId).toBe('solara');
    await reconnected.leave();
  });
  it('expires dropped guests, cleans the empty room and permits a clean join', async () => {
    const a = await join('Expires', 'aether');
    const initial = await until<WorldSnapshot>(a, 'snapshot');
    const token = a.reconnectionToken,
      roomId = a.roomId;
    a.reconnection.enabled = false;
    a.connection.close();
    await new Promise<void>((resolve) => setTimeout(resolve, 3600));
    expect([...game.rooms].some((room) => room.roomId === roomId)).toBe(false);
    await expect(
      new Client(`ws://127.0.0.1:${game.port}`).reconnect<unknown>(token),
    ).rejects.toThrow();
    const fresh = await join('Expires', 'aether');
    const state = await until<WorldSnapshot>(fresh, 'snapshot');
    expect(state.playerId).not.toBe(initial.playerId);
    expect(state.players).toBe(1);
    await fresh.leave();
  });
});

it('transfers one stable guest through all seven expanded systems over real sockets', async () => {
  let client = await join('Galaxy Survey');
  let state = await until<WorldSnapshot>(client, 'snapshot');
  const id = state.playerId;
  for (const destination of [
    'meridian',
    'kharon',
    'nivalis',
    'pelagia',
    'ignis',
    'elysion',
    'umbra-system',
  ]) {
    const source = [...game.rooms].find((room) => room.roomId === client.roomId);
    const pilot = source?.world.pilots.get(id);
    if (!source || !pilot) throw new Error('Missing transfer fixture');
    // Test-only clearance/cooldown fixture; clients still send only validated intentions.
    pilot.travelCooldown = 0;
    pilot.ship.controller.relocate(new Vector3(0, 2400000, 0), new Quaternion());
    pilot.ship.health.hull = 65;
    pilot.ship.sync();
    const transfer = until<TravelPermit>(client, 'travel');
    client.send('action', { kind: 'travel', destination });
    const permit = await transfer;
    const next = await join('Galaxy Survey', destination, permit.ticket);
    state = await until<WorldSnapshot>(next, 'snapshot');
    expect(state.playerId).toBe(id);
    expect(state.systemId).toBe(destination);
    expect(state.ships.find((ship) => ship.id === id)?.hull).toBe(65);
    expect(state.roster).toEqual([id]);
    next.send('action', { kind: 'ready' });
    await until<WorldSnapshot>(next, 'snapshot', (s) =>
      s.ships.some((ship) => ship.id === id && !ship.transferring),
    );
    expect(source.world.pilots.has(id)).toBe(false);
    await client.leave();
    client = next;
  }
  await client.leave();
}, 15000);

it('replicates exclusive capital pads, capture, repair and departure to two real clients', async () => {
  const a = await join('Capital Alpha', 'meridian'),
    b = await join('Capital Bravo', 'meridian');
  const initial = await until<WorldSnapshot>(a, 'snapshot', (s) => s.players === 2);
  const partner = await until<WorldSnapshot>(b, 'snapshot');
  const room = [...game.rooms].find((r) => r.roomId === a.roomId);
  const pilot = room?.world.pilots.get(initial.playerId),
    other = room?.world.pilots.get(partner.playerId);
  const station = room?.world.system.definition.stations?.find((s) => s.type === 'surface'),
    port = station?.ports[0];
  if (!room || !pilot || !other || !station || !port) throw new Error('Missing capital fixtures');
  const place = (
    ship: typeof pilot.ship,
    point: Vector3,
    orientation: Quaternion,
    velocity: Vector3,
  ) => {
    ship.controller.relocate(point, orientation);
    ship.controller.resolveMotion(point, velocity);
    ship.sync();
    ship.previous.copy(point);
    ship.previousOrientation.copy(orientation);
  };
  let pose = portPose(room.world.system, station, port);
  place(pilot.ship, pose.approach, pose.orientation, pose.velocity);
  place(
    other.ship,
    pose.approach.clone().add(new Vector3(100, 0, 0).applyQuaternion(pose.orientation)),
    pose.orientation,
    pose.velocity,
  );
  a.send('action', { kind: 'dock', stationId: station.id, portId: port.id });
  await until<WorldSnapshot>(b, 'snapshot', (s) =>
    s.ports.some(
      (p) => p.stationId === station.id && p.portId === port.id && p.occupant === pilot.id,
    ),
  );
  const denied = until<{ message: string }>(b, 'error');
  b.send('action', { kind: 'dock', stationId: station.id, portId: port.id });
  expect((await denied).message).toMatch(/occupied/);
  pose = portPose(room.world.system, station, port);
  place(
    pilot.ship,
    pose.position.clone().add(new Vector3(0, 0, 20).applyQuaternion(pose.orientation)),
    pose.orientation,
    pose.velocity,
  );
  a.send('action', { kind: 'capture' });
  await until<WorldSnapshot>(b, 'snapshot', (s) =>
    s.ships.some((ship) => ship.id === pilot.id && ship.docking.phase === 'docked'),
  );
  pilot.ship.health.hull = 45;
  a.send('action', { kind: 'service', service: 'repair' });
  await until<WorldSnapshot>(a, 'snapshot', (s) =>
    s.ships.some((ship) => ship.id === pilot.id && ship.hull === 100),
  );
  a.send('action', { kind: 'undock' });
  await until<WorldSnapshot>(
    b,
    'snapshot',
    (s) =>
      s.ports.some(
        (p) => p.stationId === station.id && p.portId === port.id && p.occupant === null,
      ),
    6000,
  );
  expect(pilot.ship.controller.flightLocked).toBe(false);
  await a.leave();
  await b.leave();
}, 14000);
