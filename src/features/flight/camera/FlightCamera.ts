import { MathUtils, type PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { HYPERSPACE_EXIT, smoothRamp } from '@/engine/navigation/HyperspaceController';
import { traceStation } from '@/engine/stations/stationGeometry';
import {
  jumpKick,
  jumpRattle,
  jumpRecoil,
  jumpTurbulence,
} from '@/features/exploration/hyperspaceVisuals';
import { FLIGHT_CONFIG, GAME_CONFIG } from '@/features/flight/config';
import type { FlightSession } from '@/features/flight/FlightSession';
import { JUMP_MOTION } from '@/features/flight/HyperspaceFlight';
import type { CameraMode } from '@/stores/flightStore';

/** Presentation-only follow controller. It never writes to the flight controller. */
export class FlightCamera {
  private readonly logicalCamera = new Vector3();
  private readonly targetPosition = new Vector3();
  private readonly previousOrigin = new Vector3();
  private readonly previousShip = new Vector3();
  private readonly movement = new Vector3();
  private readonly right = new Vector3();
  private readonly up = new Vector3();
  private readonly back = new Vector3();
  private readonly lastImpulse = new Vector3();
  private readonly lastRotation = new Quaternion();
  private jumping = false;
  private jumpSpeedFov = 0;
  private mode: CameraMode | null = null;
  private resetVersion = -1;

  update(
    camera: PerspectiveCamera,
    session: FlightSession,
    mode: CameraMode,
    dt: number,
    reducedMotion: boolean,
  ) {
    const config = GAME_CONFIG.camera;
    const jump = session.exploration.jump;
    const ordinarySpeedFov =
      config.speedFov * Math.min(1, session.controller.speed / FLIGHT_CONFIG.boostMaxSpeed);
    if (jump.busy && !this.jumping) this.jumpSpeedFov = ordinarySpeedFov;
    // The controller is relocated beneath the mask. Preserve the lens through that handoff,
    // then approach normal cruise widening during the same visible braking beat.
    const speedFov = jump.busy
      ? jump.phase === 'EXITING'
        ? MathUtils.lerp(
            this.jumpSpeedFov,
            config.speedFov * Math.min(1, JUMP_MOTION.exitSpeed / FLIGHT_CONFIG.boostMaxSpeed),
            smoothRamp(HYPERSPACE_EXIT.revealEnd, 1, jump.progress),
          )
        : this.jumpSpeedFov
      : ordinarySpeedFov;
    if (jump.busy && session.exploration.isSuspended) dt = 0;
    const kick = reducedMotion ? 0 : jumpKick(jump);
    camera.position.sub(this.lastImpulse);
    camera.quaternion.multiply(this.lastRotation.invert());
    this.lastRotation.identity();
    this.lastImpulse.set(0, 0, 0);
    camera.position.add(this.previousOrigin).sub(session.origin.position);
    this.previousOrigin.copy(session.origin.position);
    // Follow translation exactly at any speed; damping applies only to the framing offset.
    if (this.mode !== null && session.resetVersion === this.resetVersion) {
      this.movement.copy(session.position).sub(this.previousShip);
      camera.position.add(this.movement);
    }
    const offset = mode === 'cockpit' ? config.cockpitOffset : config.chaseOffset;
    this.targetPosition.fromArray(offset);
    if (mode === 'chase') {
      // Back away without lowering the hull behind the taller portrait instrument bank.
      this.targetPosition.z *= Math.max(1, config.narrowScreenAspect / camera.aspect);
    }
    this.targetPosition.applyQuaternion(session.orientation).add(session.renderPosition);
    if (
      !jump.busy &&
      (session.planetaryReadout.altitude < 250 || session.stationReadout.distance < 1000)
    ) {
      this.logicalCamera.copy(this.targetPosition).add(session.origin.position);
      const terrain = session.controller.environment?.trace(
        session.position,
        this.logicalCamera,
        1,
      );
      const station = traceStation(
        session.exploration.world,
        session.position,
        this.logicalCamera,
        1,
      );
      const fraction = Math.min(terrain ?? 1, station?.fraction ?? 1);
      if (fraction < 1)
        this.targetPosition.lerpVectors(
          session.renderPosition,
          this.targetPosition,
          Math.max(0, fraction - 0.02),
        );
    }
    const snap =
      mode === 'cockpit' || mode !== this.mode || session.resetVersion !== this.resetVersion;
    if (snap) {
      camera.position.copy(this.targetPosition);
      camera.quaternion.copy(session.orientation);
    } else {
      camera.position.lerp(this.targetPosition, 1 - Math.exp(-config.positionDamping * dt));
      camera.quaternion.slerp(session.orientation, 1 - Math.exp(-config.rotationDamping * dt));
    }
    const baseFov = mode === 'cockpit' ? config.cockpitFov : config.chaseFov;
    const targetFov =
      baseFov +
      (reducedMotion
        ? 0
        : speedFov +
          config.hyperspaceFov * kick +
          (jump.phase === 'EXITING' ? Math.max(jump.coverage, jump.intensity) : jump.coverage) * 3);
    if (!reducedMotion && jump.busy) {
      const strength = jumpRattle(jump) * config.hyperspaceVibration;
      this.right.set(1, 0, 0).applyQuaternion(session.orientation);
      this.up.set(0, 1, 0).applyQuaternion(session.orientation);
      this.back.set(0, 0, 1).applyQuaternion(session.orientation);
      this.lastImpulse.addScaledVector(this.back, jumpRecoil(jump) * config.hyperspaceRecoil[mode]);
      this.lastImpulse
        .addScaledVector(this.right, strength)
        .addScaledVector(this.up, strength * 0.55);
      const x = jumpTurbulence(jump, 0);
      const y = jumpTurbulence(jump, 1);
      const roll = jumpTurbulence(jump, 2);
      const drift = mode === 'cockpit' ? 0.035 : 0.12;
      this.lastImpulse.addScaledVector(this.right, x * drift).addScaledVector(this.up, y * drift);
      const angle = mode === 'cockpit' ? 0.001 : 0.0015;
      this.lastRotation.set(y * angle, x * angle, roll * angle * 0.7, 1).normalize();
      camera.quaternion.multiply(this.lastRotation);
      camera.position.add(this.lastImpulse);
    }
    if (!reducedMotion && !jump.busy && session.combat.simulation.impact > 0.01) {
      const strength = session.combat.simulation.impact * 0.09;
      const time = session.combat.simulation.time;
      this.right.set(1, 0, 0).applyQuaternion(session.orientation);
      this.up.set(0, 1, 0).applyQuaternion(session.orientation);
      this.lastImpulse
        .addScaledVector(this.right, Math.sin(time * 63) * strength)
        .addScaledVector(this.up, Math.sin(time * 47) * strength * 0.7);
      camera.position.add(this.lastImpulse);
    }
    const fov = snap ? targetFov : MathUtils.damp(camera.fov, targetFov, config.fovDamping, dt);
    if (Math.abs(fov - camera.fov) > 0.001) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    // Later frame callbacks project stars before Three's render-time matrix update. Publish the
    // final pose now, including this frame's origin rebase and impulses, to avoid trail jitter.
    camera.updateMatrixWorld();
    this.mode = mode;
    this.resetVersion = session.resetVersion;
    this.previousShip.copy(session.position);
    this.jumping = jump.busy;
  }
}
