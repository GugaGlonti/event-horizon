import { Client, type Room } from '@colyseus/sdk';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from '@/engine/math/linear';
import { neutralInput } from '@/engine/network/InputQueue';
import { ROOM_NAME, type TravelPermit, type WorldSnapshot } from '@/engine/network/protocol';
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
    v: 1,
    name,
    systemId,
    instanceId: 'public',
    ...(ticket ? { ticket } : {}),
  });
  clients.push(room);
  room.onMessage('welcome', () => {});
  room.onMessage('error', () => {});
  room.onMessage('pong', () => {});
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
