import { buildTerrainPatch, type TerrainPatch } from '@/engine/planetary/terrainLod';
import type { CelestialDefinition } from '@/engine/world/worldTypes';

self.onmessage = (event: MessageEvent<{ body: CelestialDefinition; patch: TerrainPatch }>) => {
  const start = performance.now();
  const data = buildTerrainPatch(event.data.body, event.data.patch);
  self.postMessage(
    { patch: event.data.patch, data, ms: performance.now() - start },
    {
      transfer: [
        data.positions.buffer,
        data.coarse.buffer,
        data.normals.buffer,
        data.elevations.buffer,
        data.indices.buffer,
      ],
    },
  );
};
