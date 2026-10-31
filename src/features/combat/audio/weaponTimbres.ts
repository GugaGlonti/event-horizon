export const WEAPON_TIMBRES = [
  'shot',
  'missile-launch',
  'railgun-shot',
  'flak-shot',
  'shield',
  'impact',
  'explosion',
] as const;
export type WeaponTimbre = (typeof WEAPON_TIMBRES)[number];

const profiles: Record<WeaponTimbre, readonly [number, number, number, number, number]> = {
  shot: [0.18, 210, 85, 2300, 18],
  'missile-launch': [0.48, 80, 48, 1600, 7],
  'railgun-shot': [0.5, 120, 36, 2900, 11],
  'flak-shot': [0.27, 105, 44, 2200, 15],
  shield: [0.22, 290, 180, 1700, 16],
  impact: [0.23, 130, 46, 1300, 18],
  explosion: [0.8, 61, 24, 1000, 5.5],
};

/** Original, filtered pressure/crack textures; no sustained sawtooth or high-pitched alarm tones. */
export function renderWeaponTimbre(kind: WeaponTimbre, sampleRate: number) {
  const [duration, high, low, cutoff, decay] = profiles[kind];
  const samples = new Float32Array(Math.ceil(duration * sampleRate));
  let seed = 712 + WEAPON_TIMBRES.indexOf(kind) * 2971,
    filtered = 0,
    phase = 0,
    peak = 0,
    energy = 0;
  const coefficient = 1 - Math.exp((-2 * Math.PI * cutoff) / sampleRate);
  for (let index = 0; index < samples.length; index++) {
    const time = index / sampleRate;
    seed = (seed * 1664525 + 1013904223) >>> 0;
    filtered += coefficient * ((seed / 4294967296) * 2 - 1 - filtered);
    phase += (2 * Math.PI * (low + (high - low) * Math.exp(-time * 28))) / sampleRate;
    const attack = Math.min(1, time / (kind === 'explosion' ? 0.012 : 0.004));
    const tail = Math.min(1, (duration - time) / 0.045);
    const body = Math.sin(phase) * 0.24 + Math.sin(phase * 1.93) * 0.045;
    const pressure = filtered * (kind === 'missile-launch' || kind === 'explosion' ? 0.75 : 0.45);
    const value = Math.tanh((body + pressure) * 1.4) * attack * tail * Math.exp(-time * decay);
    samples[index] = value;
    peak = Math.max(peak, Math.abs(value));
    energy += value * value;
  }
  const gain = Math.min(0.11 / Math.sqrt(energy / samples.length), 0.7 / peak);
  for (let index = 0; index < samples.length; index++)
    samples[index] = (samples[index] ?? 0) * gain;
  return samples;
}

export function renderTrafficTexture(sampleRate: number) {
  const samples = new Float32Array(sampleRate * 2);
  let seed = 1981,
    low = 0;
  for (let index = 0; index < samples.length; index++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    low += 0.06 * ((seed / 4294967296) * 2 - 1 - low);
    samples[index] = low * 0.8;
  }
  // Join the pressure texture without an extra impulse at the loop boundary.
  const blend = Math.round(sampleRate * 0.08);
  for (let index = 0; index < blend; index++) {
    const position = samples.length - blend + index,
      t = index / (blend - 1);
    samples[position] = (samples[position] ?? 0) * (1 - t) + (samples[0] ?? 0) * t;
  }
  return samples;
}
