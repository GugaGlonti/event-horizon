import { z } from 'zod';
import type { CombatEvent } from '@/engine/combat/combatTypes';
import type { FlightController } from '@/engine/simulation/FlightController';
import type { DockingState } from '@/engine/stations/stationTypes';

export const PROTOCOL_VERSION = 4;
export const ROOM_NAME = 'star-system';
const axis = z.number().finite().min(-1).max(1);
const id = z.string().min(1).max(80);
export const joinSchema = z.strictObject({
  v: z.literal(PROTOCOL_VERSION),
  name: z
    .string()
    .trim()
    .min(1)
    .max(24)
    .regex(/^[\p{L}\p{N} _-]+$/u),
  systemId: z.enum(['solara', 'vesper', 'aether']),
  instanceId: z.literal('public').default('public'),
  ticket: z.string().uuid().optional(),
});
export const flightInputSchema = z.strictObject({
  pitch: axis,
  yaw: axis,
  roll: axis,
  throttle: z.number().min(0).max(1),
  boost: z.boolean(),
  brake: z.boolean(),
  strafe: axis,
  lift: axis,
  reverse: z.boolean(),
});
export const inputSchema = z.strictObject({
  seq: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  flight: flightInputSchema,
  fire: z.boolean(),
  weapon: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  targetId: id.nullable(),
  paused: z.boolean(),
  assistance: z.boolean(),
});
export const gameplayActionSchemas = [
  z.strictObject({ kind: z.literal('landing-gear'), enabled: z.boolean() }),
  z.strictObject({ kind: z.literal('transit'), enabled: z.boolean() }),
  z.strictObject({ kind: z.literal('landing-assist'), zoneId: id.nullable() }),
  z.strictObject({ kind: z.literal('takeoff') }),
  z.strictObject({ kind: z.literal('dock'), stationId: id, portId: id.optional() }),
  z.strictObject({ kind: z.literal('capture') }),
  z.strictObject({ kind: z.literal('cancel-docking') }),
  z.strictObject({ kind: z.literal('undock') }),
  z.strictObject({ kind: z.literal('service'), service: z.enum(['repair', 'shields', 'weapons']) }),
] as const;
export const actionSchema = z.discriminatedUnion('kind', [
  ...gameplayActionSchemas,
  z.strictObject({
    kind: z.literal('travel'),
    destination: z.enum(['solara', 'vesper', 'aether']),
  }),
  z.strictObject({ kind: z.literal('cancel-travel') }),
  z.strictObject({ kind: z.literal('ready') }),
  z.strictObject({ kind: z.literal('respawn') }),
  z.strictObject({ kind: z.literal('encounter'), practice: z.boolean() }),
  z.strictObject({ kind: z.literal('ping'), nonce: z.number().int().min(0).max(1e12) }),
]);
export type JoinOptions = z.infer<typeof joinSchema>;
export type NetworkInput = z.infer<typeof inputSchema>;
export type ClientAction = z.infer<typeof actionSchema>;
export type FlightState = ReturnType<FlightController['snapshot']>;
export interface ShipState {
  id: string;
  name: string;
  player: boolean;
  stationary: boolean;
  flight: FlightState;
  docking: DockingState;
  shields: number;
  hull: number;
  protection: number;
  transferring: boolean;
  weapon: 1 | 2 | 3 | 4;
  heat: number;
  overheated: boolean;
  cooldown: number;
  charge: number;
  firing: boolean;
  hitFlash: number;
  shieldHit: boolean;
}
export interface ShotState {
  id: number;
  owner: string;
  team: 'player' | 'hostile';
  kind: 'gun' | 'missile' | 'flak';
  position: [number, number, number];
  velocity: [number, number, number];
  life: number;
}
export interface EffectState {
  id: number;
  kind:
    | 'shield'
    | 'impact'
    | 'explosion'
    | 'shot'
    | 'missile-launch'
    | 'detonation'
    | 'railgun-shot'
    | 'flak-shot';
  position: [number, number, number];
  team: 'player' | 'hostile';
  age: number;
  lifetime: number;
}
export interface WorldSnapshot {
  v: 4;
  tick: number;
  time: number;
  systemId: string;
  instanceId: string;
  playerId: string;
  ack: number;
  tickRate: number;
  players: number;
  kills: number;
  deaths: number;
  tickMs: number;
  overruns: number;
  roster: string[];
  ports: { stationId: string; portId: string; occupant: string | null }[];
  ships: ShipState[];
  projectiles: ShotState[];
  effects: EffectState[];
  events: CombatEvent[];
  tracers: {
    id: number;
    owner: string;
    team: 'player' | 'hostile';
    start: [number, number, number];
    end: [number, number, number];
    age: number;
    lifetime: number;
  }[];
}
export interface TravelPermit {
  destination: JoinOptions['systemId'];
  ticket: string;
  expiresIn: number;
}
export interface Welcome {
  v: 4;
  playerId: string;
  systemId: string;
  instanceId: string;
  tickRate: number;
}
export interface NetworkError {
  code: string;
  message: string;
}

const scalar = z.number().finite();
const vec = z.tuple([scalar, scalar, scalar]);
const quat = z.tuple([scalar, scalar, scalar, scalar]);
const flightStateSchema = z.strictObject({
  position: vec,
  velocity: vec,
  orientation: quat,
  angularVelocity: vec,
  throttle: scalar,
  boostCharge: scalar,
  boostDelay: scalar,
  boostExhausted: z.boolean(),
  boosting: z.boolean(),
  assistance: z.boolean(),
  distance: scalar,
  surface: z.strictObject({
    phase: z.enum(['flying', 'approaching', 'landing', 'landed', 'taking-off']),
    bodyId: id.nullable(),
    timer: scalar,
    anchor: vec.nullable(),
    orientation: quat.nullable(),
  }),
  landingGear: z.boolean(),
  landingAssist: id.nullable(),
  travelMode: z.enum(['normal', 'transit', 'surface']),
  flightLocked: z.boolean(),
});
const team = z.enum(['player', 'hostile']);
const slot = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);
const eventBase = { id: scalar, time: scalar, shipId: id, position: vec };
const eventSchema = z.discriminatedUnion('kind', [
  z.object({ ...eventBase, kind: z.enum(['spawned', 'destroyed']), sourceId: id.nullable() }),
  z.object({ ...eventBase, kind: z.literal('fired'), weapon: slot }),
  z.object({ ...eventBase, kind: z.literal('impact'), sourceId: id, targetId: id.nullable() }),
  z.object({
    ...eventBase,
    kind: z.literal('damage'),
    sourceId: id.nullable(),
    shields: scalar,
    hull: scalar,
  }),
]);
const dockingStateSchema: z.ZodType<DockingState> = z.strictObject({
  phase: z.enum([
    'undocked',
    'requested',
    'approaching',
    'aligning',
    'docking',
    'docked',
    'undocking',
  ]),
  stationId: id.nullable(),
  portId: id.nullable(),
  timer: scalar,
  start: vec.nullable(),
  orientation: quat.nullable(),
});
export const snapshotSchema: z.ZodType<WorldSnapshot> = z.strictObject({
  v: z.literal(PROTOCOL_VERSION),
  tick: scalar,
  time: scalar,
  systemId: id,
  instanceId: id,
  playerId: id,
  ack: scalar,
  tickRate: scalar.min(10).max(60),
  players: scalar,
  kills: scalar,
  deaths: scalar,
  tickMs: scalar,
  overruns: scalar,
  roster: z.array(id).max(42),
  ports: z.array(z.strictObject({ stationId: id, portId: id, occupant: id.nullable() })).max(32),
  ships: z
    .array(
      z.strictObject({
        id,
        name: z.string().max(24),
        player: z.boolean(),
        stationary: z.boolean(),
        flight: flightStateSchema,
        docking: dockingStateSchema,
        shields: scalar,
        hull: scalar,
        protection: scalar,
        transferring: z.boolean(),
        weapon: slot,
        heat: scalar,
        overheated: z.boolean(),
        cooldown: scalar,
        charge: scalar,
        firing: z.boolean(),
        hitFlash: scalar,
        shieldHit: z.boolean(),
      }),
    )
    .max(42),
  projectiles: z
    .array(
      z.strictObject({
        id: scalar,
        owner: id,
        team,
        kind: z.enum(['gun', 'missile', 'flak']),
        position: vec,
        velocity: vec,
        life: scalar,
      }),
    )
    .max(192),
  effects: z
    .array(
      z.strictObject({
        id: scalar,
        kind: z.enum([
          'shield',
          'impact',
          'explosion',
          'shot',
          'missile-launch',
          'detonation',
          'railgun-shot',
          'flak-shot',
        ]),
        position: vec,
        team,
        age: scalar,
        lifetime: scalar,
      }),
    )
    .max(96),
  events: z.array(eventSchema).max(128),
  tracers: z
    .array(
      z.strictObject({
        id: scalar,
        owner: id,
        team,
        start: vec,
        end: vec,
        age: scalar,
        lifetime: scalar,
      }),
    )
    .max(32),
});
export const welcomeSchema: z.ZodType<Welcome> = z.strictObject({
  v: z.literal(PROTOCOL_VERSION),
  playerId: id,
  systemId: id,
  instanceId: id,
  tickRate: scalar.min(10).max(60),
});
export const travelSchema: z.ZodType<TravelPermit> = z.strictObject({
  destination: z.enum(['solara', 'vesper', 'aether']),
  ticket: z.string().uuid(),
  expiresIn: scalar,
});
export const errorSchema: z.ZodType<NetworkError> = z.strictObject({
  code: z.string().max(32),
  message: z.string().max(200),
});
