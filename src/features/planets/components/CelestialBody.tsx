import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import {
  AdditiveBlending,
  BackSide,
  Color,
  DoubleSide,
  type Group,
  type Mesh,
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
}: {
  body: CelestialDefinition;
  world: SystemRuntime;
  origin: RenderOrigin;
  geometry: SphereGeometry;
}) {
  const group = useRef<Group>(null);
  const surface = useRef<Mesh>(null);
  const rotating = useRotationEnabled();
  const starId = world.definition.bodies.find((candidate) => candidate.kind === 'star')?.id ?? '';
  const uniforms = useMemo(
    () => ({
      uA: { value: new Color(body.surface.palette[0]) },
      uB: { value: new Color(body.surface.palette[1]) },
      uC: { value: new Color(body.surface.palette[2]) },
      uLight: { value: new Vector3(1, 0, 0) },
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
    if (surface.current)
      surface.current.rotation.y = rotating ? world.time * body.rotation.speed : 0;
  });

  return (
    <group ref={group} scale={body.radius}>
      <group rotation={[0, 0, body.rotation.tilt]}>
        <mesh ref={surface} visible={!body.terrain}>
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
