import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  type Mesh,
  Quaternion,
  ShaderMaterial,
  Vector3,
} from 'three';
import { bodyRotation } from '@/engine/planetary/coordinates';
import { surfacePalette } from '@/engine/planetary/surfaceDescription';
import {
  patchChildren,
  patchKey,
  selectTerrainPatches,
  type TerrainPatch,
  terrainRoots,
} from '@/engine/planetary/terrainLod';
import type { CelestialDefinition } from '@/engine/world/worldTypes';
import type { FlightSession } from '@/features/flight/FlightSession';
import type { PlanetGeneration } from './PlanetGeneration';
import { createTerrainDetail, terrainFragment, terrainVertex } from './terrainMaterial';
import { reserveVisualBytes } from './visualBudget';

interface CachedPatch {
  patch: TerrainPatch;
  geometry: BufferGeometry;
  anchor: Vector3;
  born: number;
  release: () => void;
}
export const terrainMetrics = { patches: 0, cache: 0, generationMs: 0, maxGenerationMs: 0 };
const MAX_CACHED_PATCHES = 384;

function Patch({
  entry,
  material,
  session,
  body,
}: {
  entry: CachedPatch;
  material: ShaderMaterial;
  session: FlightSession;
  body: CelestialDefinition;
}) {
  const mesh = useRef<Mesh>(null);
  const rotation = useMemo(() => new Quaternion(), []);
  useFrame(() => {
    const object = mesh.current,
      center = session.exploration.world.positions.get(body.id);
    if (!object || !center) return;
    bodyRotation(body, session.exploration.world.time, rotation);
    object.position
      .copy(entry.anchor)
      .applyQuaternion(rotation)
      .add(center)
      .sub(session.origin.position);
    object.quaternion.copy(rotation);
  });
  return (
    <mesh
      ref={mesh}
      geometry={entry.geometry}
      material={material}
      dispose={null}
      onBeforeRender={() => {
        const morph = material.uniforms.uMorph;
        if (morph)
          morph.value =
            entry.patch.level === 0 ? 1 : Math.min(1, (performance.now() - entry.born) / 450);
        material.uniformsNeedUpdate = true;
      }}
    />
  );
}

/** Geometry is generated off-thread, cached with a hard cap, and atomically replaces its parent. */
export function PlanetTerrain({
  body,
  session,
  onReady,
  generation,
}: {
  body: CelestialDefinition;
  session: FlightSession;
  onReady: () => void;
  generation: PlanetGeneration;
}) {
  const ready = useRef(false);
  const [visible, setVisible] = useState<CachedPatch[]>([]);
  const cache = useMemo(() => new Map<string, CachedPatch>(), []);
  const target = useRef(terrainRoots());
  const elapsed = useRef(1);
  const detail = useMemo(createTerrainDetail, []);
  const palette = surfacePalette(body);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: terrainVertex,
        fragmentShader: terrainFragment,
        uniforms: {
          uMorph: { value: 1 },
          uRadius: { value: body.radius },
          uDetail: { value: detail },
          uVegetation: { value: new Vector3(...palette.vegetation) },
          uStone: { value: new Vector3(...palette.stone) },
          uSediment: { value: new Vector3(...palette.sediment) },
          uFrozen: { value: new Vector3(...palette.frozen) },
          uSky: { value: new Color(body.atmosphere?.color ?? '#86abc4') },
          uType: {
            value: { ocean: 0, desert: 1, ice: 2, volcanic: 3, bands: 4, cratered: 5 }[
              body.surface.pattern
            ],
          },
          uRelief: { value: body.terrain?.relief ?? 1 },
          uA: { value: new Color(body.surface.palette[0]) },
          uB: { value: new Color(body.surface.palette[1]) },
          uC: { value: new Color(body.surface.palette[2]) },
          uLight: { value: new Vector3(-1, 0, 0) },
          uUp: { value: new Vector3(0, 1, 0) },
          uDensity: { value: 0 },
        },
      }),
    [body, detail, palette],
  );
  const scratch = useMemo(
    () => ({ point: new Vector3(), rotation: new Quaternion(), light: new Vector3() }),
    [],
  );
  useEffect(() => {
    let disposed = false,
      busy = false;
    let cancel = () => {};
    const desired = new Map<string, TerrainPatch>();
    let shown = new Set<string>();
    const add = (patch: TerrainPatch) => {
      desired.set(patchKey(patch), patch);
      if (patch.level > 0)
        add({
          face: patch.face,
          level: patch.level - 1,
          x: Math.floor(patch.x / 2),
          y: Math.floor(patch.y / 2),
        });
    };
    const pump = () => {
      if (disposed || busy) return;
      const next = [...desired.values()]
        .filter((p) => !cache.has(patchKey(p)))
        .sort((a, b) => a.level - b.level)[0];
      if (next) {
        busy = true;
        cancel = generation.request(
          `${body.id}/terrain/${patchKey(next)}`,
          next.level === 0 ? 0 : 1,
          { kind: 'terrain', body, patch: next },
          (response) => {
            if (disposed || response.result.kind !== 'terrain') return;
            receive(next, response.result.data, response.ms);
          },
        );
      }
    };
    const receive = (
      patch: TerrainPatch,
      data: import('@/engine/planetary/terrainLod').PatchMesh,
      ms: number,
    ) => {
      if (disposed) return;
      busy = false;
      // Keep drawn parents pinned while new coverage streams, with a hard transient ceiling.
      if (cache.size >= MAX_CACHED_PATCHES) {
        const unused = [...cache].find(([key]) => !desired.has(key) && !shown.has(key));
        if (!unused) return;
        unused[1].geometry.dispose();
        unused[1].release();
        cache.delete(unused[0]);
      }
      const release = reserveVisualBytes(
        data.directions.byteLength + data.cover.byteLength + data.climate.byteLength,
      );
      if (!release) {
        pump();
        return;
      }
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(data.positions, 3));
      geometry.setAttribute('normal', new BufferAttribute(data.normals, 3));
      geometry.setAttribute('aCoarse', new BufferAttribute(data.coarse, 3));
      geometry.setAttribute('aElevation', new BufferAttribute(data.elevations, 1));
      geometry.setAttribute('aDirection', new BufferAttribute(data.directions, 3));
      geometry.setAttribute('aCover', new BufferAttribute(data.cover, 4));
      geometry.setAttribute('aClimate', new BufferAttribute(data.climate, 2));
      geometry.setIndex(new BufferAttribute(data.indices, 1));
      geometry.computeBoundingSphere();
      cache.set(patchKey(patch), {
        patch,
        geometry,
        anchor: new Vector3().fromArray(data.anchor),
        born: performance.now(),
        release,
      });
      terrainMetrics.generationMs = ms;
      terrainMetrics.maxGenerationMs = Math.max(terrainMetrics.maxGenerationMs, ms);
      pump();
    };
    const interval = setInterval(() => {
      desired.clear();
      for (const patch of target.current) add(patch);
      const leaves: CachedPatch[] = [];
      const descend = (patch: TerrainPatch) => {
        const entry = cache.get(patchKey(patch));
        if (!entry) return;
        const children = patchChildren(patch);
        if (
          !target.current.some((p) => patchKey(p) === patchKey(patch)) &&
          children.every((p) => cache.has(patchKey(p)))
        )
          for (const child of children) descend(child);
        else leaves.push(entry);
      };
      for (const root of terrainRoots()) descend(root);
      const keep = new Set(leaves.map((p) => patchKey(p.patch)));
      for (const entry of leaves) {
        const parent =
          entry.patch.level > 0
            ? patchKey({
                face: entry.patch.face,
                level: entry.patch.level - 1,
                x: Math.floor(entry.patch.x / 2),
                y: Math.floor(entry.patch.y / 2),
              })
            : '';
        if (!shown.has(patchKey(entry.patch)) && shown.has(parent)) entry.born = performance.now();
      }
      shown = keep;
      for (const [key, entry] of cache)
        if (cache.size > 256 && !desired.has(key) && !keep.has(key)) {
          entry.geometry.dispose();
          entry.release();
          cache.delete(key);
        }
      setVisible((old) =>
        old.length === leaves.length && old.every((p, i) => p === leaves[i]) ? old : leaves,
      );
      terrainMetrics.patches = leaves.length;
      terrainMetrics.cache = cache.size;
      pump();
    }, 100);
    return () => {
      disposed = true;
      clearInterval(interval);
      cancel();
      for (const entry of cache.values()) {
        entry.geometry.dispose();
        entry.release();
      }
      cache.clear();
      terrainMetrics.patches = terrainMetrics.cache = terrainMetrics.generationMs = 0;
    };
  }, [body, cache, generation]);
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => {
    const release = reserveVisualBytes((128 * 128 * 4 * 4) / 3);
    return () => {
      detail.dispose();
      release?.();
    };
  }, [detail]);
  const coveredFaces = useMemo(
    () => new Set(visible.map((entry) => entry.patch.face)).size,
    [visible],
  );
  useFrame(({ camera }, dt) => {
    if (!ready.current && coveredFaces === 6) {
      ready.current = true;
      onReady();
    }
    const world = session.exploration.world,
      center = world.positions.get(body.id);
    if (!center) return;
    elapsed.current += dt;
    if (elapsed.current >= 0.15) {
      elapsed.current = 0;
      bodyRotation(body, world.time, scratch.rotation).invert();
      scratch.point
        .copy(camera.position)
        .add(session.origin.position)
        .sub(center)
        .applyQuaternion(scratch.rotation);
      target.current = selectTerrainPatches(body, scratch.point);
    }
    const star = world.definition.bodies.find((p) => p.kind === 'star');
    const light = material.uniforms.uLight,
      up = material.uniforms.uUp,
      density = material.uniforms.uDensity;
    if (star && light)
      light.value
        .copy(world.positions.get(star.id) ?? scratch.light)
        .sub(center)
        .normalize();
    if (up) up.value.copy(session.position).sub(center).normalize();
    if (density) density.value = session.planetaryReadout.density;
  });
  return (
    <group>
      {visible.map((entry) => (
        <Patch
          key={patchKey(entry.patch)}
          entry={entry}
          material={material}
          session={session}
          body={body}
        />
      ))}
    </group>
  );
}
