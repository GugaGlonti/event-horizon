/** One context and headroom budget for normal-flight engines, weapons and nearby traffic. */
export class FlightAudioMix {
  context: AudioContext | null = null;
  engine: GainNode | null = null;
  weapons: GainNode | null = null;
  traffic: GainNode | null = null;
  private readonly nodes: AudioNode[] = [];
  private activity = 0;

  unlock() {
    if (typeof AudioContext === 'undefined') return;
    try {
      if (!this.context) {
        const context = new AudioContext();
        this.context = context;
        const master = context.createGain();
        master.gain.value = 0.82;
        const highpass = context.createBiquadFilter();
        highpass.type = 'highpass';
        highpass.frequency.value = 28;
        highpass.Q.value = 0.5;
        const compressor = context.createDynamicsCompressor();
        compressor.threshold.value = -12;
        compressor.knee.value = 12;
        compressor.ratio.value = 4;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.18;
        master.connect(highpass).connect(compressor).connect(context.destination);
        this.engine = context.createGain();
        this.weapons = context.createGain();
        this.traffic = context.createGain();
        this.engine.gain.value = 0.8;
        this.weapons.gain.value = 0.75;
        this.traffic.gain.value = 0.65;
        for (const channel of [this.engine, this.weapons, this.traffic]) channel.connect(master);
        this.nodes.push(this.engine, this.weapons, this.traffic, master, highpass, compressor);
      }
      void this.context.resume().catch(() => {});
    } catch {
      this.dispose();
    }
  }

  /** Called once per presentation frame; fast attack and a slower release preserve cue clarity. */
  update(combatActivity: number, delta: number) {
    if (!this.context) return;
    const dt = Number.isFinite(delta) ? Math.max(0, Math.min(delta, 0.1)) : 0;
    const target = Number.isFinite(combatActivity) ? Math.max(0, Math.min(combatActivity, 1)) : 0;
    const response = target > this.activity ? 0.018 : 0.24;
    this.activity += (target - this.activity) * (1 - Math.exp(-dt / response));
    this.engine?.gain.setTargetAtTime(0.8 - this.activity * 0.38, this.context.currentTime, 0.025);
    this.traffic?.gain.setTargetAtTime(0.65 - this.activity * 0.4, this.context.currentTime, 0.025);
  }

  dispose() {
    for (const node of this.nodes) node.disconnect();
    this.nodes.length = 0;
    void this.context?.close().catch(() => {});
    this.context = null;
    this.engine = this.weapons = this.traffic = null;
    this.activity = 0;
  }
}
