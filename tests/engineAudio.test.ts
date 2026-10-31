import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EngineAudio } from '@/features/flight/audio/EngineAudio';
import { createEngineSoundInput } from '@/features/flight/audio/EngineSoundModel';
import type { EncodedEngine } from '@/features/flight/audio/engineAssets';

class Parameter {
  value = 0;
  setTargetAtTime = vi.fn();
  cancelScheduledValues = vi.fn();
}
class NodeStub {
  gain = new Parameter();
  frequency = new Parameter();
  playbackRate = new Parameter();
  pan = new Parameter();
  Q = new Parameter();
  threshold = new Parameter();
  knee = new Parameter();
  ratio = new Parameter();
  attack = new Parameter();
  release = new Parameter();
  buffer: { id: number; duration: number } | null = null;
  onended: (() => void) | null = null;
  connect = vi.fn((node: NodeStub) => node);
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}
class ContextStub {
  static instances: ContextStub[] = [];
  currentTime = 0;
  destination = new NodeStub();
  sources: NodeStub[] = [];
  filters: NodeStub[] = [];
  gains: NodeStub[] = [];
  resume = vi.fn(async () => {});
  close = vi.fn(async () => {});
  decodeAudioData = vi.fn(async (bytes: ArrayBuffer) => ({ id: bytes.byteLength, duration: 3 }));
  constructor() {
    ContextStub.instances.push(this);
  }
  createGain() {
    const node = new NodeStub();
    this.gains.push(node);
    return node;
  }
  createBiquadFilter() {
    const node = new NodeStub();
    this.filters.push(node);
    return node;
  }
  createDynamicsCompressor() {
    return new NodeStub();
  }
  createStereoPanner() {
    return new NodeStub();
  }
  createBufferSource() {
    const node = new NodeStub();
    this.sources.push(node);
    return node;
  }
  createOscillator() {
    return this.createBufferSource();
  }
  finishStopped() {
    for (const node of this.sources) if (node.stop.mock.calls.length) node.onended?.();
  }
}
const bytes = (): EncodedEngine => ({
  idle: new ArrayBuffer(1),
  turbine: new ArrayBuffer(2),
  boost: new ArrayBuffer(3),
  jets: new ArrayBuffer(4),
  engage: new ArrayBuffer(5),
  release: new ArrayBuffer(6),
});
beforeEach(() => {
  ContextStub.instances = [];
  vi.stubGlobal('AudioContext', ContextStub);
});
afterEach(() => vi.unstubAllGlobals());

describe('player engine audio lifetime', () => {
  it('requires a gesture, keeps idle quiet, reuses decoding and fades every voice on pause', async () => {
    const loader = vi.fn(async (_signal: AbortSignal) => bytes());
    const audio = new EngineAudio(loader),
      input = createEngineSoundInput();
    audio.prepare();
    audio.update(input, 0.1, true);
    expect(ContextStub.instances).toHaveLength(0);
    audio.unlock();
    const context = ContextStub.instances[0];
    if (!context) throw new Error('Missing context.');
    expect(context.sources).toHaveLength(0);
    audio.update(input, 0.1, true);
    await vi.waitFor(() => expect(context.sources).toHaveLength(7));
    audio.update(input, 0.1, true);
    // Two turbine channels stay at zero on idle; only the restrained machinery/reactor bed runs.
    expect(context.gains[4]?.gain.setTargetAtTime.mock.lastCall?.[0]).toBe(0);
    audio.stop();
    for (const source of context.sources) expect(source.stop).toHaveBeenCalledWith(0.1);
    context.finishStopped();
    for (const source of context.sources) expect(source.disconnect).toHaveBeenCalledOnce();
    audio.unlock();
    audio.update(input, 0.1, true);
    await vi.waitFor(() => expect(context.sources).toHaveLength(14));
    expect(loader).toHaveBeenCalledOnce();
    expect(context.decodeAudioData).toHaveBeenCalledTimes(6);
    audio.dispose();
    expect(context.close).toHaveBeenCalledOnce();
    expect(loader.mock.calls[0]?.[0].aborted).toBe(true);
  });

  it('fires boost/release once, blends camera acoustics and never queues paused events', async () => {
    const audio = new EngineAudio(async () => bytes()),
      input = createEngineSoundInput();
    audio.unlock();
    audio.update(input, 0.1, true);
    const context = ContextStub.instances[0];
    if (!context) throw new Error('Missing context.');
    await vi.waitFor(() => expect(context.sources).toHaveLength(7));
    input.throttle = input.requestedThrottle = 1;
    input.boosting = true;
    audio.update(input, 0.1, true);
    expect(context.sources.filter((source) => source.buffer?.id === 5)).toHaveLength(1);
    audio.update(input, 0.1, true);
    expect(context.sources).toHaveLength(8);
    input.cockpit = true;
    for (let tick = 0; tick < 20; tick++) audio.update(input, 0.1, true);
    const cutoff = context.filters[0]?.frequency.setTargetAtTime.mock.lastCall?.[0];
    expect(cutoff).toBeLessThan(1800);
    expect(cutoff).toBeGreaterThan(1600);
    input.boosting = false;
    input.requestedThrottle = 0;
    audio.update(input, 0.1, true);
    audio.update(input, 0.1, true);
    expect(context.sources.filter((source) => source.buffer?.id === 6)).toHaveLength(1);
    audio.update(input, 0.1, false);
    context.finishStopped();
    input.throttle = 0;
    audio.update(input, 0.1, true);
    await vi.waitFor(() => expect(context.sources).toHaveLength(16));
    expect(context.sources.filter((source) => source.buffer?.id === 6)).toHaveLength(1);
    audio.dispose();
  });

  it('ignores late preparation after cancellation/disposal and can mount again', async () => {
    let finish: ((value: EncodedEngine) => void) | undefined;
    const audio = new EngineAudio(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const input = createEngineSoundInput();
    audio.unlock();
    audio.update(input, 0.1, true);
    const context = ContextStub.instances[0];
    if (!context) throw new Error('Missing context.');
    await vi.waitFor(() => expect(finish).toBeDefined());
    audio.stop();
    context.finishStopped();
    finish?.(bytes());
    await vi.waitFor(() => expect(context.decodeAudioData).toHaveBeenCalledTimes(6));
    expect(context.sources).toHaveLength(2);
    expect(context.resume).toHaveBeenCalledOnce();
    audio.dispose();
    audio.unlock();
    audio.update(input, 0.1, true);
    await vi.waitFor(() => expect(ContextStub.instances).toHaveLength(2));
    audio.dispose();
  });

  it('bounds fading voices during rapid pause/resume even when ended events are delayed', async () => {
    const audio = new EngineAudio(async () => bytes()),
      input = createEngineSoundInput();
    audio.unlock();
    audio.update(input, 0.1, true);
    const context = ContextStub.instances[0];
    if (!context) throw new Error('Missing context.');
    await vi.waitFor(() => expect(context.decodeAudioData).toHaveBeenCalledTimes(6));
    for (let attempt = 0; attempt < 50; attempt++) {
      audio.update(input, 0.1, true);
      await Promise.resolve();
      await Promise.resolve();
      audio.stop();
      expect(
        context.sources.filter((source) => source.onended !== null).length,
      ).toBeLessThanOrEqual(24);
    }
    audio.dispose();
    expect(context.sources.every((source) => source.onended === null)).toBe(true);
  });

  it('keeps optional synthesis available on fetch/decode failure and tolerates missing Web Audio', async () => {
    const audio = new EngineAudio(async () => {
      throw new Error('Offline');
    });
    audio.unlock();
    audio.update(createEngineSoundInput(), 0.1, true);
    const context = ContextStub.instances[0];
    if (!context) throw new Error('Missing context.');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(context.sources).toHaveLength(2);
    audio.dispose();
    vi.stubGlobal('AudioContext', undefined);
    expect(() => {
      audio.unlock();
      audio.update(createEngineSoundInput(), 0.1, true);
      audio.stop();
      audio.dispose();
    }).not.toThrow();
  });
});
