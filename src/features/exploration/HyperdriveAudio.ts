import {
  type HyperspaceController,
  type JumpPhase,
  smoothRamp,
} from '@/engine/navigation/HyperspaceController';

/** Gesture-started, layered synthesis: charge, ignition, rushing corridor and exit release. */
export class HyperdriveAudio {
  private context: AudioContext | null = null;
  private readonly sources: AudioScheduledSourceNode[] = [];
  private readonly nodes: AudioNode[] = [];
  private master: GainNode | null = null;
  private hum: OscillatorNode | null = null;
  private humGain: GainNode | null = null;
  private subGain: GainNode | null = null;
  private rush: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private phase: JumpPhase = 'IDLE';

  start() {
    if (typeof AudioContext === 'undefined') return;
    try {
      this.stop();
      this.context ??= new AudioContext();
      const context = this.context;
      void context.resume().catch(() => {});
      this.master = context.createGain();
      this.master.gain.value = 0;
      this.master.connect(context.destination);
      this.hum = context.createOscillator();
      this.hum.type = 'triangle';
      this.hum.frequency.value = 48;
      this.humGain = context.createGain();
      this.humGain.gain.value = 0.022;
      this.hum.connect(this.humGain).connect(this.master);
      const sub = context.createOscillator();
      sub.frequency.value = 34;
      const subGain = context.createGain();
      this.subGain = subGain;
      subGain.gain.value = 0.022;
      sub.connect(subGain).connect(this.master);
      const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
      const samples = buffer.getChannelData(0);
      let seed = 712;
      for (let i = 0; i < samples.length; i += 1) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        samples[i] = (seed / 4294967296) * 2 - 1;
      }
      const noise = context.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      this.filter = context.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.filter.frequency.value = 500;
      this.filter.Q.value = 0.6;
      this.rush = context.createGain();
      this.rush.gain.value = 0;
      noise.connect(this.filter).connect(this.rush).connect(this.master);
      this.nodes.push(this.master, this.humGain, subGain, this.filter, this.rush);
      this.sources.push(this.hum, sub, noise);
      for (const source of this.sources) source.start();
      this.phase = 'IDLE';
    } catch {
      this.stop();
    }
  }

  update(jump: HyperspaceController, suspended: boolean) {
    if (!this.context || !this.master || !this.hum || !this.humGain || !this.rush || !this.filter)
      return;
    const time = this.context.currentTime;
    this.master.gain.setTargetAtTime(suspended ? 0 : 0.75, time, 0.04);
    if (suspended) return;
    const charging = jump.phase === 'CHARGING';
    const exiting = jump.phase === 'EXITING';
    const release = exiting ? 1 - smoothRamp(0.1, 1, jump.progress) : 1;
    this.subGain?.gain.setTargetAtTime(0.022 * release, time, 0.04);
    this.hum.frequency.setTargetAtTime(
      charging ? 48 + jump.progress ** 2 * 130 : 54 + jump.intensity * 28,
      time,
      0.06,
    );
    this.humGain.gain.setTargetAtTime(
      (charging ? 0.008 + jump.progress * 0.016 : 0.018) * release,
      time,
      0.06,
    );
    this.rush.gain.setTargetAtTime(
      (charging ? jump.progress ** 3 * 0.012 : 0.065 * jump.intensity) * release,
      time,
      0.04,
    );
    this.filter.frequency.setTargetAtTime(
      charging ? 350 + jump.progress ** 3 * 1400 : exiting ? 1600 * release + 150 : 1100,
      time,
      0.06,
    );
    if (jump.phase !== this.phase) {
      if (jump.phase === 'ACCELERATING' || jump.phase === 'EXITING')
        this.impact(jump.phase === 'EXITING');
      this.phase = jump.phase;
    }
  }

  private impact(exiting: boolean) {
    if (!this.context || !this.master) return;
    const time = this.context.currentTime;
    const tone = this.context.createOscillator();
    const gain = this.context.createGain();
    tone.type = 'sine';
    tone.frequency.setValueAtTime(exiting ? 150 : 210, time);
    tone.frequency.exponentialRampToValueAtTime(35, time + 0.28);
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(exiting ? 0.045 : 0.075, time + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.45);
    tone.connect(gain).connect(this.master);
    this.sources.push(tone);
    this.nodes.push(gain);
    tone.start(time);
    tone.stop(time + 0.5);
  }

  stop() {
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        /* A partial AudioContext setup may not have started this source. */
      }
      source.disconnect();
    }
    for (const node of this.nodes) node.disconnect();
    this.sources.length = 0;
    this.nodes.length = 0;
    this.master = null;
    this.hum = null;
    this.humGain = null;
    this.subGain = null;
    this.rush = null;
    this.filter = null;
    this.phase = 'IDLE';
  }

  dispose() {
    this.stop();
    if (this.context) void this.context.close().catch(() => {});
    this.context = null;
  }
}
