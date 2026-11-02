import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import {
  AdditiveBlending,
  BackSide,
  Color,
  DoubleSide,
  type Group,
  type Mesh,
  type ShaderMaterial,
  type SphereGeometry,
  Vector3,
} from 'three';
import type { RenderOrigin } from '@/engine/world/RenderOrigin';
import type { SystemRuntime } from '@/engine/world/SystemRuntime';
import type { CelestialDefinition } from '@/engine/world/worldTypes';
import {
  atmosphereFragment,
  celestialVertex,
  ringFragment,
  surfaceFragment,
} from '@/features/planets/rendering/celestialShaders';
import { useRotationEnabled } from '@/hooks/useRotationEnabled';

const patterns = { ocean: 0, desert: 1, ice: 2, volcanic: 3, bands: 4, cratered: 5 };

export function CelestialBody({
  body,
  world,
  origin,
  geometry,
  surfaceVisible = true,
}: {
  body: CelestialDefinition;
  world: SystemRuntime;
  origin: RenderOrigin;
  geometry: SphereGeometry;
  surfaceVisible?: boolean;
}) {
  const group = useRef<Group>(null);
  const surface = useRef<Mesh>(null),
    cloudMaterial = useRef<ShaderMaterial>(null);
  const rotating = useRotationEnabled();
  const starId = world.definition.bodies.find((candidate) => candidate.kind === 'star')?.id ?? '';
  const uniforms = useMemo(
    () => ({
      uA: { value: new Color(body.surface.palette[0]) },
      uB: { value: new Color(body.surface.palette[1]) },
      uC: { value: new Color(body.surface.palette[2]) },
      uLight: { value: new Vector3(1, 0, 0) },
      uTime: { value: 0 },
      uClouds: { value: body.climate?.cloudCover ?? 0 },
      uSeed: { value: body.surface.seed },
      uPattern: { value: patterns[body.surface.pattern] },
      uStar: { value: body.kind === 'star' ? 1 : 0 },
      uBrightness: { value: body.surface.brightness },
      uAmbient: { value: world.definition.environment.ambient },
      uColor: { value: new Color(body.atmosphere?.color ?? body.surface.palette[0]) },
      uStrength: { value: body.kind === 'star' ? 0.8 : (body.atmosphere?.strength ?? 0) },
    }),
    [body, world],
  );
  const rings = useMemo(
    () => ({
      uColor: { value: new Color(body.rings?.color ?? '#ffffff') },
      uInner: { value: body.rings?.inner ?? 1 },
      uOuter: { value: body.rings?.outer ?? 2 },
      uRadius: { value: body.radius },
      uLight: uniforms.uLight,
      uCenter: { value: new Vector3() },
    }),
    [body, uniforms],
  );

  useFrame(() => {
    const position = world.positions.get(body.id);
    const star = world.positions.get(starId);
    if (!group.current || !position) return;
    origin.toRender(position, group.current.position);
    group.current.visible = group.current.position.length() - body.radius < 18_000_000;
    if (!group.current.visible) {
      group.current.position.set(0, 0, 0);
      return;
    }
    if (star && body.kind !== 'star') uniforms.uLight.value.copy(star).sub(position).normalize();
    rings.uCenter.value.copy(group.current.position);
    // Physical rotation continues even when cosmetic animation is reduced.
    if (surface.current) surface.current.rotation.y = world.time * body.rotation.speed;
    if (cloudMaterial.current?.uniforms.uTime)
      cloudMaterial.current.uniforms.uTime.value = rotating ? world.time : 0;
  });

  return (
    <group ref={group} scale={body.radius}>
      <group rotation={[0, 0, body.rotation.tilt]}>
        <mesh ref={surface} visible={surfaceVisible}>
          <primitive object={geometry} attach="geometry" />
          <shaderMaterial
            vertexShader={celestialVertex}
            fragmentShader={surfaceFragment}
            uniforms={uniforms}
          />
        </mesh>
        {body.rings && (
          <mesh rotation={[-Math.PI / 2 + body.rings.tilt, 0, 0]}>
            <ringGeometry args={[body.rings.inner, body.rings.outer, 192]} />
            <shaderMaterial
              vertexShader={celestialVertex}
              fragmentShader={ringFragment}
              uniforms={rings}
              side={DoubleSide}
              transparent
              depthWrite={false}
            />
          </mesh>
        )}
      </group>
      {body.ocean && (
        <mesh scale={1 + body.ocean.level / body.radius}>
          <primitive object={geometry} attach="geometry" />
          <shaderMaterial
            vertexShader={celestialVertex}
            uniforms={uniforms}
            fragmentShader={`#include <logdepthbuf_pars_fragment>
            uniform vec3 uA,uLight;varying vec3 vWorld,vNormalWorld;void main(){
            #include <logdepthbuf_fragment>
            vec3 n=normalize(vNormalWorld), light=normalize(uLight), view=normalize(cameraPosition-vWorld);
            float day=max(0.,dot(n,light));float fresnel=pow(1.-max(0.,dot(n,view)),4.);
            float reflection=pow(max(0.,dot(reflect(-light,n),view)),110.);
            vec3 color=uA*(.1+day*.9)+vec3(.15,.3,.42)*fresnel*day+reflection*day*.65;
            gl_FragColor=vec4(color,1.);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
            }`}
          />
        </mesh>
      )}
      {body.atmosphere && (body.climate?.cloudCover ?? 0) > 0 && (
        <mesh scale={1 + ((body.atmosphere.height ?? 0) * 0.48) / body.radius}>
          <primitive object={geometry} attach="geometry" />
          <shaderMaterial
            ref={cloudMaterial}
            vertexShader={celestialVertex}
            uniforms={uniforms}
            transparent
            depthWrite={false}
            fragmentShader={`#include <logdepthbuf_pars_fragment>
            uniform vec3 uLight;uniform float uTime,uSeed,uClouds;varying vec3 vLocal,vNormalWorld;
            void main(){
            #include <logdepthbuf_fragment>
            vec3 p=normalize(vLocal);float bands=sin(p.x*35.+sin(p.z*23.+uSeed)+uTime*.003)*sin(p.z*27.+p.y*18.);
            float clouds=smoothstep(1.-uClouds*1.6,1.,bands);
            float day=max(0.,dot(normalize(vNormalWorld),normalize(uLight)));
            gl_FragColor=vec4(vec3(.65,.7,.74)*(.08+day),clouds*.65);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
            }`}
          />
        </mesh>
      )}
      {(body.atmosphere || body.kind === 'star') && (
        <mesh scale={body.kind === 'star' ? 1.2 : (body.atmosphere?.scale ?? 1.04)}>
          <primitive object={geometry} attach="geometry" />
          <shaderMaterial
            vertexShader={celestialVertex}
            fragmentShader={atmosphereFragment}
            uniforms={uniforms}
            side={BackSide}
            blending={AdditiveBlending}
            transparent
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  );
}
