import { describeSurface, surfaceColor } from '@/engine/planetary/surfaceDescription';
import { terrainHeight } from '@/engine/planetary/terrain';
import { cubeDirection } from '@/engine/planetary/terrainLod';
import type { CelestialDefinition } from '@/engine/world/worldTypes';

/** Each face includes identical boundary directions. No GPU-specific noise participates. */
export function bakeSurfaceFace(
  body: CelestialDefinition,
  face: number,
  resolution: number,
  row = 0,
  rows = resolution,
) {
  const pixels = new Uint8Array(resolution * rows * 4);
  const heights = new Float32Array(resolution * (rows + 2));
  for (let y = -1; y <= rows; y++)
    for (let x = 0; x < resolution; x++) {
      const direction = cubeDirection(
        face,
        (x / (resolution - 1)) * 2 - 1,
        1 - (Math.max(0, Math.min(resolution - 1, row + y)) / (resolution - 1)) * 2,
      );
      heights[(y + 1) * resolution + x] = terrainHeight(body, direction);
    }
  const span = (body.radius * 2) / (resolution - 1);
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < resolution; x++) {
      const i = y * resolution + x,
        h = (y + 1) * resolution + x,
        height = heights[h] ?? 0;
      const dx =
        ((heights[(y + 1) * resolution + Math.min(resolution - 1, x + 1)] ?? height) -
          (heights[(y + 1) * resolution + Math.max(0, x - 1)] ?? height)) /
        (span * 2);
      const dy =
        ((heights[(y + 2) * resolution + x] ?? height) - (heights[y * resolution + x] ?? height)) /
        (span * 2);
      const direction = cubeDirection(
        face,
        (x / (resolution - 1)) * 2 - 1,
        1 - ((row + y) / (resolution - 1)) * 2,
      );
      const sample = describeSurface(
        body,
        direction,
        height,
        1 - 1 / Math.sqrt(1 + dx * dx + dy * dy),
      );
      const color = surfaceColor(body, sample);
      pixels[i * 4] = Math.round(color[0] * 255);
      pixels[i * 4 + 1] = Math.round(color[1] * 255);
      pixels[i * 4 + 2] = Math.round(color[2] * 255);
      pixels[i * 4 + 3] = Math.round(Math.min(1, height / (body.terrain?.relief ?? 1)) * 255);
    }
  return pixels;
}
