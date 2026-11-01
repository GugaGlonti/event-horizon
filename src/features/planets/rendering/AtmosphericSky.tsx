import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { BackSide, type Mesh, type ShaderMaterial, Vector3 } from 'three';
import type { FlightSession } from '@/features/flight/FlightSession';
import { useReducedMotion } from '@/hooks/useReducedMotion';

export function AtmosphericSky({ session }: { session: FlightSession }) {
  const reducedMotion = useReducedMotion();
  const mesh = useRef<Mesh>(null),
    material = useRef<ShaderMaterial>(null);
  const uniforms = useMemo(
    () => ({
      uUp: { value: new Vector3(0, 1, 0) },
      uSun: { value: new Vector3(-1, 0, 0) },
      uDensity: { value: 0 },
      uHeight: { value: 1 },
      uCloudOffset: { value: new Vector3() },
      uTime: { value: 0 },
      uEntry: { value: 0 },
    }),
    [],
  );
  useFrame(({ camera }) => {
    if (!mesh.current || !material.current) return;
    const world = session.exploration.world,
      readout = session.planetaryReadout;
    const body = world.definition.bodies.find((p) => p.id === readout.bodyId),
      center = body && world.positions.get(body.id);
    mesh.current.visible = Boolean(
      body?.atmosphere && readout.altitude < (body.atmosphere.height ?? 0),
    );
    mesh.current.position.copy(camera.position);
    if (!center || !body?.atmosphere) return;
    uniforms.uUp.value.copy(session.position).sub(center).normalize();
    uniforms.uCloudOffset.value.copy(session.position).sub(center).multiplyScalar(0.00025);
    const star = world.definition.bodies.find((p) => p.kind === 'star');
    if (star)
      uniforms.uSun.value
        .copy(world.positions.get(star.id) ?? center)
        .sub(session.position)
        .normalize();
    const density = material.current.uniforms.uDensity,
      height = material.current.uniforms.uHeight;
    if (density) density.value = readout.density;
    if (height) height.value = readout.altitude / (body.atmosphere.height ?? 1);
    const time = material.current.uniforms.uTime,
      entry = material.current.uniforms.uEntry;
    if (time) time.value = reducedMotion ? 0 : world.time;
    if (entry)
      entry.value =
        Math.sqrt(readout.density) *
        Math.min(1, Math.hypot(readout.verticalSpeed, readout.groundSpeed) / 800);
  });
  return (
    <mesh ref={mesh} renderOrder={-5} frustumCulled={false}>
      <sphereGeometry args={[1000, 24, 16]} />
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        side={BackSide}
        transparent
        depthWrite={false}
        depthTest
        vertexShader={`varying vec3 vDirection;void main(){vDirection=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);gl_Position.z=gl_Position.w*.9999998;}`}
        fragmentShader={`uniform vec3 uUp,uSun,uCloudOffset;uniform float uDensity,uHeight,uTime,uEntry;varying vec3 vDirection;
      void main(){vec3 ray=normalize(vDirection);float horizon=pow(1.0-abs(dot(ray,uUp)),5.0);
        float day=smoothstep(-.22,.25,dot(uUp,uSun));float sun=pow(max(0.0,dot(ray,uSun)),32.0);
        vec3 color=mix(vec3(.008,.015,.04),mix(vec3(.035,.13,.31),vec3(.35,.55,.72),horizon),day);
        color+=vec3(.5,.22,.07)*sun*day*.45;
        vec2 cloud=ray.xz*8.+uCloudOffset.xz+uCloudOffset.y*.37;
        float bands=sin(cloud.x*1.3+sin(cloud.y*1.7)+uTime*.007)*sin(cloud.y*2.1-cloud.x*.4);
        float layer=smoothstep(.01,.08,uHeight)*(1.-smoothstep(.65,.9,uHeight));
        float wisps=smoothstep(.35,.85,bands)*layer*(.4+horizon*.6);
        color=mix(color, mix(vec3(.06,.075,.1),vec3(.65,.7,.72),day),wisps*.24);
        color+=vec3(.18,.075,.025)*uEntry*horizon*day;
        float alpha=(1.0-smoothstep(.65,1.0,uHeight))*clamp(.3+uDensity*.7+horizon*.35,0.0,1.0);
        gl_FragColor=vec4(color,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`}
      />
    </mesh>
  );
}
