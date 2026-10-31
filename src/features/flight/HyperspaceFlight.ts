import { Quaternion, Vector3 } from 'three';
import {
  entrySurge,
  HYPERSPACE_TIMING,
  type HyperspaceController,
  smoothRamp,
} from '@/engine/navigation/HyperspaceController';
import { routeArrival, routeOrientation } from '@/engine/navigation/hyperspaceRoute';
import type { SystemRuntime } from '@/engine/world/SystemRuntime';
import { GAME_CONFIG } from '@/features/flight/config';

export const JUMP_MOTION = GAME_CONFIG.hyperspace;
const exitDuration = HYPERSPACE_TIMING.EXITING;
export const EXIT_COAST_DISTANCE =
  exitDuration * (JUMP_MOTION.exitSpeed + (JUMP_MOTION.arrivalSpeed - JUMP_MOTION.exitSpeed) / 8);

/** Bounded analytical cinematic poses. Hyperspeed never enters normal flight integration. */
export class HyperspaceFlight {
  active = false;
  readonly direction = new Vector3();
  private readonly departure = new Vector3();
  private readonly arrival = new Vector3();
  private readonly initialOrientation = new Quaternion();
  private readonly alignedOrientation = new Quaternion();
  private readonly bank = new Quaternion();
  private readonly rollAxis = new Vector3(0, 0, 1);
  private bankAngle = 0;

  begin(
    position: Readonly<Vector3>,
    orientation: Readonly<Quaternion>,
    direction: Readonly<Vector3>,
  ) {
    this.active = true;
    this.departure.copy(position);
    this.initialOrientation.copy(orientation);
    this.direction.copy(direction);
    routeOrientation(direction, this.alignedOrientation);
    const forward = new Vector3(0, 0, -1).applyQuaternion(orientation);
    this.bankAngle = Math.max(-0.22, Math.min(0.22, forward.cross(direction).y * 0.25));
  }

  arrive(world: SystemRuntime) {
    const pose = routeArrival(world, this.direction, EXIT_COAST_DISTANCE);
    this.arrival.copy(pose.position);
  }

  sample(jump: HyperspaceController, position: Vector3, orientation: Quaternion, reduced = false) {
    const p = jump.progress;
    orientation.copy(this.alignedOrientation);
    if (jump.phase === 'CHARGING') {
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
      const distance =
        JUMP_MOTION.exitSpeed * exitDuration * p +
        ((JUMP_MOTION.arrivalSpeed - JUMP_MOTION.exitSpeed) * exitDuration * (1 - (1 - p) ** 8)) /
          8;
      position.copy(this.arrival).addScaledVector(this.direction, distance);
    } else {
      const distance =
        JUMP_MOTION.departureDistance * (jump.phase === 'ACCELERATING' ? entrySurge(p) ** 2 : 1);
      position.copy(this.departure).addScaledVector(this.direction, distance);
    }
  }

  finish(position: Vector3, orientation: Quaternion) {
    position.copy(this.arrival).addScaledVector(this.direction, EXIT_COAST_DISTANCE);
    orientation.copy(this.alignedOrientation);
    this.active = false;
  }
}
