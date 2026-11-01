import { Quaternion, Vector3 } from '@/engine/math/linear';
import { sweepSphere } from '@/engine/physics/spheres';
import type { SystemRuntime } from '@/engine/world/SystemRuntime';
import type { CelestialDefinition } from '@/engine/world/worldTypes';
import { bodyRotation, surfaceDirection } from './coordinates';
import { atmosphericDensity, gravityAcceleration, terrainHeight, terrainNormal } from './terrain';

export class SurfaceSample {
  body: CelestialDefinition | null = null;
  readonly up = new Vector3(0, 1, 0);
  readonly normal = new Vector3(0, 1, 0);
  readonly local = new Vector3();
  readonly center = new Vector3();
  readonly velocity = new Vector3();
  readonly acceleration = new Vector3();
  readonly rotation = new Quaternion();
  altitude = Infinity;
  density = 0;
  gravity = 0;
  zoneId: string | null = null;
  zoneDistance = Infinity;
}
/** Lightweight analytical authority. It never builds or inspects rendered terrain patches. */
export class PlanetaryEnvironment {
  readonly world: SystemRuntime;
  constructor(world: SystemRuntime) {
    this.world = world;
  }
  sample(position: Readonly<Vector3>, out: SurfaceSample) {
    out.body = null;
    out.altitude = Infinity;
    out.density = out.gravity = 0;
    out.acceleration.set(0, 0, 0);
    out.zoneId = null;
    out.zoneDistance = Infinity;
    let nearest = Infinity;
    for (const body of this.world.definition.bodies) {
      if (!body.gravity) continue;
      const center = this.world.positions.get(body.id);
      if (!center) continue;
      const distance = position.distanceTo(center);
      const gravity = gravityAcceleration(body, distance);
      if (gravity > 0)
        out.acceleration.addScaledVector(
          new Vector3().subVectors(center, position),
          gravity / Math.max(1, distance),
        );
      if (distance - body.radius >= nearest) continue;
      nearest = distance - body.radius;
      out.body = body;
      out.center.copy(center);
    }
    const body = out.body;
    if (!body) return out;
    out.up.subVectors(position, out.center).normalize();
    bodyRotation(body, this.world.time, out.rotation);
    out.local.copy(out.up).applyQuaternion(new Quaternion().copy(out.rotation).invert());
    out.altitude = position.distanceTo(out.center) - body.radius - terrainHeight(body, out.local);
    out.gravity = out.acceleration.length();
    out.density = atmosphericDensity(body, out.altitude);
    if (body.terrain && out.altitude < 2000)
      terrainNormal(body, out.local, out.normal).applyQuaternion(out.rotation);
    else out.normal.copy(out.up);
    // Analytical axial velocity. Parent translation does not inherit axial spin.
    const axis = new Vector3(0, 1, 0).applyQuaternion(
      new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), body.rotation.tilt),
    );
    out.velocity
      .crossVectors(axis, new Vector3().subVectors(position, out.center))
      .multiplyScalar(body.rotation.speed);
    if (body.orbit) {
      const orbit = body.orbit;
      const angle = orbit.phase + (this.world.time * Math.PI * 2) / orbit.period;
      const rate = (orbit.radius * Math.PI * 2) / orbit.period;
      out.velocity.add(
        new Vector3(
          -Math.sin(angle) * rate,
          Math.cos(angle) * rate * Math.sin(orbit.inclination),
          Math.cos(angle) * rate * Math.cos(orbit.inclination),
        ),
      );
    }
    for (const zone of body.landingZones ?? []) {
      const distance =
        surfaceDirection(zone.latitude, zone.longitude).distanceTo(out.local) * body.radius;
      if (distance < out.zoneDistance) {
        out.zoneDistance = distance;
        out.zoneId = zone.id;
      }
    }
    return out;
  }
  /** Conservative advancement over a height field with a configured slope bound. */
  trace(start: Readonly<Vector3>, end: Readonly<Vector3>, radius: number) {
    let earliest: number | null = null;
    const direction = new Vector3(),
      point = new Vector3(),
      inverse = new Quaternion();
    for (const body of this.world.definition.bodies) {
      if (!body.terrain) continue;
      const center = this.world.positions.get(body.id);
      if (!center) continue;
      direction.subVectors(end, start);
      const length = direction.length();
      if (!length) continue;
      const broad = sweepSphere(
        start.x - center.x,
        start.y - center.y,
        start.z - center.z,
        direction.x,
        direction.y,
        direction.z,
        body.radius + body.terrain.relief + radius,
      );
      if (broad === null) continue;
      bodyRotation(body, this.world.time, inverse).invert();
      const slopeBound =
        1 + (6 * body.terrain.relief * body.terrain.frequency * body.terrain.octaves) / body.radius;
      let t = broad;
      for (let iteration = 0; iteration < 128 && t <= (earliest ?? 1); iteration++) {
        point.copy(start).addScaledVector(direction, t).sub(center);
        const distance = point.length();
        point.divideScalar(distance || 1).applyQuaternion(inverse);
        const clearance = distance - body.radius - terrainHeight(body, point) - radius;
        if (clearance <= 0.002) {
          earliest = t;
          break;
        }
        t += Math.max(1e-8, clearance / (length * slopeBound));
      }
    }
    return earliest;
  }
}
