import { Quaternion, Vector3 } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FlightAudioMix } from '@/engine/audio/FlightAudioMix';
import type {
  AudioEffect,
  AudioShip,
  CombatAudioFrame,
} from '@/features/combat/audio/combatAudioTypes';
import { CombatAudio } from '@/features/combat/CombatAudio';
import { EngineAudio } from '@/features/flight/audio/EngineAudio';
import { createEngineSoundInput } from '@/features/flight/audio/EngineSoundModel';
import { ContextStub } from './helpers/audioStubs';

function ship(id: string, distance = 0): AudioShip {
  return {
    id,
    team: id === 'player' ? 'player' : 'hostile',
    position: new Vector3(0, 0, -distance),
    velocity: new Vector3(),
    orientation: new Quaternion(),
    stationary: false,
    health: { destroyed: false },
    controller: { enginePower: 0.6, isBoosting: false },
  };
}
function scene() {
  const player = ship('player');
  const ships = new Map<string, AudioShip>([[player.id, player]]),
    effects: AudioEffect[] = [];
  const frame: CombatAudioFrame = { player, ships, effects };
  return { frame, ships, effects };
}
function effect(id: number, kind = 'shot', distance = 0, team = 'player', age = 0): AudioEffect {
  return { id, kind, team, age, position: new Vector3(0, 0, -distance) };
}
beforeEach(() => {
  ContextStub.instances = [];
  vi.stubGlobal('AudioContext', ContextStub);
});
afterEach(() => vi.unstubAllGlobals());

describe('combat mix and nearby traffic', () => {
  it('shares one context with player engines and keeps the two mute paths independent', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(16) })),
    );
    const mix = new FlightAudioMix(),
      engine = new EngineAudio(undefined, mix),
      combat = new CombatAudio(mix);
    engine.unlock();
    combat.unlock();
    expect(ContextStub.instances).toHaveLength(1);
    const context = ContextStub.instances[0];
    engine.update(createEngineSoundInput(), 0.1, true);
    await vi.waitFor(() => expect(context?.sources).toHaveLength(7));
    const { frame, effects } = scene();
    effects.push(effect(1));
    combat.update(frame, true);
    const shot = context?.sources.at(-1);
    engine.stop();
    expect(shot?.stop).not.toHaveBeenCalled();
    engine.dispose();
    combat.dispose();
    expect(context?.close).not.toHaveBeenCalled();
    mix.dispose();
    expect(context?.close).toHaveBeenCalledOnce();
  });
  it('plays each cue once, ducks the engine bed, and gives the mix a smooth release', () => {
    const mix = new FlightAudioMix(),
      audio = new CombatAudio(mix);
    const { frame, effects } = scene();
    expect(ContextStub.instances).toHaveLength(0);
    audio.unlock();
    effects.push(effect(1));
    audio.update(frame, true);
    audio.update(frame, true);
    const context = ContextStub.instances[0];
    expect(context?.sources).toHaveLength(1);
    for (let tick = 0; tick < 5; tick++) mix.update(audio.activity, 1 / 60);
    expect(mix.engine?.gain.setTargetAtTime).toHaveBeenCalledWith(expect.any(Number), 0, 0.025);
    const engineGain = context?.gains[1]?.gain.setTargetAtTime.mock.lastCall?.[0];
    expect(engineGain).toBeLessThan(0.6);
    for (let tick = 0; tick < 120; tick++) mix.update(0, 1 / 60);
    expect(context?.gains[1]?.gain.setTargetAtTime.mock.lastCall?.[0]).toBeGreaterThan(0.79);
    audio.dispose();
    expect(context?.close).not.toHaveBeenCalled();
    mix.dispose();
    expect(context?.close).toHaveBeenCalledOnce();
  });

  it('selects only the nearest three moving enemies and removes culled/destroyed voices', () => {
    const audio = new CombatAudio(),
      { frame, ships } = scene();
    audio.unlock();
    for (const distance of [800, 50, 300, 100, 1300])
      ships.set(`ship-${distance}`, ship(`ship-${distance}`, distance));
    ships.set('practice', { ...ship('practice', 20), stationary: true });
    audio.update(frame, true);
    const context = ContextStub.instances[0];
    if (!context) throw new Error('Missing context.');
    expect(context.sources).toHaveLength(3);
    expect(
      context.panners.map((node) => node.positionZ.setTargetAtTime.mock.lastCall?.[0]),
    ).toEqual([-50, -100, -300]);
    ships.clear();
    ships.set(frame.player.id, frame.player);
    audio.update(frame, true);
    context.finishStopped();
    expect(context.sources.every((node) => node.disconnect.mock.calls.length === 1)).toBe(true);
    audio.dispose();
    expect(context.close).toHaveBeenCalledOnce();
  });

  it('attenuates engines with distance and pans relative to the player heading', () => {
    const audio = new CombatAudio(),
      { frame, ships } = scene();
    const near = ship('near', 60);
    ships.set(near.id, near);
    audio.unlock();
    audio.update(frame, true);
    const context = ContextStub.instances[0];
    const source = context?.sources[0];
    const gain = source?.connect.mock.lastCall?.[0]?.connect.mock.lastCall?.[0];
    const nearGain = gain?.gain.setTargetAtTime.mock.lastCall?.[0];
    ships.set('near', { ...near, position: new Vector3(0, 0, -600) });
    audio.update(frame, true);
    expect(gain?.gain.setTargetAtTime.mock.lastCall?.[0]).toBeLessThan(nearGain * 0.2);
    (frame.player.orientation as Quaternion).setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2);
    audio.update(frame, true);
    expect(context?.panners[0]?.positionX.setTargetAtTime.mock.lastCall?.[0]).toBeCloseTo(600);
    audio.stop();
    context?.finishStopped();
    expect(source?.disconnect).toHaveBeenCalledOnce();
    audio.dispose();
  });

  it('does not replay muted, old or pre-unlock shots and stops every voice on pause', () => {
    const audio = new CombatAudio(),
      { frame, effects } = scene();
    effects.push(effect(1));
    audio.update(frame, true);
    audio.unlock();
    audio.update(frame, true);
    effects.push(effect(2));
    audio.update(frame, false);
    audio.update(frame, true);
    effects.push(effect(3, 'shot', 0, 'player', 0.3));
    audio.update(frame, true);
    const context = ContextStub.instances[0];
    expect(context?.sources).toHaveLength(0);
    effects.push(effect(4, 'missile-launch'));
    audio.update(frame, true);
    expect(context?.sources).toHaveLength(1);
    audio.stop();
    context?.finishStopped();
    for (const source of context?.sources ?? []) {
      expect(source.onended).toBeNull();
      expect(source.disconnect).toHaveBeenCalledOnce();
    }
    audio.dispose();
  });

  it('bounds weapon voices, prioritizes player hits, and culls inaudible remote events', () => {
    const audio = new CombatAudio(),
      { frame, effects } = scene();
    audio.unlock();
    for (let id = 1; id <= 40; id++) effects.push(effect(id, 'shot', 90, 'hostile'));
    effects.push(effect(41, 'shield'));
    effects.push(effect(42, 'shot', 5000, 'hostile'));
    audio.update(frame, true);
    const context = ContextStub.instances[0];
    const live = context?.sources.filter((source) => source.onended !== null) ?? [];
    expect(live).toHaveLength(10);
    expect(live.some((source) => source.buffer?.duration === 0.22)).toBe(true);
    expect(audio.activity).toBe(1);
    audio.dispose();
    expect(context?.sources.every((source) => source.onended === null)).toBe(true);
  });

  it('continues gameplay without Web Audio', () => {
    vi.stubGlobal('AudioContext', undefined);
    const audio = new CombatAudio(),
      { frame } = scene();
    expect(() => {
      audio.unlock();
      audio.update(frame, true);
      audio.stop();
      audio.dispose();
    }).not.toThrow();
  });
});
