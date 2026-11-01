import { Quaternion, Vector3 } from '@/engine/math/linear';
import type { FlightController } from '@/engine/simulation/FlightController';
import { descentEta, surfaceDescentSpeed } from './approach';
import { tangentFrame } from './coordinates';
import { SurfaceSample } from './PlanetaryEnvironment';

export function planetaryTelemetry(controller: FlightController, targetId: string | null = null) {
  const position = new Vector3(),
    orientation = new Quaternion();
  controller.copyTransform(position, orientation);
  const sample = new SurfaceSample();
  controller.environment?.sample(position, sample);
  const velocity = controller.copyVelocity(new Vector3()).sub(sample.velocity);
  const vertical = velocity.dot(sample.up);
  const ground = velocity.addScaledVector(sample.up, -vertical).length();
  const clearance = Math.max(0, sample.altitude - 5),
    downSpeed = Math.max(0, -vertical);
  const descentLimit = surfaceDescentSpeed(
    clearance,
    controller.landingGear,
    controller.planetaryConfig,
  );
  const brakingDistance = downSpeed ** 2 / (2 * controller.planetaryConfig.descentBraking);
  const localForward = new Vector3(0, 0, -1)
    .applyQuaternion(orientation)
    .applyQuaternion(tangentFrame(sample.up).invert());
  const zone = sample.body?.landingZones?.find((p) => p.id === sample.zoneId);
  const alignment = new Vector3(0, 1, 0).applyQuaternion(orientation).dot(sample.normal);
  const safe = Boolean(
    sample.body?.landable &&
      controller.landingGear &&
      Math.abs(vertical) <= controller.planetaryConfig.landingVerticalSpeed &&
      ground <= controller.planetaryConfig.landingGroundSpeed &&
      alignment >= 0.96 &&
      sample.normal.dot(sample.up) >= 0.985,
  );
  return {
    bodyId: sample.body?.id ?? null,
    bodyName: sample.body?.name ?? '',
    altitude: sample.altitude,
    density: sample.density,
    gravity: sample.gravity,
    verticalSpeed: vertical,
    descentLimit,
    brakingDistance,
    brakeNow: downSpeed > descentLimit + 8 || brakingDistance > clearance + 5,
    descentEta:
      controller.surface.phase === 'landed'
        ? 0
        : descentEta(clearance, downSpeed, controller.landingGear, controller.planetaryConfig),
    approachStage:
      clearance < 100
        ? 'FINAL APPROACH'
        : clearance < 3000
          ? 'SURFACE APPROACH'
          : clearance < (sample.body?.atmosphere?.height ?? 0)
            ? 'ATMOSPHERIC ENTRY'
            : 'ORBITAL APPROACH',
    groundSpeed: ground,
    heading: ((Math.atan2(-localForward.x, -localForward.z) * 180) / Math.PI + 360) % 360,
    phase: controller.surface.phase,
    gear: controller.landingGear,
    transit: controller.transit,
    landingAssist: controller.landingAssist,
    assistReason: targetId ? controller.landingAssistReason(targetId) : 'Select a landing zone.',
    zoneId: zone?.id ?? null,
    zoneName: zone?.name ?? '',
    zoneDistance: Math.hypot(sample.zoneDistance, sample.altitude),
    zoneGroundDistance: sample.zoneDistance,
    safe,
    guidance: !sample.body?.landable
      ? 'Surface unavailable'
      : !controller.landingGear
        ? 'Deploy gear / K'
        : ground > controller.planetaryConfig.landingGroundSpeed
          ? 'Reduce ground speed'
          : Math.abs(vertical) > controller.planetaryConfig.landingVerticalSpeed
            ? 'Reduce descent rate'
            : alignment < 0.96
              ? 'Level with horizon'
              : sample.normal.dot(sample.up) < 0.985
                ? 'Terrain too steep'
                : 'Landing envelope safe',
  };
}
export type PlanetaryReadout = ReturnType<typeof planetaryTelemetry>;
