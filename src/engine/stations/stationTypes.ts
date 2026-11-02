import type { Position3, Rotation4 } from '@/engine/world/worldTypes';
export interface StationBox {
  readonly center: Position3;
  readonly size: Position3;
  readonly role: 'hull' | 'hangar' | 'arm';
  readonly orientation?: Rotation4;
}
export interface DockingPortDefinition {
  readonly id: string;
  readonly name: string;
  readonly kind: 'external' | 'hangar' | 'surface';
  readonly position: Position3;
  readonly orientation: Rotation4;
  readonly approach: Position3;
}
export interface StationDefinition {
  readonly id: string;
  readonly name: string;
  readonly type: 'orbital' | 'industrial' | 'surface';
  readonly parentId?: string;
  readonly position: Position3;
  readonly orientation: Rotation4;
  /** Body-local anchor; follows axial rotation and shares the normal docking authority. */
  readonly surfaceAnchor?: {
    readonly latitude: number;
    readonly longitude: number;
    readonly elevation: number;
  };
  readonly orbit?: {
    readonly radius: number;
    readonly period: number;
    readonly phase: number;
    readonly inclination: number;
  };
  readonly ports: readonly DockingPortDefinition[];
  readonly boxes: readonly StationBox[];
  readonly services: readonly ('repair' | 'shields' | 'weapons')[];
}
export type DockingPhase =
  | 'undocked'
  | 'requested'
  | 'approaching'
  | 'aligning'
  | 'docking'
  | 'docked'
  | 'undocking';
export interface DockingState {
  phase: DockingPhase;
  stationId: string | null;
  portId: string | null;
  timer: number;
  start: Position3 | null;
  orientation: Rotation4 | null;
}
export const createDockingState = (): DockingState => ({
  phase: 'undocked',
  stationId: null,
  portId: null,
  timer: 0,
  start: null,
  orientation: null,
});
