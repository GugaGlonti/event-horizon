import { describe, expect, it } from 'vitest';
import type { Position3 } from '@/engine/world/worldTypes';
import { SYSTEMS } from '@/features/exploration/data/systems';
import {
  hyperspaceLaneProgress,
  projectHyperspaceLane,
} from '@/features/exploration/hyperspaceLane';

function system(id: string, galacticPosition: Position3) {
  return { id, name: id, galacticPosition };
}

describe('live hyperspace lane projection', () => {
  it('anchors departure/arrival and reverses the route frame for every catalogue lane', () => {
    for (const source of SYSTEMS) {
      for (const destination of SYSTEMS) {
        if (source.id === destination.id) continue;
        const points = projectHyperspaceLane(source, destination, SYSTEMS);
        const reversed = projectHyperspaceLane(destination, source, SYSTEMS);
        expect(points?.find((point) => point.id === source.id)?.along).toBeCloseTo(0);
        expect(points?.find((point) => point.id === destination.id)?.along).toBeCloseTo(1);
        expect(points?.find((point) => point.id === destination.id)?.across).toBeCloseTo(0);
        for (const point of points ?? []) {
          const reverse = reversed?.find((candidate) => candidate.id === point.id);
          expect(Number.isFinite(point.along) && Number.isFinite(point.across)).toBe(true);
          expect(reverse?.along).toBeCloseTo(1 - point.along);
          expect(reverse?.across).toBeCloseTo(-point.across);
        }
      }
    }
  });

  it('uses galactic depth/altitude and handles a vertical lane without singularities', () => {
    const source = system('source', [0, 0, 0]);
    const destination = system('destination', [3, 4, 0]);
    const middle = system('middle', [1.5, 2, 5]);
    expect(projectHyperspaceLane(source, destination, [middle])?.[0]).toMatchObject({
      along: 0.5,
      across: 1,
    });
    expect(projectHyperspaceLane(source, system('up', [0, 10, 0]), [middle])?.[0]).toMatchObject({
      along: 0.2,
      across: 0.15,
    });
    expect(projectHyperspaceLane(system('up', [0, 10, 0]), source, [middle])?.[0]).toMatchObject({
      along: 0.8,
      across: -0.15,
    });
    expect(projectHyperspaceLane(source, source, [middle])).toBeNull();
  });

  it('advances only with traveled distance and stays bounded on holds and arrival', () => {
    expect(hyperspaceLaneProgress(0, 48.5)).toBe(0);
    expect(hyperspaceLaneProgress(24.25, 48.5)).toBe(0.5);
    expect(hyperspaceLaneProgress(48.5, 48.5)).toBe(1);
    expect(hyperspaceLaneProgress(49, 48.5)).toBe(1);
    expect(hyperspaceLaneProgress(-1, 48.5)).toBe(0);
    expect(hyperspaceLaneProgress(0, 0)).toBe(0);
    expect(hyperspaceLaneProgress(Number.NaN, 48.5)).toBe(0);
  });
});
