import { useLoader } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { type BufferGeometry, Mesh, MeshStandardMaterial, type Object3D } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import manifest from './assets/manifest.json';
import {
  createHullLighting,
  type EngineMount,
  type HullLighting,
  illuminateHull,
} from './spacecraftLighting';
import { retainSpacecraftResource } from './spacecraftResources';

const urls = [
  new URL('./assets/spitfire.glb', import.meta.url).href,
  new URL('./assets/striker.glb', import.meta.url).href,
  new URL('./assets/insurgent.glb', import.meta.url).href,
];

export interface SpacecraftModel {
  readonly geometry: BufferGeometry;
  readonly material: MeshStandardMaterial;
  readonly engines: readonly EngineMount[];
  readonly lighting: HullLighting;
}

export interface SpacecraftModels {
  readonly player: SpacecraftModel;
  readonly striker: SpacecraftModel;
  readonly insurgent: SpacecraftModel;
}

function hull(
  scene: Object3D,
  engines: SpacecraftModel['engines'],
  engineColor: string,
): SpacecraftModel {
  const mesh = scene.children[0];
  if (!(mesh instanceof Mesh) || !(mesh.material instanceof MeshStandardMaterial)) {
    throw new Error('The spacecraft asset must contain one textured standard-material hull.');
  }
  const lighting = createHullLighting(mesh.geometry, engineColor);
  illuminateHull(mesh.material, engines, lighting);
  return { geometry: mesh.geometry, material: mesh.material, engines, lighting };
}

/** One library belongs to FlightWorld, survives jumps and is shared by every enemy slot. */
export function useSpacecraftModels(): SpacecraftModels {
  // The assets need no compression extensions or remotely hosted decoder scripts.
  const assets = useLoader(GLTFLoader, urls);
  const models = useMemo(() => {
    const [player, striker, insurgent] = assets;
    if (!player || !striker || !insurgent) throw new Error('The spacecraft library is incomplete.');
    return {
      player: hull(player.scene, manifest.spitfire.engines, '#73eaff'),
      striker: hull(striker.scene, manifest.striker.engines, '#ff8c55'),
      insurgent: hull(insurgent.scene, manifest.insurgent.engines, '#ff8c55'),
    };
  }, [assets]);
  useEffect(() => {
    const release = assets.map((asset) =>
      retainSpacecraftResource(asset.scene, () => useLoader.clear(GLTFLoader, urls)),
    );
    return () => {
      for (const dispose of release) dispose();
    };
  }, [assets]);
  return models;
}
