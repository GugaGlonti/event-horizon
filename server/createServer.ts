import { randomUUID } from 'node:crypto';
import { createServer as createHttpServer } from 'node:http';
import { performance } from 'node:perf_hooks';
import { type Client, Room, Server, ServerError } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { MultiplayerWorld } from '@/engine/network/MultiplayerWorld';
import {
  actionSchema,
  type JoinOptions,
  joinSchema,
  ROOM_NAME,
  type TravelPermit,
} from '@/engine/network/protocol';
import { performGameplayAction } from '@/engine/simulation/shipActions';
import type { ServerConfig } from './config';

interface Ticket {
  id: string;
  name: string;
  source: StarSystemRoom;
  destination: JoinOptions['systemId'];
  expires: number;
}
interface Peer {
  id: string;
  event: number;
  actions: number;
  tokens: number;
}
export interface RoomMetrics {
  ticks: number;
  totalMs: number;
  maxMs: number;
  overruns: number;
  bytes: number;
  snapshots: number;
}
export class StarSystemRoom extends Room {
  world!: MultiplayerWorld;
  metrics: RoomMetrics = { ticks: 0, totalMs: 0, maxMs: 0, overruns: 0, bytes: 0, snapshots: 0 };
  config!: ServerConfig;
  tickets!: Map<string, Ticket>;
  rooms!: Set<StarSystemRoom>;
  private peers = new Map<string, Peer>();
  private snapshotClock = 0;
  private latestTickMs = 0;
  initialize(
    options: unknown,
    config: ServerConfig,
    tickets: Map<string, Ticket>,
    rooms: Set<StarSystemRoom>,
  ) {
    const join = joinSchema.parse(options);
    this.config = config;
    this.tickets = tickets;
    this.rooms = rooms;
    this.maxClients = config.capacity;
    this.world = new MultiplayerWorld(join.systemId, this.roomId, config.tickRate);
    this.setMetadata({ systemId: join.systemId, instanceId: this.roomId });
    this.maxMessagesPerSecond = 120;
    rooms.add(this);
    this.onMessage('input', (client, data: unknown) => {
      const peer = this.peers.get(client.sessionId),
        pilot = peer && this.world.pilots.get(peer.id);
      if (pilot && !pilot.ship.transferring && !pilot.inputs.accept(data))
        this.error(client, 'INPUT', 'Input rejected.');
    });
    this.onMessage('action', (client, data: unknown) => this.action(client, data));
    this.onMessage('*', (client) => this.error(client, 'MESSAGE', 'Unknown message type.'));
    this.setFixedTimestep(() => this.tick(), config.tickRate);
  }
  onAuth(_client: Client, options: unknown) {
    const parsed = joinSchema.safeParse(options);
    if (!parsed.success)
      throw new ServerError(400, 'Incompatible protocol or invalid join options.');
    if (parsed.data.systemId !== this.world.system.definition.id)
      throw new ServerError(400, 'Room identity mismatch.');
    return true;
  }
  onJoin(client: Client, options: unknown) {
    const join = joinSchema.parse(options),
      ticket = join.ticket ? this.tickets.get(join.ticket) : undefined;
    if (
      join.ticket &&
      (!ticket || ticket.expires < Date.now() || ticket.destination !== join.systemId)
    )
      throw new ServerError(403, 'Travel permit expired.');
    const id = ticket ? ticket.id : randomUUID();
    const source = ticket ? ticket.source.world.pilots.get(id) : undefined;
    if (ticket && !source) throw new ServerError(409, 'Travel session no longer exists.');
    const pilot = this.world.addPlayer(
      id,
      ticket ? ticket.name : join.name,
      source && {
        flight: source.ship.controller.snapshot(),
        sinceDamage: source.ship.health.sinceDamage,
        shields: source.ship.health.shields,
        hull: source.ship.health.hull,
        kills: source.kills,
        deaths: source.deaths,
      },
      ticket ? ticket.source.world.system.definition.id : undefined,
    );
    if (ticket && join.ticket) {
      pilot.ship.transferring = true;
      ticket.source.world.removePlayer(id);
      this.tickets.delete(join.ticket);
    }
    this.peers.set(client.sessionId, {
      id,
      event: this.world.simulation.events.at(-1)?.id ?? 0,
      actions: 0,
      tokens: 10,
    });
    this.sendWelcome(client, id);
  }
  private sendWelcome(client: Client, id: string) {
    client.send('welcome', {
      v: 3,
      playerId: id,
      systemId: this.world.system.definition.id,
      instanceId: this.world.instanceId,
      tickRate: this.config.tickRate,
    });
  }
  private error(client: Client, code: string, message: string) {
    client.send('error', { code, message });
  }
  private action(client: Client, data: unknown) {
    const peer = this.peers.get(client.sessionId);
    if (!peer || peer.tokens < 1) return;
    peer.tokens--;
    peer.actions++;
    const action = actionSchema.safeParse(data);
    if (!action.success) {
      this.error(client, 'ACTION', 'Invalid action.');
      return;
    }
    const pilot = this.world.pilots.get(peer.id);
    if (!pilot) return;
    switch (action.data.kind) {
      case 'landing-gear':
      case 'transit':
      case 'landing-assist':
      case 'takeoff':
      case 'dock':
      case 'capture':
      case 'cancel-docking':
      case 'undock':
      case 'service': {
        const error = performGameplayAction(this.world.simulation, peer.id, action.data);
        if (error) this.error(client, 'SHIP_ACTION', error);
        break;
      }
      case 'ping':
        client.send('pong', { nonce: action.data.nonce });
        this.sendWelcome(client, peer.id);
        break;
      case 'respawn':
        if (!this.world.respawn(peer.id))
          this.error(client, 'RESPAWN', 'Respawn requires a destroyed ship.');
        break;
      case 'encounter':
        if (!pilot.ship.health.destroyed && !pilot.ship.transferring)
          this.world.startEncounter(action.data.practice);
        break;
      case 'ready':
        for (const [key, ticket] of this.tickets)
          if (ticket.id === peer.id && ticket.source === this) this.tickets.delete(key);
        if (!this.world.releasePlayer(peer.id))
          this.error(client, 'ARRIVAL', 'Arrival is occupied. Holding safely; retry when clear.');
        break;
      case 'cancel-travel':
        for (const [key, ticket] of this.tickets)
          if (ticket.id === peer.id && ticket.source === this) this.tickets.delete(key);
        if (!this.world.releasePlayer(peer.id))
          this.error(client, 'ARRIVAL', 'Arrival is occupied. Holding safely; retry when clear.');
        break;
      case 'travel': {
        if (!this.world.canTravel(peer.id, action.data.destination)) {
          this.error(client, 'TRAVEL', 'Hyperdrive unavailable or departure corridor blocked.');
          return;
        }
        const ticket = randomUUID();
        pilot.ship.transferring = true;
        pilot.travelCooldown = 13;
        pilot.inputs.clear();
        pilot.ship.command.fire = false;
        pilot.ship.railgunCharge = 0;
        this.tickets.set(ticket, {
          id: peer.id,
          name: pilot.name,
          source: this,
          destination: action.data.destination,
          expires: Date.now() + 30000,
        });
        const permit: TravelPermit = {
          destination: action.data.destination,
          ticket,
          expiresIn: 30,
        };
        client.send('travel', permit);
        break;
      }
    }
  }
  private tick() {
    const start = performance.now();
    this.world.step();
    for (const peer of this.peers.values())
      peer.tokens = Math.min(10, peer.tokens + 5 / this.config.tickRate);
    for (const [key, ticket] of this.tickets)
      if (ticket.source === this && ticket.expires < Date.now()) {
        this.tickets.delete(key);
        const pilot = this.world.pilots.get(ticket.id);
        if (pilot) {
          this.world.releasePlayer(pilot.id);
          for (const client of this.clients)
            if (this.peers.get(client.sessionId)?.id === pilot.id)
              this.error(
                client,
                'TRAVEL_EXPIRED',
                'Travel permit expired. Holding in the source system.',
              );
        }
      }
    this.snapshotClock += this.config.snapshotRate;
    if (this.snapshotClock >= this.config.tickRate) {
      this.snapshotClock -= this.config.tickRate;
      for (const client of this.clients) {
        const peer = this.peers.get(client.sessionId);
        if (!peer || !this.world.pilots.has(peer.id)) continue;
        const snapshot = this.world.snapshot(
          peer.id,
          this.config.relevance,
          this.world.tick % this.config.tickRate === 0,
          peer.event,
        );
        snapshot.tickMs = this.latestTickMs;
        snapshot.overruns = this.metrics.overruns;
        peer.event = this.world.simulation.events.at(-1)?.id ?? peer.event;
        client.send('snapshot', snapshot);
        this.metrics.bytes += Buffer.byteLength(JSON.stringify(snapshot));
        this.metrics.snapshots++;
      }
    }
    this.latestTickMs = performance.now() - start;
    if (this.config.debug && this.world.tick % (this.config.tickRate * 5) === 0)
      console.info(
        JSON.stringify({
          room: this.roomId,
          system: this.world.system.definition.id,
          players: this.world.pilots.size,
          ...this.metrics,
        }),
      );
    this.metrics.ticks++;
    this.metrics.totalMs += this.latestTickMs;
    this.metrics.maxMs = Math.max(this.metrics.maxMs, this.latestTickMs);
    if (this.latestTickMs > 1000 / this.config.tickRate) this.metrics.overruns++;
  }
  async onDrop(client: Client) {
    const peer = this.peers.get(client.sessionId),
      pilot = peer && this.world.pilots.get(peer.id);
    if (pilot) {
      this.world.simulation.stations?.cancel(pilot.id);
      pilot.connected = false;
      pilot.inputs.clear();
      pilot.ship.command.fire = false;
    }
    try {
      await this.allowReconnection(client, this.config.grace);
    } catch {
      /* Permanent cleanup is owned by onLeave. */
    }
  }
  onReconnect(client: Client) {
    const peer = this.peers.get(client.sessionId),
      pilot = peer && this.world.pilots.get(peer.id);
    if (pilot) {
      pilot.connected = true;
      pilot.inputs.clear();
      this.sendWelcome(client, pilot.id);
    }
  }
  onLeave(client: Client) {
    const peer = this.peers.get(client.sessionId);
    if (peer) {
      this.world.removePlayer(peer.id);
      for (const [key, ticket] of this.tickets)
        if (ticket.id === peer.id && ticket.source === this) this.tickets.delete(key);
    }
    this.peers.delete(client.sessionId);
  }
  onDispose() {
    this.rooms.delete(this);
    for (const [key, ticket] of this.tickets) if (ticket.source === this) this.tickets.delete(key);
  }
}
export async function createGameServer(config: ServerConfig, port = config.port) {
  const rooms = new Set<StarSystemRoom>(),
    tickets = new Map<string, Ticket>();
  class ConfiguredRoom extends StarSystemRoom {
    onCreate(options: unknown) {
      this.initialize(options, config, tickets, rooms);
    }
  }
  const http = createHttpServer();
  const transport = new WebSocketTransport({
    server: http,
    maxPayload: 4096,
    perMessageDeflate: false,
  });
  const server = new Server({ transport, gracefullyShutdown: false, greet: false });
  server.define(ROOM_NAME, ConfiguredRoom).filterBy(['systemId']);
  await server.listen(port, config.host);
  const address = http.address();
  if (!address || typeof address === 'string') throw new Error('Server did not bind a TCP port.');
  return { server, rooms, port: address.port, close: () => server.gracefullyShutdown(false) };
}
