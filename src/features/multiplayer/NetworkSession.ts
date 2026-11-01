import type { Room } from '@colyseus/sdk';
import {
  type ClientAction,
  errorSchema,
  type JoinOptions,
  joinSchema,
  type NetworkInput,
  PROTOCOL_VERSION,
  ROOM_NAME,
  snapshotSchema,
  type TravelPermit,
  travelSchema,
  type WorldSnapshot,
  welcomeSchema,
} from '@/engine/network/protocol';
import { useMultiplayerStore } from '@/stores/multiplayerStore';

const storageKey = 'event-horizon-guest';
const guestStorage = {
  get() {
    try {
      return globalThis.sessionStorage?.getItem(storageKey) ?? null;
    } catch {
      return null;
    }
  },
  set(token: string) {
    try {
      globalThis.sessionStorage?.setItem(storageKey, token);
    } catch {
      /* Storage is optional. */
    }
  },
  clear() {
    try {
      globalThis.sessionStorage?.removeItem(storageKey);
    } catch {
      /* Storage is optional. */
    }
  },
};
export class NetworkSession {
  room: Room<unknown> | null = null;
  latest: WorldSnapshot | null = null;
  onTravelExpired: (() => void) | null = null;
  private generation = 0;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private pendingTravel: {
    resolve: (permit: TravelPermit) => void;
    reject: (error: Error) => void;
  } | null = null;
  private pingSent = new Map<number, number>();
  private lastPing = 0;
  private readonly endpoint: string;
  private readonly onSnapshot: (snapshot: WorldSnapshot, first: boolean) => void;
  constructor(onSnapshot: (snapshot: WorldSnapshot, first: boolean) => void, endpoint?: string) {
    this.onSnapshot = onSnapshot;
    this.endpoint = endpoint || import.meta.env.VITE_MULTIPLAYER_URL || 'ws://127.0.0.1:2567';
  }
  get connected() {
    return this.room !== null;
  }
  get active() {
    return useMultiplayerStore.getState().status === 'online';
  }
  private delayed(callback: () => void, lossy = false) {
    const debug = useMultiplayerStore.getState();
    if (!import.meta.env.DEV || (!debug.latency && !debug.jitter && !debug.loss)) {
      callback();
      return;
    }
    if (lossy && Math.random() * 100 < debug.loss) return;
    if (this.timers.size >= 256) return;
    const timer = setTimeout(
      () => {
        this.timers.delete(timer);
        callback();
      },
      Math.max(0, debug.latency + (Math.random() * 2 - 1) * debug.jitter),
    );
    this.timers.add(timer);
  }
  async connect(name: string, systemId: JoinOptions['systemId']) {
    if (this.room || useMultiplayerStore.getState().status === 'connecting') return;
    const generation = ++this.generation;
    useMultiplayerStore.setState({ status: 'connecting', name, error: null });
    try {
      const { Client } = await import('@colyseus/sdk');
      const client = new Client(this.endpoint);
      let room: Room<unknown> | null = null;
      const token = guestStorage.get();
      if (token) {
        try {
          room = await client.reconnect(token);
        } catch {
          guestStorage.clear();
        }
      }
      room ??= await client.joinOrCreate(ROOM_NAME, {
        v: PROTOCOL_VERSION,
        name,
        systemId,
        instanceId: 'public',
      } satisfies JoinOptions);
      if (generation !== this.generation) {
        await room.leave();
        return;
      }
      this.bind(room);
    } catch (error) {
      if (generation === this.generation)
        useMultiplayerStore.setState({
          status: 'error',
          error: error instanceof Error ? error.message : 'Connection failed.',
        });
    }
  }
  private bind(room: Room<unknown>) {
    this.room = room;
    this.latest = null;
    guestStorage.set(room.reconnectionToken);
    useMultiplayerStore.setState({ status: 'online', roomId: room.roomId, error: null });
    room.onMessage('welcome', (value: unknown) => {
      const parsed = welcomeSchema.safeParse(value);
      if (!parsed.success || this.room !== room) return;
      useMultiplayerStore.setState({
        playerId: parsed.data.playerId,
        systemId: parsed.data.systemId,
        tickRate: parsed.data.tickRate,
      });
    });
    room.onMessage('snapshot', (value: unknown) =>
      this.delayed(() => {
        if (this.room !== room) return;
        const parsed = snapshotSchema.safeParse(value);
        if (!parsed.success) {
          useMultiplayerStore.setState({ error: 'Invalid server snapshot.' });
          return;
        }
        const snapshot = parsed.data;
        if (this.latest && snapshot.tick <= this.latest.tick) return;
        const first = !this.latest;
        this.latest = snapshot;
        useMultiplayerStore.setState({
          players: snapshot.players,
          kills: snapshot.kills,
          deaths: snapshot.deaths,
          systemId: snapshot.systemId,
          playerId: snapshot.playerId,
          tickRate: snapshot.tickRate,
        });
        this.onSnapshot(snapshot, first);
      }, true),
    );
    room.onMessage('error', (value: unknown) => {
      const parsed = errorSchema.safeParse(value);
      if (!parsed.success || this.room !== room) return;
      useMultiplayerStore.setState({ error: parsed.data.message });
      if (parsed.data.code === 'TRAVEL_EXPIRED') this.onTravelExpired?.();
      if (parsed.data.code === 'TRAVEL') {
        this.pendingTravel?.reject(new Error(parsed.data.message));
        this.pendingTravel = null;
      }
    });
    room.onMessage('travel', (value: unknown) => {
      const parsed = travelSchema.safeParse(value);
      if (!parsed.success || this.room !== room) return;
      useMultiplayerStore.setState({ error: null });
      this.pendingTravel?.resolve(parsed.data);
      this.pendingTravel = null;
    });
    room.onMessage('pong', (value: { nonce?: unknown }) => {
      if (typeof value.nonce !== 'number') return;
      const sent = this.pingSent.get(value.nonce);
      if (sent === undefined) return;
      this.pingSent.delete(value.nonce);
      useMultiplayerStore.setState({ rtt: performance.now() - sent });
    });
    room.onDrop(() => {
      if (this.room === room) {
        this.latest = null;
        useMultiplayerStore.setState({ status: 'reconnecting' });
      }
    });
    room.onReconnect(() => {
      if (this.room === room) {
        guestStorage.set(room.reconnectionToken);
        useMultiplayerStore.setState({ status: 'online', error: null });
      }
    });
    room.onLeave((code) => {
      if (this.room !== room) return;
      this.room = null;
      this.latest = null;
      guestStorage.clear();
      const state = useMultiplayerStore.getState();
      useMultiplayerStore.setState({
        status: 'error',
        error: 'Session ended. Joining a fresh guest session…',
      });
      if (code !== 4000) {
        const system = joinSchema.shape.systemId.safeParse(state.systemId);
        void this.connect(state.name, system.success ? system.data : 'solara');
      }
    });
    room.onError((_code, message) => {
      if (this.room === room) useMultiplayerStore.setState({ error: message ?? 'Network error.' });
    });
    this.ping();
  }
  ping() {
    if (!this.room || performance.now() - this.lastPing < 1000) return;
    this.lastPing = performance.now();
    const nonce = Math.floor(this.lastPing);
    this.pingSent.clear();
    this.pingSent.set(nonce, this.lastPing);
    this.action({ kind: 'ping', nonce });
  }
  send(input: NetworkInput) {
    const room = this.room;
    if (room && this.active)
      this.delayed(() => {
        if (this.room === room && this.active) room.send('input', input);
      }, true);
  }
  action(action: ClientAction) {
    this.room?.send('action', action);
  }
  travel(destination: JoinOptions['systemId']) {
    if (!this.active || this.pendingTravel)
      return Promise.reject(new Error('Connection is not ready for travel.'));
    return new Promise<TravelPermit>((resolve, reject) => {
      this.pendingTravel = { resolve, reject };
      this.action({ kind: 'travel', destination });
      const timer = setTimeout(() => {
        this.timers.delete(timer);
        if (this.pendingTravel?.resolve === resolve) {
          this.pendingTravel = null;
          reject(new Error('Travel request timed out.'));
        }
      }, 5000);
      this.timers.add(timer);
    });
  }
  async transfer(permit: TravelPermit) {
    const source = this.room,
      generation = this.generation;
    if (!source) throw new Error('Source connection lost.');
    useMultiplayerStore.setState({ status: 'transferring' });
    try {
      const { Client } = await import('@colyseus/sdk');
      const room = await new Client(this.endpoint).joinOrCreate<unknown>(ROOM_NAME, {
        v: 2,
        name: useMultiplayerStore.getState().name,
        systemId: permit.destination,
        instanceId: 'public',
        ticket: permit.ticket,
      } satisfies JoinOptions);
      if (generation !== this.generation) {
        await room.leave();
        throw new Error('Transfer cancelled.');
      }
      this.bind(room);
      useMultiplayerStore.setState({ status: 'transferring' });
      void source.leave();
      await new Promise<void>((resolve, reject) => {
        const start = performance.now();
        const poll = () => {
          if (this.room !== room) {
            reject(new Error('Destination connection lost.'));
            return;
          }
          if (this.latest) {
            resolve();
            return;
          }
          if (performance.now() - start > 5000) {
            reject(new Error('Destination state timed out.'));
            return;
          }
          const timer = setTimeout(() => {
            this.timers.delete(timer);
            poll();
          }, 25);
          this.timers.add(timer);
        };
        poll();
      });
    } catch (error) {
      if (this.room === source) {
        useMultiplayerStore.setState({ status: 'online' });
        this.action({ kind: 'cancel-travel' });
      }
      throw error;
    }
  }
  ready() {
    if (!this.room) return;
    this.action({ kind: 'ready' });
    useMultiplayerStore.setState({ status: 'online' });
  }
  cancelTravel() {
    this.pendingTravel?.reject(new Error('Travel cancelled.'));
    this.pendingTravel = null;
    this.action({ kind: 'cancel-travel' });
    if (this.room) useMultiplayerStore.setState({ status: 'online' });
  }
  disconnect() {
    this.generation++;
    const room = this.room;
    this.room = null;
    this.latest = null;
    this.pendingTravel?.reject(new Error('Disconnected.'));
    this.pendingTravel = null;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    this.pingSent.clear();
    if (room || useMultiplayerStore.getState().status !== 'offline') guestStorage.clear();
    if (room) void room.leave();
    useMultiplayerStore.setState({ status: 'offline', players: 0, playerId: '', error: null });
  }
}
