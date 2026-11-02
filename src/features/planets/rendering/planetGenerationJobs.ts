import type { SceneryCell, SceneryInstance } from '@/engine/planetary/scenery';
import type { PatchMesh, TerrainPatch } from '@/engine/planetary/terrainLod';
import type { CelestialDefinition } from '@/engine/world/worldTypes';
export type PlanetJob =
  | { kind: 'terrain'; body: CelestialDefinition; patch: TerrainPatch }
  | {
      kind: 'surface';
      body: CelestialDefinition;
      face: number;
      resolution: number;
      row: number;
      rows: number;
    }
  | { kind: 'scenery'; body: CelestialDefinition; cell: SceneryCell }
  | { kind: 'roads'; body: CelestialDefinition };
export type PlanetResult =
  | { kind: 'terrain'; data: PatchMesh }
  | { kind: 'surface'; pixels: Uint8Array }
  | { kind: 'scenery'; instances: SceneryInstance[] }
  | { kind: 'roads'; vertices: Float32Array; triangles: Uint16Array };
export interface PlanetWorkerRequest {
  id: number;
  revision: number;
  job: PlanetJob;
}
export interface PlanetWorkerResponse {
  id: number;
  revision: number;
  ms: number;
  result: PlanetResult;
}
