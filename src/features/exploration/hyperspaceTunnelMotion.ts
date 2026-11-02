export interface TunnelMotionSample {
  flowTime: number;
  spinCos: number;
  spinSin: number;
}

/** Negative texture travel brings fixed cloud features toward the camera; spin stays in the walls. */
export function sampleTunnelMotion(time: number, reduced: boolean, out: TunnelMotionSample) {
  const t = reduced ? 0 : time;
  const angle = t * 0.2;
  out.flowTime = -t;
  out.spinCos = Math.cos(angle);
  out.spinSin = Math.sin(angle);
}
