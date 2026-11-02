import { Quaternion, Vector3 } from 'three';
import {
  EXIT_COAST_DISTANCE,
  type HyperspaceController,
  hyperspaceArrivalDistance,
  hyperspaceDepartureDistance,
  smoothRamp,
} from '@/engine/navigation/HyperspaceController';
import { routeArrival, routeOrientation } from '@/engine/navigation/hyperspaceRoute';
import type { SystemRuntime } from '@/engine/world/SystemRuntime';
import { GAME_CONFIG } from '@/features/flight/config';

export const JUMP_MOTION = GAME_CONFIG.hyperspace;
export { EXIT_COAST_DISTANCE } from '@/engine/navigation/HyperspaceController';

/** Bounded analytical cinematic poses. Hyperspeed never enters normal flight integration. */
export class HyperspaceFlight {
  active = false;
  readonly direction = new Vector3();
  private readonly routeDirection = new Vector3();
  private readonly departure = new Vector3();
  private readonly arrival = new Vector3();
  private readonly initialOrientation = new Quaternion();
  private readonly alignedOrientation = new Quaternion();
  private readonly arrivalOrientation = new Quaternion();
  private readonly bank = new Quaternion();
  private readonly rollAxis = new Vector3(0, 0, 1);
  private bankAngle = 0;

  begin(
    position: Readonly<Vector3>,
    orientation: Readonly<Quaternion>,
    direction: { readonly x: number; readonly y: number; readonly z: number },
    launchDirection = direction,
  ) {
    this.active = true;
    this.departure.copy(position);
    this.initialOrientation.copy(orientation);
    this.routeDirection.copy(direction);
    this.direction.copy(launchDirection);
    routeOrientation(launchDirection, this.alignedOrientation);
    routeOrientation(direction, this.arrivalOrientation);
    const forward = new Vector3(0, 0, -1).applyQuaternion(orientation);
    this.bankAngle = Math.max(-0.22, Math.min(0.22, forward.cross(launchDirection).y * 0.25));
  }

  arrive(world: SystemRuntime) {
    this.direction.copy(this.routeDirection);
    routeOrientation(this.direction, this.arrivalOrientation);
    const pose = routeArrival(world, this.direction, EXIT_COAST_DISTANCE);
    this.arrival.copy(pose.position).addScaledVector(this.direction, -EXIT_COAST_DISTANCE);
  }

  setArrival(position: readonly number[], orientation: readonly number[]) {
    this.direction.copy(this.routeDirection);
    this.arrival.fromArray(position).addScaledVector(this.direction, -EXIT_COAST_DISTANCE);
    this.arrivalOrientation.fromArray(orientation);
  }

  sample(jump: HyperspaceController, position: Vector3, orientation: Quaternion, reduced = false) {
    const p = jump.progress;
    orientation.copy(this.alignedOrientation);
    if (jump.phase === 'ALIGNMENT') {
      position.copy(this.departure);
      orientation.slerpQuaternions(
        this.initialOrientation,
        this.alignedOrientation,
        smoothRamp(0, 0.88, p),
      );
      if (!reduced) {
        this.bank.setFromAxisAngle(this.rollAxis, Math.sin(Math.PI * p) * this.bankAngle);
        orientation.multiply(this.bank);
      }
    } else if (jump.phase === 'EXITING') {
      orientation.copy(this.arrivalOrientation);
      position.copy(this.arrival).addScaledVector(this.direction, hyperspaceArrivalDistance(p));
    } else {
      // Settle onto the galactic arrival bearing while the world is fully masked.
      if (jump.phase === 'HYPERSPACE')
        orientation.slerpQuaternions(
          this.alignedOrientation,
          this.arrivalOrientation,
          smoothRamp(0, 0.2, p),
        );
      const distance =
        jump.phase === 'ACCELERATING'
          ? hyperspaceDepartureDistance(p)
          : JUMP_MOTION.departureDistance;
      position.copy(this.departure).addScaledVector(this.direction, distance);
    }
  }

  finish(position: Vector3, orientation: Quaternion) {
    position.copy(this.arrival).addScaledVector(this.direction, EXIT_COAST_DISTANCE);
    orientation.copy(this.arrivalOrientation);
    this.active = false;
  }
}
