import {
  BoxGeometry,
  BufferAttribute,
  type BufferGeometry,
  CylinderGeometry,
  SphereGeometry,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { type BuildingTemplate, buildingParts } from '@/engine/planetary/buildingTemplates';
import type { SettlementDefinition } from '@/engine/planetary/environmentTypes';
export const BUILDING_TEMPLATES: readonly BuildingTemplate[] = [
  'slab',
  'setback',
  'lowrise',
  'hangar',
  'industrial',
  'habitat',
];
export function createBuildingGeometry(
  template: BuildingTemplate,
  style: SettlementDefinition['style'],
) {
  const parts: BufferGeometry[] = [];
  for (const part of buildingParts(template)) {
    let original: BufferGeometry;
    if (part.shape === 'roof') {
      original = new CylinderGeometry(0.35, 0.5, 1, 4);
      original.rotateY(Math.PI / 4);
      original.scale(Math.SQRT2, 1, Math.SQRT2);
    } else if (part.shape === 'round' && template === 'habitat' && style !== 'habitats') {
      original = new SphereGeometry(0.5, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
      original.scale(1, 2, 1);
      original.translate(0, -0.5, 0);
    } else if (part.shape === 'round') original = new CylinderGeometry(0.5, 0.5, 1, 10);
    else original = new BoxGeometry(1, 1, 1);
    const geometry = original.index ? original.toNonIndexed() : original;
    if (geometry !== original) original.dispose();
    geometry.scale(...part.size);
    geometry.translate(...part.center);
    geometry.deleteAttribute('uv');
    const positions = geometry.getAttribute('position'),
      normals = geometry.getAttribute('normal');
    const colors = new Float32Array(positions.count * 3);
    for (let i = 0; i < positions.count; i++) {
      const roof = normals.getY(i) > 0.5,
        contact = 0.78 + (positions.getY(i) + 0.5) * 0.22;
      const value = contact * (roof ? 0.78 : 1);
      colors.set([value, value * (roof ? 0.96 : 1), value * (roof ? 0.9 : 1)], i * 3);
    }
    geometry.setAttribute('color', new BufferAttribute(colors, 3));
    parts.push(geometry);
  }
  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  if (!merged) throw new Error('Invalid building kit.');
  return merged;
}
