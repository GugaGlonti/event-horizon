import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  Color,
  type Group,
  type InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { Vector3 as LogicalVector } from '@/engine/math/linear';
import { bodyRotation, tangentFrame } from '@/engine/planetary/coordinates';
import {
  type SceneryInstance,
  type SceneryKind,
  sceneryCellKey,
  selectSceneryCells,
} from '@/engine/planetary/scenery';
import type { CelestialDefinition } from '@/engine/world/worldTypes';
import type { FlightSession } from '@/features/flight/FlightSession';
import type { PlanetGeneration } from './PlanetGeneration';
import { createSceneryGeometry } from './sceneryGeometry';
import { reserveVisualBytes, visualMetrics } from './visualBudget';

const kinds: readonly SceneryKind[] = ['broadleaf', 'conifer', 'shrub', 'rock'];
const capacities = { broadleaf: 896, conifer: 896, shrub: 1024, rock: 256 };
export function SurfaceScenery({
  body,
  session,
  generation,
}: {
  body: CelestialDefinition;
  session: FlightSession;
  generation: PlanetGeneration;
}) {
  const group = useRef<Group>(null),
    meshes = useRef<Partial<Record<SceneryKind, InstancedMesh>>>({});
  const kit = useMemo(
    () =>
      kinds.map((kind) => {
        const material = new MeshStandardMaterial({
          color: '#ffffff',
          vertexColors: true,
          roughness: 1,
        });
        material.onBeforeCompile = (shader) => {
          shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nvarying float vSceneryHeight;')
            .replace(
              '#include <begin_vertex>',
              `#include <begin_vertex>
      vec3 center=(modelMatrix*instanceMatrix*vec4(0.,0.,0.,1.)).xyz;
      float fade=1.-smoothstep(220.,420.,length(center-cameraPosition));
      transformed*=fade;vSceneryHeight=position.y;`,
            );
          shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', '#include <common>\nvarying float vSceneryHeight;')
            .replace(
              '#include <color_fragment>',
              '#include <color_fragment>\ndiffuseColor.rgb*=.65+.35*smoothstep(0.,.45,vSceneryHeight);',
            );
        };
        material.customProgramCacheKey = () => 'surface-scenery-v2';
        return { kind, geometry: createSceneryGeometry(kind), material };
      }),
    [],
  );
  const scratch = useMemo(
    () => ({ rotation: new Quaternion(), position: new Vector3(), local: new LogicalVector() }),
    [],
  );
  useEffect(() => {
    let disposed = false,
      timer: ReturnType<typeof setTimeout> | undefined;
    const cells = new Map<string, SceneryInstance[]>(),
      pending = new Map<string, () => void>();
    let desired = new Set<string>();
    const bytes = kit.reduce(
      (sum, item) =>
        sum +
        Object.values(item.geometry.attributes).reduce((n, a) => n + a.array.byteLength, 0) +
        capacities[item.kind] * (16 + 3) * 4,
      0,
    );
    const release = reserveVisualBytes(bytes);
    const rebuild = () => {
      if (disposed || !release) return;
      const counts = { broadleaf: 0, conifer: 0, shrub: 0, rock: 0 };
      const matrix = new Matrix4(),
        p = new Vector3(),
        scale = new Vector3(),
        rotation = new Quaternion(),
        color = new Color();
      for (const key of desired)
        for (const item of cells.get(key) ?? []) {
          const index = counts[item.kind],
            mesh = meshes.current[item.kind];
          if (!mesh || index >= capacities[item.kind]) continue;
          const logical = new LogicalVector(...item.position).normalize(),
            frame = tangentFrame(logical, item.heading);
          rotation.set(frame.x, frame.y, frame.z, frame.w);
          matrix.compose(
            p.fromArray(item.position),
            rotation,
            scale.set(item.width, item.height, item.width),
          );
          mesh.setMatrixAt(index, matrix);
          mesh.setColorAt(index, color.setRGB(item.tint, item.tint, item.tint));
          counts[item.kind]++;
        }
      for (const kind of kinds) {
        const mesh = meshes.current[kind];
        if (!mesh) continue;
        mesh.count = counts[kind];
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        if (mesh.count) mesh.computeBoundingSphere();
      }
      visualMetrics.sceneryCells = cells.size;
      visualMetrics.sceneryInstances = Object.values(counts).reduce((a, b) => a + b, 0);
    };
    const schedule = () => {
      if (timer === undefined)
        timer = setTimeout(() => {
          timer = undefined;
          rebuild();
        }, 30);
    };
    const update = () => {
      const center = session.exploration.world.positions.get(body.id);
      if (!center) return;
      bodyRotation(body, session.exploration.world.time, scratch.rotation).invert();
      scratch.position.copy(session.position).sub(center).applyQuaternion(scratch.rotation);
      const altitude = session.planetaryReadout.altitude;
      scratch.local.set(scratch.position.x, scratch.position.y, scratch.position.z);
      const next = altitude < 1600 && release ? selectSceneryCells(body, scratch.local) : [];
      desired = new Set(next.map(sceneryCellKey));
      for (const [key, cancel] of pending)
        if (!desired.has(key)) {
          cancel();
          pending.delete(key);
        }
      for (const key of cells.keys())
        if (!desired.has(key)) {
          cells.delete(key);
          schedule();
        }
      for (const cell of next) {
        const key = sceneryCellKey(cell);
        if (cells.has(key) || pending.has(key)) continue;
        pending.set(
          key,
          generation.request(
            `${body.id}/scenery/${key}`,
            2,
            { kind: 'scenery', body, cell },
            (response) => {
              pending.delete(key);
              if (disposed || !desired.has(key) || response.result.kind !== 'scenery') return;
              cells.set(key, response.result.instances);
              schedule();
            },
          ),
        );
      }
    };
    const ownedMeshes = Object.values(meshes.current);
    for (const mesh of ownedMeshes) mesh.count = 0;
    update();
    const interval = setInterval(update, 250);
    return () => {
      disposed = true;
      clearInterval(interval);
      if (timer !== undefined) clearTimeout(timer);
      for (const cancel of pending.values()) cancel();
      for (const mesh of ownedMeshes) mesh.dispose();
      release?.();
      visualMetrics.sceneryCells = visualMetrics.sceneryInstances = 0;
    };
  }, [body, session, generation, kit, scratch]);
  useEffect(
    () => () => {
      for (const item of kit) {
        item.geometry.dispose();
        item.material.dispose();
      }
    },
    [kit],
  );
  useFrame(() => {
    const root = group.current,
      center = session.exploration.world.positions.get(body.id);
    if (!root || !center) return;
    root.position.copy(center).sub(session.origin.position);
    bodyRotation(body, session.exploration.world.time, root.quaternion);
  });
  return (
    <group ref={group}>
      {kit.map((item) => (
        <instancedMesh
          key={item.kind}
          ref={(mesh) => {
            if (mesh) meshes.current[item.kind] = mesh;
          }}
          args={[item.geometry, item.material, capacities[item.kind]]}
          dispose={null}
        />
      ))}
    </group>
  );
}
