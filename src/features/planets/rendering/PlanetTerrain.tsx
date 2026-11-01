import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BufferAttribute,
  BufferGeometry,
  type Mesh,
  Quaternion,
  ShaderMaterial,
  Vector3,
} from 'three';
import { bodyRotation } from '@/engine/planetary/coordinates';
import {
  type PatchMesh,
  patchChildren,
  patchKey,
  selectTerrainPatches,
  type TerrainPatch,
  terrainRoots,
} from '@/engine/planetary/terrainLod';
import type { CelestialDefinition } from '@/engine/world/worldTypes';
import type { FlightSession } from '@/features/flight/FlightSession';

interface CachedPatch {
  patch: TerrainPatch;
  geometry: BufferGeometry;
  anchor: Vector3;
  born: number;
}
export const terrainMetrics = { patches: 0, cache: 0, generationMs: 0, maxGenerationMs: 0 };
const vertexShader = /* glsl */ `
  #include <logdepthbuf_pars_vertex>
  attribute vec3 aCoarse;
  attribute float aElevation;
  uniform float uMorph;
  varying vec3 vNormal, vPosition;
  varying float vElevation;
  void main(){
    vec3 p=mix(aCoarse,position,uMorph);
    vec4 world=modelMatrix*vec4(p,1.0);
    vPosition=world.xyz;vNormal=normalize(mat3(modelMatrix)*normal);vElevation=aElevation;
    gl_Position=projectionMatrix*viewMatrix*world;
    #include <logdepthbuf_vertex>
  }`;
const fragmentShader = /* glsl */ `
  #include <logdepthbuf_pars_fragment>
  uniform vec3 uLight, uUp;
  uniform float uDensity;
  varying vec3 vNormal,vPosition;
  varying float vElevation;
  void main(){
    #include <logdepthbuf_fragment>
    vec3 normal=normalize(vNormal);
    float slope=1.0-max(0.0,dot(normal,uUp));
    float grain=sin(vPosition.x*0.31)*sin(vPosition.z*0.37)*0.025;
    vec3 plains=mix(vec3(.18,.25,.19),vec3(.34,.30,.23),smoothstep(300.0,850.0,vElevation));
    vec3 color=mix(plains,vec3(.35,.37,.36),clamp(slope*5.0,0.0,1.0));
    color=mix(color,vec3(.68,.72,.72),smoothstep(1050.0,1400.0,vElevation));
    float day=max(0.0,dot(normal,uLight));
    color=(color+grain)*(.2+day*1.25);
    float distance=length(cameraPosition-vPosition);
    float haze=1.0-exp(-distance*uDensity*.000075);
    vec3 sky=mix(vec3(.025,.04,.08),vec3(.22,.42,.58),max(0.0,dot(uUp,uLight)));
    gl_FragColor=vec4(mix(color,sky,haze*.8),1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

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
}: {
  body: CelestialDefinition;
  session: FlightSession;
}) {
  const [visible, setVisible] = useState<CachedPatch[]>([]);
  const cache = useMemo(() => new Map<string, CachedPatch>(), []);
  const target = useRef(terrainRoots());
  const elapsed = useRef(1);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          uMorph: { value: 1 },
          uLight: { value: new Vector3(-1, 0, 0) },
          uUp: { value: new Vector3(0, 1, 0) },
          uDensity: { value: 0 },
        },
      }),
    [],
  );
  const scratch = useMemo(
    () => ({ point: new Vector3(), rotation: new Quaternion(), light: new Vector3() }),
    [],
  );
  useEffect(() => {
    let disposed = false,
      busy = false;
    const worker = new Worker(new URL('./terrainWorker.ts', import.meta.url), { type: 'module' });
    const desired = new Map<string, TerrainPatch>();
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
        worker.postMessage({ body, patch: next });
      }
    };
    worker.onmessage = (
      event: MessageEvent<{ patch: TerrainPatch; data: PatchMesh; ms: number }>,
    ) => {
      if (disposed) return;
      busy = false;
      const { patch, data, ms } = event.data;
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(data.positions, 3));
      geometry.setAttribute('normal', new BufferAttribute(data.normals, 3));
      geometry.setAttribute('aCoarse', new BufferAttribute(data.coarse, 3));
      geometry.setAttribute('aElevation', new BufferAttribute(data.elevations, 1));
      geometry.setIndex(new BufferAttribute(data.indices, 1));
      geometry.computeBoundingSphere();
      cache.set(patchKey(patch), {
        patch,
        geometry,
        anchor: new Vector3().fromArray(data.anchor),
        born: performance.now(),
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
      for (const [key, entry] of cache)
        if (cache.size > 256 && !desired.has(key) && !keep.has(key)) {
          entry.geometry.dispose();
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
      worker.terminate();
      for (const entry of cache.values()) entry.geometry.dispose();
      cache.clear();
    };
  }, [body, cache]);
  useEffect(() => () => material.dispose(), [material]);
  useFrame((_, dt) => {
    const world = session.exploration.world,
      center = world.positions.get(body.id);
    if (!center) return;
    elapsed.current += dt;
    if (elapsed.current >= 0.15) {
      elapsed.current = 0;
      bodyRotation(body, world.time, scratch.rotation).invert();
      scratch.point.copy(session.position).sub(center).applyQuaternion(scratch.rotation);
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
