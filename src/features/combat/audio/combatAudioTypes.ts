import type { Quaternion, Vector3 } from 'three';

/** Read-only audio projection, structurally supplied by the combat simulation at composition. */
export interface AudioShip {
  readonly id: string;
  readonly team: string;
  readonly position: Readonly<Vector3>;
  readonly velocity: Readonly<Vector3>;
  readonly orientation: Readonly<Quaternion>;
  readonly stationary: boolean;
  readonly health: { readonly destroyed: boolean };
  readonly controller: { readonly enginePower: number; readonly isBoosting: boolean };
}
export interface AudioEffect {
  readonly id: number;
  readonly kind: string;
  readonly team: string;
  readonly position: Readonly<Vector3>;
  readonly age: number;
}
export interface CombatAudioFrame {
  readonly player: AudioShip;
  readonly ships: ReadonlyMap<string, AudioShip>;
  readonly effects: readonly AudioEffect[];
}
