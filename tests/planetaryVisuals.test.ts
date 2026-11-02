import { describe, expect, it } from 'vitest';
import { joinSchema, PROTOCOL_VERSION } from '@/engine/network/protocol';
import { generateSettlements } from '@/engine/planetary/cities';
import { surfaceDirection } from '@/engine/planetary/coordinates';
import { naturalTerrainHeight } from '@/engine/planetary/terrain';
import { SYSTEMS } from '@/engine/world/systems';
import anchors from './fixtures/planetaryAnchors.json';

function required<T>(value: T | undefined | null): T {
  if (value == null) throw new Error('Missing test fixture.');
  return value;
}
const solara = required(SYSTEMS[0]),
  pelagos = required(solara.bodies.find((body) => body.id === 'pelagos'));

describe('surface revision and preserved chart', () => {
  it('preserves every pre-revision body size/rotation, settlement anchor, pad and arrival', () => {
    for (const old of anchors) {
      const system = required(SYSTEMS.find((system) => system.id === old.id));
      expect(system.spawns).toEqual(old.spawns);
      for (const previous of old.bodies) {
        const body = required(system.bodies.find((body) => body.id === previous.id));
        expect(body.radius).toBe(previous.radius);
        expect(body.rotation).toEqual(previous.rotation);
        expect(
          (body.settlements ?? []).map((city) => ({
            id: city.id,
            name: city.name,
            latitude: city.latitude,
            longitude: city.longitude,
            elevation: city.elevation,
            radius: city.radius,
            seed: city.seed,
          })),
        ).toEqual(previous.settlements);
      }
      for (const previous of old.ports) {
        const station = required(system.stations?.find((station) => station.id === previous.id));
        expect(station.surfaceAnchor).toEqual(previous.surfaceAnchor);
        expect(station.ports).toEqual(previous.ports);
      }
    }
    expect(PROTOCOL_VERSION).toBe(5);
    expect(joinSchema.safeParse({ v: 4, name: 'Old client', systemId: 'solara' }).success).toBe(
      false,
    );
  });
  it('still generates reproducible suitable settlements for new worlds', () => {
    const body = { ...pelagos, id: 'uncharted', settlements: [] };
    const a = generateSettlements(body, 'DEVELOPED', 'New Capital');
    expect(a).toEqual(generateSettlements(structuredClone(body), 'DEVELOPED', 'New Capital'));
    expect(a.filter((city) => city.kind === 'capital')).toHaveLength(1);
    expect(
      a.every(
        (city) =>
          !city.authored &&
          naturalTerrainHeight(body, surfaceDirection(city.latitude, city.longitude)) > 360,
      ),
    ).toBe(true);
  });
});
