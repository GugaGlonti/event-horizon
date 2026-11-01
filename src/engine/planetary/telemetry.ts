import { Quaternion, Vector3 } from '@/engine/math/linear';
import type { FlightController } from '@/engine/simulation/FlightController';
import { tangentFrame } from './coordinates';
import { SurfaceSample } from './PlanetaryEnvironment';

export function planetaryTelemetry(controller: FlightController) {
  const position = new Vector3(),
    orientation = new Quaternion();
  controller.copyTransform(position, orientation);
  const sample = new SurfaceSample();
  controller.environment?.sample(position, sample);
  const velocity = controller.copyVelocity(new Vector3()).sub(sample.velocity);
  const vertical = velocity.dot(sample.up);
  const ground = velocity.addScaledVector(sample.up, -vertical).length();
  const localForward = new Vector3(0, 0, -1)
    .applyQuaternion(orientation)
    .applyQuaternion(tangentFrame(sample.up).invert());
  const zone = sample.body?.landingZones?.find((p) => p.id === sample.zoneId);
  const alignment = new Vector3(0, 1, 0).applyQuaternion(orientation).dot(sample.normal);
  const safe = Boolean(
    sample.body?.landable &&
      controller.landingGear &&
      Math.abs(vertical) <= 3 &&
      ground <= 5 &&
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
    groundSpeed: ground,
    heading: ((Math.atan2(-localForward.x, -localForward.z) * 180) / Math.PI + 360) % 360,
    phase: controller.surface.phase,
    gear: controller.landingGear,
    transit: controller.transit,
    zoneId: zone?.id ?? null,
    zoneName: zone?.name ?? '',
    zoneDistance: sample.zoneDistance,
    safe,
    guidance: !sample.body?.landable
      ? 'Surface unavailable'
      : !controller.landingGear
        ? 'Deploy gear / K'
        : ground > 5
          ? 'Reduce ground speed'
          : Math.abs(vertical) > 3
            ? 'Reduce descent rate'
            : alignment < 0.96
              ? 'Level with horizon'
              : sample.normal.dot(sample.up) < 0.985
                ? 'Terrain too steep'
                : 'Landing envelope safe',
  };
}
export type PlanetaryReadout = ReturnType<typeof planetaryTelemetry>;
