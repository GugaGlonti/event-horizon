import { MeshDepthMaterial } from 'three';

/** Shadow comparisons use projected light depth, even with a logarithmic world camera. */
export function createShadowDepthMaterial() {
  const material = new MeshDepthMaterial();
  material.onBeforeCompile = (shader) => {
    const logarithmic = /#include <logdepthbuf_(?:pars_)?(?:vertex|fragment)>/g;
    shader.vertexShader = shader.vertexShader.replace(logarithmic, '');
    shader.fragmentShader = shader.fragmentShader.replace(logarithmic, '');
  };
  material.customProgramCacheKey = () => 'linear-shadow-depth-v1';
  return material;
}
