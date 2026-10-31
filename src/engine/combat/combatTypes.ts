import { Quaternion, Vector3 } from 'three';
import { COLLISION_LAYERS } from '@/engine/physics/spheres';
import { FlightController } from '@/engine/simulation/FlightController';
import {
  createFlightInput,
  type FlightConfig,
  type FlightInput,
} from '@/engine/simulation/flightTypes';
import { type DefenseConfig, ShipHealth } from './damage';

export interface LaserConfig {
  readonly interval: number;
  readonly damage: number;
  readonly speed: number;
  readonly lifetime: number;
  readonly radius: number;
  readonly aimAssistAngle: number;
}
export type WeaponSlot = 1 | 2 | 3 | 4;
export interface MissileConfig extends LaserConfig {
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
export interface FlakConfig extends LaserConfig {
  readonly pellets: number;
  readonly spreadAngle: number;
}
export interface ShipConfig {
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
  readonly aimTolerance: number;
  readonly evadeDistance: number;
  readonly evadeDuration: number;
  readonly evadeOnHit: boolean;
}
export type AiState = 'patrol' | 'pursue' | 'attack' | 'evade' | 'disengage';
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
  cooldown = 0;
  railgunCharge = 0;
  weapon: WeaponSlot = 1;
  barrel = 1;
  hitFlash = 0;
  stationary = false;

  constructor(
    id: string,
    team: CombatShip['team'],
    config: ShipConfig,
    controller = new FlightController(config.flight),
  ) {
    this.id = id;
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
        readonly speed: number;
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
