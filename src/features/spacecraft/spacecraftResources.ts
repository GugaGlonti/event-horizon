import {
  type BufferGeometry,
  type Material,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  type Texture,
} from 'three';

const leases = new WeakMap<Object3D, { users: number; disposed: boolean }>();

/** Loaded hulls share GPU resources. Final teardown also evicts the matching loader entry. */
export function retainSpacecraftResource(scene: Object3D, evict: () => void) {
  const lease = leases.get(scene) ?? { users: 0, disposed: false };
  leases.set(scene, lease);
  lease.users++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    lease.users--;
    // Strict Mode immediately reacquires the same resources during its effect replay.
    queueMicrotask(() => {
      if (lease.users || lease.disposed) return;
      lease.disposed = true;
      const geometries = new Set<BufferGeometry>();
      const materials = new Set<Material>();
      const textures = new Set<Texture>();
      scene.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        geometries.add(object.geometry);
        for (const material of Array.isArray(object.material)
          ? object.material
          : [object.material]) {
          materials.add(material);
          if (material instanceof MeshStandardMaterial) {
            if (material.map) textures.add(material.map);
            if (material.emissiveMap) textures.add(material.emissiveMap);
          }
        }
      });
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      for (const texture of textures) {
        texture.dispose();
        const image: unknown = texture.source.data;
        if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) image.close();
      }
      evict();
      leases.delete(scene);
    });
  };
}
