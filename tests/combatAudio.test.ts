import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CombatSimulation } from '@/engine/combat/CombatSimulation';
import { createFlightInput } from '@/engine/simulation/flightTypes';
import { CombatAudio } from '@/features/combat/CombatAudio';
import { AI_CONFIG, PLAYER_SHIP } from '@/features/combat/config';

class NodeStub {
  gain = { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() };
  frequency = { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() };
  onended: (() => void) | null = null;
  connect = vi.fn();
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}
class ContextStub {
  static instances: ContextStub[] = [];
  currentTime = 0;
  state = 'running';
  destination = new NodeStub();
  voices: NodeStub[] = [];
  resume = vi.fn(async () => {});
  close = vi.fn(async () => {});
  constructor() {
    ContextStub.instances.push(this);
  }
  createGain() {
    return new NodeStub();
  }
  createOscillator() {
    const node = new NodeStub();
    this.voices.push(node);
    return node;
  }
}
beforeEach(() => {
  ContextStub.instances = [];
  vi.stubGlobal('AudioContext', ContextStub);
});
afterEach(() => vi.unstubAllGlobals());

describe('combat audio lifetime', () => {
  it('needs a gesture, plays each cue once, and disconnects every voice on pause/disposal', () => {
    const audio = new CombatAudio();
    const simulation = new CombatSimulation(PLAYER_SHIP, AI_CONFIG);
    expect(ContextStub.instances).toHaveLength(0);
    audio.unlock();
    const context = ContextStub.instances[0];
    if (!context) throw new Error('Missing audio context');
    simulation.step({ flight: createFlightInput(), fire: true }, 1 / 120);
    audio.update(simulation, true);
    audio.update(simulation, true);
    expect(context.voices).toHaveLength(1);
    audio.stop();
    for (const voice of context.voices) {
      expect(voice.disconnect).toHaveBeenCalledOnce();
      expect(voice.onended).toBeNull();
    }
    audio.dispose();
    expect(context.close).toHaveBeenCalledOnce();
    audio.unlock();
    expect(ContextStub.instances).toHaveLength(2);
    audio.dispose();
  });
  it('does not replay muted or paused shots after sound is enabled', () => {
    const audio = new CombatAudio();
    const simulation = new CombatSimulation(PLAYER_SHIP, AI_CONFIG);
    audio.unlock();
    simulation.step({ flight: createFlightInput(), fire: true }, 1 / 120);
    audio.update(simulation, false);
    audio.update(simulation, true);
    expect(ContextStub.instances[0]?.voices).toHaveLength(0);
    audio.dispose();
  });
  it.each([3, 4] as const)(
    'plays one firing cue for slot %s, independent of pellet count',
    (weapon) => {
      const audio = new CombatAudio();
      const simulation = new CombatSimulation(PLAYER_SHIP, AI_CONFIG);
      audio.unlock();
      const ticks = weapon === 3 ? 96 : 1;
      for (let tick = 0; tick < ticks; tick++) {
        simulation.step({ flight: createFlightInput(), fire: true, weapon }, 1 / 120);
        audio.update(simulation, true);
        if (tick < ticks - 1) expect(ContextStub.instances[0]?.voices).toHaveLength(0);
      }
      audio.update(simulation, true);
      expect(ContextStub.instances[0]?.voices).toHaveLength(1);
      audio.dispose();
      expect(ContextStub.instances[0]?.voices[0]?.disconnect).toHaveBeenCalledOnce();
    },
  );
  it('continues gameplay if Web Audio is unavailable', () => {
    vi.stubGlobal('AudioContext', undefined);
    const audio = new CombatAudio();
    expect(() => {
      audio.unlock();
      audio.stop();
      audio.dispose();
    }).not.toThrow();
  });
});
