import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { BufferAttribute, type Group, type ShaderMaterial, Vector3 } from 'three';
import { tangentFrame } from '@/engine/planetary/coordinates';
import type { FlightSession } from '@/features/flight/FlightSession';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/** Bounded camera-local particles; gameplay weather and winds come from shared simulation time. */
export function WeatherEffects({ session }: { session: FlightSession }) {
  const root = useRef<Group>(null),
    material = useRef<ShaderMaterial>(null);
  const reducedMotion = useReducedMotion();
  const positions = useMemo(
    () =>
      new BufferAttribute(
        Float32Array.from(
          { length: 384 * 3 },
          (_, i) => ((i * 137 + Math.floor(i / 3) * 71) % 997) / 997,
        ),
        3,
      ),
    [],
  );
  const scratch = useMemo(() => new Vector3(), []);
  const uniforms = useMemo(
    () => ({ uTime: { value: 0 }, uIntensity: { value: 0 }, uKind: { value: 0 } }),
    [],
  );
  useFrame(({ camera }) => {
    if (!root.current || !material.current) return;
    const readout = session.planetaryReadout,
      weather = readout.weather;
    const active =
      weather && weather.intensity > 0.05 && readout.density > 0.05 && weather.kind !== 'clear';
    root.current.visible = Boolean(active);
    if (!active || !weather) return;
    root.current.position.copy(camera.position);
    const center = session.exploration.world.positions.get(readout.bodyId ?? '');
    if (center) {
      scratch.copy(session.position).sub(center).normalize();
      const frame = tangentFrame(scratch);
      root.current.quaternion.set(frame.x, frame.y, frame.z, frame.w);
    }
    const u = material.current.uniforms;
    if (u.uTime) u.uTime.value = reducedMotion ? 0 : session.exploration.world.time;
    if (u.uIntensity) u.uIntensity.value = weather.intensity * Math.min(1, readout.density);
    if (u.uKind)
      u.uKind.value =
        weather.kind === 'rain' ? 0 : weather.kind === 'snow' ? 1 : weather.kind === 'ash' ? 3 : 2;
  });
  return (
    <group ref={root} visible={false}>
      <points frustumCulled={false} renderOrder={2}>
        <bufferGeometry>
          <primitive object={positions} attach="attributes-position" />
        </bufferGeometry>
        <shaderMaterial
          ref={material}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          vertexShader={`#include <common>
        #include <logdepthbuf_pars_vertex>
        uniform float uTime,uKind;varying float vDistance;void main(){
        vec3 p=position*vec3(100.,70.,100.);float speed=uKind<.5?27.:uKind<1.5?4.:8.;
        p.x=mod(p.x+uTime*3.,100.)-50.;p.z-=50.;p.y=mod(p.y-uTime*speed,70.)-35.;
        vec4 view=modelViewMatrix*vec4(p,1.);vDistance=length(view.xyz);
        gl_PointSize=clamp((uKind<.5?45.:75.)/max(1.,-view.z),1.,5.);
        gl_Position=projectionMatrix*view;
        #include <logdepthbuf_vertex>
        }`}
          fragmentShader={`#include <logdepthbuf_pars_fragment>
        uniform float uIntensity,uKind;varying float vDistance;void main(){
        #include <logdepthbuf_fragment>
        vec2 p=gl_PointCoord-.5;float shape=1.-smoothstep(.2,.5,length(p*(uKind<.5?vec2(4.,1.):vec2(1.))));
        vec3 color=uKind<.5?vec3(.55,.7,.8):uKind<1.5?vec3(.9,.95,1.):uKind<2.5?vec3(.65,.45,.25):vec3(.4,.38,.36);
        gl_FragColor=vec4(color,shape*uIntensity*(1.-smoothstep(25.,60.,vDistance))*.6);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        }`}
        />
      </points>
    </group>
  );
}
