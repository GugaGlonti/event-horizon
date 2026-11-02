import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  RGBAFormat,
} from 'three';
import { surfaceNoise } from '@/engine/planetary/surfaceNoise';
export function createTerrainDetail() {
  const size = 128,
    pixels = new Uint8Array(size * size * 4);
  const value = (x: number, y: number) => {
    const a = (x / size) * Math.PI * 2,
      b = (y / size) * Math.PI * 2;
    return surfaceNoise(Math.sin(a) * 5, Math.cos(a) * 5 + Math.sin(b) * 5, Math.cos(b) * 5, 1217);
  };
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      pixels[i] = Math.round(value(x, y) * 255);
      pixels[i + 1] = Math.round(
        Math.max(0, Math.min(1, 0.5 + (value(x + 1, y) - value(x - 1, y)) * 2)) * 255,
      );
      pixels[i + 2] = Math.round(
        Math.max(0, Math.min(1, 0.5 + (value(x, y + 1) - value(x, y - 1)) * 2)) * 255,
      );
      pixels[i + 3] = 255;
    }
  const texture = new DataTexture(pixels, size, size, RGBAFormat);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}
export const terrainVertex = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec3 aCoarse,aDirection;
attribute vec4 aCover;
attribute vec2 aClimate;
attribute float aElevation;
uniform float uMorph,uRadius;
varying vec3 vNormal,vPosition,vBody,vRadial;
varying vec4 vCover;
varying vec2 vClimate;
varying float vElevation;
void main(){
  vec3 p=mix(aCoarse,position,uMorph);
  vec4 world=modelMatrix*vec4(p,1.0);
  vPosition=world.xyz;vNormal=normalize(mat3(modelMatrix)*normal);
  vRadial=normalize(mat3(modelMatrix)*aDirection);vBody=aDirection*uRadius;
  vCover=aCover;vClimate=aClimate;vElevation=aElevation;
  gl_Position=projectionMatrix*viewMatrix*world;
  #include <logdepthbuf_vertex>
}`;
export const terrainFragment = /* glsl */ `
#include <logdepthbuf_pars_fragment>
uniform vec3 uLight,uUp,uVegetation,uStone,uSediment,uFrozen,uSky;
uniform float uDensity,uType,uRelief;
uniform sampler2D uDetail;
varying vec3 vNormal,vPosition,vBody,vRadial;
varying vec4 vCover;
varying vec2 vClimate;
varying float vElevation;
void main(){
  #include <logdepthbuf_fragment>
  vec3 normal=normalize(vNormal),up=normalize(vRadial);
  float slope=1.-max(0.,dot(normal,up));
  float distance=length(cameraPosition-vPosition);
  float close=1.-smoothstep(180.,1500.,distance);
  vec4 weights=vCover/max(.001,dot(vCover,vec4(1.)));
  vec3 vegetation=uVegetation*(1.-vClimate.x*.38);
  vec3 color=vegetation*weights.x+uStone*weights.y+uSediment*weights.z+uFrozen*weights.w;
  vec3 localUp=normalize(vBody);
  vec3 axes=abs(localUp);vec2 uv=axes.y>axes.x&&axes.y>axes.z?vBody.xz:axes.x>axes.z?vBody.yz:vBody.xy;
  float forest=vClimate.x*weights.x*(1.-smoothstep(5000.,14000.,distance));
  if(forest>.01){
    float crown=texture2D(uDetail,uv*.075).r;
    float grove=texture2D(uDetail,uv*.004).r;
    color*=mix(1.,(.5+smoothstep(.22,.78,crown)*.7)*(.8+grove*.3),forest);
  }
  if(close>.001){
    vec4 detail=texture2D(uDetail,uv*.075),fine=texture2D(uDetail,uv*.31+vec2(.37,.13));
    color*=1.+((detail.r-.5)*.25+(fine.r-.5)*.1)*close;
    normal=normalize(normal+vec3(detail.g-.5,0.,detail.b-.5)*close*.12*(1.-weights.w*.5));
  }
  float day=max(0.,dot(normal,uLight));
  float skyLight=max(0.,dot(up,uLight));
  float fill=.10+skyLight*.12;
  float strata=sin(vElevation*.12)*sin(vElevation*.037)*slope*.06;
  color=(color+strata)*(fill+day*1.1)+uSky*skyLight*.025;
  if(uType>2.5&&uType<3.5)color+=vec3(1.,.16,.025)*vClimate.y*.7;
  float haze=1.-exp(-distance*uDensity*.000045);
  vec3 sky=mix(vec3(.025,.04,.07),uSky,skyLight);
  gl_FragColor=vec4(mix(color,sky,haze*.8),1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
