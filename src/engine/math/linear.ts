/** Renderer-independent mutable math. Metres, radians, right-handed +Y up / -Z forward. */
export interface VectorLike {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}
export interface QuaternionLike extends VectorLike {
  readonly w: number;
}
export const MathUtils = {
  clamp: (value: number, min: number, max: number) => Math.max(min, Math.min(max, value)),
  RAD2DEG: 180 / Math.PI,
  DEG2RAD: Math.PI / 180,
};
export class Vector3 {
  x: number;
  y: number;
  z: number;
  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }
  set(x: number, y: number, z: number) {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }
  copy(v: VectorLike) {
    return this.set(v.x, v.y, v.z);
  }
  clone() {
    return new Vector3(this.x, this.y, this.z);
  }
  fromArray(v: ArrayLike<number>) {
    return this.set(v[0] ?? 0, v[1] ?? 0, v[2] ?? 0);
  }
  toArray(): [number, number, number] {
    return [this.x, this.y, this.z];
  }
  add(v: VectorLike) {
    return this.addScaledVector(v, 1);
  }
  sub(v: VectorLike) {
    return this.addScaledVector(v, -1);
  }
  subVectors(a: VectorLike, b: VectorLike) {
    return this.copy(a).sub(b);
  }
  addScaledVector(v: VectorLike, s: number) {
    this.x += v.x * s;
    this.y += v.y * s;
    this.z += v.z * s;
    return this;
  }
  multiplyScalar(s: number) {
    this.x *= s;
    this.y *= s;
    this.z *= s;
    return this;
  }
  divideScalar(s: number) {
    return this.multiplyScalar(1 / s);
  }
  negate() {
    return this.multiplyScalar(-1);
  }
  dot(v: VectorLike) {
    return this.x * v.x + this.y * v.y + this.z * v.z;
  }
  lengthSq() {
    return this.dot(this);
  }
  length() {
    return Math.sqrt(this.lengthSq());
  }
  normalize() {
    return this.divideScalar(this.length() || 1);
  }
  clampLength(min: number, max: number) {
    const length = this.length();
    return this.divideScalar(length || 1).multiplyScalar(MathUtils.clamp(length, min, max));
  }
  distanceToSquared(v: VectorLike) {
    return (this.x - v.x) ** 2 + (this.y - v.y) ** 2 + (this.z - v.z) ** 2;
  }
  equals(v: VectorLike) {
    return this.x === v.x && this.y === v.y && this.z === v.z;
  }
  angleTo(v: VectorLike) {
    return Math.acos(
      MathUtils.clamp(this.dot(v) / (this.length() * Math.hypot(v.x, v.y, v.z) || 1), -1, 1),
    );
  }
  distanceTo(v: VectorLike) {
    return Math.sqrt(this.distanceToSquared(v));
  }
  lerp(v: VectorLike, t: number) {
    this.x += (v.x - this.x) * t;
    this.y += (v.y - this.y) * t;
    this.z += (v.z - this.z) * t;
    return this;
  }
  lerpVectors(a: VectorLike, b: VectorLike, t: number) {
    return this.set(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
  }
  crossVectors(a: VectorLike, b: VectorLike) {
    return this.set(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
  }
  applyQuaternion(q: QuaternionLike) {
    const { x, y, z } = this;
    const tx = 2 * (q.y * z - q.z * y),
      ty = 2 * (q.z * x - q.x * z),
      tz = 2 * (q.x * y - q.y * x);
    return this.set(
      x + q.w * tx + q.y * tz - q.z * ty,
      y + q.w * ty + q.z * tx - q.x * tz,
      z + q.w * tz + q.x * ty - q.y * tx,
    );
  }
}
export class Quaternion {
  x: number;
  y: number;
  z: number;
  w: number;
  constructor(x = 0, y = 0, z = 0, w = 1) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
  }
  set(x: number, y: number, z: number, w: number) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
    return this;
  }
  copy(q: QuaternionLike) {
    return this.set(q.x, q.y, q.z, q.w);
  }
  clone() {
    return new Quaternion(this.x, this.y, this.z, this.w);
  }
  identity() {
    return this.set(0, 0, 0, 1);
  }
  fromArray(q: ArrayLike<number>) {
    return this.set(q[0] ?? 0, q[1] ?? 0, q[2] ?? 0, q[3] ?? 1);
  }
  toArray(): [number, number, number, number] {
    return [this.x, this.y, this.z, this.w];
  }
  dot(q: QuaternionLike) {
    return this.x * q.x + this.y * q.y + this.z * q.z + this.w * q.w;
  }
  lengthSq() {
    return this.dot(this);
  }
  length() {
    return Math.sqrt(this.lengthSq());
  }
  normalize() {
    const length = Math.sqrt(this.lengthSq());
    return length
      ? this.set(this.x / length, this.y / length, this.z / length, this.w / length)
      : this.identity();
  }
  invert() {
    return this.set(-this.x, -this.y, -this.z, this.w);
  }
  multiply(q: QuaternionLike) {
    const { x, y, z, w } = this;
    return this.set(
      x * q.w + w * q.x + y * q.z - z * q.y,
      y * q.w + w * q.y + z * q.x - x * q.z,
      z * q.w + w * q.z + x * q.y - y * q.x,
      w * q.w - x * q.x - y * q.y - z * q.z,
    );
  }
  setFromAxisAngle(axis: VectorLike, angle: number) {
    const s = Math.sin(angle / 2);
    return this.set(axis.x * s, axis.y * s, axis.z * s, Math.cos(angle / 2));
  }
  setFromUnitVectors(a: VectorLike, b: VectorLike) {
    const r = a.x * b.x + a.y * b.y + a.z * b.z + 1;
    if (r < 1e-8)
      return (
        Math.abs(a.x) > Math.abs(a.z) ? this.set(-a.y, a.x, 0, 0) : this.set(0, -a.z, a.y, 0)
      ).normalize();
    return this.set(
      a.y * b.z - a.z * b.y,
      a.z * b.x - a.x * b.z,
      a.x * b.y - a.y * b.x,
      r,
    ).normalize();
  }
  angleTo(q: QuaternionLike) {
    return 2 * Math.acos(Math.min(1, Math.abs(this.dot(q))));
  }
  slerp(q: QuaternionLike, t: number) {
    return this.slerpQuaternions(this, q, t);
  }
  slerpQuaternions(a: QuaternionLike, b: QuaternionLike, t: number) {
    let dot = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
    const sign = dot < 0 ? -1 : 1;
    dot = Math.min(1, Math.abs(dot));
    let left = 1 - t,
      right = t;
    if (dot < 0.9995) {
      const angle = Math.acos(dot),
        sin = Math.sin(angle);
      left = Math.sin((1 - t) * angle) / sin;
      right = Math.sin(t * angle) / sin;
    }
    right *= sign;
    return this.set(
      a.x * left + b.x * right,
      a.y * left + b.y * right,
      a.z * left + b.z * right,
      a.w * left + b.w * right,
    ).normalize();
  }
}
/** Quaternion from orthonormal basis columns. */
export function quaternionFromBasis(out: Quaternion, x: VectorLike, y: VectorLike, z: VectorLike) {
  const trace = x.x + y.y + z.z;
  if (trace > 0) {
    const s = 2 * Math.sqrt(trace + 1);
    return out.set((y.z - z.y) / s, (z.x - x.z) / s, (x.y - y.x) / s, s / 4);
  }
  if (x.x > y.y && x.x > z.z) {
    const s = 2 * Math.sqrt(1 + x.x - y.y - z.z);
    return out.set(s / 4, (y.x + x.y) / s, (z.x + x.z) / s, (y.z - z.y) / s);
  }
  if (y.y > z.z) {
    const s = 2 * Math.sqrt(1 + y.y - x.x - z.z);
    return out.set((y.x + x.y) / s, s / 4, (z.y + y.z) / s, (z.x - x.z) / s);
  }
  const s = 2 * Math.sqrt(1 + z.z - x.x - y.y);
  return out.set((z.x + x.z) / s, (z.y + y.z) / s, s / 4, (x.y - y.x) / s);
}
