import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { SpatialAudioProjection } from '@/features/combat/audio/SpatialAudioProjection';
import { renderWeaponTimbre, WEAPON_TIMBRES } from '@/features/combat/audio/weaponTimbres';

describe('spatial sound projection', () => {
  it('has smooth distance falloff, a finite cutoff, and bounded approach/recede pitch', () => {
    const sound = new SpatialAudioProjection(),
      zero = new Vector3(),
      rotation = new Quaternion();
    sound.project(new Vector3(0, 0, -50), zero, zero, zero, rotation, 1100);
    const near = sound.level;
    sound.project(new Vector3(0, 0, -500), new Vector3(0, 0, 300), zero, zero, rotation, 1100);
    expect(sound.level).toBeLessThan(near * 0.2);
    expect(sound.pitch).toBe(1.12);
    sound.project(new Vector3(0, 0, -500), new Vector3(0, 0, -300), zero, zero, rotation, 1100);
    expect(sound.pitch).toBe(0.88);
    sound.project(new Vector3(0, 0, -1100), zero, zero, zero, rotation, 1100);
    expect(sound.level).toBe(0);
    expect(sound.position.length()).toBe(0);
  });
  it('is independent of floating render origins and reduces brightness behind the listener', () => {
    const sound = new SpatialAudioProjection(),
      zero = new Vector3(),
      rotation = new Quaternion();
    sound.project(new Vector3(20, 0, -100), zero, zero, zero, rotation, 1100);
    const level = sound.level,
      point = sound.position.clone(),
      front = sound.cutoff;
    const offset = new Vector3(1e10, 0, 1e10);
    sound.project(point.clone().add(offset), zero, offset, zero, rotation, 1100);
    expect(sound.level).toBe(level);
    expect(sound.position.equals(point)).toBe(true);
    rotation.setFromAxisAngle(new Vector3(0, 1, 0), Math.PI);
    sound.project(point, zero, zero, zero, rotation, 1100);
    expect(sound.cutoff).toBeLessThan(front);
    expect(sound.position.z).toBeGreaterThan(0);
  });
});
describe('original weapon textures', () => {
  it.each(WEAPON_TIMBRES)('%s has a bounded, non-silent envelope with quiet ends', (kind) => {
    const samples = renderWeaponTimbre(kind, 32000);
    let peak = 0,
      energy = 0;
    for (const sample of samples) {
      peak = Math.max(peak, Math.abs(sample));
      energy += sample * sample;
    }
    expect(peak).toBeLessThanOrEqual(0.701);
    expect(Math.sqrt(energy / samples.length)).toBeGreaterThan(0.05);
    expect(Math.abs(samples[0] ?? 1)).toBe(0);
    expect(Math.abs(samples.at(-1) ?? 0)).toBeLessThan(0.001);
  });
});
