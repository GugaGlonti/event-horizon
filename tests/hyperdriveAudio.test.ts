import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HYPERSPACE_TIMING, HyperspaceController } from '@/engine/navigation/HyperspaceController';
import { HyperdriveRecordings } from '@/features/exploration/audio/HyperdriveRecordings';
import type { EncodedHyperdrive } from '@/features/exploration/audio/hyperdriveAssets';
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
  playbackRate = new Parameter();
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
  decodeAudioData = vi.fn(async (_bytes: ArrayBuffer) => ({ duration: 1 }));
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

function assetBytes(): EncodedHyperdrive {
  return {
    spool: new ArrayBuffer(1),
    transit: new ArrayBuffer(2),
    entry: new ArrayBuffer(3),
    exit: new ArrayBuffer(4),
  };
}

describe('recorded hyperdrive layers', () => {
  it('prefetches without unlocking audio, caches decoding across jumps and releases every voice', async () => {
    const loader = vi.fn(async (_signal: AbortSignal) => assetBytes());
    const recordings = new HyperdriveRecordings(loader);
    recordings.prepare();
    await vi.waitFor(() => expect(loader).toHaveBeenCalledOnce());
    expect(AudioContextStub.instances).toHaveLength(0);
    const context = new AudioContext();
    const stub = AudioContextStub.instances[0];
    if (!stub) throw new Error('Missing context.');
    recordings.start(context, context.destination);
    await vi.waitFor(() => expect(recordings.ready).toBe(true));
    expect(stub.decodeAudioData).toHaveBeenCalledTimes(4);
    expect(recordings.impact(false)).toBe(true);
    expect(recordings.impact(true)).toBe(true);
    const sources = [...stub.sources];
    recordings.stop();
    for (const source of sources) {
      expect(source.stop).toHaveBeenCalledOnce();
      expect(source.disconnect).toHaveBeenCalledOnce();
    }
    expect(recordings.impact(false)).toBe(false);
    recordings.start(context, context.destination);
    await vi.waitFor(() => expect(recordings.ready).toBe(true));
    expect(loader).toHaveBeenCalledOnce();
    expect(stub.decodeAudioData).toHaveBeenCalledTimes(4);
    recordings.dispose();
    expect(loader.mock.calls[0]?.[0].aborted).toBe(true);
  });

  it('never starts a cancelled generation when loading finishes, and never replays missed impacts', async () => {
    let finish: ((assets: EncodedHyperdrive) => void) | undefined;
    const recordings = new HyperdriveRecordings(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const context = new AudioContext();
    const stub = AudioContextStub.instances[0];
    if (!stub) throw new Error('Missing context.');
    recordings.start(context, context.destination);
    await vi.waitFor(() => expect(finish).toBeDefined());
    expect(recordings.impact(false)).toBe(false);
    recordings.stop();
    finish?.(assetBytes());
    await vi.waitFor(() => expect(stub.decodeAudioData).toHaveBeenCalledTimes(4));
    expect(recordings.ready).toBe(false);
    expect(stub.sources).toHaveLength(0);
    recordings.start(context, context.destination);
    await vi.waitFor(() => expect(recordings.ready).toBe(true));
    // Only the continuous loops start after decoding. No stale entry one-shot is queued.
    expect(stub.sources).toHaveLength(2);
    recordings.dispose();
  });

  it('invalidates pending decoding on teardown and supports a fresh Strict Mode mount', async () => {
    const recordings = new HyperdriveRecordings(async () => assetBytes());
    const context = new AudioContext();
    const stub = AudioContextStub.instances[0];
    if (!stub) throw new Error('Missing context.');
    let finish: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    stub.decodeAudioData.mockImplementation(async () => {
      await pending;
      return { duration: 1 };
    });
    recordings.start(context, context.destination);
    await vi.waitFor(() => expect(stub.decodeAudioData).toHaveBeenCalledTimes(4));
    recordings.dispose();
    finish?.();
    await Promise.resolve();
    expect(stub.sources).toHaveLength(0);
    recordings.start(context, context.destination);
    await vi.waitFor(() => expect(recordings.ready).toBe(true));
    expect(stub.sources).toHaveLength(2);
    recordings.dispose();
  });

  it('fails silently to synthesis when local fetch or browser decoding is unavailable', async () => {
    for (const decodeFails of [false, true]) {
      const recordings = new HyperdriveRecordings(async () => {
        if (!decodeFails) throw new Error('Offline');
        return assetBytes();
      });
      const context = new AudioContext();
      const stub = AudioContextStub.instances.at(-1);
      if (!stub) throw new Error('Missing context.');
      stub.decodeAudioData.mockRejectedValue(new Error('Unsupported audio'));
      recordings.start(context, context.destination);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(recordings.ready).toBe(false);
      expect(recordings.impact(false)).toBe(false);
      expect(stub.sources).toHaveLength(0);
      recordings.dispose();
    }
  });

  it('carries the charge into ignition, holds transit under the mask, then releases on reveal', async () => {
    const recordings = new HyperdriveRecordings(async () => assetBytes());
    const context = new AudioContext();
    const stub = AudioContextStub.instances[0];
    if (!stub) throw new Error('Missing context.');
    recordings.start(context, context.destination);
    await vi.waitFor(() => expect(recordings.ready).toBe(true));
    const jump = new HyperspaceController();
    jump.phase = 'CHARGING';
    jump.elapsed = HYPERSPACE_TIMING.CHARGING;
    recordings.update(jump);
    const chargeRate = stub.sources[0]?.playbackRate.setTargetAtTime.mock.lastCall?.[0];
    jump.phase = 'ACCELERATING';
    jump.elapsed = 0;
    recordings.update(jump);
    expect(stub.sources[0]?.playbackRate.setTargetAtTime.mock.lastCall?.[0]).toBe(chargeRate);
    jump.phase = 'HYPERSPACE';
    recordings.update(jump);
    const transitGain = stub.gains[1]?.gain.setTargetAtTime.mock.lastCall?.[0];
    expect(transitGain).toBeGreaterThan(0.5);
    jump.phase = 'EXITING';
    recordings.update(jump);
    expect(stub.gains[1]?.gain.setTargetAtTime.mock.lastCall?.[0]).toBe(transitGain);
    jump.elapsed = HYPERSPACE_TIMING.EXITING * 0.85;
    recordings.update(jump);
    expect(stub.gains[1]?.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 0, 0.06);
    recordings.dispose();
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('hyperdrive audio lifecycle', () => {
  it('plays recorded impacts once at visual thresholds and mutes them while a journey is held', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(16) })),
    );
    const audio = new HyperdriveAudio();
    audio.prepare();
    audio.start();
    const context = AudioContextStub.instances[0];
    if (!context) throw new Error('Audio context did not start.');
    await vi.waitFor(() => expect(context.sources).toHaveLength(6));
    const jump = new HyperspaceController();
    jump.phase = 'ACCELERATING';
    jump.elapsed = HYPERSPACE_TIMING.ACCELERATING * 0.6;
    audio.update(jump, true);
    expect(context.sources).toHaveLength(6);
    audio.update(jump, false);
    expect(context.sources).toHaveLength(7);
    audio.update(jump, false);
    expect(context.sources).toHaveLength(7);
    jump.phase = 'EXITING';
    jump.elapsed = 0;
    audio.update(jump, false);
    expect(context.sources).toHaveLength(7);
    jump.elapsed = HYPERSPACE_TIMING.EXITING * 0.15;
    audio.update(jump, true);
    expect(context.sources).toHaveLength(7);
    expect(context.gains[0]?.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 0, 0.04);
    audio.update(jump, false);
    audio.update(jump, false);
    expect(context.sources).toHaveLength(8);
    audio.dispose();
    for (const voice of context.sources) expect(voice.disconnect).toHaveBeenCalledOnce();
  });

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
