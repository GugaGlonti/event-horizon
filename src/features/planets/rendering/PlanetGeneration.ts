import { SURFACE_GENERATION_REVISION } from '@/engine/planetary/surfaceNoise';
import type { PlanetJob, PlanetWorkerRequest, PlanetWorkerResponse } from './planetGenerationJobs';
import { visualMetrics } from './visualBudget';
export interface PlanetWorker {
  onmessage: ((event: MessageEvent<PlanetWorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: PlanetWorkerRequest): void;
  terminate(): void;
}
interface Pending {
  id: number;
  key: string;
  priority: number;
  job: PlanetJob;
  attempts: number;
  done: (response: PlanetWorkerResponse) => void;
  failed: () => void;
}
interface Slot {
  worker: PlanetWorker;
  id: number | null;
}
/** Scene-owned two-worker queue. Jobs are short, prioritized and cancelled with their owner. */
export class PlanetGeneration {
  private slots: Slot[] = [];
  private pending = new Map<number, Pending>();
  private queue: Pending[] = [];
  private serial = 0;
  private stopped = false;
  private factory: () => PlanetWorker;
  failures = 0;
  constructor(
    factory: () => PlanetWorker = () =>
      new Worker(new URL('./terrainWorker.ts', import.meta.url), { type: 'module' }),
  ) {
    this.factory = factory;
  }
  start() {
    this.stopped = false;
    if (this.slots.length) return;
    for (let i = 0; i < 2; i++) {
      const slot: Slot = { worker: this.factory(), id: null };
      this.bind(slot);
      this.slots.push(slot);
    }
    this.pump();
  }
  private bind(slot: Slot) {
    slot.worker.onmessage = (event: MessageEvent<PlanetWorkerResponse>) => {
      const response = event.data;
      if (this.stopped || slot.id !== response.id) return;
      slot.id = null;
      const pending = this.pending.get(response.id);
      this.pending.delete(response.id);
      if (response.revision === SURFACE_GENERATION_REVISION) pending?.done(response);
      else pending?.failed();
      this.pump();
    };
    slot.worker.onerror = () => {
      if (this.stopped) return;
      this.failures++;
      visualMetrics.workerFailures++;
      slot.worker.terminate();
      if (slot.id !== null) {
        const pending = this.pending.get(slot.id);
        if (pending && pending.attempts++ === 0 && this.failures < 4) this.queue.unshift(pending);
        else if (pending) {
          this.pending.delete(pending.id);
          pending.failed();
        }
      }
      slot.id = null;
      if (this.failures < 4) {
        slot.worker = this.factory();
        this.bind(slot);
      } else this.slots = this.slots.filter((candidate) => candidate !== slot);
      this.pump();
    };
  }
  request(
    key: string,
    priority: number,
    job: PlanetJob,
    done: Pending['done'],
    failed: () => void = () => {},
  ) {
    if (this.queue.length >= 96) {
      failed();
      return () => {};
    }
    const pending: Pending = {
      id: ++this.serial,
      key: `${SURFACE_GENERATION_REVISION}/${key}`,
      priority,
      job,
      attempts: 0,
      done,
      failed,
    };
    this.pending.set(pending.id, pending);
    this.queue.push(pending);
    this.pump();
    return () => {
      this.pending.delete(pending.id);
      this.queue = this.queue.filter((item) => item.id !== pending.id);
    };
  }
  private pump() {
    if (this.stopped) return;
    this.queue.sort((a, b) => a.priority - b.priority || a.id - b.id);
    for (const slot of this.slots) {
      if (slot.id !== null) continue;
      const next = this.queue.shift();
      if (!next) return;
      slot.id = next.id;
      slot.worker.postMessage({
        id: next.id,
        revision: SURFACE_GENERATION_REVISION,
        job: next.job,
      });
    }
  }
  dispose() {
    this.stopped = true;
    for (const slot of this.slots) slot.worker.terminate();
    this.slots = [];
    this.pending.clear();
    this.queue = [];
  }
}
