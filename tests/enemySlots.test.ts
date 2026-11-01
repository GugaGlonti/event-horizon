import { describe, expect, it } from 'vitest';
import { syncEnemySlots } from '@/features/combat/enemySlots';

describe('enemy hull slot lifetime', () => {
  it('retains surviving hulls and reuses only vacant slots', () => {
    const ships = new Map<string, { team: 'player' | 'hostile' }>([
      ['player', { team: 'player' }],
      ['a', { team: 'hostile' }],
      ['b', { team: 'hostile' }],
      ['c', { team: 'hostile' }],
    ]);
    const slots: Array<string | null> = [null, null, null];
    syncEnemySlots(slots, ships);
    expect(slots).toEqual(['a', 'b', 'c']);
    ships.delete('a');
    syncEnemySlots(slots, ships);
    expect(slots).toEqual([null, 'b', 'c']);
    ships.set('d', { team: 'hostile' });
    ships.set('overflow', { team: 'hostile' });
    syncEnemySlots(slots, ships);
    expect(slots).toEqual(['d', 'b', 'c']);
    ships.clear();
    syncEnemySlots(slots, ships);
    expect(slots).toEqual([null, null, null]);
  });
});
