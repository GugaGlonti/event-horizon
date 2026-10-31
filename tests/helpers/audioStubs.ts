import { vi } from 'vitest';

export class Parameter {
  value = 0;
  setTargetAtTime = vi.fn();
  cancelScheduledValues = vi.fn();
}
export class NodeStub {
  gain = new Parameter();
  frequency = new Parameter();
  playbackRate = new Parameter();
  pan = new Parameter();
  positionX = new Parameter();
  positionY = new Parameter();
  positionZ = new Parameter();
  Q = new Parameter();
  threshold = new Parameter();
  knee = new Parameter();
  ratio = new Parameter();
  attack = new Parameter();
  release = new Parameter();
  buffer: { id?: number; duration: number } | null = null;
  loop = false;
  onended: (() => void) | null = null;
  connect = vi.fn((node: NodeStub) => node);
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}
export class ContextStub {
  static instances: ContextStub[] = [];
  currentTime = 0;
  sampleRate = 8000;
  state = 'running';
  destination = new NodeStub();
  sources: NodeStub[] = [];
  filters: NodeStub[] = [];
  panners: NodeStub[] = [];
  gains: NodeStub[] = [];
  resume = vi.fn(async () => {});
  close = vi.fn(async () => {});
  decodeAudioData = vi.fn(async (bytes: ArrayBuffer) => ({ id: bytes.byteLength, duration: 3 }));
  constructor() {
    ContextStub.instances.push(this);
  }
  createGain() {
    const node = new NodeStub();
    this.gains.push(node);
    return node;
  }
  createBiquadFilter() {
    const node = new NodeStub();
    this.filters.push(node);
    return node;
  }
  createDynamicsCompressor() {
    return new NodeStub();
  }
  createPanner() {
    const node = new NodeStub();
    this.panners.push(node);
    return node;
  }
  createBuffer(channels: number, length: number, rate: number) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { duration: length / rate, getChannelData: (index: number) => data[index] };
  }
  createStereoPanner() {
    return new NodeStub();
  }
  createBufferSource() {
    const node = new NodeStub();
    this.sources.push(node);
    return node;
  }
  createOscillator() {
    return this.createBufferSource();
  }
  finishStopped() {
    for (const node of this.sources) if (node.stop.mock.calls.length) node.onended?.();
  }
}
