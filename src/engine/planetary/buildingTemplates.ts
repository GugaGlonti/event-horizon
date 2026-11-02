import { Quaternion, Vector3 } from '@/engine/math/linear';
import type { StationBox } from '@/engine/stations/stationTypes';
import type { Position3 } from '@/engine/world/worldTypes';
export type BuildingTemplate = 'slab' | 'setback' | 'lowrise' | 'hangar' | 'industrial' | 'habitat';
export interface BuildingInstance extends StationBox {
  readonly id: string;
  readonly template: BuildingTemplate;
  readonly blockId: string;
  readonly districtId: string;
  readonly variant: number;
  readonly landmark?: boolean;
}
export interface BuildingPart {
  center: Position3;
  size: Position3;
  shape: 'box' | 'roof' | 'round';
}
const parts: Record<BuildingTemplate, readonly BuildingPart[]> = {
  slab: [{ center: [0, 0, 0], size: [1, 1, 1], shape: 'box' }],
  setback: [
    { center: [0, -0.225, 0], size: [1, 0.55, 1], shape: 'box' },
    { center: [0, 0.2, 0], size: [0.72, 0.3, 0.72], shape: 'box' },
    { center: [0, 0.425, 0], size: [0.44, 0.15, 0.44], shape: 'box' },
  ],
  lowrise: [
    { center: [0, -0.05, 0], size: [1, 0.9, 1], shape: 'box' },
    { center: [-0.15, 0.45, 0.1], size: [0.35, 0.1, 0.4], shape: 'box' },
  ],
  hangar: [
    { center: [0, -0.125, 0], size: [1, 0.75, 1], shape: 'box' },
    { center: [0, 0.375, 0], size: [1, 0.25, 1], shape: 'roof' },
  ],
  industrial: [
    { center: [0, -0.1, 0], size: [1, 0.8, 1], shape: 'box' },
    { center: [-0.25, 0.35, 0], size: [0.18, 0.3, 0.18], shape: 'round' },
    { center: [0.25, 0.35, 0], size: [0.18, 0.3, 0.18], shape: 'round' },
  ],
  habitat: [{ center: [0, 0, 0], size: [1, 1, 1], shape: 'round' }],
};
export function buildingParts(template: BuildingTemplate) {
  return parts[template];
}
export function buildingCollisionBoxes(building: BuildingInstance): StationBox[] {
  const rotation = new Quaternion().fromArray(building.orientation ?? [0, 0, 0, 1]);
  return parts[building.template].map((part) => {
    const center = new Vector3(
      part.center[0] * building.size[0],
      part.center[1] * building.size[1],
      part.center[2] * building.size[2],
    )
      .applyQuaternion(rotation)
      .add(new Vector3().fromArray(building.center));
    return {
      center: center.toArray(),
      size: [
        part.size[0] * building.size[0],
        part.size[1] * building.size[1],
        part.size[2] * building.size[2],
      ],
      orientation: building.orientation ?? [0, 0, 0, 1],
      role: building.role,
    };
  });
}
