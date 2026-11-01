import { MathUtils, Quaternion, Vector3 } from 'three';
import type { AiConfig, AiState, CombatShip, Obstacle } from './combatTypes';
import { leadTime } from './targeting';

/** AI writes exactly the command shape accepted from the player; it never changes a pose. */
export class ShipAi {
  private readonly direction = new Vector3();
  private readonly relative = new Vector3();
  private readonly velocity = new Vector3();
  private readonly inverse = new Quaternion();

  step(
    ship: CombatShip,
    target: CombatShip,
    obstacles: readonly Obstacle[],
    config: AiConfig,
    dt: number,
  ) {
    const command = ship.command;
    const input = command.flight;
    input.pitch = input.yaw = input.roll = input.strafe = input.lift = input.throttle = 0;
    input.boost = input.brake = input.reverse = false;
    command.fire = false;
    if (ship.stationary || ship.health.destroyed) return;
    const distance = ship.position.distanceTo(target.position);
    ship.aiElapsed += dt;
    let next: AiState = ship.aiState;
    if (
      target.health.destroyed ||
      distance > config.disengageRange ||
      ship.position.distanceTo(ship.home) > config.disengageRange
    )
      next = 'disengage';
    else if (next === 'evade' && ship.aiElapsed < config.evadeDuration) next = 'evade';
    else if (distance < config.evadeDistance || (config.evadeOnHit && ship.hitFlash > 0.16))
      next = 'evade';
    else if (distance <= config.attackRange) next = 'attack';
    else if (distance <= config.detectionRange && next !== 'disengage') next = 'pursue';
    else if (ship.position.distanceTo(ship.home) < 160) next = 'patrol';
    if (next !== ship.aiState) {
      ship.aiState = next;
      ship.aiElapsed = 0;
    }

    this.relative.subVectors(target.position, ship.position);
    this.velocity
      .copy(target.velocity)
      .addScaledVector(ship.velocity, -ship.config.laser.velocityInheritance);
    const intercept = leadTime(
      this.relative,
      this.velocity,
      ship.config.laser.speed,
      Math.min(ship.config.laser.lifetime, ship.config.laser.range / ship.config.laser.speed),
    );
    this.direction.copy(this.relative).addScaledVector(this.velocity, intercept);
    if (next === 'patrol')
      this.direction
        .set(Math.sin(ship.aiElapsed * 0.2) * 180, 60 * Math.sin(ship.aiElapsed * 0.13), -180)
        .add(ship.home)
        .sub(ship.position);
    if (next === 'disengage') this.direction.subVectors(ship.home, ship.position);
    if (next === 'evade') {
      // Deterministic weaving, with time in the state rather than wall-clock randomness.
      this.direction.negate();
      this.direction.y += Math.sin(ship.aiElapsed * 2 + ship.home.x) * 250;
      command.flight.roll = 0.5;
    }
    let avoidance = false;
    for (const obstacle of obstacles) {
      this.relative.subVectors(ship.position, obstacle.position);
      const clearance = this.relative.length() - obstacle.radius - ship.config.radius;
      if (clearance < 90 + ship.velocity.length() * 1.2) {
        this.direction.copy(this.relative);
        avoidance = true;
        break;
      }
    }
    this.inverse.copy(ship.orientation).invert();
    this.direction.applyQuaternion(this.inverse).normalize();
    command.flight.yaw = MathUtils.clamp(
      Math.atan2(this.direction.x, -this.direction.z) * 2,
      -1,
      1,
    );
    command.flight.pitch = MathUtils.clamp(
      Math.atan2(this.direction.y, Math.hypot(this.direction.x, this.direction.z)) * 2,
      -1,
      1,
    );
    const aligned = this.direction.z < -Math.cos(config.aimTolerance);
    command.flight.throttle = next === 'attack' ? 0.45 : 0.8;
    command.flight.brake = !avoidance && next === 'attack' && distance < 220;
    command.fire = next === 'attack' && aligned && !avoidance && !target.health.destroyed;
  }
}
