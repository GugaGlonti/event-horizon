/** Shared spherical-domain value noise. Integer hashing is identical in browser workers and Node. */
export const smooth = (t: number) => t * t * (3 - 2 * t);
export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
export function range(a: number, b: number, v: number) {
  return smooth(clamp01((v - a) / (b - a)));
}
function hash(x: number, y: number, z: number, seed: number) {
  let value = Math.imul(x ^ seed, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1442695041);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}
export function surfaceNoise(x: number, y: number, z: number, seed: number) {
  const ix = Math.floor(x),
    iy = Math.floor(y),
    iz = Math.floor(z);
  const tx = smooth(x - ix),
    ty = smooth(y - iy),
    tz = smooth(z - iz);
  let sum = 0;
  for (let a = 0; a < 2; a++)
    for (let b = 0; b < 2; b++)
      for (let c = 0; c < 2; c++)
        sum +=
          hash(ix + a, iy + b, iz + c, seed) *
          (a ? tx : 1 - tx) *
          (b ? ty : 1 - ty) *
          (c ? tz : 1 - tz);
  return sum;
}
export const SURFACE_GENERATION_REVISION = 2;
