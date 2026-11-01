import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Texture } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { retainSpacecraftResource } from '@/features/spacecraft/spacecraftResources';

describe('shared spacecraft ownership', () => {
  it('survives Strict Mode replay and disposes shared resources once on final release', async () => {
    const geometry = new BoxGeometry();
    const texture = new Texture();
    const material = new MeshStandardMaterial({ map: texture });
    const scene = new Group();
    scene.add(new Mesh(geometry, material), new Mesh(geometry, material));
    const geometryDispose = vi.spyOn(geometry, 'dispose');
    const materialDispose = vi.spyOn(material, 'dispose');
    const textureDispose = vi.spyOn(texture, 'dispose');
    const evict = vi.fn();
    const first = retainSpacecraftResource(scene, evict);
    first();
    const replay = retainSpacecraftResource(scene, evict);
    const other = retainSpacecraftResource(scene, evict);
    await Promise.resolve();
    expect(geometryDispose).not.toHaveBeenCalled();
    replay();
    await Promise.resolve();
    expect(textureDispose).not.toHaveBeenCalled();
    other();
    other();
    await Promise.resolve();
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
    expect(textureDispose).toHaveBeenCalledTimes(1);
    expect(evict).toHaveBeenCalledTimes(1);
  });
});
