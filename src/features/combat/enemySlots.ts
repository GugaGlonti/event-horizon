/** Retain each hostile's presentation slot until it dies; removals cannot change other hulls. */
export function syncEnemySlots(
  slots: Array<string | null>,
  ships: ReadonlyMap<string, { readonly team: 'player' | 'hostile' }>,
) {
  for (let slot = 0; slot < slots.length; slot++) {
    const id = slots[slot];
    if (id && ships.get(id)?.team !== 'hostile') slots[slot] = null;
  }
  for (const [id, ship] of ships) {
    if (ship.team !== 'hostile' || slots.includes(id)) continue;
    const empty = slots.indexOf(null);
    if (empty < 0) break;
    slots[empty] = id;
  }
}
