/** Bounded foreground frame capture. Background/pause gaps invalidate, rather than improve, it. */
export class FrameCapture {
  private samples = new Float32Array(16384);
  private count = 0;
  private elapsed = 0;
  private invalid = false;
  active = false;
  start() {
    this.count = this.elapsed = 0;
    this.invalid = false;
    this.active = true;
  }
  push(ms: number, foreground = true) {
    if (!this.active) return;
    if (!Number.isFinite(ms) || ms <= 0) return;
    if (ms > 250 || !foreground) this.invalid = true;
    if (this.count < this.samples.length) this.samples[this.count++] = ms;
    else this.invalid = true;
    this.elapsed += ms;
    if (this.elapsed >= 60000) this.active = false;
  }
  report() {
    const sorted = this.samples.slice(0, this.count).sort();
    const percentile = (p: number) =>
      Number((sorted[Math.min(this.count - 1, Math.floor(this.count * p))] ?? 0).toFixed(2));
    return {
      seconds: Number((this.elapsed / 1000).toFixed(1)),
      frames: this.count,
      p50: percentile(0.5),
      p95: percentile(0.95),
      p99: percentile(0.99),
      valid: !this.invalid,
      complete: !this.active && this.elapsed >= 60000,
    };
  }
}
