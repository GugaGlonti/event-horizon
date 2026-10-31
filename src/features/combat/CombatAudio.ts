import type { CombatSimulation } from '@/engine/combat/CombatSimulation';

/** Optional, gesture-started synthesized combat cues, bounded voices, explicit teardown. */
export class CombatAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly voices = new Map<OscillatorNode, GainNode>();
  private cursor = 0;

  unlock() {
    if (typeof AudioContext === 'undefined') return;
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.master = this.context.createGain();
        this.master.gain.value = 0.07;
        this.master.connect(this.context.destination);
      }
      void this.context.resume().catch(() => {});
    } catch {
      /* Audio never gates play. */
    }
  }

  update(simulation: CombatSimulation, enabled: boolean) {
    for (const effect of simulation.effects) {
      if (effect.id <= this.cursor) continue;
      this.cursor = effect.id;
      if (
        !enabled ||
        (['shot', 'railgun-shot', 'flak-shot', 'missile-launch'].includes(effect.kind) &&
          effect.team !== 'player')
      )
        continue;
      const context = this.context,
        master = this.master;
      if (!context || !master || context.state !== 'running' || this.voices.size >= 12) continue;
      const voice = context.createOscillator();
      const gain = context.createGain();
      const duration =
        effect.kind === 'explosion' || effect.kind === 'detonation'
          ? 0.65
          : effect.kind === 'shot'
            ? 0.09
            : effect.kind === 'railgun-shot'
              ? 0.32
              : effect.kind === 'flak-shot'
                ? 0.18
                : effect.kind === 'missile-launch'
                  ? 0.28
                  : 0.14;
      voice.type =
        effect.kind === 'railgun-shot'
          ? 'sine'
          : effect.kind === 'shot' || effect.kind === 'flak-shot'
            ? 'sawtooth'
            : 'triangle';
      voice.frequency.setValueAtTime(
        effect.kind === 'railgun-shot'
          ? 2200
          : effect.kind === 'flak-shot'
            ? 180
            : effect.kind === 'shot'
              ? 800
              : effect.kind === 'missile-launch'
                ? 240
                : 130,
        context.currentTime,
      );
      voice.frequency.exponentialRampToValueAtTime(35, context.currentTime + duration);
      gain.gain.setValueAtTime(effect.kind === 'shot' ? 0.18 : 0.5, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
      voice.connect(gain);
      gain.connect(master);
      this.voices.set(voice, gain);
      voice.onended = () => {
        voice.disconnect();
        gain.disconnect();
        this.voices.delete(voice);
      };
      voice.start();
      voice.stop(context.currentTime + duration);
    }
    if (!enabled) this.stop();
  }

  stop() {
    for (const [voice, gain] of this.voices) {
      voice.onended = null;
      voice.stop();
      voice.disconnect();
      gain.disconnect();
    }
    this.voices.clear();
  }

  dispose() {
    this.stop();
    this.master?.disconnect();
    void this.context?.close().catch(() => {});
    this.context = null;
    this.master = null;
  }
}
