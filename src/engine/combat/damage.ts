export interface DefenseConfig {
  readonly shields: number;
  readonly hull: number;
  readonly regeneration: number;
  readonly regenerationDelay: number;
}

/** Damage and regeneration consume simulation time only. */
export class ShipHealth {
  shields: number;
  hull: number;
  sinceDamage = 0;
  invulnerability = 0;
  readonly config: DefenseConfig;

  constructor(config: DefenseConfig) {
    this.config = config;
    this.shields = config.shields;
    this.hull = config.hull;
  }

  get destroyed() {
    return this.hull <= 0;
  }

  damage(amount: number, shieldsEnabled = true) {
    if (!Number.isFinite(amount) || amount <= 0 || this.destroyed || this.invulnerability > 0)
      return false;
    const absorbed = shieldsEnabled ? Math.min(this.shields, amount) : 0;
    this.shields -= absorbed;
    this.hull = Math.max(0, this.hull - (amount - absorbed));
    this.sinceDamage = 0;
    return true;
  }

  step(dt: number, shieldsEnabled = true, regenerationBudget = Infinity) {
    this.invulnerability = Math.max(0, this.invulnerability - dt);
    const before = this.sinceDamage;
    this.sinceDamage += dt;
    const shields = this.shields;
    if (!this.destroyed && shieldsEnabled) {
      const regenerationTime = Math.max(
        0,
        this.sinceDamage - Math.max(before, this.config.regenerationDelay),
      );
      this.shields = Math.min(
        this.config.shields,
        this.shields + Math.min(regenerationBudget, this.config.regeneration * regenerationTime),
      );
    }
    return this.shields - shields;
  }
}

/** Energy-scaled arcade damage. Slow contacts are harmless; lethal impacts stay bounded. */
export function impactDamage(closingSpeed: number, mass: number) {
  return Math.min(300, Math.max(0, closingSpeed - 12) ** 2 * mass * 0.000015);
}
