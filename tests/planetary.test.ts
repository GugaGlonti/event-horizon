import { describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from '@/engine/math/linear';
import {
  fromTangent,
  surfaceCoordinates,
  surfaceDirection,
  tangentFrame,
  toTangent,
} from '@/engine/planetary/coordinates';
import {
  atmosphericDensity,
  gravityAcceleration,
  terrainHeight,
  terrainNormal,
} from '@/engine/planetary/terrain';
import { SYSTEMS } from '@/engine/world/systems';

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Missing fixture');
  return value;
}
const pelagos = required(SYSTEMS[0]?.bodies.find((body) => body.id === 'pelagos'));
describe('planetary scale and deterministic surface', () => {
  it('gives every world meaningful radii and slows moon orbits after scaling', () => {
    for (const system of SYSTEMS)
      for (const body of system.bodies) {
        expect(body.radius).toBeGreaterThan(25000);
        if (body.orbit) expect(body.orbit.period).toBeGreaterThan(90000);
      }
    expect(pelagos.radius).toBe(186000);
    expect(pelagos.atmosphere?.height).toBeCloseTo(14000);
    // Even at full cruise an atmospheric descent is longer than a minute.
    expect((pelagos.atmosphere?.height ?? 0) / 180).toBeGreaterThan(60);
  });
  it('round-trips surface and tangent coordinates at million-metre offsets and poles', () => {
    for (const latitude of [-Math.PI / 2, -0.6, 0, Math.PI / 2]) {
      const up = surfaceDirection(latitude, 2.1);
      expect(surfaceCoordinates(up).latitude).toBeCloseTo(latitude);
      const frame = tangentFrame(up),
        anchor = new Vector3(2e6, -3e6, 6e6);
      const point = new Vector3(4.25, 11.5, -90.125);
      expect(
        toTangent(fromTangent(point, anchor, frame), anchor, frame).distanceTo(point),
      ).toBeLessThan(1e-8);
      expect(new Vector3(0, 1, 0).applyQuaternion(frame).distanceTo(up)).toBeLessThan(1e-8);
      expect(frame.angleTo(new Quaternion().copy(frame))).toBeCloseTo(0);
    }
  });
  it('flattens only the landing zone and keeps the seeded field continuous', () => {
    const zone = required(pelagos.landingZones?.[0]);
    const direction = surfaceDirection(zone.latitude, zone.longitude);
    expect(terrainHeight(pelagos, direction)).toBe(zone.elevation);
    expect(terrainNormal(pelagos, direction).dot(direction)).toBeCloseTo(1, 4);
    const sample = surfaceDirection(0.7, -0.4);
    expect(terrainHeight(pelagos, sample)).toBe(terrainHeight(structuredClone(pelagos), sample));
    expect(
      Math.abs(
        terrainHeight(pelagos, sample) -
          terrainHeight(
            pelagos,
            sample
              .clone()
              .add(new Vector3(1e-8, 0, 0))
              .normalize(),
          ),
      ),
    ).toBeLessThan(0.1);
  });
  it('fades density and inverse-square gravity continuously', () => {
    expect(atmosphericDensity(pelagos, 0)).toBe(1);
    expect(atmosphericDensity(pelagos, 7000)).toBeGreaterThan(0);
    expect(atmosphericDensity(pelagos, 14000)).toBe(0);
    expect(atmosphericDensity(pelagos, 13999)).toBeLessThan(0.0001);
    expect(gravityAcceleration(pelagos, pelagos.radius)).toBeCloseTo(7.8);
    expect(gravityAcceleration(pelagos, pelagos.radius * 2)).toBeCloseTo(1.95);
    expect(gravityAcceleration(pelagos, required(pelagos.gravity).influenceRadius)).toBe(0);
  });
});
