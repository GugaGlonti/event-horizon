import { useEffect, useState } from 'react';
import {
  CubeTexture,
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RGBAFormat,
} from 'three';
import type { CelestialDefinition } from '@/engine/world/worldTypes';
import type { PlanetGeneration } from './PlanetGeneration';
import { reserveVisualBytes } from './visualBudget';

interface SurfaceMap {
  body: CelestialDefinition;
  texture: CubeTexture;
  faces: DataTexture[];
  release: () => void;
}
function dispose(map: SurfaceMap) {
  map.texture.dispose();
  for (const face of map.faces) face.dispose();
  map.release();
}
/** Published textures are disposed only after React commits their replacement. */
function useSurfaceMap(
  body: CelestialDefinition,
  resolution: number,
  enabled: boolean,
  generation: PlanetGeneration,
) {
  const [resource, setResource] = useState<SurfaceMap | null>(null);
  useEffect(() => {
    if (!enabled || !body.terrain) {
      setResource(null);
      return;
    }
    const release = reserveVisualBytes((resolution * resolution * 6 * 4 * 4) / 3);
    if (!release) return;
    const faces = Array.from(
      { length: 6 },
      () =>
        new DataTexture(
          new Uint8Array(resolution * resolution * 4),
          resolution,
          resolution,
          RGBAFormat,
        ),
    );
    const texture = new CubeTexture(faces);
    texture.minFilter = LinearMipmapLinearFilter;
    texture.magFilter = LinearFilter;
    texture.generateMipmaps = true;
    const map: SurfaceMap = { body, texture, faces, release };
    let disposed = false,
      published = false,
      cancel = () => {},
      face = 0,
      row = 0;
    const next = () => {
      cancel = generation.request(
        `${body.id}/map/${resolution}/${face}/${row}`,
        resolution > 64 ? 3 : 5,
        { kind: 'surface', body, face, resolution, row, rows: 16 },
        (response) => {
          if (disposed || response.result.kind !== 'surface') return;
          const image = faces[face]?.image;
          if (!image) return;
          (image.data as Uint8Array).set(response.result.pixels, row * resolution * 4);
          row += 16;
          if (row >= resolution) {
            row = 0;
            face++;
          }
          if (face < 6) next();
          else {
            texture.needsUpdate = true;
            published = true;
            setResource(map);
          }
        },
      );
    };
    next();
    return () => {
      disposed = true;
      cancel();
      if (!published) dispose(map);
    };
  }, [body, resolution, enabled, generation]);
  useEffect(() => {
    if (resource) return () => dispose(resource);
  }, [resource]);
  return resource?.body === body ? resource.texture : null;
}
/** Sequential strips let root terrain and nearby scenery interrupt an expensive face bake. */
export function usePlanetSurface(
  body: CelestialDefinition,
  active: boolean,
  generation: PlanetGeneration,
) {
  const coarse = useSurfaceMap(body, 64, Boolean(body.terrain), generation);
  const detailed = useSurfaceMap(body, 256, active && Boolean(coarse), generation);
  return active ? (detailed ?? coarse) : coarse;
}
