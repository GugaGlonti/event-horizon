import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import {
  HYPERSPACE_ENTRY,
  HYPERSPACE_TIMING,
  HyperspaceController,
} from '@/engine/navigation/HyperspaceController';
import { travelDirection } from '@/engine/navigation/hyperspaceRoute';
import { SystemRuntime } from '@/engine/world/SystemRuntime';
import { SYSTEMS } from '@/features/exploration/data/systems';
import { HyperspaceFlight, JUMP_MOTION } from '@/features/flight/HyperspaceFlight';

function setup() {
  const source = SYSTEMS[0],
    destination = SYSTEMS[1];
  if (!source || !destination) throw new Error('Missing fixtures.');
  const motion = new HyperspaceFlight();
  const position = new Vector3(8000, 500, 1900);
  const orientation = new Quaternion();
  motion.begin(position, orientation, travelDirection(source, destination));
  const jump = new HyperspaceController();
  jump.request(source.id, destination.id, [source.id, destination.id]);
  return { motion, jump, position, orientation, destination };
}

describe('continuous jump motion', () => {
  it('holds position while the stars stretch, then surges along the aligned route', () => {
    const { motion, jump, position, orientation } = setup();
    const launch = position.clone();
    jump.phase = 'ACCELERATING';
    jump.elapsed = HYPERSPACE_TIMING.ACCELERATING * HYPERSPACE_ENTRY.ignitionStart;
    motion.sample(jump, position, orientation);
    expect(position.distanceTo(launch)).toBeLessThan(1e-9);
    jump.elapsed =
      HYPERSPACE_TIMING.ACCELERATING *
      (HYPERSPACE_ENTRY.ignitionStart + (1 - HYPERSPACE_ENTRY.ignitionStart) * 0.6);
    motion.sample(jump, position, orientation);
    const travel = position.clone().sub(launch);
    expect(travel.length()).toBeGreaterThan(300);
    expect(travel.clone().normalize().dot(motion.direction)).toBeCloseTo(1);
  });

  it('aligns before ignition, stays continuous at entry, and bounds departure distance', () => {
    const { motion, jump, position, orientation } = setup();
    const start = position.clone();
    jump.elapsed = HYPERSPACE_TIMING.CHARGING;
    motion.sample(jump, position, orientation);
    expect(position.equals(start)).toBe(true);
    expect(new Vector3(0, 0, -1).applyQuaternion(orientation).dot(motion.direction)).toBeCloseTo(1);
    const aligned = orientation.clone();
    jump.phase = 'ACCELERATING';
    jump.elapsed = 0;
    motion.sample(jump, position, orientation);
    expect(position.equals(start)).toBe(true);
    expect(orientation.angleTo(aligned)).toBeLessThan(1e-7);
    jump.elapsed = HYPERSPACE_TIMING.ACCELERATING;
    motion.sample(jump, position, orientation);
    expect(position.distanceTo(start)).toBeCloseTo(JUMP_MOTION.departureDistance);
    const threshold = position.clone();
    jump.phase = 'HYPERSPACE';
    jump.elapsed = 1000;
    motion.sample(jump, position, orientation);
    expect(position.distanceTo(threshold)).toBeLessThan(1e-9);
  });

  it('finishes at exactly the sampled exit pose with a forward cruise derivative', () => {
    const { motion, jump, position, orientation, destination } = setup();
    motion.arrive(new SystemRuntime(destination));
    jump.phase = 'EXITING';
    jump.elapsed = HYPERSPACE_TIMING.EXITING - 0.0001;
    motion.sample(jump, position, orientation);
    const before = position.clone();
    jump.elapsed = HYPERSPACE_TIMING.EXITING;
    motion.sample(jump, position, orientation);
    expect(position.distanceTo(before) / 0.0001).toBeCloseTo(JUMP_MOTION.exitSpeed, 2);
    const lastFrame = position.clone();
    motion.finish(position, orientation);
    expect(position.distanceTo(lastFrame)).toBeLessThan(1e-9);
    expect(motion.active).toBe(false);
  });

  it('moves foreground bodies decisively at ignition and settles before revealing the arrival', () => {
    const { motion, jump, position, orientation, destination } = setup();
    const launch = position.clone();
    jump.phase = 'ACCELERATING';
    jump.elapsed = HYPERSPACE_TIMING.ACCELERATING * 0.8;
    motion.sample(jump, position, orientation);
    expect(position.distanceTo(launch)).toBeGreaterThan(1500);
    motion.arrive(new SystemRuntime(destination));
    jump.phase = 'EXITING';
    jump.elapsed = HYPERSPACE_TIMING.EXITING * 0.3;
    motion.sample(jump, position, orientation);
    const before = position.clone();
    jump.elapsed += 0.001;
    motion.sample(jump, position, orientation);
    expect(position.distanceTo(before) / 0.001).toBeLessThan(360);
  });
});
