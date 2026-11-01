import { createFlightInput } from '@/engine/simulation/flightTypes';
import { inputSchema, type NetworkInput } from './protocol';

export function neutralInput(seq = 0): NetworkInput {
  return {
    seq,
    flight: createFlightInput(),
    fire: false,
    weapon: 1,
    targetId: null,
    paused: true,
    assistance: true,
  };
}
/** One command per fixed tick; packet arrival never advances physics. */
export class InputQueue {
  ack = 0;
  rejected = 0;
  private newest = 0;
  private queue: NetworkInput[] = [];
  private current = neutralInput();
  private idle = 0;
  private tokens = 30;
  accept(value: unknown) {
    if (this.tokens < 1) {
      this.rejected++;
      return false;
    }
    this.tokens--;
    const parsed = inputSchema.safeParse(value);
    if (
      !parsed.success ||
      parsed.data.seq <= this.newest ||
      parsed.data.seq > this.newest + 300 ||
      this.queue.length >= 8
    ) {
      this.rejected++;
      return false;
    }
    this.newest = parsed.data.seq;
    this.queue.push(parsed.data);
    return true;
  }
  step(dt: number) {
    this.tokens = Math.min(30, this.tokens + dt * 90);
    const next = this.queue.shift();
    if (next) {
      this.current = next;
      this.ack = next.seq;
      this.idle = 0;
    } else this.idle += dt;
    if (this.idle > 0.25 || this.current.paused) return neutralInput(this.ack);
    return this.current;
  }
  clear() {
    this.queue.length = 0;
    this.current = neutralInput(this.ack);
    this.newest = this.ack;
    this.idle = 1;
  }
}
