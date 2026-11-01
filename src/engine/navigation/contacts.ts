import type { BodyKind, StarSystemDefinition } from '@/engine/world/worldTypes';
export interface NavigationContact {
  id: string;
  name: string;
  kind: BodyKind | 'station' | 'landing-zone' | 'surface-poi';
  radius: number;
  parentId?: string;
}
export function navigationContacts(system: StarSystemDefinition): NavigationContact[] {
  return [
    ...system.bodies.map((body) => ({
      id: body.id,
      name: body.name,
      kind: body.kind,
      radius: body.radius,
      ...(body.parentId ? { parentId: body.parentId } : {}),
    })),
    ...(system.stations ?? []).map((station) => ({
      id: station.id,
      name: station.name,
      kind: 'station' as const,
      radius: 0,
      ...(station.parentId ? { parentId: station.parentId } : {}),
    })),
    ...system.bodies.flatMap((body) => [
      ...(body.landingZones ?? []).map((zone) => ({
        id: zone.id,
        name: zone.name,
        kind: 'landing-zone' as const,
        radius: 0,
        parentId: body.id,
      })),
      ...(body.pointsOfInterest ?? []).map((poi) => ({
        id: poi.id,
        name: poi.name,
        kind: 'surface-poi' as const,
        radius: 0,
        parentId: body.id,
      })),
    ]),
  ];
}
