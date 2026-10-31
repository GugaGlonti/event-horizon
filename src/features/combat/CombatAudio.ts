import { FlightAudioMix } from '@/engine/audio/FlightAudioMix';
import type { AudioShip, CombatAudioFrame } from '@/features/combat/audio/combatAudioTypes';
import { SpatialAudioProjection } from '@/features/combat/audio/SpatialAudioProjection';
import {
  renderTrafficTexture,
  renderWeaponTimbre,
  WEAPON_TIMBRES,
  type WeaponTimbre,
} from '@/features/combat/audio/weaponTimbres';

interface Voice {
  source: AudioBufferSourceNode;
  gain: GainNode;
  panner: PannerNode;
  filter: BiquadFilterNode;
  priority: number;
  releasing: boolean;
}
const levels: Record<WeaponTimbre, number> = {
  shot: 0.3,
  'missile-launch': 0.42,
  'railgun-shot': 0.55,
  'flak-shot': 0.4,
  shield: 0.3,
  impact: 0.35,
  explosion: 0.55,
};
function timbre(kind: string): WeaponTimbre | null {
  if (kind === 'detonation') return 'explosion';
  return WEAPON_TIMBRES.find((value) => value === kind) ?? null;
}
function hashId(id: string) {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index++)
    hash = Math.imul(hash ^ id.charCodeAt(index), 16777619);
  return hash >>> 0;
}

/** Bounded spatial weapons/traffic; composition supplies one shared normal-flight mix. */
export class CombatAudio {
  private mix: FlightAudioMix;
  private ownsMix: boolean;
  private readonly projection = new SpatialAudioProjection();
  private readonly buffers = new Map<WeaponTimbre, AudioBuffer>();
  private fallback: AudioBuffer | null = null;
  private readonly voices = new Map<AudioBufferSourceNode, Voice>();
  private readonly enemies = new Map<string, Voice>();
  private readonly candidates: AudioShip[] = [];
  private frame: CombatAudioFrame | null = null;
  private cursor = 0;
  activity = 0;

  constructor(mix?: FlightAudioMix) {
    this.mix = mix ?? new FlightAudioMix();
    this.ownsMix = !mix;
  }
  connect(mix: FlightAudioMix) {
    this.dispose();
    this.mix = mix;
    this.ownsMix = false;
  }
  unlock() {
    this.mix.unlock();
    const context = this.mix.context;
    if (!context || this.buffers.size) return;
    try {
      for (const kind of WEAPON_TIMBRES)
        this.buffers.set(kind, this.buffer(renderWeaponTimbre(kind, context.sampleRate)));
      this.fallback = this.buffer(renderTrafficTexture(context.sampleRate));
    } catch {
      this.stop();
    }
  }
  private buffer(samples: Float32Array) {
    if (!this.mix.context) throw new Error('No audio context.');
    const buffer = this.mix.context.createBuffer(1, samples.length, this.mix.context.sampleRate);
    buffer.getChannelData(0).set(samples);
    return buffer;
  }
  private disconnect(voice: Voice) {
    voice.source.onended = null;
    voice.source.disconnect();
    voice.gain.disconnect();
    voice.panner.disconnect();
    voice.filter.disconnect();
    this.voices.delete(voice.source);
    for (const [id, enemy] of this.enemies) if (enemy === voice) this.enemies.delete(id);
  }
  private release(voice: Voice, immediate = false) {
    if (voice.releasing && !immediate) return;
    voice.releasing = true;
    const time = this.mix.context?.currentTime ?? 0;
    try {
      voice.gain.gain.cancelScheduledValues(time);
      voice.gain.gain.setTargetAtTime(0, time, 0.018);
      voice.source.stop(immediate ? time : time + 0.08);
    } catch {
      this.disconnect(voice);
      return;
    }
    if (immediate) this.disconnect(voice);
  }
  private createVoice(buffer: AudioBuffer, traffic: boolean, priority: number) {
    const context = this.mix.context,
      output = traffic ? this.mix.traffic : this.mix.weapons;
    if (!context || !output) return null;
    if (this.voices.size >= 24) {
      const oldest = this.voices.values().next().value;
      if (oldest) this.release(oldest, true);
    }
    const source = context.createBufferSource(),
      gain = context.createGain();
    const panner = context.createPanner(),
      filter = context.createBiquadFilter();
    source.buffer = buffer;
    source.loop = traffic;
    gain.gain.value = 0;
    panner.panningModel = 'HRTF';
    panner.rolloffFactor = 0;
    filter.type = 'lowpass';
    filter.Q.value = 0.5;
    source.connect(filter).connect(gain).connect(panner).connect(output);
    const voice = { source, gain, panner, filter, priority, releasing: false };
    this.voices.set(source, voice);
    source.onended = () => this.disconnect(voice);
    return voice;
  }
  private position(voice: Voice, cabin: boolean) {
    const time = this.mix.context?.currentTime ?? 0;
    voice.panner.positionX.setTargetAtTime(this.projection.position.x, time, 0.045);
    voice.panner.positionY.setTargetAtTime(this.projection.position.y, time, 0.045);
    voice.panner.positionZ.setTargetAtTime(this.projection.position.z, time, 0.045);
    voice.filter.frequency.setTargetAtTime(this.projection.cutoff * (cabin ? 0.74 : 1), time, 0.08);
  }
  private updateEnemies(frame: CombatAudioFrame, cabin: boolean, engine: AudioBuffer | null) {
    this.candidates.length = 0;
    for (const ship of frame.ships.values()) {
      if (
        ship === frame.player ||
        ship.stationary ||
        ship.health.destroyed ||
        ship.team !== 'hostile'
      )
        continue;
      const distance = ship.position.distanceToSquared(frame.player.position);
      if (distance >= 1100 ** 2) continue;
      const score = distance * (this.enemies.has(ship.id) ? 0.85 : 1);
      let index = 0;
      while (index < this.candidates.length) {
        const other = this.candidates[index];
        if (
          !other ||
          score <
            other.position.distanceToSquared(frame.player.position) *
              (this.enemies.has(other.id) ? 0.85 : 1)
        )
          break;
        index++;
      }
      if (index < 3) {
        this.candidates.splice(index, 0, ship);
        this.candidates.length = Math.min(3, this.candidates.length);
      }
    }
    for (const [id, voice] of this.enemies) {
      if (!this.candidates.some((ship) => ship.id === id)) {
        this.release(voice);
        this.enemies.delete(id);
      }
    }
    for (const ship of this.candidates) {
      let voice = this.enemies.get(ship.id);
      if (voice && engine && voice.source.buffer !== engine) {
        this.release(voice);
        this.enemies.delete(ship.id);
        voice = undefined;
      }
      if (!voice) {
        const buffer = engine ?? this.fallback;
        if (!buffer) continue;
        const created = this.createVoice(buffer, true, 0);
        if (!created) continue;
        voice = created;
        this.enemies.set(ship.id, voice);
        voice.source.start(0, ((hashId(ship.id) % 100) / 100) * buffer.duration);
      }
      this.projection.project(
        ship.position,
        ship.velocity,
        frame.player.position,
        frame.player.velocity,
        frame.player.orientation,
        1100,
      );
      this.position(voice, cabin);
      const time = this.mix.context?.currentTime ?? 0;
      const load =
        0.08 + ship.controller.enginePower * 0.17 + (ship.controller.isBoosting ? 0.04 : 0);
      voice.gain.gain.setTargetAtTime(this.projection.level * load, time, 0.09);
      voice.source.playbackRate.setTargetAtTime(
        (0.72 + ship.controller.enginePower * 0.22 + (hashId(ship.id) % 7) * 0.007) *
          this.projection.pitch,
        time,
        0.1,
      );
    }
  }
  update(
    frame: CombatAudioFrame,
    enabled: boolean,
    delta = 1 / 60,
    cabin = false,
    engine: AudioBuffer | null = null,
  ) {
    this.frame = frame;
    this.activity = Math.max(0, this.activity - Math.max(0, Math.min(delta, 0.1)) * 3);
    try {
      const context = this.mix.context;
      const audible = enabled && context?.state === 'running';
      for (const effect of frame.effects) {
        if (effect.id <= this.cursor) continue;
        this.cursor = effect.id;
        if (!audible || effect.age > 0.16) continue;
        const kind = timbre(effect.kind),
          buffer = kind ? this.buffers.get(kind) : null;
        if (!kind || !buffer) continue;
        this.projection.project(
          effect.position,
          frame.player.velocity,
          frame.player.position,
          frame.player.velocity,
          frame.player.orientation,
          kind === 'explosion' ? 2200 : 1600,
        );
        if (this.projection.level < 0.008) continue;
        const ownHit = effect.team === 'player' && (kind === 'shield' || kind === 'impact');
        const ownWeapon =
          effect.team === 'player' &&
          ['shot', 'missile-launch', 'railgun-shot', 'flak-shot'].includes(kind);
        const priority = ownHit || kind === 'explosion' ? 3 : ownWeapon ? 2 : 1;
        let effectCount = 0,
          weakest: Voice | null = null;
        for (const voice of this.voices.values()) {
          if (voice.priority === 0) continue;
          effectCount++;
          if (!weakest || voice.priority < weakest.priority) weakest = voice;
        }
        if (effectCount >= 10) {
          if (!weakest || weakest.priority > priority) continue;
          this.release(weakest, true);
        }
        const voice = this.createVoice(buffer, false, priority);
        if (!voice || !context) continue;
        this.position(voice, cabin);
        voice.gain.gain.value =
          levels[kind] * this.projection.level * (ownWeapon || ownHit ? 1 : 0.72);
        voice.source.playbackRate.value = 0.98 + (effect.id % 5) * 0.01;
        voice.source.start();
        this.activity = Math.max(
          this.activity,
          ownHit ? 1 : ownWeapon ? 0.8 : this.projection.level * 0.5,
        );
      }
      if (audible) this.updateEnemies(frame, cabin, engine);
      else this.stop();
    } catch {
      this.stop();
    }
  }
  stop() {
    if (this.frame)
      for (const effect of this.frame.effects) this.cursor = Math.max(this.cursor, effect.id);
    for (const voice of this.voices.values()) this.release(voice);
    this.enemies.clear();
    this.candidates.length = 0;
    this.activity = 0;
  }
  dispose() {
    this.stop();
    for (const voice of this.voices.values()) this.release(voice, true);
    this.buffers.clear();
    this.fallback = null;
    this.frame = null;
    if (this.ownsMix) this.mix.dispose();
  }
}
