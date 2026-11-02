import type { CombatSimulation } from '@/engine/combat/CombatSimulation';
import { portPose, stationPose } from './stationGeometry';
import { createDockingState } from './stationTypes';
export function stationTelemetry(
  simulation: CombatSimulation,
  id: string,
  targetId: string | null,
) {
  const ship = simulation.ships.get(id),
    operations = simulation.stations;
  const state = operations?.state(id) ?? createDockingState();
  let station = operations?.world.definition.stations?.find(
    (s) => s.id === (state.stationId ?? targetId),
  );
  if (!station && ship && operations) {
    let nearest = Infinity;
    for (const candidate of operations.world.definition.stations ?? []) {
      const distance = stationPose(operations.world, candidate).position.distanceTo(ship.position);
      if (distance < nearest) {
        nearest = distance;
        station = candidate;
      }
    }
  }
  const port = station?.ports.find((p) => p.id === state.portId);
  const pose = operations && station && port ? portPose(operations.world, station, port) : null;
  const distance =
    ship && station && operations
      ? stationPose(operations.world, station).position.distanceTo(ship.position)
      : Infinity;
  return {
    phase: state.phase,
    stationId: station?.id ?? null,
    stationName: station?.name ?? '',
    portId: port?.id ?? null,
    portName: port?.name ?? '',
    distance,
    captureDistance: ship && pose ? ship.position.distanceTo(pose.position) : Infinity,
    approachDistance: ship && pose ? ship.position.distanceTo(pose.approach) : Infinity,
    alignment: ship && pose ? (ship.orientation.angleTo(pose.orientation) * 180) / Math.PI : 180,
    speed: ship
      ? pose
        ? ship.velocity.clone().sub(pose.velocity).length()
        : ship.velocity.length()
      : 0,
    ports:
      station?.ports.map((p) => ({
        id: p.id,
        name: p.name,
        kind: p.kind,
        occupant: operations?.occupancy.get(`${station.id}/${p.id}`) ?? null,
        approachDistance:
          ship && operations
            ? ship.position.distanceTo(portPose(operations.world, station, p).approach)
            : Infinity,
      })) ?? [],
    services: station?.services ?? [],
    waypoint: pose
      ? (state.phase === 'approaching' ? pose.approach : pose.position).toArray()
      : null,
  };
}
export type StationReadout = ReturnType<typeof stationTelemetry>;
