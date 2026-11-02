import { create } from 'zustand';
import type { JumpPhase } from '@/engine/navigation/HyperspaceController';
import type { NavigationSnapshot } from '@/engine/navigation/NavigationComputer';
import type { Position3 } from '@/engine/world/worldTypes';
import type { PlanetMarkerSnapshot } from '@/features/exploration/planetMarkers';

export type MapView = 'local' | 'galaxy' | 'planetary';

export interface DepartureGuidance {
  destinationId: string;
  blockedBy: string | null;
  waypoint: Position3 | null;
  distance: number;
  bearingX: number;
  bearingY: number;
  behind: boolean;
  ready: boolean;
}

interface ExplorationState {
  systemId: string;
  overlay: MapView | null;
  destinationId: string | null;
  departure: DepartureGuidance | null;
  jump: { phase: JumpPhase; progress: number; suspended: boolean; destinationId: string | null };
  navigation: NavigationSnapshot;
  planetMarkers: PlanetMarkerSnapshot | null;
  chart: {
    ship: Position3;
    bodies: readonly { id: string; position: Position3; distance: number }[];
  };
  arrival: string | null;
  error: string | null;
  soundEnabled: boolean;
}

/** Read models only. Session/navigation and camera marker snapshots publish at 10 Hz. */
export const useExplorationStore = create<ExplorationState>()(() => ({
  systemId: 'solara',
  overlay: null,
  destinationId: null,
  departure: null,
  jump: { phase: 'IDLE', progress: 0, suspended: false, destinationId: null },
  navigation: {
    targetId: 'pelagos',
    distance: 0,
    surfaceDistance: 0,
    bearingX: 0,
    bearingY: 0,
    behind: false,
    aligned: false,
    nearestId: null,
    nearestDistance: 0,
  },
  planetMarkers: null,
  chart: { ship: [0, 0, 0], bodies: [] },
  arrival: null,
  error: null,
  soundEnabled: true,
}));
