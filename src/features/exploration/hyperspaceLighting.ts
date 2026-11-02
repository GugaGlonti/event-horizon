export interface TunnelLightSample {
  x: number;
  y: number;
  z: number;
  pulse: number;
  fill: number;
}

/** Smooth light pools shared by the cloud shader and the foreground lamps. Reuse the output. */
export function sampleTunnelLights(time: number, reduced: boolean, out: TunnelLightSample) {
  const t = reduced ? 0 : time;
  const angle = t * 0.72 + Math.sin(t * 0.31) * 0.65;
  out.x = Math.cos(angle) * 8;
  out.y = 2.4 + Math.sin(angle) * 5.2;
  out.z = 5 + Math.sin(t * 0.51) * 2;
  out.pulse = reduced
    ? 0.45
    : 0.2 + (0.5 + Math.sin(t * 2.3 + Math.sin(t * 0.67)) * 0.5) ** 3 * 0.8;
  out.fill = reduced ? 0.35 : 0.2 + (0.5 + Math.sin(t * 1.7 + 2.4) * 0.5) ** 4 * 0.8;
}
