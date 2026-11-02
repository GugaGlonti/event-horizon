import { generateTransportRoutes, type TransportRoute } from '@/engine/planetary/cities';
import { buildSceneryCell } from '@/engine/planetary/scenery';
import { SURFACE_GENERATION_REVISION } from '@/engine/planetary/surfaceNoise';
import { buildTerrainPatch } from '@/engine/planetary/terrainLod';
import { buildInfrastructure } from './infrastructureWorker';
import type { PlanetResult, PlanetWorkerRequest } from './planetGenerationJobs';
import { bakeSurfaceFace } from './surfaceBake';

const roads = new Map<string, TransportRoute[]>();
self.onmessage = (event: MessageEvent<PlanetWorkerRequest>) => {
  const { id, revision, job } = event.data;
  if (revision !== SURFACE_GENERATION_REVISION) return;
  const start = performance.now();
  let result: PlanetResult;
  const transfer: ArrayBuffer[] = [];
  switch (job.kind) {
    case 'terrain': {
      const data = buildTerrainPatch(job.body, job.patch);
      transfer.push(
        data.positions.buffer,
        data.coarse.buffer,
        data.normals.buffer,
        data.elevations.buffer,
        data.indices.buffer,
        data.directions.buffer,
        data.cover.buffer,
        data.climate.buffer,
      );
      result = { kind: 'terrain', data };
      break;
    }
    case 'surface': {
      const pixels = bakeSurfaceFace(job.body, job.face, job.resolution, job.row, job.rows);
      transfer.push(pixels.buffer);
      result = { kind: 'surface', pixels };
      break;
    }
    case 'scenery': {
      let routes = roads.get(job.body.id);
      if (!routes) {
        routes = generateTransportRoutes(job.body);
        roads.set(job.body.id, routes);
      }
      result = { kind: 'scenery', instances: buildSceneryCell(job.body, job.cell, routes) };
      break;
    }
    case 'roads': {
      const data = buildInfrastructure(job.body);
      transfer.push(data.vertices.buffer, data.triangles.buffer);
      result = { kind: 'roads', ...data };
      break;
    }
  }
  self.postMessage({ id, revision, result, ms: performance.now() - start }, { transfer });
};
