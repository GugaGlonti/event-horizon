import { type PerspectiveCamera, Vector3 } from 'three';
import type { SystemRuntime } from '@/engine/world/SystemRuntime';

export interface PlanetMarker {
  readonly id: string;
  readonly name: string;
  readonly surfaceDistance: number;
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly behind: boolean;
  readonly edge: 'left' | 'right' | 'top' | 'bottom';
}

export interface PlanetMarkerSnapshot {
  readonly systemId: string;
  readonly items: readonly PlanetMarker[];
}

export const PLANET_MARKER_SIZE = { width: 140, height: 44, gap: 8 } as const;

interface Viewport {
  readonly width: number;
  readonly height: number;
}

interface PlanetMarkerConfig {
  readonly range: number;
  readonly limit: number;
}

/** Camera presentation only. All distances are measured from the logical ship position. */
export class PlanetMarkerProjector {
  private readonly viewPosition = new Vector3();
  private readonly config: PlanetMarkerConfig;

  constructor(config: PlanetMarkerConfig) {
    this.config = config;
  }

  /** Call after the active camera's world/projection matrices have been updated. */
  sample(
    world: SystemRuntime,
    ship: Readonly<Vector3>,
    camera: Readonly<PerspectiveCamera>,
    origin: { readonly x: number; readonly y: number; readonly z: number },
    viewport: Viewport,
  ): readonly PlanetMarker[] {
    const { width, height } = viewport;
    const tablet = width >= 761;
    const margin = tablet ? 24 : 12;
    // Reserve the complete combat instrument columns as well as the compass and lower bank.
    const left = margin + PLANET_MARKER_SIZE.width / 2;
    const right = width - left;
    const top = (tablet ? 400 : 458) + PLANET_MARKER_SIZE.height / 2;
    const bottom = height - (tablet ? 216 : 340) - PLANET_MARKER_SIZE.height / 2;
    if (!Number.isFinite(width + height) || right <= left || bottom <= top) return [];
    const centreX = (left + right) / 2;
    const centreY = (top + bottom) / 2;
    const halfWidth = (right - left) / 2;
    const halfHeight = (bottom - top) / 2;
    const projection = camera.projectionMatrix.elements;
    const candidates: PlanetMarker[] = [];

    for (const body of world.definition.bodies) {
      if (body.kind !== 'rocky' && body.kind !== 'gas-giant') continue;
      const position = world.positions.get(body.id);
      if (!position) continue;
      const surfaceDistance = Math.max(0, ship.distanceTo(position) - body.radius);
      if (surfaceDistance > this.config.range) continue;
      this.viewPosition.copy(position).sub(origin).applyMatrix4(camera.matrixWorldInverse);
      const { x, y, z } = this.viewPosition;
      const behind = z >= 0;
      const projectedX = x * (projection[0] ?? 1);
      const projectedY = -y * (projection[5] ?? 1);
      if (!behind) {
        const screenX = ((projectedX / -z + 1) * width) / 2;
        const screenY = ((projectedY / -z + 1) * height) / 2;
        if (screenX >= left && screenX <= right && screenY >= top && screenY <= bottom) continue;
      }
      // Do not perspective-divide rear contacts: that would mirror their turn direction.
      let dx = (projectedX * width) / 2;
      let dy = (projectedY * height) / 2;
      if (Math.hypot(dx, dy) < 0.001) {
        dx = 0;
        dy = 1;
      }
      const horizontal = Math.abs(dx) / halfWidth;
      const vertical = Math.abs(dy) / halfHeight;
      const scale = 1 / Math.max(horizontal, vertical);
      candidates.push({
        id: body.id,
        name: body.name,
        surfaceDistance,
        x: centreX + dx * scale,
        y: centreY + dy * scale,
        angle: (Math.atan2(dy, dx) * 180) / Math.PI,
        behind,
        edge: horizontal > vertical ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'top' : 'bottom',
      });
    }

    candidates.sort((a, b) => a.surfaceDistance - b.surfaceDistance || a.id.localeCompare(b.id));
    const markers: PlanetMarker[] = [];
    for (const candidate of candidates) {
      if (markers.length >= this.config.limit) break;
      const vertical = candidate.edge === 'left' || candidate.edge === 'right';
      const spacing =
        (vertical ? PLANET_MARKER_SIZE.height : PLANET_MARKER_SIZE.width) + PLANET_MARKER_SIZE.gap;
      // Prefer the true bearing, then the closest free space along the same edge.
      for (let attempt = 0; attempt <= this.config.limit * 2; attempt += 1) {
        const offset = Math.ceil(attempt / 2) * (attempt % 2 === 0 ? 1 : -1) * spacing;
        const marker = {
          ...candidate,
          x: vertical ? candidate.x : Math.max(left, Math.min(right, candidate.x + offset)),
          y: vertical ? Math.max(top, Math.min(bottom, candidate.y + offset)) : candidate.y,
        };
        const overlaps = markers.some(
          (other) =>
            Math.abs(marker.x - other.x) < PLANET_MARKER_SIZE.width + PLANET_MARKER_SIZE.gap &&
            Math.abs(marker.y - other.y) < PLANET_MARKER_SIZE.height + PLANET_MARKER_SIZE.gap,
        );
        if (!overlaps) {
          markers.push(marker);
          break;
        }
      }
    }
    return markers;
  }
}
