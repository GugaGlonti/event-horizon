import { useFrame } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BoxGeometry,
  type BufferGeometry,
  CircleGeometry,
  Color,
  type Group,
  type InstancedMesh,
  Matrix4,
  type MeshStandardMaterial,
  Quaternion,
  type ShaderMaterial,
  Vector3,
} from 'three';
import type { BuildingInstance } from '@/engine/planetary/buildingTemplates';
import { generateCityLayout, selectCityBlocks } from '@/engine/planetary/cityLayout';
import { bodyRotation, surfaceDirection, tangentFrame } from '@/engine/planetary/coordinates';
import type { SettlementDefinition } from '@/engine/planetary/environmentTypes';
import { foundationRadius } from '@/engine/planetary/foundations';
import { stationPose } from '@/engine/stations/stationGeometry';
import type { CelestialDefinition } from '@/engine/world/worldTypes';
import type { FlightSession } from '@/features/flight/FlightSession';
import { BUILDING_TEMPLATES, createBuildingGeometry } from './buildingGeometry';
import { reserveVisualBytes, visualMetrics } from './visualBudget';

const palettes = {
  towers: '#b2b5a8',
  domes: '#c4a37b',
  habitats: '#b4c8ce',
  industrial: '#96918a',
  modules: '#a0a4a8',
};
type Kit = Map<string, BufferGeometry>;
function kitGeometry(kit: Kit, key: string) {
  const geometry = kit.get(key);
  if (!geometry) throw new Error(`Missing building geometry: ${key}`);
  return geometry;
}
function BuildingBatch({
  buildings,
  city,
  session,
  geometry,
  near,
  far,
  daylight,
}: {
  buildings: readonly BuildingInstance[];
  city: SettlementDefinition;
  session: FlightSession;
  geometry: BufferGeometry;
  near: number;
  far: number;
  daylight: { value: number };
}) {
  const mesh = useRef<InstancedMesh>(null),
    material = useRef<MeshStandardMaterial>(null);
  const night = useMemo(() => ({ value: 0 }), []);
  useEffect(() => {
    const object = mesh.current;
    if (!object) return;
    const matrix = new Matrix4(),
      p = new Vector3(),
      q = new Quaternion(),
      scale = new Vector3(),
      color = new Color();
    buildings.forEach((building, i) => {
      matrix.compose(
        p.fromArray(building.center),
        q.fromArray(building.orientation ?? [0, 0, 0, 1]),
        scale.fromArray(building.size),
      );
      object.setMatrixAt(i, matrix);
      object.setColorAt(
        i,
        color.set(palettes[city.style]).multiplyScalar(0.76 + building.variant * 0.045),
      );
    });
    object.instanceMatrix.needsUpdate = true;
    if (object.instanceColor) object.instanceColor.needsUpdate = true;
    object.computeBoundingSphere();
    object.count = buildings.length;
  }, [buildings, city]);
  useEffect(() => {
    const object = mesh.current,
      ownedMaterial = material.current;
    const release = reserveVisualBytes(512 * 19 * 4);
    return () => {
      object?.dispose();
      ownedMaterial?.dispose();
      release?.();
    };
  }, []);
  useFrame(() => {
    if (!mesh.current || !material.current) return;
    const distance =
      session.exploration.world.positions.get(city.id)?.distanceTo(session.position) ?? Infinity;
    const t = Math.max(0, Math.min(1, (distance - near) / (far - near)));
    material.current.opacity = 1 - t * t * (3 - 2 * t);
    mesh.current.visible = material.current.opacity > 0.001;
    night.value = 1 - Math.max(0, Math.min(1, (daylight.value + 0.15) / 0.35));
  });
  return (
    <instancedMesh ref={mesh} args={[geometry, undefined, 512]} dispose={null}>
      <meshStandardMaterial
        ref={material}
        color="#ffffff"
        vertexColors={geometry.hasAttribute('color')}
        roughness={0.85}
        metalness={0.08}
        alphaHash
        onBeforeCompile={(shader) => {
          shader.uniforms.uCityNight = night;
          shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nvarying vec3 vFacade,vFacadeNormal;')
            .replace(
              '#include <begin_vertex>',
              '#include <begin_vertex>\nvFacade=position*vec3(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz),length(instanceMatrix[2].xyz));vFacadeNormal=normal;',
            );
          shader.fragmentShader = shader.fragmentShader
            .replace(
              '#include <common>',
              '#include <common>\nuniform float uCityNight;varying vec3 vFacade,vFacadeNormal;',
            )
            .replace(
              '#include <emissivemap_fragment>',
              `#include <emissivemap_fragment>
          float row=step(.38,fract(vFacade.y/6.))*step(fract(vFacade.y/6.),.72);
          float column=step(.3,fract((abs(vFacadeNormal.x)>.5?vFacade.z:vFacade.x)/5.));
          float facade=1.-step(.7,abs(vFacadeNormal.y));
          float occupied=step(.32,fract(sin(floor(vFacade.y/6.)*12.+floor(vFacade.x/5.)*31.)*437.));
          totalEmissiveRadiance+=vec3(.8,.72,.49)*row*column*facade*occupied*(.018+uCityNight*.42);
          totalEmissiveRadiance+=diffuseColor.rgb*.025;`,
            );
        }}
        customProgramCacheKey={() => 'city-facade-v2'}
      />
    </instancedMesh>
  );
}
function City({
  body,
  city,
  session,
  kit,
  allowDetail,
}: {
  body: CelestialDefinition;
  city: SettlementDefinition;
  session: FlightSession;
  kit: Kit;
  allowDetail: boolean;
}) {
  const root = useRef<Group>(null),
    roads = useRef<InstancedMesh>(null),
    pavements = useRef<InstancedMesh>(null),
    footprint = useRef<ShaderMaterial>(null);
  const [range, setRange] = useState(0),
    [selected, setSelected] = useState<string[]>([]);
  const detail = range === 2 && !allowDetail ? 1 : range;
  const layout = useMemo(() => generateCityLayout(city), [city]);
  const scratch = useMemo(() => {
    const frame = tangentFrame(surfaceDirection(city.latitude, city.longitude));
    return {
      position: new Vector3(),
      rotation: new Quaternion(),
      local: surfaceDirection(city.latitude, city.longitude),
      frame: new Quaternion(frame.x, frame.y, frame.z, frame.w),
      sun: new Vector3(),
      up: new Vector3(),
      pilot: new Vector3(),
      inverse: new Quaternion(),
    };
  }, [city]);
  const daylight = useMemo(() => ({ value: 1 }), []);
  const outline = useMemo(() => {
    const geometry = new CircleGeometry(city.radius * 0.98, 48),
      positions = geometry.getAttribute('position');
    for (let i = 1; i < positions.count; i++) {
      const x = positions.getX(i),
        y = positions.getY(i),
        angle = Math.atan2(-y, x),
        scale = foundationRadius(city, angle) / city.radius;
      positions.setXY(i, x * scale, y * scale);
    }
    return geometry;
  }, [city]);
  useEffect(() => () => outline.dispose(), [outline]);
  const station = session.exploration.world.definition.stations?.find(
    (s) => s.id === `${city.id}-spaceport`,
  );
  useEffect(() => {
    const update = () => {
      const world = session.exploration.world,
        center = world.positions.get(city.id),
        distance = center?.distanceTo(session.position) ?? Infinity;
      const mode = distance < 16000 ? 2 : distance < 80000 ? 1 : 0;
      setRange(mode);
      let next: string[] = [];
      if (mode === 2 && allowDetail && center) {
        bodyRotation(body, world.time, scratch.rotation).multiply(scratch.frame);
        scratch.inverse.copy(scratch.rotation).invert();
        scratch.pilot.copy(session.position).sub(center).applyQuaternion(scratch.inverse);
        next = selectCityBlocks(layout, scratch.pilot.x, scratch.pilot.z);
      }
      setSelected((old) =>
        old.length === next.length && old.every((key, i) => key === next[i]) ? old : next,
      );
    };
    update();
    const timer = setInterval(update, 250);
    return () => clearInterval(timer);
  }, [body, city, session, layout, scratch, allowDetail]);
  const batches = useMemo(() => {
    const keys = new Set(selected);
    const detailed =
      detail === 2
        ? layout.buildings.filter(
            (b) => keys.has(b.blockId) || b.landmark || b.blockId.startsWith('spaceport-'),
          )
        : [];
    const ids = new Set(detailed.map((b) => b.id));
    const distant = layout.buildings
      .filter((b) => !ids.has(b.id))
      .sort((a, b) => b.size[1] - a.size[1]);
    return {
      detailed: BUILDING_TEMPLATES.map((template) => ({
        template,
        buildings: detailed.filter((b) => b.template === template),
      })),
      distant: detail === 1 ? distant.slice(0, 24) : distant,
    };
  }, [detail, selected, layout]);
  useEffect(() => {
    const count = detail === 2 ? selected.length : 0;
    visualMetrics.cityBlocks += count;
    return () => {
      visualMetrics.cityBlocks -= count;
    };
  }, [selected, detail]);
  useEffect(() => {
    if (detail !== 2 || !roads.current) return;
    const matrix = new Matrix4(),
      p = new Vector3(),
      q = new Quaternion(),
      scale = new Vector3();
    layout.roads.forEach((road, i) => {
      matrix.compose(
        p.fromArray(road.center),
        q.fromArray(road.orientation),
        scale.fromArray(road.size),
      );
      roads.current?.setMatrixAt(i, matrix);
    });
    if (pavements.current) {
      const blocks = layout.blocks.filter((block) => selected.includes(block.id));
      blocks.forEach((block, i) => {
        matrix.compose(
          p.set(block.center[0], 0.05, block.center[2]),
          q.identity(),
          scale.set(block.size * 0.9, 0.06, block.size * 0.9),
        );
        pavements.current?.setMatrixAt(i, matrix);
      });
      pavements.current.count = blocks.length;
      pavements.current.instanceMatrix.needsUpdate = true;
      pavements.current.computeBoundingSphere();
    }
    roads.current.instanceMatrix.needsUpdate = true;
    roads.current.computeBoundingSphere();
  }, [layout, detail, selected]);
  useFrame(() => {
    const object = root.current,
      world = session.exploration.world,
      center = world.positions.get(body.id);
    if (!object || !center) return;
    bodyRotation(body, world.time, scratch.rotation);
    scratch.up.copy(scratch.local).applyQuaternion(scratch.rotation);
    scratch.position
      .copy(scratch.local)
      .multiplyScalar(body.radius + city.elevation)
      .applyQuaternion(scratch.rotation)
      .add(center);
    object.visible = scratch.position.distanceTo(session.position) < body.radius * 8;
    if (!object.visible) {
      object.position.set(0, 0, 0);
      return;
    }
    object.position.copy(scratch.position).sub(session.origin.position);
    object.quaternion.copy(scratch.rotation).multiply(scratch.frame);
    const star = world.definition.bodies.find((b) => b.kind === 'star'),
      sun = star && world.positions.get(star.id);
    if (sun)
      daylight.value = scratch.sun.copy(sun).sub(scratch.position).normalize().dot(scratch.up);
    if (footprint.current?.uniforms.uDay) footprint.current.uniforms.uDay.value = daylight.value;
  });
  return (
    <group ref={root}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.6, 0]}>
        <primitive object={outline} attach="geometry" />
        <shaderMaterial
          ref={footprint}
          transparent
          depthWrite={false}
          uniforms={{ uDay: { value: 1 }, uGrid: { value: city.radius / 200 } }}
          vertexShader={`#include <common>
          #include <logdepthbuf_pars_vertex>
          varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
          #include <logdepthbuf_vertex>
          }`}
          fragmentShader={`#include <logdepthbuf_pars_fragment>
          uniform float uDay,uGrid;varying vec2 vUv;void main(){
          #include <logdepthbuf_fragment>
          vec2 p=(vUv-.5)*uGrid;vec2 f=fract(p);float streets=step(.94,f.x)+step(.94,f.y);
          float blocks=step(.3,fract(sin(dot(floor(p),vec2(12.4,71.9)))*43217.));
          float night=1.-smoothstep(-.15,.2,uDay),edge=1.-smoothstep(.4,.5,length(vUv-.5));
          gl_FragColor=vec4(vec3(1.,.63,.25),night*edge*(streets*.3+blocks*.08));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          }`}
        />
      </mesh>
      {detail > 0 && batches.distant.length > 0 && (
        <BuildingBatch
          buildings={batches.distant}
          city={city}
          session={session}
          geometry={kitGeometry(kit, 'proxy')}
          near={detail === 1 ? 65000 : 12000}
          far={detail === 1 ? 80000 : 16000}
          daylight={daylight}
        />
      )}
      {batches.detailed.map(
        ({ template, buildings }) =>
          buildings.length > 0 && (
            <BuildingBatch
              key={template}
              buildings={buildings}
              city={city}
              session={session}
              geometry={kitGeometry(kit, `${city.style}/${template}`)}
              near={12000}
              far={16000}
              daylight={daylight}
            />
          ),
      )}
      {detail === 2 && (
        <instancedMesh ref={pavements} args={[undefined, undefined, 16]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="#888b7e" roughness={1} />
        </instancedMesh>
      )}
      {detail === 2 && (
        <instancedMesh ref={roads} args={[undefined, undefined, layout.roads.length]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="#555a54" roughness={1} />
        </instancedMesh>
      )}
      {detail > 0 && station && (
        <SurfaceTraffic session={session} stationId={station.id} seed={city.seed} />
      )}
    </group>
  );
}
/** Distant non-solid traffic only; it never enters exclusive pad or final approach volumes. */
function SurfaceTraffic({
  session,
  stationId,
  seed,
}: {
  session: FlightSession;
  stationId: string;
  seed: number;
}) {
  const mesh = useRef<InstancedMesh>(null);
  const scratch = useMemo(
    () => ({
      matrix: new Matrix4(),
      position: new Vector3(),
      scale: new Vector3(6, 2, 14),
      rotation: new Quaternion(),
      axis: new Vector3(0, 1, 0),
    }),
    [],
  );
  useFrame(() => {
    if (!mesh.current) return;
    const station = session.exploration.world.definition.stations?.find((s) => s.id === stationId);
    if (!station) return;
    const pose = stationPose(session.exploration.world, station);
    mesh.current.visible = pose.position.distanceTo(session.position) > 14000;
    for (let i = 0; i < 3; i++) {
      const angle = session.exploration.world.time * 0.018 + seed + (i * Math.PI * 2) / 3;
      scratch.position.set(Math.cos(angle) * 1600, 850 + i * 110, Math.sin(angle) * 1600);
      scratch.rotation.setFromAxisAngle(scratch.axis, -angle);
      scratch.matrix.compose(scratch.position, scratch.rotation, scratch.scale);
      mesh.current.setMatrixAt(i, scratch.matrix);
    }
    mesh.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, 3]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#7999a4" emissive="#ad7134" emissiveIntensity={0.5} />
    </instancedMesh>
  );
}
export function CityScene({ session }: { session: FlightSession }) {
  const world = session.exploration.world;
  const nearestCity = useCallback(() => {
    let id: string | null = null,
      distance = 16000;
    for (const body of world.definition.bodies)
      for (const city of body.settlements ?? []) {
        const next = world.positions.get(city.id)?.distanceTo(session.position) ?? Infinity;
        if (next < distance) {
          distance = next;
          id = city.id;
        }
      }
    return id;
  }, [world, session]);
  const [detailedCity, setDetailedCity] = useState(nearestCity);
  useEffect(() => {
    const timer = setInterval(() => setDetailedCity(nearestCity()), 250);
    return () => clearInterval(timer);
  }, [nearestCity]);
  const kit = useMemo(() => {
    const geometries: Kit = new Map([['proxy', new BoxGeometry(1, 1, 1)]]);
    const styles = new Set(
      world.definition.bodies.flatMap((body) => (body.settlements ?? []).map((city) => city.style)),
    );
    for (const style of styles)
      for (const template of BUILDING_TEMPLATES)
        geometries.set(`${style}/${template}`, createBuildingGeometry(template, style));
    return geometries;
  }, [world]);
  useEffect(() => {
    const bytes = [...kit.values()].reduce(
      (sum, geometry) =>
        sum +
        Object.values(geometry.attributes).reduce(
          (n, attribute) => n + attribute.array.byteLength,
          0,
        ),
      0,
    );
    const release = reserveVisualBytes(bytes);
    return () => {
      for (const geometry of kit.values()) geometry.dispose();
      release?.();
    };
  }, [kit]);
  return (
    <>
      {world.definition.bodies.flatMap((body) =>
        (body.settlements ?? []).map((city) => (
          <City
            key={city.id}
            body={body}
            city={city}
            session={session}
            kit={kit}
            allowDetail={city.id === detailedCity}
          />
        )),
      )}
    </>
  );
}
