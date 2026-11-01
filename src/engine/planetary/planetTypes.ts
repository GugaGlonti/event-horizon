import type { Position3, Rotation4 } from '@/engine/world/worldTypes';

export interface GravityDefinition {
  /** Acceleration at reference radius, m/s². Smoothly fades at influenceRadius. */
  readonly surfaceAcceleration: number;
  readonly influenceRadius: number;
}
export interface TerrainDefinition {
  readonly seed: number;
  readonly relief: number;
  readonly frequency: number;
  readonly octaves: number;
  readonly patchResolution: number;
  readonly maxLevel: number;
}
export interface LandingZoneDefinition {
  readonly id: string;
  readonly name: string;
  /** Radians in the body's rotating frame. +X is longitude zero, +Z is east. */
  readonly latitude: number;
  readonly longitude: number;
  readonly radius: number;
  readonly elevation: number;
}
export interface SurfacePointDefinition {
  readonly id: string;
  readonly name: string;
  readonly latitude: number;
  readonly longitude: number;
}
export type LandingPhase = 'flying' | 'approaching' | 'landing' | 'landed' | 'taking-off';
export interface SurfaceState {
  phase: LandingPhase;
  bodyId: string | null;
  timer: number;
  /** Attached direction in the body frame, transported as doubles. */
  anchor: Position3 | null;
  orientation: Rotation4 | null;
}
export const createSurfaceState = (): SurfaceState => ({
  phase: 'flying',
  bodyId: null,
  timer: 0,
  anchor: null,
  orientation: null,
});
