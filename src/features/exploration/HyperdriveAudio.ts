/** Small synthesized cue, started only by the jump button's user gesture. No downloaded assets. */
export class HyperdriveAudio {
  private context: AudioContext | null = null;
  private oscillator: OscillatorNode | null = null;
  private gain: GainNode | null = null;

  start() {
    if (typeof AudioContext === 'undefined') return;
    try {
      this.stop();
      this.context ??= new AudioContext();
      void this.context.resume().catch(() => {});
      this.oscillator = this.context.createOscillator();
      this.gain = this.context.createGain();
      this.oscillator.type = 'sine';
      this.oscillator.frequency.value = 65;
      this.gain.gain.value = 0;
      this.oscillator.connect(this.gain).connect(this.context.destination);
      this.oscillator.start();
    } catch {
      this.stop();
    }
  }

  update(intensity: number, suspended: boolean) {
    if (!this.context || !this.oscillator || !this.gain) return;
    this.oscillator.frequency.setTargetAtTime(65 + intensity * 330, this.context.currentTime, 0.15);
    this.gain.gain.setTargetAtTime(
      suspended ? 0 : 0.018 + intensity * 0.025,
      this.context.currentTime,
      0.12,
    );
  }

  stop() {
    this.oscillator?.stop();
    this.oscillator?.disconnect();
    this.gain?.disconnect();
    this.oscillator = null;
    this.gain = null;
  }

  dispose() {
    this.stop();
    if (this.context) void this.context.close().catch(() => {});
    this.context = null;
  }
}
