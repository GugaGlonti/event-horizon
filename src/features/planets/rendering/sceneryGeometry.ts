import {
  BufferAttribute,
  type BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { SceneryKind } from '@/engine/planetary/scenery';
export function createSceneryGeometry(kind: SceneryKind): BufferGeometry {
  const parts: BufferGeometry[] = [];
  if (kind === 'broadleaf' || kind === 'conifer') {
    const trunk = new CylinderGeometry(0.035, 0.06, 0.6, 5, 1);
    trunk.translate(0, 0.3, 0);
    parts.push(trunk.toNonIndexed());
    trunk.dispose();
    if (kind === 'broadleaf') {
      for (const [x, y, z, size] of [
        [-0.13, 0.64, 0, 0.4],
        [0.12, 0.8, 0.03, 0.34],
      ] as const) {
        const crown = new IcosahedronGeometry(1, 1);
        crown.scale(size, size * 0.65, size);
        crown.translate(x, y, z);
        parts.push(crown);
      }
    } else {
      for (const [radius, height, y] of [
        [0.44, 0.58, 0.5],
        [0.3, 0.5, 0.75],
      ] as const) {
        const crown = new ConeGeometry(radius, height, 6, 1);
        crown.translate(0, y, 0);
        parts.push(crown.toNonIndexed());
        crown.dispose();
      }
    }
  } else {
    const geometry = new IcosahedronGeometry(0.5, 0);
    geometry.scale(1, kind === 'rock' ? 0.8 : 0.7, 1);
    geometry.translate(0, 0.35, 0);
    parts.push(geometry);
  }
  // Consistent attributes allow one opaque material and draw per family.
  for (const [index, part] of parts.entries()) {
    part.deleteAttribute('uv');
    const count = part.getAttribute('position').count;
    const rgb =
      kind === 'rock'
        ? [0.28, 0.29, 0.27]
        : kind === 'shrub'
          ? [0.17, 0.25, 0.09]
          : index === 0
            ? [0.12, 0.085, 0.045]
            : [0.095, 0.17, 0.065];
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) colors.set(rgb, i * 3);
    part.setAttribute('color', new BufferAttribute(colors, 3));
  }
  const geometry = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  if (!geometry) throw new Error('Invalid scenery kit.');
  return geometry;
}
