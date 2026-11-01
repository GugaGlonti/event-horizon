import { Vector3 } from '@/engine/math/linear';
import type { CelestialDefinition } from '@/engine/world/worldTypes';
import { terrainNormal, terrainPoint } from './terrain';

export interface TerrainPatch {
  face: number;
  level: number;
  x: number;
  y: number;
}
export const patchKey = (p: TerrainPatch) => `${p.face}/${p.level}/${p.x}/${p.y}`;
export function cubeDirection(face: number, u: number, v: number, out = new Vector3()) {
  switch (face) {
    case 0:
      out.set(1, v, -u);
      break;
    case 1:
      out.set(-1, v, u);
      break;
    case 2:
      out.set(u, 1, -v);
      break;
    case 3:
      out.set(u, -1, v);
      break;
    case 4:
      out.set(u, v, 1);
      break;
    default:
      out.set(-u, v, -1);
  }
  return out.normalize();
}
export function patchChildren(p: TerrainPatch): TerrainPatch[] {
  return [0, 1, 2, 3].map((i) => ({
    face: p.face,
    level: p.level + 1,
    x: p.x * 2 + (i % 2),
    y: p.y * 2 + Math.floor(i / 2),
  }));
}
export const terrainRoots = (): TerrainPatch[] =>
  Array.from({ length: 6 }, (_, face) => ({ face, level: 0, x: 0, y: 0 }));
/** Screen-error-like distance criterion, hard bounded independently of planet dimensions. */
export function selectTerrainPatches(
  body: CelestialDefinition,
  camera: Readonly<Vector3>,
  budget = 150,
) {
  const leaves = terrainRoots();
  const center = new Vector3();
  for (;;) {
    let best = -1,
      score = 1.5;
    for (let i = 0; i < leaves.length; i++) {
      const patch = leaves[i];
      if (!patch || patch.level >= (body.terrain?.maxLevel ?? 0)) continue;
      const size = 2 / 2 ** patch.level;
      cubeDirection(patch.face, -1 + (patch.x + 0.5) * size, -1 + (patch.y + 0.5) * size, center);
      center.multiplyScalar(body.radius);
      const span = body.radius * size;
      const distance = Math.max(35, center.distanceTo(camera) - span * 0.25);
      const priority = span / distance;
      if (priority > score) {
        score = priority;
        best = i;
      }
    }
    if (best < 0 || leaves.length + 3 > budget) break;
    const parent = leaves[best];
    if (!parent) break;
    leaves.splice(best, 1, ...patchChildren(parent));
  }
  return leaves;
}
export interface PatchMesh {
  anchor: [number, number, number];
  positions: Float32Array;
  coarse: Float32Array;
  normals: Float32Array;
  elevations: Float32Array;
  indices: Uint16Array;
}
/** Patch-local floats; all large-coordinate subtraction happens first in CPU doubles. */
export function buildTerrainPatch(body: CelestialDefinition, patch: TerrainPatch): PatchMesh {
  const resolution = body.terrain?.patchResolution ?? 16;
  const width = resolution + 1,
    gridCount = width * width;
  const count = gridCount + width * 4;
  const positions = new Float32Array(count * 3),
    coarse = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3),
    elevations = new Float32Array(count);
  const size = 2 / 2 ** patch.level,
    u0 = -1 + patch.x * size,
    v0 = -1 + patch.y * size;
  const anchor = terrainPoint(body, cubeDirection(patch.face, u0 + size / 2, v0 + size / 2));
  const point = new Vector3(),
    normal = new Vector3();
  const sample = (x: number, y: number) =>
    terrainPoint(
      body,
      cubeDirection(patch.face, u0 + (x / resolution) * size, v0 + (y / resolution) * size),
    );
  for (let y = 0; y < width; y++)
    for (let x = 0; x < width; x++) {
      const i = y * width + x,
        direction = cubeDirection(
          patch.face,
          u0 + (x / resolution) * size,
          v0 + (y / resolution) * size,
        );
      terrainPoint(body, direction, point);
      elevations[i] = point.length() - body.radius;
      terrainNormal(body, direction, normal);
      normals.set(normal.toArray(), i * 3);
      positions.set(point.sub(anchor).toArray(), i * 3);
      // Parent triangles use every second vertex in this patch's grid.
      const cx = Math.floor(x / 2) * 2,
        cy = Math.floor(y / 2) * 2,
        fx = (x - cx) / 2,
        fy = (y - cy) / 2;
      const a = sample(cx, cy),
        b = sample(Math.min(resolution, cx + 2), cy),
        c = sample(cx, Math.min(resolution, cy + 2)),
        d = sample(Math.min(resolution, cx + 2), Math.min(resolution, cy + 2));
      const parent =
        fx + fy <= 1
          ? a.clone().addScaledVector(b.sub(a), fx).addScaledVector(c.sub(a), fy)
          : d
              .clone()
              .addScaledVector(c.sub(d), 1 - fx)
              .addScaledVector(b.sub(d), 1 - fy);
      coarse.set(parent.sub(anchor).toArray(), i * 3);
    }
  const indices: number[] = [];
  for (let y = 0; y < resolution; y++)
    for (let x = 0; x < resolution; x++) {
      const a = y * width + x,
        b = a + 1,
        c = a + width,
        d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  // Radial skirts close mixed-level boundaries on all six faces without T-junction holes.
  for (let edge = 0; edge < 4; edge++)
    for (let k = 0; k < width; k++) {
      const source =
        edge === 0
          ? k
          : edge === 1
            ? k * width + resolution
            : edge === 2
              ? resolution * width + resolution - k
              : (resolution - k) * width;
      const index = gridCount + edge * width + k;
      point
        .fromArray(positions.subarray(source * 3, source * 3 + 3))
        .add(anchor)
        .normalize();
      const depth = Math.max(40, body.radius * size * 0.12);
      for (let axis = 0; axis < 3; axis++) {
        const offset = (point.toArray()[axis] ?? 0) * depth;
        positions[index * 3 + axis] = (positions[source * 3 + axis] ?? 0) - offset;
        coarse[index * 3 + axis] = (coarse[source * 3 + axis] ?? 0) - offset;
        normals[index * 3 + axis] = normals[source * 3 + axis] ?? 0;
      }
      elevations[index] = elevations[source] ?? 0;
      if (k < resolution) {
        const nextSource =
          edge === 0
            ? source + 1
            : edge === 1
              ? source + width
              : edge === 2
                ? source - 1
                : source - width;
        indices.push(source, index, nextSource, nextSource, index, index + 1);
      }
    }
  return {
    anchor: anchor.toArray(),
    positions,
    coarse,
    normals,
    elevations,
    indices: new Uint16Array(indices),
  };
}
