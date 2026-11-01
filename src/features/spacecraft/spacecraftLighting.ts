import { type BufferGeometry, Color, type MeshStandardMaterial, Vector3, Vector4 } from 'three';

export interface EngineMount {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly radius: number;
}

export interface HullMarker {
  readonly position: Vector3;
  readonly normal: Vector3;
}

export interface HullLighting {
  readonly color: Color;
  readonly markers: readonly HullMarker[];
}

const markerTargets = [
  [-0.95, 0.1, 0],
  [0.95, 0.1, 0],
  [-0.35, 0.45, -0.65],
  [0.35, 0.45, -0.65],
  [-0.45, 0.2, 0.55],
  [0.45, 0.2, 0.55],
  [0, 0.95, -0.1],
  [0, 0.05, -0.94],
] as const;

/** Snap running lights to actual hull vertices, with a small outward bezel clearance. */
export function createHullLighting(geometry: BufferGeometry, color: string): HullLighting {
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  const positions = geometry.getAttribute('position');
  const normals = geometry.getAttribute('normal');
  if (!bounds || !positions || !normals || positions.count === 0) {
    throw new Error('Hull lighting needs a nonempty surface with vertex normals.');
  }
  const extent = bounds.getSize(new Vector3()).multiplyScalar(0.5);
  const center = bounds.getCenter(new Vector3());
  const point = new Vector3();
  const markers: HullMarker[] = [];
  for (const [x, y, z] of markerTargets) {
    const target = new Vector3(x * extent.x, y * extent.y, z * extent.z).add(center);
    let nearest = 0;
    let distance = Infinity;
    for (let index = 0; index < positions.count; index++) {
      point.fromBufferAttribute(positions, index);
      const candidate = point.distanceToSquared(target);
      if (candidate < distance) {
        nearest = index;
        distance = candidate;
      }
    }
    const normal = new Vector3().fromBufferAttribute(normals, nearest).normalize();
    const position = new Vector3()
      .fromBufferAttribute(positions, nearest)
      .addScaledVector(normal, 0.035);
    if (markers.every((marker) => marker.position.distanceToSquared(position) > 0.04)) {
      markers.push({ position, normal });
    }
  }
  return { color: new Color(color), markers };
}

/** Local light spill and a quiet rim keep ships readable without adding global scene lights. */
export function illuminateHull(
  material: MeshStandardMaterial,
  engines: readonly EngineMount[],
  lighting: HullLighting,
) {
  const positions = [
    ...engines.map((mount) => new Vector4(mount.x, mount.y, mount.z + 0.15, mount.radius * 3.5)),
    ...lighting.markers.map(({ position, normal }) => {
      const source = position.clone().addScaledVector(normal, 0.12);
      return new Vector4(source.x, source.y, source.z, 0.65);
    }),
  ];
  const count = positions.length;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uHullLamps = { value: positions };
    shader.uniforms.uHullTint = { value: lighting.color };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vHullPosition;
        varying vec3 vHullNormal;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vHullPosition = position;
        vHullNormal = normal;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec4 uHullLamps[${count}];
        uniform vec3 uHullTint;
        varying vec3 vHullPosition;
        varying vec3 vHullNormal;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float hullRim = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 2.5);
        vec3 hullSpill = vec3(0.0);
        for (int lamp = 0; lamp < ${count}; lamp++) {
          vec3 toLamp = uHullLamps[lamp].xyz - vHullPosition;
          float range = max(uHullLamps[lamp].w, 0.1);
          float falloff = exp(-dot(toLamp, toLamp) / (range * range) * 2.0);
          float facing = max(0.12, dot(normalize(vHullNormal),
            toLamp / max(length(toLamp), 0.001)));
          hullSpill += uHullTint * falloff * facing;
        }
        totalEmissiveRadiance += diffuseColor.rgb * (0.28 + hullRim * 0.18)
          + uHullTint * hullRim * 0.13 + hullSpill * 0.65;`,
      );
  };
  material.customProgramCacheKey = () => `spacecraft-lighting-v1-${count}`;
  material.needsUpdate = true;
}
