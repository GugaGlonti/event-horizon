// Offline authoring only. Input: the three CC0 previews decoded to PCM16 WAV (see CREDITS.md).
// Usage: node scripts/build-hyperdrive-audio.mjs /path/to/decoded-sources [output-directory] [preview-directory]
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const sourceDirectory = process.argv[2];
if (!sourceDirectory)
  throw new Error('Pass a directory containing machine.wav, motor.wav and switch.wav.');
const outputDirectory =
  process.argv[3] ?? new URL('../src/features/exploration/audio/assets/', import.meta.url).pathname;
const rate = 32000;
const tau = Math.PI * 2;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const ramp = (start, end, time) => {
  const t = clamp((time - start) / (end - start), 0, 1);
  return t * t * (3 - 2 * t);
};

async function readWave(name) {
  const bytes = await readFile(resolve(sourceDirectory, `${name}.wav`));
  let offset = 12,
    channels = 0,
    sampleRate = 0,
    data;
  while (offset + 8 <= bytes.length) {
    const size = bytes.readUInt32LE(offset + 4),
      chunk = bytes.toString('ascii', offset, offset + 4);
    if (chunk === 'fmt ') {
      if (bytes.readUInt16LE(offset + 8) !== 1 || bytes.readUInt16LE(offset + 22) !== 16)
        throw new Error('Authoring inputs must be PCM16 WAV.');
      channels = bytes.readUInt16LE(offset + 10);
      sampleRate = bytes.readUInt32LE(offset + 12);
    }
    if (chunk === 'data') data = bytes.subarray(offset + 8, offset + 8 + size);
    offset += 8 + size + (size % 2);
  }
  if (!data || !channels || !sampleRate) throw new Error(`Invalid WAV: ${name}`);
  const frames = data.length / (2 * channels);
  return (seconds, channel = 0) => {
    const frame = (((seconds * sampleRate) % frames) + frames) % frames;
    const index = Math.floor(frame),
      next = (index + 1) % frames,
      c = channel % channels;
    const a = data.readInt16LE((index * channels + c) * 2) / 32768;
    const b = data.readInt16LE((next * channels + c) * 2) / 32768;
    return a + (b - a) * (frame - index);
  };
}

const [machine, motor, relay] = await Promise.all(['machine', 'motor', 'switch'].map(readWave));
// Locate the strongest recorded relay transient rather than assuming leading silence length.
let relayPeak = 0,
  relayTime = 0;
for (let t = 0.04; t < 5.2; t += 1 / rate) {
  const amplitude = Math.abs(relay(t));
  if (amplitude > relayPeak) {
    relayPeak = amplitude;
    relayTime = t;
  }
}

function filter(samples, cutoff, highpass, looping) {
  const coefficient = 1 - Math.exp((-tau * cutoff) / rate);
  let state = 0;
  const result = new Float64Array(samples.length);
  for (let pass = 0; pass < (looping ? 5 : 1); pass++) {
    for (let i = 0; i < samples.length; i++) {
      state += coefficient * (samples[i] - state);
      result[i] = highpass ? samples[i] - state : state;
    }
  }
  return result;
}

function makeStem(seconds, source, { loop = false, cutoff = 4200, rms = 0.17 } = {}) {
  const count = Math.round(seconds * rate);
  const channels = [new Float64Array(count), new Float64Array(count)];
  for (let c = 0; c < 2; c++) {
    for (let i = 0; i < count; i++) {
      const time = i / rate;
      const blend = loop ? ramp(seconds - 0.12, seconds, time) : 0;
      const value = source(time, c) * (1 - blend) + source(time - seconds, c) * blend;
      const envelope = loop ? 1 : ramp(0, 0.006, time) * (1 - ramp(seconds - 0.16, seconds, time));
      channels[c][i] = Math.tanh(value * 1.4) * envelope;
    }
    channels[c] = filter(filter(channels[c], 26, true, loop), cutoff, false, loop);
  }
  let sum = 0,
    peak = 0;
  for (const channel of channels)
    for (const sample of channel) {
      sum += sample * sample;
      peak = Math.max(peak, Math.abs(sample));
    }
  const gain = Math.min(rms / Math.sqrt(sum / (count * 2)), 0.82 / peak);
  for (const channel of channels) for (let i = 0; i < count; i++) channel[i] *= gain;
  return { channels, count, seconds, loop };
}

const stems = {
  spool: makeStem(
    2.4,
    (t, c) => motor(1.2 + t * 0.82 + c * 0.014) * 0.8 + machine(8 + t * 0.55 + c * 0.023, c) * 0.28,
    { loop: true, cutoff: 3100 },
  ),
  transit: makeStem(
    3.6,
    (t, c) =>
      machine(4 + t * 0.48 + c * 0.019, c) * 0.9 +
      machine(11 + t * 0.497 - c * 0.012, 1 - c) * 0.5 +
      motor(1.2 + t * 0.32 + c * 0.031) * 0.28,
    { loop: true, cutoff: 2200 },
  ),
  entry: makeStem(
    1.5,
    (t, c) => {
      const body = machine(6 + 2.3 * t - 0.6 * t * t + c * 0.012, c);
      const winding = motor(4.8 - t * 1.35 + c * 0.008);
      const latch = relay(relayTime - 0.012 + t * 0.65) * Math.exp(-t * 32);
      const thump = Math.sin(tau * (83 * t - 25 * t * t)) * Math.exp(-t * 9);
      const rush = ramp(0, 0.035, t) * Math.exp(-t * 2.7);
      return body * rush * 1.4 + winding * rush * 0.7 + latch * 0.85 + thump * 0.22;
    },
    { cutoff: 5400, rms: 0.19 },
  ),
  exit: makeStem(
    1.05,
    (t, c) => {
      const pressure = motor(4.4 + 0.4 * t + 3 * t * t + c * 0.009);
      const brakes = motor(4.9 + t * 0.55 + c * 0.015) * Math.exp(-t * 5);
      const latch = relay(relayTime - 0.016 + t * 0.72) * Math.exp(-t * 35);
      const thump = Math.sin(tau * (65 * t - 15 * t * t)) * Math.exp(-t * 12);
      return pressure * Math.exp(-t * 9) * 0.8 + brakes * 0.7 + latch * 0.9 + thump * 0.2;
    },
    { cutoff: 4300, rms: 0.17 },
  ),
};

function encode(stem) {
  const bytes = Buffer.alloc(44 + stem.count * 4);
  bytes.write('RIFF', 0);
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(2, 22);
  bytes.writeUInt32LE(rate, 24);
  bytes.writeUInt32LE(rate * 4, 28);
  bytes.writeUInt16LE(4, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36);
  bytes.writeUInt32LE(stem.count * 4, 40);
  for (let i = 0; i < stem.count; i++)
    for (let c = 0; c < 2; c++)
      bytes.writeInt16LE(
        Math.round(clamp(stem.channels[c][i], -1, 1) * 32767),
        44 + (i * 2 + c) * 2,
      );
  return bytes;
}

await mkdir(outputDirectory, { recursive: true });
const manifest = {};
for (const [name, stem] of Object.entries(stems)) {
  const bytes = encode(stem);
  await writeFile(resolve(outputDirectory, `${name}.wav`), bytes);
  let peak = 0,
    energy = 0,
    dc = 0,
    seam = 0;
  for (const channel of stem.channels) {
    seam = Math.max(seam, Math.abs(channel[0] - channel.at(-1)));
    for (const sample of channel) {
      peak = Math.max(peak, Math.abs(sample));
      energy += sample * sample;
      dc += sample;
    }
  }
  manifest[name] = {
    seconds: stem.seconds,
    loop: stem.loop,
    bytes: bytes.length,
    peak,
    rms: Math.sqrt(energy / (stem.count * 2)),
    dc: dc / (stem.count * 2),
    seam,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}
await writeFile(
  resolve(outputDirectory, 'manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
console.log(JSON.stringify(manifest, null, 2));

// Offline listening comparisons, outside the shipped assets. These approximate the stem mix;
// the game additionally smooths parameters and applies its live Web Audio compressor.
const previewDirectory = process.argv[4];
if (previewDirectory) {
  await mkdir(previewDirectory, { recursive: true });
  function sample(stem, time, channel) {
    if (time < 0 || (!stem.loop && time >= stem.seconds)) return 0;
    const frame = (time * rate) % stem.count;
    const index = Math.floor(frame),
      next = (index + 1) % stem.count;
    return (
      stem.channels[channel][index] * (1 - frame + index) +
      stem.channels[channel][next] * (frame - index)
    );
  }
  for (const [name, body, impact, pitch] of [
    ['balanced', 1, 1, 1],
    ['heavy', 1.25, 1.1, 0.84],
    ['restrained', 0.7, 0.85, 1.08],
  ]) {
    const seconds = 10.25,
      count = Math.round(seconds * rate);
    const channels = [new Float64Array(count), new Float64Array(count)];
    let spoolPosition = 0,
      transitPosition = 0;
    for (let i = 0; i < count; i++) {
      const t = i / rate,
        charge = clamp(t / 3.2, 0, 1);
      const ignition = ramp(3.915, 4.136, t),
        release = 1 - ramp(8.061, 8.82, t);
      const chargeGain = (0.2 + charge * 0.66) * (1 - ignition);
      const transitGain = (0.025 + charge * 0.045 + ignition * 0.68) * release;
      for (let c = 0; c < 2; c++) {
        const loops =
          sample(stems.spool, spoolPosition, c) * chargeGain +
          sample(stems.transit, transitPosition, c) * transitGain;
        const transients =
          sample(stems.entry, t - 3.915, c) + sample(stems.exit, t - 8.061, c) * 0.88;
        const fade = ramp(0, 0.04, t);
        channels[c][i] = Math.tanh((loops * body + transients * impact) * 0.75) * fade;
      }
      spoolPosition += ((0.58 + charge ** 2 * 0.83) * pitch) / rate;
      transitPosition += ((0.88 + ignition * 0.16) * pitch) / rate;
    }
    await writeFile(
      resolve(previewDirectory, `hyperdrive-${name}.wav`),
      encode({ channels, count }),
    );
  }
}
