import { Quaternion, Vector3 } from '@/engine/math/linear';
import type { ShipState, WorldSnapshot } from './protocol';

/** Server simulation time drives interpolation; receipt time only estimates clock offset. */
export class SnapshotBuffer {
  private frames: WorldSnapshot[] = [];
  private latestReceipt = 0;
  delay = 0.1;
  private readonly previousPosition = new Vector3();
  private readonly nextPosition = new Vector3();
  private readonly previousOrientation = new Quaternion();
  private readonly nextOrientation = new Quaternion();
  private readonly velocity = new Vector3();
  clear() {
    this.frames.length = 0;
  }
  push(frame: WorldSnapshot, received: number) {
    if (frame.tick <= (this.frames.at(-1)?.tick ?? -1)) return false;
    this.frames.push(frame);
    this.latestReceipt = received;
    if (this.frames.length > 32) this.frames.shift();
    return true;
  }
  sample(
    id: string,
    now: number,
    position: Vector3,
    orientation: Quaternion,
  ): ShipState | undefined {
    const last = this.frames.at(-1);
    if (!last) return;
    const time = last.time + Math.min(0.25, Math.max(0, now - this.latestReceipt)) - this.delay;
    let a = this.frames[0] ?? last,
      b = last;
    for (const frame of this.frames) {
      if (frame.time <= time) a = frame;
      if (frame.time >= time) {
        b = frame;
        break;
      }
    }
    let ship = b.ships.find((s) => s.id === id);
    const previous = a.ships.find((s) => s.id === id);
    if (!ship) {
      for (let i = this.frames.length - 1; i >= 0; i--) {
        ship = this.frames[i]?.ships.find((s) => s.id === id);
        if (ship) break;
      }
    }
    if (!ship) return;
    position.fromArray(ship.flight.position);
    orientation.fromArray(ship.flight.orientation);
    if (
      !previous ||
      position.distanceToSquared(this.previousPosition.fromArray(previous.flight.position)) >
        250 ** 2
    )
      return ship;
    const fraction =
      b.time > a.time ? Math.max(0, Math.min(1, (time - a.time) / (b.time - a.time))) : 1;
    position.lerpVectors(
      this.previousPosition.fromArray(previous.flight.position),
      this.nextPosition.copy(position),
      fraction,
    );
    orientation.slerpQuaternions(
      this.previousOrientation.fromArray(previous.flight.orientation),
      this.nextOrientation.copy(orientation),
      fraction,
    );
    if (time > b.time && !ship.transferring && ship.hull > 0)
      position.addScaledVector(
        this.velocity.fromArray(ship.flight.velocity),
        Math.min(0.15, time - b.time),
      );
    return ship;
  }
}
