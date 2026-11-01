import { describe, expect, it } from 'vitest';
import { Encounter } from '@/engine/combat/Encounter';

const config = { enemies: 3, maximumEnemies: 5, arrivalDelay: 1, respawnDelay: 2, retryDelay: 0.5 };

describe('simulation-time encounter schedule', () => {
  it('waits for active arrival time, bounds the patrol and respawns each slot with a stable identity', () => {
    const encounter = new Encounter(config);
    const ships = new Map<string, boolean>();
    const spawn = (slot: { id: string }) => {
      ships.set(slot.id, true);
      return true;
    };
    encounter.reset('solara');
    encounter.advance(0.9, ships, spawn);
    expect(ships.size).toBe(0);
    encounter.advance(0.1, ships, spawn);
    expect(ships.size).toBe(3);
    const id = [...ships.keys()][0];
    if (!id) throw new Error('Expected patrol');
    ships.delete(id);
    encounter.advance(0.1, ships, spawn);
    expect(encounter.nextRespawn).toBe(2);
    encounter.advance(1.9, ships, spawn);
    expect(ships.has(id)).toBe(false);
    encounter.advance(0.1, ships, spawn);
    expect(ships.has(id)).toBe(true);
    expect(encounter.nextRespawn).toBeNull();
    encounter.begin(false, 100);
    expect(encounter.slots).toHaveLength(5);
    expect(new Set(encounter.slots.map((slot) => slot.id)).size).toBe(5);
  });

  it('retries blocked spawns at a bounded cadence without losing a slot or duplicating live ships', () => {
    const encounter = new Encounter(config),
      ships = new Map<string, boolean>();
    encounter.reset('solara');
    encounter.begin(false, 1);
    let attempts = 0;
    const blocked = () => {
      attempts++;
      return false;
    };
    encounter.advance(0, ships, blocked);
    for (let tick = 0; tick < 49; tick++) encounter.advance(0.01, ships, blocked);
    expect(attempts).toBe(1);
    encounter.advance(0.01, ships, (slot) => {
      attempts++;
      ships.set(slot.id, true);
      return true;
    });
    encounter.advance(100, ships, blocked);
    expect(attempts).toBe(2);
    expect(ships.size).toBe(1);
  });

  it('keeps practice finite, and cancels all pending reinforcement work on departure', () => {
    const encounter = new Encounter(config),
      ships = new Map<string, boolean>();
    const spawn = (slot: { id: string }) => {
      ships.set(slot.id, true);
      return true;
    };
    encounter.reset('solara');
    encounter.begin(true);
    encounter.advance(0, ships, spawn);
    ships.clear();
    encounter.advance(0.1, ships, spawn);
    encounter.advance(100, ships, spawn);
    expect(encounter.mode).toBe('complete');
    expect(ships.size).toBe(0);
    encounter.begin(false);
    encounter.advance(0, ships, spawn);
    const oldIds = [...ships.keys()];
    ships.clear();
    encounter.advance(0.1, ships, spawn);
    encounter.clear();
    encounter.advance(100, ships, spawn);
    expect(ships.size).toBe(0);
    encounter.reset('vesper');
    encounter.advance(1, ships, spawn);
    expect([...ships.keys()].every((id) => id.startsWith('vesper:') && !oldIds.includes(id))).toBe(
      true,
    );
    expect(JSON.parse(JSON.stringify(encounter.snapshot()))).toEqual(encounter.snapshot());
  });
});
