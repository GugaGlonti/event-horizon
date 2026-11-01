import { describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from '@/engine/math/linear';
import {
  fromTangent,
  surfaceCoordinates,
  surfaceDirection,
  tangentFrame,
  toTangent,
} from '@/engine/planetary/coordinates';
import {
  atmosphericDensity,
  gravityAcceleration,
  terrainHeight,
  terrainNormal,
} from '@/engine/planetary/terrain';
import { SYSTEMS } from '@/engine/world/systems';

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Missing fixture');
  return value;
}
const pelagos = required(SYSTEMS[0]?.bodies.find((body) => body.id === 'pelagos'));
describe('planetary scale and deterministic surface', () => {
  it('gives every world meaningful radii and slows moon orbits after scaling', () => {
    for (const system of SYSTEMS)
      for (const body of system.bodies) {
        expect(body.radius).toBeGreaterThan(25000);
        if (body.orbit) expect(body.orbit.period).toBeGreaterThan(90000);
      }
    expect(pelagos.radius).toBe(186000);
    expect(pelagos.atmosphere?.height).toBeCloseTo(14000);
    // Even at full cruise an atmospheric descent is longer than a minute.
    expect((pelagos.atmosphere?.height ?? 0) / 180).toBeGreaterThan(60);
  });
  it('round-trips surface and tangent coordinates at million-metre offsets and poles', () => {
    for (const latitude of [-Math.PI / 2, -0.6, 0, Math.PI / 2]) {
      const up = surfaceDirection(latitude, 2.1);
      expect(surfaceCoordinates(up).latitude).toBeCloseTo(latitude);
      const frame = tangentFrame(up),
        anchor = new Vector3(2e6, -3e6, 6e6);
      const point = new Vector3(4.25, 11.5, -90.125);
      expect(
        toTangent(fromTangent(point, anchor, frame), anchor, frame).distanceTo(point),
      ).toBeLessThan(1e-8);
      expect(new Vector3(0, 1, 0).applyQuaternion(frame).distanceTo(up)).toBeLessThan(1e-8);
      expect(frame.angleTo(new Quaternion().copy(frame))).toBeCloseTo(0);
    }
  });
  it('flattens only the landing zone and keeps the seeded field continuous', () => {
    const zone = required(pelagos.landingZones?.[0]);
    const direction = surfaceDirection(zone.latitude, zone.longitude);
    expect(terrainHeight(pelagos, direction)).toBe(zone.elevation);
    expect(terrainNormal(pelagos, direction).dot(direction)).toBeCloseTo(1, 4);
    const sample = surfaceDirection(0.7, -0.4);
    expect(terrainHeight(pelagos, sample)).toBe(terrainHeight(structuredClone(pelagos), sample));
    expect(
      Math.abs(
        terrainHeight(pelagos, sample) -
          terrainHeight(
            pelagos,
            sample
              .clone()
              .add(new Vector3(1e-8, 0, 0))
              .normalize(),
          ),
      ),
    ).toBeLessThan(0.1);
  });
  it('fades density and inverse-square gravity continuously', () => {
    expect(atmosphericDensity(pelagos, 0)).toBe(1);
    expect(atmosphericDensity(pelagos, 7000)).toBeGreaterThan(0);
    expect(atmosphericDensity(pelagos, 14000)).toBe(0);
    expect(atmosphericDensity(pelagos, 13999)).toBeLessThan(0.0001);
    expect(gravityAcceleration(pelagos, pelagos.radius)).toBeCloseTo(7.8);
    expect(gravityAcceleration(pelagos, pelagos.radius * 2)).toBeCloseTo(1.95);
    expect(gravityAcceleration(pelagos, required(pelagos.gravity).influenceRadius)).toBe(0);
  });
});

import { PlanetaryEnvironment, SurfaceSample } from '@/engine/planetary/PlanetaryEnvironment';
import { FLIGHT_CONFIG } from '@/engine/simulation/config';
import { FlightController } from '@/engine/simulation/FlightController';
import { createFlightInput } from '@/engine/simulation/flightTypes';
import { SystemRuntime } from '@/engine/world/SystemRuntime';

function nearSurface(altitude = 15) {
  const world = new SystemRuntime(required(SYSTEMS[0]));
  const controller = new FlightController(FLIGHT_CONFIG);
  controller.environment = new PlanetaryEnvironment(world);
  const zone = required(pelagos.landingZones?.[0]);
  const up = surfaceDirection(zone.latitude, zone.longitude);
  const center = required(world.positions.get(pelagos.id));
  const position = center.clone().addScaledVector(up, pelagos.radius + zone.elevation + altitude);
  controller.relocate(position, tangentFrame(up));
  return { controller, up, position, world };
}
describe('shared planetary flight', () => {
  it('applies gravity without assist and provides bounded hover assistance', () => {
    const a = nearSurface(2000),
      b = nearSurface(2000);
    a.controller.setAssistance(false);
    for (let i = 0; i < 120; i++) {
      a.controller.step(createFlightInput(), 1 / 120);
      b.controller.step(createFlightInput(), 1 / 120);
    }
    expect(a.controller.copyVelocity(new Vector3()).dot(a.up)).toBeLessThan(-0.05);
    expect(Math.abs(b.controller.copyVelocity(new Vector3()).dot(b.up))).toBeLessThan(
      Math.abs(a.controller.copyVelocity(new Vector3()).dot(a.up)),
    );
  });
  it('blocks high-speed terrain tunneling even when the segment exits the opposite side', () => {
    const { controller, up, position } = nearSurface(100);
    const end = position.clone().addScaledVector(up, -500000);
    const hit = controller.environment?.trace(position, end, 5);
    expect(hit).not.toBeNull();
    expect(hit ?? 1).toBeLessThan(0.001);
    const sample = new SurfaceSample();
    controller.environment?.sample(position.clone().lerp(end, hit ?? 0), sample);
    expect(sample.altitude).toBeCloseTo(5, 1);
  });
  it('lands with gear, safe speed and orientation, then physically builds takeoff thrust', () => {
    const { controller, up, position } = nearSurface(5.01);
    controller.landingGear = true;
    controller.resolveMotion(position, up.clone().multiplyScalar(-1));
    const input = createFlightInput();
    for (let i = 0; i < 150; i++) controller.step(input, 1 / 120);
    expect(controller.surface.phase).toBe('landed');
    const landed = controller.snapshot();
    controller.step({ ...input, throttle: 1, boost: true }, 1 / 120);
    expect(controller.snapshot().position).toEqual(landed.position);
    expect(controller.requestTakeoff()).toBe(true);
    controller.step(input, 0.1);
    expect(controller.snapshot().position).toEqual(landed.position);
    for (let i = 0; i < 400; i++) controller.step(input, 1 / 120);
    expect(controller.surface.phase).toBe('flying');
    expect(
      new Vector3()
        .fromArray(controller.snapshot().position)
        .sub(new Vector3().fromArray(landed.position))
        .dot(up),
    ).toBeGreaterThan(25);
  });
  it('rejects unsafe orientation as an impact, preserving flight state', () => {
    const { controller, up, position } = nearSurface(5.01);
    controller.landingGear = true;
    controller.relocate(
      position,
      new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), up.clone().negate()),
    );
    controller.resolveMotion(position, up.clone().multiplyScalar(-4));
    controller.step(createFlightInput(), 1 / 120);
    expect(controller.surface.phase).not.toBe('landing');
    expect(controller.impactSpeed).toBeGreaterThan(0);
  });
  it('restores landing state and reproduces terrain contacts after reconciliation', () => {
    const a = nearSurface(5.01),
      b = nearSurface(5.01);
    a.controller.landingGear = true;
    a.controller.resolveMotion(a.position, a.up.clone().multiplyScalar(-1));
    a.controller.step(createFlightInput(), 1 / 120);
    b.controller.restore(a.controller.snapshot());
    for (let i = 0; i < 120; i++) {
      a.controller.step(createFlightInput(), 1 / 120);
      b.controller.step(createFlightInput(), 1 / 120);
    }
    expect(b.controller.snapshot()).toEqual(a.controller.snapshot());
  });
});

import {
  buildTerrainPatch,
  cubeDirection,
  selectTerrainPatches,
} from '@/engine/planetary/terrainLod';

describe('bounded terrain quadtree', () => {
  it('increases detail during descent and respects the patch budget', () => {
    const orbit = selectTerrainPatches(pelagos, new Vector3(0, 0, pelagos.radius * 4));
    const surface = selectTerrainPatches(
      pelagos,
      new Vector3(0, 0, pelagos.radius + terrainHeight(pelagos, new Vector3(0, 0, 1)) + 10),
    );
    expect(surface.length).toBeLessThanOrEqual(150);
    expect(Math.max(...surface.map((p) => p.level))).toBeGreaterThan(
      Math.max(...orbit.map((p) => p.level)),
    );
    expect(Math.max(...surface.map((p) => p.level))).toBe(pelagos.terrain?.maxLevel);
  });
  it('shares cube-edge samples and continuous normals, with bounded local geometry', () => {
    expect(cubeDirection(0, 1, 0).distanceTo(cubeDirection(5, -1, 0))).toBeCloseTo(0);
    const a = buildTerrainPatch(pelagos, { face: 4, level: 10, x: 512, y: 512 });
    const b = buildTerrainPatch(pelagos, { face: 4, level: 10, x: 513, y: 512 });
    const resolution = pelagos.terrain?.patchResolution ?? 16,
      width = resolution + 1;
    for (let y = 0; y < width; y++) {
      const i = y * width + resolution,
        j = y * width;
      const pa = new Vector3()
        .fromArray(a.positions.subarray(i * 3, i * 3 + 3))
        .add(new Vector3().fromArray(a.anchor));
      const pb = new Vector3()
        .fromArray(b.positions.subarray(j * 3, j * 3 + 3))
        .add(new Vector3().fromArray(b.anchor));
      expect(pa.distanceTo(pb)).toBeLessThan(0.001);
      expect([...a.normals.subarray(i * 3, i * 3 + 3)]).toEqual([
        ...b.normals.subarray(j * 3, j * 3 + 3),
      ]);
    }
    expect(Math.max(...a.positions.map(Math.abs))).toBeLessThan(1000);
    expect(a.indices.length).toBe((resolution * resolution * 2 + resolution * 4 * 2) * 3);
  });
});

import { Quaternion as RenderQuaternion, Vector3 as RenderVector } from 'three';
import { bodyRotation } from '@/engine/planetary/coordinates';

it('copies analytical body rotation across renderer math without private-field coupling', () => {
  const body = { ...pelagos, rotation: { tilt: 0.3, speed: 0.0001 } };
  const engine = bodyRotation(body, 123),
    render = bodyRotation(body, 123, new RenderQuaternion());
  expect(render.toArray()).toEqual(engine.toArray());
  expect(new RenderVector(0, 1, 0).applyQuaternion(render).length()).toBeCloseTo(1);
});
it('levels deployed landing gear gradually while retaining explicit pilot pitch commands', () => {
  const { controller, position } = nearSurface(1000);
  controller.relocate(position, new Quaternion());
  controller.landingGear = true;
  const initial = controller.snapshot().orientation;
  for (let i = 0; i < 600; i++) controller.step(createFlightInput(), 1 / 120);
  expect(controller.snapshot().orientation).not.toEqual(initial);
  const telemetry = planetaryTelemetry(controller);
  expect(telemetry.guidance).toBe('Landing envelope safe');
  controller.step({ ...createFlightInput(), pitch: 1 }, 1 / 120);
  expect(controller.snapshot().angularVelocity[0]).toBeGreaterThan(0);
});

import { planetaryTelemetry } from '@/engine/planetary/telemetry';

it('flies continuously from orbit through a meaningful atmosphere to a safe landing', () => {
  const { controller, world } = nearSurface(22000);
  controller.landingGear = true;
  let time = 0,
    enteredAt = 0;
  const sample = new SurfaceSample();
  while (time < 450 && controller.surface.phase !== 'landed') {
    controller.environment?.sample(new Vector3().fromArray(controller.snapshot().position), sample);
    if (!enteredAt && sample.density > 0) enteredAt = time;
    const input = createFlightInput();
    input.lift = -1;
    world.update(time);
    controller.step(input, 1 / 120);
    time += 1 / 120;
  }
  expect(controller.surface.phase).toBe('landed');
  expect(enteredAt).toBeGreaterThan(60);
  expect(time - enteredAt).toBeGreaterThan(120);
  expect(time).toBeLessThan(450);
  expect(controller.impactSpeed).toBe(0);
}, 15000);

import { MultiplayerWorld } from '@/engine/network/MultiplayerWorld';

it('retains the terrain impact response after the shared sphere solver advances the ship', () => {
  const world = new MultiplayerWorld('solara'),
    pilot = world.addPlayer('impact', 'Impact');
  const zone = required(pelagos.landingZones?.[0]),
    up = surfaceDirection(zone.latitude, zone.longitude),
    center = required(world.system.positions.get(pelagos.id));
  const point = center.clone().addScaledVector(up, pelagos.radius + zone.elevation + 5.1);
  pilot.ship.controller.relocate(point, tangentFrame(up));
  pilot.ship.controller.resolveMotion(point, up.clone().multiplyScalar(-20));
  pilot.ship.sync();
  world.step();
  expect(pilot.ship.velocity.dot(up)).toBeGreaterThan(0);
  expect(pilot.ship.health.hull).toBe(100);
});
it('keeps landed position and orientation attached to a rotating reference frame', () => {
  const definition = required(SYSTEMS[0]);
  const body = { ...pelagos, rotation: { tilt: 0, speed: 0.0001 } };
  const world = new SystemRuntime({
    ...definition,
    bodies: definition.bodies.map((b) => (b.id === body.id ? body : b)),
  });
  const controller = new FlightController(FLIGHT_CONFIG);
  controller.environment = new PlanetaryEnvironment(world);
  const zone = required(body.landingZones?.[0]),
    up = surfaceDirection(zone.latitude, zone.longitude),
    center = required(world.positions.get(body.id));
  const point = center.clone().addScaledVector(up, body.radius + zone.elevation + 5.01);
  controller.relocate(point, tangentFrame(up));
  controller.landingGear = true;
  controller.surface.phase = 'landed';
  controller.surface.bodyId = body.id;
  controller.surface.anchor = up.toArray();
  controller.surface.orientation = tangentFrame(up).toArray();
  world.update(100);
  controller.step(createFlightInput(), 1 / 120);
  const rotated = up.clone().applyQuaternion(bodyRotation(body, 100));
  const state = controller.snapshot();
  expect(
    new Vector3().fromArray(state.position).sub(center).normalize().distanceTo(rotated),
  ).toBeLessThan(1e-9);
  expect(
    new Vector3(0, 1, 0)
      .applyQuaternion(new Quaternion().fromArray(state.orientation))
      .dot(rotated),
  ).toBeCloseTo(1);
});
