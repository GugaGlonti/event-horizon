import { MathUtils, type PerspectiveCamera, Vector3 } from 'three';
import { smoothRamp } from '@/engine/navigation/HyperspaceController';
import { jumpKick, jumpRattle, jumpRecoil } from '@/features/exploration/hyperspaceVisuals';
import { FLIGHT_CONFIG, GAME_CONFIG } from '@/features/flight/config';
import type { FlightSession } from '@/features/flight/FlightSession';
import { JUMP_MOTION } from '@/features/flight/HyperspaceFlight';
import type { CameraMode } from '@/stores/flightStore';

/** Presentation-only follow controller. It never writes to the flight controller. */
export class FlightCamera {
  private readonly targetPosition = new Vector3();
  private readonly previousOrigin = new Vector3();
  private readonly previousShip = new Vector3();
  private readonly movement = new Vector3();
  private readonly right = new Vector3();
  private readonly up = new Vector3();
  private readonly back = new Vector3();
  private readonly lastImpulse = new Vector3();
  private jumping = false;
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
    if (jump.busy && session.exploration.isSuspended) dt = 0;
    const kick = reducedMotion ? 0 : jumpKick(jump);
    camera.position.sub(this.lastImpulse);
    this.lastImpulse.set(0, 0, 0);
    camera.position.add(this.previousOrigin).sub(session.origin.position);
    this.previousOrigin.copy(session.origin.position);
    if (jump.busy && this.jumping) {
      this.movement.copy(session.position).sub(this.previousShip);
      camera.position.add(this.movement);
    }
    const offset = mode === 'cockpit' ? config.cockpitOffset : config.chaseOffset;
    this.targetPosition.fromArray(offset);
    if (mode === 'chase') {
      this.targetPosition.multiplyScalar(Math.max(1, config.narrowScreenAspect / camera.aspect));
      if (jump.phase === 'EXITING')
        this.targetPosition.z +=
          (JUMP_MOTION.exitSpeed / config.positionDamping) * smoothRamp(0.25, 1, jump.progress);
    }
    this.targetPosition.applyQuaternion(session.orientation).add(session.renderPosition);
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
        : config.speedFov *
            Math.min(
              1,
              (jump.phase === 'EXITING' ? JUMP_MOTION.exitSpeed : session.controller.speed) /
                FLIGHT_CONFIG.boostMaxSpeed,
            ) +
          config.hyperspaceFov * kick +
          jump.coverage * 3);
    if (!reducedMotion && jump.busy) {
      const strength = jumpRattle(jump) * config.hyperspaceVibration;
      this.right.set(1, 0, 0).applyQuaternion(session.orientation);
      this.up.set(0, 1, 0).applyQuaternion(session.orientation);
      this.back.set(0, 0, 1).applyQuaternion(session.orientation);
      this.lastImpulse.addScaledVector(this.back, jumpRecoil(jump) * config.hyperspaceRecoil[mode]);
      this.lastImpulse
        .addScaledVector(this.right, strength)
        .addScaledVector(this.up, strength * 0.55);
      camera.position.add(this.lastImpulse);
    }
    const fov = snap ? targetFov : MathUtils.damp(camera.fov, targetFov, config.fovDamping, dt);
    if (Math.abs(fov - camera.fov) > 0.001) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    this.mode = mode;
    this.resetVersion = session.resetVersion;
    this.previousShip.copy(session.position);
    this.jumping = jump.busy;
  }
}
