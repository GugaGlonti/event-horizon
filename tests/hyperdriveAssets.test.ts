/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('bundled spacecraft recordings', () => {
  it.each([
    ...['spool', 'transit', 'entry', 'exit'].map(
      (name) => ['exploration', name, name === 'spool' || name === 'transit'] as const,
    ),
    ...['idle', 'turbine', 'boost', 'jets', 'engage', 'release'].map(
      (name) => ['flight', name, !['engage', 'release'].includes(name)] as const,
    ),
  ])('%s/%s decodes as bounded, non-silent stereo PCM', (feature, name, looping) => {
    const bytes = readFileSync(
      new URL(`../src/features/${feature}/audio/assets/${name}.wav`, import.meta.url),
    );
    expect(bytes.toString('ascii', 0, 4)).toBe('RIFF');
    expect(bytes.toString('ascii', 8, 16)).toBe('WAVEfmt ');
    expect(bytes.readUInt16LE(20)).toBe(1);
    expect(bytes.readUInt16LE(22)).toBe(2);
    expect(bytes.readUInt32LE(24)).toBe(32000);
    expect(bytes.readUInt16LE(34)).toBe(16);
    expect(bytes.readUInt32LE(40)).toBe(bytes.length - 44);
    const frames = (bytes.length - 44) / 4;
    let peak = 0,
      energy = 0,
      dc = 0,
      stereoDifference = 0,
      maximumStep = 0;
    for (let i = 0; i < frames; i++) {
      const left = bytes.readInt16LE(44 + i * 4) / 32768;
      const right = bytes.readInt16LE(46 + i * 4) / 32768;
      peak = Math.max(peak, Math.abs(left), Math.abs(right));
      energy += left * left + right * right;
      dc += left + right;
      stereoDifference += Math.abs(left - right);
      if (i > 0)
        maximumStep = Math.max(maximumStep, Math.abs(left - bytes.readInt16LE(40 + i * 4) / 32768));
    }
    expect(peak).toBeLessThan(0.83);
    expect(Math.sqrt(energy / (frames * 2))).toBeGreaterThan(0.07);
    expect(Math.abs(dc / (frames * 2))).toBeLessThan(0.0001);
    expect(stereoDifference / frames).toBeGreaterThan(0.005);
    if (looping) {
      const seam = Math.abs(bytes.readInt16LE(44) - bytes.readInt16LE(bytes.length - 4)) / 32768;
      // A loop boundary must be smaller than ordinary adjacent-sample movement, not a new impulse.
      expect(seam).toBeLessThan(maximumStep * 0.5);
    } else {
      expect(Math.abs(bytes.readInt16LE(44))).toBeLessThan(2);
      expect(Math.abs(bytes.readInt16LE(bytes.length - 4))).toBeLessThan(2);
    }
  });
});
