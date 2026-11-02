import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Color,
  type Group,
  type InstancedMesh,
  Matrix4,
  type MeshStandardMaterial,
  Quaternion,
  type ShaderMaterial,
  Vector3,
} from 'three';
import { generateCityLayout } from '@/engine/planetary/cities';
import { bodyRotation, surfaceDirection, tangentFrame } from '@/engine/planetary/coordinates';
import type { SettlementDefinition } from '@/engine/planetary/environmentTypes';
import { stationPose } from '@/engine/stations/stationGeometry';
import type { StationBox } from '@/engine/stations/stationTypes';
import type { CelestialDefinition } from '@/engine/world/worldTypes';
import type { FlightSession } from '@/features/flight/FlightSession';

const palettes = {
  towers: '#879f9c',
  domes: '#c4a37b',
  habitats: '#a4bbc7',
  industrial: '#807c79',
  modules: '#a0a4a8',
};
function BuildingBatch({
  boxes,
  city,
  session,
  near,
  far,
  daylight,
}: {
  boxes: readonly StationBox[];
  city: SettlementDefinition;
  session: FlightSession;
  near: number;
  far: number;
  daylight: { value: number };
}) {
  const mesh = useRef<InstancedMesh>(null),
    material = useRef<MeshStandardMaterial>(null);
  const night = useMemo(() => ({ value: 0 }), []);
  useEffect(() => {
    if (!mesh.current) return;
    const matrix = new Matrix4(),
      p = new Vector3(),
      q = new Quaternion(),
      scale = new Vector3();
    boxes.forEach((box, i) => {
      matrix.compose(
        p.fromArray(box.center),
        q.fromArray(box.orientation ?? [0, 0, 0, 1]),
        scale.fromArray(box.size),
      );
      mesh.current?.setMatrixAt(i, matrix);
      mesh.current?.setColorAt(
        i,
        new Color(palettes[city.style]).multiplyScalar(0.7 + (i % 7) * 0.07),
      );
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
    mesh.current.computeBoundingSphere();
  }, [boxes, city]);
  useFrame(() => {
    if (!mesh.current || !material.current) return;
    const center = session.exploration.world.positions.get(city.id);
    const distance = center?.distanceTo(session.position) ?? Infinity;
    const t = Math.max(0, Math.min(1, (distance - near) / (far - near)));
    material.current.opacity = 1 - t * t * (3 - 2 * t);
    night.value = 1 - Math.max(0, Math.min(1, (daylight.value + 0.15) / 0.35));
    mesh.current.visible = material.current.opacity > 0.001;
  });
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, boxes.length]}>
      {city.style === 'domes' ? (
        <sphereGeometry args={[0.5, 12, 8]} />
      ) : city.style === 'habitats' ? (
        <cylinderGeometry args={[0.5, 0.5, 1, 8]} />
      ) : (
        <boxGeometry args={[1, 1, 1]} />
      )}
      <meshStandardMaterial
        ref={material}
        color="#ffffff"
        roughness={0.8}
        metalness={city.style === 'industrial' ? 0.65 : 0.25}
        transparent
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
              '#include <emissivemap_fragment>\nfloat row=step(.35,fract(vFacade.y/6.))*step(fract(vFacade.y/6.),.73);float column=step(.3,fract((abs(vFacadeNormal.x)>.5?vFacade.z:vFacade.x)/5.));float facade=1.-step(.7,abs(vFacadeNormal.y));totalEmissiveRadiance+=vec3(.65,.8,.75)*row*column*facade*(.035+uCityNight*.35);',
            );
        }}
        customProgramCacheKey={() => 'city-facade-v1'}
      />
    </instancedMesh>
  );
}
function City({
  body,
  city,
  session,
}: {
  body: CelestialDefinition;
  city: SettlementDefinition;
  session: FlightSession;
}) {
  const root = useRef<Group>(null),
    roads = useRef<InstancedMesh>(null),
    footprint = useRef<ShaderMaterial>(null);
  const [detail, setDetail] = useState(0);
  const layout = useMemo(() => generateCityLayout(city), [city]);
  const scratch = useMemo(
    () => ({
      position: new Vector3(),
      rotation: new Quaternion(),
      local: surfaceDirection(city.latitude, city.longitude),
      frame: (() => {
        const q = tangentFrame(surfaceDirection(city.latitude, city.longitude));
        return new Quaternion(q.x, q.y, q.z, q.w);
      })(),
      sun: new Vector3(),
      up: new Vector3(),
    }),
    [city],
  );
  const uniforms = useMemo(
    () => ({ uDay: { value: 1 }, uColor: { value: new Color(palettes[city.style]) } }),
    [city],
  );
  const station = session.exploration.world.definition.stations?.find(
    (s) => s.id === `${city.id}-spaceport`,
  );
  useEffect(() => {
    const update = () => {
      const center = session.exploration.world.positions.get(city.id);
      const distance = center?.distanceTo(session.position) ?? Infinity;
      setDetail(distance < 16000 ? 2 : distance < 80000 ? 1 : 0);
    };
    update();
    const timer = setInterval(update, 250);
    return () => clearInterval(timer);
  }, [city, session]);
  const batches = useMemo(() => {
    const ordered = [...layout.buildings].sort((a, b) => b.size[1] - a.size[1]);
    return { skyline: ordered.slice(0, 24), detail: ordered.slice(24) };
  }, [layout]);
  useEffect(() => {
    const matrix = new Matrix4(),
      p = new Vector3(),
      q = new Quaternion(),
      scale = new Vector3();
    if (detail === 2 && roads.current) {
      layout.roads.forEach((road, i) => {
        matrix.compose(
          p.fromArray(road.center),
          q.fromArray(road.orientation),
          scale.fromArray(road.size),
        );
        roads.current?.setMatrixAt(i, matrix);
      });
      roads.current.instanceMatrix.needsUpdate = true;
      roads.current.computeBoundingSphere();
    }
  }, [layout, detail]);
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
    const star = world.definition.bodies.find((b) => b.kind === 'star');
    const sun = star && world.positions.get(star.id);
    if (sun && footprint.current?.uniforms.uDay)
      uniforms.uDay.value = footprint.current.uniforms.uDay.value = scratch.sun
        .copy(sun)
        .sub(scratch.position)
        .normalize()
        .dot(scratch.up);
  });
  return (
    <group ref={root}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.8, 0]}>
        <circleGeometry args={[city.radius * 0.94, 64]} />
        <shaderMaterial
          ref={footprint}
          uniforms={uniforms}
          vertexShader={`#include <common>
            #include <logdepthbuf_pars_vertex>
            varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
            #include <logdepthbuf_vertex>
            }`}
          fragmentShader={`#include <logdepthbuf_pars_fragment>
            uniform float uDay;uniform vec3 uColor;varying vec2 vUv;void main(){
            #include <logdepthbuf_fragment>
            vec2 p=vUv*48.;vec2 f=fract(p);float streets=step(.91,f.x)+step(.91,f.y);
            float cells=step(.25,fract(sin(dot(floor(p),vec2(12.4,71.9)))*43217.));
            float night=1.-smoothstep(-.15,.2,uDay);
            vec3 color=uColor*(.06+max(0.,uDay)*.24)+vec3(1.,.68,.25)*(streets*.4+cells*.23)*night;
            gl_FragColor=vec4(color,1.);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
            }`}
        />
      </mesh>
      {detail > 0 && (
        <BuildingBatch
          daylight={uniforms.uDay}
          boxes={batches.skyline}
          city={city}
          session={session}
          near={65000}
          far={80000}
        />
      )}
      {detail === 2 && batches.detail.length > 0 && (
        <BuildingBatch
          daylight={uniforms.uDay}
          boxes={batches.detail}
          city={city}
          session={session}
          near={12000}
          far={16000}
        />
      )}
      {detail === 2 && (
        <instancedMesh ref={roads} args={[undefined, undefined, layout.roads.length]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="#242a2d" roughness={1} />
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
  return (
    <>
      {session.exploration.world.definition.bodies.flatMap((body) =>
        (body.settlements ?? []).map((city) => (
          <City key={city.id} body={body} city={city} session={session} />
        )),
      )}
    </>
  );
}
