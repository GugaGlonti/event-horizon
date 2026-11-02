export const PLANET_VISUAL_BYTES = 32 * 1024 * 1024;
export const visualMetrics = {
  bytes: 0,
  peakBytes: 0,
  sceneryCells: 0,
  sceneryInstances: 0,
  cityBlocks: 0,
  workerFailures: 0,
};
/** Incremental GPU allocation estimate, including texture mipmaps; releases are idempotent. */
export function reserveVisualBytes(bytes: number): (() => void) | null {
  if (visualMetrics.bytes + bytes > PLANET_VISUAL_BYTES) return null;
  visualMetrics.bytes += bytes;
  visualMetrics.peakBytes = Math.max(visualMetrics.bytes, visualMetrics.peakBytes);
  let released = false;
  return () => {
    if (!released) {
      released = true;
      visualMetrics.bytes -= bytes;
    }
  };
}
