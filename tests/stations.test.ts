import { describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from '@/engine/math/linear';
import { MultiplayerWorld } from '@/engine/network/MultiplayerWorld';
import { portPose, stationPose, traceStation } from '@/engine/stations/stationGeometry';
import { SYSTEMS } from '@/engine/world/systems';

function fixture(system = 'solara') {
  const world = new MultiplayerWorld(system);
  const a = world.addPlayer('a', 'Alpha'),
    b = world.addPlayer('b', 'Bravo');
  const station = world.system.definition.stations?.[0],
    operations = world.simulation.stations;
  if (!station || !operations) throw new Error('Missing station');
  const port = station.ports[0];
  if (!port) throw new Error('Missing port');
  const pose = portPose(world.system, station, port);
  const move = (id: string, point: Vector3, rotation = pose.orientation) => {
    const ship = world.simulation.ships.get(id);
    if (!ship) throw new Error('ship');
    ship.controller.relocate(point, rotation);
    ship.sync();
  };
  move(a.id, pose.approach);
  move(b.id, pose.approach.clone().add(new Vector3(80, 0, 0)));
  return { world, a, b, station, operations, port, pose, move };
}
describe('authoritative station operations', () => {
  it('defines original large orbital and compact industrial facilities', () => {
    expect(SYSTEMS.flatMap((s) => s.stations ?? [])).toHaveLength(2);
    expect(fixture().station.ports.some((p) => p.kind === 'hangar')).toBe(true);
    expect(fixture('vesper').station.type).toBe('industrial');
  });
  it('rejects distant requests, exclusively assigns ports, and releases timed-out clearances', () => {
    const f = fixture();
    f.move('a', f.pose.approach.clone().add(new Vector3(3000, 0, 0)));
    expect(f.operations.request('a', f.station.id, f.port.id)).toMatch(/2.5 km/);
    f.move('a', f.pose.approach);
    expect(f.operations.request('a', f.station.id, f.port.id)).toBeNull();
    expect(f.operations.request('b', f.station.id, f.port.id)).toMatch(/occupied/);
    f.operations.step(91);
    expect(f.operations.occupancy.size).toBe(0);
    expect(f.operations.request('b', f.station.id, f.port.id)).toBeNull();
  });
  it('validates distance, relative speed and orientation before final capture', () => {
    const f = fixture();
    f.operations.request('a', f.station.id, f.port.id);
    f.operations.step(1 / 120);
    expect(f.operations.assist('a')).toMatch(/range/);
    const near = f.pose.position.clone().add(new Vector3(0, 0, 20));
    f.move('a', near);
    f.a.ship.controller.resolveMotion(near, new Vector3(0, 0, -4));
    f.a.ship.sync();
    expect(f.operations.assist('a')).toMatch(/speed/);
    f.move('a', near, new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.3));
    expect(f.operations.assist('a')).toMatch(/Align/);
    f.move('a', near);
    expect(f.operations.assist('a')).toBeNull();
    for (let i = 0; i < 241; i++) f.operations.step(1 / 120);
    expect(f.operations.state('a').phase).toBe('docked');
    expect(f.a.ship.position.distanceTo(f.pose.position)).toBeLessThan(0.001);
    expect(f.a.ship.controller.flightLocked).toBe(true);
  });
  it('keeps damage through docking, repairs only docked ships and safely undocks', () => {
    const f = fixture();
    f.a.ship.health.hull = 40;
    f.a.ship.health.shields = 10;
    f.a.ship.heat = 0.8;
    expect(f.operations.service('a', 'repair')).toMatch(/docked/);
    f.operations.request('a', f.station.id, f.port.id);
    f.operations.step(0.01);
    f.move('a', f.pose.position.clone().add(new Vector3(0, 0, 10)));
    f.operations.assist('a');
    for (let i = 0; i < 241; i++) f.operations.step(1 / 120);
    expect(f.a.ship.health.hull).toBe(40);
    for (const service of ['repair', 'shields', 'weapons'] as const)
      expect(f.operations.service('a', service)).toBeNull();
    expect(f.a.ship.health.hull).toBe(100);
    expect(f.a.ship.health.shields).toBe(100);
    expect(f.a.ship.heat).toBe(0);
    f.move('b', f.pose.position.clone().lerp(f.pose.approach, 0.2));
    expect(f.operations.undock('a')).toMatch(/obstructed/);
    f.move('b', f.pose.approach.clone().add(new Vector3(80, 0, 0)));
    expect(f.operations.undock('a')).toBeNull();
    for (let i = 0; i < 481; i++) f.operations.step(1 / 120);
    expect(f.operations.state('a').phase).toBe('undocked');
    expect(f.operations.occupancy.size).toBe(0);
    expect(f.a.ship.controller.flightLocked).toBe(false);
    expect(f.a.ship.position.distanceTo(f.pose.position)).toBeGreaterThan(100);
    expect(f.operations.request('b', f.station.id, f.port.id)).toBeNull();
  });
  it('cleans reservations on removal, destruction and disconnect cleanup', () => {
    const f = fixture();
    f.operations.request('a', f.station.id, f.port.id);
    f.world.removePlayer('a');
    expect(f.operations.occupancy.size).toBe(0);
    f.operations.request('b', f.station.id, f.port.id);
    f.b.ship.health.hull = 0;
    f.operations.step(0.01);
    expect(f.operations.occupancy.size).toBe(0);
  });
  it('sweeps hull walls while leaving a flyable hangar opening and interior', () => {
    const f = fixture(),
      station = stationPose(f.world.system, f.station);
    const point = (x: number, y: number, z: number) =>
      station.position.clone().add(new Vector3(x, y, z));
    expect(traceStation(f.world.system, point(0, -25, 400), point(0, -25, 50), 5)).toBeNull();
    expect(
      traceStation(f.world.system, point(0, -25, 50), point(130, -25, 50), 5)?.fraction,
    ).toBeGreaterThan(0);
    expect(traceStation(f.world.system, point(0, -25, 50), point(0, -100, 50), 5)?.normal.y).toBe(
      1,
    );
    expect(traceStation(f.world.system, point(0, 20, 600), point(0, 20, -600), 5)).not.toBeNull();
  });
});

import { StationSimulation } from '@/engine/stations/StationSimulation';
import { SystemRuntime } from '@/engine/world/SystemRuntime';

it('measures approach speed in the moving station frame', () => {
  const f = fixture();
  const moving = { ...f.station, orbit: { radius: 300, period: 1200, phase: 0, inclination: 0 } };
  const system = new SystemRuntime({ ...f.world.system.definition, stations: [moving] });
  const operations = new StationSimulation(system, f.world.simulation.ships),
    pose = portPose(system, moving, f.port);
  f.move('a', pose.approach);
  f.move('b', pose.approach.clone().add(new Vector3(80, 0, 0)));
  expect(operations.request('a', moving.id, f.port.id)).toBeNull();
  operations.step(0.01);
  const point = pose.position.clone().add(new Vector3(0, 0, 20));
  f.move('a', point);
  f.a.ship.controller.resolveMotion(point, pose.velocity.clone().add(new Vector3(0, 0, 2)));
  f.a.ship.sync();
  expect(operations.assist('a')).toBeNull();
});
it('keeps a real clearance margin above the hangar floor during a slightly drifting capture', () => {
  const f = fixture();
  f.operations.request('a', f.station.id, f.port.id);
  f.operations.step(1 / 120);
  const point = f.pose.position.clone().add(new Vector3(0, 0.0002, 39));
  f.move('a', point);
  expect(f.operations.assist('a')).toBeNull();
  for (let i = 0; i < 241; i++) f.operations.step(1 / 120);
  expect(f.operations.state('a').phase).toBe('docked');
  expect(traceStation(f.world.system, f.pose.position, f.pose.position, 5.25)).toBeNull();
});

import { performGameplayAction } from '@/engine/simulation/shipActions';

it('reports successful capture, services and undocking as successful intentions', () => {
  const f = fixture(),
    act = (action: Parameters<typeof performGameplayAction>[2]) =>
      performGameplayAction(f.world.simulation, 'a', action);
  expect(act({ kind: 'dock', stationId: f.station.id, portId: f.port.id })).toBeNull();
  f.operations.step(1 / 120);
  f.move('a', f.pose.position.clone().add(new Vector3(0, 0.0002, 20)));
  expect(act({ kind: 'capture' })).toBeNull();
  for (let i = 0; i < 241; i++) f.operations.step(1 / 120);
  for (const service of ['repair', 'shields', 'weapons'] as const)
    expect(act({ kind: 'service', service })).toBeNull();
  expect(act({ kind: 'undock' })).toBeNull();
});
