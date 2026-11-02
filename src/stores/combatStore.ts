import { create } from 'zustand';
import type { AiState, WeaponSlot } from '@/engine/combat/combatTypes';

export interface TargetReadout {
  readonly id: string;
  readonly name: string;
  readonly distance: number;
  readonly shields: number;
  readonly hull: number;
  readonly state: AiState | 'practice' | 'pvp';
}
export interface CombatReadout {
  readonly shieldsEnabled: boolean;
  readonly weaponsEnabled: boolean;
  readonly weapon: WeaponSlot;
  readonly weaponCooldown: number;
  readonly weaponCharge: number;
  readonly heat: number;
  readonly overheated: boolean;
  readonly damage: number;
  readonly reinforcements: number | null;
  readonly missileLocked: boolean;
  readonly shields: number;
  readonly hull: number;
  readonly dead: boolean;
  readonly invulnerable: boolean;
  readonly hostiles: number;
  readonly kills: number;
  readonly status: string;
  readonly target: TargetReadout | null;
}
export interface CombatMarker {
  readonly x: number;
  readonly y: number;
  readonly aft: boolean;
  readonly edge: boolean;
  readonly leadX: number | null;
  readonly leadY: number | null;
}
interface CombatState {
  readout: CombatReadout;
  marker: CombatMarker | null;
  sound: boolean;
}
export const useCombatStore = create<CombatState>()(() => ({
  readout: {
    shieldsEnabled: true,
    weaponsEnabled: true,
    weapon: 1,
    weaponCooldown: 0,
    weaponCharge: 0,
    heat: 0,
    overheated: false,
    damage: 0,
    reinforcements: null,
    missileLocked: false,
    shields: 1,
    hull: 1,
    dead: false,
    invulnerable: false,
    hostiles: 0,
    kills: 0,
    status: 'B / Start patrol encounter',
    target: null,
  },
  marker: null,
  sound: true,
}));
