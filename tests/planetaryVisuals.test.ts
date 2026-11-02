import { describe, expect, it } from 'vitest';
import { joinSchema, PROTOCOL_VERSION } from '@/engine/network/protocol';
import { generateSettlements } from '@/engine/planetary/cities';
import { surfaceDirection } from '@/engine/planetary/coordinates';
import { describeSurface, surfaceColor } from '@/engine/planetary/surfaceDescription';
import {
  maximumTerrainHeight,
  naturalTerrainHeight,
  terrainHeight,
} from '@/engine/planetary/terrain';
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

describe('coherent physical surfaces', () => {
  it('creates coast, forest and a pale ridge in the Pelagos reference region', () => {
    const ocean = describeSurface(pelagos, surfaceDirection(-0.035, 2.27));
    const forest = describeSurface(pelagos, surfaceDirection(0.015, 2.26));
    const ridge = describeSurface(pelagos, surfaceDirection(0.025, 2.22));
    expect(ocean.biome).toBe('ocean');
    expect(forest.forest).toBeGreaterThan(0.4);
    expect(ridge.elevation).toBeGreaterThan(forest.elevation + 600);
    expect(ridge.cover[3]).toBeGreaterThan(0.2);
  });
  it('honors the bounded terrain detail setting', () => {
    const direction = surfaceDirection(0.3, -1);
    const terrain = required(pelagos.terrain);
    expect(
      naturalTerrainHeight({ ...pelagos, terrain: { ...terrain, octaves: 1 } }, direction),
    ).not.toBe(naturalTerrainHeight(pelagos, direction));
  });
  it('keeps all archetypes deterministic, bounded and normalized including poles and cube edges', () => {
    const seen = new Set<string>();
    for (const body of SYSTEMS.flatMap((system) => system.bodies).filter((body) => body.terrain)) {
      for (let i = 0; i < 96; i++) {
        const up = surfaceDirection(Math.asin((i + 0.5) / 48 - 1), i * 2.39996323);
        const height = terrainHeight(body, up),
          sample = describeSurface(body, up);
        expect(height).toBeGreaterThanOrEqual(0);
        expect(height).toBeLessThanOrEqual(maximumTerrainHeight(body) + 1e-5);
        expect(sample).toEqual(describeSurface(structuredClone(body), up));
        expect(sample.cover.reduce((a, b) => a + b)).toBeCloseTo(1, 10);
        expect(sample.cover.every((value) => value >= 0 && value <= 1)).toBe(true);
        expect(surfaceColor(body, sample).every(Number.isFinite)).toBe(true);
        seen.add(sample.biome);
      }
    }
    for (const biome of ['ocean', 'forest', 'dunes', 'ice', 'rock', 'basalt'])
      expect(seen.has(biome)).toBe(true);
  });
});
