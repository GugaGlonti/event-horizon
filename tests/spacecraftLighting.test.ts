/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { BufferAttribute, BufferGeometry, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import manifest from '@/features/spacecraft/assets/manifest.json';
import {
  createShipEffectAttributes,
  EngineBoostAnimation,
  engineEffectPower,
  PARTICLES_PER_ENGINE,
  particleReach,
  TRAIL_LAYERS,
  visualEnginePower,
} from '@/features/spacecraft/shipEffects';
import { createHullLighting } from '@/features/spacecraft/spacecraftLighting';

function geometryFromAsset(name: string) {
  const bytes = readFileSync(
    new URL(`../src/features/spacecraft/assets/${name}.glb`, import.meta.url),
  );
  const jsonLength = bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength)) as {
    accessors: { bufferView: number; count: number }[];
    bufferViews: { byteOffset: number }[];
    meshes: { primitives: { attributes: Record<string, number> }[] }[];
  };
  const binaryOffset = 28 + jsonLength;
  const geometry = new BufferGeometry();
  for (const name of ['POSITION', 'NORMAL']) {
    const index = gltf.meshes[0]?.primitives[0]?.attributes[name];
    const accessor = index === undefined ? undefined : gltf.accessors[index];
    const view = accessor && gltf.bufferViews[accessor.bufferView];
    if (!accessor || !view) throw new Error('Missing hull surface');
    const data = new Float32Array(accessor.count * 3);
    for (let i = 0; i < data.length; i++)
      data[i] = bytes.readFloatLE(binaryOffset + view.byteOffset + i * 4);
    geometry.setAttribute(name.toLowerCase(), new BufferAttribute(data, 3));
  }
  return geometry;
}

describe('spacecraft visibility effects', () => {
  it.each(Object.entries(manifest))(
    '%s keeps lights on its surface and exhaust within a fixed capacity',
    (name, metadata) => {
      const geometry = geometryFromAsset(name);
      const lighting = createHullLighting(geometry, '#ff8c55');
      const positions = geometry.getAttribute('position');
      const point = new Vector3();
      expect(lighting.markers.length).toBeGreaterThanOrEqual(6);
      expect(lighting.markers.length).toBeLessThanOrEqual(8);
      expect(lighting.markers.some(({ position }) => position.x < -1)).toBe(true);
      expect(lighting.markers.some(({ position }) => position.x > 1)).toBe(true);
      expect(lighting.markers.some(({ position }) => position.z < -2)).toBe(true);
      for (const marker of lighting.markers) {
        expect(marker.normal.length()).toBeCloseTo(1);
        let nearest = Infinity;
        for (let index = 0; index < positions.count; index++) {
          nearest = Math.min(
            nearest,
            point.fromBufferAttribute(positions, index).distanceTo(marker.position),
          );
        }
        expect(nearest).toBeLessThan(0.036);
      }
      const attributes = createShipEffectAttributes(metadata.engines, lighting);
      expect(attributes.count).toBeLessThanOrEqual(200);
      const kinds = Array.from(
        { length: attributes.count },
        (_, i) => attributes.parameters[i * 4 + 1],
      );
      expect(kinds.filter((kind) => kind === 3)).toHaveLength(
        metadata.engines.length * PARTICLES_PER_ENGINE,
      );
      expect(kinds.filter((kind) => kind === 5)).toHaveLength(
        metadata.engines.length * TRAIL_LAYERS,
      );
      expect(attributes.origins.length).toBe(attributes.count * 3);
      expect(attributes.parameters.length).toBe(attributes.count * 4);
      expect(
        [...attributes.origins, ...attributes.colors, ...attributes.parameters].every(
          Number.isFinite,
        ),
      ).toBe(true);
      expect(createShipEffectAttributes(metadata.engines, lighting)).toEqual(attributes);
      // Instances start at a measured nozzle or surface lamp. The shader expands only bounded tails.
      for (let index = 0; index < attributes.count; index++) {
        point.fromArray(attributes.origins, index * 3);
        const kind = attributes.parameters[index * 4 + 1];
        const color = attributes.colors.slice(index * 3, index * 3 + 3);
        if (kind === 1) {
          expect([...color]).toEqual(lighting.color.toArray().map(Math.fround));
          continue;
        }
        expect(color[2]).toBeGreaterThan((color[1] ?? 0) * 3);
        expect(color[1]).toBeGreaterThan(color[0] ?? 0);
        expect(
          metadata.engines.some(
            (mount) =>
              Math.abs(point.x - mount.x) < 1e-5 &&
              Math.abs(point.y - mount.y) < 1e-5 &&
              Math.abs(point.z - mount.z) < 0.061,
          ),
        ).toBe(true);
      }
      geometry.dispose();
    },
  );

  it('scales exhaust from zero through full throttle with a distinct boost range', () => {
    expect(engineEffectPower(0, false)).toBe(0);
    let previous = 0;
    for (const throttle of [0.1, 0.25, 0.5, 0.75, 1]) {
      const power = engineEffectPower(throttle, false);
      expect(power).toBeGreaterThan(previous);
      expect(engineEffectPower(throttle, true)).toBeGreaterThan(1);
      previous = power;
    }
    expect(engineEffectPower(1, true)).toBe(2.4);
    expect(engineEffectPower(Infinity, false)).toBe(0);
  });

  it('bounds GPU power and particle travel through idle, boost and invalid input', () => {
    expect(particleReach(2.4)).toBeGreaterThan(particleReach(0.25));
    expect(particleReach(1000)).toBeLessThanOrEqual(15);
    expect(particleReach(-100)).toBeGreaterThan(0);
    for (const invalid of [NaN, Infinity, -Infinity]) {
      expect(visualEnginePower(invalid)).toBe(0);
      expect(Number.isFinite(particleReach(invalid))).toBe(true);
    }
  });

  it.each([false, true])('eases both ends of the boost transition from %s', (boosting) => {
    const animation = new EngineBoostAnimation();
    const start = engineEffectPower(1, boosting);
    const end = engineEffectPower(1, !boosting);
    expect(animation.update(1, boosting, 0)).toBe(start);
    expect(animation.update(1, !boosting, 0)).toBe(start);
    const samples = [start];
    for (const time of [0.1, 0.2, 0.3, 0.4]) {
      samples.push(animation.update(1, !boosting, time));
    }
    expect(samples[2]).toBeCloseTo((start + end) / 2);
    expect(samples[4]).toBeCloseTo(end);
    const changes = samples.slice(1).map((power, i) => Math.abs(power - (samples[i] ?? 0)));
    expect(changes[0]).toBeLessThan(changes[1] ?? 0);
    expect(changes[3]).toBeLessThan(changes[2] ?? 0);
    for (const power of samples) {
      expect(power).toBeGreaterThanOrEqual(Math.min(start, end));
      expect(power).toBeLessThanOrEqual(Math.max(start, end));
    }
  });

  it('preserves the blend on pause and reversal while still following throttle', () => {
    const animation = new EngineBoostAnimation();
    animation.update(1, false, 10);
    const partial = animation.update(1, true, 10.1);
    expect(animation.update(1, false, 10.1)).toBe(partial);
    expect(animation.update(0.5, false, 10.1)).toBeCloseTo(partial - 0.5);
    expect(animation.update(1, false, 10.2)).toBeCloseTo(1);
  });

  it('uses elapsed effect time independently of frame rate and snaps on reset/reduced motion', () => {
    const slow = new EngineBoostAnimation();
    const fast = new EngineBoostAnimation();
    slow.update(1, false, 0);
    fast.update(1, false, 0);
    for (let frame = 1; frame < 24; frame++) fast.update(1, true, frame / 120);
    expect(fast.update(1, true, 0.2)).toBeCloseTo(slow.update(1, true, 0.2));
    expect(slow.update(1, false, 0)).toBe(1);
    expect(slow.update(1, true, 0, true)).toBe(2.4);
    expect(slow.update(1, false, 0, true)).toBe(1);
  });
});
