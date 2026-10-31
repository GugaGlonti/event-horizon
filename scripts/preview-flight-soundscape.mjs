// Offline listening approximation, not a browser capture. Needs Node's built-in TS stripping.
// node --experimental-strip-types scripts/preview-flight-soundscape.mjs /path/to/preview.wav
import { readFile, writeFile } from 'node:fs/promises';
import { renderWeaponTimbre } from '../src/features/combat/audio/weaponTimbres.ts';

const output = process.argv[2];
if (!output) throw new Error('Pass an output WAV path.');
const rate = 32000,
  seconds = 17;
const stems = {};
for (const name of ['idle', 'turbine', 'boost', 'jets', 'engage', 'release']) {
  const bytes = await readFile(
    new URL(`../src/features/flight/audio/assets/${name}.wav`, import.meta.url),
  );
  stems[name] = {
    bytes,
    frames: (bytes.length - 44) / 4,
    loop: !['engage', 'release'].includes(name),
  };
}
function sample(name, time, channel) {
  const stem = stems[name];
  if (time < 0 || (!stem.loop && time * rate >= stem.frames)) return 0;
  const frame = (time * rate) % stem.frames,
    index = Math.floor(frame),
    next = (index + 1) % stem.frames;
  const a = stem.bytes.readInt16LE(44 + index * 4 + channel * 2) / 32768;
  const b = stem.bytes.readInt16LE(44 + next * 4 + channel * 2) / 32768;
  return a + (b - a) * (frame - index);
}
const events = [
  ...[5.2, 5.34, 5.48, 5.62, 7.2, 7.34, 7.48, 7.62].map((time) => [time, 'shot', 0.3]),
  [7.9, 'shield', 0.3],
  [8.4, 'missile-launch', 0.42],
  [9.2, 'railgun-shot', 0.55],
  [11.5, 'flak-shot', 0.4],
  [13.4, 'explosion', 0.4],
].map(([time, kind, level]) => ({ time, level, samples: renderWeaponTimbre(kind, rate) }));
const clamp = (value, low, high) => Math.max(low, Math.min(value, high));
const outputBytes = Buffer.alloc(44 + seconds * rate * 4);
outputBytes.write('RIFF');
outputBytes.writeUInt32LE(outputBytes.length - 8, 4);
outputBytes.write('WAVEfmt ', 8);
outputBytes.writeUInt32LE(16, 16);
outputBytes.writeUInt16LE(1, 20);
outputBytes.writeUInt16LE(2, 22);
outputBytes.writeUInt32LE(rate, 24);
outputBytes.writeUInt32LE(rate * 4, 28);
outputBytes.writeUInt16LE(4, 32);
outputBytes.writeUInt16LE(16, 34);
outputBytes.write('data', 36);
outputBytes.writeUInt32LE(outputBytes.length - 44, 40);
let power = 0,
  boost = 0,
  jets = 0,
  activity = 0,
  left = 0,
  right = 0.17,
  boostPosition = 0,
  peak = 0;
for (let index = 0; index < seconds * rate; index++) {
  const t = index / rate,
    demand = t >= 3 && t < 10 ? clamp((t - 3) * 0.35, 0, 1) : 0;
  const boosting = t >= 7 && t < 10;
  power += (demand - power) * (1 - Math.exp(-1 / rate / (demand > power ? 0.22 : 0.48)));
  boost += ((boosting ? 1 : 0) - boost) * (1 - Math.exp(-1 / rate / (boosting ? 0.12 : 0.35)));
  jets += ((t >= 12 && t < 14 ? 1 : 0) - jets) * (1 - Math.exp(-1 / rate / 0.1));
  let weapon = 0,
    targetActivity = 0;
  for (const event of events) {
    const age = t - event.time;
    if (age < 0) continue;
    weapon += (event.samples[Math.floor(age * rate)] ?? 0) * event.level;
    targetActivity = Math.max(targetActivity, Math.max(0, 0.8 - age * 3));
  }
  activity +=
    (targetActivity - activity) *
    (1 - Math.exp(-1 / rate / (targetActivity > activity ? 0.018 : 0.24)));
  const flybyX = (t - 8.3) * 160,
    distance = Math.hypot(flybyX, 65);
  const trafficLevel = t > 5.5 && t < 11 ? 0.22 / (1 + (distance / 90) ** 2) ** 0.6 : 0;
  const pan = clamp(flybyX / 250, -1, 1);
  for (let channel = 0; channel < 2; channel++) {
    const engine =
      sample('idle', t * 0.93, channel) * (0.07 + power * 0.018) +
      (sample('turbine', left, channel) + sample('turbine', right, channel)) * power * 0.21 +
      sample('boost', boostPosition, channel) * boost * 0.4 +
      sample('jets', t * 1.07, channel) * jets * 0.27 * (0.96 + Math.sin(t * 31) ** 2 * 0.04) +
      sample('engage', t - 7, channel) * 0.18 +
      sample('release', t - 10, channel) * 0.22;
    const traffic =
      sample('turbine', t * 0.94 + 0.37, channel) *
      trafficLevel *
      Math.sqrt((1 + (channel ? pan : -pan)) / 2);
    const mixed =
      (engine * 0.4 * (0.8 - activity * 0.38) + weapon * 0.75 + traffic * (0.65 - activity * 0.4)) *
      0.82;
    const fade = Math.min(1, t / 0.06, (seconds - t) / 0.2);
    const value = Math.tanh(mixed) * fade;
    peak = Math.max(peak, Math.abs(value));
    outputBytes.writeInt16LE(
      Math.round(clamp(value, -1, 1) * 32767),
      44 + (index * 2 + channel) * 2,
    );
  }
  left += (0.83 + power * 0.36 + boost * 0.07) / rate;
  right += (0.847 + power * 0.351 + boost * 0.074) / rate;
  boostPosition += (0.88 + power * 0.14) / rate;
}
await writeFile(output, outputBytes);
console.log(JSON.stringify({ output, seconds, peak }));
