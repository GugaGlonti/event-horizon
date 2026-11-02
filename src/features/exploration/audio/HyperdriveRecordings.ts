import {
  HYPERSPACE_ENTRY,
  HYPERSPACE_EXIT,
  type HyperspaceController,
  smoothRamp,
} from '@/engine/navigation/HyperspaceController';
import {
  type EncodedHyperdrive,
  type HyperdriveAssetLoader,
  type HyperdriveStem,
  loadHyperdriveAssets,
} from '@/features/exploration/audio/hyperdriveAssets';

type Stems = Record<HyperdriveStem, AudioBuffer>;
interface Loop {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

/** Feature-owned recordings. Fetching/decoding never controls the journey clock. */
export class HyperdriveRecordings {
  private readonly loader: HyperdriveAssetLoader;
  private request: AbortController | null = null;
  private encoded: Promise<EncodedHyperdrive | null> | null = null;
  private decoded: Promise<Stems | null> | null = null;
  private decodeContext: AudioContext | null = null;
  private buffers: Stems | null = null;
  private context: AudioContext | null = null;
  private output: AudioNode | null = null;
  private spool: Loop | null = null;
  private transit: Loop | null = null;
  private readonly sources: AudioBufferSourceNode[] = [];
  private readonly gains: GainNode[] = [];
  private generation = 0;

  constructor(loader: HyperdriveAssetLoader = loadHyperdriveAssets) {
    this.loader = loader;
  }

  get ready() {
    return this.spool !== null && this.transit !== null;
  }

  /** Fetch ahead of the gesture, without creating or resuming an AudioContext. */
  prepare() {
    if (this.encoded) return;
    const request = new AbortController();
    this.request = request;
    this.encoded = Promise.resolve()
      .then(() => this.loader(request.signal))
      .catch(() => null); // Optional sound: the synthesized fallback stays available offline/on failure.
  }

  start(context: AudioContext, output: AudioNode) {
    this.stop();
    this.context = context;
    this.output = output;
    const generation = this.generation;
    this.prepare();
    if (!this.decoded || this.decodeContext !== context) {
      this.decodeContext = context;
      this.decoded = this.decode(context);
    }
    void this.decoded
      .then((buffers) => {
        if (!buffers || generation !== this.generation || this.context !== context) return;
        this.buffers = buffers;
        this.spool = this.loop(buffers.spool);
        this.transit = this.loop(buffers.transit);
      })
      .catch(() => {
        if (generation === this.generation) this.stop();
      });
  }

  private async decode(context: AudioContext): Promise<Stems | null> {
    try {
      const encoded = await this.encoded;
      if (!encoded) return null;
      // decodeAudioData detaches its input in some browsers. Keep encoded bytes reusable.
      const [spool, transit, entry, exit] = await Promise.all(
        [encoded.spool, encoded.transit, encoded.entry, encoded.exit].map((bytes) =>
          context.decodeAudioData(bytes.slice(0)),
        ),
      );
      return spool && transit && entry && exit ? { spool, transit, entry, exit } : null;
    } catch {
      return null;
    }
  }

  private loop(buffer: AudioBuffer): Loop | null {
    const context = this.context;
    if (!context || !this.output) return null;
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    source.loop = true;
    gain.gain.value = 0;
    source.connect(gain).connect(this.output);
    this.sources.push(source);
    this.gains.push(gain);
    source.start();
    return { source, gain };
  }

  update(jump: HyperspaceController) {
    if (!this.context || !this.spool || !this.transit) return;
    const time = this.context.currentTime;
    const charging = jump.phase === 'CHARGING';
    const accelerating = jump.phase === 'ACCELERATING';
    const charge = charging ? jump.progress : 1;
    const ignition = accelerating
      ? smoothRamp(HYPERSPACE_ENTRY.ignitionStart, HYPERSPACE_ENTRY.tunnelStart, jump.progress)
      : charging
        ? 0
        : 1;
    const release =
      jump.phase === 'EXITING'
        ? 1 - smoothRamp(HYPERSPACE_EXIT.brakingStart, HYPERSPACE_EXIT.settle, jump.progress)
        : 1;
    const active =
      charging || accelerating || jump.phase === 'HYPERSPACE' || jump.phase === 'EXITING';
    const spool = active ? (0.2 + charge * 0.66) * (1 - ignition) : 0;
    const transit = active ? (0.025 + charge * 0.045 + ignition * 0.68) * release : 0;
    this.spool.gain.gain.setTargetAtTime(spool, time, 0.045);
    this.spool.source.playbackRate.setTargetAtTime(0.58 + charge ** 2 * 0.83, time, 0.06);
    this.transit.gain.gain.setTargetAtTime(transit, time, 0.06);
    this.transit.source.playbackRate.setTargetAtTime(0.88 + jump.intensity * 0.16, time, 0.09);
  }

  /** A missed cue uses synthesis immediately; decoded assets never replay stale impacts. */
  impact(exiting: boolean) {
    if (!this.context || !this.output || !this.buffers) return false;
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = exiting ? this.buffers.exit : this.buffers.entry;
    gain.gain.value = exiting ? 0.88 : 1;
    source.connect(gain).connect(this.output);
    this.sources.push(source);
    this.gains.push(gain);
    source.start();
    return true;
  }

  stop() {
    this.generation += 1;
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        // A failed browser setup may have allocated a voice without starting it.
      }
      source.disconnect();
    }
    for (const gain of this.gains) gain.disconnect();
    this.sources.length = 0;
    this.gains.length = 0;
    this.context = null;
    this.output = null;
    this.buffers = null;
    this.spool = null;
    this.transit = null;
  }

  dispose() {
    this.stop();
    this.request?.abort();
    this.request = null;
    this.encoded = null;
    this.decoded = null;
    this.decodeContext = null;
  }
}
