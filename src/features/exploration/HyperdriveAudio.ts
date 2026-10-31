import {
  HYPERSPACE_ENTRY,
  HYPERSPACE_EXIT,
  type HyperspaceController,
  smoothRamp,
} from '@/engine/navigation/HyperspaceController';
import { HyperdriveRecordings } from './audio/HyperdriveRecordings';

/** Gesture-started recorded machinery, with a quiet synthesized bed and an asset-failure fallback. */
export class HyperdriveAudio {
  private readonly recordings = new HyperdriveRecordings();
  private context: AudioContext | null = null;
  private readonly sources: AudioScheduledSourceNode[] = [];
  private readonly nodes: AudioNode[] = [];
  private master: GainNode | null = null;
  private hum: OscillatorNode | null = null;
  private humGain: GainNode | null = null;
  private harmonic: OscillatorNode | null = null;
  private motorGain: GainNode | null = null;
  private subGain: GainNode | null = null;
  private rush: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private mechanical: BiquadFilterNode | null = null;
  private mechanicalGain: GainNode | null = null;
  private airBuffer: AudioBuffer | null = null;
  private ignited = false;
  private exited = false;

  prepare() {
    this.recordings.prepare();
  }

  start() {
    if (typeof AudioContext === 'undefined') return;
    try {
      this.stop();
      this.context ??= new AudioContext();
      const context = this.context;
      void context.resume().catch(() => {});
      this.master = context.createGain();
      this.master.gain.value = 0;
      const limiter = context.createDynamicsCompressor();
      limiter.threshold.value = -18;
      limiter.knee.value = 10;
      limiter.ratio.value = 3;
      limiter.attack.value = 0.004;
      limiter.release.value = 0.18;
      this.master.connect(limiter).connect(context.destination);
      this.hum = context.createOscillator();
      this.hum.type = 'triangle';
      this.hum.frequency.value = 48;
      this.humGain = context.createGain();
      this.humGain.gain.value = 0.022;
      this.hum.connect(this.humGain).connect(this.master);
      this.harmonic = context.createOscillator();
      this.harmonic.type = 'sawtooth';
      this.harmonic.frequency.value = 96;
      this.motorGain = context.createGain();
      this.motorGain.gain.value = 0;
      const motorFilter = context.createBiquadFilter();
      motorFilter.type = 'lowpass';
      motorFilter.frequency.value = 1400;
      this.harmonic.connect(motorFilter).connect(this.motorGain).connect(this.master);
      const sub = context.createOscillator();
      sub.frequency.value = 34;
      const subGain = context.createGain();
      this.subGain = subGain;
      subGain.gain.value = 0.022;
      sub.connect(subGain).connect(this.master);
      const buffer = context.createBuffer(2, context.sampleRate * 2, context.sampleRate);
      this.airBuffer = buffer;
      let seed = 712;
      for (let channel = 0; channel < 2; channel++) {
        const samples = buffer.getChannelData(channel);
        let previous = 0;
        for (let i = 0; i < samples.length; i += 1) {
          seed = (seed * 1664525 + 1013904223) >>> 0;
          previous = previous * 0.35 + ((seed / 4294967296) * 2 - 1) * 0.65;
          samples[i] = previous;
        }
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
      this.mechanical = context.createBiquadFilter();
      this.mechanical.type = 'bandpass';
      this.mechanical.frequency.value = 250;
      this.mechanical.Q.value = 3;
      this.mechanicalGain = context.createGain();
      this.mechanicalGain.gain.value = 0;
      noise.connect(this.mechanical).connect(this.mechanicalGain).connect(this.master);
      this.nodes.push(
        this.master,
        limiter,
        this.humGain,
        motorFilter,
        this.motorGain,
        subGain,
        this.filter,
        this.rush,
        this.mechanical,
        this.mechanicalGain,
      );
      this.sources.push(this.hum, this.harmonic, sub, noise);
      for (const source of this.sources) source.start();
      this.recordings.start(context, this.master);
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
    this.recordings.update(jump);
    const synthesized = this.recordings.ready ? 0.18 : 1;
    const charging =
      jump.phase === 'CHARGING' ||
      (jump.phase === 'ACCELERATING' && jump.progress < HYPERSPACE_ENTRY.ignitionStart);
    const chargeProgress = jump.phase === 'CHARGING' ? jump.progress : 1;
    const exiting = jump.phase === 'EXITING';
    const release = exiting ? 1 - smoothRamp(HYPERSPACE_EXIT.revealStart, 0.65, jump.progress) : 1;
    this.subGain?.gain.setTargetAtTime(0.022 * release * synthesized, time, 0.04);
    this.hum.frequency.setTargetAtTime(
      charging ? 48 + chargeProgress ** 2 * 130 : 54 + jump.intensity * 28,
      time,
      0.06,
    );
    this.humGain.gain.setTargetAtTime(
      (charging ? 0.008 + chargeProgress * 0.016 : 0.018) * release * synthesized,
      time,
      0.06,
    );
    this.harmonic?.frequency.setTargetAtTime(
      charging ? 96 + chargeProgress ** 2 * 280 : 108,
      time,
      0.05,
    );
    this.motorGain?.gain.setTargetAtTime(
      (charging ? 0.002 + chargeProgress * 0.006 : 0.001) * release * synthesized,
      time,
      0.04,
    );
    const teeth = charging ? 0.65 + Math.sin(jump.elapsed * 38) ** 4 * 0.35 : 0.3;
    this.mechanicalGain?.gain.setTargetAtTime(
      (charging ? chargeProgress ** 2 * 0.012 * teeth : 0.002) * release * synthesized,
      time,
      0.02,
    );
    this.mechanical?.frequency.setTargetAtTime(
      charging ? 250 + chargeProgress ** 3 * 1500 : 320,
      time,
      0.05,
    );
    this.rush.gain.setTargetAtTime(
      (charging ? chargeProgress ** 3 * 0.012 : 0.065 * jump.intensity) * release * synthesized,
      time,
      0.04,
    );
    this.filter.frequency.setTargetAtTime(
      charging ? 350 + chargeProgress ** 3 * 1400 : exiting ? 1600 * release + 150 : 1100,
      time,
      0.06,
    );
    if (jump.phase === 'ACCELERATING' && !charging && !this.ignited) {
      this.impact(false);
      this.ignited = true;
    }
    if (exiting && jump.progress >= HYPERSPACE_EXIT.revealStart && !this.exited) {
      this.impact(true);
      this.exited = true;
    }
  }

  private impact(exiting: boolean) {
    if (!this.context || !this.master) return;
    if (this.recordings.impact(exiting)) return;
    const time = this.context.currentTime;
    const tone = this.context.createOscillator();
    const gain = this.context.createGain();
    tone.type = 'sine';
    tone.frequency.setValueAtTime(exiting ? 85 : 210, time);
    if (exiting) tone.frequency.exponentialRampToValueAtTime(180, time + 0.045);
    tone.frequency.exponentialRampToValueAtTime(30, time + 0.28);
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(exiting ? 0.045 : 0.075, time + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.45);
    tone.connect(gain).connect(this.master);
    this.sources.push(tone);
    this.nodes.push(gain);
    tone.start(time);
    tone.stop(time + 0.5);
    if (this.airBuffer) {
      const burst = this.context.createBufferSource();
      burst.buffer = this.airBuffer;
      const band = this.context.createBiquadFilter();
      band.type = 'bandpass';
      band.Q.value = 0.7;
      band.frequency.setValueAtTime(exiting ? 2100 : 600, time);
      band.frequency.exponentialRampToValueAtTime(exiting ? 140 : 3400, time + 0.12);
      band.frequency.exponentialRampToValueAtTime(90, time + 0.4);
      const air = this.context.createGain();
      air.gain.setValueAtTime(0, time);
      air.gain.linearRampToValueAtTime(exiting ? 0.05 : 0.085, time + 0.018);
      air.gain.exponentialRampToValueAtTime(0.0001, time + (exiting ? 0.2 : 0.42));
      burst.connect(band).connect(air).connect(this.master);
      this.sources.push(burst);
      this.nodes.push(band, air);
      burst.start(time);
      burst.stop(time + 0.5);
    }
    const latch = this.context.createOscillator();
    latch.type = 'triangle';
    latch.frequency.setValueAtTime(exiting ? 320 : 620, time);
    latch.frequency.exponentialRampToValueAtTime(130, time + 0.13);
    const ring = this.context.createGain();
    ring.gain.setValueAtTime(0.009, time);
    ring.gain.exponentialRampToValueAtTime(0.0001, time + 0.15);
    latch.connect(ring).connect(this.master);
    this.sources.push(latch);
    this.nodes.push(ring);
    latch.start(time);
    latch.stop(time + 0.18);
  }

  stop() {
    this.recordings.stop();
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
    this.harmonic = null;
    this.motorGain = null;
    this.subGain = null;
    this.rush = null;
    this.filter = null;
    this.mechanical = null;
    this.mechanicalGain = null;
    this.airBuffer = null;
    this.ignited = false;
    this.exited = false;
  }

  dispose() {
    this.stop();
    this.recordings.dispose();
    if (this.context) void this.context.close().catch(() => {});
    this.context = null;
  }
}
