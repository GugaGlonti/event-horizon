import { Quaternion, Vector3 } from 'three';

/** Logical-space source projection. The listener remains at the audio origin, facing local -Z. */
export class SpatialAudioProjection {
  readonly position = new Vector3();
  distance = 0;
  level = 0;
  pitch = 1;
  cutoff = 4000;
  private readonly velocity = new Vector3();
  private readonly inverse = new Quaternion();

  project(
    source: Readonly<Vector3>,
    velocity: Readonly<Vector3>,
    listener: Readonly<Vector3>,
    listenerVelocity: Readonly<Vector3>,
    orientation: Readonly<Quaternion>,
    range: number,
  ) {
    this.position.subVectors(source, listener);
    this.distance = this.position.length();
    if (!Number.isFinite(this.distance) || this.distance >= range) {
      this.position.set(0, 0, 0);
      this.level = 0;
      this.pitch = 1;
      this.cutoff = 1000;
      return;
    }
    const fade = Math.max(0, Math.min(1, (range - this.distance) / (range * 0.25)));
    this.level = (fade * fade * (3 - 2 * fade)) / (1 + (this.distance / 90) ** 2) ** 0.6;
    this.velocity.subVectors(velocity, listenerVelocity);
    const radial = this.distance > 1 ? this.velocity.dot(this.position) / this.distance : 0;
    this.pitch = 1 - Math.max(-0.12, Math.min(0.12, radial / 1600));
    this.position.applyQuaternion(this.inverse.copy(orientation).invert());
    const behind = this.position.z > 0 ? 0.78 : 1;
    this.cutoff = (4000 - Math.min(1, this.distance / range) * 2400) * behind;
  }
}
