import { Client, type Room } from '@colyseus/sdk';
import { neutralInput } from '@/engine/network/InputQueue';
import { ROOM_NAME, type WorldSnapshot } from '@/engine/network/protocol';
import { serverConfig } from '../server/config';
import { createGameServer } from '../server/createServer';
import { placeVerificationPilots, verificationScenarios } from './planetaryFixtures';

const scenario = verificationScenarios.find((s) => s === process.env.LOAD_SCENARIO);
const seconds = Math.max(3, Math.min(120, Number(process.env.LOAD_SECONDS) || 10));
const latency = Math.max(0, Math.min(1000, Number(process.env.LOAD_LATENCY_MS) || 0));
const populations = process.argv
  .slice(2)
  .map(Number)
  .filter((n) => Number.isInteger(n) && n >= 2 && n <= 32);
const game = await createGameServer({ ...serverConfig({}), capacity: 32 }, 0);
const results = [];
try {
  for (const count of populations.length ? populations : [2, 8, 16]) {
    const rooms: Room<unknown>[] = [],
      timers = new Set<ReturnType<typeof setTimeout>>();
    const sizes: number[] = [],
      ackDelays: number[] = [];
    const seqs = Array<number>(count).fill(0),
      sent = Array.from({ length: count }, () => new Map<number, number>());
    let snapshots = 0,
      bytes = 0;
    let wireBytes = 0,
      wireMessages = 0,
      inputBytes = 0;
    for (let i = 0; i < count; i++) {
      const room = await new Client(`ws://127.0.0.1:${game.port}`).joinOrCreate<unknown>(
        ROOM_NAME,
        { v: 4, name: `Load-${i}`, systemId: 'solara', instanceId: 'public' },
      );
      const receive = room.connection.events.onmessage;
      room.connection.events.onmessage = (event: { data: unknown }) => {
        const data = event.data;
        const size =
          typeof data === 'string'
            ? Buffer.byteLength(data)
            : data instanceof ArrayBuffer || ArrayBuffer.isView(data)
              ? data.byteLength
              : 0;
        wireBytes += size;
        wireMessages++;
        receive?.(event);
      };
      const send = room.connection.send.bind(room.connection);
      room.connection.send = (data: Buffer | Uint8Array) => {
        inputBytes += data.byteLength;
        send(data);
      };
      room.onMessage('welcome', () => {});
      room.onMessage('error', () => {});
      room.onMessage<WorldSnapshot>('snapshot', (snapshot) => {
        const record = () => {
          const size = Buffer.byteLength(JSON.stringify(snapshot));
          sizes.push(size);
          bytes += size;
          snapshots++;
          const start = sent[i]?.get(snapshot.ack);
          if (start !== undefined) {
            ackDelays.push(performance.now() - start);
            sent[i]?.delete(snapshot.ack);
          }
        };
        if (latency) {
          const timer = setTimeout(() => {
            timers.delete(timer);
            record();
          }, latency);
          timers.add(timer);
        } else record();
      });
      if (rooms[0] && room.roomId !== rooms[0].roomId)
        throw new Error('Load clients did not join one shared room.');
      rooms.push(room);
    }
    rooms[0]?.send('action', { kind: 'encounter', practice: false });
    const authority = [...game.rooms].find((room) => room.roomId === rooms[0]?.roomId);
    if (authority && scenario) placeVerificationPilots(authority.world, scenario);
    const before = authority ? { ...authority.metrics } : null;
    const cpu = process.cpuUsage(),
      start = performance.now(),
      initialRss = process.memoryUsage().rss;
    const interval = setInterval(
      () =>
        rooms.forEach((room, i) => {
          const seq = (seqs[i] ?? 0) + 1;
          seqs[i] = seq;
          const command = {
            ...neutralInput(seq),
            paused: false,
            fire: scenario !== 'descent',
            flight: {
              ...neutralInput().flight,
              throttle:
                scenario === 'low' || scenario === 'land' || scenario === 'descent' ? 0 : 0.5,
              lift: scenario === 'descent' ? -1 : 0,
              strafe: scenario === 'low' ? 0.08 : 0,
              yaw: scenario === 'descent' ? 0 : Math.sin(seq / 80 + i) * 0.25,
            },
          };
          sent[i]?.set(seq, performance.now());
          if ((sent[i]?.size ?? 0) > 120) sent[i]?.delete(seq - 120);
          if (latency) {
            const timer = setTimeout(() => {
              timers.delete(timer);
              room.send('input', command);
            }, latency);
            timers.add(timer);
          } else room.send('input', command);
        }),
      1000 / 30,
    );
    await new Promise<void>((resolve) => setTimeout(resolve, seconds * 1000));
    clearInterval(interval);
    const elapsed = (performance.now() - start) / 1000,
      used = process.cpuUsage(cpu),
      memory = process.memoryUsage();
    const ticks = authority && before ? authority.metrics.ticks - before.ticks : 0;
    sizes.sort((a, b) => a - b);
    ackDelays.sort((a, b) => a - b);
    results.push({
      scenario: scenario ?? 'space-combat',
      players: count,
      seconds: Number(elapsed.toFixed(2)),
      simulatedOneWayLatencyMs: latency,
      actualTickHz: Number((ticks / elapsed).toFixed(2)),
      meanTickMs:
        authority && before
          ? Number(((authority.metrics.totalMs - before.totalMs) / ticks).toFixed(3))
          : 0,
      maxTickMs: authority?.metrics.maxMs,
      overruns: authority && before ? authority.metrics.overruns - before.overruns : 0,
      cpuPercentOneCore: Number((((used.user + used.system) / 1e6 / elapsed) * 100).toFixed(1)),
      rssMiB: Number((memory.rss / 1048576).toFixed(1)),
      rssDeltaMiB: Number(((memory.rss - initialRss) / 1048576).toFixed(1)),
      meanBinaryMessageBytes: Math.round(wireBytes / Math.max(1, wireMessages)),
      perClientDownKiBPerSecond: Number((wireBytes / count / elapsed / 1024).toFixed(1)),
      perClientUpKiBPerSecond: Number((inputBytes / count / elapsed / 1024).toFixed(1)),
      meanSnapshotJsonBytes: Math.round(bytes / Math.max(1, snapshots)),
      p95SnapshotJsonBytes: sizes[Math.floor(sizes.length * 0.95)] ?? 0,
      perClientJsonKiBPerSecond: Number((bytes / count / elapsed / 1024).toFixed(1)),
      p95InputAckMs: Math.round(ackDelays[Math.floor(ackDelays.length * 0.95)] ?? 0),
    });
    for (const timer of timers) clearTimeout(timer);
    await Promise.all(rooms.map((room) => room.leave()));
    await new Promise<void>((resolve) => setTimeout(resolve, 150));
  }
  console.info(
    JSON.stringify(
      {
        runtime: process.version,
        platform: process.platform,
        measurement:
          'Single process: server plus bots; binary transport payload sizes exclude WebSocket/TCP headers. JSON sizes are diagnostic.',
        results,
      },
      null,
      2,
    ),
  );
} finally {
  await game.close();
}
