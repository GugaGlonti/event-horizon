import { MathUtils, type PerspectiveCamera, Vector3 } from 'three';
import { FLIGHT_CONFIG, GAME_CONFIG } from '@/features/flight/config';
import type { FlightSession } from '@/features/flight/FlightSession';
import type { CameraMode } from '@/stores/flightStore';

/** Presentation-only follow controller. It never writes to the flight controller. */
export class FlightCamera {
  private readonly targetPosition = new Vector3();
  private readonly previousOrigin = new Vector3();
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
    camera.position.add(this.previousOrigin).sub(session.origin.position);
    this.previousOrigin.copy(session.origin.position);
    const offset = mode === 'cockpit' ? config.cockpitOffset : config.chaseOffset;
    this.targetPosition.fromArray(offset);
    if (mode === 'chase') {
      this.targetPosition.multiplyScalar(Math.max(1, config.narrowScreenAspect / camera.aspect));
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
        : config.speedFov * Math.min(1, session.controller.speed / FLIGHT_CONFIG.boostMaxSpeed) +
          config.hyperspaceFov * session.exploration.jump.intensity);
    if (!reducedMotion && session.exploration.jump.busy) {
      const strength = session.exploration.jump.intensity * config.hyperspaceVibration;
      camera.position.x += Math.sin(session.exploration.world.time * 53) * strength;
      camera.position.y += Math.cos(session.exploration.world.time * 47) * strength;
    }
    const fov = snap ? targetFov : MathUtils.damp(camera.fov, targetFov, config.fovDamping, dt);
    if (Math.abs(fov - camera.fov) > 0.001) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    this.mode = mode;
    this.resetVersion = session.resetVersion;
  }
}
