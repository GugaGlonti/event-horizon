import { Vector3 } from '@/engine/math/linear';
import type { FlightController } from '@/engine/simulation/FlightController';
import type { FlightState, NetworkInput } from './protocol';

export function predict(controller: FlightController, input: NetworkInput, tickRate: number) {
  if (input.paused) controller.landingAssist = null;
  controller.setAssistance(input.assistance);
  const substeps = Math.max(1, Math.round(120 / tickRate));
  for (let i = 0; i < substeps; i++) controller.step(input.flight, 1 / tickRate / substeps);
}
export class Prediction {
  private history: NetworkInput[] = [];
  corrections = 0;
  readonly visualOffset = new Vector3();
  readonly controller: FlightController;
  tickRate: number;
  constructor(controller: FlightController, tickRate = 30) {
    this.controller = controller;
    this.tickRate = tickRate;
  }
  apply(input: NetworkInput) {
    this.history.push(input);
    if (this.history.length > 120) this.history.shift();
    predict(this.controller, input, this.tickRate);
  }
  reconcile(state: FlightState, ack: number) {
    const before = this.controller.snapshot();
    this.history = this.history.filter((input) => input.seq > ack);
    this.controller.restore(state);
    for (const input of this.history) predict(this.controller, input, this.tickRate);
    const after = this.controller.snapshot();
    const error = new Vector3()
      .fromArray(before.position)
      .sub(new Vector3().fromArray(after.position));
    if (error.lengthSq() > 0.01) this.corrections++;
    if (error.lengthSq() < 250 ** 2) this.visualOffset.add(error).clampLength(0, 50);
    else this.visualOffset.set(0, 0, 0);
  }
  reset() {
    this.history.length = 0;
    this.visualOffset.set(0, 0, 0);
  }
  get pending() {
    return this.history.length;
  }
}
