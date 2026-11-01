import { Quaternion, Vector3 } from 'three';
import { COLLISION_LAYERS } from '@/engine/physics/spheres';
import { FlightController } from '@/engine/simulation/FlightController';
import {
  createFlightInput,
  type FlightConfig,
  type FlightInput,
} from '@/engine/simulation/flightTypes';
import { type DefenseConfig, ShipHealth } from './damage';

export interface ProjectileConfig {
  readonly interval: number;
  readonly damage: number;
  readonly speed: number;
  readonly lifetime: number;
  readonly radius: number;
  readonly aimAssistAngle: number;
  /** Travel relative to the inherited launch velocity, in metres. */
  readonly range: number;
  readonly velocityInheritance: number;
}
export interface LaserConfig extends ProjectileConfig {
  readonly hardpoints: readonly (readonly [number, number, number])[];
  readonly firingMode: 'alternating' | 'synchronized';
  /** Heat is normalized to a capacity of one. */
  readonly heat: {
    readonly perShot: number;
    readonly coolingRate: number;
    readonly resumeAt: number;
  };
}
export type WeaponSlot = 1 | 2 | 3 | 4;
export interface MissileConfig extends ProjectileConfig {
  readonly turnRate: number;
  readonly lockRange: number;
  readonly lockAngle: number;
}
export interface RailgunConfig {
  readonly chargeTime: number;
  readonly interval: number;
  readonly damage: number;
  readonly range: number;
  readonly radius: number;
  readonly duration: number;
}
export interface FlakConfig extends ProjectileConfig {
  readonly pellets: number;
  readonly spreadAngle: number;
}
export interface ShipConfig {
  readonly name: string;
  readonly mass: number;
  readonly radius: number;
  readonly flight: FlightConfig;
  readonly defense: DefenseConfig;
  readonly laser: LaserConfig;
  readonly missile: MissileConfig;
  readonly railgun: RailgunConfig;
  readonly flak: FlakConfig;
}
export interface AiConfig {
  readonly detectionRange: number;
  readonly disengageRange: number;
  readonly attackRange: number;
  readonly preferredDistance: number;
  readonly aimTolerance: number;
  readonly evadeDistance: number;
  readonly evadeDuration: number;
  readonly evadeOnHit: boolean;
  readonly reactionTime: number;
  readonly aimError: number;
  readonly aggressiveness: number;
  readonly maneuverability: number;
  readonly retreatHull: number;
}
export type AiState =
  | 'patrol'
  | 'pursue'
  | 'attack'
  | 'evade'
  | 'retreat'
  | 'disengage'
  | 'destroyed';
export interface ShipCommand {
  readonly flight: FlightInput;
  fire: boolean;
  weapon?: WeaponSlot;
}

export class CombatShip {
  readonly layer = COLLISION_LAYERS.ship;
  readonly mask =
    COLLISION_LAYERS.ship | COLLISION_LAYERS.environment | COLLISION_LAYERS.projectile;
  readonly id: string;
  readonly team: 'player' | 'hostile';
  readonly config: ShipConfig;
  readonly controller: FlightController;
  readonly health: ShipHealth;
  readonly position = new Vector3();
  readonly previous = new Vector3();
  readonly velocity = new Vector3();
  readonly orientation = new Quaternion();
  readonly previousOrientation = new Quaternion();
  readonly home = new Vector3();
  readonly command: ShipCommand = { flight: createFlightInput(), fire: false };
  aiState: AiState = 'patrol';
  aiElapsed = 0;
  aiTime = 0;
  aiReaction = 0;
  readonly aiPhase: number;
  cooldown = 0;
  railgunCharge = 0;
  weapon: WeaponSlot = 1;
  barrel = 0;
  heat = 0;
  overheated = false;
  hitFlash = 0;
  shieldHit = false;
  stationary = false;

  constructor(
    id: string,
    team: CombatShip['team'],
    config: ShipConfig,
    controller = new FlightController(config.flight),
  ) {
    this.id = id;
    let seed = 2166136261;
    for (const char of id) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
    this.aiPhase = ((seed >>> 0) / 0xffffffff) * Math.PI * 2;
    this.team = team;
    this.config = config;
    this.controller = controller;
    this.health = new ShipHealth(config.defense);
    this.sync();
    this.previous.copy(this.position);
    this.previousOrientation.copy(this.orientation);
    this.home.copy(this.position);
  }

  get radius() {
    return this.config.radius;
  }
  get inverseMass() {
    return 1 / this.config.mass;
  }

  sync() {
    this.controller.copyTransform(this.position, this.orientation);
    this.controller.copyVelocity(this.velocity);
  }
}

export interface Obstacle {
  readonly id: string;
  readonly kind: 'celestial' | 'asteroid';
  readonly inverseMass: 0;
  readonly layer: 2;
  readonly mask: 5;
  readonly radius: number;
  readonly position: Vector3;
  readonly previous: Vector3;
  readonly velocity: Vector3;
}
interface ProjectileState {
  readonly id: number;
  readonly owner: string;
  readonly team: CombatShip['team'];
  readonly position: Vector3;
  readonly previous: Vector3;
  readonly velocity: Vector3;
  readonly damage: number;
  readonly radius: number;
  readonly speed: number;
  range: number;
  life: number;
}
export type Projectile = ProjectileState &
  (
    | { readonly kind: 'gun' | 'flak' }
    | {
        readonly kind: 'missile';
        targetId: string | null;
        readonly heading: Vector3;
        readonly inheritedVelocity: Vector3;
        readonly turnRate: number;
      }
  );
export interface RailgunTrace {
  readonly id: number;
  readonly owner: string;
  readonly start: Vector3;
  readonly end: Vector3;
  readonly team: CombatShip['team'];
  age: number;
  readonly lifetime: number;
}
export interface CombatEffect {
  readonly id: number;
  readonly kind:
    | 'shield'
    | 'impact'
    | 'explosion'
    | 'shot'
    | 'missile-launch'
    | 'detonation'
    | 'railgun-shot'
    | 'flak-shot';
  readonly position: Vector3;
  readonly team: CombatShip['team'];
  age: number;
  readonly lifetime: number;
}

/** Bounded, explicit gameplay events; effects/audio are separate presentation consumers. */
export type CombatEventDetail =
  | { readonly kind: 'spawned' | 'destroyed'; readonly sourceId: string | null }
  | { readonly kind: 'fired'; readonly weapon: WeaponSlot }
  | { readonly kind: 'impact'; readonly sourceId: string; readonly targetId: string | null }
  | {
      readonly kind: 'damage';
      readonly sourceId: string | null;
      readonly shields: number;
      readonly hull: number;
    };
export type CombatEvent = {
  readonly id: number;
  readonly time: number;
  readonly shipId: string;
  readonly position: readonly [number, number, number];
} & CombatEventDetail;
