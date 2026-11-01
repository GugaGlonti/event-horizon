import type {
  GravityDefinition,
  LandingZoneDefinition,
  SurfacePointDefinition,
  TerrainDefinition,
} from '@/engine/planetary/planetTypes';

/** Serializable world data. Distances are gameplay metres; time is simulation seconds. */
export type Position3 = readonly [number, number, number];
export type Rotation4 = readonly [number, number, number, number];
export type BodyKind = 'star' | 'rocky' | 'gas-giant' | 'moon';
export type SurfacePattern = 'ocean' | 'desert' | 'ice' | 'volcanic' | 'bands' | 'cratered';

export interface CelestialDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly kind: BodyKind;
  readonly radius: number;
  readonly gravity?: GravityDefinition;
  readonly terrain?: TerrainDefinition;
  readonly landable?: boolean;
  readonly landingZones?: readonly LandingZoneDefinition[];
  readonly pointsOfInterest?: readonly SurfacePointDefinition[];
  readonly parentId?: string;
  readonly position?: Position3;
  readonly orbit?: {
    readonly radius: number;
    readonly period: number;
    readonly phase: number;
    readonly inclination: number;
  };
  readonly rotation: { readonly tilt: number; readonly speed: number };
  readonly surface: {
    readonly pattern: SurfacePattern;
    readonly palette: readonly [string, string, string];
    readonly seed: number;
    readonly brightness: number;
  };
  readonly atmosphere?: {
    readonly color: string;
    readonly strength: number;
    readonly scale: number;
    readonly height?: number;
    readonly scaleHeight?: number;
    readonly density?: number;
  };
  /** Ring radii are multiples of body radius. Tilt is relative to the body's equator. */
  readonly rings?: {
    readonly inner: number;
    readonly outer: number;
    readonly color: string;
    readonly tilt: number;
  };
}

export interface SpawnDefinition {
  readonly id: string;
  readonly bodyId: string;
  readonly offset: Position3;
  readonly orientation: Rotation4;
}

export interface StarSystemDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly chartPosition: readonly [number, number];
  /** Shared galactic axes: +Y up, -Z chart north. Used for jump headings, not local metres. */
  readonly galacticPosition: Position3;
  readonly environment: {
    readonly background: string;
    readonly nebula: string;
    readonly accent: string;
    readonly ambient: number;
    readonly seed: number;
  };
  readonly bodies: readonly CelestialDefinition[];
  readonly spawns: readonly SpawnDefinition[];
  readonly arrivalId: string;
  readonly defaultTargetId: string;
}
