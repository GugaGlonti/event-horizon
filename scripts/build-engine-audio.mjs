// Offline authoring only. Input: the three CC0 previews decoded to PCM16 WAV (see CREDITS.md).
// Usage: node scripts/build-engine-audio.mjs /path/to/decoded-sources [output-directory] [preview-directory]
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const sourceDirectory = process.argv[2];
if (!sourceDirectory)
  throw new Error('Pass a directory containing machine.wav, motor.wav and switch.wav.');
const outputDirectory =
  process.argv[3] ?? new URL('../src/features/flight/audio/assets/', import.meta.url).pathname;
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
  idle: makeStem(
    3,
    (t, c) =>
      machine(13 + t * 0.73 + c * 0.035, c) * 0.7 +
      motor(1.5 + t * 0.41 + c * 0.012) * 0.18 +
      Math.sin(tau * (36 + c * 0.23) * t) * 0.035,
    { loop: true, cutoff: 1050, rms: 0.12 },
  ),
  turbine: makeStem(
    2.5,
    (t, c) =>
      motor(1.1 + t * 1.17 + c * 0.024) * 0.72 +
      machine(9 + t * 0.95 + c * 0.011, c) * 0.34 +
      Math.sin(tau * (183 + c * 1.7) * t + Math.sin(tau * 19 * t) * 0.38) * 0.022,
    { loop: true, cutoff: 3600, rms: 0.16 },
  ),
  boost: makeStem(
    2.2,
    (t, c) =>
      machine(17 + t * 1.54 + c * 0.029, c) * 0.9 +
      motor(1.4 + t * 0.71 - c * 0.014) * 0.48 +
      Math.sin(tau * (56 + c * 0.6) * t) * 0.04,
    { loop: true, cutoff: 4900, rms: 0.17 },
  ),
  jets: makeStem(
    1.6,
    (t, c) =>
      machine(3 + t * 2.11 + c * 0.045, c) * 0.8 -
      machine(3.016 + t * 2.11 + c * 0.045, c) * 0.68 +
      motor(4.5 + t * 0.7 + c * 0.022) * 0.23,
    { loop: true, cutoff: 4200, rms: 0.13 },
  ),
  engage: makeStem(
    0.3,
    (t, c) =>
      relay(relayTime - 0.014 + t * 0.83 + c * 0.001) * Math.exp(-t * 25) +
      motor(1.2 + t * 2.1 + c * 0.012) * Math.exp(-t * 19) * 0.4,
    { cutoff: 4300, rms: 0.12 },
  ),
  release: makeStem(
    0.7,
    (t, c) =>
      motor(4.7 - t * 1.8 + c * 0.019) * Math.exp(-t * 5.4) * 0.7 +
      machine(6 + t * 1.6 + c * 0.014, c) * Math.exp(-t * 7) * 0.55,
    { cutoff: 3300, rms: 0.1 },
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

// Offline demonstration: idle 0–3 s, accelerate 3–7, boost 7–10, release 10–12,
// brake 12–14, idle 14–17. Same envelopes/rates as the game; live compressor and cabin filter omitted.
const previewDirectory = process.argv[4];
if (previewDirectory) {
  await mkdir(previewDirectory, { recursive: true });
  function sample(stem, time, channel) {
    if (time < 0 || (!stem.loop && time >= stem.seconds)) return 0;
    const frame = (time * rate) % stem.count,
      index = Math.floor(frame),
      next = (index + 1) % stem.count;
    return (
      stem.channels[channel][index] * (1 - frame + index) +
      stem.channels[channel][next] * (frame - index)
    );
  }
  const seconds = 17,
    count = seconds * rate;
  const channels = [new Float64Array(count), new Float64Array(count)];
  let power = 0,
    boost = 0,
    jets = 0;
  let left = 0,
    right = 0.17,
    boostPosition = 0;
  for (let i = 0; i < count; i++) {
    const t = i / rate;
    const demand = t >= 3 && t < 10 ? clamp((t - 3) * 0.35, 0, 1) : 0;
    const boosting = t >= 7 && t < 10;
    power += (demand - power) * (1 - Math.exp(-1 / rate / (demand > power ? 0.22 : 0.48)));
    boost += ((boosting ? 1 : 0) - boost) * (1 - Math.exp(-1 / rate / (boosting ? 0.12 : 0.35)));
    jets += ((t >= 12 && t < 14 ? 1 : 0) - jets) * (1 - Math.exp(-1 / rate / 0.1));
    for (let c = 0; c < 2; c++) {
      const body =
        sample(stems.idle, t * 0.93, c) * (0.12 + power * 0.025) +
        (sample(stems.turbine, left, c) + sample(stems.turbine, right, c)) * power * 0.23 +
        sample(stems.boost, boostPosition, c) * boost * 0.44 +
        sample(stems.jets, t * 1.07, c) * jets * 0.36 * (0.86 + Math.sin(t * 48) ** 2 * 0.14) +
        sample(stems.engage, t - 7, c) * 0.3 +
        sample(stems.release, t - 10, c) * 0.4;
      channels[c][i] = Math.tanh(body * 0.48) * ramp(0, 0.06, t) * (1 - ramp(16.8, 17, t));
    }
    left += (0.83 + power * 0.36 + boost * 0.07) / rate;
    right += (0.847 + power * 0.351 + boost * 0.074) / rate;
    boostPosition += (0.88 + power * 0.14) / rate;
  }
  await writeFile(
    resolve(previewDirectory, 'kestrel-engine-sequence.wav'),
    encode({ channels, count }),
  );
}
