import { Vector3 } from '@/engine/math/linear';
import { generateTransportRoutes } from '@/engine/planetary/cities';
import type { CelestialDefinition } from '@/engine/world/worldTypes';

export function buildInfrastructure(body: CelestialDefinition) {
  const positions: number[] = [],
    indices: number[] = [];
  const point = new Vector3(),
    tangent = new Vector3(),
    side = new Vector3();
  for (const route of generateTransportRoutes(body)) {
    const base = positions.length / 3;
    route.points.forEach((p, i) => {
      point.fromArray(p);
      tangent
        .fromArray(route.points[Math.min(route.points.length - 1, i + 1)] ?? p)
        .sub(new Vector3().fromArray(route.points[Math.max(0, i - 1)] ?? p));
      side.crossVectors(point, tangent).normalize().multiplyScalar(7);
      positions.push(
        point.x + side.x,
        point.y + side.y,
        point.z + side.z,
        point.x - side.x,
        point.y - side.y,
        point.z - side.z,
      );
      if (i > 0) {
        const a = base + (i - 1) * 2,
          b = a + 2;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    });
  }
  const vertices = new Float32Array(positions),
    triangles = new Uint16Array(indices);
  return { vertices, triangles };
}
