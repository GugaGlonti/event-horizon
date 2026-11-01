export interface EncounterConfig {
  readonly enemies: number;
  readonly maximumEnemies: number;
  readonly arrivalDelay: number;
  readonly respawnDelay: number;
  readonly retryDelay: number;
}

interface EncounterSlot {
  readonly id: string;
  readonly index: number;
  alive: boolean;
  spawned: boolean;
  remaining: number;
}

/** Pure simulation-time patrol scheduling. The world adapter supplies collision-safe spawns. */
export class Encounter {
  mode: 'dormant' | 'waiting' | 'patrol' | 'practice' | 'complete' = 'dormant';
  readonly slots: EncounterSlot[] = [];
  private systemId = '';
  private generation = 0;
  private arrivalRemaining = 0;

  readonly config: EncounterConfig;
  constructor(config: EncounterConfig) {
    this.config = config;
  }

  reset(systemId: string) {
    this.clear();
    this.systemId = systemId;
    this.mode = 'waiting';
    this.arrivalRemaining = this.config.arrivalDelay;
  }

  clear() {
    this.slots.length = 0;
    this.mode = 'dormant';
  }

  begin(practice: boolean, count = this.config.enemies) {
    this.slots.length = 0;
    this.mode = practice ? 'practice' : 'patrol';
    this.generation++;
    const total = practice
      ? 1
      : Math.max(
          1,
          Math.min(
            this.config.maximumEnemies,
            Number.isFinite(count) ? Math.floor(count) : this.config.enemies,
          ),
        );
    for (let index = 0; index < total; index++)
      this.slots.push({
        id: `${this.systemId}:${practice ? 'practice' : 'patrol'}-${this.generation}:${index + 1}`,
        index,
        alive: false,
        spawned: false,
        remaining: 0,
      });
  }

  advance(
    dt: number,
    ships: ReadonlyMap<string, unknown>,
    spawn: (slot: Readonly<EncounterSlot>) => boolean,
  ) {
    if (this.mode === 'waiting') {
      this.arrivalRemaining -= dt;
      if (this.arrivalRemaining > 1e-9) return;
      this.begin(false);
    }
    if (this.mode !== 'patrol' && this.mode !== 'practice') return;
    for (const slot of this.slots) {
      if (slot.alive && !ships.has(slot.id)) {
        slot.alive = false;
        slot.remaining = this.config.respawnDelay;
        if (this.mode === 'practice') {
          this.mode = 'complete';
          continue;
        }
        continue;
      }
      if (slot.alive) continue;
      slot.remaining = Math.max(0, slot.remaining - dt);
      if (slot.remaining > 1e-9) continue;
      if (spawn(slot)) {
        slot.alive = slot.spawned = true;
      } else slot.remaining = this.config.retryDelay;
    }
  }

  get nextRespawn() {
    let next: number | null = null;
    if (this.mode === 'patrol')
      for (const slot of this.slots)
        if (!slot.alive) next = Math.min(next ?? Infinity, slot.remaining);
    return next;
  }

  snapshot() {
    return {
      mode: this.mode,
      systemId: this.systemId,
      generation: this.generation,
      arrivalRemaining: this.arrivalRemaining,
      config: { ...this.config },
      slots: this.slots.map((slot) => ({ ...slot })),
    };
  }
}
