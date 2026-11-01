/// <reference types="node" />
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ENEMY_SHIP, PLAYER_SHIP } from '@/features/combat/config';
import manifest from '@/features/spacecraft/assets/manifest.json';

interface Accessor {
  bufferView: number;
  count: number;
  componentType: number;
  type: string;
}
interface PackedHull {
  buffers: { byteLength: number; uri?: string }[];
  bufferViews: { byteOffset: number; byteLength: number; buffer: number }[];
  accessors: Accessor[];
  images: { bufferView: number; mimeType: string; uri?: string }[];
  meshes: { primitives: { attributes: { POSITION: number; NORMAL: number }; indices: number }[] }[];
  nodes: { mesh: number; translation?: number[]; rotation?: number[]; scale?: number[] }[];
  extensionsRequired?: string[];
}

describe('bundled spacecraft hulls', () => {
  it.each(Object.entries(manifest))(
    '%s stays local, finite and inside the gameplay sphere',
    (name, metadata) => {
      const bytes = readFileSync(
        new URL(`../src/features/spacecraft/assets/${name}.glb`, import.meta.url),
      );
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(metadata.sha256);
      expect(bytes.toString('ascii', 0, 4)).toBe('glTF');
      expect(bytes.readUInt32LE(4)).toBe(2);
      expect(bytes.readUInt32LE(8)).toBe(bytes.length);
      const jsonLength = bytes.readUInt32LE(12);
      const document = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength)) as PackedHull;
      const binary = bytes.subarray(28 + jsonLength);
      expect(bytes.length).toBeLessThan(700_000);
      expect(document.extensionsRequired ?? []).toEqual([]);
      expect(document.buffers).toHaveLength(1);
      expect(document.buffers[0]?.uri).toBeUndefined();
      expect(document.buffers[0]?.byteLength).toBe(binary.length);
      for (const view of document.bufferViews) {
        expect(view.buffer).toBe(0);
        expect(view.byteOffset % 4).toBe(0);
        expect(view.byteOffset + view.byteLength).toBeLessThanOrEqual(binary.length);
      }
      for (const image of document.images) {
        expect(image.uri).toBeUndefined();
        expect(image.mimeType).toBe('image/jpeg');
        const view = document.bufferViews[image.bufferView];
        expect(view).toBeDefined();
        if (!view) throw new Error('Missing embedded texture');
        expect(binary.readUInt16BE(view.byteOffset)).toBe(0xffd8);
      }
      expect(document.nodes).toHaveLength(1);
      expect(document.nodes[0]?.translation).toBeUndefined();
      expect(document.nodes[0]?.rotation).toBeUndefined();
      expect(document.nodes[0]?.scale).toBeUndefined();
      const primitive = document.meshes[0]?.primitives[0];
      if (!primitive) throw new Error('Missing hull');
      const positions = document.accessors[primitive.attributes.POSITION];
      const normals = document.accessors[primitive.attributes.NORMAL];
      if (!positions || !normals) throw new Error('Missing hull attributes');
      const points: number[][] = [];
      let radius = 0;
      let nearestNose = 0;
      for (const [attribute, isPosition] of [
        [positions, true],
        [normals, false],
      ] as const) {
        expect(attribute.componentType).toBe(5126);
        expect(attribute.type).toBe('VEC3');
        const view = document.bufferViews[attribute.bufferView];
        if (!view) throw new Error('Missing vertex buffer');
        for (let i = 0; i < attribute.count; i++) {
          const point = [0, 1, 2].map((axis) =>
            binary.readFloatLE(view.byteOffset + i * 12 + axis * 4),
          );
          expect(point.every(Number.isFinite)).toBe(true);
          if (isPosition) {
            points.push(point);
            radius = Math.max(radius, Math.hypot(...point));
            nearestNose = Math.min(nearestNose, point[2] ?? 0);
          } else expect(Math.hypot(...point)).toBeCloseTo(1, 3);
        }
      }
      expect(radius).toBeCloseTo(metadata.radius, 4);
      expect(radius).toBeLessThan(Math.min(PLAYER_SHIP.radius, ENEMY_SHIP.radius));
      // Existing shots start at -6m; their muzzle must remain ahead of the entire hull.
      expect(nearestNose).toBeGreaterThan(-6);
      expect(nearestNose).toBeLessThan(-2);
      expect(document.accessors[primitive.indices]?.count).toBe(metadata.triangles * 3);
      for (const engine of metadata.engines) {
        expect(engine.z).toBeGreaterThan(0);
        expect(engine.radius).toBeGreaterThan(0);
        const distance = Math.min(
          ...points.map(([x = 0, y = 0, z = 0]) =>
            Math.hypot(x - engine.x, y - engine.y, z - engine.z),
          ),
        );
        expect(distance).toBeLessThan(engine.radius + 0.2);
      }
    },
  );
});
