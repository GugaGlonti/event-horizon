import { type EngineSoundInput, EngineSoundModel } from '@/features/flight/audio/EngineSoundModel';
import {
  type EngineAssetLoader,
  type EngineStem,
  loadEngineAssets,
} from '@/features/flight/audio/engineAssets';

type Buffers = Record<EngineStem, AudioBuffer>;
interface Voice {
  source: AudioScheduledSourceNode;
  gain: GainNode;
  nodes: AudioNode[];
}
interface Loop {
  source: AudioBufferSourceNode;
  gain: GainNode;
}
interface Machinery {
  idle: Loop;
  left: Loop;
  right: Loop;
  boost: Loop;
  jets: Loop;
}

/** Player engine adapter. Gesture unlock, cached local recordings, bounded voices and explicit fade-out. */
export class EngineAudio {
  private readonly mix: FlightAudioMix;
  private readonly ownsMix: boolean;
  private readonly loader: EngineAssetLoader;
  private readonly model = new EngineSoundModel();
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private readonly graph: AudioNode[] = [];
  private readonly voices = new Map<AudioScheduledSourceNode, Voice>();
  private request: AbortController | null = null;
  private encoded: ReturnType<EngineAssetLoader> | null = null;
  private decoded: Promise<Buffers | null> | null = null;
  private buffers: Buffers | null = null;
  private machinery: Machinery | null = null;
  private reactor: Voice | null = null;
  private winding: Voice | null = null;
  private active = false;
  private generation = 0;

  constructor(loader: EngineAssetLoader = loadEngineAssets, mix?: FlightAudioMix) {
    this.loader = loader;
    this.mix = mix ?? new FlightAudioMix();
    this.ownsMix = !mix;
  }

  get trafficBuffer() {
    return this.buffers?.turbine ?? null;
  }

  prepare() {
    if (this.encoded) return;
    const request = new AbortController();
    this.request = request;
    this.encoded = Promise.resolve().then(() => this.loader(request.signal));
    void this.encoded.catch(() => {});
  }

  /** Called by a flight/jump gesture. Fetching and decoding never resumes a context. */
  unlock() {
    try {
      this.mix.unlock();
      if (!this.mix.context || !this.mix.engine) return;
      if (!this.context) {
        const context = this.mix.context;
        this.context = context;
        this.master = context.createGain();
        this.master.gain.value = 0;
        this.filter = context.createBiquadFilter();
        this.filter.type = 'lowpass';
        this.filter.frequency.value = 3200;
        this.filter.Q.value = 0.5;
        this.master.connect(this.filter).connect(this.mix.engine);
        this.graph.push(this.master, this.filter);
      }
      this.prepare();
      this.decoded ??= this.decode(this.context);
    } catch {
      this.dispose();
    }
  }

  private async decode(context: AudioContext): Promise<Buffers | null> {
    try {
      const encoded = await this.encoded;
      if (!encoded) return null;
      const entries = await Promise.all(
        Object.entries(encoded).map(
          async ([name, bytes]) => [name, await context.decodeAudioData(bytes.slice(0))] as const,
        ),
      );
      return Object.fromEntries(entries) as Buffers;
    } catch {
      return null; // The quiet reactor/winding synthesis remains usable if samples are unavailable.
    }
  }

  private own(source: AudioScheduledSourceNode, gain: GainNode, nodes: AudioNode[] = []) {
    // Bound fading voices too, even if a suspended context delays its ended callbacks.
    if (this.voices.size >= 24) {
      const oldest = this.voices.values().next().value;
      if (oldest) {
        try {
          oldest.source.stop();
        } catch {
          /* A partial browser setup can leave a voice unstarted. */
        }
        this.disconnect(oldest);
      }
    }
    const voice = { source, gain, nodes };
    this.voices.set(source, voice);
    source.onended = () => this.disconnect(voice);
    return voice;
  }

  private disconnect(voice: Voice) {
    voice.source.onended = null;
    voice.source.disconnect();
    voice.gain.disconnect();
    for (const node of voice.nodes) node.disconnect();
    this.voices.delete(voice.source);
  }

  private oscillator(frequency: number, type: OscillatorType) {
    const context = this.context;
    if (!context || !this.master) return null;
    const source = context.createOscillator();
    source.type = type;
    source.frequency.value = frequency;
    const gain = context.createGain();
    gain.gain.value = 0;
    source.connect(gain).connect(this.master);
    const voice = this.own(source, gain);
    source.start();
    return voice;
  }

  private loop(buffer: AudioBuffer, pan = 0, offset = 0): Loop {
    if (!this.context || !this.master) throw new Error('Engine context unavailable.');
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const gain = this.context.createGain();
    const panner = this.context.createStereoPanner();
    panner.pan.value = pan;
    gain.gain.value = 0;
    source.connect(gain).connect(panner).connect(this.master);
    this.own(source, gain, [panner]);
    source.start(0, offset);
    return { source, gain };
  }

  private start() {
    this.active = true;
    this.model.reset();
    const generation = ++this.generation;
    this.reactor = this.oscillator(38, 'sine');
    this.winding = this.oscillator(140, 'sine');
    void this.decoded
      ?.then((buffers) => {
        if (!buffers || !this.active || generation !== this.generation) return;
        this.buffers = buffers;
        this.machinery = {
          idle: this.loop(buffers.idle),
          left: this.loop(buffers.turbine, -0.48),
          right: this.loop(buffers.turbine, 0.48, 0.17),
          boost: this.loop(buffers.boost),
          jets: this.loop(buffers.jets),
        };
      })
      .catch(() => {
        if (generation === this.generation) this.stop();
      });
  }

  update(input: Readonly<EngineSoundInput>, delta: number, enabled: boolean) {
    if (!enabled) {
      if (this.active) this.stop();
      return;
    }
    if (!this.context || !this.master || !this.filter) return;
    try {
      if (!this.active) this.start();
      this.model.step(input, delta);
      const { power, boost, jets, cabin, strain, pulse } = this.model;
      const time = this.context.currentTime;
      this.master.gain.setTargetAtTime(0.4 * (1 - cabin * 0.2), time, 0.06);
      this.filter.frequency.setTargetAtTime(3200 - cabin * 1800, time, 0.12);
      this.reactor?.gain.gain.setTargetAtTime(0.003 + power * 0.003, time, 0.12);
      this.winding?.gain.gain.setTargetAtTime(
        power * (this.machinery ? 0.0012 : 0.018) * (1 - cabin * 0.35),
        time,
        0.08,
      );
      if (this.winding)
        (this.winding.source as OscillatorNode).frequency.setTargetAtTime(
          140 + power * 65 + boost * 20,
          time,
          0.1,
        );
      const machinery = this.machinery;
      if (machinery) {
        machinery.idle.gain.gain.setTargetAtTime(0.07 + power * 0.018, time, 0.12);
        machinery.idle.source.playbackRate.setTargetAtTime(0.93 + power * 0.035, time, 0.15);
        machinery.left.gain.gain.setTargetAtTime(power * 0.21, time, 0.08);
        machinery.right.gain.gain.setTargetAtTime(power * 0.21, time, 0.08);
        machinery.left.source.playbackRate.setTargetAtTime(
          0.83 + power * 0.36 + boost * 0.07,
          time,
          0.08,
        );
        machinery.right.source.playbackRate.setTargetAtTime(
          0.847 + power * 0.351 + boost * 0.074,
          time,
          0.08,
        );
        machinery.boost.gain.gain.setTargetAtTime(
          boost * 0.4 * (1 - strain * (1 - pulse)),
          time,
          0.025,
        );
        machinery.boost.source.playbackRate.setTargetAtTime(
          0.88 + power * 0.14 - strain * 0.04,
          time,
          0.08,
        );
        machinery.jets.gain.gain.setTargetAtTime(jets * 0.27 * pulse, time, 0.06);
        machinery.jets.source.playbackRate.setTargetAtTime(input.braking ? 1.07 : 0.91, time, 0.08);
      }
      if (this.model.engage) this.impact('engage', 0.18);
      if (this.model.release) this.impact('release', 0.22);
    } catch {
      this.stop(); // Browser audio failure must never interrupt the flight/render loop.
    }
  }

  private impact(stem: 'engage' | 'release', level: number) {
    if (!this.context || !this.master || !this.buffers || this.voices.size >= 12) return;
    const source = this.context.createBufferSource();
    source.buffer = this.buffers[stem];
    const gain = this.context.createGain();
    gain.gain.value = level;
    source.connect(gain).connect(this.master);
    this.own(source, gain);
    source.start();
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    this.generation += 1;
    this.model.reset();
    this.machinery = null;
    this.buffers = null;
    this.reactor = this.winding = null;
    const time = this.context?.currentTime ?? 0;
    for (const voice of this.voices.values()) {
      voice.gain.gain.cancelScheduledValues(time);
      voice.gain.gain.setTargetAtTime(0, time, 0.018);
      try {
        voice.source.stop(time + 0.1);
      } catch {
        this.disconnect(voice);
      }
    }
  }

  dispose() {
    this.active = false;
    this.generation += 1;
    for (const voice of this.voices.values()) {
      try {
        voice.source.stop();
      } catch {
        /* Partially started Web Audio voice. */
      }
      this.disconnect(voice);
    }
    for (const node of this.graph) node.disconnect();
    this.graph.length = 0;
    this.request?.abort();
    this.request = null;
    this.encoded = this.decoded = null;
    this.machinery = null;
    this.buffers = null;
    this.master = this.filter = null;
    this.reactor = this.winding = null;
    this.model.reset();
    if (this.ownsMix) this.mix.dispose();
    this.context = null;
  }
}

import { FlightAudioMix } from '@/engine/audio/FlightAudioMix';
