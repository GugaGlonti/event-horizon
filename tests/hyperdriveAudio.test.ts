import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HYPERSPACE_TIMING, HyperspaceController } from '@/engine/navigation/HyperspaceController';
import { HyperdriveAudio } from '@/features/exploration/HyperdriveAudio';

class Parameter {
  value = 0;
  setTargetAtTime = vi.fn();
  setValueAtTime = vi.fn();
  linearRampToValueAtTime = vi.fn();
  exponentialRampToValueAtTime = vi.fn();
}

class AudioNodeStub {
  gain = new Parameter();
  frequency = new Parameter();
  Q = new Parameter();
  threshold = new Parameter();
  knee = new Parameter();
  ratio = new Parameter();
  attack = new Parameter();
  release = new Parameter();
  connect = vi.fn((node: AudioNodeStub) => node);
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}

class AudioContextStub {
  static instances: AudioContextStub[] = [];
  currentTime = 0;
  sampleRate = 32;
  destination = new AudioNodeStub();
  sources: AudioNodeStub[] = [];
  gains: AudioNodeStub[] = [];
  resume = vi.fn(async () => {});
  close = vi.fn(async () => {});
  constructor() {
    AudioContextStub.instances.push(this);
  }
  createGain() {
    const node = new AudioNodeStub();
    this.gains.push(node);
    return node;
  }
  createOscillator() {
    const node = new AudioNodeStub();
    this.sources.push(node);
    return node;
  }
  createBufferSource() {
    return this.createOscillator();
  }
  createBiquadFilter() {
    return new AudioNodeStub();
  }
  createDynamicsCompressor() {
    return new AudioNodeStub();
  }
  createBuffer(channels: number, length: number) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { getChannelData: (index: number) => data[index] };
  }
}

beforeEach(() => {
  AudioContextStub.instances = [];
  vi.stubGlobal('AudioContext', AudioContextStub);
});
afterEach(() => vi.unstubAllGlobals());

describe('hyperdrive audio lifecycle', () => {
  it('fires ignition once and waits for the arrival reveal before firing the exit cue', () => {
    const audio = new HyperdriveAudio();
    audio.start();
    const context = AudioContextStub.instances[0];
    if (!context) throw new Error('Audio context did not start.');
    const continuousVoices = context.sources.length;
    const jump = new HyperspaceController();
    jump.phase = 'ACCELERATING';
    jump.elapsed = HYPERSPACE_TIMING.ACCELERATING * 0.6;
    audio.update(jump, false);
    const afterIgnition = context.sources.length;
    expect(afterIgnition).toBeGreaterThan(continuousVoices);
    audio.update(jump, false);
    expect(context.sources).toHaveLength(afterIgnition);
    jump.phase = 'EXITING';
    jump.elapsed = 0;
    audio.update(jump, false);
    expect(context.sources).toHaveLength(afterIgnition);
    jump.elapsed = HYPERSPACE_TIMING.EXITING * 0.15;
    audio.update(jump, true);
    expect(context.sources).toHaveLength(afterIgnition);
    expect(context.gains[0]?.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 0, 0.04);
    audio.update(jump, false);
    const afterExit = context.sources.length;
    expect(afterExit).toBeGreaterThan(afterIgnition);
    audio.update(jump, false);
    expect(context.sources).toHaveLength(afterExit);
    audio.dispose();
  });

  it('disconnects every voice on abort, reuses the context, and closes it on disposal', () => {
    const audio = new HyperdriveAudio();
    audio.start();
    const context = AudioContextStub.instances[0];
    if (!context) throw new Error('Audio context did not start.');
    const oldVoices = [...context.sources];
    audio.stop();
    for (const voice of oldVoices) {
      expect(voice.stop).toHaveBeenCalled();
      expect(voice.disconnect).toHaveBeenCalled();
    }
    audio.update(new HyperspaceController(), false);
    expect(context.sources).toHaveLength(oldVoices.length);
    audio.start();
    expect(AudioContextStub.instances).toHaveLength(1);
    expect(context.sources.length).toBeGreaterThan(oldVoices.length);
    audio.dispose();
    expect(context.close).toHaveBeenCalledOnce();
  });
});
